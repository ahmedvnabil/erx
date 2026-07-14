import asyncio
from datetime import UTC, datetime

import httpx

from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.knowledge import KnowledgeIndexer
from egypt_research_mcp.retrieval import LocalEmbeddingProvider
from egypt_research_mcp.store import ResearchStore
from egypt_research_mcp.web import create_app


def get(app, path: str, params: dict[str, str] | None = None) -> httpx.Response:
    async def request() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.get(path, params=params)

    return asyncio.run(request())


def seeded_store(tmp_path) -> ResearchStore:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="official-test",
            name="المصدر الرسمي التجريبي",
            url="https://example.org",
            source_type="official",
            ownership_type="government",
        )
    )
    inserted = store.upsert_document(
        DocumentInput(
            external_id="official-1",
            source_slug="official-test",
            canonical_url="https://example.org/decision/1",
            title="قرار اقتصادي مصري موثق",
            excerpt="تفاصيل موجزة للقرار",
            content="النص الكامل للقرار الاقتصادي المصري الموثق.",
            published_at=datetime(2026, 7, 14, tzinfo=UTC),
        )
    )
    store.assign_story(inserted.document_id)
    return store


def test_homepage_and_search_are_available_in_arabic(tmp_path) -> None:
    app = create_app(seeded_store(tmp_path), include_mcp=False)

    home = get(app, "/")
    search = get(app, "/search", params={"q": "قرار اقتصادي"})

    assert home.status_code == 200
    assert "مرصد مصر البحثي" in home.text
    assert "1 وثيقة" in home.text
    assert search.status_code == 200
    assert "قرار اقتصادي مصري موثق" in search.text
    assert "المصدر الرسمي التجريبي" in search.text


def test_document_sources_health_and_export_routes(tmp_path) -> None:
    app = create_app(seeded_store(tmp_path), include_mcp=False)

    assert "النص الكامل للقرار" in get(app, "/documents/1").text
    assert "المصدر الرسمي التجريبي" in get(app, "/sources").text
    assert get(app, "/healthz").json()["status"] == "ok"
    export = get(app, "/export", params={"q": "قرار اقتصادي", "format": "ris"})
    assert export.status_code == 200
    assert "قانون" not in export.text
    assert "قرار اقتصادي مصري موثق" in export.text


def test_versioned_research_api_exposes_search_and_knowledge(tmp_path) -> None:
    store = seeded_store(tmp_path)
    KnowledgeIndexer(store, embedding_provider=LocalEmbeddingProvider()).backfill()
    app = create_app(store, include_mcp=False)

    search = get(app, "/api/v1/search", params={"q": "قرار اقتصادي", "mode": "hybrid"})
    document = get(app, "/api/v1/documents/1")
    events = get(app, "/api/v1/events")
    specification = get(app, "/api/v1/openapi.json")

    assert search.status_code == 200
    assert search.json()["results"][0]["citation"]["url"].startswith("https://")
    assert search.json()["results"][0]["match_reasons"]
    assert document.json()["document"]["content"].startswith("النص الكامل")
    assert events.json()["count"] == 1
    assert specification.json()["info"]["title"] == "Egypt Research API"


def test_saved_search_store_is_available_through_api(tmp_path) -> None:
    store = seeded_store(tmp_path)
    saved = store.save_search("متابعة الاقتصاد", "قرار اقتصادي", {"source_type": "official"})
    app = create_app(store, include_mcp=False)

    response = get(app, "/api/v1/saved-searches")

    assert response.status_code == 200
    assert response.json()["saved_searches"][0]["id"] == saved.id
    assert response.json()["saved_searches"][0]["filters"]["source_type"] == "official"


def test_advanced_search_and_knowledge_ui_are_rendered(tmp_path) -> None:
    store = seeded_store(tmp_path)
    KnowledgeIndexer(store).backfill()
    app = create_app(store, include_mcp=False)

    home = get(app, "/")
    knowledge = get(app, "/knowledge")
    document = get(app, "/documents/1")

    assert 'name="date_from"' in home.text
    assert 'name="mode"' in home.text
    assert "خريطة المعرفة" in knowledge.text
    assert "الأحداث الموثقة" in knowledge.text
    assert "الكيانات المرتبطة" in document.text


def test_api_rejects_invalid_query_and_entity_document_id(tmp_path) -> None:
    app = create_app(seeded_store(tmp_path), include_mcp=False)

    long_query = get(app, "/api/v1/search", params={"q": "س" * 1001})
    bad_document_id = get(app, "/api/v1/entities", params={"document_id": "bad"})

    assert long_query.status_code == 422
    assert bad_document_id.status_code == 422
