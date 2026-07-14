import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapCatalog, INITIAL_SOURCES } from "../src/catalog.js";
import { ResearchStore } from "../src/store.js";

describe("source catalog", () => {
  it("seeds 33 typed sources with every verified collection endpoint idempotently", () => {
    const store = new ResearchStore(join(mkdtempSync(join(tmpdir(), "egypt-catalog-")), "research.db")); store.initialize();
    expect(INITIAL_SOURCES).toHaveLength(33);
    expect(INITIAL_SOURCES.filter((source) => source.feedUrl)).toHaveLength(18);
    expect(INITIAL_SOURCES.filter((source) => source.sitemapUrl)).toHaveLength(1);
    expect(INITIAL_SOURCES.filter((source) => source.feedUrl || source.sitemapUrl)).toHaveLength(19);
    expect(INITIAL_SOURCES.find((source) => source.slug === "masrawy")?.feedUrl).toBe("https://www.masrawy.com/rss/feed/25/أخبار");
    bootstrapCatalog(store); bootstrapCatalog(store);
    expect(store.listSources()).toHaveLength(33); store.close();
  });
});
