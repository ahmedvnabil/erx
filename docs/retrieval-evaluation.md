# Retrieval evaluation — findings & method (2026-07-20)

Measured on the live production DB (v0.17.0 snapshot, 1373 searchable docs) with the
`scripts/evaluate-retrieval.mjs` harness and the shipped `eval/gold-set.json` (30 queries).

## Baseline
`P@5=0.3733  R@20=0.8467  nDCG@10=0.7294  MRR=0.8287`  (P@5 ceiling = 0.640)

## The 0.80 target is a measurement problem, not (mainly) a retriever bug
1. **Ceiling.** 20/30 queries have fewer than 5 judged-relevant docs → the maximum
   achievable P@5 is **0.640**. 0.80 is unreachable regardless of the algorithm.
2. **Judgment incompleteness (dominant).** Across the 30 queries, **57% of top-5 result
   slots are UNJUDGED** and are scored as irrelevant by the metric. Only 12 of those 73
   unjudged slots are post-gold-set docs (ID > 1193, max judged ID); the other 61 are
   judged-era docs the gold-set never labeled (e.g. #464, #698 are plausibly relevant to
   "قرارات مجلس النواب" but unjudged).
3. **Corpus drift (minor).** The gold-set is `production-v0.16.2` (929 docs); the corpus has
   since grown ~48% to 1373. New relevant docs are unjudged.

**Consequence:** the gold-set is currently an INVALID instrument for tuning. Any change that
surfaces a good-but-unjudged doc is penalized. This was confirmed empirically — four tuning
variants (BM25 field weighting ×2, query-token coverage bonus, title/topic reweighting) all
scored flat-to-negative, consistent with optimizing against noise.

## Genuine retriever issues (to fix AFTER judgments are refreshed)
- **Noise interleaving:** relevant docs sit at ranks 7–15, outranked by off-topic term
  matches (e.g. medical/syndicate docs for "خدمات اللاجئين الصحية"). Needs stronger semantics
  to separate — the local hash embedding (bag-of-trigrams) is the weak link.
- **Tail recall misses:** e.g. #644 ("...اختبارات القدرات...الجامعات") is judged-relevant yet
  not retrieved in top-50. A real recall bug, but unmeasurable until the gold-set is valid.

## Correct order of work
1. **Refresh judgments (do first).** Run `scripts/build-pool.mjs` to pool hybrid+lexical
   top-K per query on the current corpus, human-label the unjudged candidates (0–3), rebuild
   `eval/gold-set.json`. Aim for ≥5 judged-relevant per query so the ceiling reaches ~0.80+.
2. **Then tune the algorithm** against the valid gold-set — reranking for noise separation and
   the recall tail, and evaluate a stronger embedding (Gemini) as a pure local measurement
   before any production decision.

## Reproduce
```
node scripts/evaluate-retrieval.mjs <research.db> eval/gold-set.json   # metrics
node scripts/build-pool.mjs <research.db> eval/gold-set.json 10 pool.csv  # labeling worksheet
```
