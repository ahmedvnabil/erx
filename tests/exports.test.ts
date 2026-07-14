import { describe, expect, it } from "vitest";
import { exportResults } from "../src/exports.js";
import type { SearchResult } from "../src/types.js";

const result: SearchResult = { documentId: 7, externalId: "x", sourceSlug: "source", sourceName: "مصدر", sourceType: "news", title: "عنوان, موثق", excerpt: "ملخص", canonicalUrl: "https://example.org/7", publishedAt: "2026-07-14T00:00:00.000Z", eventAt: null, archivedAt: "2026-07-15T00:00:00.000Z", documentType: "article", topics: [], citation: { title: "عنوان, موثق", sourceName: "مصدر", url: "https://example.org/7", publishedAt: "2026-07-14T00:00:00.000Z", archivedAt: "2026-07-15T00:00:00.000Z" } };

describe("reference exports", () => {
  it.each(["csv", "jsonl", "bibtex", "ris"] as const)("renders %s", (format) => {
    const value = exportResults([result], format);
    expect(value).toContain(format === "bibtex" ? "@misc" : format === "ris" ? "TY  - ELEC" : "عنوان");
    expect(value).toContain("https://example.org/7");
  });
});
