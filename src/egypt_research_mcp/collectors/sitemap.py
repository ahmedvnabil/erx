from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse
from xml.etree import ElementTree


@dataclass(frozen=True)
class SitemapResult:
    kind: str
    urls: list[str]


def _host_allowed(host: str | None, allowed_host: str) -> bool:
    if not host:
        return False
    actual = host.lower().removeprefix("www.")
    allowed = allowed_host.lower().removeprefix("www.")
    return actual == allowed or actual.endswith(f".{allowed}")


def parse_sitemap(
    content: str | bytes,
    *,
    allowed_host: str,
    max_urls: int = 5_000,
    max_bytes: int = 5_000_000,
) -> SitemapResult:
    raw = content.encode() if isinstance(content, str) else content
    if len(raw) > max_bytes:
        raise ValueError("Sitemap exceeds size limit")
    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError as error:
        raise ValueError("Invalid sitemap XML") from error

    root_name = root.tag.rsplit("}", 1)[-1]
    if root_name not in {"urlset", "sitemapindex"}:
        raise ValueError("Unsupported sitemap root element")
    urls = []
    seen = set()
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] != "loc" or not node.text:
            continue
        value = node.text.strip()
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"}:
            continue
        if not _host_allowed(parsed.hostname, allowed_host) or value in seen:
            continue
        seen.add(value)
        urls.append(value)
        if len(urls) >= max(1, min(max_urls, 50_000)):
            break
    return SitemapResult(kind="index" if root_name == "sitemapindex" else "urlset", urls=urls)
