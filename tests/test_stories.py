from datetime import UTC, datetime, timedelta

from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.store import ResearchStore


def test_similar_headlines_are_grouped_with_source_diversity(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    for slug, name in (("source-a", "المصدر أ"), ("source-b", "المصدر ب")):
        store.upsert_source(
            SourceInput(
                slug=slug,
                name=name,
                url=f"https://{slug}.example",
                source_type="news",
                ownership_type="private_media",
            )
        )
    published = datetime(2026, 7, 14, 9, tzinfo=UTC)
    for slug, title in (
        ("source-a", "الحكومة تعلن حزمة إجراءات اقتصادية جديدة"),
        ("source-b", "إجراءات اقتصادية جديدة تعلنها الحكومة اليوم"),
    ):
        result = store.upsert_document(
            DocumentInput(
                external_id=f"{slug}-1",
                source_slug=slug,
                canonical_url=f"https://{slug}.example/1",
                title=title,
                content="تفاصيل موسعة عن الإجراءات الاقتصادية الجديدة.",
                published_at=published,
            )
        )
        store.assign_story(result.document_id)

    stories = store.list_stories(limit=10)

    assert len(stories) == 1
    assert stories[0].document_count == 2
    assert stories[0].source_count == 2
    assert {item.source_slug for item in stories[0].documents} == {
        "source-a",
        "source-b",
    }

    later = store.upsert_document(
        DocumentInput(
            external_id="source-a-later",
            source_slug="source-a",
            canonical_url="https://source-a.example/later",
            title="الحكومة تعلن حزمة إجراءات اقتصادية جديدة",
            published_at=published + timedelta(days=30),
        )
    )
    store.assign_story(later.document_id)

    assert len(store.list_stories(limit=10)) == 2
