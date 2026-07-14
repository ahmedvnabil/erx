import { describe, expect, it } from "vitest";

import { classifyDocument, expandArabicSearchToken, isNonResearchContent, normalizeArabic, tokenizeQuery } from "../src/text.js";

describe("Arabic text helpers", () => {
  it("normalizes Arabic variants and removes diacritics", () => {
    expect(normalizeArabic("إِنَّ آمالَ مصرَ ـ كبيرةٌ")).toBe("ان امال مصر كبيره");
  });

  it("keeps useful query terms and removes duplicates", () => {
    expect(tokenizeQuery("وزارة العدل في مصر والعدل")).toEqual(["وزاره", "العدل", "مصر"]);
  });

  it("expands Arabic articles and masculine plural case endings", () => {
    expect(expandArabicSearchToken("اللاجئون")).toEqual(expect.arrayContaining([
      "اللاجيون", "اللاجيين", "لاجيون", "لاجيين"
    ]));
    expect(expandArabicSearchToken("لاجئين")).toEqual(expect.arrayContaining(["لاجيين", "اللاجيين", "لاجيون", "اللاجيون"]));
    expect(expandArabicSearchToken("باللاجئين")).toEqual(expect.arrayContaining(["باللاجيين", "اللاجيين", "لاجيين"]));
  });

  it("classifies legal and human-rights material", () => {
    expect(classifyDocument("قرار المحكمة الدستورية بشأن القانون")).toContain("القضاء والمحاكمات");
    expect(classifyDocument("تقرير عن السجن ومكان الاحتجاز")).toContain("أوضاع السجون");
  });

  it("flags sports and entertainment noise without hiding public-affairs coverage", () => {
    expect(isNonResearchContent("مبابي ضد لامين والتشكيل الرسمي لمباراة كأس العالم")).toBe(true);
    expect(isNonResearchContent("وزارة الشباب والرياضة تناقش قانون الرياضة المصري")).toBe(false);
    expect(isNonResearchContent("بيان عن قانون العمل والعدالة الاجتماعية")).toBe(false);
  });
});
