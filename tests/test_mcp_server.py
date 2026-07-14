import asyncio
import json
from datetime import UTC, datetime

from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.knowledge import KnowledgeIndexer
from egypt_research_mcp.retrieval import LocalEmbeddingProvider
from egypt_research_mcp.server import create_mcp
from egypt_research_mcp.store import ResearchStore


def test_mcp_exposes_research_tools_and_resources(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    mcp = create_mcp(store)

    tools = asyncio.run(mcp.list_tools())
    resources = asyncio.run(mcp.list_resources())

    assert {tool.name for tool in tools} == {
        "search_egypt",
        "get_document",
        "build_timeline",
        "compare_sources",
        "get_source_profile",
        "list_sources",
        "get_daily_brief",
        "list_stories",
        "export_references",
        "hybrid_search",
        "find_entities",
        "list_events",
        "trace_claim",
        "save_research_query",
    }
    assert {str(resource.uri) for resource in resources} >= {
        "egypt://sources",
        "egypt://taxonomy",
        "egypt://methodology",
    }


def test_mcp_tools_resources_and_prompts_return_source_backed_data(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="test-news",
            name="صحيفة الاختبار",
            url="https://example.org",
            source_type="news",
            ownership_type="private_media",
        )
    )
    inserted = store.upsert_document(
        DocumentInput(
            external_id="test-news:1",
            source_slug="test-news",
            canonical_url="https://example.org/1",
            title="قانون العمل المصري",
            excerpt="تغطية موثقة",
            content="النص الكامل للوثيقة البحثية",
            published_at=datetime(2026, 7, 14, tzinfo=UTC),
            topics=["الحقوق العمالية"],
        )
    )
    KnowledgeIndexer(store, embedding_provider=LocalEmbeddingProvider()).index_document(
        inserted.document_id
    )
    mcp = create_mcp(store)

    calls = {
        "search_egypt": {"query": "قانون العمل"},
        "get_document": {"document_id": inserted.document_id},
        "build_timeline": {"query": "قانون العمل"},
        "compare_sources": {"query": "قانون العمل"},
        "get_source_profile": {"source_slug": "test-news"},
        "list_sources": {"source_type": "news"},
        "get_daily_brief": {"date": "2026-07-14"},
        "list_stories": {},
        "export_references": {"query": "قانون العمل", "format": "ris"},
        "hybrid_search": {"query": "حقوق العاملين"},
        "find_entities": {},
        "list_events": {},
        "trace_claim": {"claim_id": 999},
        "save_research_query": {"name": "العمل", "query": "قانون العمل"},
    }
    payloads = {}
    for name, arguments in calls.items():
        result = asyncio.run(mcp.call_tool(name, arguments))
        payloads[name] = json.loads(result[0].text)

    assert payloads["search_egypt"]["count"] == 1
    assert payloads["get_document"]["document"]["citation"]["url"] == "https://example.org/1"
    assert payloads["get_document"]["document"]["content"] == "النص الكامل للوثيقة البحثية"
    assert payloads["build_timeline"]["count"] == 1
    assert payloads["compare_sources"]["independent_source_count"] == 1
    assert payloads["get_source_profile"]["source"]["ownership_type"] == "private_media"
    assert payloads["list_sources"]["count"] == 1
    assert payloads["get_daily_brief"]["document_count"] == 1
    assert "قانون العمل المصري" in payloads["export_references"]["content"]
    assert payloads["hybrid_search"]["results"][0]["match_reasons"]
    assert payloads["list_events"]["count"] == 1
    assert payloads["trace_claim"]["error"]["code"] == "claim_not_found"
    assert payloads["save_research_query"]["saved_search"]["name"] == "العمل"

    missing_document = asyncio.run(mcp.call_tool("get_document", {"document_id": 999}))
    missing_source = asyncio.run(mcp.call_tool("get_source_profile", {"source_slug": "missing"}))
    assert json.loads(missing_document[0].text)["error"]["code"] == "not_found"
    assert json.loads(missing_source[0].text)["error"]["code"] == "source_not_found"

    for uri in ("egypt://sources", "egypt://taxonomy", "egypt://methodology", "egypt://source/test-news"):
        assert list(asyncio.run(mcp.read_resource(uri)))[0].content
    assert asyncio.run(mcp.get_prompt("research_brief", {"topic": "العمل"})).messages
    assert asyncio.run(mcp.get_prompt("verify_claim", {"claim": "ادعاء"})).messages
