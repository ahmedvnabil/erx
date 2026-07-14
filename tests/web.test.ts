import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWebServer, normalizePublicBaseUrl } from "../src/web.js";
import { ResearchStore } from "../src/store.js";

const open: Array<ReturnType<typeof createWebServer>> = [];
afterEach(async () => { await Promise.all(open.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

async function fixture(rateLimitPerMinute = 120) {
  const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-web-")), "research.db"));
  store.initialize();
  store.upsertSource({ slug: "official-test", name: "المصدر الرسمي التجريبي", url: "https://example.org", sourceType: "official", ownershipType: "government", language: "ar" });
  store.upsertDocument({ externalId: "official-1", sourceSlug: "official-test", canonicalUrl: "https://example.org/decision/1", title: "قرار اقتصادي مصري موثق", excerpt: "تفاصيل موجزة للقرار", content: "النص الكامل للقرار الاقتصادي المصري الموثق.", publishedAt: "2026-07-14T00:00:00.000Z" });
  const server = createWebServer(store, { includeMcp: false, rateLimitPerMinute });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test address");
  return { store, base: `http://127.0.0.1:${address.port}` };
}

describe("web and REST", () => {
  it("accepts only a clean HTTP(S) origin for public metadata", () => {
    expect(normalizePublicBaseUrl("https://erx.example.org/")).toBe("https://erx.example.org");
    expect(() => normalizePublicBaseUrl("javascript:alert(1)")).toThrow("HTTP(S) origin");
    expect(() => normalizePublicBaseUrl("https://erx.example.org/path")).toThrow("HTTP(S) origin");
  });

  it("serves the Arabic product landing, explorer, health, and source-backed REST", async () => {
    const { base } = await fixture();
    const [home, explorer, search, api, health] = await Promise.all([
      fetch(base), fetch(`${base}/explore`), fetch(`${base}/search?q=${encodeURIComponent("قرار اقتصادي")}`),
      fetch(`${base}/api/v1/search?q=${encodeURIComponent("قرار اقتصادي")}&mode=hybrid`), fetch(`${base}/healthz`)
    ]);
    const landing = await home.text();
    expect(landing).toContain("كل معلومة لها مصدر");
    expect(landing).toContain("14 أداة MCP");
    expect(landing).toContain('property="og:title"');
    expect(landing).toContain('application/ld+json');
    expect(await explorer.text()).toContain("ابدأ البحث");
    expect(await search.text()).toContain("قرار اقتصادي مصري موثق");
    const body = await api.json() as { results: Array<{ citation: { url: string } }> };
    expect(body.results[0]?.citation.url).toBe("https://example.org/decision/1");
    expect(await health.json()).toEqual(expect.objectContaining({ status: "ok", documents: 1 }));
  });

  it("serves launch, discovery, brand, and bilingual documentation surfaces", async () => {
    const { base } = await fixture();
    const paths = ["/en", "/docs", "/robots.txt", "/sitemap.xml", "/llms.txt", "/manifest.webmanifest", "/static/brand.svg", "/static/app.js", "/static/social-card.png"];
    const responses = await Promise.all(paths.map((path) => fetch(base + path)));
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(await responses[0]!.text()).toContain("Every claim needs a source");
    expect(await responses[1]!.text()).toContain("search_egypt");
    expect(await responses[2]!.text()).toContain("Sitemap:");
    expect(await responses[3]!.text()).toContain("<urlset");
    expect(await responses[4]!.text()).toContain("## MCP tools");
    expect((await responses[5]!.json() as { name: string }).name).toContain("ERX");
    expect(responses[6]!.headers.get("content-type")).toContain("image/svg+xml");
    expect(await responses[7]!.text()).toContain("clipboard.writeText");
    expect(responses[8]!.headers.get("content-type")).toContain("image/png");
  });

  it("adds security headers and bounded API rate limiting", async () => {
    const { base } = await fixture(2);
    const first = await fetch(`${base}/api/v1/sources`);
    await fetch(`${base}/api/v1/sources`);
    const blocked = await fetch(`${base}/api/v1/sources`);
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    expect(first.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(first.headers.get("x-request-id")).toBeTruthy();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("serves document, catalog, observability, exports, and validation errors", async () => {
    const { base, store } = await fixture();
    store.saveSearch("متابعة الاقتصاد", "قرار اقتصادي", { source_type: "official" });
    const paths = ["/documents/1", "/sources", "/knowledge", "/methodology", "/metrics", "/readyz", "/api/v1/documents/1", "/api/v1/sources", "/api/v1/entities", "/api/v1/events", "/api/v1/claims", "/api/v1/saved-searches", "/api/v1/openapi.json", "/export?q=%D9%82%D8%B1%D8%A7%D8%B1%20%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%D9%8A&format=ris"];
    const responses = await Promise.all(paths.map((path) => fetch(base + path)));
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(await responses[0]!.text()).toContain("النص الكامل للقرار");
    expect(await responses[4]!.text()).toContain("egypt_research_documents 1");
    expect((await responses[12]!.json() as { info: { title: string } }).info.title).toBe("Egypt Research API");
    expect((await fetch(`${base}/api/v1/search?q=x`)).status).toBe(422);
    expect((await fetch(`${base}/api/v1/entities?document_id=bad`)).status).toBe(422);
    expect((await fetch(`${base}/api/v1/search?q=${encodeURIComponent("قرار اقتصادي")}&mode=bad`)).status).toBe(422);
    expect((await fetch(`${base}/missing`)).status).toBe(404);
  });
});
