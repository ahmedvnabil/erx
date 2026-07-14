import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface PdfRunResult { status: number | null; stdout: Buffer; stderr: Buffer; error?: Error }
export type PdfRunner = (command: string, args: string[], input?: Buffer) => PdfRunResult;
export interface PdfExtraction { text: string; pageCount: number | null; ocrUsed: boolean; extractor: "pdftotext" | "tesseract" }

const defaultRunner: PdfRunner = (command, args, input) => {
  const result = spawnSync(command, args, { input, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  return { status: result.status, stdout: Buffer.from(result.stdout ?? []), stderr: Buffer.from(result.stderr ?? []), ...(result.error ? { error: result.error } : {}) };
};

function execute(runner: PdfRunner, command: string, args: string[], input?: Buffer): Buffer {
  const result = runner(command, args, input);
  if (result.error || result.status !== 0) throw new Error(`PDF tool failed: ${command}: ${result.error?.message ?? result.stderr.toString("utf8").slice(0, 500)}`);
  return result.stdout;
}

export function extractPdf(content: Buffer, options: { runner?: PdfRunner; maxBytes?: number; maxPages?: number; minTextChars?: number; ocrLanguage?: string } = {}): PdfExtraction {
  if (!content.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Content is not a valid PDF");
  if (content.length > (options.maxBytes ?? 20_000_000)) throw new Error("PDF exceeds size limit");
  const runner = options.runner ?? defaultRunner;
  const direct = execute(runner, "pdftotext", ["-layout", "-", "-"], content).toString("utf8").trim();
  if (direct.length >= (options.minTextChars ?? 200)) return { text: direct, pageCount: null, ocrUsed: false, extractor: "pdftotext" };
  const directory = mkdtempSync(join(tmpdir(), "egypt-research-pdf-"));
  try {
    const pdfPath = join(directory, "input.pdf");
    writeFileSync(pdfPath, content);
    const info = execute(runner, "pdfinfo", [pdfPath]).toString("utf8");
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
    if (pageCount < 1 || pageCount > (options.maxPages ?? 200)) throw new Error("PDF page count is outside allowed range");
    const prefix = join(directory, "page");
    execute(runner, "pdftoppm", ["-png", "-r", "200", "-f", "1", "-l", String(pageCount), pdfPath, prefix]);
    const pages = readdirSync(directory).filter((name) => /^page-\d+\.png$/.test(name)).sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
    const text = pages.map((page) => execute(runner, "tesseract", [join(directory, page), "stdout", "-l", options.ocrLanguage ?? "ara+eng", "--psm", "6"], readFileSync(join(directory, page))).toString("utf8").trim()).filter(Boolean).join("\n\n");
    return { text, pageCount, ocrUsed: true, extractor: "tesseract" };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
