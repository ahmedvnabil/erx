import { createHash } from "node:crypto";

import type { EmbeddingProvider } from "./retrieval.js";
import type { ResearchStore } from "./store.js";
import { normalizeArabic } from "./text.js";

const lexicon = [
  ["المبادرة المصرية للحقوق الشخصية", "organization", ["المبادرة المصرية"]],
  ["النيابة العامة", "organization", []],
  ["مجلس النواب", "organization", ["البرلمان المصري"]],
  ["وزارة الداخلية", "organization", []],
  ["محكمة النقض", "organization", []],
  ["الجهاز المركزي للتعبئة العامة والإحصاء", "organization", ["التعبئة والإحصاء"]],
  ["القاهرة", "location", []], ["الإسكندرية", "location", []], ["سيناء", "location", []],
  ["رفح", "location", []], ["العريش", "location", []]
] as const;
const reportingVerbs = ["اعلن", "قال", "اكد", "ذكر", "افاد", "صرح", "اوضحت", "اوضح"];

export interface KnowledgeReport { documentId: number; entities: number; claims: number; events: number; embedded: boolean }

export class KnowledgeIndexer {
  constructor(private readonly store: ResearchStore, private readonly embeddingProvider?: EmbeddingProvider) {}

  indexDocument(documentId: number): KnowledgeReport {
    const document = this.store.getDocument(documentId);
    if (!document) throw new Error(`Unknown document: ${documentId}`);
    this.store.resetDocumentKnowledge(documentId);
    const text = `${document.title}\n${document.excerpt}\n${document.content ?? ""}`;
    const normalized = normalizeArabic(text);
    const entities: string[] = [];
    for (const [canonicalName, entityType, aliases] of lexicon) {
      const candidates = [canonicalName, ...aliases];
      const mentions = candidates.reduce((count, name) => count + occurrences(normalized, normalizeArabic(name)), 0);
      if (!mentions) continue;
      this.store.linkEntity(documentId, canonicalName, entityType, mentions, normalized.includes(normalizeArabic(canonicalName)) ? 0.95 : 0.8, [...aliases]);
      entities.push(canonicalName);
    }
    const claims = (document.content ?? "").split(/[.!؟\n]+/).map((sentence) => sentence.replace(/\s+/g, " ").trim()).filter((sentence) => sentence.length >= 25 && reportingVerbs.some((verb) => normalizeArabic(sentence).includes(verb)));
    for (const claim of claims) this.store.upsertClaim(documentId, claim);
    const locations = lexicon
      .filter(([name, type]) => type === "location" && normalized.includes(normalizeArabic(name)))
      .map(([name]) => name);
    this.store.upsertEventForDocument(documentId, {
      title: document.title, summary: document.excerpt || (document.content ?? "").slice(0, 500),
      occurredAt: document.eventAt ?? document.publishedAt ?? document.archivedAt,
      eventType: document.topics[0] ?? document.documentType, location: locations[0] ?? null
    });
    this.store.purgeOrphanKnowledge();
    if (this.embeddingProvider) {
      this.store.upsertEmbedding(documentId, this.embeddingProvider.provider, this.embeddingProvider.model, this.embeddingProvider.embed(text), createHash("sha256").update(text).digest("hex"));
    }
    return { documentId, entities: entities.length, claims: claims.length, events: 1, embedded: Boolean(this.embeddingProvider) };
  }

  backfill(limit = 10_000): KnowledgeReport[] { return this.store.listDocumentIds(limit).map((id) => this.indexDocument(id)); }
}

function occurrences(value: string, needle: string): number {
  if (!needle) return 0;
  let count = 0; let offset = 0;
  while ((offset = value.indexOf(needle, offset)) >= 0) { count += 1; offset += needle.length; }
  return count;
}
