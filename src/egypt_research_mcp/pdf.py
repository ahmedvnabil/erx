from __future__ import annotations

import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


Runner = Callable[..., subprocess.CompletedProcess]


@dataclass(frozen=True)
class PdfExtraction:
    text: str
    page_count: int | None
    ocr_used: bool
    extractor: str


def _execute(runner: Runner, args: list[str], **kwargs) -> subprocess.CompletedProcess:
    try:
        result = runner(args, capture_output=True, timeout=60, **kwargs)
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(f"PDF tool failed: {args[0]}") from error
    if result.returncode != 0:
        message = result.stderr.decode(errors="replace")[:500]
        raise RuntimeError(f"PDF tool failed: {args[0]}: {message}")
    return result


def extract_pdf(
    content: bytes,
    *,
    runner: Runner = subprocess.run,
    max_bytes: int = 20_000_000,
    max_pages: int = 200,
    min_text_chars: int = 200,
    ocr_language: str = "ara+eng",
) -> PdfExtraction:
    if not content.startswith(b"%PDF-"):
        raise ValueError("Content is not a valid PDF")
    if len(content) > max_bytes:
        raise ValueError("PDF exceeds size limit")

    direct = _execute(
        runner, ["pdftotext", "-layout", "-", "-"], input=content
    ).stdout.decode(errors="replace").strip()
    if len(direct) >= min_text_chars:
        return PdfExtraction(direct, None, False, "pdftotext")

    with tempfile.TemporaryDirectory(prefix="egypt-research-pdf-") as directory:
        pdf_path = Path(directory) / "input.pdf"
        pdf_path.write_bytes(content)
        info = _execute(runner, ["pdfinfo", str(pdf_path)]).stdout.decode(
            errors="replace"
        )
        match = re.search(r"^Pages:\s+(\d+)", info, flags=re.MULTILINE)
        page_count = int(match.group(1)) if match else 0
        if page_count < 1 or page_count > max_pages:
            raise ValueError("PDF page count is outside allowed range")
        prefix = Path(directory) / "page"
        _execute(
            runner,
            [
                "pdftoppm",
                "-png",
                "-r",
                "200",
                "-f",
                "1",
                "-l",
                str(page_count),
                str(pdf_path),
                str(prefix),
            ],
        )
        pages = []
        for image in sorted(Path(directory).glob("page-*.png")):
            result = _execute(
                runner,
                ["tesseract", str(image), "stdout", "-l", ocr_language, "--psm", "6"],
            )
            pages.append(result.stdout.decode(errors="replace").strip())
        return PdfExtraction("\n\n".join(filter(None, pages)), page_count, True, "tesseract")
