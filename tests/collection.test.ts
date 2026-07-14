import { describe, expect, it } from "vitest";

import { extractArticle, parseFeed, parseSitemap, readResponseBuffer, robotsAllows } from "../src/collection.js";

describe("collection boundaries", () => {
  it("parses RSS, canonicalizes tracking URLs, and strips markup", () => {
    const xml = `<rss><channel><item><title>تقرير عن حرية الصحافة</title><link>https://example.org/reports/1?utm_source=rss</link><description><![CDATA[<p>ملخص <strong>التقرير</strong>.</p>]]></description><pubDate>Tue, 14 Jul 2026 09:30:00 +0000</pubDate><guid>report-1</guid></item><item><title>بدون رابط</title></item></channel></rss>`;
    expect(parseFeed(xml, "test-source")).toEqual([expect.objectContaining({
      externalId: "test-source:report-1", canonicalUrl: "https://example.org/reports/1",
      excerpt: "ملخص التقرير .", publishedAt: "2026-07-14T09:30:00.000Z"
    })]);
  });

  it("filters unsafe and duplicate sitemap URLs", () => {
    const xml = `<urlset><url><loc>https://example.org/news/1</loc></url><url><loc>https://example.org/news/1</loc></url><url><loc>https://cdn.example.org/law.pdf</loc></url><url><loc>https://attacker.test/x</loc></url><url><loc>javascript:alert(1)</loc></url></urlset>`;
    expect(parseSitemap(xml, "example.org", 10)).toEqual({ kind: "urlset", urls: ["https://example.org/news/1", "https://cdn.example.org/law.pdf"] });
  });

  it("honors specific robots rules", () => {
    const robots = `User-agent: *\nDisallow: /private/\nUser-agent: EgyptResearchMCP\nAllow: /public/\nDisallow: /drafts/`;
    expect(robotsAllows(robots, "https://example.org/public/law", "EgyptResearchMCP")).toBe(true);
    expect(robotsAllows(robots, "https://example.org/drafts/law", "EgyptResearchMCP")).toBe(false);
  });

  it("extracts article content without navigation chrome", () => {
    const html = `<html><head><title>عنوان الصفحة</title></head><body><nav>الرئيسية الأخبار</nav><article><h1>قرار اقتصادي جديد</h1><p>أعلنت الجهة الرسمية تفاصيل القرار الاقتصادي الجديد اليوم.</p><p>ويتضمن القرار إجراءات موثقة وقابلة للمراجعة.</p></article><footer>جميع الحقوق محفوظة</footer></body></html>`;
    const article = extractArticle(html, "https://example.org/news/1");
    expect(article.title).toBe("قرار اقتصادي جديد");
    expect(article.content).toContain("تفاصيل القرار");
    expect(article.content).not.toContain("الرئيسية الأخبار");
  });

  it("extracts articles with source-specific selectors", () => {
    const article = extractArticle(`<html><body><h1 class="headline">حكم دستوري مهم</h1><div class="legal-body"><p>${"نص الحكم القانوني ".repeat(8)}</p></div></body></html>`, "https://example.org/ruling/1", { titleSelector: ".headline", contentSelector: ".legal-body" });
    expect(article.title).toBe("حكم دستوري مهم");
    expect(article.content).toContain("نص الحكم القانوني");
  });

  it("does not lose configured content inside malformed site chrome", () => {
    const html = `<html><body><header>رأس الصفحة<div><h1>خبر برلماني</h1><div class="story"><p>${"تفاصيل الجلسة البرلمانية ".repeat(8)}</p></div></div></body></html>`;
    const article = extractArticle(html, "https://example.org/news/1", { titleSelector: "h1", contentSelector: ".story" });
    expect(article.title).toBe("خبر برلماني");
    expect(article.content).toContain("تفاصيل الجلسة البرلمانية");
  });

  it("stops reading responses that exceed the byte limit without a content-length header", async () => {
    await expect(readResponseBuffer(new Response("oversized"), 4)).rejects.toThrow("Response exceeds size limit");
  });
});
