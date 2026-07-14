from __future__ import annotations

import httpx
from urllib.parse import urlparse

from .classification import classify_topics
from .extraction import fetch_article
from .feeds import parse_feed
from .models import DocumentInput, IngestionReport
from .store import ResearchStore


class FeedIngestor:
    def __init__(
        self,
        store: ResearchStore,
        client: httpx.Client | None = None,
        *,
        full_text: bool = False,
    ) -> None:
        self.store = store
        self.client = client
        self.full_text = full_text

    def ingest_source(self, source_slug: str) -> IngestionReport:
        source = self.store.get_source(source_slug)
        if source is None:
            raise ValueError(f"Unknown source: {source_slug}")
        run_id = self.store.start_crawl_run(source_slug)
        if not source.feed_url:
            report = IngestionReport(
                source_slug=source_slug,
                status="skipped",
                error_code="no_feed",
                error_message="No verified direct feed is configured for this source.",
            )
            self.store.finish_crawl_run(
                run_id,
                status=report.status,
                error_code=report.error_code,
                error_message=report.error_message,
            )
            return report
        owns_client = self.client is None
        client = self.client or httpx.Client(
            follow_redirects=True,
            timeout=20,
            headers={"User-Agent": "EgyptResearchMCP/0.2 (+research archive)"},
        )
        try:
            response = client.get(source.feed_url)
            response.raise_for_status()
            entries = parse_feed(response.content, source_slug=source.slug)
            saved = 0
            enriched = 0
            enrichment_failures = 0
            source_host = urlparse(source.url).hostname or ""
            for entry in entries:
                content = entry.content
                existing = self.store.get_document_by_url(entry.canonical_url)
                if not self.full_text and existing and len(existing.content) > len(content):
                    content = existing.content
                if self.full_text:
                    try:
                        article = fetch_article(client, entry.canonical_url, source_host)
                        if article.content:
                            content = article.content
                            enriched += 1
                    except (httpx.HTTPError, ValueError):
                        enrichment_failures += 1
                topics = classify_topics(
                    " ".join((entry.title, entry.excerpt, content))
                )
                result = self.store.upsert_document(
                    DocumentInput(
                        external_id=entry.external_id,
                        source_slug=source.slug,
                        canonical_url=entry.canonical_url,
                        title=entry.title,
                        excerpt=entry.excerpt,
                        content=content,
                        published_at=entry.published_at,
                        document_type="article",
                        topics=topics,
                        language=source.language,
                    )
                )
                saved += int(result.created_version)
                self.store.assign_story(result.document_id)
            status = "success" if entries else "empty"
            self.store.update_source_health(source_slug, "healthy" if entries else "degraded")
            report = IngestionReport(
                source_slug=source_slug,
                status=status,
                items_found=len(entries),
                items_saved=saved,
                items_enriched=enriched,
                enrichment_failures=enrichment_failures,
            )
            self.store.finish_crawl_run(
                run_id,
                status=report.status,
                items_found=report.items_found,
                items_saved=report.items_saved,
            )
            return report
        except (httpx.HTTPError, ValueError) as error:
            self.store.update_source_health(source_slug, "failed")
            report = IngestionReport(
                source_slug=source_slug,
                status="failed",
                error_code="fetch_or_parse_failed",
                error_message=str(error),
            )
            self.store.finish_crawl_run(
                run_id,
                status=report.status,
                error_code=report.error_code,
                error_message=report.error_message,
            )
            return report
        except Exception as error:
            self.store.update_source_health(source_slug, "failed")
            self.store.finish_crawl_run(
                run_id,
                status="failed",
                error_code="unexpected_ingestion_error",
                error_message=str(error),
            )
            raise
        finally:
            if owns_client:
                client.close()
