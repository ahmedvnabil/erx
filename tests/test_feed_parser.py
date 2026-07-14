from egypt_research_mcp.feeds import parse_feed


RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>مصدر تجريبي</title>
    <item>
      <title>تقرير عن حرية الصحافة</title>
      <link>https://example.org/reports/1?utm_source=rss</link>
      <description><![CDATA[<p>ملخص <strong>التقرير</strong>.</p>]]></description>
      <pubDate>Tue, 14 Jul 2026 09:30:00 +0000</pubDate>
      <guid>report-1</guid>
    </item>
    <item>
      <title>بدون رابط</title>
      <description>يجب تجاهله</description>
    </item>
  </channel>
</rss>
"""


def test_parse_feed_returns_clean_valid_entries() -> None:
    entries = parse_feed(RSS, source_slug="test-source")

    assert len(entries) == 1
    assert entries[0].external_id == "test-source:report-1"
    assert entries[0].canonical_url == "https://example.org/reports/1"
    assert entries[0].excerpt == "ملخص التقرير ."
    assert entries[0].published_at.isoformat() == "2026-07-14T09:30:00+00:00"

