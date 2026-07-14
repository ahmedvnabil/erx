from __future__ import annotations

from contextlib import asynccontextmanager
import os
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

from .exports import FORMATS, export_results
from .server import create_mcp
from .retrieval import HybridRetriever
from .security import (
    RateLimitMiddleware,
    RequestObservabilityMiddleware,
    SecurityHeadersMiddleware,
)
from .store import ResearchStore


PACKAGE_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=PACKAGE_DIR / "templates")


def create_app(
    store: ResearchStore,
    *,
    host: str = "127.0.0.1",
    port: int = 8000,
    include_mcp: bool = True,
    rate_limit_per_minute: int | None = None,
) -> Starlette:
    store.initialize()
    mcp = create_mcp(store, host=host, port=port) if include_mcp else None

    async def home(request: Request) -> Response:
        sources = store.list_sources()
        stories = store.list_stories(limit=8)
        return templates.TemplateResponse(
            request,
            "index.html",
            {
                "sources": sources,
                "stories": stories,
                "document_count": sum(source.document_count for source in sources),
                "healthy_count": sum(s.health_status == "healthy" for s in sources),
            },
        )

    async def search(request: Request) -> Response:
        query = request.query_params.get("q", "").strip()
        source_type = request.query_params.get("source_type", "").strip()
        mode = request.query_params.get("mode", "hybrid")
        filters = {
            "source_types": [source_type] if source_type else None,
            "date_from": request.query_params.get("date_from") or None,
            "date_to": request.query_params.get("date_to") or None,
        }
        if mode == "hybrid":
            results = HybridRetriever(store).search(query, limit=50, **filters)
        else:
            results = store.search(query, limit=50, **filters)
        results = [
            result.model_copy(update={"excerpt": result.excerpt[:800]})
            for result in results
        ]
        return templates.TemplateResponse(
            request,
            "partials/results.html",
            {"query": query, "results": results, "mode": mode},
        )

    async def document(request: Request) -> Response:
        document_id = int(request.path_params["document_id"])
        item = store.get_document(document_id)
        if item is None:
            return PlainTextResponse("الوثيقة غير موجودة", status_code=404)
        return templates.TemplateResponse(
            request,
            "document.html",
            {
                "document": item,
                "entities": store.list_entities(document_id=document_id),
                "claims": store.list_claims(document_id=document_id),
                "events": store.list_events(document_id=document_id),
            },
        )

    async def knowledge(request: Request) -> Response:
        return templates.TemplateResponse(
            request,
            "knowledge.html",
            {
                "entities": store.list_entities(limit=50),
                "events": store.list_events(limit=30),
                "claims": store.list_claims(limit=30),
                "saved_searches": store.list_saved_searches(limit=30),
            },
        )

    async def sources(request: Request) -> Response:
        return templates.TemplateResponse(
            request,
            "sources.html",
            {"sources": store.list_sources(), "runs": store.list_crawl_runs(limit=50)},
        )

    async def methodology(request: Request) -> Response:
        return templates.TemplateResponse(request, "methodology.html", {})

    async def export(request: Request) -> Response:
        query = request.query_params.get("q", "").strip()
        format_name = request.query_params.get("format", "ris")
        if format_name not in FORMATS:
            return JSONResponse({"error": "unsupported_format"}, status_code=400)
        content = export_results(store.search(query, limit=100), format_name)
        headers = {"Content-Disposition": f'attachment; filename="egypt-research.{format_name}"'}
        return Response(content, media_type="text/plain; charset=utf-8", headers=headers)

    async def health(_: Request) -> Response:
        sources = store.list_sources()
        return JSONResponse(
            {
                "status": "ok",
                "documents": sum(source.document_count for source in sources),
                "sources": len(sources),
            }
        )

    async def readiness(_: Request) -> Response:
        try:
            with store.connect() as connection:
                connection.execute("SELECT 1").fetchone()
            return JSONResponse({"status": "ready"})
        except Exception:
            return JSONResponse({"status": "not_ready"}, status_code=503)

    async def metrics(_: Request) -> Response:
        sources_data = store.list_sources()
        documents = sum(source.document_count for source in sources_data)
        failed_sources = sum(source.health_status == "failed" for source in sources_data)
        runs = store.list_crawl_runs(limit=500)
        failed_runs = sum(run.status == "failed" for run in runs)
        body = "\n".join(
            (
                "# TYPE egypt_research_documents gauge",
                f"egypt_research_documents {documents}",
                "# TYPE egypt_research_sources gauge",
                f"egypt_research_sources {len(sources_data)}",
                "# TYPE egypt_research_failed_sources gauge",
                f"egypt_research_failed_sources {failed_sources}",
                "# TYPE egypt_research_failed_crawl_runs gauge",
                f"egypt_research_failed_crawl_runs {failed_runs}",
                "",
            )
        )
        return PlainTextResponse(body, media_type="text/plain; version=0.0.4")

    async def api_search(request: Request) -> Response:
        query = request.query_params.get("q", "").strip()
        if not 2 <= len(query) <= 1_000:
            return JSONResponse({"error": {"code": "invalid_query"}}, status_code=422)
        try:
            limit = min(max(int(request.query_params.get("limit", "20")), 1), 100)
        except ValueError:
            return JSONResponse({"error": {"code": "invalid_limit"}}, status_code=422)
        mode = request.query_params.get("mode", "hybrid")
        if mode == "hybrid":
            results = HybridRetriever(store).search(query, limit=limit)
        elif mode == "lexical":
            results = store.search(query, limit=limit)
        else:
            return JSONResponse({"error": {"code": "invalid_mode"}}, status_code=422)
        return JSONResponse(
            {
                "query": query,
                "mode": mode,
                "count": len(results),
                "results": [
                    {
                        **result.model_dump(mode="json"),
                        "excerpt": result.excerpt[:800],
                    }
                    for result in results
                ],
            }
        )

    async def api_document(request: Request) -> Response:
        item = store.get_document(int(request.path_params["document_id"]))
        if item is None:
            return JSONResponse({"error": {"code": "not_found"}}, status_code=404)
        return JSONResponse({"document": item.model_dump(mode="json")})

    async def api_sources(_: Request) -> Response:
        sources_data = store.list_sources()
        return JSONResponse(
            {
                "count": len(sources_data),
                "sources": [source.model_dump(mode="json") for source in sources_data],
            }
        )

    async def api_entities(request: Request) -> Response:
        document_id = request.query_params.get("document_id")
        try:
            parsed_document_id = int(document_id) if document_id else None
        except ValueError:
            return JSONResponse(
                {"error": {"code": "invalid_document_id"}}, status_code=422
            )
        entities = store.list_entities(
            document_id=parsed_document_id
        )
        return JSONResponse(
            {
                "count": len(entities),
                "entities": [entity.model_dump(mode="json") for entity in entities],
            }
        )

    async def api_events(_: Request) -> Response:
        events = store.list_events()
        return JSONResponse(
            {
                "count": len(events),
                "events": [event.model_dump(mode="json") for event in events],
            }
        )

    async def api_claims(_: Request) -> Response:
        claims = store.list_claims()
        return JSONResponse(
            {
                "count": len(claims),
                "claims": [claim.model_dump(mode="json") for claim in claims],
            }
        )

    async def api_saved_searches(_: Request) -> Response:
        saved = store.list_saved_searches()
        return JSONResponse(
            {
                "count": len(saved),
                "saved_searches": [item.model_dump(mode="json") for item in saved],
            }
        )

    async def api_openapi(_: Request) -> Response:
        paths = {
            "/api/v1/search": {"get": {"summary": "Search documents"}},
            "/api/v1/documents/{document_id}": {
                "get": {"summary": "Get a source-backed document"}
            },
            "/api/v1/sources": {"get": {"summary": "List research sources"}},
            "/api/v1/entities": {"get": {"summary": "List extracted entities"}},
            "/api/v1/events": {"get": {"summary": "List documented events"}},
            "/api/v1/claims": {"get": {"summary": "List claims and evidence"}},
            "/api/v1/saved-searches": {"get": {"summary": "List saved searches"}},
        }
        return JSONResponse(
            {
                "openapi": "3.1.0",
                "info": {"title": "Egypt Research API", "version": "1.0.0"},
                "paths": paths,
            }
        )

    routes = [
        Route("/", home),
        Route("/search", search),
        Route("/documents/{document_id:int}", document),
        Route("/sources", sources),
        Route("/methodology", methodology),
        Route("/knowledge", knowledge),
        Route("/export", export),
        Route("/healthz", health),
        Route("/readyz", readiness),
        Route("/metrics", metrics),
        Route("/api/v1/search", api_search),
        Route("/api/v1/documents/{document_id:int}", api_document),
        Route("/api/v1/sources", api_sources),
        Route("/api/v1/entities", api_entities),
        Route("/api/v1/events", api_events),
        Route("/api/v1/claims", api_claims),
        Route("/api/v1/saved-searches", api_saved_searches),
        Route("/api/v1/openapi.json", api_openapi),
        Mount("/static", StaticFiles(directory=PACKAGE_DIR / "static"), name="static"),
    ]
    if mcp is not None:
        routes.append(Mount("/", app=mcp.streamable_http_app()))

    @asynccontextmanager
    async def lifespan(_: Starlette):
        if mcp is None:
            yield
        else:
            async with mcp.session_manager.run():
                yield

    app = Starlette(routes=routes, lifespan=lifespan)
    effective_rate_limit = rate_limit_per_minute or int(
        os.getenv("EGYPT_RESEARCH_RATE_LIMIT", "120")
    )
    app.add_middleware(
        RateLimitMiddleware, requests_per_minute=effective_rate_limit
    )
    app.add_middleware(RequestObservabilityMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    return app
