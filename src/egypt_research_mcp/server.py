from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from .catalog import TOPICS
from .exports import FORMATS, export_results
from .models import SourceType
from .retrieval import HybridRetriever
from .services import ResearchService
from .store import ResearchStore


METHODOLOGY = {
    "purpose": "بنية بحثية موثقة المصدر للشأن المصري، وليست جهة تحقق أو إصدار أحكام.",
    "principles": [
        "إرجاع رابط المصدر الأصلي وتاريخ النشر مع كل نتيجة.",
        "الفصل بين تاريخ الواقعة وتاريخ نشر الوثيقة وتاريخ أرشفتها.",
        "عرض نوع المصدر وملكيته دون منحه درجة حقيقة آلية.",
        "عدم اعتبار تكرار الادعاء في مصادر متعددة دليلاً نهائياً على صحته.",
        "الاحتفاظ بإصدارات الوثيقة عند تغير محتواها.",
    ],
    "limitations": [
        "قد تتأخر بعض المصادر بسبب الحجب أو تغير بنية الموقع.",
        "المواد غير المتاحة عبر قناة مباشرة موثقة تظهر في الكتالوج دون ادعاء جمعها.",
    ],
}


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def _search_payload(result: object) -> dict:
    payload = result.model_dump(mode="json")
    payload["excerpt"] = payload.get("excerpt", "")[:800]
    return payload


def create_mcp(
    store: ResearchStore | None = None,
    *,
    database_path: str | Path = "data/research.db",
    host: str = "127.0.0.1",
    port: int = 8000,
) -> FastMCP:
    store = store or ResearchStore(database_path)
    store.initialize()
    service = ResearchService(store)
    mcp = FastMCP(
        "Egypt Research MCP",
        instructions=(
            "ابحث في مصادر الشأن المصري وأعد النتائج مع الاستشهادات. "
            "لا تصف الادعاءات بأنها حقائق مؤكدة دون مقارنة مصادر مستقلة ووثائق أولية."
        ),
        host=host,
        port=port,
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
    )

    @mcp.tool(description="بحث موحد في الوثائق المصرية مع فلاتر المصدر والتاريخ.")
    def search_egypt(
        query: str,
        source_types: list[SourceType] | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 20,
    ) -> dict:
        results = store.search(
            query,
            source_types=source_types,
            date_from=date_from.isoformat() if date_from else None,
            date_to=date_to.isoformat() if date_to else None,
            limit=limit,
        )
        return {
            "query": query,
            "count": len(results),
            "results": [_search_payload(result) for result in results],
        }

    @mcp.tool(description="استرجاع سجل وثيقة واحد مع بيانات الاستشهاد.")
    def get_document(document_id: int) -> dict:
        document = store.get_document(document_id)
        if document is None:
            return {"ok": False, "error": {"code": "not_found", "document_id": document_id}}
        return {"ok": True, "document": document.model_dump(mode="json")}

    @mcp.tool(description="بناء خط زمني موثق لموضوع أو قضية أو كيان.")
    def build_timeline(query: str, limit: int = 100) -> dict:
        items = store.timeline(query, limit=limit)
        return {"query": query, "count": len(items), "items": [i.model_dump(mode="json") for i in items]}

    @mcp.tool(description="مقارنة تغطية أنواع مختلفة من المصادر لنفس الاستعلام.")
    def compare_sources(query: str, limit: int = 50) -> dict:
        return service.compare_sources(query, limit=limit).model_dump(mode="json")

    @mcp.tool(description="عرض نوع المصدر وملكيته وصحة جمعه وعدد وثائقه.")
    def get_source_profile(source_slug: str) -> dict:
        source = store.get_source(source_slug)
        if source is None:
            return {"ok": False, "error": {"code": "source_not_found", "source_slug": source_slug}}
        return {"ok": True, "source": source.model_dump(mode="json")}

    @mcp.tool(description="عرض كتالوج المصادر وحالة الأرشفة لكل مصدر.")
    def list_sources(source_type: str | None = None, active_only: bool = True) -> dict:
        sources = store.list_sources()
        filtered = [
            source
            for source in sources
            if (not source_type or source.source_type == source_type)
            and (not active_only or source.active)
        ]
        return {"count": len(filtered), "sources": [s.model_dump(mode="json") for s in filtered]}

    @mcp.tool(description="إرجاع مواد يوم محدد مع قياس تنوع المصادر.")
    def get_daily_brief(date: date, limit: int = 50) -> dict:
        return service.daily_brief(date.isoformat(), limit=limit).model_dump(mode="json")

    @mcp.tool(description="عرض القصص المتقاربة مع عدد الوثائق وتنوع المصادر.")
    def list_stories(limit: int = 20) -> dict:
        stories = store.list_stories(limit=limit)
        return {
            "count": len(stories),
            "stories": [story.model_dump(mode="json") for story in stories],
        }

    @mcp.tool(description="تصدير نتائج البحث بصيغة CSV أو JSONL أو BibTeX أو RIS.")
    def export_references(
        query: str, format: str = "ris", limit: int = 100
    ) -> dict:
        if format not in FORMATS:
            return {"ok": False, "error": {"code": "unsupported_format"}}
        results = store.search(query, limit=limit)
        return {
            "ok": True,
            "format": format,
            "count": len(results),
            "content": export_results(results, format),
        }

    @mcp.tool(description="بحث هجين يجمع المطابقة النصية والدلالية مع تفسير الترتيب.")
    def hybrid_search(query: str, limit: int = 20) -> dict:
        results = HybridRetriever(store).search(query, limit=limit)
        return {
            "query": query,
            "count": len(results),
            "results": [_search_payload(result) for result in results],
        }

    @mcp.tool(description="عرض الكيانات المستخرجة وأعداد ظهورها في الوثائق.")
    def find_entities(document_id: int | None = None, limit: int = 100) -> dict:
        entities = store.list_entities(document_id=document_id, limit=limit)
        return {
            "count": len(entities),
            "entities": [entity.model_dump(mode="json") for entity in entities],
        }

    @mcp.tool(description="عرض الأحداث المؤرخة وربط كل حدث بوثائقه الأصلية.")
    def list_events(document_id: int | None = None, limit: int = 100) -> dict:
        events = store.list_events(document_id=document_id, limit=limit)
        return {
            "count": len(events),
            "events": [event.model_dump(mode="json") for event in events],
        }

    @mcp.tool(description="تتبع ادعاء واحد إلى الأدلة والمصادر التي أوردته.")
    def trace_claim(claim_id: int) -> dict:
        claim = next(
            (item for item in store.list_claims(limit=500) if item.id == claim_id),
            None,
        )
        if claim is None:
            return {"ok": False, "error": {"code": "claim_not_found"}}
        return {"ok": True, "claim": claim.model_dump(mode="json")}

    @mcp.tool(description="حفظ استعلام بحثي محلي لإعادة تشغيله ومتابعته لاحقًا.")
    def save_research_query(name: str, query: str) -> dict:
        saved = store.save_search(name, query)
        return {"ok": True, "saved_search": saved.model_dump(mode="json")}

    @mcp.resource("egypt://sources", mime_type="application/json")
    def sources_resource() -> str:
        return _json([source.model_dump(mode="json") for source in store.list_sources()])

    @mcp.resource("egypt://taxonomy", mime_type="application/json")
    def taxonomy_resource() -> str:
        return _json(TOPICS)

    @mcp.resource("egypt://methodology", mime_type="application/json")
    def methodology_resource() -> str:
        return _json(METHODOLOGY)

    @mcp.resource("egypt://source/{slug}", mime_type="application/json")
    def source_resource(slug: str) -> str:
        source = store.get_source(slug)
        return _json(source.model_dump(mode="json") if source else {"error": "source_not_found"})

    @mcp.prompt(description="خطة موجز بحثي موثق ومتوازن عن موضوع مصري.")
    def research_brief(topic: str, date_from: str = "", date_to: str = "") -> str:
        return (
            f"ابحث عن: {topic}. الفترة: {date_from or 'غير محددة'} إلى {date_to or 'الآن'}. "
            "ابدأ بالوثائق الأولية، ثم قارن المصادر الرسمية والإعلامية والحقوقية، "
            "وابنِ خطًا زمنيًا. ضع رابطًا وتاريخًا بجانب كل ادعاء، واذكر فجوات الأدلة."
        )

    @mcp.prompt(description="منهج للتحقق من ادعاء متعلق بالشأن المصري.")
    def verify_claim(claim: str) -> str:
        return (
            f"تحقق من الادعاء التالي دون افتراض صحته: {claim}. "
            "ابحث عن المصدر الأولي، وافصل بين التأكيد المستقل وإعادة النشر، "
            "واعرض الأدلة المؤيدة والمعارضة وما لا يمكن حسمه."
        )

    return mcp
