import { describe, expect, it } from "vitest";

import { classifyDocument, normalizeArabic, tokenizeQuery } from "../src/text.js";

describe("Arabic text helpers", () => {
  it("normalizes Arabic variants and removes diacritics", () => {
    expect(normalizeArabic("إِنَّ آمالَ مصرَ ـ كبيرةٌ")).toBe("ان امال مصر كبيره");
  });

  it("keeps useful query terms and removes duplicates", () => {
    expect(tokenizeQuery("وزارة العدل في مصر والعدل")).toEqual(["وزاره", "العدل", "مصر"]);
  });

  it("classifies legal and human-rights material", () => {
    expect(classifyDocument("قرار المحكمة الدستورية بشأن القانون")).toContain("القضاء والمحاكمات");
    expect(classifyDocument("تقرير عن السجن ومكان الاحتجاز")).toContain("أوضاع السجون");
  });
});
