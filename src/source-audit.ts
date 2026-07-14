import { load } from "cheerio";
import { hostAllowed, parseFeed, parseSitemap, readResponseBuffer } from "./collection.js";
import { SOURCE_CONNECTORS, type SourceConnector } from "./connectors.js";
import type { SourceRecord } from "./types.js";
import { VERSION } from "./version.js";

export type EndpointAuditStatus = "healthy" | "blocked" | "rate_limited" | "invalid_redirect" | "invalid_content" | "http_error" | "unreachable";
export type SourceAuditStatus = EndpointAuditStatus | "catalog_only";

export interface EndpointAudit {
  kind: "rss" | "sitemap" | "html" | "api";
  url: string;
  status: EndpointAuditStatus;
  httpStatus: number | null;
  items: number;
  detail: string | null;
}

export interface SourceAudit {
  slug: string;
  name: string;
  sourceType: SourceRecord["sourceType"];
  collectionMethod: SourceRecord["collectionMethod"];
  websiteType: "wordpress" | "drupal" | "aspnet" | "digital_commons" | "spa" | "custom" | "unknown";
  homepageReachable: boolean;
  status: SourceAuditStatus;
  endpoints: EndpointAudit[];
}

const USER_AGENT = `ERX-SourceAudit/${VERSION} (+https://erx-mcp.zad.tools)`;

interface Fetched {
  status: number;
  body: string;
  headers: Headers;
}

async function fetchForAudit(url: string, fetcher: typeof fetch): Promise<Fetched> {
  const response = await fetcher(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json,application/rss+xml,application/xml,text/xml,text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000)
  });
  const body = response.status >= 300 && response.status < 400 ? "" : (await readResponseBuffer(response, 10_000_000)).toString("utf8");
  return { status: response.status, body, headers: response.headers };
}

function websiteType(body: string, headers: Headers): SourceAudit["websiteType"] {
  const evidence = `${headers.get("x-powered-by") ?? ""}\n${body.slice(0, 500_000)}`.toLowerCase();
  if (evidence.includes("wp-content") || evidence.includes("wordpress")) return "wordpress";
  if (evidence.includes("drupalsettings") || evidence.includes("/sites/default/") || evidence.includes("content=\"drupal")) return "drupal";
  if (evidence.includes("__viewstate") || evidence.includes("asp.net") || evidence.includes("aspnet")) return "aspnet";
  if (evidence.includes("digitalcommons") || evidence.includes("bepress")) return "digital_commons";
  if (evidence.includes("/_next/") || evidence.includes("__nuxt") || evidence.includes("ng-version")) return "spa";
  return body ? "custom" : "unknown";
}

async function auditEndpoint(kind: EndpointAudit["kind"], url: string, sourceHost: string, fetcher: typeof fetch): Promise<EndpointAudit> {
  try {
    const response = await fetchForAudit(url, fetcher);
    if (response.status >= 300 && response.status < 400) return { kind, url, status: "invalid_redirect", httpStatus: response.status, items: 0, detail: response.headers.get("location") };
    if (response.status === 401 || response.status === 403) return { kind, url, status: "blocked", httpStatus: response.status, items: 0, detail: `HTTP ${response.status}` };
    if (response.status === 429) return { kind, url, status: "rate_limited", httpStatus: 429, items: 0, detail: "HTTP 429" };
    if (response.status < 200 || response.status >= 300) return { kind, url, status: "http_error", httpStatus: response.status, items: 0, detail: `HTTP ${response.status}` };
    const items = kind === "rss"
      ? parseFeed(response.body, "audit").filter((entry) => hostAllowed(new URL(entry.canonicalUrl).hostname, sourceHost)).length
      : kind === "sitemap" ? parseSitemap(response.body, sourceHost, 5_000).urls.length : 0;
    return items > 0
      ? { kind, url, status: "healthy", httpStatus: response.status, items, detail: null }
      : { kind, url, status: "invalid_content", httpStatus: response.status, items: 0, detail: `No valid ${kind === "rss" ? "feed entries" : "sitemap URLs"}` };
  } catch (error) {
    return { kind, url, status: "unreachable", httpStatus: null, items: 0, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function auditConnector(connector: SourceConnector, sourceHost: string, fetcher: typeof fetch): Promise<EndpointAudit> {
  const kind = connector.kind;
  const url = kind === "html" ? connector.listingUrl : connector.endpointUrl;
  try {
    const response = await fetchForAudit(url, fetcher);
    if (response.status >= 300 && response.status < 400) return { kind, url, status: "invalid_redirect", httpStatus: response.status, items: 0, detail: response.headers.get("location") };
    if (response.status === 401 || response.status === 403) return { kind, url, status: "blocked", httpStatus: response.status, items: 0, detail: `HTTP ${response.status}` };
    if (response.status === 429) return { kind, url, status: "rate_limited", httpStatus: 429, items: 0, detail: "HTTP 429" };
    if (response.status < 200 || response.status >= 300) return { kind, url, status: "http_error", httpStatus: response.status, items: 0, detail: `HTTP ${response.status}` };
    let items = 0;
    if (connector.kind === "html") {
      const pattern = new RegExp(connector.articlePathPattern, "i");
      const $ = load(response.body); const urls = new Set<string>();
      for (const anchor of $("a[href]").toArray()) {
        try {
          const candidate = new URL($(anchor).attr("href") ?? "", connector.listingUrl);
          if (hostAllowed(candidate.hostname, sourceHost) && pattern.test(candidate.pathname)) urls.add(candidate.href);
        } catch { /* malformed link */ }
      }
      items = urls.size;
    } else {
      const payload = JSON.parse(response.body) as unknown;
      const rows = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : [];
      items = rows.length;
    }
    return items > 0
      ? { kind, url, status: "healthy", httpStatus: response.status, items, detail: null }
      : { kind, url, status: "invalid_content", httpStatus: response.status, items: 0, detail: `No valid ${kind === "html" ? "article links" : "API records"}` };
  } catch (error) {
    return { kind, url, status: "unreachable", httpStatus: null, items: 0, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function auditSource(source: SourceRecord, fetcher: typeof fetch = fetch, connector: SourceConnector | undefined = SOURCE_CONNECTORS[source.slug]): Promise<SourceAudit> {
  const sourceHost = new URL(source.url).hostname;
  const homepagePromise = fetchForAudit(source.url, fetcher).catch(() => null);
  const endpointPromises = [
    ...(source.feedUrl ? [auditEndpoint("rss", source.feedUrl, sourceHost, fetcher)] : []),
    ...(source.sitemapUrl ? [auditEndpoint("sitemap", source.sitemapUrl, sourceHost, fetcher)] : []),
    ...(connector ? [auditConnector(connector, sourceHost, fetcher)] : [])
  ];
  const [homepage, endpoints] = await Promise.all([homepagePromise, Promise.all(endpointPromises)]);
  const healthy = endpoints.some((endpoint) => endpoint.status === "healthy");
  const status: SourceAuditStatus = healthy ? "healthy" : endpoints.some((endpoint) => endpoint.status === "blocked") ? "blocked"
    : endpoints.some((endpoint) => endpoint.status === "rate_limited") ? "rate_limited"
      : endpoints[0]?.status ?? "catalog_only";
  return {
    slug: source.slug, name: source.name, sourceType: source.sourceType, collectionMethod: source.collectionMethod,
    websiteType: websiteType(homepage?.body ?? "", homepage?.headers ?? new Headers()),
    homepageReachable: Boolean(homepage && homepage.status >= 200 && homepage.status < 300), status, endpoints
  };
}

export async function auditSources(sources: SourceRecord[], fetcher: typeof fetch = fetch, concurrency = 6): Promise<SourceAudit[]> {
  const size = Math.max(1, Math.min(Math.floor(concurrency), 20));
  let reports: SourceAudit[] = [];
  for (let offset = 0; offset < sources.length; offset += size) {
    reports = [...reports, ...await Promise.all(sources.slice(offset, offset + size).map((source) => auditSource(source, fetcher)))];
  }
  return reports;
}

export function summarizeSourceAudits(reports: SourceAudit[]): Record<string, number> {
  return reports.reduce<Record<string, number>>((summary, report) => ({ ...summary, [report.status]: (summary[report.status] ?? 0) + 1 }), { total: reports.length });
}
