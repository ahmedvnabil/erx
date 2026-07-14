import { createHash } from "node:crypto";

import type { ResearchStore } from "./store.js";
import { normalizeArabic } from "./text.js";
import type { SearchOptions, SearchResult } from "./types.js";

const conceptGroups = [
  ["عامل", "عمال", "العاملين", "العماليه", "العمل", "حقوق"],
  ["قانون", "تشريع", "لائحه", "قرار"],
  ["سجن", "حبس", "احتجاز"],
  ["صحافه", "اعلام", "صحفي", "تعبير"],
  ["انتخاب", "انتخابات", "اقتراع"]
] as const;

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  embed(text: string): number[];
  embedQuery(text: string): number[];
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "local";
  readonly model: string;
  readonly dimensions: number;

  constructor(dimensions = 256) {
    if (dimensions < 64 || dimensions > 4_096) throw new Error("dimensions must be between 64 and 4096");
    this.dimensions = dimensions;
    this.model = `arabic-hash-v1-${dimensions}`;
  }

  embed(text: string): number[] {
    const normalized = normalizeArabic(text);
    const tokens = normalized.split(" ").filter(Boolean);
    const tokenSet = new Set(tokens);
    const expanded = [...tokens];
    for (const group of conceptGroups) if (group.some((token) => tokenSet.has(token))) expanded.push(...group);
    const trigrams = [...normalized].map((_, index) => normalized.slice(index, index + 3)).filter((value) => value.length === 3 && !value.includes(" "));
    const vector = Array.from({ length: this.dimensions }, () => 0);
    for (const feature of [...expanded, ...trigrams]) {
      const digest = createHash("sha256").update(feature).digest();
      const bucket = digest.readUInt32BE(0) % this.dimensions;
      vector[bucket] = (vector[bucket] ?? 0) + (digest[4]! % 2 === 0 ? 1 : -1);
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return norm ? vector.map((value) => value / norm) : vector;
  }

  embedQuery(text: string): number[] { return this.embed(text); }
}

export class GeminiEmbeddingProvider {
  readonly provider = "google";
  readonly model = "gemini-embedding-2";
  constructor(private readonly apiKey: string, readonly dimensions = 768, private readonly fetcher: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new Error("Gemini API key is required");
    if (dimensions < 128 || dimensions > 3_072) throw new Error("dimensions must be between 128 and 3072");
  }

  async embed(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"): Promise<number[]> {
    if (!text.trim()) throw new Error("Embedding text cannot be empty");
    const response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({ model: `models/${this.model}`, content: { parts: [{ text: text.slice(0, 32_000) }] }, taskType, outputDimensionality: this.dimensions }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Gemini embedding failed with HTTP ${response.status}`);
    const payload = await response.json() as { embedding?: { values?: unknown[] } };
    if (!Array.isArray(payload.embedding?.values) || payload.embedding.values.length !== this.dimensions) throw new Error("Gemini returned an invalid embedding vector");
    return payload.embedding.values.map(Number);
  }

  embedQuery(text: string): Promise<number[]> { return this.embed(text, "RETRIEVAL_QUERY"); }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) return 0;
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  if (!leftNorm || !rightNorm) return 0;
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0) / (leftNorm * rightNorm);
}

export class HybridRetriever {
  constructor(private readonly store: ResearchStore, private readonly provider: EmbeddingProvider = new LocalEmbeddingProvider()) {}

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (query.trim().length < 2 || query.length > 1_000) throw new Error("query must be between 2 and 1000 characters");
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const lexical = this.store.search(query, { ...options, limit: Math.min(100, limit * 5) });
    const queryVector = this.provider.embedQuery(query);
    const semantic = this.store.listEmbeddings(this.provider.provider, this.provider.model)
      .map(([documentId, vector]) => [documentId, cosineSimilarity(queryVector, vector)] as const)
      .filter(([, score]) => score > 0.02)
      .sort((left, right) => right[1] - left[1])
      .slice(0, Math.min(100, limit * 5));
    const scores = new Map<number, number>();
    const reasons = new Map<number, Set<"lexical" | "semantic">>();
    lexical.forEach((result, index) => {
      scores.set(result.documentId, (scores.get(result.documentId) ?? 0) + 1 / (61 + index));
      (reasons.get(result.documentId) ?? reasons.set(result.documentId, new Set()).get(result.documentId))!.add("lexical");
    });
    semantic.forEach(([documentId, similarity], index) => {
      scores.set(documentId, (scores.get(documentId) ?? 0) + (1 / (61 + index)) * Math.max(0.2, similarity));
      (reasons.get(documentId) ?? reasons.set(documentId, new Set()).get(documentId))!.add("semantic");
    });
    return [...scores.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit).flatMap(([documentId, score]) => {
      const document = this.store.getDocument(documentId);
      if (!document) return [];
      const { content: _content, ...result } = document;
      return [{ ...result, retrievalScore: Number(score.toFixed(8)), matchReasons: [...(reasons.get(documentId) ?? [])].sort() }];
    });
  }
}
