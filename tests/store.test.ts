import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bootstrapCatalog } from "../src/catalog.js";
import { KnowledgeIndexer } from "../src/knowledge.js";
import { ResearchStore } from "../src/store.js";

const source = {
  slug: "test-source",
  name: "مصدر تجريبي",
  url: "https://example.com",
  sourceType: "news" as const,
  ownershipType: "independent",
  language: "ar" as const,
  active: true
};

describe("ResearchStore", () => {
  it("creates the compatible schema and indexes searchable documents", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-mcp-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    const first = store.upsertDocument({
      externalId: "article-1",
      sourceSlug: source.slug,
      canonicalUrl: "https://example.com/a/1",
      title: "قرار اقتصادي مصري جديد",
      excerpt: "تفاصيل القرار الاقتصادي",
      content: "أعلنت الحكومة المصرية تفاصيل القرار الاقتصادي اليوم",
      publishedAt: "2026-07-14T10:00:00.000Z",
      documentType: "article",
      topics: ["economy"],
      language: "ar"
    });
    const unchanged = store.upsertDocument({
      externalId: "article-1",
      sourceSlug: source.slug,
      canonicalUrl: "https://example.com/a/1",
      title: "قرار اقتصادي مصري جديد",
      excerpt: "تفاصيل القرار الاقتصادي",
      content: "أعلنت الحكومة المصرية تفاصيل القرار الاقتصادي اليوم",
      publishedAt: "2026-07-14T10:00:00.000Z",
      documentType: "article",
      topics: ["economy"],
      language: "ar"
    });

    expect(first.createdVersion).toBe(true);
    expect(unchanged).toEqual({ documentId: first.documentId, createdVersion: false });
    expect(store.search("القرار الاقتصادي")).toHaveLength(1);
    expect(store.getDocument(first.documentId)?.citation.url).toBe("https://example.com/a/1");
    expect(store.listSourceDocuments(source.slug, 12).map((document) => document.documentId)).toEqual([first.documentId]);
    expect(store.integrityCheck()).toBe("ok");
    store.close();
  });

  it("matches Arabic definite articles and plural case variants", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-arabic-search-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    const inserted = store.upsertDocument({
      externalId: "refugees-1",
      sourceSlug: source.slug,
      canonicalUrl: "https://example.com/refugees/1",
      title: "منصة اللاجئين في مصر",
      excerpt: "تقرير عن أوضاع اللاجئين",
      content: "يتناول التقرير حقوق اللاجئين وطالبي اللجوء في مصر.",
      publishedAt: "2026-07-14T10:00:00.000Z"
    });

    for (const query of ["لاجئين", "اللاجئون", "اللاجئين"]) {
      expect(store.search(query).map((result) => result.documentId)).toEqual([inserted.documentId]);
    }
    store.close();
  });

  it("backfills missing Arabic topics without overwriting reviewed topics", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-topic-backfill-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    const missing = store.upsertDocument({
      externalId: "topic-missing", sourceSlug: source.slug, canonicalUrl: "https://example.com/topics/missing",
      title: "ارتفاع التضخم وأسعار السلع", content: "تقرير عن التضخم والعدالة الاجتماعية في مصر."
    });
    const reviewed = store.upsertDocument({
      externalId: "topic-reviewed", sourceSlug: source.slug, canonicalUrl: "https://example.com/topics/reviewed",
      title: "قرار قضائي بشأن قانون العمل", content: "أصدرت المحكمة قرارا جديدا.", topics: ["مراجعة بشرية"]
    });

    expect(store.backfillDocumentTopics()).toEqual({ scanned: 2, tagged: 1, unchanged: 1 });
    expect(store.getDocument(missing.documentId)?.topics).toContain("الاقتصاد والعدالة الاجتماعية");
    expect(store.getDocument(reviewed.documentId)?.topics).toEqual(["مراجعة بشرية"]);
    expect(store.search("التضخم")[0]?.topics).toContain("الاقتصاد والعدالة الاجتماعية");
    store.close();
  });

  it("hides sports and entertainment noise and clusters related reporting", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-filter-stories-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    const noisy = store.upsertDocument({ externalId: "sports-1", sourceSlug: source.slug, canonicalUrl: "https://example.com/sports/1", title: "مبابي ضد لامين في كأس العالم", content: "التشكيل الرسمي وركلات الترجيح.", publishedAt: "2026-07-14T10:00:00.000Z" });
    expect(store.getDocument(noisy.documentId)?.documentType).toBe("excluded");
    expect(store.search("مبابي")).toEqual([]);
    const foreign = store.upsertDocument({ externalId: "foreign-1", sourceSlug: source.slug, canonicalUrl: "https://example.com/world/1", title: "ترامب عن غزو العراق", content: "تفاصيل دولية من بغداد.", publishedAt: "2026-07-14T10:00:00.000Z" });
    expect(store.getDocument(foreign.documentId)?.documentType).toBe("excluded");
    expect(store.search("ترامب")).toEqual([]);
    const first = store.upsertDocument({ externalId: "policy-1", sourceSlug: source.slug, canonicalUrl: "https://example.com/policy/1", title: "الرئاسة تعلن قرارا اقتصاديا جديدا", content: "أعلنت الرئاسة قرارا اقتصاديا جديدا.", publishedAt: "2026-07-14T10:00:00.000Z" });
    const second = store.upsertDocument({ externalId: "policy-2", sourceSlug: source.slug, canonicalUrl: "https://example.com/policy/2", title: "الرئاسة تعلن قرارا جديدا بشأن الاقتصاد", content: "أعلنت الرئاسة قرارا جديدا بشأن الاقتصاد.", publishedAt: "2026-07-15T10:00:00.000Z" });
    store.assignStory(first.documentId); store.assignStory(second.documentId);
    expect(store.listStories(10).find((story) => story["documentCount"] === 2)?.["sourceCount"]).toBe(1);
    expect(store.rebuildStories().linkedDocuments).toBe(2);
    expect(store.listStories(10).some((story) => story["documentCount"] === 2)).toBe(true);
    store.close();
  });

  it("reopens a seeded database readonly without changing its contract", () => {
    const database = join(mkdtempSync(join(tmpdir(), "egypt-reopen-")), "research.db");
    const writableStore = new ResearchStore(database);
    writableStore.initialize();
    bootstrapCatalog(writableStore);
    const inserted = writableStore.upsertDocument({
      externalId: "reopen-1",
      sourceSlug: "cabinet-egypt",
      canonicalUrl: "https://example.com/reopen/1",
      title: "قرار اقتصادي في القاهرة",
      excerpt: "بيان رسمي للاختبار",
      content: "أعلن مجلس النواب قرارا اقتصاديا جديدا في القاهرة.",
      publishedAt: "2026-07-14T10:00:00.000Z",
      documentType: "article",
      topics: ["economy"],
      language: "ar"
    });
    new KnowledgeIndexer(writableStore).indexDocument(inserted.documentId);
    writableStore.close();

    const store = new ResearchStore(database, { readonly: true });
    expect(store.listSources()).toHaveLength(35);
    expect(store.count("documents")).toBe(1);
    expect(store.listEntities({ limit: 20 }).length).toBeGreaterThan(0);
    store.close();
  });

  it("groups repeated coverage into one event when title and date agree", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-events-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    const first = store.upsertDocument({
      externalId: "event-1", sourceSlug: source.slug, canonicalUrl: "https://example.com/events/1",
      title: "الرئاسة تعلن إطلاق برنامج دعم اللاجئين", content: "تفاصيل البرنامج.", publishedAt: "2026-07-14T10:00:00.000Z"
    });
    const second = store.upsertDocument({
      externalId: "event-2", sourceSlug: source.slug, canonicalUrl: "https://example.com/events/2",
      title: "الرئاسة: إطلاق برنامج جديد لدعم اللاجئين", content: "تفاصيل جديدة.", publishedAt: "2026-07-15T10:00:00.000Z"
    });
    const firstEvent = store.upsertEventForDocument(first.documentId, {
      title: "الرئاسة تعلن إطلاق برنامج دعم اللاجئين", summary: "الملخص الأول", occurredAt: "2026-07-14T00:00:00.000Z", eventType: "حقوق اللاجئين والمهاجرين", location: null
    });
    const secondEvent = store.upsertEventForDocument(second.documentId, {
      title: "الرئاسة: إطلاق برنامج جديد لدعم اللاجئين", summary: "الملخص الثاني", occurredAt: "2026-07-15T00:00:00.000Z", eventType: "حقوق اللاجئين والمهاجرين", location: null
    });
    expect(secondEvent).toBe(firstEvent);
    expect(store.listEvents({ limit: 10 })).toHaveLength(1);
    expect(store.listEvents({ limit: 10 })[0]?.documents).toHaveLength(2);
    store.close();
  });

  it("clusters related coverage across independent source types", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-cross-source-stories-")), "research.db"));
    store.initialize();
    store.upsertSource(source);
    store.upsertSource({ ...source, slug: "official-source", name: "مصدر رسمي", sourceType: "official" });
    const first = store.upsertDocument({
      externalId: "cross-1", sourceSlug: source.slug, canonicalUrl: "https://example.com/cross/1",
      title: "إطلاق برنامج دعم اللاجئين في مصر", content: "تقرير عن برنامج دعم اللاجئين في مصر.", publishedAt: "2026-07-14T10:00:00.000Z", topics: ["حقوق اللاجئين والمهاجرين"]
    });
    const second = store.upsertDocument({
      externalId: "cross-2", sourceSlug: "official-source", canonicalUrl: "https://example.com/cross/2",
      title: "الحكومة تعلن برنامجاً جديداً للاجئين", content: "بيان حكومي حول برنامج دعم اللاجئين.", publishedAt: "2026-07-15T10:00:00.000Z", topics: ["حقوق اللاجئين والمهاجرين"]
    });
    store.assignStory(first.documentId);
    store.assignStory(second.documentId);
    const story = store.listStories(10).find((item) => item["documentCount"] === 2);
    expect(story?.["sourceCount"]).toBe(2);
    expect(story?.["independent"]).toBe(true);
    expect(store.listStories(1)[0]?.["independent"]).toBe(true);
    store.close();
  });
});
