import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MIGRATIONS, SCHEMA } from "./schema.js";
import { headlineTokens, jaccard, normalizeArabic, tokenizeQuery } from "./text.js";
import type {
  ClaimRecord,
  DocumentInput,
  EntityRecord,
  EventRecord,
  SearchOptions,
  SearchResult,
  SourceInput,
  SourceRecord,
  SourceType
} from "./types.js";

type Row = Record<string, unknown>;

export interface StoreOptions {
  readonly?: boolean;
}

export interface UpsertResult {
  documentId: number;
  createdVersion: boolean;
}

const now = (): string => new Date().toISOString();
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const asString = (value: unknown): string => String(value ?? "");
const asNullableString = (value: unknown): string | null => value === null || value === undefined ? null : String(value);
const asNumber = (value: unknown): number => Number(value);

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(asString(value)) as T;
  } catch {
    return fallback;
  }
}

function validateHttpUrl(value: string, field: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`${field} must use http or https`);
}

function validateDate(value: string | null | undefined, field: string): void {
  if (value !== null && value !== undefined && Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an ISO date`);
}

export class ResearchStore {
  readonly path: string;
  readonly readonly: boolean;
  private readonly db: DatabaseSync;

  constructor(path: string, options: StoreOptions = {}) {
    this.path = resolve(path);
    this.readonly = options.readonly ?? false;
    if (!this.readonly) mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path, { readOnly: this.readonly, timeout: 5_000 });
    this.db.exec("PRAGMA foreign_keys = ON");
    if (!this.readonly) this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL");
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  initialize(): void {
    if (this.readonly) throw new Error("Cannot initialize a readonly store");
    this.db.exec(SCHEMA);
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const applied = new Set(this.db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number((row as Row)["version"])));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      this.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, now());
      });
    }
  }

  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  integrityCheck(): string {
    const row = this.db.prepare("PRAGMA integrity_check").get() as Row | undefined;
    return asString(row?.["integrity_check"]);
  }

  count(table: "sources" | "documents" | "document_versions" | "stories" | "entities" | "events" | "claims"): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as Row;
    return asNumber(row["count"]);
  }

  upsertSource(source: SourceInput): number {
    if (!/^[a-z0-9][a-z0-9-]+$/.test(source.slug)) throw new Error("Invalid source slug");
    validateHttpUrl(source.url, "url");
    if (source.feedUrl) validateHttpUrl(source.feedUrl, "feedUrl");
    if (source.sitemapUrl) validateHttpUrl(source.sitemapUrl, "sitemapUrl");
    let method = source.collectionMethod ?? "catalog";
    if (method === "catalog") method = source.feedUrl && source.sitemapUrl ? "hybrid" : source.feedUrl ? "rss" : source.sitemapUrl ? "sitemap" : "catalog";
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO sources (slug, name, url, source_type, ownership_type, language, feed_url, sitemap_url,
        collection_method, crawl_delay_seconds, content_license, robots_policy, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET name=excluded.name, url=excluded.url, source_type=excluded.source_type,
        ownership_type=excluded.ownership_type, language=excluded.language, feed_url=excluded.feed_url,
        sitemap_url=excluded.sitemap_url, collection_method=excluded.collection_method,
        crawl_delay_seconds=excluded.crawl_delay_seconds, content_license=excluded.content_license,
        robots_policy=excluded.robots_policy, active=excluded.active, updated_at=excluded.updated_at
    `).run(
      source.slug, source.name, source.url, source.sourceType, source.ownershipType, source.language,
      source.feedUrl ?? null, source.sitemapUrl ?? null, method, source.crawlDelaySeconds ?? 1,
      source.contentLicense ?? "unknown", source.robotsPolicy ?? "respect", source.active === false ? 0 : 1,
      timestamp, timestamp
    );
    const row = this.db.prepare("SELECT id FROM sources WHERE slug = ?").get(source.slug) as Row;
    return asNumber(row["id"]);
  }

  listSources(): SourceRecord[] {
    const rows = this.db.prepare(`
      SELECT s.*, COUNT(d.id) AS document_count FROM sources s
      LEFT JOIN documents d ON d.source_id=s.id GROUP BY s.id ORDER BY s.name
    `).all() as Row[];
    return rows.map((row) => this.sourceRecord(row));
  }

  getSource(slug: string): SourceRecord | null {
    const row = this.db.prepare(`
      SELECT s.*, COUNT(d.id) AS document_count FROM sources s LEFT JOIN documents d ON d.source_id=s.id
      WHERE s.slug=? GROUP BY s.id
    `).get(slug) as Row | undefined;
    return row ? this.sourceRecord(row) : null;
  }

  updateSourceHealth(slug: string, status: string): void {
    const timestamp = now();
    const result = status === "healthy"
      ? this.db.prepare("UPDATE sources SET health_status=?, last_crawled_at=?, last_success_at=?, consecutive_failures=0, updated_at=? WHERE slug=?").run(status, timestamp, timestamp, timestamp, slug)
      : status === "failed"
        ? this.db.prepare("UPDATE sources SET health_status=?, last_crawled_at=?, last_error_at=?, consecutive_failures=consecutive_failures+1, updated_at=? WHERE slug=?").run(status, timestamp, timestamp, timestamp, slug)
        : this.db.prepare("UPDATE sources SET health_status=?, last_crawled_at=?, updated_at=? WHERE slug=?").run(status, timestamp, timestamp, slug);
    if (Number(result.changes) === 0) throw new Error(`Unknown source: ${slug}`);
  }

  startCrawlRun(sourceSlug: string): number {
    const source = this.db.prepare("SELECT id FROM sources WHERE slug=?").get(sourceSlug) as Row | undefined;
    if (!source) throw new Error(`Unknown source: ${sourceSlug}`);
    const result = this.db.prepare("INSERT INTO crawl_runs (source_id, started_at, status) VALUES (?, ?, 'running')").run(source["id"] as number, now());
    return Number(result.lastInsertRowid);
  }

  finishCrawlRun(runId: number, status: string, itemsFound = 0, itemsSaved = 0, errorCode: string | null = null, errorMessage: string | null = null): void {
    const row = this.db.prepare("SELECT started_at FROM crawl_runs WHERE id=?").get(runId) as Row | undefined;
    if (!row) throw new Error(`Unknown crawl run: ${runId}`);
    const finishedAt = now();
    const duration = Date.parse(finishedAt) - Date.parse(asString(row["started_at"]));
    this.db.prepare("UPDATE crawl_runs SET finished_at=?, status=?, items_found=?, items_saved=?, error_code=?, error_message=?, duration_ms=? WHERE id=?")
      .run(finishedAt, status, itemsFound, itemsSaved, errorCode, errorMessage, duration, runId);
  }

  listCrawlRuns(sourceSlug?: string, limit = 50): Row[] {
    const safeLimit = clamp(limit, 1, 500);
    return sourceSlug
      ? this.db.prepare("SELECT r.*, s.slug AS source_slug FROM crawl_runs r JOIN sources s ON s.id=r.source_id WHERE s.slug=? ORDER BY r.started_at DESC LIMIT ?").all(sourceSlug, safeLimit) as Row[]
      : this.db.prepare("SELECT r.*, s.slug AS source_slug FROM crawl_runs r JOIN sources s ON s.id=r.source_id ORDER BY r.started_at DESC LIMIT ?").all(safeLimit) as Row[];
  }

  upsertDocument(document: DocumentInput): UpsertResult {
    validateHttpUrl(document.canonicalUrl, "canonicalUrl");
    validateDate(document.publishedAt, "publishedAt");
    validateDate(document.eventAt, "eventAt");
    if (document.title.trim().length < 2) throw new Error("title is too short");
    const excerpt = document.excerpt ?? "";
    const content = document.content ?? "";
    const topics = document.topics ?? [];
    const digest = createHash("sha256").update(JSON.stringify([document.title, excerpt, content])).digest("hex");
    const timestamp = now();
    return this.transaction(() => {
      const source = this.db.prepare("SELECT id FROM sources WHERE slug=?").get(document.sourceSlug) as Row | undefined;
      if (!source) throw new Error(`Unknown source: ${document.sourceSlug}`);
      const current = this.db.prepare("SELECT id, content_hash FROM documents WHERE external_id=? OR canonical_url=?").get(document.externalId, document.canonicalUrl) as Row | undefined;
      const createdVersion = !current || asString(current["content_hash"]) !== digest;
      let documentId: number;
      if (!current) {
        const result = this.db.prepare(`
          INSERT INTO documents (external_id, source_id, canonical_url, title, excerpt, content, published_at, event_at,
            archived_at, document_type, topics_json, language, content_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(document.externalId, source["id"] as number, document.canonicalUrl, document.title, excerpt, content,
          document.publishedAt ?? null, document.eventAt ?? null, timestamp, document.documentType ?? "article",
          JSON.stringify(topics), document.language ?? "ar", digest, timestamp, timestamp);
        documentId = Number(result.lastInsertRowid);
      } else {
        documentId = asNumber(current["id"]);
        this.db.prepare(`
          UPDATE documents SET source_id=?, canonical_url=?, title=?, excerpt=?, content=?, published_at=?, event_at=?,
            document_type=?, topics_json=?, language=?, content_hash=?, updated_at=? WHERE id=?
        `).run(source["id"] as number, document.canonicalUrl, document.title, excerpt, content,
          document.publishedAt ?? null, document.eventAt ?? null, document.documentType ?? "article",
          JSON.stringify(topics), document.language ?? "ar", digest, timestamp, documentId);
      }
      if (createdVersion) this.db.prepare(`
        INSERT OR IGNORE INTO document_versions (document_id, content_hash, title, excerpt, content, captured_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(documentId, digest, document.title, excerpt, content, timestamp);
      this.db.prepare("DELETE FROM documents_fts WHERE document_id=?").run(documentId);
      this.db.prepare("INSERT INTO documents_fts VALUES (?, ?, ?, ?, ?)").run(
        documentId, normalizeArabic(document.title), normalizeArabic(excerpt), normalizeArabic(content), normalizeArabic(topics.join(" "))
      );
      return { documentId, createdVersion };
    });
  }

  versionCount(documentId: number): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM document_versions WHERE document_id=?").get(documentId) as Row;
    return asNumber(row["count"]);
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = clamp(options.limit ?? 20, 1, 100);
    const tokens = tokenizeQuery(query);
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    let join = "";
    let rank = "0";
    if (tokens.length > 0) {
      join = "JOIN documents_fts f ON f.document_id=d.id";
      conditions.push("documents_fts MATCH ?");
      parameters.push(tokens.map((token) => `\"${token.replaceAll('"', '""')}\"`).join(" AND "));
      rank = "bm25(documents_fts)";
    }
    if (options.sourceTypes?.length) {
      conditions.push(`s.source_type IN (${options.sourceTypes.map(() => "?").join(",")})`);
      parameters.push(...options.sourceTypes);
    }
    if (options.dateFrom) { conditions.push("date(COALESCE(d.event_at,d.published_at,d.archived_at)) >= date(?)"); parameters.push(options.dateFrom); }
    if (options.dateTo) { conditions.push("date(COALESCE(d.event_at,d.published_at,d.archived_at)) <= date(?)"); parameters.push(options.dateTo); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    parameters.push(limit);
    const rows = this.db.prepare(`
      SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type, ${rank} AS rank
      FROM documents d JOIN sources s ON s.id=d.source_id ${join} ${where}
      ORDER BY ${tokens.length ? "rank, d.published_at DESC" : "d.published_at DESC"} LIMIT ?
    `).all(...parameters) as Row[];
    return rows.map((row) => this.searchResult(row));
  }

  getDocument(documentId: number): SearchResult | null {
    const row = this.db.prepare(`SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type
      FROM documents d JOIN sources s ON s.id=d.source_id WHERE d.id=?`).get(documentId) as Row | undefined;
    return row ? { ...this.searchResult(row), content: asString(row["content"]) } : null;
  }

  getDocumentByUrl(url: string): SearchResult | null {
    const row = this.db.prepare(`SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type
      FROM documents d JOIN sources s ON s.id=d.source_id WHERE d.canonical_url=?`).get(url) as Row | undefined;
    return row ? { ...this.searchResult(row), content: asString(row["content"]) } : null;
  }

  timeline(query: string, limit = 100): Row[] {
    return this.search(query, { limit }).map((result) => {
      const occurredAt = result.eventAt ?? result.publishedAt ?? result.archivedAt;
      const dateBasis = result.eventAt ? "event_at" : result.publishedAt ? "published_at" : "archived_at";
      return { documentId: result.documentId, occurredAt, dateBasis, title: result.title, sourceName: result.sourceName, citation: result.citation };
    }).sort((left, right) => asString(left["occurredAt"]).localeCompare(asString(right["occurredAt"])));
  }

  documentsOnDate(date: string, limit = 100): SearchResult[] {
    const rows = this.db.prepare(`SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type
      FROM documents d JOIN sources s ON s.id=d.source_id
      WHERE date(COALESCE(d.published_at,d.archived_at))=date(?)
      ORDER BY COALESCE(d.published_at,d.archived_at) DESC LIMIT ?`).all(date, clamp(limit, 1, 100)) as Row[];
    return rows.map((row) => this.searchResult(row));
  }

  listEntities(options: { documentId?: number; limit?: number } = {}): EntityRecord[] {
    const limit = clamp(options.limit ?? 100, 1, 500);
    const rows = options.documentId === undefined
      ? this.db.prepare(`SELECT e.*, SUM(de.mentions) AS mentions, COUNT(DISTINCT de.document_id) AS document_count
          FROM entities e JOIN document_entities de ON de.entity_id=e.id GROUP BY e.id
          ORDER BY document_count DESC, mentions DESC LIMIT ?`).all(limit) as Row[]
      : this.db.prepare(`SELECT e.*, SUM(de.mentions) AS mentions, COUNT(DISTINCT de.document_id) AS document_count
          FROM entities e JOIN document_entities de ON de.entity_id=e.id WHERE de.document_id=? GROUP BY e.id
          ORDER BY document_count DESC, mentions DESC LIMIT ?`).all(options.documentId, limit) as Row[];
    return rows.map((row) => ({ id: asNumber(row["id"]), canonicalName: asString(row["canonical_name"]), entityType: asString(row["entity_type"]), aliases: parseJson(row["aliases_json"], []), mentions: asNumber(row["mentions"]), documentCount: asNumber(row["document_count"]) }));
  }

  listClaims(options: { documentId?: number; limit?: number } = {}): ClaimRecord[] {
    const limit = clamp(options.limit ?? 100, 1, 500);
    const claims = options.documentId === undefined
      ? this.db.prepare("SELECT DISTINCT c.* FROM claims c JOIN claim_evidence ce ON ce.claim_id=c.id ORDER BY c.last_seen_at DESC LIMIT ?").all(limit) as Row[]
      : this.db.prepare("SELECT DISTINCT c.* FROM claims c JOIN claim_evidence ce ON ce.claim_id=c.id WHERE ce.document_id=? ORDER BY c.last_seen_at DESC LIMIT ?").all(options.documentId, limit) as Row[];
    return claims.map((claim) => {
      const evidence = this.db.prepare(`SELECT ce.*, d.title, d.canonical_url, s.name AS source_name
        FROM claim_evidence ce JOIN documents d ON d.id=ce.document_id JOIN sources s ON s.id=d.source_id
        WHERE ce.claim_id=? ORDER BY ce.confidence DESC`).all(claim["id"] as number) as Row[];
      return {
        id: asNumber(claim["id"]), claimText: asString(claim["claim_text"]), claimType: asString(claim["claim_type"]),
        firstSeenAt: asString(claim["first_seen_at"]), lastSeenAt: asString(claim["last_seen_at"]), reviewStatus: asString(claim["review_status"]),
        evidence: evidence.map((row) => ({ documentId: asNumber(row["document_id"]), title: asString(row["title"]), sourceName: asString(row["source_name"]), canonicalUrl: asString(row["canonical_url"]), stance: asString(row["stance"]), quote: asString(row["quote"]), confidence: asNumber(row["confidence"]) }))
      };
    });
  }

  listEvents(options: { documentId?: number; limit?: number } = {}): EventRecord[] {
    const limit = clamp(options.limit ?? 100, 1, 500);
    const events = options.documentId === undefined
      ? this.db.prepare("SELECT DISTINCT e.* FROM events e JOIN event_documents ed ON ed.event_id=e.id ORDER BY COALESCE(e.occurred_at,e.created_at) DESC LIMIT ?").all(limit) as Row[]
      : this.db.prepare("SELECT DISTINCT e.* FROM events e JOIN event_documents ed ON ed.event_id=e.id WHERE ed.document_id=? ORDER BY COALESCE(e.occurred_at,e.created_at) DESC LIMIT ?").all(options.documentId, limit) as Row[];
    return events.map((event) => {
      const documents = this.db.prepare(`SELECT ed.role, d.id, d.title, d.canonical_url, s.name AS source_name
        FROM event_documents ed JOIN documents d ON d.id=ed.document_id JOIN sources s ON s.id=d.source_id WHERE ed.event_id=?`).all(event["id"] as number) as Row[];
      return { id: asNumber(event["id"]), title: asString(event["title"]), summary: asString(event["summary"]), occurredAt: asNullableString(event["occurred_at"]), eventType: asString(event["event_type"]), location: asNullableString(event["location"]), documents: documents.map((row) => ({ documentId: asNumber(row["id"]), title: asString(row["title"]), sourceName: asString(row["source_name"]), canonicalUrl: asString(row["canonical_url"]), role: asString(row["role"]) })) };
    });
  }

  listStories(limit = 20): Row[] {
    const stories = this.db.prepare(`SELECT st.*, COUNT(sd.document_id) AS document_count, COUNT(DISTINCT d.source_id) AS source_count
      FROM stories st JOIN story_documents sd ON sd.story_id=st.id JOIN documents d ON d.id=sd.document_id
      GROUP BY st.id ORDER BY st.last_seen_at DESC LIMIT ?`).all(clamp(limit, 1, 100)) as Row[];
    return stories.map((story) => ({
      id: asNumber(story["id"]), title: asString(story["title"]), firstSeenAt: asString(story["first_seen_at"]),
      lastSeenAt: asString(story["last_seen_at"]), documentCount: asNumber(story["document_count"]), sourceCount: asNumber(story["source_count"]),
      documents: (this.db.prepare(`SELECT d.id, d.title, d.canonical_url, d.published_at, s.slug AS source_slug, s.name AS source_name
        FROM story_documents sd JOIN documents d ON d.id=sd.document_id JOIN sources s ON s.id=d.source_id
        WHERE sd.story_id=? ORDER BY d.published_at DESC`).all(story["id"] as number) as Row[]).map((row) => ({ documentId: asNumber(row["id"]), sourceSlug: asString(row["source_slug"]), sourceName: asString(row["source_name"]), title: asString(row["title"]), canonicalUrl: asString(row["canonical_url"]), publishedAt: asNullableString(row["published_at"]) }))
    }));
  }

  assignStory(documentId: number, threshold = 0.45): number {
    const document = this.db.prepare("SELECT title, COALESCE(published_at,archived_at) AS seen_at FROM documents WHERE id=?").get(documentId) as Row | undefined;
    if (!document) throw new Error(`Unknown document: ${documentId}`);
    const linked = this.db.prepare("SELECT story_id FROM story_documents WHERE document_id=?").get(documentId) as Row | undefined;
    if (linked) return asNumber(linked["story_id"]);
    const tokens = headlineTokens(asString(document["title"]));
    const candidates = this.db.prepare("SELECT * FROM stories WHERE datetime(last_seen_at) BETWEEN datetime(?, '-7 days') AND datetime(?, '+7 days') ORDER BY last_seen_at DESC LIMIT 500").all(document["seen_at"] as string, document["seen_at"] as string) as Row[];
    let best: Row | undefined;
    let score = threshold;
    for (const candidate of candidates) {
      const candidateScore = jaccard(tokens, new Set(parseJson<string[]>(candidate["tokens_json"], [])));
      if (candidateScore >= score) { best = candidate; score = candidateScore; }
    }
    const storyId = this.transaction(() => {
      if (best) {
        const id = asNumber(best["id"]);
        this.db.prepare("UPDATE stories SET first_seen_at=MIN(first_seen_at,?), last_seen_at=MAX(last_seen_at,?) WHERE id=?").run(document["seen_at"] as string, document["seen_at"] as string, id);
        return id;
      }
      const result = this.db.prepare("INSERT INTO stories (title,tokens_json,first_seen_at,last_seen_at) VALUES (?,?,?,?)").run(asString(document["title"]), JSON.stringify([...tokens].sort()), document["seen_at"] as string, document["seen_at"] as string);
      return Number(result.lastInsertRowid);
    });
    this.db.prepare("INSERT INTO story_documents (story_id,document_id) VALUES (?,?)").run(storyId, documentId);
    return storyId;
  }

  saveSearch(name: string, query: string, filters: Row = {}): Row {
    const cleanName = name.trim(); const cleanQuery = query.trim();
    if (cleanName.length < 2 || cleanName.length > 200) throw new Error("Saved search name must be between 2 and 200 characters");
    if (cleanQuery.length < 2 || cleanQuery.length > 1_000) throw new Error("Saved search query must be between 2 and 1000 characters");
    this.db.prepare(`INSERT INTO saved_searches (name,query,filters_json,created_at) VALUES (?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET query=excluded.query, filters_json=excluded.filters_json`).run(cleanName, cleanQuery, JSON.stringify(filters), now());
    const row = this.db.prepare("SELECT * FROM saved_searches WHERE name=?").get(cleanName) as Row;
    return { id: asNumber(row["id"]), name: asString(row["name"]), query: asString(row["query"]), filters: parseJson(row["filters_json"], {}), createdAt: asString(row["created_at"]), lastRunAt: asNullableString(row["last_run_at"]) };
  }

  listSavedSearches(limit = 100): Row[] {
    return (this.db.prepare("SELECT * FROM saved_searches ORDER BY created_at DESC LIMIT ?").all(clamp(limit, 1, 500)) as Row[]).map((row) => ({
      id: asNumber(row["id"]), name: asString(row["name"]), query: asString(row["query"]), filters: parseJson(row["filters_json"], {}), createdAt: asString(row["created_at"]), lastRunAt: asNullableString(row["last_run_at"])
    }));
  }

  listEmbeddings(provider: string, model: string, limit = 20_000): Array<[number, number[]]> {
    const rows = this.db.prepare("SELECT document_id, vector_json FROM document_embeddings WHERE provider=? AND model=? LIMIT ?").all(provider, model, clamp(limit, 1, 50_000)) as Row[];
    return rows.map((row) => [asNumber(row["document_id"]), parseJson<number[]>(row["vector_json"], [])]);
  }

  listDocumentIds(limit = 10_000): number[] {
    return (this.db.prepare("SELECT id FROM documents ORDER BY id LIMIT ?").all(clamp(limit, 1, 100_000)) as Row[]).map((row) => asNumber(row["id"]));
  }

  resetDocumentKnowledge(documentId: number): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM document_entities WHERE document_id=?").run(documentId);
      this.db.prepare("DELETE FROM claim_evidence WHERE document_id=?").run(documentId);
    });
  }

  purgeOrphanKnowledge(): void {
    this.transaction(() => {
      this.db.exec("DELETE FROM claims WHERE id NOT IN (SELECT claim_id FROM claim_evidence)");
      this.db.exec("DELETE FROM entities WHERE id NOT IN (SELECT entity_id FROM document_entities)");
      this.db.exec("DELETE FROM events WHERE id NOT IN (SELECT event_id FROM event_documents)");
    });
  }

  linkEntity(documentId: number, canonicalName: string, entityType: string, mentions: number, confidence: number, aliases: string[] = []): number {
    const normalized = normalizeArabic(canonicalName);
    return this.transaction(() => {
      this.db.prepare(`INSERT INTO entities (canonical_name,normalized_name,entity_type,aliases_json,created_at) VALUES (?,?,?,?,?)
        ON CONFLICT(normalized_name,entity_type) DO UPDATE SET canonical_name=excluded.canonical_name, aliases_json=excluded.aliases_json`)
        .run(canonicalName, normalized, entityType, JSON.stringify(aliases), now());
      const entity = this.db.prepare("SELECT id FROM entities WHERE normalized_name=? AND entity_type=?").get(normalized, entityType) as Row;
      const entityId = asNumber(entity["id"]);
      this.db.prepare(`INSERT INTO document_entities (document_id,entity_id,mentions,confidence) VALUES (?,?,?,?)
        ON CONFLICT(document_id,entity_id) DO UPDATE SET mentions=excluded.mentions, confidence=excluded.confidence`)
        .run(documentId, entityId, mentions, confidence);
      return entityId;
    });
  }

  upsertClaim(documentId: number, claimText: string, claimType = "reported_statement", stance = "reports", confidence = 0.75): number {
    const normalized = normalizeArabic(claimText);
    const timestamp = now();
    return this.transaction(() => {
      this.db.prepare(`INSERT INTO claims (claim_text,normalized_claim,claim_type,first_seen_at,last_seen_at) VALUES (?,?,?,?,?)
        ON CONFLICT(normalized_claim) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(claimText, normalized, claimType, timestamp, timestamp);
      const claim = this.db.prepare("SELECT id FROM claims WHERE normalized_claim=?").get(normalized) as Row;
      const claimId = asNumber(claim["id"]);
      this.db.prepare(`INSERT INTO claim_evidence (claim_id,document_id,stance,quote,confidence) VALUES (?,?,?,?,?)
        ON CONFLICT(claim_id,document_id) DO UPDATE SET stance=excluded.stance, quote=excluded.quote, confidence=excluded.confidence`)
        .run(claimId, documentId, stance, claimText, confidence);
      return claimId;
    });
  }

  upsertEventForDocument(documentId: number, event: { title: string; summary: string; occurredAt: string | null; eventType: string; location: string | null }): number {
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT event_id FROM event_documents WHERE document_id=?").get(documentId) as Row | undefined;
      if (existing) {
        const eventId = asNumber(existing["event_id"]);
        this.db.prepare("UPDATE events SET title=?, summary=?, occurred_at=?, event_type=?, location=? WHERE id=?")
          .run(event.title, event.summary, event.occurredAt, event.eventType, event.location, eventId);
        return eventId;
      }
      const result = this.db.prepare("INSERT INTO events (title,summary,occurred_at,event_type,location,created_at) VALUES (?,?,?,?,?,?)")
        .run(event.title, event.summary, event.occurredAt, event.eventType, event.location, now());
      const eventId = Number(result.lastInsertRowid);
      this.db.prepare("INSERT INTO event_documents (event_id,document_id) VALUES (?,?)").run(eventId, documentId);
      return eventId;
    });
  }

  upsertEmbedding(documentId: number, provider: string, model: string, vector: number[], contentHash: string): void {
    this.db.prepare(`INSERT INTO document_embeddings (document_id,provider,model,dimensions,vector_json,content_hash,created_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(document_id,provider,model) DO UPDATE SET dimensions=excluded.dimensions,
      vector_json=excluded.vector_json, content_hash=excluded.content_hash, created_at=excluded.created_at`)
      .run(documentId, provider, model, vector.length, JSON.stringify(vector), contentHash, now());
  }

  upsertDocumentAsset(asset: { documentId: number; url: string; mediaType: string; sha256: string; byteSize: number; pageCount?: number | null; extractedWith: string; ocrUsed?: boolean; storagePath?: string | null }): number {
    validateHttpUrl(asset.url, "asset url");
    this.db.prepare(`INSERT INTO document_assets (document_id,url,media_type,sha256,byte_size,page_count,extracted_with,ocr_used,storage_path,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(document_id,url,sha256) DO UPDATE SET page_count=excluded.page_count,
      extracted_with=excluded.extracted_with, ocr_used=excluded.ocr_used, storage_path=excluded.storage_path`)
      .run(asset.documentId, asset.url, asset.mediaType, asset.sha256, asset.byteSize, asset.pageCount ?? null, asset.extractedWith, asset.ocrUsed ? 1 : 0, asset.storagePath ?? null, now());
    const row = this.db.prepare("SELECT id FROM document_assets WHERE document_id=? AND url=? AND sha256=?").get(asset.documentId, asset.url, asset.sha256) as Row;
    return asNumber(row["id"]);
  }

  private sourceRecord(row: Row): SourceRecord {
    return {
      slug: asString(row["slug"]), name: asString(row["name"]), url: asString(row["url"]), sourceType: asString(row["source_type"]) as SourceType,
      ownershipType: asString(row["ownership_type"]), language: asString(row["language"]) as "ar" | "en" | "mixed",
      feedUrl: asNullableString(row["feed_url"]), sitemapUrl: asNullableString(row["sitemap_url"]), collectionMethod: asString(row["collection_method"]) as "catalog" | "rss" | "sitemap" | "hybrid",
      crawlDelaySeconds: asNumber(row["crawl_delay_seconds"]), contentLicense: asString(row["content_license"]), robotsPolicy: asString(row["robots_policy"]) as "respect" | "allowlist_only",
      lastSuccessAt: asNullableString(row["last_success_at"]), lastErrorAt: asNullableString(row["last_error_at"]), consecutiveFailures: asNumber(row["consecutive_failures"]),
      active: Boolean(row["active"]), healthStatus: asString(row["health_status"]), lastCrawledAt: asNullableString(row["last_crawled_at"]), documentCount: asNumber(row["document_count"])
    };
  }

  private searchResult(row: Row): SearchResult {
    const publishedAt = asNullableString(row["published_at"]);
    const archivedAt = asString(row["archived_at"]);
    return {
      documentId: asNumber(row["id"]), externalId: asString(row["external_id"]), sourceSlug: asString(row["source_slug"]), sourceName: asString(row["source_name"]),
      sourceType: asString(row["source_type"]) as SourceType, title: asString(row["title"]), excerpt: asString(row["excerpt"]), canonicalUrl: asString(row["canonical_url"]),
      publishedAt, eventAt: asNullableString(row["event_at"]), archivedAt, documentType: asString(row["document_type"]), topics: parseJson(row["topics_json"], []),
      citation: { title: asString(row["title"]), sourceName: asString(row["source_name"]), url: asString(row["canonical_url"]), publishedAt, archivedAt }
    };
  }
}
