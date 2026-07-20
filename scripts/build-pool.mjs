// Top-K pooling worksheet for refreshing gold-set judgments on the CURRENT corpus.
// For each gold query, pool the union of hybrid + lexical top-K candidates, mark existing
// grades, and emit a CSV a human can label (grade 0-3). Re-import to rebuild the gold-set.
import { readFileSync, writeFileSync } from "node:fs";
import { ResearchStore } from "../dist/store.js";
import { HybridRetriever } from "../dist/retrieval.js";

const db = process.argv[2] ?? "../erx-eval.db";
const goldPath = process.argv[3] ?? "eval/gold-set.json";
const K = Number(process.argv[4] ?? 10);
const out = process.argv[5] ?? "../gold-pool.csv";

const gold = JSON.parse(readFileSync(goldPath, "utf8"));
const store = new ResearchStore(db, { readonly: true });
const hybrid = new HybridRetriever(store);
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;

const rows = [["query", "document_id", "existing_grade", "new_grade", "in_pool_by", "source_type", "title", "excerpt", "url"]];
let pooled = 0, unjudged = 0;
for (const q of gold.queries) {
  const lex = store.search(q.query, { limit: K }).map((r) => r.documentId);
  const hyb = hybrid.search(q.query, { limit: K }).map((r) => r.documentId);
  const seen = new Map();
  for (const id of hyb) seen.set(id, (seen.get(id) ?? "") + "H");
  for (const id of lex) seen.set(id, (seen.get(id) ?? "") + "L");
  for (const id of Object.keys(q.relevance).map(Number)) if (!seen.has(id)) seen.set(id, "G"); // keep prior judgments
  for (const [id, by] of seen) {
    const d = store.getDocument(id);
    if (!d) continue;
    const existing = q.relevance[String(id)];
    pooled++;
    if (existing === undefined) unjudged++;
    rows.push([q.query, id, existing ?? "", "", by, d.sourceType, d.title, (d.excerpt ?? "").slice(0, 180), d.canonicalUrl]);
  }
}
writeFileSync(out, rows.map((r) => r.map(esc).join(",")).join("\n"));
store.close();
console.log(`Pooled ${pooled} (query,doc) pairs across ${gold.queries.length} queries; ${unjudged} are unjudged and need a grade.`);
console.log(`Worksheet: ${out}  — fill the 'new_grade' column (0=irrelevant, 1=marginal, 2=relevant, 3=highly relevant) for blank rows.`);
