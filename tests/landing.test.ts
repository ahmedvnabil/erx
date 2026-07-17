import { describe, expect, it } from "vitest";

import { landingContent, type LandingModel } from "../src/landing.js";

const model = (language: "ar" | "en"): LandingModel => ({
  language,
  documents: 12,
  sources: 4,
  healthy: 3,
  tools: 21,
  datasets: [{ name: "مصدر <موثق> & بحث", provider: 'Provider "A" — \'B\'' }],
  remote: "https://example.test/mcp?mode=a&safe=true",
  install: "npx example"
});

describe("landing content", () => {
  it("escapes dynamic Arabic and English dataset labels and connection values", () => {
    const arabic = landingContent(model("ar"));
    const english = landingContent(model("en"));

    expect(arabic).toContain("مصدر &lt;موثق&gt; &amp; بحث");
    expect(english).toContain("Provider &quot;A&quot; - &#39;B&#39;");
    expect(arabic).toContain("mode=a&amp;safe=true");
    expect(arabic).not.toContain("<موثق>");
    expect(english).not.toMatch(/[—–]/);
  });

  it("presents the ERX brand promise and evidence workflow in both languages", () => {
    const arabic = landingContent(model("ar"));
    const english = landingContent(model("en"));

    expect(arabic).toContain("كل معلومة لها مصدر");
    expect(arabic).toContain("السؤال");
    expect(arabic).toContain("الأدلة");
    expect(arabic).toContain("الاستشهاد");
    expect(english).toContain("Every claim needs a source");
    expect(english).toContain("Question");
    expect(english).toContain("Evidence");
    expect(english).toContain("Citation");
  });
});
