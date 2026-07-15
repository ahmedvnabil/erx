#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createBackup, restoreBackup, verifyBackup } from "./backup.js";
import { bootstrapCatalog } from "./catalog.js";
import { SOURCE_CONNECTORS } from "./connectors.js";
import { ApiIngestor, FeedIngestor, HtmlIngestor, SitemapIngestor, type IngestionReport } from "./ingestion.js";
import { KnowledgeIndexer } from "./knowledge.js";
import { createMcpServer } from "./mcp.js";
import { GeminiEmbeddingProvider, LocalEmbeddingProvider } from "./retrieval.js";
import { ResearchStore } from "./store.js";
import { auditSources, summarizeSourceAudits } from "./source-audit.js";
import { createWebServer } from "./web.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

interface Arguments { command: string; database: string; values: Map<string, string[]>; flags: Set<string> }

function parse(argv: string[]): Arguments {
  let command = ""; let database = process.env["EGYPT_RESEARCH_DB"] ?? "data/research.db";
  const values = new Map<string, string[]>(); const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--database") { database = argv[++index] ?? database; continue; }
    if (!token.startsWith("-") && !command) { command = token; continue; }
    if (token.startsWith("--")) {
      const next = argv[index + 1];
      if (next && !next.startsWith("-")) { const key = token.slice(2); values.set(key, [...(values.get(key) ?? []), next]); index += 1; }
      else flags.add(token.slice(2));
    }
  }
  return { command, database, values, flags };
}

const value = (args: Arguments, name: string, fallback = ""): string => args.values.get(name)?.at(-1) ?? fallback;
const number = (args: Arguments, name: string, fallback: number): number => Number(value(args, name, String(fallback)));
const output = (payload: unknown): void => { process.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`); };

async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parse(argv);
  if (!args.command || args.flags.has("help")) { output("Usage: egypt-research <init|seed|prune-sources|ingest|audit-sources|index|reclassify|rebuild-stories|rebuild-events|status|backup|verify-backup|restore|serve> [options]"); return args.command ? 0 : 2; }
  if (args.command === "verify-backup") { const input = value(args, "input"); output({ status: verifyBackup(input), backup: input }); return 0; }
  if (args.command === "backup") {
    const destination = value(args, "output", `backups/research-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.db`);
    output({ status: "ok", backup: await createBackup(args.database, destination) }); return 0;
  }
  if (args.command === "restore") {
    if (!args.flags.has("yes")) { output({ error: "restore_requires_yes" }); return 2; }
    const input = value(args, "input"); output({ status: "ok", restored: input, safety_backup: await restoreBackup(args.database, input) }); return 0;
  }
  const store = new ResearchStore(args.database);
  store.initialize();
  if (args.command === "init") { output(`Initialized ${store.path}`); store.close(); return 0; }
  if (args.command === "seed") { output(`Seeded ${bootstrapCatalog(store)} sources`); store.close(); return 0; }
  if (args.command === "prune-sources") {
    bootstrapCatalog(store);
    output({ status: "ok", sources: store.listSources().length }); store.close(); return 0;
  }
  if (args.command === "status") {
    const sources = store.listSources();
    if (args.flags.has("json")) output(sources);
    else output(sources.map((source) => `${source.slug.padEnd(30)} ${source.healthStatus.padEnd(10)} ${String(source.documentCount).padStart(5)} ${source.name}`).join("\n"));
    store.close(); return 0;
  }
  if (args.command === "reclassify") {
    const result = { ...store.reclassifyDocuments(), ...store.rebuildStories() };
    output({ status: "ok", ...result }); store.close(); return 0;
  }
  if (args.command === "rebuild-stories") {
    output({ status: "ok", ...store.rebuildStories() }); store.close(); return 0;
  }
  if (args.command === "rebuild-events") {
    store.clearEvents();
    const reports = new KnowledgeIndexer(store).backfill(100_000);
    output({ status: "ok", indexed: reports.length, events: reports.reduce((sum, report) => sum + report.events, 0) });
    store.close(); return 0;
  }
  if (args.command === "audit-sources") {
    bootstrapCatalog(store);
    const reports = await auditSources(store.listSources(), fetch, number(args, "concurrency", 6));
    output({ checkedAt: new Date().toISOString(), summary: summarizeSourceAudits(reports), sources: reports });
    store.close(); return reports.some((report) => !["healthy", "catalog_only"].includes(report.status)) ? 1 : 0;
  }
  if (args.command === "ingest") {
    bootstrapCatalog(store);
    const channel = value(args, "channel", "auto"); const selected = new Set(args.values.get("source") ?? []);
    if (!["auto", "rss", "sitemap", "html", "api"].includes(channel)) { output({ error: "unsupported_channel", channel }); store.close(); return 2; }
    const configuredForChannel = (source: ReturnType<typeof store.listSources>[number]): boolean => {
      const connector = SOURCE_CONNECTORS[source.slug];
      if (channel === "rss") return Boolean(source.feedUrl);
      if (channel === "sitemap") return Boolean(source.sitemapUrl);
      if (channel === "html") return connector?.kind === "html";
      if (channel === "api") return connector?.kind === "api";
      return Boolean(source.feedUrl || source.sitemapUrl || connector);
    };
    const sources = store.listSources().filter((source) => source.active && (!selected.size || selected.has(source.slug)) && configuredForChannel(source));
    const known = new Set(sources.map((source) => source.slug)); const missing = [...selected].filter((slug) => !known.has(slug));
    if (missing.length) { output({ error: "unknown_or_unconfigured_source", sources: missing.sort() }); store.close(); return 2; }
    const feed = new FeedIngestor(store, { fullText: args.flags.has("full-text") }); const sitemap = new SitemapIngestor(store);
    const html = new HtmlIngestor(store); const api = new ApiIngestor(store); const reports: IngestionReport[] = [];
    for (const source of sources) {
      const connector = SOURCE_CONNECTORS[source.slug];
      let primarySucceeded = false;
      if ((channel === "auto" || channel === "rss") && source.feedUrl) { const report = await feed.ingestSource(source.slug); reports.push(report); primarySucceeded ||= report.status === "success"; }
      if ((channel === "auto" || channel === "sitemap") && source.sitemapUrl) { const report = await sitemap.ingestSource(source.slug, number(args, "max-urls", 100)); reports.push(report); primarySucceeded ||= report.status === "success"; }
      if ((channel === "html" || (channel === "auto" && !primarySucceeded)) && connector?.kind === "html") reports.push(await html.ingestSource(source.slug, connector, number(args, "html-max-urls", 20)));
      if ((channel === "auto" || channel === "api") && connector?.kind === "api") reports.push(await api.ingestSource(source.slug, connector));
    }
    const failed = reports.some((report) => report.status === "failed" && (channel !== "auto" || !reports.some((candidate) => candidate.sourceSlug === report.sourceSlug && candidate.status === "success")));
    output(reports); store.close(); return failed ? 1 : 0;
  }
  if (args.command === "index") {
    const providerName = value(args, "provider", "local"); const limit = number(args, "limit", 10_000);
    if (providerName === "gemini") {
      const apiKey = process.env["GEMINI_API_KEY"] ?? "";
      if (!apiKey) { output({ error: "GEMINI_API_KEY_is_required" }); store.close(); return 2; }
      const provider = new GeminiEmbeddingProvider(apiKey); const reports = new KnowledgeIndexer(store).backfill(limit);
      for (const documentId of store.listDocumentIds(limit)) {
        const document = store.getDocument(documentId); if (!document) continue;
        const text = `${document.title}\n${document.excerpt}\n${document.content ?? ""}`;
        store.upsertEmbedding(documentId, provider.provider, provider.model, await provider.embed(text), createHash("sha256").update(text).digest("hex"));
      }
      output({ indexed: reports.length, entities: reports.reduce((sum, report) => sum + report.entities, 0), claims: reports.reduce((sum, report) => sum + report.claims, 0), events: reports.length, provider: provider.provider, model: provider.model });
    } else {
      const provider = new LocalEmbeddingProvider(); const reports = new KnowledgeIndexer(store, provider).backfill(limit);
      output({ indexed: reports.length, entities: reports.reduce((sum, report) => sum + report.entities, 0), claims: reports.reduce((sum, report) => sum + report.claims, 0), events: reports.length, provider: provider.provider, model: provider.model });
    }
    store.close(); return 0;
  }
  if (args.command === "serve") {
    bootstrapCatalog(store);
    if (value(args, "transport", "http") === "stdio") {
      const server = createMcpServer(store); const transport = new StdioServerTransport();
      await server.connect(transport as unknown as Transport);
      process.once("SIGINT", () => { void server.close().finally(() => { store.close(); process.exit(130); }); });
      return 0;
    }
    const host = value(args, "host", process.env["HOST"] ?? "127.0.0.1"); const port = number(args, "port", Number(process.env["PORT"] ?? 8000));
    const server = createWebServer(store);
    await new Promise<void>((resolve, reject) => server.listen(port, host, resolve).once("error", reject));
    process.stderr.write(`ERX — Egypt Research Commons listening on http://${host}:${port}\n`);
    process.once("SIGINT", () => server.close(() => { store.close(); process.exit(130); }));
    process.once("SIGTERM", () => server.close(() => { store.close(); process.exit(0); }));
    return 0;
  }
  store.close(); throw new Error(`Unsupported command: ${args.command}`);
}

main().then((code) => { if (code !== 0) process.exitCode = code; }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
