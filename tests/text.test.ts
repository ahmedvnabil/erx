import { describe, expect, it } from "vitest";

import { classifyDocument, expandArabicSearchToken, isNonResearchContent, isOutOfScopeContent, normalizeArabic, tokenizeQuery } from "../src/text.js";

describe("Arabic text helpers", () => {
  it("normalizes Arabic variants and removes diacritics", () => {
    expect(normalizeArabic("إِنَّ آمالَ مصرَ ـ كبيرةٌ")).toBe("ان امال مصر كبيره");
  });

  it("keeps useful query terms and removes duplicates", () => {
    expect(tokenizeQuery("وزارة العدل في مصر والعدل")).toEqual(["وزاره", "العدل", "مصر"]);
    expect(tokenizeQuery("ما هي أسعار السلع التي تم إعلانها هذا الشهر")).toEqual(["اسعار", "السلع", "اعلانها", "الشهر"]);
  });

  it("expands Arabic articles and masculine plural case endings", () => {
    expect(expandArabicSearchToken("اللاجئون")).toEqual(expect.arrayContaining([
      "اللاجيون", "اللاجيين", "لاجيون", "لاجيين"
    ]));
    expect(expandArabicSearchToken("لاجئين")).toEqual(expect.arrayContaining(["لاجيين", "اللاجيين", "لاجيون", "اللاجيون"]));
    expect(expandArabicSearchToken("باللاجئين")).toEqual(expect.arrayContaining(["باللاجيين", "اللاجيين", "لاجيين"]));
    expect(expandArabicSearchToken("قضية")).toContain("قضايا");
    expect(expandArabicSearchToken("قضايا")).toContain("قضيه");
  });

  it("classifies legal and human-rights material", () => {
    expect(classifyDocument("قرار المحكمة الدستورية بشأن القانون")).toContain("القضاء والمحاكمات");
    expect(classifyDocument("تقرير عن السجن ومكان الاحتجاز")).toContain("أوضاع السجون");
  });

  it("flags sports and entertainment noise without hiding public-affairs coverage", () => {
    expect(isNonResearchContent("مبابي ضد لامين والتشكيل الرسمي لمباراة كأس العالم")).toBe(true);
    expect(isNonResearchContent("إنهاء الأهلي عقد تريزيجيه وحفل عمرو دياب")).toBe(true);
    expect(isNonResearchContent("وزارة الشباب والرياضة تناقش قانون الرياضة المصري")).toBe(false);
    expect(isNonResearchContent("بيان عن قانون العمل والعدالة الاجتماعية")).toBe(false);
  });

  it("flags foreign-only news but keeps Egypt-linked international affairs", () => {
    expect(isOutOfScopeContent("ترامب عن غزو العراق وانفجارات في بغداد")).toBe(true);
    expect(isOutOfScopeContent("الرئيس السيسي يبحث تداعيات الحرب على مصر")).toBe(false);
  });

  it("classifies English Egypt research using the shared Arabic-first taxonomy", () => {
    expect(classifyDocument("Egyptian journalist detained pending trial for online reporting")).toEqual(expect.arrayContaining([
      "حرية التعبير والصحافة", "القضاء والمحاكمات", "الحقوق الرقمية"
    ]));
    expect(classifyDocument("Inflation, food prices and wages in Egypt")).toContain("الاقتصاد والعدالة الاجتماعية");
    expect(classifyDocument("Protection of refugees and asylum seekers in Egypt")).toContain("حقوق اللاجئين والمهاجرين");
  });

  it("excludes English regional news when Egypt is absent", () => {
    expect(isOutOfScopeContent("Sudan conflict: civilians detained in Khartoum")).toBe(true);
    expect(isOutOfScopeContent("Egypt mediates talks concerning the Sudan conflict")).toBe(false);
  });
});
