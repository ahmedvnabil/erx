import { createHash } from "node:crypto";
import { basename } from "node:path";
import { load } from "cheerio";

import { canonicalizeUrl, extractArticle, fetchArticle, hostAllowed, parseFeed, parseSitemap, readResponseBuffer, robotsAllows } from "./collection.js";
import type { ApiConnector, HtmlConnector } from "./connectors.js";
import { extractPdf, type PdfExtraction } from "./pdf.js";
import type { ResearchStore } from "./store.js";
import { classifyDocument } from "./text.js";
import { VERSION } from "./version.js";

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

const USER_AGENT = `ERX-EgyptResearch/${VERSION} (+research archive; contact=https://github.com/ahmedvnabil/erx)`;
const emptyReport = (sourceSlug: string): IngestionReport => ({ sourceSlug, status: "empty", itemsFound: 0, itemsSaved: 0, itemsEnriched: 0, enrichmentFailures: 0, errorCode: null, errorMessage: null });
const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1_000));

class SourceRequestError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function fetchResponse(url: string, allowedHost: string, maxBytes: number, fetcher: typeof fetch, init: RequestInit = {}): Promise<Response> {
  const parsed = new URL(url);
  if (!hostAllowed(parsed.hostname, allowedHost)) throw new Error("URL is outside the configured source host");
  const headers = new Headers(init.headers);
  headers.set("user-agent", USER_AGENT); headers.set("accept", "application/json,application/rss+xml,application/xml,text/xml,text/html,application/pdf");
  const response = await fetcher(url, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "source_access_blocked" : response.status === 429 ? "source_rate_limited" : "source_http_error";
    throw new SourceRequestError(code, `HTTP ${response.status} for ${url}`);
  }
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
      const entries = parseFeed((await readResponseBuffer(response, 5_000_000)).toString("utf8"), sourceSlug)
        .filter((entry) => hostAllowed(new URL(entry.canonicalUrl).hostname, sourceHost));
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
      return this.finish(runId, { ...emptyReport(sourceSlug), status: "failed", errorCode: error instanceof SourceRequestError ? error.code : "fetch_or_parse_failed", errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  private finish(runId: number, report: IngestionReport): IngestionReport {
    this.store.finishCrawlRun(runId, report.status, report.itemsFound, report.itemsSaved, report.errorCode, report.errorMessage);
    return report;
  }
}

export class HtmlIngestor {
  constructor(private readonly store: ResearchStore, private readonly options: { fetcher?: typeof fetch; sleeper?: (seconds: number) => Promise<void> } = {}) {}

  async ingestSource(sourceSlug: string, connector: HtmlConnector, maxUrls = 20): Promise<IngestionReport> {
    const source = this.store.getSource(sourceSlug);
    if (!source) throw new Error(`Unknown source: ${sourceSlug}`);
    const runId = this.store.startCrawlRun(sourceSlug);
    try {
      const host = new URL(source.url).hostname;
      const listing = await fetchResponse(connector.listingUrl, host, 10_000_000, this.options.fetcher ?? fetch);
      if (!(listing.headers.get("content-type") ?? "").includes("html")) throw new Error("Listing response is not HTML");
      const html = (await readResponseBuffer(listing, 10_000_000)).toString("utf8");
      const pattern = new RegExp(connector.articlePathPattern, "i");
      const limit = Number.isFinite(maxUrls) ? Math.max(1, Math.min(Math.floor(maxUrls), 500)) : 20;
      const $ = load(html); const discovered: string[] = [];
      for (const anchor of $("a[href]").toArray()) {
        if (discovered.length >= limit) break;
        try {
          const url = new URL($(anchor).attr("href") ?? "", connector.listingUrl);
          if (!hostAllowed(url.hostname, host) || !pattern.test(url.pathname)) continue;
          const canonical = canonicalizeUrl(url.href);
          if (!discovered.includes(canonical)) discovered.push(canonical);
        } catch { /* malformed link */ }
      }
      let robots = "";
      try {
        const response = await fetchResponse(new URL("/robots.txt", source.url).href, host, 1_000_000, this.options.fetcher ?? fetch);
        robots = (await readResponseBuffer(response, 1_000_000)).toString("utf8");
      } catch { robots = ""; }
      const urls = source.robotsPolicy === "respect" ? discovered.filter((url) => robotsAllows(robots, url)) : discovered;
      let saved = 0; let enriched = 0; let failures = 0;
      for (let index = 0; index < urls.length; index += 1) {
        if (index > 0) await (this.options.sleeper ?? sleep)(source.crawlDelaySeconds);
        try {
          const response = await fetchResponse(urls[index]!, host, 5_000_000, this.options.fetcher ?? fetch);
          if (!(response.headers.get("content-type") ?? "").includes("html")) throw new Error("Article response is not HTML");
          const article = extractArticle((await readResponseBuffer(response, 5_000_000)).toString("utf8"), urls[index]!, connector);
          if (!article.title || !article.content) throw new Error("Article has no extractable title or content");
          const result = this.store.upsertDocument({ externalId: externalId(sourceSlug, urls[index]!), sourceSlug, canonicalUrl: canonicalizeUrl(urls[index]!), title: article.title, excerpt: article.excerpt || article.content.slice(0, 500), content: article.content, documentType: "article", topics: classifyDocument(`${article.title} ${article.content}`), language: source.language });
          this.store.assignStory(result.documentId); if (result.createdVersion) saved += 1; enriched += 1;
        } catch { failures += 1; }
      }
      const allFailed = urls.length > 0 && failures === urls.length;
      const report: IngestionReport = { sourceSlug, status: allFailed ? "failed" : urls.length ? "success" : "empty", itemsFound: urls.length, itemsSaved: saved, itemsEnriched: enriched, enrichmentFailures: failures, errorCode: allFailed ? "all_items_failed" : null, errorMessage: allFailed ? "Every discovered HTML article failed validation or extraction." : null };
      this.store.updateSourceHealth(sourceSlug, allFailed ? "failed" : urls.length ? "healthy" : "degraded");
      return this.finish(runId, report);
    } catch (error) {
      this.store.updateSourceHealth(sourceSlug, "failed");
      return this.finish(runId, { ...emptyReport(sourceSlug), status: "failed", errorCode: error instanceof SourceRequestError ? error.code : "html_fetch_or_parse_failed", errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  private finish(runId: number, report: IngestionReport): IngestionReport {
    this.store.finishCrawlRun(runId, report.status, report.itemsFound, report.itemsSaved, report.errorCode, report.errorMessage);
    return report;
  }
}

interface ApiItem { id: string; canonicalUrl: string; title: string; excerpt: string; content: string; publishedAt: string | null; documentType: string }

export class ApiIngestor {
  constructor(private readonly store: ResearchStore, private readonly options: { fetcher?: typeof fetch } = {}) {}

  async ingestSource(sourceSlug: string, connector: ApiConnector): Promise<IngestionReport> {
    const source = this.store.getSource(sourceSlug);
    if (!source) throw new Error(`Unknown source: ${sourceSlug}`);
    const runId = this.store.startCrawlRun(sourceSlug);
    try {
      const host = new URL(source.url).hostname;
      const request = connector.method === "POST" ? { method: "POST", headers: { "content-type": "application/json", "accept-language": "ar-EG" }, body: JSON.stringify(connector.requestBody ?? {}) } : {};
      const response = await fetchResponse(connector.endpointUrl, host, 10_000_000, this.options.fetcher ?? fetch, request);
      if (!(response.headers.get("content-type") ?? "").includes("json")) throw new Error("API response is not JSON");
      const payload = JSON.parse((await readResponseBuffer(response, 10_000_000)).toString("utf8")) as unknown;
      const items = this.normalize(this.rows(payload, connector), connector).filter((item) => hostAllowed(new URL(item.canonicalUrl).hostname, host));
      let saved = 0;
      for (const item of items) {
        const result = this.store.upsertDocument({ externalId: `${sourceSlug}:api:${item.id}`, sourceSlug, canonicalUrl: item.canonicalUrl, title: item.title, excerpt: item.excerpt, content: item.content, publishedAt: item.publishedAt, documentType: item.documentType, topics: classifyDocument(`${item.title} ${item.excerpt} ${item.content}`), language: source.language });
        this.store.assignStory(result.documentId); if (result.createdVersion) saved += 1;
      }
      const report: IngestionReport = { sourceSlug, status: items.length ? "success" : "empty", itemsFound: items.length, itemsSaved: saved, itemsEnriched: items.length, enrichmentFailures: 0, errorCode: null, errorMessage: null };
      this.store.updateSourceHealth(sourceSlug, items.length ? "healthy" : "degraded");
      return this.finish(runId, report);
    } catch (error) {
      this.store.updateSourceHealth(sourceSlug, "failed");
      return this.finish(runId, { ...emptyReport(sourceSlug), status: "failed", errorCode: error instanceof SourceRequestError ? error.code : "api_fetch_or_parse_failed", errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }

  private normalize(rows: unknown[], connector: ApiConnector): ApiItem[] {
    const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    const date = (value: unknown): string | null => {
      const raw = text(value);
      const deterministic = raw && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? `${raw}Z` : raw;
      const parsed = deterministic ? new Date(deterministic) : null;
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
    };
    const clean = (value: unknown): string => { const raw = text(value); return raw ? load(`<div>${raw}</div>`)("div").text().replace(/\s+/g, " ").trim() : ""; };
    const url = (id: string): string => canonicalizeUrl(connector.canonicalUrlBase.endsWith("=") ? `${connector.canonicalUrlBase}${encodeURIComponent(id)}` : `${connector.canonicalUrlBase.replace(/\/$/, "")}/${encodeURIComponent(id)}`);
    if (connector.adapter === "capmas_news") return rows.map(record).map((row) => ({ id: text(row["id"]), canonicalUrl: url(text(row["id"])), title: text(row["title"]), excerpt: clean(row["brief"]), content: clean(row["content"]), publishedAt: date(row["publishDate"]), documentType: "statistical_release" })).filter((item) => item.id && item.title && item.content);
    if (connector.adapter === "idsc_news") return rows.map(record).map((row) => ({ id: text(row["id"]), canonicalUrl: url(text(row["id"])), title: text(row["titleA"]), excerpt: clean(row["contentA"]).slice(0, 500), content: clean(row["contentA"]), publishedAt: date(row["publishDate"]), documentType: "research_release" })).filter((item) => item.id && item.title && item.content);
    return rows.map(record).map((row) => ({ id: text(row["id"]), canonicalUrl: url(text(row["id"])), title: text(row["rule_title"]), excerpt: clean(row["rule_text"]).slice(0, 500), content: clean(row["rule_text"]), publishedAt: date(row["rule_date"]), documentType: "court_ruling" })).filter((item) => item.id && item.title && item.content);
  }

  private rows(payload: unknown, connector: ApiConnector): unknown[] {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    const root = payload as Record<string, unknown>;
    if (connector.adapter !== "idsc_news") return Array.isArray(root["data"]) ? root["data"] : [];
    const result = root["result"];
    return result && typeof result === "object" && !Array.isArray(result) && Array.isArray((result as Record<string, unknown>)["items"])
      ? (result as Record<string, unknown>)["items"] as unknown[] : [];
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
      return this.finish(runId, { ...emptyReport(sourceSlug), status: "failed", errorCode: error instanceof SourceRequestError ? error.code : "sitemap_fetch_or_parse_failed", errorMessage: error instanceof Error ? error.message : String(error) });
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
