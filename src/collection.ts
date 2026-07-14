import { load } from "cheerio";
import { XMLParser } from "fast-xml-parser";

export interface FeedEntry {
  externalId: string;
  canonicalUrl: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  content: string;
}

export interface ExtractedArticle {
  title: string;
  excerpt: string;
  content: string;
  canonicalUrl: string;
}

const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const cleanText = (value: string): string => value.replace(/\s+/g, " ").replace(/\s+([.!؟،])/g, " $1").trim();

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("URL must use http or https");
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function stripMarkup(value: string): string {
  return cleanText(load(`<div>${value.replace(/<[^>]+>/g, " ")}</div>`)("div").text());
}

export function parseFeed(xml: string, sourceSlug: string): FeedEntry[] {
  const parsed = new XMLParser({ ignoreAttributes: false, cdataPropName: "#text", processEntities: true }).parse(xml) as Record<string, unknown>;
  const rss = parsed["rss"] as Record<string, unknown> | undefined;
  const channel = rss?.["channel"] as Record<string, unknown> | undefined;
  const feed = parsed["feed"] as Record<string, unknown> | undefined;
  const items = channel ? array(channel["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined) : array(feed?.["entry"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const results: FeedEntry[] = [];
  for (const item of items) {
    const rawLink = typeof item["link"] === "string" ? item["link"] : asLink(item["link"]);
    if (!rawLink) continue;
    let canonicalUrl: string;
    try { canonicalUrl = canonicalizeUrl(rawLink); } catch { continue; }
    const title = stripMarkup(textValue(item["title"]));
    if (!title) continue;
    const description = textValue(item["description"] ?? item["summary"] ?? item["content"]);
    const guid = textValue(item["guid"] ?? item["id"]) || canonicalUrl;
    const rawDate = textValue(item["pubDate"] ?? item["published"] ?? item["updated"]);
    const parsedDate = rawDate ? new Date(rawDate) : null;
    results.push({
      externalId: `${sourceSlug}:${guid}`,
      canonicalUrl,
      title,
      excerpt: stripMarkup(description),
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      content: ""
    });
  }
  return results;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(textValue).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return textValue(row["#text"] ?? row["__cdata"] ?? row["_"] ?? "");
  }
  return "";
}

function asLink(value: unknown): string {
  const links = array(value as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const preferred = links.find((link) => !link["@_rel"] || link["@_rel"] === "alternate") ?? links[0];
  return preferred ? textValue(preferred["@_href"] ?? preferred["#text"]) : "";
}

export function hostAllowed(hostname: string, allowedHost: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const allowed = allowedHost.toLowerCase().replace(/\.$/, "");
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function parseSitemap(xml: string, allowedHost: string, maxUrls = 5_000): { kind: "urlset" | "index"; urls: string[] } {
  const parsed = new XMLParser().parse(xml) as Record<string, unknown>;
  const root = (parsed["urlset"] ?? parsed["sitemapindex"]) as Record<string, unknown> | undefined;
  const kind = parsed["sitemapindex"] ? "index" : "urlset";
  const nodes = array(root?.[kind === "index" ? "sitemap" : "url"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const urls: string[] = [];
  for (const node of nodes) {
    if (urls.length >= maxUrls) break;
    try {
      const url = new URL(textValue(node["loc"]));
      if ((url.protocol === "http:" || url.protocol === "https:") && hostAllowed(url.hostname, allowedHost)) {
        const canonical = canonicalizeUrl(url.href);
        if (!urls.includes(canonical)) urls.push(canonical);
      }
    } catch { /* malformed sitemap entry */ }
  }
  return { kind, urls };
}

export function robotsAllows(robots: string, targetUrl: string, userAgent = "EgyptResearchMCP"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | undefined;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";
    if (!line.includes(":")) continue;
    const [rawKey, ...parts] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = parts.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current && value) current.rules.push({ allow: key === "allow", path: value });
  }
  const agent = userAgent.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((candidate) => agent.includes(candidate) || candidate.includes(agent)));
  const selected = specific.length ? specific : groups.filter((group) => group.agents.includes("*"));
  const path = new URL(targetUrl).pathname;
  const matching = selected.flatMap((group) => group.rules).filter((rule) => path.startsWith(rule.path)).sort((left, right) => right.path.length - left.path.length);
  return matching[0]?.allow ?? true;
}

export function extractArticle(html: string, canonicalUrl: string): ExtractedArticle {
  const $ = load(html);
  $("script,style,noscript,svg,nav,header,footer,aside,form").remove();
  const main = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("[role=main]").first();
  if (!main.length) return { title: "", excerpt: "", content: "", canonicalUrl };
  const title = cleanText(main.find("h1").first().text() || $("h1").first().text() || $("title").text());
  const content = cleanText(main.find("p,li,h2,h3,blockquote").map((_, element) => $(element).text()).get().join("\n"));
  if (!title || content.length < 40) return { title: "", excerpt: "", content: "", canonicalUrl };
  const description = $("meta[name=description]").attr("content") ?? $("meta[property='og:description']").attr("content") ?? "";
  return { title, excerpt: cleanText(description) || content.slice(0, 500), content, canonicalUrl };
}

export async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  const announcedLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(announcedLength) && announcedLength > maxBytes) throw new Error("Response exceeds size limit");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Response exceeds size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function fetchArticle(url: string, allowedHost: string, fetcher: typeof fetch = fetch): Promise<ExtractedArticle> {
  const parsed = new URL(url);
  if (!hostAllowed(parsed.hostname, allowedHost)) throw new Error("URL is outside the configured source host");
  const response = await fetcher(url, { headers: { "user-agent": "ERX-EgyptResearch/0.5 (+research; respectful crawler)", accept: "text/html,application/xhtml+xml" }, redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Article request failed with HTTP ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").includes("html")) throw new Error("Article response is not HTML");
  return extractArticle((await readResponseBuffer(response, 5_000_000)).toString("utf8"), canonicalizeUrl(url));
}
