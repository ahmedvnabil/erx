import { describe, expect, it } from "vitest";

import { auditSource } from "../src/source-audit.js";
import type { SourceRecord } from "../src/types.js";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    slug: "example", name: "Example", url: "https://example.org", sourceType: "news", ownershipType: "private",
    language: "ar", feedUrl: null, sitemapUrl: null, collectionMethod: "catalog", crawlDelaySeconds: 1,
    contentLicense: "unknown", robotsPolicy: "respect", active: true, lastSuccessAt: null, lastErrorAt: null,
    consecutiveFailures: 0, healthStatus: "unknown", lastCrawledAt: null, documentCount: 0, ...overrides
  };
}

describe("source endpoint audit", () => {
  it("validates a WordPress feed by parsing its entries", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/feed/")) return new Response(`<rss><channel><item><title>خبر موثق</title><link>https://example.org/a</link></item></channel></rss>`, { headers: { "content-type": "application/rss+xml" } });
      return new Response(`<html><meta name="generator" content="WordPress"><body>wp-content</body></html>`, { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const report = await auditSource(source({ feedUrl: "https://example.org/feed/", collectionMethod: "rss" }), fetcher);
    expect(report).toEqual(expect.objectContaining({ status: "healthy", websiteType: "wordpress", homepageReachable: true }));
    expect(report.endpoints).toEqual([expect.objectContaining({ kind: "rss", status: "healthy", items: 1 })]);
  });

  it("separates access blocks from invalid redirects", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("sitemap.xml")) return new Response("blocked", { status: 403 });
      if (url.endsWith("feed")) return new Response("moved", { status: 301, headers: { location: "http://example.org/feed/" } });
      return new Response(`<input name="__VIEWSTATE">`, { headers: { "content-type": "text/html", "x-powered-by": "ASP.NET" } });
    }) as typeof fetch;
    const report = await auditSource(source({ feedUrl: "https://example.org/feed", sitemapUrl: "https://example.org/sitemap.xml", collectionMethod: "hybrid" }), fetcher);
    expect(report.websiteType).toBe("aspnet");
    expect(report.status).toBe("blocked");
    expect(report.endpoints.map((endpoint) => endpoint.status)).toEqual(["invalid_redirect", "blocked"]);
  });

  it("marks reachable sources without collection endpoints as catalog only", async () => {
    const fetcher = (async () => new Response("<html><body>custom</body></html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    const report = await auditSource(source(), fetcher);
    expect(report).toEqual(expect.objectContaining({ status: "catalog_only", websiteType: "custom", homepageReachable: true, endpoints: [] }));
  });

  it("audits configured HTML listings by validating article paths", async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/news")) return new Response(`<a href="/news/12">خبر</a><a href="/about">عن الموقع</a>`, { headers: { "content-type": "text/html" } });
      return new Response("<html><body>custom</body></html>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const report = await auditSource(source({ slug: "cabinet-egypt", url: "https://www.cabinet.gov.eg", collectionMethod: "html" }), fetcher, {
      kind: "html", listingUrl: "https://www.cabinet.gov.eg/news", articlePathPattern: "^/news/\\d+$"
    });
    expect(report.status).toBe("healthy");
    expect(report.endpoints).toEqual([expect.objectContaining({ kind: "html", status: "healthy", items: 1 })]);
  });

  it("audits configured APIs by validating non-empty data arrays", async () => {
    const fetcher = (async (input: string | URL | Request) => String(input).includes("/api/")
      ? new Response(JSON.stringify({ data: [{ id: 1 }] }), { headers: { "content-type": "application/json" } })
      : new Response("<html><body>custom</body></html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    const report = await auditSource(source({ slug: "capmas", url: "https://www.capmas.gov.eg", collectionMethod: "api" }), fetcher, {
      kind: "api", endpointUrl: "https://www.capmas.gov.eg:8080/api/news", adapter: "capmas_news", canonicalUrlBase: "https://www.capmas.gov.eg/news"
    });
    expect(report.status).toBe("healthy");
    expect(report.endpoints).toEqual([expect.objectContaining({ kind: "api", status: "healthy", items: 1 })]);
  });
});
