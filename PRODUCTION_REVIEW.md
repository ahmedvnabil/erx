# Production Readiness — ERX 0.16.2 working tree

**Reviewed:** 2026-07-18  
**Verdict:** ❌ BLOCK

## Executive summary

The code, package, and HTTP runtime are healthy, but the requested research-quality
acceptance bar is not met. Do not deploy or publish this working tree yet.

## Verification

| Check | Result |
|---|---|
| TypeScript check and production build | PASS |
| Unit, integration, MCP, web, and regression tests | PASS — 81/81 |
| Coverage | PASS — 84.69% statements, 91.62% lines |
| npm audit (`high`) | PASS — 0 vulnerabilities |
| Release metadata | PASS — 0.16.2 valid |
| npm package dry-run | PASS — 82 files, 727,948 bytes |
| HTTP smoke on production snapshot | PASS — health, status, coverage, search, landing, sources, docs, robots, sitemap |
| Browser DOM/console inspection | NOT RUN — isolated DevTools connector unavailable |
| Retrieval acceptance | FAIL — P@5 0.373, target 0.800 |

## Blocking findings

| Severity | Finding | Evidence / action |
|---|---|---|
| CRITICAL | Retrieval acceptance is not met | Complete relevance pooling, tune retrieval, and rerun `npm run eval:retrieval -- data/eval/research.db eval/gold-set.json`. |
| CRITICAL | Current gold judgments cannot prove the target | P@5 ceiling is 0.640 because 20/30 queries have fewer than five positive judgments. Complete manual top-20 judgments first. |
| HIGH | Topic coverage is below the requested 90% | 423/929 searchable documents are tagged: 45.53%. Implement and run the classification backfill. |
| HIGH | Source-balance acceptance is not implemented or measured | Add balanced mode and political-query diversity tests before release. |
| HIGH | Corpus-depth work is incomplete | Backfill weak sources and record exclusions without violating robots/crawl delay policy. |
| MEDIUM | Browser inspection is still required | Run isolated Chrome checks for `/`, `/sources`, and `/docs`, including console, network, mobile RTL, and accessibility tree. |

## Search checkpoint

| Metric | Baseline | Current |
|---|---:|---:|
| Precision@5 | 0.340 | 0.373 |
| Recall@20 | 0.731 | 0.863 |
| nDCG@10 | 0.682 | 0.746 |
| MRR | 0.810 | 0.844 |

The inflation query no longer returns military-seminar material. Full citations,
including `archivedAt`, remain covered by regression tests.

## Rollback

No deployment was performed. The live server and npm package remain on the existing
0.16.2 release. If a future deployment fails, restore the last verified database
backup and previous container image, then verify `/healthz`, `/mcp`, and a known
Arabic search query before reopening traffic.
