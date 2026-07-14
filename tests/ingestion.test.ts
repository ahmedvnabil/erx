import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ApiIngestor, FeedIngestor, HtmlIngestor, SitemapIngestor } from "../src/ingestion.js";
import { ResearchStore } from "../src/store.js";

describe("SitemapIngestor", () => {
  it("archives HTML and PDF while respecting robots", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-ingest-")), "research.db"));
    store.initialize();
    store.upsertSource({ slug: "sitemap-source", name: "مصدر خريطة الموقع", url: "https://example.org", sitemapUrl: "https://example.org/sitemap.xml", sourceType: "legal", ownershipType: "government", language: "ar" });
    const responses: Record<string, Response> = {
      "/robots.txt": new Response("User-agent: *\nDisallow: /blocked/", { headers: { "content-type": "text/plain" } }),
      "/sitemap.xml": new Response(`<urlset><url><loc>https://example.org/article/1</loc></url><url><loc>https://example.org/files/law.pdf</loc></url><url><loc>https://example.org/blocked/2</loc></url></urlset>`, { headers: { "content-type": "application/xml" } }),
      "/article/1": new Response(`<article><h1>قرار قانوني جديد</h1><p>${"تفاصيل القرار القانوني ".repeat(15)}</p></article>`, { headers: { "content-type": "text/html" } }),
      "/files/law.pdf": new Response(Buffer.from("%PDF-fake"), { headers: { "content-type": "application/pdf" } })
    };
    const fetcher = (async (input: string | URL | Request) => responses[new URL(input instanceof Request ? input.url : input).pathname] ?? new Response("missing", { status: 404 })) as typeof fetch;
    const report = await new SitemapIngestor(store, { fetcher, sleeper: async () => {}, pdfExtractor: () => ({ text: "نص القانون المستخرج من ملف PDF", pageCount: 3, ocrUsed: true, extractor: "tesseract" }) }).ingestSource("sitemap-source");
    expect(report).toEqual(expect.objectContaining({ status: "success", itemsFound: 2, itemsSaved: 2 }));
    expect(store.search("قرار قانوني")).toHaveLength(1);
    expect(store.search("نص القانون")).toHaveLength(1);
    store.close();
  });

  it("archives configured feeds and reports unconfigured sources", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-feed-")), "research.db")); store.initialize();
    store.upsertSource({ slug: "feed-source", name: "مصدر تغذية", url: "https://example.org", feedUrl: "https://example.org/feed", sourceType: "news", ownershipType: "private", language: "ar" });
    store.upsertSource({ slug: "empty-source", name: "مصدر بلا تغذية", url: "https://empty.example.org", sourceType: "news", ownershipType: "private", language: "ar" });
    const rss = `<rss><channel><item><title>خبر اقتصادي موثق</title><link>https://example.org/1</link><description>تفاصيل الخبر الاقتصادي</description><guid>1</guid></item></channel></rss>`;
    const fetcher = (async () => new Response(rss, { headers: { "content-type": "application/rss+xml" } })) as typeof fetch;
    expect(await new FeedIngestor(store, { fetcher }).ingestSource("feed-source")).toEqual(expect.objectContaining({ status: "success", itemsSaved: 1 }));
    expect(await new FeedIngestor(store, { fetcher }).ingestSource("empty-source")).toEqual(expect.objectContaining({ status: "skipped", errorCode: "no_feed" }));
    store.close();
  });

  it("reports source-side access blocks separately from parser failures", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-feed-blocked-")), "research.db")); store.initialize();
    store.upsertSource({ slug: "blocked-source", name: "مصدر يحجب الخادم", url: "https://example.org", feedUrl: "https://example.org/feed", sourceType: "news", ownershipType: "private", language: "ar" });
    const fetcher = (async () => new Response("blocked", { status: 403 })) as typeof fetch;
    const report = await new FeedIngestor(store, { fetcher }).ingestSource("blocked-source");
    expect(report).toEqual(expect.objectContaining({ status: "failed", errorCode: "source_access_blocked" }));
    expect(store.listCrawlRuns("blocked-source", 1)[0]).toEqual(expect.objectContaining({ error_code: "source_access_blocked" }));
    store.close();
  });

  it("rejects feed items that leave the configured source host", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-feed-host-")), "research.db")); store.initialize();
    store.upsertSource({ slug: "safe-source", name: "مصدر آمن", url: "https://example.org", feedUrl: "https://example.org/feed", sourceType: "news", ownershipType: "private", language: "ar" });
    const rss = `<rss><channel><item><title>خبر داخل المصدر</title><link>https://news.example.org/1</link><guid>1</guid></item><item><title>رابط خارجي</title><link>https://attacker.invalid/2</link><guid>2</guid></item></channel></rss>`;
    const fetcher = (async () => new Response(rss, { headers: { "content-type": "application/rss+xml" } })) as typeof fetch;
    const report = await new FeedIngestor(store, { fetcher }).ingestSource("safe-source");
    expect(report).toEqual(expect.objectContaining({ status: "success", itemsFound: 1, itemsSaved: 1 }));
    expect(store.search("رابط خارجي")).toHaveLength(0);
    store.close();
  });

  it("discovers and archives configured HTML article links while respecting robots", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-html-")), "research.db")); store.initialize();
    store.upsertSource({ slug: "html-source", name: "مصدر HTML", url: "https://example.org", sourceType: "official", ownershipType: "government", language: "ar", collectionMethod: "html" });
    const responses: Record<string, Response> = {
      "/robots.txt": new Response("User-agent: *\nDisallow: /news/2"),
      "/news": new Response(`<a href="/news/1">one</a><a href="/news/2">blocked</a><a href="https://outside.invalid/news/3">outside</a>`, { headers: { "content-type": "text/html" } }),
      "/news/1": new Response(`<h1 class="headline">قرار حكومي موثق</h1><div class="story"><p>${"تفاصيل القرار الحكومي ".repeat(10)}</p></div>`, { headers: { "content-type": "text/html" } })
    };
    const fetcher = (async (input: string | URL | Request) => responses[new URL(input instanceof Request ? input.url : input).pathname] ?? new Response("missing", { status: 404 })) as typeof fetch;
    const report = await new HtmlIngestor(store, { fetcher, sleeper: async () => {} }).ingestSource("html-source", { kind: "html", listingUrl: "https://example.org/news", articlePathPattern: "^/news/\\d+$", titleSelector: ".headline", contentSelector: ".story" }, 10);
    expect(report).toEqual(expect.objectContaining({ status: "success", itemsFound: 1, itemsSaved: 1 }));
    expect(store.search("قرار حكومي")).toHaveLength(1);
    store.close();
  });

  it("normalizes official JSON API records", async () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-api-")), "research.db")); store.initialize();
    store.upsertSource({ slug: "api-source", name: "مصدر API", url: "https://example.org", sourceType: "statistics", ownershipType: "government", language: "ar", collectionMethod: "api" });
    const payload = { data: [{ id: 42, title: "التضخم السنوي", brief: "بيان إحصائي", content: `<p>${"تفاصيل الرقم القياسي ".repeat(8)}</p>`, publishDate: "2026-07-13T00:00:00" }] };
    const fetcher = (async () => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } })) as typeof fetch;
    const report = await new ApiIngestor(store, { fetcher }).ingestSource("api-source", { kind: "api", endpointUrl: "https://example.org:8080/api/news", adapter: "capmas_news", canonicalUrlBase: "https://example.org/media/news" });
    expect(report).toEqual(expect.objectContaining({ status: "success", itemsFound: 1, itemsSaved: 1 }));
    expect(store.search("التضخم")[0]).toEqual(expect.objectContaining({ publishedAt: "2026-07-13T00:00:00.000Z", documentType: "statistical_release" }));
    store.close();
  });
});
