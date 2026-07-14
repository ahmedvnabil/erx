import { createHash } from "node:crypto";
import { basename } from "node:path";

import { canonicalizeUrl, extractArticle, fetchArticle, hostAllowed, parseFeed, parseSitemap, readResponseBuffer, robotsAllows } from "./collection.js";
import { extractPdf, type PdfExtraction } from "./pdf.js";
import type { ResearchStore } from "./store.js";
import { classifyDocument } from "./text.js";

export interface IngestionReport {
  sourceSlug: string;
  status: "success" | "empty" | "failed" | "skipped";
  itemsFound: number;
  itemsSaved: number;
  itemsEnriched: number;
  enrichmentFailures: number;
  errorCode: string | null;
  errorMessage: string | null;
}

const USER_AGENT = "EgyptResearchMCP/0.4 (+research archive; contact=repository)";
const emptyReport = (sourceSlug: string): IngestionReport => ({ sourceSlug, status: "empty", itemsFound: 0, itemsSaved: 0, itemsEnriched: 0, enrichmentFailures: 0, errorCode: null, errorMessage: null });
const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1_000));

async function fetchResponse(url: string, allowedHost: string, maxBytes: number, fetcher: typeof fetch): Promise<Response> {
  const parsed = new URL(url);
  if (!hostAllowed(parsed.hostname, allowedHost)) throw new Error("URL is outside the configured source host");
  const response = await fetcher(url, { headers: { "user-agent": USER_AGENT, accept: "application/rss+xml,application/xml,text/xml,text/html,application/pdf" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new Error("Response exceeds size limit");
  return response;
}

export class FeedIngestor {
  constructor(private readonly store: ResearchStore, private readonly options: { fullText?: boolean; fetcher?: typeof fetch } = {}) {}

  async ingestSource(sourceSlug: string): Promise<IngestionReport> {
    const source = this.store.getSource(sourceSlug);
    if (!source) throw new Error(`Unknown source: ${sourceSlug}`);
    const runId = this.store.startCrawlRun(sourceSlug);
    if (!source.feedUrl) return this.finish(runId, { ...emptyReport(sourceSlug), status: "skipped", errorCode: "no_feed", errorMessage: "No verified direct feed is configured for this source." });
    try {
      const sourceHost = new URL(source.url).hostname;
      const response = await fetchResponse(source.feedUrl, sourceHost, 5_000_000, this.options.fetcher ?? fetch);
      const entries = parseFeed((await readResponseBuffer(response, 5_000_000)).toString("utf8"), sourceSlug);
      let saved = 0; let enriched = 0; let failures = 0;
      for (const entry of entries) {
        let content = entry.content;
        const existing = this.store.getDocumentByUrl(entry.canonicalUrl);
        if (!this.options.fullText && existing?.content && existing.content.length > content.length) content = existing.content;
        if (this.options.fullText) {
          try {
            const article = await fetchArticle(entry.canonicalUrl, sourceHost, this.options.fetcher ?? fetch);
            if (article.content) { content = article.content; enriched += 1; }
          } catch { failures += 1; }
        }
        const result = this.store.upsertDocument({ externalId: entry.externalId, sourceSlug, canonicalUrl: entry.canonicalUrl, title: entry.title, excerpt: entry.excerpt, content, publishedAt: entry.publishedAt, documentType: "article", topics: classifyDocument(`${entry.title} ${entry.excerpt} ${content}`), language: source.language });
        if (result.createdVersion) saved += 1;
        this.store.assignStory(result.documentId);
      }
      const report: IngestionReport = { sourceSlug, status: entries.length ? "success" : "empty", itemsFound: entries.length, itemsSaved: saved, itemsEnriched: enriched, enrichmentFailures: failures, errorCode: null, errorMessage: null };
      this.store.updateSourceHealth(sourceSlug, entries.length ? "healthy" : "degraded");
      return this.finish(runId, report);
    } catch (error) {
      this.store.updateSourceHealth(sourceSlug, "failed");
      return this.finish(runId, { ...emptyReport(sourceSlug), status: "failed", errorCode: "fetch_or_parse_failed", errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  private finish(runId: number, report: IngestionReport): IngestionReport {
    this.store.finishCrawlRun(runId, report.status, report.itemsFound, report.itemsSaved, report.errorCode, report.errorMessage);
    return report;
  }
}

export class SitemapIngestor {
  constructor(private readonly store: ResearchStore, private readonly options: { fetcher?: typeof fetch; sleeper?: (seconds: number) => Promise<void>; pdfExtractor?: (content: Buffer) => PdfExtraction } = {}) {}

  async ingestSource(sourceSlug: string, maxUrls = 100): Promise<IngestionReport> {
    const source = this.store.getSource(sourceSlug);
    if (!source) throw new Error(`Unknown source: ${sourceSlug}`);
    const runId = this.store.startCrawlRun(sourceSlug);
    if (!source.sitemapUrl) return this.finish(runId, { ...emptyReport(sourceSlug), status: "skipped", errorCode: "no_sitemap", errorMessage: "No verified sitemap is configured for this source." });
    try {
      const host = new URL(source.url).hostname;
      const robotsUrl = new URL("/robots.txt", source.url).href;
      let robots = "";
      try { const response = await fetchResponse(robotsUrl, host, 1_000_000, this.options.fetcher ?? fetch); robots = (await readResponseBuffer(response, 1_000_000)).toString("utf8"); } catch { robots = ""; }
      let urls = await this.discover(source.sitemapUrl, host, maxUrls);
      if (source.robotsPolicy === "respect") urls = urls.filter((url) => robotsAllows(robots, url));
      let saved = 0; let enriched = 0; let failures = 0;
      for (let index = 0; index < urls.length; index += 1) {
        if (index > 0) await (this.options.sleeper ?? sleep)(source.crawlDelaySeconds);
        try { if (await this.archive(sourceSlug, source.language, host, urls[index]!)) saved += 1; enriched += 1; } catch { failures += 1; }
      }
      const allFailed = urls.length > 0 && failures === urls.length;
      const report: IngestionReport = { sourceSlug, status: allFailed ? "failed" : urls.length ? "success" : "empty", itemsFound: urls.length, itemsSaved: saved, itemsEnriched: enriched, enrichmentFailures: failures, errorCode: allFailed ? "all_items_failed" : null, errorMessage: allFailed ? "Every discovered URL failed validation or extraction." : null };
      this.store.updateSourceHealth(sourceSlug, allFailed ? "failed" : urls.length ? "healthy" : "degraded");
      return this.finish(runId, report);
    } catch (error) {
      this.store.updateSourceHealth(sourceSlug, "failed");
      return this.finish(runId, { ...emptyReport(sourceSlug), status: "failed", errorCode: "sitemap_fetch_or_parse_failed", errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  private async discover(sitemapUrl: string, host: string, maxUrls: number): Promise<string[]> {
    const pending = [sitemapUrl]; const visited = new Set<string>(); const discovered: string[] = []; const limit = Math.max(1, Math.min(maxUrls, 5_000));
    while (pending.length && visited.size < 20 && discovered.length < limit) {
      const current = pending.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const response = await fetchResponse(current, host, 10_000_000, this.options.fetcher ?? fetch);
      const result = parseSitemap((await readResponseBuffer(response, 10_000_000)).toString("utf8"), host, limit);
      if (result.kind === "index") pending.push(...result.urls.filter((url) => !visited.has(url)));
      else for (const url of result.urls) if (!discovered.includes(url) && discovered.length < limit) discovered.push(url);
    }
    return discovered;
  }

  private async archive(sourceSlug: string, language: "ar" | "en" | "mixed", host: string, url: string): Promise<boolean> {
    const response = await fetchResponse(url, host, 20_000_000, this.options.fetcher ?? fetch);
    const mediaType = (response.headers.get("content-type") ?? "text/html").split(";", 1)[0] ?? "text/html";
    const bytes = await readResponseBuffer(response, mediaType === "application/pdf" || new URL(url).pathname.toLowerCase().endsWith(".pdf") ? 20_000_000 : 5_000_000);
    if (mediaType === "application/pdf" || new URL(url).pathname.toLowerCase().endsWith(".pdf")) return this.archivePdf(sourceSlug, language, url, mediaType, bytes);
    if (!mediaType.includes("html")) throw new Error("Discovered document is neither HTML nor PDF");
    const article = extractArticle(bytes.toString("utf8"), url);
    if (!article.title || !article.content) throw new Error("Article has no extractable title or content");
    const result = this.store.upsertDocument({ externalId: externalId(sourceSlug, url), sourceSlug, canonicalUrl: canonicalizeUrl(url), title: article.title, excerpt: article.excerpt || article.content.slice(0, 500), content: article.content, documentType: "article", topics: classifyDocument(`${article.title} ${article.content}`), language });
    this.store.assignStory(result.documentId);
    return result.createdVersion;
  }

  private archivePdf(sourceSlug: string, language: "ar" | "en" | "mixed", url: string, mediaType: string, content: Buffer): boolean {
    const extraction = (this.options.pdfExtractor ?? extractPdf)(content);
    if (!extraction.text.trim()) throw new Error("PDF has no extractable text");
    const filename = decodeURIComponent(basename(new URL(url).pathname)).replace(/\.pdf$/i, "").replaceAll("-", " ").trim();
    const title = filename.length >= 2 ? filename : "وثيقة PDF";
    const result = this.store.upsertDocument({ externalId: externalId(sourceSlug, url), sourceSlug, canonicalUrl: canonicalizeUrl(url), title, excerpt: extraction.text.slice(0, 500), content: extraction.text, documentType: "pdf", topics: classifyDocument(`${title} ${extraction.text}`), language });
    this.store.upsertDocumentAsset({ documentId: result.documentId, url, mediaType: mediaType || "application/pdf", sha256: createHash("sha256").update(content).digest("hex"), byteSize: content.length, pageCount: extraction.pageCount, extractedWith: extraction.extractor, ocrUsed: extraction.ocrUsed });
    this.store.assignStory(result.documentId);
    return result.createdVersion;
  }

  private finish(runId: number, report: IngestionReport): IngestionReport {
    this.store.finishCrawlRun(runId, report.status, report.itemsFound, report.itemsSaved, report.errorCode, report.errorMessage);
    return report;
  }
}

function externalId(sourceSlug: string, url: string): string { return `${sourceSlug}:${createHash("sha256").update(url).digest("hex").slice(0, 24)}`; }
