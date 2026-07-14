from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from bs4 import BeautifulSoup
import httpx


@dataclass(frozen=True)
class ExtractedArticle:
    title: str
    content: str
    canonical_url: str


def _normalized_host(value: str) -> str:
    host = value.lower().split(":", 1)[0]
    return host[4:] if host.startswith("www.") else host


def fetch_article(
    client: httpx.Client,
    url: str,
    allowed_host: str,
    *,
    max_bytes: int = 5_000_000,
) -> ExtractedArticle:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Article URL must use http or https")
    actual = _normalized_host(parsed.hostname)
    allowed = _normalized_host(allowed_host)
    if actual != allowed and not actual.endswith(f".{allowed}"):
        raise ValueError("Article URL is outside the configured source host")

    response = client.get(url)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "text/html").lower()
    if "html" not in content_type:
        raise ValueError("Article response is not HTML")
    if len(response.content) > max_bytes:
        raise ValueError("Article response exceeds size limit")
    return extract_article(response.content, str(response.url))


def extract_article(html: str | bytes, page_url: str) -> ExtractedArticle:
    soup = BeautifulSoup(html, "html.parser")
    for element in soup.select(
        "script, style, noscript, nav, footer, aside, form, dialog, svg"
    ):
        element.decompose()

    container = soup.select_one("article, main, [role='main']")
    if container is None:
        return ExtractedArticle(title="", content="", canonical_url=page_url)

    heading = container.find("h1")
    title = heading.get_text(" ", strip=True) if heading else ""
    paragraphs = [
        node.get_text(" ", strip=True)
        for node in container.select("p")
        if len(node.get_text(" ", strip=True)) >= 20
    ]
    content = "\n\n".join(dict.fromkeys(paragraphs))
    canonical = soup.select_one("link[rel='canonical']")
    canonical_url = page_url
    if canonical and canonical.get("href"):
        candidate = str(canonical["href"])
        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            canonical_url = candidate
    return ExtractedArticle(title=title, content=content, canonical_url=canonical_url)
