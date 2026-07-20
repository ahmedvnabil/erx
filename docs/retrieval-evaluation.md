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

## Query-set expansion (step 1a, done 2026-07-20)
The original 30 queries clustered on economy/supply, detention/press, refugees, Sinai, and
constitutional/parliament, leaving large corpus topics unqueried. Added **21 new queries**
(`eval/gold-set-expanded.json`, 51 total), each verified to return on-topic results on the
current corpus, covering: labor (`قانون العمل الجديد`), health (`التأمين الصحي الشامل`),
housing (`أزمة الإيجار القديم`), prisons (`أوضاع المحتجزين في سجن بدر`), elections
(`انتخابات مجلس الشيوخ`, `المؤتمر الوطني للشباب`), women (`التحرش والعنف ضد المرأة`),
legislation (`قانون الإجراءات الجنائية الجديد`, `قانون منشآت الأمن والأمان البيولوجي`),
energy (`الطاقة النووية ومحطة الضبعة`), economy (`أسعار الذهب في مصر`, `الدين العام المصري`),
civil society & institutions (`منظمات المجتمع المدني وحكم الاستئناف`, `محكمة النقض`,
`المجلس القومي لحقوق الإنسان`), and Azhar education.

**Corpus insight:** child-rights, digital-rights, and some women's-rights documents are
English-titled academic papers, so Arabic natural-language queries do not match them. Those
topics need either English queries or better cross-lingual handling — a coverage/retrieval
gap worth tracking separately.

New queries carry empty relevance; run `scripts/build-pool.mjs` on the expanded set to produce
the labeling worksheet (currently 372 unjudged (query,doc) pairs across the 51 queries).

## Reproduce
```
node scripts/evaluate-retrieval.mjs <research.db> eval/gold-set.json   # metrics
node scripts/build-pool.mjs <research.db> eval/gold-set.json 10 pool.csv  # labeling worksheet
```
