from egypt_research_mcp.catalog import INITIAL_SOURCES


def test_catalog_covers_research_source_families() -> None:
    source_types = {source.source_type for source in INITIAL_SOURCES}

    assert len(INITIAL_SOURCES) >= 25
    assert {
        "official",
        "legal",
        "news",
        "human_rights",
        "statistics",
        "academic",
    } <= source_types
    assert len({source.slug for source in INITIAL_SOURCES}) == len(INITIAL_SOURCES)


def test_catalog_only_enables_verified_direct_feeds() -> None:
    feeds = [source.feed_url for source in INITIAL_SOURCES if source.feed_url]

    assert "https://eipr.org/rss.xml" in feeds
    assert "https://www.almasryalyoum.com/rss/rssfeeds" in feeds
    assert all("news.google.com" not in feed for feed in feeds)
