from datetime import UTC, datetime

from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.store import ResearchStore


def test_initialize_applies_versioned_migrations_without_losing_data(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="migration-source",
            name="مصدر الترحيل",
            url="https://example.org",
            source_type="official",
            ownership_type="government",
        )
    )
    inserted = store.upsert_document(
        DocumentInput(
            external_id="migration-1",
            source_slug="migration-source",
            canonical_url="https://example.org/1",
            title="وثيقة باقية بعد الترحيل",
            published_at=datetime(2026, 7, 14, tzinfo=UTC),
        )
    )

    store.initialize()

    with store.connect() as connection:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(sources)")
        }
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        versions = connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall()

    assert {
        "sitemap_url",
        "collection_method",
        "crawl_delay_seconds",
        "content_license",
        "robots_policy",
        "consecutive_failures",
    } <= columns
    assert {
        "document_assets",
        "entities",
        "events",
        "claims",
        "document_embeddings",
        "saved_searches",
        "audit_events",
    } <= tables
    assert [row["version"] for row in versions] == [1, 2]
    assert store.get_document(inserted.document_id).title == "وثيقة باقية بعد الترحيل"
