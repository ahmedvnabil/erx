import asyncio

import httpx

from egypt_research_mcp.store import ResearchStore
from egypt_research_mcp.web import create_app


def request(app, path: str) -> httpx.Response:
    async def run() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            return await client.get(path)

    return asyncio.run(run())


def test_security_headers_and_request_id_are_added(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    app = create_app(store, include_mcp=False)

    response = request(app, "/healthz")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["x-request-id"]


def test_api_rate_limit_is_bounded_and_returns_retry_header(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    app = create_app(store, include_mcp=False, rate_limit_per_minute=2)

    assert request(app, "/api/v1/sources").status_code == 200
    assert request(app, "/api/v1/sources").status_code == 200
    blocked = request(app, "/api/v1/sources")

    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]


def test_readiness_and_metrics_are_exposed(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    app = create_app(store, include_mcp=False)

    ready = request(app, "/readyz")
    metrics = request(app, "/metrics")

    assert ready.json()["status"] == "ready"
    assert metrics.status_code == 200
    assert "egypt_research_documents 0" in metrics.text
    assert "egypt_research_sources 0" in metrics.text
