from __future__ import annotations

import csv
import io
import json
import re

from .models import SearchResult


FORMATS = {"csv", "jsonl", "bibtex", "ris"}


def _year(result: SearchResult) -> str:
    return str(result.published_at.year) if result.published_at else ""


def export_results(results: list[SearchResult], format_name: str) -> str:
    if format_name not in FORMATS:
        raise ValueError(f"Unsupported export format: {format_name}")
    if format_name == "jsonl":
        return "\n".join(
            json.dumps(result.model_dump(mode="json"), ensure_ascii=False)
            for result in results
        )
    if format_name == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["title", "source", "source_type", "published_at", "url", "topics"]
        )
        for result in results:
            writer.writerow(
                [
                    result.title,
                    result.source_name,
                    result.source_type,
                    result.published_at.isoformat() if result.published_at else "",
                    result.canonical_url,
                    "; ".join(result.topics),
                ]
            )
        return output.getvalue()
    if format_name == "bibtex":
        records = []
        for result in results:
            key = re.sub(r"[^a-zA-Z0-9]", "", result.source_slug) or "egypt"
            records.append(
                "\n".join(
                    [
                        f"@misc{{{key}{result.document_id},",
                        f"  title = {{{result.title}}},",
                        f"  author = {{{result.source_name}}},",
                        f"  year = {{{_year(result)}}},",
                        f"  url = {{{result.canonical_url}}}",
                        "}",
                    ]
                )
            )
        return "\n\n".join(records)
    records = []
    for result in results:
        lines = [
            "TY  - ELEC",
            f"TI  - {result.title}",
            f"AU  - {result.source_name}",
            f"PY  - {_year(result)}",
            f"UR  - {result.canonical_url}",
            "ER  -",
        ]
        records.append("\n".join(lines))
    return "\n\n".join(records)
