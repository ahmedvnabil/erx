import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWebServer } from "../src/web.js";
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
  it("serves Arabic UI, search, health, and source-backed REST", async () => {
    const { base } = await fixture();
    const [home, search, api, health] = await Promise.all([
      fetch(base), fetch(`${base}/search?q=${encodeURIComponent("قرار اقتصادي")}`),
      fetch(`${base}/api/v1/search?q=${encodeURIComponent("قرار اقتصادي")}&mode=hybrid`), fetch(`${base}/healthz`)
    ]);
    expect(await home.text()).toContain("مرصد مصر البحثي");
    expect(await search.text()).toContain("قرار اقتصادي مصري موثق");
    const body = await api.json() as { results: Array<{ citation: { url: string } }> };
    expect(body.results[0]?.citation.url).toBe("https://example.org/decision/1");
    expect(await health.json()).toEqual(expect.objectContaining({ status: "ok", documents: 1 }));
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
