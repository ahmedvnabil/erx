import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { extractPdf, type PdfRunner } from "../src/pdf.js";

describe("PDF extraction", () => {
  it("uses the text layer before OCR", () => {
    const calls: string[] = [];
    const runner: PdfRunner = (command) => { calls.push(command); return { status: 0, stdout: Buffer.from("نص قانوني قابل للبحث ".repeat(20)), stderr: Buffer.alloc(0) }; };
    expect(extractPdf(Buffer.from("%PDF-1.7 fake"), { runner, minTextChars: 100 })).toEqual(expect.objectContaining({ ocrUsed: false, extractor: "pdftotext" }));
    expect(calls).toEqual(["pdftotext"]);
  });

  it("falls back to bounded Arabic OCR", () => {
    const runner: PdfRunner = (command, args) => {
      if (command === "pdftotext") return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      if (command === "pdfinfo") return { status: 0, stdout: Buffer.from("Pages: 1\n"), stderr: Buffer.alloc(0) };
      if (command === "pdftoppm") { writeFileSync(`${args.at(-1)}-1.png`, "fake"); return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
      return { status: 0, stdout: Buffer.from("قرار جمهوري موثق ".repeat(20)), stderr: Buffer.alloc(0) };
    };
    expect(extractPdf(Buffer.from("%PDF-1.7 scanned"), { runner, minTextChars: 100 })).toEqual(expect.objectContaining({ ocrUsed: true, pageCount: 1, extractor: "tesseract" }));
  });

  it("rejects invalid and oversized input", () => {
    expect(() => extractPdf(Buffer.from("not a pdf"))).toThrow("valid PDF");
    expect(() => extractPdf(Buffer.from(`%PDF-${"x".repeat(100)}`), { maxBytes: 50 })).toThrow("size limit");
  });
});
