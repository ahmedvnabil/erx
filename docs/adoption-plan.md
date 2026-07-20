# ERX Adoption & Distribution Plan

> The #1 adoption blocker for ERX is that people don't know it exists. This plan turns the existing product and technical assets into distribution. It is organized as five workstreams: (a) MCP Registry, (b) SEO for real Arabic research queries, (c) human channels (researchers/journalists/rights community), (d) developer distribution, and (e) metrics to watch.
>
> Keep every published claim truthful: ~1,300+ documents across ~35 sources, source-grounded, honest about limits. Do not overstate corpus size or coverage.

---

## A. MCP Registry submission

ERX already ships a valid `server.json` with `name` (mcpName) `io.github.ahmedvnabil/egypt-research`, a streamable-http remote at `https://erx-mcp.zad.tools/mcp`, and an npm package `egypt-research-mcp`. That is most of the work. Remaining steps:

1. **Confirm namespace ownership.** The mcpName namespace `io.github.ahmedvnabil` maps to the GitHub account `ahmedvnabil`, and the repo is `github.com/ahmedvnabil/erx`. Publishing authenticates against that GitHub identity, so make sure you can auth as `ahmedvnabil`.
2. **Install the publisher CLI.** Use the official `mcp-publisher` tool (from the modelcontextprotocol registry tooling). Authenticate via GitHub (`mcp-publisher login github` or the OAuth device flow).
3. **Validate `server.json` against the current schema.** The file already references the `2025-12-11` server schema. Run the publisher's validate step and fix any drift (version string, transport type, package identifier) before publishing.
4. **Verify the npm package is live and matches.** The registry cross-checks that the npm identifier `egypt-research-mcp` exists at the declared version (`1.0.0`) and that ownership/metadata line up. Publish or update the npm package first if needed (see workstream D).
5. **Publish:** `mcp-publisher publish` from the repo root. Confirm the entry appears in the registry and that the remote URL resolves.
6. **Keep versions in lockstep.** When you cut a new version, bump `server.json` `version`, the npm `version`, and re-publish to the registry so the listing doesn't go stale.

**Why it matters:** a registry listing makes ERX discoverable to every MCP client that reads the registry, and it's the canonical anchor that the awesome-lists and client directories (workstream D) point back to.

---

## B. SEO for real Arabic research queries

The site already ships `sitemap.xml`, `llms.txt`, and structured data. That's the technical foundation; the gap is **intent-matched content**. Egyptian researchers and journalists search in Arabic with buyer-intent, question-shaped queries. Target those.

### Query themes to target (map to real corpus strengths)

Only target topics ERX actually covers well today, so the landing experience delivers:

- التموين والدعم — "قرارات التموين"، "دعم السلع التموينية"، "أسعار الخبز المدعّم"
- القضاء — "أحكام قضائية"، متابعة قضايا بعينها
- حرية الصحافة — "انتهاكات حرية الصحافة في مصر"، "الصحفيون المحتجزون"
- اللاجئون — "خدمات اللاجئين في مصر"، "تسجيل المفوضية"
- سيناء — تطورات وملفات سيناء
- التشريعات والبرلمان — "الجريدة الرسمية"، "قوانين"، "مجلس النواب"
- جهاز مستقبل مصر — متابعة الجهاز ونشاطه

### Content targets

For each strong topic, create a durable, source-grounded landing/guide page (not thin SEO filler):

- **Title pattern:** `<الموضوع> — المصادر الأولية والتسلسل الزمني | ERX` (e.g. "قرارات التموين والدعم — المصادر الأولية والتسلسل الزمني | ERX").
- **Meta description pattern:** state the value in one honest sentence — "ابحث في المصادر الرسمية والحقوقية والإخبارية حول <الموضوع>، قارن التغطية، وابنِ خط زمن موثّق مع استشهادات جاهزة." Keep it under ~155 characters.
- **On-page content:** a short intro to the topic, a curated set of primary sources already in the corpus, an example question, and a direct link into `/explore` pre-scoped to that topic. This turns a search landing into an immediate research session.
- **Internal linking:** every topic page links to `/explore` and to 2–3 sibling topic pages.

### Technical SEO checklist

- Ensure each topic page is in `sitemap.xml` and has `Article`/`Dataset`-appropriate structured data.
- Keep `llms.txt` current so AI answer engines can cite ERX as a source — this is a distribution channel of its own (AI assistants recommending ERX).
- Set canonical URLs; make Arabic the primary `lang` for Arabic pages; provide `hreflang` if English variants exist.
- Fast, crawlable, no-JS-required content for the core text (matches the source-grounded, honest positioning).

---

## C. Channels to reach the human audience

The real audience is Arabic-speaking researchers, journalists, academics, and the rights/human-rights (HR) community. Meet them where they already work.

- **Journalist & fact-checking networks:** Arabic fact-checking initiatives, investigative-journalism collectives, and press-freedom organizations. Pitch ERX as a "back to primary source" tool. Offer a short demo workflow (see `showcase.md`).
- **Academic & think-tank circles:** researchers working on Egyptian economy, law, migration, and politics — via university mailing lists, research-center newsletters, and Arabic academic Twitter/X.
- **Rights community:** organizations tracking detention, press freedom, and refugees — the corpus already has depth here. Frame ERX as a sourced-timeline and citation tool for casework and reporting.
- **Newsletters & Substacks** covering Egypt/MENA affairs — offer a guest piece or a "how I researched this" walkthrough using ERX.
- **Communities of practice:** Arabic data-journalism groups, OSINT/verification communities, and library/archival science circles.
- **Launch content cadence:** post the bilingual launch announcement (see `launch-announcement.md`) to blog + X + LinkedIn + mailing list, then follow with one showcase workflow per week (from `showcase.md`) so there's a reason to keep sharing.
- **Direct seeding:** identify 15–25 named researchers/journalists who work on the corpus's strong topics and send a personal note with a topic-specific `/explore` link relevant to their beat.

---

## D. Developer distribution

Reach developers and AI-agent builders so ERX shows up inside the tools they already use.

- **npm:** publish and maintain `egypt-research-mcp`. Ensure a clear README (what it is, the MCP endpoint, REST base, example tool calls), keywords (`mcp`, `egypt`, `research`, `arabic`, `osint`), and version parity with `server.json`.
- **MCP client directories:** submit ERX to the connector/registry directories used by:
  - **Claude** (Desktop/Code MCP connectors) — remote streamable-http via `https://erx-mcp.zad.tools/mcp`.
  - **Cursor** — MCP server directory / one-click add config snippet.
  - **VS Code** — MCP extension config; provide a copy-paste `mcp.json` snippet.
- **Config snippets:** publish ready-to-paste config for each client (remote URL for hosted; `npx egypt-research-mcp` for stdio/local).
- **awesome-mcp lists:** open PRs adding ERX to the popular `awesome-mcp-servers` lists under a "research / data / knowledge" or regional category. Link to the registry entry and repo.
- **GitHub repo hygiene:** the repo (`ahmedvnabil/erx`) should have a README that leads with the value prop, the MCP/REST endpoints, and a 60-second quickstart; add topics/tags for discoverability.
- **Show, don't tell:** link the `showcase.md` workflows from the README so a developer immediately sees real tool calls (`egypt_search`, `egypt_hybrid_search`, `egypt_build_timeline`, `egypt_compare_sources`, `egypt_export_references`).

---

## E. Metrics to watch

Keep it simple and honest. Track direction, not vanity.

**Reach / discovery**
- `/explore` unique visitors and sessions (weekly).
- Organic search impressions & clicks for the target Arabic queries (Search Console).
- Referrals from AI assistants / registry / awesome-lists.

**Activation (did they actually research?)**
- Searches per session; % of sessions that open at least one source document.
- Use of the deeper tools: compare-sources, build-timeline, export-references.
- Citation exports (a strong intent signal).

**Developer / agent adoption**
- MCP endpoint request volume and unique clients.
- npm weekly downloads of `egypt-research-mcp`.
- Registry listing views; awesome-list / directory inclusions.

**Retention / word of mouth**
- Returning researchers (week-over-week).
- Inbound mentions from journalists/researchers citing ERX.
- Saved research queries (if the product exposes that).

**Content quality signal (guards the "honest" positioning)**
- Track cases where users report a claim wasn't properly sourced; treat as bugs, not noise. The trust of this audience is the product.

---

### First 30 days — suggested order

1. Publish to the MCP Registry (workstream A) — get the canonical anchor live.
2. Ship 3–5 topic landing pages for the strongest corpus areas (workstream B).
3. Post the bilingual launch announcement across blog/X/LinkedIn/mailing list (C).
4. Submit to npm + Claude/Cursor/VS Code directories + 1–2 awesome-mcp lists (D).
5. Stand up the metrics dashboard (E) and review weekly.
