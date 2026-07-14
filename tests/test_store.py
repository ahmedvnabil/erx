from datetime import UTC, datetime

from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.store import ResearchStore


def source() -> SourceInput:
    return SourceInput(
        slug="eipr",
        name="المبادرة المصرية للحقوق الشخصية",
        url="https://eipr.org",
        source_type="human_rights",
        ownership_type="civil_society",
        language="ar",
    )


def document(content: str = "النص الأصلي للتقرير") -> DocumentInput:
    return DocumentInput(
        external_id="eipr:report-1",
        source_slug="eipr",
        canonical_url="https://eipr.org/reports/1",
        title="تقرير عن حقوق الإنسان",
        excerpt="ملخص التقرير",
        content=content,
        published_at=datetime(2026, 7, 14, 9, 30, tzinfo=UTC),
        event_at=datetime(2026, 7, 13, 12, 0, tzinfo=UTC),
        document_type="report",
        topics=["حرية التعبير", "حقوق الإنسان"],
    )


def test_upsert_source_is_idempotent(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()

    first = store.upsert_source(source())
    second = store.upsert_source(source())

    assert first == second
    assert len(store.list_sources()) == 1


def test_source_collection_policy_is_persisted_and_infers_hybrid_mode(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="policy-source",
            name="مصدر متعدد القنوات",
            url="https://example.org",
            feed_url="https://example.org/feed",
            sitemap_url="https://example.org/sitemap.xml",
            source_type="official",
            ownership_type="government",
            crawl_delay_seconds=2.5,
            content_license="public_information",
            robots_policy="respect",
        )
    )

    saved = store.get_source("policy-source")

    assert saved.collection_method == "hybrid"
    assert saved.sitemap_url == "https://example.org/sitemap.xml"
    assert saved.crawl_delay_seconds == 2.5
    assert saved.content_license == "public_information"
    assert saved.robots_policy == "respect"


def test_upsert_document_versions_changed_content_only(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(source())

    first = store.upsert_document(document())
    unchanged = store.upsert_document(document())
    changed = store.upsert_document(document("نص مصحح ومحدّث"))

    assert first.document_id == unchanged.document_id == changed.document_id
    assert first.created_version is True
    assert unchanged.created_version is False
    assert changed.created_version is True
    assert store.version_count(first.document_id) == 2


def test_search_matches_normalized_arabic_and_returns_citation(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(source())
    store.upsert_document(document())

    results = store.search("حقوق الانسان", limit=10)

    assert len(results) == 1
    assert results[0].source_slug == "eipr"
    assert results[0].citation.url == "https://eipr.org/reports/1"
    assert results[0].topics == ["حرية التعبير", "حقوق الإنسان"]


def test_timeline_uses_event_date_before_publication_date(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(source())
    store.upsert_document(document())

    timeline = store.timeline("حقوق الإنسان")

    assert timeline[0].occurred_at.isoformat() == "2026-07-13T12:00:00+00:00"
    assert timeline[0].date_basis == "event_at"
