import { createHash } from "node:crypto";

import type { ResearchStore } from "./store.js";
import { classifyDocument, normalizeArabic, tokenizeQuery } from "./text.js";
import type { SearchOptions, SearchResult } from "./types.js";

const conceptGroups = [
  ["عامل", "عمال", "العاملين", "العماليه", "العمل", "حقوق"],
  ["قانون", "تشريع", "لائحه", "قرار"],
  ["سجن", "حبس", "احتجاز"],
  ["صحافه", "اعلام", "صحفي", "تعبير"],
  ["انتخاب", "انتخابات", "اقتراع"]
] as const;

const MIN_SEMANTIC_SIMILARITY = 0.2;
export const MIN_RETRIEVAL_SCORE = 0.018;
const RRF_K = 60;
const LEXICAL_WEIGHT = 1.5;
const SEMANTIC_WEIGHT = 0.35;

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
    const candidateLimit = Math.min(100, limit * 5);
    const queryTokens = tokenizeQuery(query);
    const lexicalLists = [this.store.search(query, { ...options, limit: candidateLimit }), ...queryTokens.map((token) => this.store.search(token, { ...options, limit: candidateLimit }))];
    const queryVector = this.provider.embedQuery(query);
    const semantic = this.store.listEmbeddings(this.provider.provider, this.provider.model)
      .map(([documentId, vector]) => [documentId, cosineSimilarity(queryVector, vector)] as const)
      .filter(([, score]) => score >= MIN_SEMANTIC_SIMILARITY)
      .sort((left, right) => right[1] - left[1])
      .slice(0, candidateLimit);
    const scores = new Map<number, number>();
    const reasons = new Map<number, Set<"lexical" | "semantic">>();
    const lexicalMatches = new Map<number, Set<number>>();
    lexicalLists.forEach((results, listIndex) => results.forEach((result, index) => {
      const listWeight = listIndex === 0 ? 2 : 1;
      scores.set(result.documentId, (scores.get(result.documentId) ?? 0) + LEXICAL_WEIGHT * listWeight / (RRF_K + index + 1));
      (reasons.get(result.documentId) ?? reasons.set(result.documentId, new Set()).get(result.documentId))!.add("lexical");
      (lexicalMatches.get(result.documentId) ?? lexicalMatches.set(result.documentId, new Set()).get(result.documentId))!.add(listIndex);
    }));
    semantic.forEach(([documentId, similarity], index) => {
      if (!lexicalMatches.has(documentId)) return;
      scores.set(documentId, (scores.get(documentId) ?? 0) + SEMANTIC_WEIGHT * similarity / (RRF_K + index + 1));
      (reasons.get(documentId) ?? reasons.set(documentId, new Set()).get(documentId))!.add("semantic");
    });
    const queryTopics = new Set(classifyDocument(query));
    const minimumTokenMatches = Math.max(1, Math.ceil(queryTokens.length * 0.5));
    return [...scores.entries()].flatMap(([documentId, score]) => {
      const document = this.store.getDocument(documentId);
      if (!document) return [];
      const matchedTokens = [...(lexicalMatches.get(documentId) ?? [])].filter((listIndex) => listIndex > 0).length;
      if (matchedTokens < minimumTokenMatches) return [];
      const titleTokens = new Set(tokenizeQuery(document.title));
      const titleMatches = queryTokens.filter((token) => titleTokens.has(token)).length;
      const topicMatches = document.topics.filter((topic) => queryTopics.has(topic)).length;
      const rerankedScore = score + titleMatches * 0.006 + topicMatches * 0.004;
      const { content: _content, ...result } = document;
      const matchReasons = [...(reasons.get(documentId) ?? [])].sort();
      const rankingExplanation = `weighted_rrf: lexical=${matchedTokens}/${queryTokens.length}, title=${titleMatches}, topics=${topicMatches}, signals=${matchReasons.join("+")}`;
      return [{ ...result, retrievalScore: Number(rerankedScore.toFixed(8)), matchReasons, rankingExplanation }];
    }).filter((result) => result.retrievalScore >= MIN_RETRIEVAL_SCORE)
      .sort((left, right) => right.retrievalScore - left.retrievalScore || (right.publishedAt ?? right.archivedAt).localeCompare(left.publishedAt ?? left.archivedAt))
      .slice(0, limit);
  }
}
