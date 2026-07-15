import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { EXPORT_FORMATS, exportResults, type ExportFormat } from "./exports.js";
import { checkLiveSources, compareLiveData, getLiveData, listLiveDatasets, LIVE_SOURCE_SLUGS, type LiveQuery } from "./live-data.js";
import { HybridRetriever } from "./retrieval.js";
import { TOPICS } from "./text.js";
import type { ResearchStore } from "./store.js";
import { SOURCE_TYPES } from "./types.js";
import { VERSION } from "./version.js";

export const TOOL_NAMES = [
  "search_egypt", "get_document", "build_timeline", "compare_sources", "get_source_profile",
  "list_sources", "get_daily_brief", "list_stories", "export_references", "hybrid_search",
  "research_dossier", "find_entities", "list_events", "trace_claim", "compare_claims", "save_research_query"
  , "list_live_datasets", "get_live_data", "compare_live_data", "live_source_health"
] as const;

export const METHODOLOGY = {
  purpose: "بنية بحثية موثقة المصدر للشأن المصري، وليست جهة تحقق أو إصدار أحكام.",
  principles: [
    "إرجاع رابط المصدر الأصلي وتاريخ النشر مع كل نتيجة.",
    "الفصل بين تاريخ الواقعة وتاريخ نشر الوثيقة وتاريخ أرشفتها.",
    "عرض نوع المصدر وملكيته دون منحه درجة حقيقة آلية.",
    "عدم اعتبار تكرار الادعاء في مصادر متعددة دليلاً نهائياً على صحته.",
    "الاحتفاظ بإصدارات الوثيقة عند تغير محتواها."
  ],
  limitations: [
    "قد تتأخر بعض المصادر بسبب الحجب أو تغير بنية الموقع.",
    "المواد غير المتاحة عبر قناة مباشرة موثقة تظهر في الكتالوج دون ادعاء جمعها."
  ]
} as const;

function toSnake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnake);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), toSnake(entry)]));
  }
  return value;
}

function toolResult(payload: Record<string, unknown>) {
  const wire = toSnake(payload) as Record<string, unknown>;
  return { content: [{ type: "text" as const, text: JSON.stringify(wire, null, 2) }], structuredContent: wire };
}

function toolError(code: string, message: string) {
  return { ...toolResult({ ok: false, error: { code, message } }), isError: true };
}

function liveQuery(input: { source: LiveQuery["source"]; indicator?: string | undefined; query?: string | undefined; country?: string | undefined; period_from?: string | undefined; period_to?: string | undefined; period?: string | undefined; limit?: number | undefined; refugee_dimension?: "origin" | "asylum" | undefined; flow_code?: "M" | "X" | "X,M" | undefined }): LiveQuery {
  return {
    source: input.source,
    ...(input.indicator ? { indicator: input.indicator } : {}),
    ...(input.query ? { query: input.query } : {}),
    ...(input.country ? { country: input.country } : {}),
    ...(input.period_from ? { periodFrom: input.period_from } : {}),
    ...(input.period_to ? { periodTo: input.period_to } : {}),
    ...(input.period ? { period: input.period } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.refugee_dimension ? { refugeeDimension: input.refugee_dimension } : {}),
    ...(input.flow_code ? { flowCode: input.flow_code } : {})
  };
}

function buildResearchDossier(store: ResearchStore, query: string, results: ReturnType<ResearchStore["search"]>) {
  const sourceTypes: Record<string, number> = {};
  const entities = new Map<number, ReturnType<ResearchStore["listEntities"]>[number]>();
  const claims = new Map<number, ReturnType<ResearchStore["listClaims"]>[number]>();
  for (const result of results) {
    sourceTypes[result.sourceType] = (sourceTypes[result.sourceType] ?? 0) + 1;
    for (const entity of store.listEntities({ documentId: result.documentId, limit: 100 })) entities.set(entity.id, entity);
    for (const claim of store.listClaims({ documentId: result.documentId, limit: 100 })) claims.set(claim.id, claim);
  }
  const dates = results.map((result) => result.eventAt ?? result.publishedAt ?? result.archivedAt).sort();
  const timeline = results.map((result) => ({
    documentId: result.documentId,
    occurredAt: result.eventAt ?? result.publishedAt ?? result.archivedAt,
    dateBasis: result.eventAt ? "event_at" : result.publishedAt ? "published_at" : "archived_at",
    title: result.title,
    sourceName: result.sourceName,
    citation: result.citation
  })).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  return {
    query,
    coverage: {
      documentCount: results.length,
      sourceCount: new Set(results.map((result) => result.sourceSlug)).size,
      sourceTypes,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null
    },
    results: results.map((result) => ({ ...result, excerpt: result.excerpt.slice(0, 800) })),
    timeline,
    entities: [...entities.values()].sort((left, right) => right.documentCount - left.documentCount),
    claims: [...claims.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
  };
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export interface McpOptions { allowWrites?: boolean }

export function createMcpServer(store: ResearchStore, options: McpOptions = {}): McpServer {
  const server = new McpServer({
    name: "ERX — Egypt Research Commons",
    version: VERSION,
    description: "مصادر وأدلة وخطوط زمنية موثقة للباحثين في الشأن المصري"
  }, {
    instructions: "ابحث في مصادر الشأن المصري وأعد النتائج مع الاستشهادات. لا تصف الادعاءات بأنها حقائق مؤكدة دون مقارنة مصادر مستقلة ووثائق أولية."
  });

  server.registerTool("search_egypt", {
    description: "بحث موحد في الوثائق المصرية مع فلاتر المصدر والتاريخ.",
    inputSchema: {
      query: z.string().min(1), source_types: z.array(z.enum(SOURCE_TYPES)).optional(), date_from: z.string().optional(),
      date_to: z.string().optional(), limit: z.number().int().min(1).max(100).default(20)
    }, annotations: readOnly
  }, ({ query, source_types, date_from, date_to, limit }) => {
    const results = store.search(query, { limit, ...(source_types ? { sourceTypes: source_types } : {}), ...(date_from ? { dateFrom: date_from } : {}), ...(date_to ? { dateTo: date_to } : {}) });
    return toolResult({ query, count: results.length, results: results.map((result) => ({ ...result, excerpt: result.excerpt.slice(0, 800) })) });
  });

  server.registerTool("get_document", { description: "استرجاع سجل وثيقة واحد مع بيانات الاستشهاد.", inputSchema: { document_id: z.number().int().positive() }, annotations: readOnly }, ({ document_id }) => {
    const document = store.getDocument(document_id);
    return toolResult(document ? { ok: true, document } : { ok: false, error: { code: "not_found", documentId: document_id } });
  });

  server.registerTool("build_timeline", { description: "بناء خط زمني موثق لموضوع أو قضية أو كيان.", inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).default(100) }, annotations: readOnly }, ({ query, limit }) => {
    const items = store.timeline(query, limit);
    return toolResult({ query, count: items.length, items });
  });

  server.registerTool("compare_sources", { description: "مقارنة تغطية أنواع مختلفة من المصادر لنفس الاستعلام.", inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).default(50) }, annotations: readOnly }, ({ query, limit }) => {
    const results = store.search(query, { limit });
    const bySourceType: Record<string, unknown[]> = {};
    for (const result of results) (bySourceType[result.sourceType] ??= []).push(result);
    return toolResult({ query, totalDocuments: results.length, independentSourceCount: new Set(results.map((result) => result.sourceSlug)).size, bySourceType });
  });

  server.registerTool("get_source_profile", { description: "عرض نوع المصدر وملكيته وصحة جمعه وعدد وثائقه.", inputSchema: { source_slug: z.string().min(1) }, annotations: readOnly }, ({ source_slug }) => {
    const source = store.getSource(source_slug);
    return toolResult(source ? { ok: true, source } : { ok: false, error: { code: "source_not_found", sourceSlug: source_slug } });
  });

  server.registerTool("list_sources", { description: "عرض كتالوج المصادر وحالة الأرشفة لكل مصدر.", inputSchema: { source_type: z.enum(SOURCE_TYPES).optional(), active_only: z.boolean().default(true) }, annotations: readOnly }, ({ source_type, active_only }) => {
    const sources = store.listSources().filter((source) => (!source_type || source.sourceType === source_type) && (!active_only || source.active));
    return toolResult({ count: sources.length, sources });
  });

  server.registerTool("get_daily_brief", { description: "إرجاع مواد يوم محدد مع قياس تنوع المصادر.", inputSchema: { date: z.string().min(8), limit: z.number().int().min(1).max(100).default(50) }, annotations: readOnly }, ({ date, limit }) => {
    const items = store.documentsOnDate(date, limit);
    return toolResult({ date, documentCount: items.length, sourceCount: new Set(items.map((item) => item.sourceSlug)).size, items });
  });

  server.registerTool("list_stories", { description: "عرض القصص المتقاربة مع عدد الوثائق وتنوع المصادر.", inputSchema: { limit: z.number().int().min(1).max(100).default(20) }, annotations: readOnly }, ({ limit }) => {
    const stories = store.listStories(limit);
    return toolResult({ count: stories.length, stories });
  });

  server.registerTool("export_references", { description: "تصدير نتائج البحث بصيغة CSV أو JSONL أو BibTeX أو RIS.", inputSchema: { query: z.string().min(1), format: z.enum(EXPORT_FORMATS).default("ris"), limit: z.number().int().min(1).max(100).default(100) }, annotations: readOnly }, ({ query, format, limit }) => {
    const results = store.search(query, { limit });
    return toolResult({ ok: true, format, count: results.length, content: exportResults(results, format as ExportFormat) });
  });

  server.registerTool("hybrid_search", { description: "بحث هجين يجمع المطابقة النصية والدلالية مع تفسير الترتيب وفلاتر النوع والفترة.", inputSchema: {
    query: z.string().min(1), source_types: z.array(z.enum(SOURCE_TYPES)).optional(), date_from: z.string().optional(), date_to: z.string().optional(), limit: z.number().int().min(1).max(100).default(20)
  }, annotations: readOnly }, ({ query, source_types, date_from, date_to, limit }) => {
    const results = new HybridRetriever(store).search(query, { limit, ...(source_types ? { sourceTypes: source_types } : {}), ...(date_from ? { dateFrom: date_from } : {}), ...(date_to ? { dateTo: date_to } : {}) });
    return toolResult({ query, count: results.length, results });
  });

  server.registerTool("research_dossier", { description: "حزمة بحث موثقة تجمع البحث الهجين والنتائج والخط الزمني والكيانات والادعاءات وتنوع المصادر.", inputSchema: {
    query: z.string().min(1), source_types: z.array(z.enum(SOURCE_TYPES)).optional(), date_from: z.string().optional(), date_to: z.string().optional(), limit: z.number().int().min(1).max(50).default(20)
  }, annotations: readOnly }, ({ query, source_types, date_from, date_to, limit }) => {
    const results = new HybridRetriever(store).search(query, { limit, ...(source_types ? { sourceTypes: source_types } : {}), ...(date_from ? { dateFrom: date_from } : {}), ...(date_to ? { dateTo: date_to } : {}) });
    return toolResult(buildResearchDossier(store, query, results));
  });

  server.registerTool("find_entities", { description: "عرض الكيانات المستخرجة وأعداد ظهورها في الوثائق.", inputSchema: { document_id: z.number().int().positive().optional(), limit: z.number().int().min(1).max(500).default(100) }, annotations: readOnly }, ({ document_id, limit }) => {
    const entities = store.listEntities({ limit, ...(document_id ? { documentId: document_id } : {}) });
    return toolResult({ count: entities.length, entities });
  });

  server.registerTool("list_events", { description: "عرض الأحداث المؤرخة وربط كل حدث بوثائقه الأصلية.", inputSchema: { document_id: z.number().int().positive().optional(), limit: z.number().int().min(1).max(500).default(100) }, annotations: readOnly }, ({ document_id, limit }) => {
    const events = store.listEvents({ limit, ...(document_id ? { documentId: document_id } : {}) });
    return toolResult({ count: events.length, events });
  });

  server.registerTool("trace_claim", { description: "تتبع ادعاء واحد إلى الأدلة والمصادر التي أوردته.", inputSchema: { claim_id: z.number().int().positive() }, annotations: readOnly }, ({ claim_id }) => {
    const claim = store.listClaims({ limit: 500 }).find((item) => item.id === claim_id);
    return toolResult(claim ? { ok: true, claim } : { ok: false, error: { code: "claim_not_found" } });
  });

  server.registerTool("compare_claims", { description: "تجميع الادعاءات المتشابهة ومقارنة أنواع المواقف والأدلة التي أوردتها المصادر.", inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) }, annotations: readOnly }, ({ query, limit }) => {
    const clusters = store.compareClaims(query, limit);
    return toolResult({ query, count: clusters.length, clusters });
  });

  server.registerTool("list_live_datasets", { description: "عرض كتالوج البيانات الحية العامة التي تعمل بدون Token، مع البروتوكول والتغطية والترخيص.", inputSchema: {}, annotations: readOnly }, () => {
    return toolResult({ count: listLiveDatasets().length, datasets: listLiveDatasets() });
  });

  const liveInputSchema = {
    source: z.enum(LIVE_SOURCE_SLUGS), indicator: z.string().max(100).optional(), query: z.string().max(200).optional(), country: z.string().max(3).optional(),
    period_from: z.string().optional(), period_to: z.string().optional(), period: z.string().optional(), limit: z.number().int().min(1).max(100).default(20),
    refugee_dimension: z.enum(["origin", "asylum"]).optional(), flow_code: z.enum(["M", "X", "X,M"]).optional()
  } as const;

  server.registerTool("get_live_data", { description: "جلب بيانات مصر الحية من REST/OData مع قيمة المؤشر والفترة ورابط الاستعلام ووقت الجلب والتحذيرات.", inputSchema: liveInputSchema, annotations: readOnly }, async (input) => {
    try { return toolResult(await getLiveData(liveQuery(input)) as unknown as Record<string, unknown>); }
    catch (error) { return toolError(error instanceof Error && "code" in error ? String(error.code) : "live_source_error", error instanceof Error ? error.message : String(error)); }
  });

  const liveQuerySchema = z.object(liveInputSchema);
  server.registerTool("compare_live_data", { description: "جمع سلسلتين إلى أربع سلاسل حية للمقارنة مع إبقاء اختلاف الوحدات والمنهجيات ظاهرًا.", inputSchema: { queries: z.array(liveQuerySchema).min(1).max(4) }, annotations: readOnly }, async ({ queries }) => {
    try { return toolResult(await compareLiveData(queries.map((query) => liveQuery(query))) as unknown as Record<string, unknown>); }
    catch (error) { return toolError(error instanceof Error && "code" in error ? String(error.code) : "live_source_error", error instanceof Error ? error.message : String(error)); }
  });

  server.registerTool("live_source_health", { description: "اختبار قابلية الوصول الحالية لمصادر البيانات الحية وتمييز السليم عن المحدد بالمعدل أو المتوقف.", inputSchema: {}, annotations: readOnly }, async () => {
    try { return toolResult({ checkedAt: new Date().toISOString(), sources: await checkLiveSources() }); }
    catch (error) { return toolError("live_health_error", error instanceof Error ? error.message : String(error)); }
  });

  server.registerTool("save_research_query", { description: "حفظ استعلام بحثي محلي لإعادة تشغيله ومتابعته لاحقًا. الكتابة معطلة في نقطة MCP العامة.", inputSchema: { name: z.string().min(2).max(200), query: z.string().min(2).max(1000) }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, ({ name, query }) => {
    if (options.allowWrites === false) return { ...toolResult({ ok: false, error: { code: "remote_writes_disabled" } }), isError: true };
    return toolResult({ ok: true, savedSearch: store.saveSearch(name, query) });
  });

  const jsonResource = (uri: string, value: () => unknown) => server.registerResource(uri.split("//")[1] ?? uri, uri, { mimeType: "application/json" }, async () => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(toSnake(value()), null, 2) }] }));
  jsonResource("egypt://sources", () => store.listSources());
  jsonResource("egypt://taxonomy", () => TOPICS);
  jsonResource("egypt://methodology", () => METHODOLOGY);
  jsonResource("egypt://live-datasets", () => listLiveDatasets());
  server.registerResource("source-profile", new ResourceTemplate("egypt://source/{slug}", { list: undefined }), { mimeType: "application/json" }, async (uri, variables) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(toSnake(store.getSource(String(variables["slug"])) ?? { error: "source_not_found" }), null, 2) }] }));

  server.registerPrompt("research_brief", { description: "خطة موجز بحثي موثق ومتوازن عن موضوع مصري.", argsSchema: { topic: z.string().min(1), date_from: z.string().optional(), date_to: z.string().optional() } }, async ({ topic, date_from, date_to }) => ({ messages: [{ role: "user", content: { type: "text", text: `ابحث عن: ${topic}. الفترة: ${date_from || "غير محددة"} إلى ${date_to || "الآن"}. ابدأ بالوثائق الأولية، ثم قارن المصادر الرسمية والإعلامية والحقوقية، وابنِ خطًا زمنيًا. ضع رابطًا وتاريخًا بجانب كل ادعاء، واذكر فجوات الأدلة.` } }] }));
  server.registerPrompt("verify_claim", { description: "منهج للتحقق من ادعاء متعلق بالشأن المصري.", argsSchema: { claim: z.string().min(1) } }, async ({ claim }) => ({ messages: [{ role: "user", content: { type: "text", text: `تحقق من الادعاء التالي دون افتراض صحته: ${claim}. ابحث عن المصدر الأولي، وافصل بين التأكيد المستقل وإعادة النشر، واعرض الأدلة المؤيدة والمعارضة وما لا يمكن حسمه.` } }] }));

  return server;
}
