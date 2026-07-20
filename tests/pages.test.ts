import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWebServer } from "../src/web.js";
import { ResearchStore } from "../src/store.js";

const open: Array<ReturnType<typeof createWebServer>> = [];
afterEach(async () => { await Promise.all(open.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

async function fixture() {
  const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-pages-")), "research.db"));
  store.initialize();
  store.upsertSource({ slug: "official-test", name: "المصدر الرسمي التجريبي", url: "https://example.org", sourceType: "official", ownershipType: "government", language: "ar" });
  store.upsertDocument({ externalId: "official-1", sourceSlug: "official-test", canonicalUrl: "https://example.org/decision/1", title: "قرار اقتصادي مصري موثق", excerpt: "تفاصيل موجزة", content: "النص الكامل للقرار.", publishedAt: "2026-07-14T00:00:00.000Z" });
  const server = createWebServer(store, { includeMcp: false });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test address");
  return { store, base: `http://127.0.0.1:${address.port}` };
}

describe("trust and transparency pages", () => {
  it("serves about, privacy, safety and human status pages with expected Arabic text", async () => {
    const { base } = await fixture();
    const [about, privacy, safety, statusHtml] = await Promise.all([
      fetch(`${base}/about`), fetch(`${base}/privacy`), fetch(`${base}/safety`), fetch(`${base}/status.html`)
    ]);
    expect([about.status, privacy.status, safety.status, statusHtml.status]).toEqual([200, 200, 200, 200]);

    const aboutBody = await about.text();
    expect(aboutBody).toContain("من نحن");
    expect(aboutBody).toContain("ليس منصّة إعلامية");
    expect(aboutBody).toContain("OPERATOR: to be filled by maintainer");
    expect(aboutBody).toContain("الجهة المشغّلة:");

    const privacyBody = await privacy.text();
    expect(privacyBody).toContain("الخصوصية");
    expect(privacyBody).toContain("لا تسجّل ولا تخزّن استعلامات البحث");
    expect(privacyBody).toContain("لا كوكيز تتبّع");
    expect(privacyBody).toContain("robots.txt");
    expect(privacyBody).toContain("MIT");

    const safetyBody = await safety.text();
    expect(safetyBody).toContain("السلامة للباحثين");
    expect(safetyBody).toContain("المصدر الأصلي");
    expect(safetyBody).toContain("الأمن التشغيلي");

    const statusBody = await statusHtml.text();
    expect(statusBody).toContain("حالة الأرشيف");
    expect(statusBody).toContain("وثيقة مؤرشفة");
  });

  it("exposes trust links in the shared footer and keeps /status JSON valid", async () => {
    const { base } = await fixture();
    const landing = await (await fetch(base)).text();
    expect(landing).toContain('href="/about"');
    expect(landing).toContain('href="/privacy"');
    expect(landing).toContain('href="/safety"');
    expect(landing).toContain('href="/status.html"');

    const status = await fetch(`${base}/status`);
    expect(status.headers.get("content-type")).toContain("application/json");
    const body = await status.json() as { status: string; coverage: { documents: number } };
    expect(body.status).toBe("ok");
    expect(body.coverage.documents).toBe(1);
  });
});
