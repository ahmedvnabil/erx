import { createHash } from "node:crypto";

import type { EmbeddingProvider } from "./retrieval.js";
import type { ResearchStore } from "./store.js";
import { normalizeArabic } from "./text.js";

const lexicon = [
  ["المبادرة المصرية للحقوق الشخصية", "organization", ["المبادرة المصرية"]],
  ["النيابة العامة", "organization", []],
  ["مجلس النواب", "organization", ["البرلمان المصري"]],
  ["مجلس الوزراء", "organization", ["رئاسة مجلس الوزراء"]],
  ["وزارة الداخلية", "organization", []],
  ["وزارة التموين", "organization", []],
  ["وزارة التضامن الاجتماعي", "organization", []],
  ["وزارة الخارجية", "organization", []],
  ["وزارة التعليم العالي", "organization", []],
  ["محكمة النقض", "organization", []],
  ["المحكمة الدستورية العليا", "organization", []],
  ["المجلس القومي لحقوق الإنسان", "organization", []],
  ["مفوضية الأمم المتحدة لشؤون اللاجئين", "organization", ["المفوضية السامية للأمم المتحدة لشؤون اللاجئين"]],
  ["جامعة الدول العربية", "organization", []],
  ["جهاز مستقبل مصر", "organization", []],
  ["الجهاز المركزي للتعبئة العامة والإحصاء", "organization", ["التعبئة والإحصاء"]],
  ["القاهرة", "location", []], ["الإسكندرية", "location", []], ["سيناء", "location", []],
  ["رفح", "location", []], ["العريش", "location", []]
] as const;
const reportingVerbs = ["اعلن", "اعلنت", "تعلن", "قال", "تقول", "اكد", "يوكد", "تؤكد", "ذكر", "افاد", "صرح", "اوضحت", "اوضح", "كشف", "اشار", "نفى", "نفت", "تنفي", "يطالب", "طالبت", "حذر", "تحذر"];
const entityPrefixes: Array<[string, string]> = [
  ["وزاره", "organization"], ["مجلس", "organization"], ["محكمه", "organization"], ["جهاز", "organization"],
  ["هيئه", "organization"], ["مؤسسه", "organization"], ["منظمه", "organization"], ["جامعه", "organization"],
  ["مفوضيه", "organization"], ["نيابه", "organization"], ["لجنه", "organization"], ["رئاسه", "organization"]
];
const months: Record<string, number> = { يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, اغسطس: 8, سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };

export interface KnowledgeReport { documentId: number; entities: number; claims: number; events: number; embedded: boolean }

export class KnowledgeIndexer {
  constructor(private readonly store: ResearchStore, private readonly embeddingProvider?: EmbeddingProvider) {}

  indexDocument(documentId: number): KnowledgeReport {
    const document = this.store.getDocument(documentId);
    if (!document) throw new Error(`Unknown document: ${documentId}`);
    if (document.documentType === "excluded") return { documentId, entities: 0, claims: 0, events: 0, embedded: false };
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
    const known = new Set(lexicon.flatMap(([name]) => {
      const normalizedName = normalizeArabic(name);
      return [normalizedName, normalizedName.replace(/^ال/u, "")];
    }));
    for (const [canonicalName, entityType] of discoverEntities(text)) {
      if (known.has(normalizeArabic(canonicalName))) continue;
      const mentions = occurrences(normalized, normalizeArabic(canonicalName));
      if (mentions < 1) continue;
      this.store.linkEntity(documentId, canonicalName, entityType, mentions, 0.7);
      entities.push(canonicalName);
    }
    const claims = [...new Set((document.content ?? "").split(/[.!؟؛\n]+/).map((sentence) => sentence.replace(/\s+/g, " ").trim()).filter((sentence) => sentence.length >= 25 && reportingVerbs.some((verb) => normalizeArabic(sentence).includes(verb))))];
    for (const claim of claims) {
      const classification = classifyClaim(claim);
      this.store.upsertClaim(documentId, claim, classification.claimType, classification.stance, classification.confidence);
    }
    const eventAt = extractEventDate(text);
    if (eventAt) this.store.updateDocumentEventAt(documentId, eventAt);
    const locations = lexicon
      .filter(([name, type]) => type === "location" && normalized.includes(normalizeArabic(name)))
      .map(([name]) => name);
    this.store.upsertEventForDocument(documentId, {
      title: document.title, summary: document.excerpt || (document.content ?? "").slice(0, 500),
      occurredAt: eventAt ?? document.eventAt ?? document.publishedAt ?? document.archivedAt,
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

function discoverEntities(value: string): Array<[string, string]> {
  const normalized = normalizeArabic(value);
  const found = new Map<string, string>();
  const stop = new Set(["تعلن", "اعلن", "اعلنت", "قال", "تقول", "بشأن", "بشان", "عن", "في", "من", "الى", "الي", "قرار", "قرارا", "بيان", "بيانا", "قررت", "يتناول", "تناول", "اخلاء", "سبيل", "بعدم", "الدعوى", "الدعوي", "والزمت", "لصالح", "على", "ان", "اليوم", "المقرر", "تنظر", "بحث", "يبحث", "شارك", "مناقشه", "مناقشة", "بشأن", "اجتماعا", "اجتماع", "رييس", "رئيس", "مركز", "المعلومات"]);
  for (const [prefix, entityType] of entityPrefixes) {
    const pattern = new RegExp(`${prefix}(?:\\s+[ء-ي]{2,}){1,4}`, "gu");
    for (const match of normalized.matchAll(pattern)) {
      const words = match[0]!.trim().split(" ").slice(0, 5);
      const stopAt = words.findIndex((word, index) => index > 0 && stop.has(word));
      const name = words.slice(0, stopAt > 0 ? stopAt : words.length).join(" ");
      if (name.split(" ").length >= 2 && name.length <= 90) found.set(name, entityType);
    }
  }
  return [...found.entries()];
}

function classifyClaim(value: string): { claimType: string; stance: string; confidence: number } {
  const normalized = normalizeArabic(value);
  if (/(نفى|نفت|تنفي|ينفي)/u.test(normalized)) return { claimType: "denial", stance: "contradicts", confidence: 0.82 };
  if (/(طالب|طالبت|يطالب)/u.test(normalized)) return { claimType: "demand", stance: "advocates", confidence: 0.8 };
  if (/(حذر|تحذر|يحذر)/u.test(normalized)) return { claimType: "warning", stance: "warns", confidence: 0.8 };
  return { claimType: "reported_statement", stance: "reports", confidence: 0.75 };
}

function extractEventDate(value: string): string | null {
  const normalized = normalizeArabic(value);
  const numeric = normalized.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/u);
  if (numeric) return isoDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const arabic = normalized.match(/\b(\d{1,2})\s+(يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر)\s+(20\d{2})\b/u);
  return arabic ? isoDate(Number(arabic[3]), months[arabic[2]!]!, Number(arabic[1])) : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString() : null;
}

function occurrences(value: string, needle: string): number {
  if (!needle) return 0;
  let count = 0; let offset = 0;
  while ((offset = value.indexOf(needle, offset)) >= 0) { count += 1; offset += needle.length; }
  return count;
}
