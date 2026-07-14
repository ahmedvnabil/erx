import httpx
import pytest

from egypt_research_mcp.ingestion import FeedIngestor
from egypt_research_mcp.models import SourceInput
from egypt_research_mcp.store import ResearchStore


RSS = """<rss version="2.0"><channel><title>Test</title><item>
<title>وثيقة بحثية مصرية</title><link>https://example.org/item/1</link>
<description>ملخص موثق</description><pubDate>Tue, 14 Jul 2026 09:30:00 +0000</pubDate>
</item></channel></rss>"""


def test_ingestor_archives_feed_and_updates_source_health(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="test-source",
            name="مصدر تجريبي",
            url="https://example.org",
            feed_url="https://example.org/feed",
            source_type="academic",
            ownership_type="research_center",
        )
    )
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text=RSS))

    with httpx.Client(transport=transport) as client:
        report = FeedIngestor(store, client=client).ingest_source("test-source")

    assert report.status == "success"
    assert report.items_found == 1
    assert report.items_saved == 1
    assert store.get_source("test-source").health_status == "healthy"
    assert store.get_source("test-source").last_success_at is not None
    assert store.get_source("test-source").consecutive_failures == 0
    assert len(store.search("وثيقة مصرية")) == 1
    runs = store.list_crawl_runs("test-source")
    assert len(runs) == 1
    assert runs[0].status == "success"
    assert runs[0].items_found == 1


def test_ingestor_can_archive_full_article_text(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="full-text",
            name="مصدر النص الكامل",
            url="https://example.org",
            feed_url="https://example.org/feed",
            source_type="news",
            ownership_type="private_media",
        )
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/feed":
            return httpx.Response(200, text=RSS)
        article = "<article><h1>وثيقة بحثية مصرية</h1><p>" + ("متن موثق كامل " * 15) + "</p></article>"
        return httpx.Response(200, text=article, headers={"content-type": "text/html"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        report = FeedIngestor(store, client=client, full_text=True).ingest_source("full-text")

    result = store.search("متن موثق")[0]
    assert report.status == "success"
    assert "متن موثق كامل" in store.get_document(result.document_id).content

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        FeedIngestor(store, client=client).ingest_source("full-text")

    assert "متن موثق كامل" in store.get_document(result.document_id).content


def test_ingestor_reports_missing_feed_without_network_access(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="no-feed",
            name="مصدر بلا تغذية",
            url="https://example.org",
            source_type="official",
            ownership_type="government",
        )
    )

    report = FeedIngestor(store).ingest_source("no-feed")

    assert report.status == "skipped"
    assert report.error_code == "no_feed"


def test_ingestor_reports_fetch_failure_and_rejects_unknown_source(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="broken-feed",
            name="مصدر متعطل",
            url="https://example.org",
            feed_url="https://example.org/feed",
            source_type="news",
            ownership_type="private_media",
        )
    )
    transport = httpx.MockTransport(lambda request: httpx.Response(503))

    with httpx.Client(transport=transport) as client:
        report = FeedIngestor(store, client=client).ingest_source("broken-feed")

    assert report.status == "failed"
    assert store.get_source("broken-feed").health_status == "failed"
    assert store.get_source("broken-feed").last_error_at is not None
    assert store.get_source("broken-feed").consecutive_failures == 1
    assert store.list_crawl_runs("broken-feed")[0].status == "failed"
    try:
        FeedIngestor(store).ingest_source("missing")
    except ValueError as error:
        assert "Unknown source" in str(error)
    else:
        raise AssertionError("Unknown source must fail explicitly")


def test_ingestor_records_unexpected_failures_before_reraising(tmp_path, monkeypatch) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="unexpected",
            name="مصدر خطأ غير متوقع",
            url="https://example.org",
            feed_url="https://example.org/feed",
            source_type="news",
            ownership_type="private_media",
        )
    )
    monkeypatch.setattr(
        store,
        "upsert_document",
        lambda document: (_ for _ in ()).throw(RuntimeError("database unavailable")),
    )

    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=RSS))) as client:
        with pytest.raises(RuntimeError, match="database unavailable"):
            FeedIngestor(store, client=client).ingest_source("unexpected")

    run = store.list_crawl_runs("unexpected")[0]
    assert run.status == "failed"
    assert run.error_code == "unexpected_ingestion_error"
