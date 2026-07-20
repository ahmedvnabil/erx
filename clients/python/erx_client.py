"""Dependency-free Python client for the ERX (Egypt Research) REST API.

The ERX API is a read-only, source-grounded research API for Egyptian
public-affairs. It requires no authentication and returns snake_case JSON.

This module uses only the Python standard library (``urllib``, ``json``),
so it can be dropped into any project without installing dependencies.

Example
-------
>>> from erx_client import ErxClient
>>> client = ErxClient()
>>> hits = client.search("قانون العمل", limit=5)
>>> for result in hits["results"]:
...     print(result["title"], "--", result["source_name"])
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional

__all__ = ["ErxClient", "ErxError"]

DEFAULT_BASE_URL = "https://erx-mcp.zad.tools"
API_PREFIX = "/api/v1"

# Type aliases kept intentionally loose: the API returns snake_case JSON
# objects and this client passes them through unchanged as dictionaries.
JsonObject = Dict[str, Any]


class ErxError(RuntimeError):
    """Raised when the ERX API returns a non-2xx response.

    Attributes:
        status: HTTP status code returned by the server (``0`` for transport
            errors such as timeouts or DNS failures).
        body: Raw response body text, useful for debugging error envelopes
            shaped like ``{"error": {"code": ..., "message": ...}}``.
        url: The request URL that produced the error.
    """

    def __init__(self, status: int, body: str, url: str) -> None:
        self.status = status
        self.body = body
        self.url = url
        super().__init__(f"ERX request to {url} failed with status {status}: {body}")


@dataclass
class ErxClient:
    """Thin client for the ERX REST API.

    Args:
        base_url: Root URL of the ERX deployment (no trailing ``/api/v1``).
        timeout: Per-request timeout in seconds.
    """

    base_url: str = DEFAULT_BASE_URL
    timeout: float = 30.0
    _opener: urllib.request.OpenerDirector = field(
        default_factory=urllib.request.build_opener, repr=False, compare=False
    )

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    # -- HTTP plumbing ----------------------------------------------------

    def _build_url(self, path: str, params: Optional[Mapping[str, Any]] = None) -> str:
        url = f"{self.base_url}{path}"
        if params:
            filtered = {k: v for k, v in params.items() if v is not None}
            if filtered:
                url = f"{url}?{urllib.parse.urlencode(filtered)}"
        return url

    def _request(self, path: str, params: Optional[Mapping[str, Any]] = None) -> Any:
        """Perform a GET request and decode a JSON response.

        Raises:
            ErxError: On any non-2xx response or transport-level failure.
        """
        text = self._request_text(path, params, accept="application/json")
        try:
            return json.loads(text) if text else None
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            raise ErxError(0, f"invalid JSON: {exc}", self._build_url(path, params)) from exc

    def _request_text(
        self,
        path: str,
        params: Optional[Mapping[str, Any]] = None,
        accept: str = "*/*",
    ) -> str:
        """Perform a GET request and return the raw response body as text."""
        url = self._build_url(path, params)
        request = urllib.request.Request(
            url, headers={"Accept": accept, "User-Agent": "erx-client-python/1.0"}
        )
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            raise ErxError(exc.code, body, url) from exc
        except urllib.error.URLError as exc:
            raise ErxError(0, str(exc.reason), url) from exc

    # -- Search & documents ----------------------------------------------

    def search(
        self,
        q: str,
        mode: str = "hybrid",
        limit: int = 20,
        offset: int = 0,
    ) -> JsonObject:
        """Search the archive.

        Args:
            q: Query string (2-1000 characters).
            mode: ``"hybrid"`` (default, lexical + semantic) or ``"lexical"``.
            limit: Maximum results to return (1-100).
            offset: Result offset for pagination.

        Returns:
            A dict with ``query``, ``mode``, ``count`` and a ``results`` list.
        """
        return self._request(
            f"{API_PREFIX}/search",
            {"q": q, "mode": mode, "limit": limit, "offset": offset},
        )

    def get_document(self, document_id: int) -> JsonObject:
        """Fetch a single source-backed document by its numeric id."""
        return self._request(f"{API_PREFIX}/documents/{document_id}")

    # -- Catalog & coverage ----------------------------------------------

    def list_sources(self) -> JsonObject:
        """List all research sources with counts and metadata."""
        return self._request(f"{API_PREFIX}/sources")

    def coverage(self) -> JsonObject:
        """Return the archive coverage report (topics + source health)."""
        return self._request(f"{API_PREFIX}/coverage")

    def entities(self, document_id: Optional[int] = None) -> JsonObject:
        """List extracted entities, optionally scoped to one document."""
        return self._request(
            f"{API_PREFIX}/entities",
            {"document_id": document_id} if document_id is not None else None,
        )

    def events(self) -> JsonObject:
        """List documented events."""
        return self._request(f"{API_PREFIX}/events")

    def claims(self) -> JsonObject:
        """List claims and their supporting evidence."""
        return self._request(f"{API_PREFIX}/claims")

    # -- Live data --------------------------------------------------------

    def live_datasets(self) -> JsonObject:
        """List available public live datasets."""
        return self._request(f"{API_PREFIX}/live/datasets")

    def live_data(self, source: str, **params: Any) -> JsonObject:
        """Query a public live dataset.

        Args:
            source: Live source slug (see :meth:`live_datasets`).
            **params: Extra query parameters such as ``indicator``,
                ``country``, ``period_from``, ``period_to`` or ``limit``.
        """
        return self._request(f"{API_PREFIX}/live/data", {"source": source, **params})

    def live_health(self) -> JsonObject:
        """Check the health of live data sources."""
        return self._request(f"{API_PREFIX}/live/health")

    # -- Status & export --------------------------------------------------

    def status(self) -> JsonObject:
        """Return service and archive status."""
        return self._request(f"{API_PREFIX}/status")

    def export_references(self, q: str, format: str = "ris") -> str:
        """Export search results as a citation file.

        Args:
            q: Query string.
            format: One of ``"ris"``, ``"bibtex"``, ``"csv"`` or ``"jsonl"``.

        Returns:
            The raw exported document as text.
        """
        return self._request_text("/export", {"q": q, "format": format})
