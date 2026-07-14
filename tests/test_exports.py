from datetime import UTC, datetime

import pytest

from egypt_research_mcp.exports import export_results
from egypt_research_mcp.models import Citation, SearchResult


def result() -> SearchResult:
    published = datetime(2026, 7, 14, tzinfo=UTC)
    citation = Citation(
        title="قانون العمل المصري",
        source_name="الجريدة الرسمية",
        url="https://example.org/law/1",
        published_at=published,
        archived_at=published,
    )
    return SearchResult(
        document_id=1,
        external_id="law-1",
        source_slug="gazette",
        source_name="الجريدة الرسمية",
        source_type="official",
        title=citation.title,
        excerpt="نص قانوني",
        canonical_url=citation.url,
        published_at=published,
        event_at=None,
        archived_at=published,
        document_type="law",
        topics=["العمل"],
        citation=citation,
    )


@pytest.mark.parametrize("format_name", ["csv", "jsonl", "bibtex", "ris"])
def test_export_results_produces_citable_formats(format_name) -> None:
    output = export_results([result()], format_name)

    assert "قانون العمل المصري" in output
    assert "https://example.org/law/1" in output


def test_export_results_rejects_unknown_format() -> None:
    with pytest.raises(ValueError, match="Unsupported export format"):
        export_results([result()], "pdf")
