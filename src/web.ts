import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { exportResults, EXPORT_FORMATS, type ExportFormat } from "./exports.js";
import { getLiveData, listLiveDatasets, checkLiveSources, LIVE_SOURCE_SLUGS, type LiveQuery, type LiveSourceSlug } from "./live-data.js";
import { createMcpServer } from "./mcp.js";
import { APP_JS, PRODUCT_CSS, brandSvg, docsView, landingView, llmsText, manifest, registryManifest, robots, sitemap, socialCardSvg, structuredData } from "./product.js";
import { LANDING_V2_CSS } from "./landing.js";
import { HybridRetriever } from "./retrieval.js";
import type { ResearchStore } from "./store.js";
import type { SearchResult, SourceType } from "./types.js";
import { APP_CSS, SOURCE_EXPLORER_CSS, SOURCE_EXPLORER_JS, UTILITY_CSS, documentView, homeView, knowledgeView, methodologyView, resultsView, sourcesView } from "./views.js";

export interface WebOptions { includeMcp?: boolean; rateLimitPerMinute?: number; trustProxy?: boolean }

const apiPaths = ["/api/", "/search", "/export", "/mcp"];
const SOCIAL_CARD_PNG = readFileSync(new URL("../public/social-card.png", import.meta.url));
const ARCHIVE_ATLAS_WEBP = readFileSync(new URL("../public/archive-atlas.webp", import.meta.url));
const RESEARCH_DESK_WEBP = readFileSync(new URL("../public/research-desk.webp", import.meta.url));
const ARCHIVE_CARE_WEBP = readFileSync(new URL("../public/archive-care.webp", import.meta.url));
const READEX_PRO_AR_WOFF2 = readFileSync(new URL("../public/readex-pro-ar.woff2", import.meta.url));
const READEX_PRO_LATIN_WOFF2 = readFileSync(new URL("../public/readex-pro-latin.woff2", import.meta.url));

export function createWebServer(store: ResearchStore, options: WebOptions = {}) {
  const limits = new Map<string, { window: number; count: number }>();
  const maximum = options.rateLimitPerMinute ?? Number(process.env["EGYPT_RESEARCH_RATE_LIMIT"] ?? 120);
  const trustProxy = options.trustProxy ?? process.env["EGYPT_RESEARCH_TRUST_PROXY"] === "true";
  const publicBaseUrl = normalizePublicBaseUrl(process.env["EGYPT_RESEARCH_PUBLIC_URL"]);
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    securityHeaders(response, requestId, publicBaseUrl?.startsWith("https://") ?? false);
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const isApiV1 = url.pathname.startsWith("/api/v1/");
    if (isApiV1) {
      response.setHeader("access-control-allow-origin", "*");
      response.setHeader("access-control-allow-methods", "GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type, accept");
      response.setHeader("access-control-expose-headers", "x-request-id, etag, cache-control, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset");
      if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
    }
    if (apiPaths.some((prefix) => url.pathname.startsWith(prefix))) {
      const rate = rateState(request, limits, maximum, trustProxy);
      if (isApiV1) {
        response.setHeader("x-ratelimit-limit", String(maximum));
        response.setHeader("x-ratelimit-remaining", String(Math.max(0, maximum - rate.count)));
        response.setHeader("x-ratelimit-reset", String(rate.reset));
      }
      if (rate.blocked) { response.setHeader("retry-after", "60"); json(response, 429, { error: { code: "rate_limited", request_id: requestId } }); return; }
    }
    try {
      await route(store, request, response, url, options.includeMcp !== false, publicBaseUrl);
    } catch (error) {
      if (!response.headersSent) json(response, 500, { error: { code: "internal_error", request_id: requestId } });
      else response.end();
      console.error(`[${requestId}]`, error instanceof Error ? error.message : error);
    }
  });
}

async function route(store: ResearchStore, request: IncomingMessage, response: ServerResponse, url: URL, includeMcp: boolean, configuredBaseUrl?: string): Promise<void> {
  const path = url.pathname;
  const baseUrl = configuredBaseUrl ?? url.origin;
  if (path === "/static/app.css") return staticText(response, APP_CSS + UTILITY_CSS + PRODUCT_CSS + LANDING_V2_CSS + SOURCE_EXPLORER_CSS, "text/css; charset=utf-8");
  if (path === "/static/app.js") return staticText(response, APP_JS + SOURCE_EXPLORER_JS, "text/javascript; charset=utf-8");
  if (path === "/static/brand.svg") return staticText(response, brandSvg(), "image/svg+xml; charset=utf-8");
  if (path === "/static/archive-atlas.webp") return binary(response, ARCHIVE_ATLAS_WEBP, "image/webp");
  if (path === "/static/research-desk.webp") return binary(response, RESEARCH_DESK_WEBP, "image/webp");
  if (path === "/static/archive-care.webp") return binary(response, ARCHIVE_CARE_WEBP, "image/webp");
  if (path === "/static/readex-pro-ar.woff2") return binary(response, READEX_PRO_AR_WOFF2, "font/woff2");
  if (path === "/static/readex-pro-latin.woff2") return binary(response, READEX_PRO_LATIN_WOFF2, "font/woff2");
  if (path === "/static/social-card.svg") return staticText(response, socialCardSvg(), "image/svg+xml; charset=utf-8");
  if (path === "/static/social-card.png") return binary(response, SOCIAL_CARD_PNG, "image/png");
  if (path === "/manifest.webmanifest") return json(response, 200, manifest(baseUrl), "application/manifest+json; charset=utf-8");
  if (path === "/robots.txt") return text(response, 200, robots(baseUrl));
  if (path === "/sitemap.xml") return text(response, 200, sitemap(baseUrl), "application/xml; charset=utf-8");
  if (path === "/llms.txt") return text(response, 200, llmsText(baseUrl));
  if (path === "/structured-data.json") return json(response, 200, structuredData(baseUrl, store.listSources().length, store.listDocumentIds(100_000).length), "application/ld+json; charset=utf-8");
  if (path === "/server.json" || path === "/.well-known/mcp/server.json") return json(response, 200, registryManifest(baseUrl));
  if (path === "/healthz") {
    const sources = store.listSources();
    const documents = sources.reduce((sum, source) => sum + source.documentCount, 0);
    const excluded = store.countExcludedDocuments();
    return json(response, 200, { status: "ok", documents, searchable_documents: documents - excluded, excluded_documents: excluded, sources: sources.length });
  }
  if (path === "/status") return json(response, 200, wire({ status: "ok", version: (await import("./version.js")).VERSION, coverage: store.coverageReport(), checkedAt: new Date().toISOString() }));
  if (path === "/coverage") return json(response, 200, wire(store.coverageReport()));
  if (path === "/readyz") return json(response, store.integrityCheck() === "ok" ? 200 : 503, { status: store.integrityCheck() === "ok" ? "ready" : "not_ready" });
  if (path === "/metrics") {
    const sources = store.listSources(); const runs = store.listCrawlRuns(undefined, 500);
    const body = [`# TYPE egypt_research_documents gauge`, `egypt_research_documents ${sources.reduce((sum, source) => sum + source.documentCount, 0)}`, `# TYPE egypt_research_sources gauge`, `egypt_research_sources ${sources.length}`, `# TYPE egypt_research_failed_sources gauge`, `egypt_research_failed_sources ${sources.filter((source) => source.healthStatus === "failed").length}`, `# TYPE egypt_research_failed_crawl_runs gauge`, `egypt_research_failed_crawl_runs ${runs.filter((run) => run["status"] === "failed").length}`, ""].join("\n");
    return text(response, 200, body, "text/plain; version=0.0.4; charset=utf-8");
  }
  if (path === "/" && (request.method === "GET" || request.method === "HEAD")) return html(response, 200, landingView(store.listSources(), store.listStories(8), baseUrl, "ar"));
  if (path === "/en" && (request.method === "GET" || request.method === "HEAD")) return html(response, 200, landingView(store.listSources(), store.listStories(8), baseUrl, "en"));
  if (path === "/explore" && request.method === "GET") return html(response, 200, homeView(store.listSources(), store.listStories(8)));
  if (path === "/docs" && request.method === "GET") return html(response, 200, docsView(store.listSources(), baseUrl));
  if (path === "/search" && request.method === "GET") {
    const query = (url.searchParams.get("q") ?? "").trim();
    const mode = url.searchParams.get("mode") ?? "hybrid";
    const sourceType = url.searchParams.get("source_type") as SourceType | null;
    const searchOptions = { limit: 50, ...(sourceType ? { sourceTypes: [sourceType] } : {}), ...(url.searchParams.get("date_from") ? { dateFrom: url.searchParams.get("date_from")! } : {}), ...(url.searchParams.get("date_to") ? { dateTo: url.searchParams.get("date_to")! } : {}) };
    const results = mode === "lexical" ? store.search(query, searchOptions) : new HybridRetriever(store).search(query, searchOptions);
    return html(response, 200, resultsView(query, results.map((result) => ({ ...result, excerpt: result.excerpt.slice(0, 800) })), mode));
  }
  const documentMatch = /^\/documents\/(\d+)$/.exec(path);
  if (documentMatch) {
    const id = Number(documentMatch[1]); const document = store.getDocument(id);
    return document ? html(response, 200, documentView(document, store.listEntities({ documentId: id }), store.listClaims({ documentId: id }), store.listEvents({ documentId: id }))) : text(response, 404, "الوثيقة غير موجودة");
  }
  if (path === "/sources") {
    const sources = store.listSources();
    const documentsBySource = Object.fromEntries(sources.map((source) => [source.slug, store.listSourceDocuments(source.slug, 24)]));
    return html(response, 200, sourcesView(sources, store.listCrawlRuns(undefined, 200), documentsBySource));
  }
  if (path === "/knowledge") return html(response, 200, knowledgeView(store.listEntities({ limit: 50 }), store.listEvents({ limit: 30 }), store.listClaims({ limit: 30 }), store.listSavedSearches(30)));
  if (path === "/methodology") return html(response, 200, methodologyView());
  if (path === "/export") {
    const query = (url.searchParams.get("q") ?? "").trim(); const format = url.searchParams.get("format") ?? "ris";
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) return json(response, 400, { error: "unsupported_format" });
    response.setHeader("content-disposition", `attachment; filename="egypt-research.${format}"`);
    return text(response, 200, exportResults(store.search(query, { limit: 100 }), format as ExportFormat));
  }
  if (path === "/feed.xml" && (request.method === "GET" || request.method === "HEAD")) {
    const sourceType = url.searchParams.get("source_type") as SourceType | null;
    const documents = store.search("", { limit: 30, ...(sourceType ? { sourceTypes: [sourceType] } : {}) });
    return text(response, 200, rssFeed(documents, baseUrl), "application/rss+xml; charset=utf-8");
  }
  if (path.startsWith("/api/v1/")) return await api(store, response, url);
  if (path === "/mcp") {
    if (!includeMcp) return json(response, 404, { error: { code: "not_found" } });
    if (!validOrigin(request, baseUrl)) return jsonRpc(response, 403, -32000, "Origin not allowed");
    if (request.method !== "POST") return jsonRpc(response, 405, -32000, "Method not allowed");
    let body: unknown;
    try { body = await readJson(request, 1_000_000); }
    catch (error) {
      if (error instanceof PayloadTooLargeError) return jsonRpc(response, 413, -32000, "Request body exceeds size limit");
      return jsonRpc(response, 400, -32700, "Parse error");
    }
    const server = createMcpServer(store, { allowWrites: false });
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport as unknown as Transport);
    response.once("close", () => { void transport.close(); void server.close(); });
    await transport.handleRequest(request, response, body);
    return;
  }
  return json(response, 404, { error: { code: "not_found" } });
}

async function api(store: ResearchStore, response: ServerResponse, url: URL): Promise<void> {
  const path = url.pathname;
  if (path === "/api/v1/status") return json(response, 200, wire({ status: "ok", coverage: store.coverageReport(), checkedAt: new Date().toISOString() }));
  if (path === "/api/v1/coverage") return json(response, 200, wire(store.coverageReport()));
  if (path === "/api/v1/live/datasets") { response.setHeader("cache-control", "public, max-age=3600"); return json(response, 200, wire({ count: listLiveDatasets().length, datasets: listLiveDatasets() })); }
  if (path === "/api/v1/live/health") return json(response, 200, wire({ checkedAt: new Date().toISOString(), sources: await checkLiveSources() }));
  if (path === "/api/v1/live/data") {
    const rawSource = url.searchParams.get("source");
    if (!rawSource || !LIVE_SOURCE_SLUGS.includes(rawSource as LiveSourceSlug)) return json(response, 422, { error: { code: "invalid_live_source" } });
    const rawLimit = url.searchParams.get("limit"); const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
    if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)) return json(response, 422, { error: { code: "invalid_limit" } });
    const query: LiveQuery = {
      source: rawSource as LiveSourceSlug,
      ...(url.searchParams.get("indicator") ? { indicator: url.searchParams.get("indicator")! } : {}),
      ...(url.searchParams.get("query") ? { query: url.searchParams.get("query")! } : {}),
      ...(url.searchParams.get("country") ? { country: url.searchParams.get("country")! } : {}),
      ...(url.searchParams.get("period_from") ? { periodFrom: url.searchParams.get("period_from")! } : {}),
      ...(url.searchParams.get("period_to") ? { periodTo: url.searchParams.get("period_to")! } : {}),
      ...(url.searchParams.get("period") ? { period: url.searchParams.get("period")! } : {}),
      ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
      ...(url.searchParams.get("refugee_dimension") === "origin" || url.searchParams.get("refugee_dimension") === "asylum" ? { refugeeDimension: url.searchParams.get("refugee_dimension") as "origin" | "asylum" } : {}),
      ...(url.searchParams.get("flow_code") === "M" || url.searchParams.get("flow_code") === "X" || url.searchParams.get("flow_code") === "X,M" ? { flowCode: url.searchParams.get("flow_code") as "M" | "X" | "X,M" } : {})
    };
    try { response.setHeader("cache-control", "public, max-age=300, stale-while-revalidate=60"); return json(response, 200, wire(await getLiveData(query))); }
    catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "live_source_error";
      const status = code === "rate_limited" ? 429 : code === "invalid_query" ? 422 : 502;
      return json(response, status, { error: { code, message: error instanceof Error ? error.message : String(error) } });
    }
  }
  if (path === "/api/v1/search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length < 2 || query.length > 1_000) return json(response, 422, { error: { code: "invalid_query" } });
    const parsedLimit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(parsedLimit)) return json(response, 422, { error: { code: "invalid_limit" } });
    const offset = parseOffset(url); if (offset === null) return json(response, 422, { error: { code: "invalid_offset" } });
    const limit = Math.max(1, Math.min(parsedLimit, 100)); const mode = url.searchParams.get("mode") ?? "hybrid";
    if (mode !== "hybrid" && mode !== "lexical") return json(response, 422, { error: { code: "invalid_mode" } });
    const total = store.countSearch(query, {});
    const results = mode === "hybrid" ? new HybridRetriever(store).search(query, { limit: offset + limit }).slice(offset) : store.search(query, { limit, offset });
    return json(response, 200, wire({ query, mode, ...envelope(offset, total, results.length), results: results.map((result) => ({ ...result, excerpt: result.excerpt.slice(0, 800) })) }));
  }
  const documentMatch = /^\/api\/v1\/documents\/(\d+)$/.exec(path);
  if (documentMatch) { const document = store.getDocument(Number(documentMatch[1])); return document ? json(response, 200, wire({ document })) : json(response, 404, { error: { code: "not_found" } }); }
  if (path === "/api/v1/sources") {
    const offset = parseOffset(url); if (offset === null) return json(response, 422, { error: { code: "invalid_offset" } });
    const parsedLimit = Number(url.searchParams.get("limit") ?? 100); if (!Number.isInteger(parsedLimit)) return json(response, 422, { error: { code: "invalid_limit" } });
    const limit = Math.max(1, Math.min(parsedLimit, 500)); const sources = store.listSources();
    const page = sources.slice(offset, offset + limit);
    return json(response, 200, wire({ ...envelope(offset, sources.length, page.length), sources: page }));
  }
  if (path === "/api/v1/entities") {
    const rawId = url.searchParams.get("document_id"); const id = rawId ? Number(rawId) : undefined;
    if (rawId && !Number.isInteger(id)) return json(response, 422, { error: { code: "invalid_document_id" } });
    const offset = parseOffset(url); if (offset === null) return json(response, 422, { error: { code: "invalid_offset" } });
    const parsedLimit = Number(url.searchParams.get("limit") ?? 100); if (!Number.isInteger(parsedLimit)) return json(response, 422, { error: { code: "invalid_limit" } });
    const limit = Math.max(1, Math.min(parsedLimit, 500)); const filter = id !== undefined ? { documentId: id } : {};
    const total = store.countEntities(filter); const entities = store.listEntities({ ...filter, limit, offset });
    return json(response, 200, wire({ ...envelope(offset, total, entities.length), entities }));
  }
  if (path === "/api/v1/events") {
    const rawId = url.searchParams.get("document_id"); const id = rawId ? Number(rawId) : undefined;
    if (rawId && !Number.isInteger(id)) return json(response, 422, { error: { code: "invalid_document_id" } });
    const offset = parseOffset(url); if (offset === null) return json(response, 422, { error: { code: "invalid_offset" } });
    const parsedLimit = Number(url.searchParams.get("limit") ?? 100); if (!Number.isInteger(parsedLimit)) return json(response, 422, { error: { code: "invalid_limit" } });
    const limit = Math.max(1, Math.min(parsedLimit, 500)); const filter = id !== undefined ? { documentId: id } : {};
    const total = store.countEvents(filter); const events = store.listEvents({ ...filter, limit, offset });
    return json(response, 200, wire({ ...envelope(offset, total, events.length), events }));
  }
  if (path === "/api/v1/claims") { const claims = store.listClaims(); return json(response, 200, wire({ count: claims.length, claims })); }
  if (path === "/api/v1/saved-searches") { const savedSearches = store.listSavedSearches(); return json(response, 200, wire({ count: savedSearches.length, savedSearches })); }
  if (path === "/api/v1/openapi.json") return json(response, 200, openApiDocument());
  return json(response, 404, { error: { code: "not_found" } });
}

function parseOffset(url: URL): number | null {
  const raw = url.searchParams.get("offset");
  if (raw === null) return 0;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

// Mirrors the MCP `page()` envelope so REST pagination stays exact against the SQL counts.
function envelope(offset: number, total: number, count: number): { count: number; totalCount: number; offset: number; hasMore: boolean; nextOffset: number | null } {
  const next = offset + count < total ? offset + count : null;
  return { count, totalCount: total, offset, hasMore: next !== null, nextOffset: next };
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character] ?? character));
}

function rssFeed(documents: SearchResult[], baseUrl: string): string {
  const items = documents.map((document) => {
    const pubDate = new Date(document.publishedAt ?? document.archivedAt).toUTCString();
    return `<item><title>${xmlEscape(document.title)}</title><link>${xmlEscape(document.canonicalUrl)}</link><guid isPermaLink="true">${xmlEscape(document.canonicalUrl)}</guid><pubDate>${pubDate}</pubDate><description>${xmlEscape(document.excerpt.slice(0, 500))}</description></item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ERX — أرشيف الشأن المصري</title><link>${xmlEscape(baseUrl)}</link><description>أحدث الوثائق الموثقة من مصادر الشأن المصري.</description><language>ar</language>${items}</channel></rss>`;
}

function openApiDocument(): unknown {
  const param = (name: string, type: string, description: string, extra: Record<string, unknown> = {}) => ({ name, in: "query", description, schema: { type, ...extra } });
  const limitParam = param("limit", "integer", "Maximum items to return.", { minimum: 1, maximum: 500 });
  const offsetParam = param("offset", "integer", "Number of items to skip.", { minimum: 0, default: 0 });
  const documentIdParam = param("document_id", "integer", "Filter by document id.", { minimum: 1 });
  const paged = (schemaRef: string) => ({ "200": { description: "Paginated result set.", content: { "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/PaginatedEnvelope" }, { type: "object", properties: schemaRef ? { [schemaRef]: { type: "array", items: { type: "object" } } } : {} }] } } } }, "422": { $ref: "#/components/responses/Invalid" } });
  const okObject = { "200": { description: "Success.", content: { "application/json": { schema: { type: "object" } } } } };
  return {
    openapi: "3.1.0",
    info: { title: "Egypt Research API", version: "1.3.0", description: "Source-grounded REST access to the ERX Egyptian public-affairs archive." },
    servers: [{ url: "/api/v1" }],
    paths: {
      "/api/v1/status": { get: { summary: "Service and archive status", responses: okObject } },
      "/api/v1/coverage": { get: { summary: "Archive coverage by topic and source health", responses: okObject } },
      "/api/v1/search": { get: { summary: "Search documents", parameters: [param("q", "string", "Query string (2-1000 characters).", { minLength: 2, maxLength: 1000 }), param("mode", "string", "Retrieval mode.", { enum: ["hybrid", "lexical"], default: "hybrid" }), limitParam, offsetParam], responses: paged("results") } },
      "/api/v1/documents/{document_id}": { get: { summary: "Get a source-backed document", parameters: [{ name: "document_id", in: "path", required: true, schema: { type: "integer", minimum: 1 } }], responses: { ...okObject, "404": { $ref: "#/components/responses/NotFound" } } } },
      "/api/v1/sources": { get: { summary: "List research sources", parameters: [limitParam, offsetParam], responses: paged("sources") } },
      "/api/v1/entities": { get: { summary: "List extracted entities", parameters: [documentIdParam, limitParam, offsetParam], responses: paged("entities") } },
      "/api/v1/events": { get: { summary: "List documented events", parameters: [documentIdParam, limitParam, offsetParam], responses: paged("events") } },
      "/api/v1/claims": { get: { summary: "List claims and evidence", responses: okObject } },
      "/api/v1/saved-searches": { get: { summary: "List saved searches", responses: okObject } },
      "/api/v1/live/datasets": { get: { summary: "List public live datasets", responses: okObject } },
      "/api/v1/live/data": { get: { summary: "Query a public live dataset", parameters: [param("source", "string", "Live dataset slug."), param("indicator", "string", "Indicator code."), param("country", "string", "Country filter."), param("period_from", "string", "Period lower bound."), param("period_to", "string", "Period upper bound."), param("period", "string", "Exact period."), limitParam], responses: { ...okObject, "422": { $ref: "#/components/responses/Invalid" }, "429": { description: "Rate limited." } } } },
      "/api/v1/live/health": { get: { summary: "Check live data source health", responses: okObject } },
      "/api/v1/openapi.json": { get: { summary: "This OpenAPI document", responses: okObject } }
    },
    components: {
      schemas: {
        PaginatedEnvelope: { type: "object", required: ["count", "total_count", "offset", "has_more", "next_offset"], properties: { count: { type: "integer", description: "Items returned in this page." }, total_count: { type: "integer", description: "Exact total across all pages." }, offset: { type: "integer" }, has_more: { type: "boolean" }, next_offset: { type: ["integer", "null"], description: "Offset for the next page, or null when exhausted." } } },
        Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code"], properties: { code: { type: "string" }, message: { type: "string" } } } } }
      },
      responses: {
        Invalid: { description: "Invalid request parameters.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        NotFound: { description: "Resource not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
      }
    }
  };
}

function securityHeaders(response: ServerResponse, requestId: string, secureOrigin: boolean): void {
  response.setHeader("x-request-id", requestId); response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin"); response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (secureOrigin) response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self' https://unpkg.com https://cdnjs.cloudflare.com; style-src 'self' 'sha256-bsV5JivYxvGywDAZ22EZJKBFip65Ng9xoJVLbBg7bdo=' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function rateState(request: IncomingMessage, limits: Map<string, { window: number; count: number }>, maximum: number, trustProxy: boolean): { blocked: boolean; count: number; reset: number } {
  const window = Math.floor(Date.now() / 60_000); const key = `${clientAddress(request, trustProxy)}:${window}`; const entry = limits.get(key); const reset = (window + 1) * 60;
  if (!entry) { limits.set(key, { window, count: 1 }); if (limits.size > 10_000) limits.clear(); return { blocked: false, count: 1, reset }; }
  const next = { ...entry, count: entry.count + 1 }; limits.set(key, next); return { blocked: next.count > maximum, count: next.count, reset };
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const addresses = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)?.split(",").map((address) => address.trim()).filter(Boolean) ?? [];
    const nearest = addresses.at(-1);
    if (nearest && isIP(nearest)) return nearest;
  }
  return request.socket.remoteAddress ?? "unknown";
}

function validOrigin(request: IncomingMessage, expectedOrigin: string): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).origin === expectedOrigin; }
  catch { return false; }
}

function wire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), wire(entry)]));
  return value;
}

async function readJson(request: IncomingMessage, maximum: number): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const buffer = Buffer.from(chunk as Uint8Array); size += buffer.length; if (size > maximum) throw new PayloadTooLargeError(); chunks.push(buffer); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

class PayloadTooLargeError extends Error {}

function html(response: ServerResponse, status: number, body: string): void { text(response, status, body, "text/html; charset=utf-8"); }
function text(response: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void { response.statusCode = status; response.setHeader("content-type", contentType); response.end(body); }
function json(response: ServerResponse, status: number, body: unknown, contentType = "application/json; charset=utf-8"): void { text(response, status, JSON.stringify(body), contentType); }
function jsonRpc(response: ServerResponse, status: number, code: number, message: string): void { json(response, status, { jsonrpc: "2.0", error: { code, message }, id: null }); }
function staticText(response: ServerResponse, body: string, contentType: string): void { response.setHeader("cache-control", "public, max-age=3600"); text(response, 200, body, contentType); }
function binary(response: ServerResponse, body: Buffer, contentType: string): void { response.statusCode = 200; response.setHeader("content-type", contentType); response.setHeader("cache-control", "public, max-age=86400"); response.end(body); }

export function normalizePublicBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("EGYPT_RESEARCH_PUBLIC_URL must be a clean HTTP(S) origin"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("EGYPT_RESEARCH_PUBLIC_URL must be a clean HTTP(S) origin");
  }
  return parsed.origin;
}
