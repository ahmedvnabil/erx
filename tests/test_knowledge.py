from datetime import UTC, datetime

import httpx

from egypt_research_mcp.knowledge import KnowledgeIndexer
from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.retrieval import (
    GeminiEmbeddingProvider,
    HybridRetriever,
    LocalEmbeddingProvider,
    cosine_similarity,
)
from egypt_research_mcp.store import ResearchStore


def _store(tmp_path) -> tuple[ResearchStore, int]:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="rights-source",
            name="مصدر حقوقي",
            url="https://example.org",
            source_type="human_rights",
            ownership_type="independent",
        )
    )
    result = store.upsert_document(
        DocumentInput(
            external_id="rights-source:1",
            source_slug="rights-source",
            canonical_url="https://example.org/1",
            title="المبادرة المصرية توثق قرار النيابة العامة في القاهرة",
            content=(
                "أعلنت المبادرة المصرية للحقوق الشخصية أن النيابة العامة "
                "قررت إخلاء سبيل عدد من العمال. يتناول التقرير قانون العمل "
                "والحماية القانونية للعاملين."
            ),
            published_at=datetime(2026, 7, 1, tzinfo=UTC),
            topics=["الحقوق العمالية"],
        )
    )
    return store, result.document_id


def test_index_document_extracts_entities_claims_and_event(tmp_path) -> None:
    store, document_id = _store(tmp_path)

    report = KnowledgeIndexer(store).index_document(document_id)

    assert report.entities >= 3
    assert report.claims == 1
    assert report.events == 1
    entities = store.list_entities(document_id=document_id)
    assert {entity.canonical_name for entity in entities} >= {
        "المبادرة المصرية للحقوق الشخصية",
        "النيابة العامة",
        "القاهرة",
    }
    claims = store.list_claims(document_id=document_id)
    assert "إخلاء سبيل" in claims[0].claim_text
    assert claims[0].evidence[0].document_id == document_id
    event = store.list_events(document_id=document_id)[0]
    assert event.occurred_at == datetime(2026, 7, 1, tzinfo=UTC)
    assert event.documents[0].canonical_url == "https://example.org/1"


def test_hybrid_search_adds_semantic_results_and_explains_ranking(tmp_path) -> None:
    store, document_id = _store(tmp_path)
    provider = LocalEmbeddingProvider(dimensions=128)
    KnowledgeIndexer(store, embedding_provider=provider).index_document(document_id)

    results = HybridRetriever(store, provider=provider).search(
        "حقوق العاملين", limit=10
    )

    assert results[0].document_id == document_id
    assert results[0].retrieval_score > 0
    assert "semantic" in results[0].match_reasons


def test_knowledge_indexing_is_idempotent(tmp_path) -> None:
    store, document_id = _store(tmp_path)
    indexer = KnowledgeIndexer(store)

    indexer.index_document(document_id)
    first_claim = store.list_claims(document_id=document_id)[0]
    first_event = store.list_events(document_id=document_id)[0]
    indexer.index_document(document_id)

    assert len(store.list_entities(document_id=document_id)) == 3
    assert len(store.list_claims(document_id=document_id)) == 1
    assert len(store.list_events(document_id=document_id)) == 1
    assert store.list_claims(document_id=document_id)[0].id == first_claim.id
    assert store.list_claims(document_id=document_id)[0].first_seen_at == first_claim.first_seen_at
    assert store.list_events(document_id=document_id)[0].id == first_event.id


def test_gemini_embedding_uses_secret_header_and_retrieval_task() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "secret"
        assert "secret" not in str(request.url)
        payload = request.read().decode()
        assert '"taskType":"RETRIEVAL_QUERY"' in payload
        assert '"outputDimensionality":128' in payload
        return httpx.Response(
            200, json={"embedding": {"values": [0.5] + [0.0] * 127}}
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        provider = GeminiEmbeddingProvider(
            api_key="secret", client=client, dimensions=128
        )
        vector = provider.embed_query("الحقوق العمالية")

    assert len(vector) == 128
    assert vector[0] == 0.5


def test_cosine_similarity_normalizes_external_vectors() -> None:
    assert cosine_similarity([2.0, 0.0], [3.0, 0.0]) == 1.0
    assert cosine_similarity([0.0, 0.0], [3.0, 0.0]) == 0.0
