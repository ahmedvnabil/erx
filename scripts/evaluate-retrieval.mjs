import { readFileSync } from "node:fs";

import { evaluateRanking, meanMetrics, precisionCeiling } from "../dist/evaluation.js";
import { HybridRetriever } from "../dist/retrieval.js";
import { ResearchStore } from "../dist/store.js";

const database = process.argv[2] ?? process.env.EGYPT_RESEARCH_DB ?? "data/research.db";
const goldPath = process.argv[3] ?? "eval/gold-set.json";
const gold = JSON.parse(readFileSync(goldPath, "utf8"));
const store = new ResearchStore(database, { readonly: true });
const retriever = new HybridRetriever(store);
const cutoffs = { precisionAt: 5, recallAt: 20, ndcgAt: 10 };
const queries = gold.queries.map((judgment) => {
  const results = retriever.search(judgment.query, { limit: 20 });
  return {
    query: judgment.query,
    metrics: evaluateRanking(results.map((result) => String(result.documentId)), judgment.relevance, cutoffs),
    results: results.map((result) => ({ documentId: result.documentId, score: result.retrievalScore, reasons: result.matchReasons, title: result.title, source: result.sourceSlug }))
  };
});
const report = {
  snapshot: gold.snapshot,
  database,
  cutoffs,
  judgmentQuality: {
    precisionAtKCeiling: precisionCeiling(gold.queries.map((item) => item.relevance), cutoffs.precisionAt),
    queriesBelowPrecisionCutoff: gold.queries.filter((item) => Object.values(item.relevance).filter((grade) => grade > 0).length < cutoffs.precisionAt).map((item) => item.query)
  },
  aggregate: meanMetrics(queries.map((item) => item.metrics)),
  queries
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
store.close();
