/**
 * Zero-dependency TypeScript client for the ERX (Egypt Research) REST API.
 *
 * Uses the global `fetch` API (Node.js 18+ or any modern browser). The ERX
 * API is read-only, requires no authentication, and returns snake_case JSON.
 *
 * @example
 * ```ts
 * import { ErxClient } from "./index.js";
 *
 * const client = new ErxClient();
 * const hits = await client.search("قانون العمل", { limit: 5 });
 * for (const result of hits.results) {
 *   console.log(result.document_id, result.title, "—", result.source_name);
 * }
 * ```
 *
 * @packageDocumentation
 */

export const DEFAULT_BASE_URL = "https://erx-mcp.zad.tools";
const API_PREFIX = "/api/v1";

/** A citation attached to every document/result. */
export interface Citation {
  title: string;
  source_name: string;
  url: string;
  published_at: string | null;
  archived_at: string;
}

/** A single search hit or document record (snake_case, as returned by the API). */
export interface SearchResult {
  document_id: number;
  external_id: string;
  source_slug: string;
  source_name: string;
  source_type: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  published_at: string | null;
  event_at: string | null;
  archived_at: string;
  document_type: string;
  topics: string[];
  citation: Citation;
  content?: string;
  retrieval_score?: number;
  match_reasons?: Array<"lexical" | "semantic">;
  ranking_explanation?: string;
}

/** Response envelope for {@link ErxClient.search}. */
export interface SearchResponse {
  query: string;
  mode: string;
  count: number;
  total_count?: number;
  offset?: number;
  has_more?: boolean;
  next_offset?: number;
  results: SearchResult[];
}

/** Response envelope for {@link ErxClient.getDocument}. */
export interface DocumentResponse {
  document: SearchResult;
}

/** A research source in the archive. */
export interface Source {
  slug: string;
  name: string;
  url: string;
  source_type: string;
  [key: string]: unknown;
}

/** Response envelope for {@link ErxClient.listSources}. */
export interface SourcesResponse {
  count: number;
  sources: Source[];
}

/** Response envelope for {@link ErxClient.entities}. */
export interface EntitiesResponse {
  count: number;
  entities: Array<Record<string, unknown>>;
}

/** Response envelope for {@link ErxClient.events}. */
export interface EventsResponse {
  count: number;
  events: Array<Record<string, unknown>>;
}

/** Response envelope for {@link ErxClient.claims}. */
export interface ClaimsResponse {
  count: number;
  claims: Array<Record<string, unknown>>;
}

/** Response envelope for {@link ErxClient.liveDatasets}. */
export interface LiveDatasetsResponse {
  count: number;
  datasets: Array<Record<string, unknown>>;
}

/** Generic object response for endpoints without a fixed shape. */
export type JsonObject = Record<string, unknown>;

/** Options accepted by the {@link ErxClient} constructor. */
export interface ErxClientOptions {
  /** Root URL of the ERX deployment. Defaults to {@link DEFAULT_BASE_URL}. */
  base_url?: string;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}

/** Options for {@link ErxClient.search}. */
export interface SearchOptions {
  mode?: "hybrid" | "lexical";
  limit?: number;
  offset?: number;
}

/** Thrown when the ERX API returns a non-2xx response or a request fails. */
export class ErxError extends Error {
  /** HTTP status code (`0` for transport-level failures such as timeouts). */
  readonly status: number;
  /** Raw response body text. */
  readonly body: string;
  /** The request URL that produced the error. */
  readonly url: string;

  constructor(status: number, body: string, url: string) {
    super(`ERX request to ${url} failed with status ${status}: ${body}`);
    this.name = "ErxError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

type QueryValue = string | number | boolean | undefined | null;

/** Thin, typed client for the ERX REST API. */
export class ErxClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: ErxClientOptions = {}) {
    this.baseUrl = (options.base_url ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 30_000;
  }

  // -- HTTP plumbing ----------------------------------------------------

  private buildUrl(path: string, params?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async fetchText(
    path: string,
    params?: Record<string, QueryValue>,
    accept = "*/*",
  ): Promise<string> {
    const url = this.buildUrl(path, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: accept, "User-Agent": "erx-client-ts/1.0" },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ErxError(0, reason, url);
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new ErxError(response.status, text, url);
    }
    return text;
  }

  private async fetchJson<T>(
    path: string,
    params?: Record<string, QueryValue>,
  ): Promise<T> {
    const text = await this.fetchText(path, params, "application/json");
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ErxError(0, `invalid JSON: ${reason}`, this.buildUrl(path, params));
    }
  }

  // -- Search & documents ----------------------------------------------

  /** Search the archive. */
  search(q: string, options: SearchOptions = {}): Promise<SearchResponse> {
    return this.fetchJson<SearchResponse>(`${API_PREFIX}/search`, {
      q,
      mode: options.mode ?? "hybrid",
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    });
  }

  /** Fetch a single source-backed document by its numeric id. */
  getDocument(documentId: number): Promise<DocumentResponse> {
    return this.fetchJson<DocumentResponse>(`${API_PREFIX}/documents/${documentId}`);
  }

  // -- Catalog & coverage ----------------------------------------------

  /** List all research sources. */
  listSources(): Promise<SourcesResponse> {
    return this.fetchJson<SourcesResponse>(`${API_PREFIX}/sources`);
  }

  /** Return the archive coverage report. */
  coverage(): Promise<JsonObject> {
    return this.fetchJson<JsonObject>(`${API_PREFIX}/coverage`);
  }

  /** List extracted entities, optionally scoped to one document. */
  entities(documentId?: number): Promise<EntitiesResponse> {
    return this.fetchJson<EntitiesResponse>(
      `${API_PREFIX}/entities`,
      documentId === undefined ? undefined : { document_id: documentId },
    );
  }

  /** List documented events. */
  events(): Promise<EventsResponse> {
    return this.fetchJson<EventsResponse>(`${API_PREFIX}/events`);
  }

  /** List claims and their supporting evidence. */
  claims(): Promise<ClaimsResponse> {
    return this.fetchJson<ClaimsResponse>(`${API_PREFIX}/claims`);
  }

  // -- Live data --------------------------------------------------------

  /** List available public live datasets. */
  liveDatasets(): Promise<LiveDatasetsResponse> {
    return this.fetchJson<LiveDatasetsResponse>(`${API_PREFIX}/live/datasets`);
  }

  /** Query a public live dataset. */
  liveData(
    source: string,
    params: Record<string, QueryValue> = {},
  ): Promise<JsonObject> {
    return this.fetchJson<JsonObject>(`${API_PREFIX}/live/data`, { source, ...params });
  }

  /** Check the health of live data sources. */
  liveHealth(): Promise<JsonObject> {
    return this.fetchJson<JsonObject>(`${API_PREFIX}/live/health`);
  }

  // -- Status & export --------------------------------------------------

  /** Return service and archive status. */
  status(): Promise<JsonObject> {
    return this.fetchJson<JsonObject>(`${API_PREFIX}/status`);
  }

  /**
   * Export search results as a citation file.
   *
   * @param q - Query string.
   * @param format - One of `"ris"`, `"bibtex"`, `"csv"` or `"jsonl"`.
   * @returns The raw exported document as text.
   */
  exportReferences(
    q: string,
    format: "ris" | "bibtex" | "csv" | "jsonl" = "ris",
  ): Promise<string> {
    return this.fetchText("/export", { q, format });
  }
}
