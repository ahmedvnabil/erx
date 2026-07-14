from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

import httpx

from .classification import classify_topics
from .collectors.robots import robots_allows
from .collectors.sitemap import parse_sitemap
from .extraction import extract_article
from .models import DocumentAssetInput, DocumentInput, IngestionReport
from .pdf import PdfExtraction, extract_pdf
from .store import ResearchStore


USER_AGENT = "EgyptResearchMCP/0.3 (+research archive)"


class SitemapIngestor:
    def __init__(
        self,
        store: ResearchStore,
        client: httpx.Client | None = None,
        *,
        sleeper: Callable[[float], None] = time.sleep,
        pdf_extractor: Callable[[bytes], PdfExtraction] = extract_pdf,
    ) -> None:
        self.store = store
        self.client = client
        self.sleeper = sleeper
        self.pdf_extractor = pdf_extractor

    def ingest_source(self, source_slug: str, *, max_urls: int = 100) -> IngestionReport:
        source = self.store.get_source(source_slug)
        if source is None:
            raise ValueError(f"Unknown source: {source_slug}")
        run_id = self.store.start_crawl_run(source_slug)
        if not source.sitemap_url:
            report = IngestionReport(
                source_slug=source_slug,
                status="skipped",
                error_code="no_sitemap",
                error_message="No verified sitemap is configured for this source.",
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
            timeout=30,
            headers={"User-Agent": USER_AGENT},
        )
        try:
            source_host = urlparse(source.url).hostname or ""
            robots_text = self._fetch_robots(client, source.url)
            urls = self._discover_urls(
                client,
                source.sitemap_url,
                source_host,
                max_urls=max_urls,
            )
            if source.robots_policy == "respect":
                urls = [
                    url
                    for url in urls
                    if robots_allows(robots_text, url, "EgyptResearchMCP")
                ]

            saved = 0
            enriched = 0
            failures = 0
            for index, url in enumerate(urls):
                if index:
                    self.sleeper(source.crawl_delay_seconds)
                try:
                    created = self._archive_url(client, source_slug, source.language, url)
                    saved += int(created)
                    enriched += 1
                except (httpx.HTTPError, ValueError):
                    failures += 1

            if urls and failures == len(urls):
                status = "failed"
                health = "failed"
                error_code = "all_items_failed"
                error_message = "Every discovered URL failed validation or extraction."
            else:
                status = "success" if urls else "empty"
                health = "healthy" if urls else "degraded"
                error_code = None
                error_message = None
            self.store.update_source_health(source_slug, health)
            report = IngestionReport(
                source_slug=source_slug,
                status=status,
                items_found=len(urls),
                items_saved=saved,
                items_enriched=enriched,
                enrichment_failures=failures,
                error_code=error_code,
                error_message=error_message,
            )
            self.store.finish_crawl_run(
                run_id,
                status=report.status,
                items_found=report.items_found,
                items_saved=report.items_saved,
                error_code=report.error_code,
                error_message=report.error_message,
            )
            return report
        except (httpx.HTTPError, ValueError) as error:
            self.store.update_source_health(source_slug, "failed")
            report = IngestionReport(
                source_slug=source_slug,
                status="failed",
                error_code="sitemap_fetch_or_parse_failed",
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
                error_code="unexpected_collection_error",
                error_message=str(error),
            )
            raise
        finally:
            if owns_client:
                client.close()

    def _fetch_robots(self, client: httpx.Client, source_url: str) -> str:
        parsed = urlparse(source_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        response = client.get(robots_url)
        if response.status_code == 404:
            return ""
        response.raise_for_status()
        if len(response.content) > 1_000_000:
            raise ValueError("robots.txt exceeds size limit")
        return response.text

    def _discover_urls(
        self,
        client: httpx.Client,
        sitemap_url: str,
        source_host: str,
        *,
        max_urls: int,
    ) -> list[str]:
        pending = [sitemap_url]
        visited: set[str] = set()
        discovered: list[str] = []
        limit = max(1, min(max_urls, 5_000))
        while pending and len(visited) < 20 and len(discovered) < limit:
            current = pending.pop(0)
            if current in visited:
                continue
            visited.add(current)
            response = client.get(current)
            response.raise_for_status()
            result = parse_sitemap(
                response.content,
                allowed_host=source_host,
                max_urls=limit,
            )
            if result.kind == "index":
                pending.extend(url for url in result.urls if url not in visited)
            else:
                for url in result.urls:
                    if url not in discovered:
                        discovered.append(url)
                    if len(discovered) >= limit:
                        break
        return discovered

    def _archive_url(
        self,
        client: httpx.Client,
        source_slug: str,
        language: str,
        url: str,
    ) -> bool:
        response = client.get(url)
        response.raise_for_status()
        media_type = response.headers.get("content-type", "text/html").split(";", 1)[0]
        is_pdf = media_type == "application/pdf" or urlparse(url).path.lower().endswith(".pdf")
        if is_pdf:
            return self._archive_pdf(source_slug, language, url, media_type, response.content)
        if "html" not in media_type:
            raise ValueError("Discovered document is neither HTML nor PDF")
        if len(response.content) > 5_000_000:
            raise ValueError("Article response exceeds size limit")
        article = extract_article(response.content, str(response.url))
        if not article.title or not article.content:
            raise ValueError("Article has no extractable title or content")
        canonical_url = self._safe_canonical(article.canonical_url, url)
        result = self.store.upsert_document(
            DocumentInput(
                external_id=self._external_id(source_slug, canonical_url),
                source_slug=source_slug,
                canonical_url=canonical_url,
                title=article.title,
                excerpt=article.content[:500],
                content=article.content,
                document_type="article",
                topics=classify_topics(f"{article.title} {article.content}"),
                language=language,
            )
        )
        self.store.assign_story(result.document_id)
        return result.created_version

    def _archive_pdf(
        self,
        source_slug: str,
        language: str,
        url: str,
        media_type: str,
        content: bytes,
    ) -> bool:
        extraction = self.pdf_extractor(content)
        if not extraction.text.strip():
            raise ValueError("PDF has no extractable text")
        stem = unquote(PurePosixPath(urlparse(url).path).stem).replace("-", " ").strip()
        title = stem if len(stem) >= 2 else "وثيقة PDF"
        result = self.store.upsert_document(
            DocumentInput(
                external_id=self._external_id(source_slug, url),
                source_slug=source_slug,
                canonical_url=url,
                title=title,
                excerpt=extraction.text[:500],
                content=extraction.text,
                document_type="pdf",
                topics=classify_topics(f"{title} {extraction.text}"),
                language=language,
            )
        )
        self.store.upsert_document_asset(
            DocumentAssetInput(
                document_id=result.document_id,
                url=url,
                media_type=media_type or "application/pdf",
                sha256=hashlib.sha256(content).hexdigest(),
                byte_size=len(content),
                page_count=extraction.page_count,
                extracted_with=extraction.extractor,
                ocr_used=extraction.ocr_used,
            )
        )
        self.store.assign_story(result.document_id)
        return result.created_version

    @staticmethod
    def _external_id(source_slug: str, url: str) -> str:
        return f"{source_slug}:{hashlib.sha256(url.encode()).hexdigest()[:24]}"

    @staticmethod
    def _safe_canonical(candidate: str, fallback: str) -> str:
        candidate_host = (urlparse(candidate).hostname or "").removeprefix("www.")
        fallback_host = (urlparse(fallback).hostname or "").removeprefix("www.")
        if candidate_host == fallback_host or candidate_host.endswith(f".{fallback_host}"):
            return candidate
        return fallback
