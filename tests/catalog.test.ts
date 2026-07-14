import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCatalog, INITIAL_SOURCES } from "../src/catalog.js";
import { ResearchStore } from "../src/store.js";

describe("source catalog", () => {
  it("seeds 52 typed sources with every verified collection endpoint idempotently", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-catalog-")), "research.db")); store.initialize();
    expect(INITIAL_SOURCES).toHaveLength(52);
    expect(INITIAL_SOURCES.filter((source) => source.feedUrl)).toHaveLength(22);
    expect(INITIAL_SOURCES.filter((source) => source.sitemapUrl)).toHaveLength(3);
    expect(INITIAL_SOURCES.filter((source) => source.feedUrl || source.sitemapUrl)).toHaveLength(25);
    expect(INITIAL_SOURCES.find((source) => source.slug === "masrawy")?.feedUrl).toBe("https://www.masrawy.com/rss/feed/25/أخبار");
    expect(INITIAL_SOURCES.find((source) => source.slug === "ministry-of-finance-egypt")?.collectionMethod).toBeUndefined();
    expect(INITIAL_SOURCES.find((source) => source.slug === "bue-scholar")?.feedUrl).toBe("https://buescholar.bue.edu.eg/recent.rss");
    expect(INITIAL_SOURCES.filter((source) => source.collectionMethod === "html")).toHaveLength(7);
    expect(INITIAL_SOURCES.filter((source) => source.collectionMethod === "api")).toHaveLength(6);
    expect(INITIAL_SOURCES.filter((source) => source.collectionMethod === "hybrid")).toHaveLength(9);
    bootstrapCatalog(store); bootstrapCatalog(store);
    expect(store.listSources()).toHaveLength(52); store.close();
  });
});
