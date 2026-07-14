import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCatalog, INITIAL_SOURCES } from "../src/catalog.js";
import { ResearchStore } from "../src/store.js";

describe("source catalog", () => {
  it("seeds only operational sources and prunes retired catalog entries idempotently", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-catalog-")), "research.db")); store.initialize();
    expect(INITIAL_SOURCES).toHaveLength(24);
    expect(INITIAL_SOURCES.every((source) => source.feedUrl || source.sitemapUrl || source.collectionMethod === "html" || source.collectionMethod === "api")).toBe(true);
    expect(INITIAL_SOURCES.some((source) => source.slug === "masrawy" || source.slug === "bue-scholar")).toBe(false);
    expect(INITIAL_SOURCES.find((source) => source.slug === "manshurat")?.feedUrl).toBe("https://manshurat.org/rss.xml");
    expect(INITIAL_SOURCES.filter((source) => source.collectionMethod === "html")).toHaveLength(7);
    expect(INITIAL_SOURCES.filter((source) => source.collectionMethod === "api")).toHaveLength(3);
    store.upsertSource({ slug: "retired-test", name: "مصدر متقاعد", url: "https://retired.example", sourceType: "news", ownershipType: "test", language: "ar" });
    bootstrapCatalog(store); bootstrapCatalog(store);
    expect(store.getSource("retired-test")).toBeNull();
    expect(store.listSources()).toHaveLength(24); store.close();
  });
});
