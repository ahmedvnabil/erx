import type { SearchResult } from "./types.js";

export const EXPORT_FORMATS = ["csv", "jsonl", "bibtex", "ris"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const csv = (value: unknown): string => `"${String(value ?? "").replaceAll('"', '""')}"`;
const key = (result: SearchResult): string => `egypt${result.documentId}`;

export function exportResults(results: SearchResult[], format: ExportFormat): string {
  if (format === "jsonl") return results.map((result) => JSON.stringify(result)).join("\n");
  if (format === "csv") {
    const header = "document_id,title,source_name,source_type,url,published_at,archived_at";
    return [header, ...results.map((result) => [result.documentId, result.title, result.sourceName, result.sourceType, result.canonicalUrl, result.publishedAt ?? "", result.archivedAt].map(csv).join(","))].join("\n");
  }
  if (format === "bibtex") return results.map((result) => `@misc{${key(result)},\n  title = {${result.title}},\n  author = {${result.sourceName}},\n  url = {${result.canonicalUrl}},\n  urldate = {${result.archivedAt.slice(0, 10)}}\n}`).join("\n\n");
  return results.map((result) => ["TY  - ELEC", `TI  - ${result.title}`, `AU  - ${result.sourceName}`, `UR  - ${result.canonicalUrl}`, result.publishedAt ? `PY  - ${result.publishedAt.slice(0, 10)}` : null, `Y2  - ${result.archivedAt.slice(0, 10)}`, "ER  -"].filter(Boolean).join("\n")).join("\n\n");
}
