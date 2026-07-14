from datetime import UTC, datetime

import pytest

from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.services import ResearchService
from egypt_research_mcp.store import ResearchStore


@pytest.fixture
def service(tmp_path) -> ResearchService:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="news-a",
            name="صحيفة أ",
            url="https://a.example",
            source_type="news",
            ownership_type="private_media",
            language="ar",
        )
    )
    store.upsert_source(
        SourceInput(
            slug="rights-b",
            name="منظمة ب",
            url="https://b.example",
            source_type="human_rights",
            ownership_type="civil_society",
            language="ar",
        )
    )
    for slug, url, title in [
        ("news-a", "https://a.example/1", "تغطية الصحيفة لقانون العمل"),
        ("rights-b", "https://b.example/1", "بيان حقوقي عن قانون العمل"),
    ]:
        store.upsert_document(
            DocumentInput(
                external_id=f"{slug}:1",
                source_slug=slug,
                canonical_url=url,
                title=title,
                excerpt="تفاصيل قانون العمل الجديد",
                content="تفاصيل قانون العمل الجديد وتأثيره",
                published_at=datetime(2026, 7, 14, tzinfo=UTC),
                document_type="article",
                topics=["الحقوق العمالية"],
            )
        )
    return ResearchService(store)


def test_compare_sources_groups_results_by_source_type(service) -> None:
    comparison = service.compare_sources("قانون العمل")

    assert comparison.total_documents == 2
    assert comparison.independent_source_count == 2
    assert set(comparison.by_source_type) == {"news", "human_rights"}


def test_daily_brief_returns_source_diversity(service) -> None:
    brief = service.daily_brief("2026-07-14")

    assert brief.document_count == 2
    assert brief.source_count == 2
    assert len(brief.items) == 2
