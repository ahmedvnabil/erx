# ERX source strategy — audit, expansion candidates, and request process

> Scope of this document: audit the current operational catalog, name the thin and
> absent topics, explain how scheduled collection runs, restate the source policy, and
> maintain a curated, verifiable expansion pipeline. It is the companion to the broader
> [completion-and-source-expansion plan](./completion-and-source-expansion-plan.md);
> that plan sets targets and phases, this document tracks concrete, ready-to-verify
> candidates and the mechanics of proposing one.

Last reviewed: 2026-07-20.

---

## 1. Audit of the current catalog

The operational catalog lives in [`src/catalog.ts`](../src/catalog.ts) (`seeds` →
`INITIAL_SOURCES`, seeded by `bootstrapCatalog`). Connectors for HTML/API sources live
in [`src/connectors.ts`](../src/connectors.ts). There are **35 active sources**; a
further **18 are retired** (`RETIRED_SOURCE_SLUGS`) — defined in code but pruned from the
operational catalog until they pass the acceptance gate again.

### 1.1 Active source mix by `sourceType`

| `sourceType`  | Active | Sources |
|---------------|-------:|---------|
| `human_rights`|     10 | EIPR, AFTE, EC-RF (المفوضية المصرية), الجبهة المصرية, Committee for Justice, منصة اللاجئين, CIHRS, مؤسسة سيناء, CPJ Egypt, RSF Egypt |
| `news`        |      8 | الشروق, المصري اليوم, مصراوي, اليوم السابع, أخبار اليوم, Daily News Egypt, Egyptian Streets, Egypt Independent |
| `academic`    |      6 | IDSC, معهد التخطيط القومي, ECES, Economic Research Forum, AUC Knowledge Fountain, MSA Repository |
| `official`    |      4 | مجلس النواب, مجلس الوزراء, رئاسة الجمهورية, المجلس القومي لحقوق الإنسان |
| `legal`       |      4 | المحكمة الدستورية العليا, منشورات, الرقابة المالية (FRA), نقابة المحامين |
| `investigative`|     2 | مدى مصر, المنصة |
| `statistics`  |      1 | CAPMAS |
| **Total**     | **35** | |

### 1.2 Collection method mix

`collectionMethod` is only set when a source has a connector: `feedUrl || sitemapUrl`
present → `hybrid`, else the connector's own `kind` (`html`/`api`). Feed-only sources
(no connector) leave the field unset and are collected via their `feedUrl` at runtime.
Exact distribution across the 35 active sources (verified from `INITIAL_SOURCES`):

| Method             | Count | Notes |
|--------------------|------:|-------|
| RSS feed only      |    12 | `feedUrl`, no connector: presidency, manshurat, ECES, ERF, AUC, EC-RF, الجبهة المصرية, Committee for Justice, منصة اللاجئين, CIHRS, CPJ, مدى مصر. |
| `hybrid` (feed + connector) | 9 | EIPR, AFTE, المصري اليوم, أخبار اليوم, مصراوي, اليوم السابع (html+feed) · Daily News, Egyptian Streets, Egypt Independent (api+feed). |
| `html` connector   |     7 | parliament, cabinet, manassa, sinai, nchr, RSF, الشروق (no feed → pure html). |
| `api` connector    |     7 | FRA, نقابة المحامين, معهد التخطيط, MSA, CAPMAS, IDSC, المحكمة الدستورية (WordPress REST / DSpace / bespoke JSON). |

No active source is sitemap-only or channel-less; all 35 satisfy the test invariant of
having a feed, sitemap, or `html`/`api` connector. Sitemap-configured sources (GOEIC,
NTRA, Cairo24) are currently all retired.

> The `tests/catalog.test.ts` invariants freeze this shape: `INITIAL_SOURCES.length === 35`,
> `collectionMethod === "html"` count `=== 7`, and `collectionMethod === "api"` count `=== 7`.
> See §5 for why this constrains additions.

### 1.3 Retired / catalog-only sources (18)

Retired in `RETIRED_SOURCE_SLUGS` — mostly government/legal primaries whose connectors
broke or that never passed the extraction sample: المطابع الأميرية, وزارة العدل, وزارة
المالية, البنك المركزي, النيابة العامة, الرقابة على الصادرات (GOEIC), تنظيم الاتصالات
(NTRA), تنظيم الكهرباء (EgyptERA), البيئة (EEAA), الدواء (EDA), الجمارك, وزارة التخطيط
SDDS, plus Amnesty Egypt, HRW Egypt, ICNL Egypt, BUE Scholar, Cairo24, Ahram Gate.
Their history is preserved; re-enabling them is Phase 3 of the expansion plan and is
prioritised **before** adding net-new sources.

### 1.4 Thin and absent topics

The `sourceType` taxonomy is coarse, so "thin topic" is judged by whether a researcher
querying that subject finds a dedicated authoritative publisher. Gaps found:

| Topic | Status | Gap detail |
|-------|--------|------------|
| **Women's rights** | Absent | No dedicated women's-rights organisation is active. General HR orgs touch it, but there is no نظرة / المرأة الجديدة / ECWR / قضايا المرأة in the catalog. |
| **Digital rights** | Thin | EIPR and AFTE cover privacy/expression partially; the dedicated Egyptian tech-policy org **مسار (Masaar)** is absent. |
| **Child rights** | Absent | No dedicated child-rights source (e.g. المجلس القومي للطفولة والأمومة, UNICEF Egypt). |
| **Statistics / macro data** | Thin | Only CAPMAS is active. البنك المركزي, وزارة المالية, and MPED-SDDS are all retired — a single point of failure for quantitative queries. |
| **Labour & syndicates** | Absent | Only نقابة المحامين (legal). No نقابة الصحفيين/الأطباء/المعلمين, no دار الخدمات النقابية والعمالية, no ILO Cairo. |
| **Environment / health / education** | Absent-thin | EEAA and health/education ministries are retired or never added. |
| **Legal primaries** | Thin | Only 4 active legal sources; محكمة النقض, مجلس الدولة, الجريدة الرسمية, الجهاز المركزي للمحاسبات are absent. |

---

## 2. How the 6-hourly scheduled collection works

Ingestion is driven by a systemd timer + oneshot service in [`deploy/`](../deploy):

1. **`egypt-research-collect.timer`** — `OnCalendar=*-*-* 00/6:15:00 UTC` with
   `Persistent=true` and `RandomizedDelaySec=900`. Fires four times a day (00:15, 06:15,
   12:15, 18:15 UTC ± up to 15 min jitter). `Persistent` catches up a missed run after
   downtime.
2. **`egypt-research-collect.service`** — a `Type=oneshot` unit gated on
   `network-online.target`; runs `docker compose … run --rm egypt-research
   deploy/collect-and-index.sh` from `/opt/erx`.
3. **`collect-and-index.sh`** — three steps, in order:
   - `cli.js backup` → timestamped DB snapshot into `/backups`.
   - `cli.js ingest --channel auto --full-text --max-urls 200 --html-max-urls 20`
     (non-fatal: its exit code is captured, not aborted, so indexing still runs).
   - `cli.js index --provider local` → rebuilds the local semantic/FTS index.
   - The script exits with the ingest status so the unit surfaces partial failures.

**Per-source behaviour during `--channel auto`** (see [`src/ingestion.ts`](../src/ingestion.ts)):
each source is collected via its configured channel — RSS `feedUrl`, `sitemapUrl`, HTML
connector, or API connector. `robotsPolicy=respect` sources fetch `/robots.txt` and
filter disallowed URLs; a per-source `crawlDelaySeconds` throttles between requests;
size and page caps (`--max-urls`, `--html-max-urls`) bound each run. A source with no
verified feed and no connector is skipped with `no_feed` / `no_sitemap` rather than
guessed at. This is why a candidate is only promoted to `src/catalog.ts` once its feed
or connector is confirmed — the scheduler will otherwise skip it every 6 hours forever.

---

## 3. Source policy (public, verifiable, non-personal)

From the [roadmap](./roadmap.md) `سياسة المصادر` and the acceptance gate in the
expansion plan. Every candidate must satisfy all of:

- **Public & verifiable only.** The public MCP path accepts only sources whose documents
  are publicly reachable and re-verifiable by URL. Anything requiring a token, login, or
  private account stays **out** of the operational catalog, or appears as `catalog_only`
  with the reason recorded — never seeded as active.
- **No individual personal data.** Sensitive data, especially data about identifiable
  individuals, is not surfaced. Only published aggregates are used.
- **Provenance on every result.** Original source, fetch time, source type, and a
  re-verifiable link are mandatory; `archived_at` is required; claims are never assigned
  an automatic truth score.
- **Legal & ethical collection.** `robots.txt` must permit collection; licence/terms are
  recorded; crawl delay ≥ the published value or 2s when none is stated. Commercial or
  protected sources are not stored in full text without a licence — metadata + citation +
  link only, or excluded with a stated reason.
- **History is durable.** Retiring a source records the change and keeps its documents
  traceable; nothing is hard-deleted.

---

## 4. Expansion candidate list

Prioritised for the thin topics in §1.4 and for authoritative primaries. Each row lists
the intended `sourceType` and, where a feed/sitemap was actually checked on the review
date, its verification status. **Feed URLs marked "verify" are candidates only — do not
seed them until a live fetch confirms a valid feed** (§3, §5). A failed fetch during
review is *not* proof a source is dead (Egyptian NGO/gov hosts geo-block and rate-limit);
it just means "unverified."

Legend: ✅ confirmed live feed on 2026-07-20 · ⚠️ org confirmed, feed unverified/absent ·
🔒 likely needs connector (no public feed).

### 4A — Women's rights (highest-priority gap)

| Source | `sourceType` | ownership | URL | Feed / method | Status |
|--------|------|-----------|-----|---------------|--------|
| مؤسسة المرأة الجديدة (New Woman Foundation) | `human_rights` | civil_society | https://nwrcegypt.org | `https://nwrcegypt.org/feed/` (RSS 2.0, ar) | ✅ |
| نظرة للدراسات النسوية (Nazra for Feminist Studies) | `human_rights` | civil_society | https://nazra.org | `https://nazra.org/en/rss.xml` (RSS 2.0, 30 items; newest item 2023 — likely dormant) | ✅ (stale) |
| المركز المصري لحقوق المرأة (ECWR) | `human_rights` | civil_society | https://ecwronline.org | WordPress; `/feed/` returned 404 on review — needs a working feed path or HTML connector | ⚠️ |
| مؤسسة قضايا المرأة المصرية | `human_rights` | civil_society | (confirm official domain) | verify | ⚠️ |

> Note on Nazra: the feed is technically valid but its newest item predates 2024. Seed
> only if a canary run shows fresh documents, else keep `catalog_only` for historical depth.

### 4B — Digital rights / technology policy (thin)

| Source | `sourceType` | ownership | URL | Feed / method | Status |
|--------|------|-----------|-----|---------------|--------|
| مسار (Masaar — Technology and Law Community) | `human_rights` | civil_society | https://masaar.net | `https://masaar.net/feed/` — host returned 403 to the review fetcher (bot-block); verify from a normal client | ⚠️ |
| EIPR — digital privacy programme | (already active) | — | https://eipr.org | Deepen topic tagging rather than re-add | n/a |
| AFTE — digital freedoms | (already active) | — | https://afteegypt.org | Deepen topic tagging | n/a |

### 4C — Child rights (absent)

| Source | `sourceType` | ownership | URL | Feed / method | Status |
|--------|------|-----------|-----|---------------|--------|
| المجلس القومي للطفولة والأمومة (NCCM) | `official` | national_institution | https://www.nccm-egypt.org | verify — likely 🔒 HTML connector | ⚠️ |
| UNICEF Egypt — research & reports | `academic`/`official` | international_org | https://www.unicef.org/egypt | verify (UNICEF press feeds exist per-country) | ⚠️ |

### 4D — Statistics & macro primaries (thin — single point of failure)

| Source | `sourceType` | ownership | URL | Feed / method | Status |
|--------|------|-----------|-----|---------------|--------|
| البنك المركزي المصري (CBE) | `statistics` | government | https://www.cbe.org.eg | Retired — rehabilitate connector (Phase 3) | 🔒 |
| وزارة المالية | `statistics` | government | https://mof.gov.eg | Retired — `mof_posts` adapter exists in connectors | 🔒 |
| وزارة التخطيط والتنمية الاقتصادية — SDDS/NSDP | `statistics` | government | https://mped.gov.eg | Retired — static NSDP page | 🔒 |
| البورصة المصرية (EGX) | `statistics` | financial_market | https://www.egx.com.eg | verify feed / disclosures | ⚠️ |

### 4E — Legal & oversight primaries (authoritative)

| Source | `sourceType` | ownership | URL | Feed / method | Status |
|--------|------|-----------|-----|---------------|--------|
| محكمة النقض المصرية | `legal` | judiciary | https://www.cc.gov.eg | verify — likely 🔒 HTML/API | ⚠️ |
| مجلس الدولة المصري | `legal` | judiciary | https://www.egyptianbar... verify domain | verify | ⚠️ |
| الجهاز المركزي للمحاسبات (ASA) | `official` | oversight | verify domain | verify | ⚠️ |
| الهيئة الوطنية للانتخابات (NEA) | `official` | national_institution | https://www.elections.eg | verify | ⚠️ |
| المجلس الأعلى لتنظيم الإعلام | `official` | national_institution | verify domain | verify | ⚠️ |

### 4F — Labour & syndicates (absent)

| Source | `sourceType` | ownership | URL | Feed / method | Status |
|--------|------|-----------|-----|---------------|--------|
| نقابة الصحفيين المصرية | `official` | professional_syndicate | verify domain | verify | ⚠️ |
| دار الخدمات النقابية والعمالية (CTUWS) | `human_rights` | civil_society | verify domain | verify | ⚠️ |
| منظمة العمل الدولية — مكتب القاهرة (ILO Cairo) | `academic` | international_org | https://www.ilo.org | verify country feed | ⚠️ |

### 4G — Rights depth & regional (from the expansion plan, still valid)

مركز النديم, المنظمة المصرية لحقوق الإنسان, مركز هشام مبارك للقانون, ECESR, المفوضية
السامية للاجئين — مصر (UNHCR), IOM Egypt, OHCHR Egypt, UN Women Egypt. See the expansion
plan §4C for the full wave. Each still needs a verified feed or a purpose-built connector.

> Broader waves (economy/data ministries, universities/repositories, independent &
> regional media) are enumerated in the [expansion plan §4](./completion-and-source-expansion-plan.md);
> this document does not duplicate them — it front-loads the thin-topic gaps.

---

## 5. Sources added in this pass — and why zero were seeded now

**Zero sources were added to `src/catalog.ts` in this pass.** This is a deliberate,
conservative outcome, not an omission:

- The catalog test (`tests/catalog.test.ts`, out of edit scope for this change) hard-freezes
  the operational shape: exactly **35** active sources, **7** `html`, and **7** `api`.
  Because `collectionMethod` is derived as `feedUrl || sitemapUrl ? "hybrid" : connector.kind`,
  *any* net-new active seed breaks the length assertion, and attaching a feed/sitemap to an
  existing `html`/`api` source flips it to `hybrid` and breaks those counts. There is no way
  to add or enrich an operational entry without editing that test.
- The project's own guidance is "a broken source is worse than a missing one." A source seeded
  without a live-verified feed is skipped by the 6-hourly scheduler every run (`no_feed`),
  adding catalog noise and zero documents.

The two feeds confirmed live during review (New Woman Foundation, Nazra) are recorded as
top-of-queue candidates in §4A. Promoting them (and any of §4) is a follow-up that must land
together with the corresponding test update, under the acceptance gate below.

**Promotion checklist (per candidate):** confirm live feed/connector → confirm `robots.txt`
allows collection → run a 20-document extraction sample (≥95% accuracy, ≤5% duplicates) →
add the seed row (and connector if needed) → update `tests/catalog.test.ts` counts in the
same change → seven-day canary before backfill.

---

## 6. Source-request process (for researchers)

A researcher who hits an empty result for a topic can propose a source:

1. **Open a GitHub issue** titled `source-request: <publisher name>` on the
   [erx repository](https://github.com/ahmedvnabil/erx), including:
   - Publisher name (Arabic + English), homepage URL, and the topic gap it fills.
   - `sourceType` (one of: official, legal, news, human_rights, academic, statistics,
     investigative) and ownership type.
   - Language (`ar` / `en` / `mixed`).
   - A public **RSS/Atom feed URL** or **sitemap URL** if one exists — the single most
     useful field, because it lets the source be added without a bespoke connector.
   - Confirmation the source is **publicly accessible without a login/token** and does not
     publish individual personal data (§3).
2. **Triage against the policy (§3) and acceptance gate.** Maintainers verify the feed is
   live, `robots.txt` permits collection, and a 20-document sample extracts cleanly.
3. **Seed or defer.** Passing sources are added to `src/catalog.ts` (plus a connector in
   `src/connectors.ts` if there is no feed) with the test counts updated in the same change.
   Sources that fail extraction or policy are recorded here as `catalog_only` candidates with
   the reason, so the request is not silently lost.

Candidates in §4 are the current backlog for this process; PRs that verify a feed URL and
move a row from ⚠️ to ✅ are the most valuable contribution.
