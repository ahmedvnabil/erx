from datetime import UTC, datetime
from hashlib import sha256
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
from bs4 import BeautifulSoup

from .models import FeedEntry


_TRACKING_PARAMETERS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
}


def canonicalize_url(value: str) -> str:
    parts = urlsplit(value.strip())
    query = urlencode(
        [(key, val) for key, val in parse_qsl(parts.query) if key not in _TRACKING_PARAMETERS]
    )
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, query, ""))


def html_to_text(value: str) -> str:
    return " ".join(BeautifulSoup(value or "", "html.parser").get_text(" ").split())


def parse_feed(payload: str | bytes, source_slug: str) -> list[FeedEntry]:
    parsed = feedparser.parse(payload)
    entries: list[FeedEntry] = []
    for item in parsed.entries:
        title = html_to_text(item.get("title", ""))
        raw_url = item.get("link", "")
        if not title or not raw_url:
            continue
        url = canonicalize_url(raw_url)
        guid = str(item.get("id") or sha256(url.encode()).hexdigest()[:24])
        published = None
        if item.get("published_parsed"):
            published = datetime(*item.published_parsed[:6], tzinfo=UTC)
        content_parts = item.get("content") or []
        content = html_to_text(content_parts[0].get("value", "")) if content_parts else ""
        entries.append(
            FeedEntry(
                external_id=f"{source_slug}:{guid}",
                canonical_url=url,
                title=title,
                excerpt=html_to_text(item.get("summary") or item.get("description") or ""),
                content=content,
                published_at=published,
            )
        )
    return entries

