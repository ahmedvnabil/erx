# How Researchers Use ERX

> Onboarding-by-example. Four realistic research workflows, each following the same shape: **question → search → compare sources → build timeline → export citation**. They use real corpus topics and the real ERX tools.
>
> Every workflow works three ways, using the same underlying data:
> - **Web:** at [`/explore`](https://erx-mcp.zad.tools/explore) — no account needed.
> - **MCP:** via an assistant connected to `https://erx-mcp.zad.tools/mcp`, calling the `egypt_*` tools.
> - **REST:** against `https://erx-mcp.zad.tools/api/v1`.
>
> **Tools referenced:** `egypt_search`, `egypt_hybrid_search`, `egypt_build_timeline`, `egypt_compare_sources`, `egypt_export_references`.
>
> A note on honesty: ERX surfaces and links primary sources. It does not certify claims as fact. Where independent sources disagree, that disagreement is the finding — compare before you conclude.

---

## Workflow 1 — Tracing a detention case

**Who:** a journalist or rights researcher following a specific detention.

**Question:** "متى ظهرت أولى الإشارات لهذه القضية، ومن غطّاها، وما المصادر الأولية؟"

1. **Search.** Start broad to find the case in the corpus.
   - MCP: `egypt_search` with the case name / key terms in Arabic.
   - For recall on synonyms and paraphrases, switch to `egypt_hybrid_search` (blends keyword + semantic) so you catch coverage that uses different wording for the same person or event.
   - Web: type the case terms into `/explore`; REST: `GET /api/v1/search?q=...`.
2. **Compare sources.** Use `egypt_compare_sources` to see how a rights organization, a news outlet, and any official statement each described the same detention. Note where the framing or the facts diverge — that gap is reportable.
3. **Build timeline.** Run `egypt_build_timeline` over the matched documents to order events: first report → statement → any legal/official step → follow-ups. The timeline is built from the documents themselves, each entry linked to its source.
4. **Export citation.** `egypt_export_references` to pull the references into your article or case file, already source-attributed.

**Corpus fit:** press-freedom and judiciary coverage are among ERX's stronger areas, so detention/press cases usually have multiple linkable sources to compare.

---

## Workflow 2 — Comparing coverage of a تموين / subsidy decision

**Who:** an economics researcher or reporter covering supply and subsidies.

**Question:** "قرار تموين بعينه — ما نصّه الأصلي، وكيف اختلفت تغطيته بين المصدر الرسمي والصحافة؟"

1. **Search.** `egypt_search` for the decision (e.g. terms around التموين / الدعم / السلع التموينية). Open the primary document — ideally the official text — first, so everything else is measured against it.
2. **Compare sources.** `egypt_compare_sources` to line up: the official/gazette version vs. how news outlets summarized it. Watch for numbers that drift (prices, quantities, eligibility) between the official text and secondary reporting.
3. **Build timeline.** `egypt_build_timeline` to sequence the decision: announcement → official publication → implementation notes → any amendment. Useful when a subsidy policy changes in steps over months.
4. **Export citation.** `egypt_export_references` so your piece cites the original decision, not a second-hand paraphrase.

**Corpus fit:** economy/supply is a strong topic; official + news layering makes this an ideal "compare the primary source vs. the coverage" exercise.

---

## Workflow 3 — Building a timeline on جهاز مستقبل مصر

**Who:** an analyst tracking a specific institution/entity over time.

**Question:** "ابنِ خط زمن موثّق لنشاط جهاز مستقبل مصر من المصادر المتاحة."

1. **Search.** `egypt_hybrid_search` for جهاز مستقبل مصر and related activity. Hybrid search helps here because the entity is referenced across news, official, and possibly legal contexts with varied phrasing.
2. **Compare sources.** `egypt_compare_sources` across the entity's mentions to distinguish official announcements from reporting and commentary.
3. **Build timeline.** `egypt_build_timeline` is the centerpiece of this workflow: assemble a dated, sourced sequence of the entity's milestones directly from documents. Each node carries its citation, so the timeline is defensible.
4. **Export citation.** `egypt_export_references` to hand the sourced timeline (with references) to an editor or into a report.

**Corpus fit:** entity-tracking timelines are exactly what the build-timeline tool is for; treat undated or single-source items cautiously and flag them.

---

## Workflow 4 — Following refugee (اللاجئون) services

**Who:** a researcher or caseworker mapping services and policy for refugees in Egypt.

**Question:** "ما الخدمات والقرارات المتعلقة باللاجئين في مصر، ومن مصدر كل معلومة؟"

1. **Search.** `egypt_search` for اللاجئون / خدمات اللاجئين / التسجيل, then broaden with `egypt_hybrid_search` to capture rights reports and official/statistical documents that use different terminology.
2. **Compare sources.** `egypt_compare_sources` to weigh how official, humanitarian/rights, and news sources each describe availability and access to services — differences here are often the substance of the research.
3. **Build timeline.** `egypt_build_timeline` to track how services or policies evolved (registration rules, service changes) with dates and sources.
4. **Export citation.** `egypt_export_references` for a sourced services map you can cite in a report or share with a team.

**Corpus fit:** refugees is a documented strength of the corpus, spanning rights and official sources — good for source-comparison work.

---

## The pattern, in one line

Every ERX workflow is the same discipline: **don't stop at a link — go to the primary source, compare how sources describe it, order the events with dates, and cite what you found.** ERX just makes each of those steps a single tool call (`egypt_search` / `egypt_hybrid_search` → `egypt_compare_sources` → `egypt_build_timeline` → `egypt_export_references`) — or a few clicks at [`/explore`](https://erx-mcp.zad.tools/explore).
