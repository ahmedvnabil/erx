export const SOURCE_TYPES = [
  "official",
  "legal",
  "news",
  "human_rights",
  "academic",
  "statistics",
  "investigative"
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
export type Language = "ar" | "en" | "mixed";

export interface SourceInput {
  slug: string;
  name: string;
  url: string;
  sourceType: SourceType;
  ownershipType: string;
  language: Language;
  feedUrl?: string | null;
  sitemapUrl?: string | null;
  collectionMethod?: "catalog" | "rss" | "sitemap" | "html" | "api" | "hybrid";
  crawlDelaySeconds?: number;
  contentLicense?: string;
  robotsPolicy?: "respect" | "allowlist_only";
  active?: boolean;
}

export interface SourceRecord extends Required<Omit<SourceInput, "feedUrl" | "sitemapUrl">> {
  feedUrl: string | null;
  sitemapUrl: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  healthStatus: string;
  lastCrawledAt: string | null;
  documentCount: number;
}

export interface DocumentInput {
  externalId: string;
  sourceSlug: string;
  canonicalUrl: string;
  title: string;
  excerpt?: string;
  content?: string;
  publishedAt?: string | null;
  eventAt?: string | null;
  documentType?: string;
  topics?: string[];
  language?: Language;
}

export interface Citation {
  title: string;
  sourceName: string;
  url: string;
  publishedAt: string | null;
  archivedAt: string;
  citationId?: string;
  permalink?: string;
}

export interface SearchResult {
  documentId: number;
  externalId: string;
  sourceSlug: string;
  sourceName: string;
  sourceType: SourceType;
  title: string;
  excerpt: string;
  canonicalUrl: string;
  publishedAt: string | null;
  eventAt: string | null;
  archivedAt: string;
  documentType: string;
  topics: string[];
  citation: Citation;
  content?: string;
  retrievalScore?: number;
  matchReasons?: Array<"lexical" | "semantic">;
  rankingExplanation?: string;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sourceTypes?: SourceType[];
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface EntityRecord {
  id: number;
  canonicalName: string;
  entityType: string;
  aliases: string[];
  mentions: number;
  documentCount: number;
}

export interface ClaimRecord {
  id: number;
  claimText: string;
  claimType: string;
  firstSeenAt: string;
  lastSeenAt: string;
  reviewStatus: string;
  evidence: Array<{
    documentId: number;
    title: string;
    sourceName: string;
    canonicalUrl: string;
    stance: string;
    quote: string;
    confidence: number;
  }>;
}

export interface EventRecord {
  id: number;
  title: string;
  summary: string;
  occurredAt: string | null;
  eventType: string;
  location: string | null;
  documents: Array<{
    documentId: number;
    title: string;
    sourceName: string;
    canonicalUrl: string;
    role: string;
  }>;
}
