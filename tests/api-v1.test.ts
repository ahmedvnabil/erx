import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWebServer } from "../src/web.js";
import { ResearchStore } from "../src/store.js";

const open: Array<ReturnType<typeof createWebServer>> = [];
afterEach(async () => { await Promise.all(open.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

async function seeded(rateLimitPerMinute = 120) {
  const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-api-v1-")), "research.db"));
  store.initialize();
  store.upsertSource({ slug: "official-test", name: "المصدر الرسمي التجريبي", url: "https://example.org", sourceType: "official", ownershipType: "government", language: "ar" });
  for (const index of [1, 2, 3]) {
    store.upsertDocument({ externalId: `official-${index}`, sourceSlug: "official-test", canonicalUrl: `https://example.org/decision/${index}`, title: `قرار اقتصادي مصري موثق رقم ${index}`, excerpt: `ملخص القرار الاقتصادي رقم ${index}`, content: "النص الكامل للقرار الاقتصادي المصري الموثق.", publishedAt: `2026-07-1${index}T00:00:00.000Z` });
  }
  const server = createWebServer(store, { includeMcp: false, rateLimitPerMinute });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test address");
  return { store, base: `http://127.0.0.1:${address.port}` };
}

describe("REST v1 pagination, feed, rate-limit headers, and OpenAPI", () => {
  it("paginates search with exact envelope fields across two offset pages", async () => {
    const { base } = await seeded();
    const query = encodeURIComponent("قرار اقتصادي");
    const first = await (await fetch(`${base}/api/v1/search?q=${query}&mode=lexical&limit=2&offset=0`)).json() as Record<string, unknown>;
    expect(first).toEqual(expect.objectContaining({ count: 2, total_count: 3, offset: 0, has_more: true, next_offset: 2 }));
    expect((first["results"] as unknown[]).length).toBe(2);
    const second = await (await fetch(`${base}/api/v1/search?q=${query}&mode=lexical&limit=2&offset=2`)).json() as Record<string, unknown>;
    expect(second).toEqual(expect.objectContaining({ count: 1, total_count: 3, offset: 2, has_more: false, next_offset: null }));
    expect((second["results"] as unknown[]).length).toBe(1);
  });

  it("rejects a negative or non-integer offset with 422", async () => {
    const { base } = await seeded();
    const query = encodeURIComponent("قرار اقتصادي");
    expect((await fetch(`${base}/api/v1/search?q=${query}&offset=-1`)).status).toBe(422);
    expect((await fetch(`${base}/api/v1/sources?offset=abc`)).status).toBe(422);
  });

  it("serves an RSS 2.0 feed with the correct content type and a document title", async () => {
    const { base } = await seeded();
    const feed = await fetch(`${base}/feed.xml`);
    expect(feed.status).toBe(200);
    expect(feed.headers.get("content-type")).toContain("application/rss+xml");
    const body = await feed.text();
    expect(body).toContain("<rss version=\"2.0\">");
    expect(body).toContain("قرار اقتصادي مصري موثق رقم");
  });

  it("sets rate-limit headers on API responses", async () => {
    const { base } = await seeded();
    const status = await fetch(`${base}/api/v1/status`);
    expect(status.headers.get("x-ratelimit-limit")).toBe("120");
    expect(Number(status.headers.get("x-ratelimit-remaining"))).toBeGreaterThanOrEqual(0);
    expect(Number(status.headers.get("x-ratelimit-reset"))).toBeGreaterThan(0);
  });

  it("documents components.schemas in the OpenAPI descriptor", async () => {
    const { base } = await seeded();
    const openapi = await (await fetch(`${base}/api/v1/openapi.json`)).json() as { openapi: string; components?: { schemas?: Record<string, unknown> } };
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.components?.schemas).toBeDefined();
    expect(openapi.components?.schemas).toHaveProperty("PaginatedEnvelope");
    expect(openapi.components?.schemas).toHaveProperty("Error");
  });
});
