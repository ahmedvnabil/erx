import subprocess
from pathlib import Path

import httpx
import pytest

from egypt_research_mcp.collection import SitemapIngestor
from egypt_research_mcp.collectors.robots import robots_allows
from egypt_research_mcp.collectors.sitemap import parse_sitemap
from egypt_research_mcp.models import SourceInput
from egypt_research_mcp.pdf import PdfExtraction
from egypt_research_mcp.pdf import extract_pdf
from egypt_research_mcp.store import ResearchStore


def test_parse_sitemap_filters_external_and_duplicate_urls() -> None:
    xml = """
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.org/news/1</loc></url>
      <url><loc>https://example.org/news/1</loc></url>
      <url><loc>https://cdn.example.org/files/law.pdf</loc></url>
      <url><loc>https://attacker.test/escape</loc></url>
      <url><loc>javascript:alert(1)</loc></url>
    </urlset>
    """

    result = parse_sitemap(xml, allowed_host="example.org", max_urls=10)

    assert result.kind == "urlset"
    assert result.urls == [
        "https://example.org/news/1",
        "https://cdn.example.org/files/law.pdf",
    ]


def test_parse_sitemap_index_returns_only_allowed_nested_sitemaps() -> None:
    xml = """
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.org/news-sitemap.xml</loc></sitemap>
      <sitemap><loc>https://outside.test/sitemap.xml</loc></sitemap>
    </sitemapindex>
    """

    result = parse_sitemap(xml, allowed_host="example.org", max_urls=10)

    assert result.kind == "index"
    assert result.urls == ["https://example.org/news-sitemap.xml"]


def test_robots_policy_honors_specific_research_bot_rules() -> None:
    robots = """
    User-agent: *
    Disallow: /private/
    User-agent: EgyptResearchMCP
    Allow: /public/
    Disallow: /drafts/
    """

    assert robots_allows(robots, "https://example.org/public/law", "EgyptResearchMCP")
    assert not robots_allows(
        robots, "https://example.org/drafts/law", "EgyptResearchMCP"
    )


def test_pdf_extraction_uses_text_layer_before_ocr() -> None:
    calls = []

    def runner(args, **kwargs):
        calls.append(args[0])
        return subprocess.CompletedProcess(
            args, 0, stdout=("نص قانوني قابل للبحث " * 20).encode(), stderr=b""
        )

    result = extract_pdf(b"%PDF-1.7 fake", runner=runner, min_text_chars=100)

    assert result.ocr_used is False
    assert "نص قانوني" in result.text
    assert calls == ["pdftotext"]


def test_pdf_extraction_falls_back_to_bounded_arabic_ocr() -> None:
    def runner(args, **kwargs):
        command = args[0]
        if command == "pdftotext":
            return subprocess.CompletedProcess(args, 0, stdout=b"", stderr=b"")
        if command == "pdfinfo":
            return subprocess.CompletedProcess(args, 0, stdout=b"Pages: 1\n", stderr=b"")
        if command == "pdftoppm":
            Path(f"{args[-1]}-1.png").write_bytes(b"fake-png")
            return subprocess.CompletedProcess(args, 0, stdout=b"", stderr=b"")
        if command == "tesseract":
            return subprocess.CompletedProcess(
                args, 0, stdout=("قرار جمهوري موثق " * 20).encode(), stderr=b""
            )
        raise AssertionError(command)

    result = extract_pdf(b"%PDF-1.7 scanned", runner=runner, min_text_chars=100)

    assert result.ocr_used is True
    assert result.page_count == 1
    assert "قرار جمهوري" in result.text


def test_pdf_extraction_rejects_invalid_or_oversized_files() -> None:
    with pytest.raises(ValueError, match="valid PDF"):
        extract_pdf(b"not-a-pdf")
    with pytest.raises(ValueError, match="size limit"):
        extract_pdf(b"%PDF-" + b"x" * 100, max_bytes=50)


def test_sitemap_ingestor_archives_html_and_pdf_while_honoring_robots(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="sitemap-source",
            name="مصدر خريطة الموقع",
            url="https://example.org",
            sitemap_url="https://example.org/sitemap.xml",
            source_type="legal",
            ownership_type="government",
        )
    )
    sitemap = """
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.org/article/1</loc></url>
      <url><loc>https://example.org/files/law.pdf</loc></url>
      <url><loc>https://example.org/blocked/2</loc></url>
    </urlset>
    """
    article = "<article><h1>قرار قانوني جديد</h1><p>" + ("تفاصيل القرار القانوني " * 15) + "</p></article>"

    def handler(request: httpx.Request) -> httpx.Response:
        responses = {
            "/robots.txt": httpx.Response(
                200, text="User-agent: *\nDisallow: /blocked/"
            ),
            "/sitemap.xml": httpx.Response(200, text=sitemap),
            "/article/1": httpx.Response(
                200, text=article, headers={"content-type": "text/html"}
            ),
            "/files/law.pdf": httpx.Response(
                200,
                content=b"%PDF-fake",
                headers={"content-type": "application/pdf"},
            ),
        }
        return responses[request.url.path]

    pdf_result = PdfExtraction(
        text="نص القانون المستخرج من ملف PDF", page_count=3, ocr_used=True, extractor="tesseract"
    )
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        report = SitemapIngestor(
            store,
            client=client,
            sleeper=lambda seconds: None,
            pdf_extractor=lambda content: pdf_result,
        ).ingest_source("sitemap-source")

    assert report.status == "success"
    assert report.items_found == 2
    assert report.items_saved == 2
    assert len(store.search("قرار قانوني")) == 1
    assert len(store.search("نص القانون")) == 1
    with store.connect() as connection:
        asset = connection.execute("SELECT * FROM document_assets").fetchone()
    assert asset["page_count"] == 3
    assert asset["ocr_used"] == 1
