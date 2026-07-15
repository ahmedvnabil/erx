export const LIVE_SOURCE_SLUGS = [
  "world-bank",
  "imf-datamapper",
  "who-gho",
  "unhcr",
  "crossref",
  "un-comtrade"
] as const;

export type LiveSourceSlug = (typeof LIVE_SOURCE_SLUGS)[number];
export type LiveTransport = "rest" | "odata" | "preview-rest";

export interface LiveDatasetDescriptor {
  slug: LiveSourceSlug;
  name: string;
  provider: string;
  transport: LiveTransport;
  baseUrl: string;
  auth: "none";
  freshness: string;
  updateFrequency: string;
  geography: string[];
  status: "active" | "preview";
  license: string;
  coverage: string[];
  notes: string[];
}

export interface LiveQuery {
  source: LiveSourceSlug;
  indicator?: string;
  query?: string;
  country?: string;
  periodFrom?: string;
  periodTo?: string;
  period?: string;
  limit?: number;
  refugeeDimension?: "origin" | "asylum";
  flowCode?: "M" | "X" | "X,M";
}

export interface LiveObservation {
  source: LiveSourceSlug;
  dataset: string;
  indicator: string;
  period: string | null;
  country: string | null;
  value: string | number | null;
  unit: string | null;
  dimensions: Record<string, string | number | null>;
  sourceUrl: string;
  retrievedAt: string;
}

export interface LiveDataResponse {
  source: LiveSourceSlug;
  dataset: string;
  query: LiveQuery;
  count: number;
  observations: LiveObservation[];
  retrievedAt: string;
  sourceUrl: string;
  license: string;
  warnings: string[];
}

export interface LiveSourceHealth {
  source: LiveSourceSlug;
  status: "healthy" | "rate_limited" | "unavailable";
  httpStatus: number | null;
  checkedAt: string;
  latencyMs: number | null;
  message: string | null;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class LiveDataError extends Error {
  constructor(public readonly code: "invalid_query" | "rate_limited" | "upstream_error" | "invalid_response", message: string, public readonly status?: number) {
    super(message);
    this.name = "LiveDataError";
  }
}

const DESCRIPTORS: readonly LiveDatasetDescriptor[] = [
  {
    slug: "world-bank",
    name: "World Bank — Egypt Indicators",
    provider: "World Bank",
    transport: "rest",
    baseUrl: "https://api.worldbank.org/v2",
    auth: "none",
    freshness: "حسب المؤشر، سنوي أو ربع سنوي",
    updateFrequency: "سنوي/ربع سنوي حسب المؤشر",
    geography: ["EGY", "العالم"],
    status: "active",
    license: "World Bank data terms; attribution required",
    coverage: ["الاقتصاد", "السكان", "الفقر", "التعليم", "الصحة", "التنمية"],
    notes: ["ISO3 country code: EGY", "JSON API بدون مفتاح"]
  },
  {
    slug: "imf-datamapper",
    name: "IMF DataMapper — Egypt",
    provider: "International Monetary Fund",
    transport: "rest",
    baseUrl: "https://www.imf.org/external/datamapper/api/v1",
    auth: "none",
    freshness: "حسب مجموعة المؤشر",
    updateFrequency: "سنوي/توقعات دورية",
    geography: ["EGY", "العالم"],
    status: "active",
    license: "IMF data terms; attribution required",
    coverage: ["الناتج", "التضخم", "الدين", "المالية العامة", "التوقعات"],
    notes: ["ISO3 country code: EGY", "الإصدار الحالي v2 وبدون مفتاح"]
  },
  {
    slug: "who-gho",
    name: "WHO Global Health Observatory",
    provider: "World Health Organization",
    transport: "odata",
    baseUrl: "https://ghoapi.azureedge.net/api",
    auth: "none",
    freshness: "حسب المؤشر",
    updateFrequency: "حسب تحديث WHO للمؤشر",
    geography: ["EGY", "العالم"],
    status: "active",
    license: "WHO data terms; attribution required",
    coverage: ["الصحة العامة", "الأمراض", "الوفيات", "العمر المتوقع", "النظم الصحية"],
    notes: ["OData filters supported", "ISO3 country code: EGY"]
  },
  {
    slug: "unhcr",
    name: "UNHCR Refugee Data Finder",
    provider: "UNHCR",
    transport: "rest",
    baseUrl: "https://api.unhcr.org/population/v1",
    auth: "none",
    freshness: "سنوي، مع nowcasting عند توفره",
    updateFrequency: "سنوي",
    geography: ["EGY", "بلدان الأصل واللجوء"],
    status: "active",
    license: "UNHCR data terms; confidentiality safeguards apply",
    coverage: ["اللاجئون", "طالبو اللجوء", "النازحون", "الحلول الدائمة", "الديموغرافيا"],
    notes: ["يمكن البحث حسب بلد الأصل أو اللجوء", "لا يعرض بيانات شخصية"]
  },
  {
    slug: "crossref",
    name: "Crossref Scholarly Metadata",
    provider: "Crossref",
    transport: "rest",
    baseUrl: "https://api.crossref.org",
    auth: "none",
    freshness: "بعد إيداع الناشر عادة خلال دقائق",
    updateFrequency: "شبه فوري",
    geography: ["مصر والعالم"],
    status: "active",
    license: "Crossref metadata reuse terms",
    coverage: ["الأبحاث", "DOI", "المؤلفون", "المجلات", "التمويل", "التصحيحات"],
    notes: ["بحث ببليوجرافي عام بدون تسجيل", "النص الكامل لا يأتي من Crossref"]
  },
  {
    slug: "un-comtrade",
    name: "UN Comtrade Preview — Egypt Trade",
    provider: "United Nations Statistics Division",
    transport: "preview-rest",
    baseUrl: "https://comtradeapi.un.org/public/v1/preview",
    auth: "none",
    freshness: "حسب نشر بيانات التجارة",
    updateFrequency: "شهري/سنوي حسب السلسلة",
    geography: ["EGY", "الشركاء التجاريون"],
    status: "preview",
    license: "UN Comtrade terms; preview and fair-use limits apply",
    coverage: ["الواردات", "الصادرات", "الشركاء التجاريون", "السلع"],
    notes: ["نستخدم preview العام فقط", "البيانات الكاملة والتحميلات الكبيرة قد تتطلب اشتراكًا"]
  }
] as const;

const DEFAULT_INDICATORS: Record<LiveSourceSlug, string> = {
  "world-bank": "SP.POP.TOTL",
  "imf-datamapper": "NGDP_RPCH",
  "who-gho": "WHOSIS_000001",
  unhcr: "population",
  crossref: "works",
  "un-comtrade": "trade"
};

const UNHCR_COUNTRY_CODES: Record<string, string> = { EGY: "ARE" };

const LIVE_CACHE_TTL_MS = 5 * 60_000;
const LIVE_CACHE = new Map<string, { body: unknown; status: number; url: string; expiresAt: number }>();
const HEALTH_CACHE_TTL_MS = 60_000;
let healthCache: { results: LiveSourceHealth[]; expiresAt: number } | undefined;
const FETCHER_IDS = new WeakMap<object, number>();
let nextFetcherId = 1;

function fetcherId(fetcher: Fetcher): string {
  if (fetcher === fetch) return "default";
  const object = fetcher as unknown as object;
  const existing = FETCHER_IDS.get(object);
  if (existing) return String(existing);
  const id = nextFetcherId++;
  FETCHER_IDS.set(object, id);
  return String(id);
}

export function listLiveDatasets(): LiveDatasetDescriptor[] {
  return DESCRIPTORS.map((descriptor) => ({ ...descriptor, coverage: [...descriptor.coverage], notes: [...descriptor.notes] }));
}

export function getLiveDataset(source: LiveSourceSlug): LiveDatasetDescriptor {
  const descriptor = DESCRIPTORS.find((item) => item.slug === source);
  if (!descriptor) throw new LiveDataError("invalid_query", `Unknown live source: ${source}`);
  return descriptor;
}

function token(value: string | undefined, label: string, fallback: string): string {
  const resolved = value?.trim() || fallback;
  if (!/^[A-Za-z0-9_.-]+$/.test(resolved)) throw new LiveDataError("invalid_query", `${label} contains unsupported characters`);
  return resolved;
}

function country(value: string | undefined): string {
  const resolved = (value?.trim() || "EGY").toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(resolved)) throw new LiveDataError("invalid_query", "country must be a two- or three-letter ISO code");
  return resolved;
}

function boundedLimit(value: number | undefined): number {
  const resolved = value ?? 20;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 100) throw new LiveDataError("invalid_query", "limit must be an integer between 1 and 100");
  return resolved;
}

function year(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}$/.test(value)) throw new LiveDataError("invalid_query", `${label} must be a four-digit year`);
  return value;
}

async function fetchJson(url: URL, fetcher: Fetcher): Promise<{ body: unknown; status: number; url: string }> {
  const cacheKey = `${fetcherId(fetcher)}:${url.toString()}`;
  if (fetcher === fetch) {
    const cached = LIVE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached;
    if (cached) LIVE_CACHE.delete(cacheKey);
  }
  let response: Response;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetcher(url, { headers: { accept: "application/json", "user-agent": "ERX-Egypt-Research/0.15 (+https://erx-mcp.zad.tools)" }, signal: AbortSignal.timeout(15_000) });
      if (response.status === 429 || response.status >= 500) {
        if (response.status === 429) throw new LiveDataError("rate_limited", "Live source rate limit reached", 429);
        throw new LiveDataError("upstream_error", `Live source returned HTTP ${response.status}`, response.status);
      }
      break;
    } catch (error) {
      lastError = error;
      if (error instanceof LiveDataError && error.code === "rate_limited") throw error;
      if (attempt === 2) throw new LiveDataError("upstream_error", error instanceof Error ? error.message : String(error));
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  if (!response!) throw new LiveDataError("upstream_error", lastError instanceof Error ? lastError.message : String(lastError));
  if (!response.ok) throw new LiveDataError("upstream_error", `Live source returned HTTP ${response.status}`, response.status);
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new LiveDataError("invalid_response", "Live source returned invalid JSON", response.status); }
  const result = { body, status: response.status, url: url.toString() };
  if (fetcher === fetch) LIVE_CACHE.set(cacheKey, { ...result, expiresAt: Date.now() + LIVE_CACHE_TTL_MS });
  return result;
}

export function clearLiveDataCache(): void {
  LIVE_CACHE.clear();
  healthCache = undefined;
}

function observation(source: LiveSourceSlug, dataset: string, indicator: string, period: string | null, countryCode: string | null, value: string | number | null, unit: string | null, dimensions: Record<string, string | number | null>, sourceUrl: string, retrievedAt: string): LiveObservation {
  return { source, dataset, indicator, period, country: countryCode, value, unit, dimensions, sourceUrl, retrievedAt };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null; }
function asNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null; }

async function worldBank(query: LiveQuery, fetcher: Fetcher, retrievedAt: string): Promise<LiveDataResponse> {
  const indicator = token(query.indicator, "indicator", DEFAULT_INDICATORS["world-bank"]);
  const countryCode = country(query.country);
  const limit = boundedLimit(query.limit);
  const from = year(query.periodFrom, "period_from"); const to = year(query.periodTo, "period_to");
  const url = new URL(`${getLiveDataset("world-bank").baseUrl}/country/${countryCode}/indicator/${indicator}`);
  url.searchParams.set("format", "json"); url.searchParams.set("per_page", String(limit));
  if (from || to) url.searchParams.set("date", `${from ?? to}:${to ?? from}`);
  const result = await fetchJson(url, fetcher);
  const payload = Array.isArray(result.body) ? result.body[1] : undefined;
  if (!Array.isArray(payload)) throw new LiveDataError("invalid_response", "World Bank response has no data array");
  const observations = payload.map((row: unknown) => {
    const item = asRecord(row);
    const countryRecord = asRecord(item["country"]);
    return observation("world-bank", "indicators", indicator, asString(item["date"]), countryCode, asNumber(item["value"]), asString(item["unit"]), { country_iso2: asString(countryRecord["id"]), indicator_name: asString(asRecord(item["indicator"])["value"]) }, result.url, retrievedAt);
  });
  return { source: "world-bank", dataset: "indicators", query, count: observations.length, observations, retrievedAt, sourceUrl: result.url, license: getLiveDataset("world-bank").license, warnings: ["القيم الفارغة تعني أن المؤشر غير متاح للفترة المطلوبة"] };
}

async function imf(query: LiveQuery, fetcher: Fetcher, retrievedAt: string): Promise<LiveDataResponse> {
  const indicator = token(query.indicator, "indicator", DEFAULT_INDICATORS["imf-datamapper"]);
  const countryCode = country(query.country);
  const url = new URL(`${getLiveDataset("imf-datamapper").baseUrl}/${indicator}/${countryCode}`);
  const from = year(query.periodFrom, "period_from"); const to = year(query.periodTo, "period_to");
  if (from || to) url.searchParams.set("periods", [from, to].filter(Boolean).join(","));
  const result = await fetchJson(url, fetcher);
  const root = asRecord(result.body); const values = asRecord(asRecord(root["values"])[indicator]); const countryValues = asRecord(values[countryCode]);
  const observations = Object.entries(countryValues).filter(([period]) => !from || period >= from).filter(([period]) => !to || period <= to).sort(([left], [right]) => right.localeCompare(left)).slice(0, boundedLimit(query.limit)).map(([period, value]) => observation("imf-datamapper", "datamapper", indicator, period, countryCode, asNumber(value), null, {}, result.url, retrievedAt));
  return { source: "imf-datamapper", dataset: "datamapper", query, count: observations.length, observations, retrievedAt, sourceUrl: result.url, license: getLiveDataset("imf-datamapper").license, warnings: ["قد تحتوي السلسلة على تقديرات وتوقعات؛ راجع metadata المؤشر"] };
}

async function who(query: LiveQuery, fetcher: Fetcher, retrievedAt: string): Promise<LiveDataResponse> {
  const indicator = token(query.indicator, "indicator", DEFAULT_INDICATORS["who-gho"]);
  const countryCode = country(query.country);
  const limit = boundedLimit(query.limit);
  const url = new URL(`${getLiveDataset("who-gho").baseUrl}/${indicator}`);
  const filters = [`SpatialDim eq '${countryCode}'`];
  const from = year(query.periodFrom, "period_from"); const to = year(query.periodTo, "period_to");
  if (from) filters.push(`TimeDim ge ${from}`); if (to) filters.push(`TimeDim le ${to}`);
  url.searchParams.set("$filter", filters.join(" and ")); url.searchParams.set("$orderby", "TimeDim desc"); url.searchParams.set("$top", String(limit)); url.searchParams.set("$format", "json");
  const result = await fetchJson(url, fetcher); const rows = asRecord(result.body)["value"];
  if (!Array.isArray(rows)) throw new LiveDataError("invalid_response", "WHO response has no value array");
  const observations = rows.map((row: unknown) => {
    const item = asRecord(row);
    return observation("who-gho", "gho", indicator, asString(item["TimeDim"]), asString(item["SpatialDim"]) ?? countryCode, asNumber(item["NumericValue"]) ?? asNumber(item["Value"]), asString(item["Dim1"]), { dimension: asString(item["Dim1"]), low: asNumber(item["Low"]), high: asNumber(item["High"]) }, result.url, retrievedAt);
  });
  return { source: "who-gho", dataset: "gho", query, count: observations.length, observations, retrievedAt, sourceUrl: result.url, license: getLiveDataset("who-gho").license, warnings: ["قد تختلف وحدة القياس حسب المؤشر"] };
}

async function unhcr(query: LiveQuery, fetcher: Fetcher, retrievedAt: string): Promise<LiveDataResponse> {
  const dimension = query.refugeeDimension ?? "asylum";
  const countryCode = country(query.country);
  const limit = boundedLimit(query.limit);
  const url = new URL(`${getLiveDataset("unhcr").baseUrl}/population/`);
  url.searchParams.set(dimension === "origin" ? "coo" : "coa", UNHCR_COUNTRY_CODES[countryCode] ?? countryCode); url.searchParams.set("limit", "100");
  const from = year(query.periodFrom, "period_from"); const to = year(query.periodTo, "period_to");
  if (from) url.searchParams.set("yearFrom", from); if (to) url.searchParams.set("yearTo", to);
  const result = await fetchJson(url, fetcher); const items = asRecord(result.body)["items"];
  if (!Array.isArray(items)) throw new LiveDataError("invalid_response", "UNHCR response has no items array");
  const metrics = ["refugees", "asylum_seekers", "idps", "ooc", "oip", "stateless", "returned_refugees", "returned_idps"];
  const observations: LiveObservation[] = [];
  for (const row of items.sort((left, right) => Number(asRecord(right)["year"] ?? 0) - Number(asRecord(left)["year"] ?? 0)).slice(0, limit)) {
    const item = asRecord(row); const period = asString(item["year"]);
    for (const metric of metrics) {
      const value = asNumber(item[metric]); if (value === null) continue;
      observations.push(observation("unhcr", "population", metric, period, countryCode, value, "persons", { dimension, origin: asString(item["coo_name"]) ?? asString(item["coo_id"]), asylum: asString(item["coa_name"]) ?? asString(item["coa_id"]) }, result.url, retrievedAt));
    }
  }
  return { source: "unhcr", dataset: "population", query, count: observations.length, observations, retrievedAt, sourceUrl: result.url, license: getLiveDataset("unhcr").license, warnings: ["UNHCR rounds small counts to protect confidentiality"] };
}

async function crossref(query: LiveQuery, fetcher: Fetcher, retrievedAt: string): Promise<LiveDataResponse> {
  const limit = boundedLimit(query.limit);
  const search = query.query?.trim() || "Egypt";
  if (search.length > 200) throw new LiveDataError("invalid_query", "query must be 200 characters or fewer");
  const url = new URL(`${getLiveDataset("crossref").baseUrl}/works`); url.searchParams.set("query", search); url.searchParams.set("rows", String(limit));
  const result = await fetchJson(url, fetcher); const items = asRecord(asRecord(result.body)["message"])["items"];
  if (!Array.isArray(items)) throw new LiveDataError("invalid_response", "Crossref response has no items array");
  const observations = items.map((row: unknown) => {
    const item = asRecord(row); const title = Array.isArray(item["title"]) ? asString(item["title"][0]) : asString(item["title"]); const issued = asRecord(item["issued"]); const dateParts = Array.isArray(issued["date-parts"]) ? issued["date-parts"][0] : undefined; const period = Array.isArray(dateParts) ? dateParts.map((part) => String(part)).join("-") : null;
    return observation("crossref", "works", "scholarly_work", period, null, title, null, { doi: asString(item["DOI"]), publisher: asString(item["publisher"]), type: asString(item["type"]), url: asString(item["URL"]) }, result.url, retrievedAt);
  });
  return { source: "crossref", dataset: "works", query, count: observations.length, observations, retrievedAt, sourceUrl: result.url, license: getLiveDataset("crossref").license, warnings: ["Crossref يعيد metadata؛ لا يعني وجود نص كامل متاح"] };
}

async function comtrade(query: LiveQuery, fetcher: Fetcher, retrievedAt: string): Promise<LiveDataResponse> {
  const period = query.period ?? String(new Date().getUTCFullYear() - 1);
  if (!/^\d{4}$/.test(period)) throw new LiveDataError("invalid_query", "period must be a four-digit year");
  const flowCode = query.flowCode ?? "X"; const limit = boundedLimit(query.limit);
  const url = new URL(`${getLiveDataset("un-comtrade").baseUrl}/C/A/HS`);
  url.searchParams.set("cmdCode", "TOTAL"); url.searchParams.set("flowCode", flowCode); url.searchParams.set("partnerCode", "0"); url.searchParams.set("period", period); url.searchParams.set("reporterCode", "818"); url.searchParams.set("motCode", "0"); url.searchParams.set("maxRecords", String(limit));
  const result = await fetchJson(url, fetcher); const rows = asRecord(result.body)["data"];
  if (!Array.isArray(rows)) throw new LiveDataError("invalid_response", "UN Comtrade response has no data array");
  const observations = rows.map((row: unknown) => { const item = asRecord(row); return observation("un-comtrade", "trade", "trade_value", asString(item["period"]) ?? period, asString(item["reporterISO"]) ?? "EGY", asNumber(item["primaryValue"]), "USD", { flow: asString(item["flowDesc"]) ?? flowCode, partner: asString(item["partnerDesc"]) ?? "World", commodity: asString(item["cmdDesc"]) ?? "TOTAL", quantity: asNumber(item["qty"]), net_weight: asNumber(item["netWgt"]) }, result.url, retrievedAt); });
  return { source: "un-comtrade", dataset: "trade", query, count: observations.length, observations, retrievedAt, sourceUrl: result.url, license: getLiveDataset("un-comtrade").license, warnings: ["هذه واجهة preview العامة وتخضع لحدود معدل الطلبات"] };
}

export async function getLiveData(query: LiveQuery, fetcher: Fetcher = fetch): Promise<LiveDataResponse> {
  getLiveDataset(query.source);
  const retrievedAt = new Date().toISOString();
  switch (query.source) {
    case "world-bank": return worldBank(query, fetcher, retrievedAt);
    case "imf-datamapper": return imf(query, fetcher, retrievedAt);
    case "who-gho": return who(query, fetcher, retrievedAt);
    case "unhcr": return unhcr(query, fetcher, retrievedAt);
    case "crossref": return crossref(query, fetcher, retrievedAt);
    case "un-comtrade": return comtrade(query, fetcher, retrievedAt);
  }
}

export async function compareLiveData(queries: LiveQuery[], fetcher: Fetcher = fetch): Promise<{ queries: LiveQuery[]; datasets: LiveDataResponse[]; retrievedAt: string; warnings: string[] }> {
  if (queries.length < 1 || queries.length > 4) throw new LiveDataError("invalid_query", "queries must contain between 1 and 4 requests");
  const datasets = await Promise.all(queries.map((query) => getLiveData(query, fetcher)));
  return { queries, datasets, retrievedAt: new Date().toISOString(), warnings: ["المقارنة تعرض السلاسل كما نشرها كل مصدر؛ لا تفترض تطابق الوحدات أو المنهجيات"] };
}

export async function checkLiveSources(fetcher: Fetcher = fetch): Promise<LiveSourceHealth[]> {
  if (fetcher === fetch && healthCache && healthCache.expiresAt > Date.now()) return healthCache.results.map((result) => ({ ...result }));
  const results: LiveSourceHealth[] = [];
  for (const descriptor of DESCRIPTORS) {
    const started = Date.now(); const checkedAt = new Date().toISOString();
    try {
      const response = await getLiveData({ source: descriptor.slug, limit: 1, query: "Egypt", period: String(new Date().getUTCFullYear() - 1) }, fetcher);
      results.push({ source: descriptor.slug, status: "healthy", httpStatus: 200, checkedAt, latencyMs: Date.now() - started, message: response.count === 0 ? "reachable_but_empty" : null });
    } catch (error) {
      const liveError = error instanceof LiveDataError ? error : undefined;
      results.push({ source: descriptor.slug, status: liveError?.code === "rate_limited" ? "rate_limited" : "unavailable", httpStatus: liveError?.status ?? null, checkedAt, latencyMs: Date.now() - started, message: liveError?.message ?? String(error) });
    }
  }
  if (fetcher === fetch) healthCache = { results: results.map((result) => ({ ...result })), expiresAt: Date.now() + HEALTH_CACHE_TTL_MS };
  return results;
}
