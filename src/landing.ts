type Language = "ar" | "en";

export interface LandingModel {
  language: Language;
  documents: number;
  sources: number;
  healthy: number;
  tools: number;
  datasets: Array<{ name: string; provider: string }>;
  remote: string;
  install: string;
}

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]!);
const visibleText = (value: unknown): string => escapeHtml(String(value ?? "").replace(/[—–]/g, "-"));

const capabilities = {
  ar: [
    ["search_egypt", "ابحث بمرونة", "فتش داخل الوثائق العربية حسب المصدر والتاريخ والموضوع."],
    ["compare_sources", "قارن قبل أن تقتبس", "شاهد مواضع الاتفاق والاختلاف مع رابط كل أصل."],
    ["research_dossier", "كوّن ملفًا كاملًا", "اجمع النتائج والخط الزمني والكيانات والاستشهادات في طلب واحد."],
    ["build_timeline", "رتب الأحداث", "افصل تاريخ الحدث عن النشر والأرشفة بوضوح."],
    ["get_live_data", "أضف البيانات الحية", "اربط الوثائق بمؤشرات عامة مع الترخيص ووقت الجلب."],
    ["export_references", "صدّر المراجع", "انقل البحث إلى RIS أو BibTeX أو CSV أو JSONL."]
  ],
  en: [
    ["search_egypt", "Search with precision", "Filter Arabic records by source, date and subject."],
    ["compare_sources", "Compare before citing", "See agreement and divergence with every original URL."],
    ["research_dossier", "Build a complete dossier", "Gather results, timelines, entities and citations in one request."],
    ["build_timeline", "Order events clearly", "Keep event, publication and archive dates distinct."],
    ["get_live_data", "Add live public data", "Connect records to licensed indicators and retrieval dates."],
    ["export_references", "Export references", "Move research into RIS, BibTeX, CSV or JSONL."]
  ]
} as const;

const coverage = {
  ar: [
    ["سياسة واقتصاد", "قرارات الحكومة، الموازنة، المؤشرات الاقتصادية، وتغطية المؤسسات والصحف."],
    ["قانون وحقوق", "التشريعات والأحكام والبيانات الحقوقية مع الرجوع إلى الوثيقة الأصلية."],
    ["مجتمع وخدمات عامة", "الصحة والتعليم والعمل والسكان وما ينعكس مباشرة على الحياة اليومية."],
    ["إعلام وخطاب عام", "قارن كيف تعرض المصادر المصرية المختلفة القضية نفسها عبر الزمن."]
  ],
  en: [
    ["Politics and economy", "Government decisions, budgets, economic indicators and reporting across institutions and newsrooms."],
    ["Law and rights", "Legislation, rulings and rights reporting with a route back to the original record."],
    ["Society and public services", "Health, education, labour and population issues that shape daily life."],
    ["Media and public discourse", "Compare how Egyptian sources frame the same issue over time."]
  ]
} as const;

export function landingContent(model: LandingModel): string {
  const rtl = model.language === "ar";
  const text = rtl ? {
    eyebrow: "ERX / مرصد مصر البحثي",
    promise: "كل معلومة لها مصدر",
    titleA: "تابع الشأن المصري.",
    titleB: "ارجع إلى المصدر.",
    lede: "ابحث في الأخبار المصرية والوثائق والبيانات العامة، وقارن التغطيات، وابنِ إجابة يمكن مراجعة مصادرها.",
    explore: "ابحث في مصر",
    connect: "للمطورين والوكلاء",
    imageAlt: "مكتب بحث يضم وثائق وصحفًا وخريطة لمصر",
    archiveAlt: "أرشيفي يرتب ملفات ووثائق محفوظة",
    documents: "وثيقة قابلة للبحث",
    sources: "مصدرًا موثقًا",
    healthy: "مصدرًا متاحًا",
    tools: "أداة بحث",
    coverageLabel: "01 / ملفات مصر",
    coverageTitle: "من الخبر العاجل إلى سياقه الكامل.",
    coverageBody: "ابدأ من قضية مصرية، ثم تتبع تغطيتها ووثائقها وبياناتها بدل الاكتفاء بنتيجة بحث منفردة.",
    proofTitle: "المصدر ليس هامشًا. هو بداية الإجابة.",
    proofBody: "تحتفظ كل نتيجة بالرابط الأصلي وتاريخ النشر وسبب ظهورها، لتراجعها بنفسك قبل استخدامها.",
    original: "الأصل محفوظ",
    originalBody: "الرابط والعنوان والناشر ملازمة لكل نتيجة.",
    time: "الزمن واضح",
    timeBody: "نفصل الحدث عن النشر وعن لحظة الأرشفة.",
    context: "السياق ظاهر",
    contextBody: "لا نخلط كثرة التكرار مع صحة الادعاء.",
    flowTitle: "من سؤال واحد إلى ملف قابل للفحص.",
    flowBody: "اختر الأداة المناسبة، ثم احتفظ بطريق الرجوع إلى السجل الأصلي.",
    connectTitle: "ضع الأرشيف داخل سياق وكيلك.",
    connectBody: "استخدم نقطة الاتصال البعيدة فورًا، أو شغّل ERX محليًا فوق SQLite. البحث العام لا يحتاج رمز وصول.",
    remote: "اتصال بعيد",
    local: "تشغيل محلي",
    copy: "نسخ",
    datasets: "مصادر بيانات حية متاحة",
    finalTitle: "اسأل. قارن. استشهد.",
    finalBody: "بحث مفتوح المصدر، قابل للمراجعة، ومصمم لأسئلة مصر.",
    finalCta: "ابدأ البحث",
    workflow: [["01", "السؤال"], ["02", "المصادر"], ["03", "الأدلة"], ["04", "الاستشهاد"]]
  } : {
    eyebrow: "ERX / Egypt Research Commons",
    promise: "Every claim needs a source",
    titleA: "Follow Egyptian public affairs.",
    titleB: "Return to the source.",
    lede: "Search Egyptian news, documents and public data, compare coverage, and build answers whose sources remain open to review.",
    explore: "Search Egypt",
    connect: "For developers and agents",
    imageAlt: "Research desk with documents, newspapers and a map of Egypt",
    archiveAlt: "Archivist arranging preserved records and folders",
    documents: "searchable documents",
    sources: "documented sources",
    healthy: "available sources",
    tools: "research tools",
    coverageLabel: "01 / Egypt coverage",
    coverageTitle: "From a breaking story to its full context.",
    coverageBody: "Start with an Egyptian issue, then trace its reporting, records and data instead of stopping at one search result.",
    proofTitle: "The source is not a footnote. It is the answer's starting point.",
    proofBody: "Every result keeps its original URL, publication date and match reason so you can review it before use.",
    original: "Origin preserved",
    originalBody: "URL, title and publisher stay attached to every result.",
    time: "Time stays clear",
    timeBody: "Event, publication and archive dates remain distinct.",
    context: "Context stays visible",
    contextBody: "Repetition is never presented as verification.",
    flowTitle: "One question. A dossier you can inspect.",
    flowBody: "Choose the right tool, then keep a route back to the original record.",
    connectTitle: "Put the archive in your agent's context.",
    connectBody: "Use the remote endpoint now or run ERX locally on SQLite. Public research needs no access token.",
    remote: "Remote endpoint",
    local: "Local runtime",
    copy: "Copy",
    datasets: "Live public datasets",
    finalTitle: "Ask. Compare. Cite.",
    finalBody: "Open-source, reviewable research built for questions about Egypt.",
    finalCta: "Start researching",
    workflow: [["01", "Question"], ["02", "Sources"], ["03", "Evidence"], ["04", "Citation"]]
  };

  const capabilityCards = capabilities[model.language].map(([tool, title, description], index) => `<article class="capability-card capability-card--${index + 1}"><code>${tool}</code><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></article>`).join("");
  const datasetCards = model.datasets.slice(0, 6).map((dataset) => `<li><strong>${visibleText(dataset.provider)}</strong><span>${visibleText(dataset.name)}</span></li>`).join("");
  const workflow = text.workflow.map(([number, label]) => `<li><span>${number}</span><strong>${label}</strong></li>`).join("");
  const coverageCards = coverage[model.language].map(([title, description]) => `<article><h3>${title}</h3><p>${description}</p></article>`).join("");

  return `<div class="archive-home"><section class="archive-hero product-shell"><div class="archive-hero__copy"><p class="archive-eyebrow">${text.eyebrow}</p><p class="archive-promise">${text.promise}</p><h1><span>${text.titleA}</span><span>${text.titleB}</span></h1><p class="archive-hero__lede">${text.lede}</p><div class="archive-actions"><a class="archive-button archive-button--primary" href="/explore">${text.explore}</a><a class="archive-button archive-button--secondary" href="#connect">${text.connect}</a></div></div><figure class="archive-hero__media"><img src="/static/research-desk.webp" alt="${text.imageAlt}" width="1536" height="1024" fetchpriority="high"><figcaption><span>ERX / EVIDENCE GRAPH</span><strong>${rtl ? "المصدر ← السياق ← الإجابة" : "source → context → answer"}</strong></figcaption></figure></section><ol class="evidence-workflow product-shell" aria-label="${rtl ? "مسار البحث" : "Research workflow"}">${workflow}</ol><section class="archive-stats" aria-label="${rtl ? "حالة الأرشيف" : "Archive status"}"><div class="product-shell"><div><strong>${model.documents}</strong><span>${text.documents}</span></div><div><strong>${model.sources}</strong><span>${text.sources}</span></div><div><strong>${model.healthy}</strong><span>${text.healthy}</span></div><div><strong>${model.tools}</strong><span>${text.tools}</span></div></div></section><section class="coverage-section product-shell archive-reveal"><header><p class="section-index">${text.coverageLabel}</p><h2>${text.coverageTitle}</h2><p>${text.coverageBody}</p></header><div class="coverage-grid">${coverageCards}</div></section><section class="source-proof product-shell archive-reveal"><figure><img src="/static/archive-care.webp" alt="${text.archiveAlt}" width="1200" height="1500" loading="lazy"><figcaption>ARCHIVE / 002</figcaption></figure><div class="source-proof__copy"><p class="section-index">02 / PROVENANCE</p><h2>${text.proofTitle}</h2><p class="section-intro">${text.proofBody}</p><div class="proof-points"><article><h3>${text.original}</h3><p>${text.originalBody}</p></article><article><h3>${text.time}</h3><p>${text.timeBody}</p></article><article><h3>${text.context}</h3><p>${text.contextBody}</p></article></div></div></section><section id="capabilities" class="capability-section product-shell archive-reveal"><header><p class="section-index">03 / RESEARCH TOOLS</p><h2>${text.flowTitle}</h2><p>${text.flowBody}</p></header><div class="capability-grid">${capabilityCards}</div></section><section id="connect" class="connect-section product-shell archive-reveal"><div class="connect-section__copy"><p class="section-index">04 / DEVELOPERS</p><h2>${text.connectTitle}</h2><p>${text.connectBody}</p></div><div class="connection-stack"><div><span>${text.remote}</span><code>${escapeHtml(model.remote)}</code><button class="copy-control" data-copy="${escapeHtml(model.remote)}">${text.copy}</button></div><div><span>${text.local}</span><code>${escapeHtml(model.install)}</code><button class="copy-control" data-copy="${escapeHtml(model.install)}">${text.copy}</button></div></div><div class="dataset-strip"><h3>${text.datasets}</h3><ul>${datasetCards}</ul></div></section><section class="archive-final product-shell archive-reveal"><div><p class="archive-promise">${text.promise}</p><h2>${text.finalTitle}</h2><p>${text.finalBody}</p></div><a class="archive-button archive-button--primary" href="/explore">${text.finalCta}</a></section></div>`;
}

export const LANDING_V2_CSS = `
.skip-link{position:fixed;top:10px;inset-inline-start:10px;z-index:100;transform:translateY(-160%);background:#f4f0e8;color:#12243a;padding:10px 14px;font-weight:700}.skip-link:focus{transform:none}
.landing-v2{--page:#f3f1ec;--surface:#fbfaf7;--surface-2:#e8ecef;--ink:#14263a;--muted:#5e6872;--line:#c9ced1;--accent:#b84d3a;--accent-ink:#fffaf5;background:var(--page);color:var(--ink);font-family:"Readex Pro",Tahoma,Arial,sans-serif}.landing-v2 .product-nav{background:color-mix(in srgb,var(--page) 94%,transparent);border-color:var(--line);backdrop-filter:blur(18px)}.landing-v2 .brand-copy strong{font-family:"Readex Pro",Tahoma,sans-serif;font-weight:680}.landing-v2 .brand-copy span{color:var(--muted)}.landing-v2 .product-links{font-weight:560}.landing-v2 .product-links a{color:var(--ink)}.landing-v2 .language-link{border-color:var(--line);color:var(--accent)}.landing-v2 .product-footer{border-color:var(--line);color:var(--muted)}.landing-v2 a:focus-visible,.landing-v2 button:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.archive-home{overflow:hidden}.archive-hero{min-height:calc(100dvh - 72px);display:grid;grid-template-columns:minmax(360px,5fr) minmax(0,7fr);align-items:stretch;padding-block:34px 46px}.archive-hero__copy{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;padding:clamp(34px,5vw,76px);background:var(--surface);border:1px solid var(--line);border-inline-end:0}.archive-eyebrow{margin:0 0 24px;color:var(--accent);font-size:.82rem;font-weight:680}.archive-hero h1{margin:0;font-size:clamp(3.45rem,5.6vw,6.4rem);font-weight:690;line-height:1.02;letter-spacing:-.055em}.archive-hero h1 span{display:block}.archive-hero__lede{max-width:29rem;margin:28px 0 0;color:var(--muted);font-size:clamp(1rem,1.3vw,1.18rem);line-height:1.85}.archive-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.archive-button{min-height:52px;display:inline-flex;align-items:center;justify-content:center;padding:0 24px;border:1px solid var(--ink);color:var(--ink);font-weight:680;text-decoration:none;white-space:nowrap;transition:transform .25s cubic-bezier(.16,1,.3,1),background-color .25s,color .25s,border-color .25s}.archive-button:hover{text-decoration:none;transform:translateY(-2px)}.archive-button:active{transform:translateY(1px)}.archive-button--primary{border-color:var(--accent);background:var(--accent);color:var(--accent-ink)}.archive-button--primary:hover{background:var(--ink);border-color:var(--ink);color:var(--surface)}.archive-button--secondary:hover{background:var(--ink);color:var(--surface)}.archive-hero__media{min-height:0;margin:0;border:1px solid var(--line);overflow:hidden;background:var(--surface-2)}.archive-hero__media img{width:100%;height:100%;display:block;object-fit:cover;object-position:center;transition:transform 1.1s cubic-bezier(.16,1,.3,1)}.archive-hero:hover .archive-hero__media img{transform:scale(1.018)}.archive-stats{border-block:1px solid var(--line);background:var(--surface)}.archive-stats>.product-shell{display:grid;grid-template-columns:repeat(4,1fr)}.archive-stats div>div{min-height:118px;display:flex;flex-direction:column;justify-content:center;padding:18px 26px;border-inline-start:1px solid var(--line)}.archive-stats div>div:first-child{border-inline-start:0}.archive-stats strong{color:var(--accent);font:680 clamp(1.7rem,2.6vw,2.65rem)/1 ui-monospace,SFMono-Regular,monospace}.archive-stats span{margin-top:10px;color:var(--muted);font-size:.78rem}.source-proof{padding-block:clamp(88px,10vw,148px);display:grid;grid-template-columns:minmax(300px,5fr) minmax(0,7fr);gap:clamp(44px,8vw,116px);align-items:center}.source-proof figure{margin:0;aspect-ratio:4/5;overflow:hidden;background:var(--surface-2)}.source-proof img{width:100%;height:100%;display:block;object-fit:cover}.source-proof__copy h2,.capability-section h2,.connect-section h2,.archive-final h2{margin:0;font-size:clamp(2.6rem,4.9vw,5.2rem);line-height:1.08;letter-spacing:-.05em}.source-proof .section-intro{max-width:36rem;margin:28px 0 0;color:var(--muted);font-size:1.04rem;line-height:1.9}.proof-points{margin-top:52px;display:grid;grid-template-columns:repeat(2,1fr);gap:30px 38px}.proof-points article:first-child{grid-column:1/-1;max-width:34rem}.proof-points h3{margin:0 0 10px;font-size:1.05rem}.proof-points p{margin:0;color:var(--muted);font-size:.88rem;line-height:1.75}.capability-section{padding-block:clamp(82px,9vw,132px);border-top:1px solid var(--line)}.capability-section>header{max-width:50rem}.capability-section>header p{max-width:35rem;margin:24px 0 0;color:var(--muted);line-height:1.8}.capability-grid{margin-top:58px;display:grid;grid-template-columns:repeat(12,1fr);grid-auto-rows:minmax(180px,auto);gap:16px}.capability-card{display:flex;flex-direction:column;justify-content:flex-end;padding:30px;background:var(--surface);border:1px solid var(--line);transition:transform .25s cubic-bezier(.16,1,.3,1),border-color .25s}.capability-card:hover{transform:translateY(-4px);border-color:var(--accent)}.capability-card--1{grid-column:span 7;grid-row:span 2;background:var(--ink);color:var(--surface)}.capability-card--2,.capability-card--3{grid-column:span 5}.capability-card--4,.capability-card--5,.capability-card--6{grid-column:span 4}.capability-card code{direction:ltr;text-align:left;color:var(--accent);font:650 .72rem ui-monospace,SFMono-Regular,monospace}.capability-card h3{margin:26px 0 10px;font-size:clamp(1.25rem,2vw,1.8rem)}.capability-card p{max-width:32rem;margin:0;color:var(--muted);font-size:.88rem;line-height:1.75}.capability-card--1 p{color:#c9d0d4}.connect-section{margin-block:clamp(42px,7vw,90px);padding-block:clamp(72px,8vw,112px);border-block:1px solid var(--line);display:grid;grid-template-columns:minmax(0,5fr) minmax(380px,7fr);gap:clamp(40px,7vw,96px)}.connect-section__copy p{max-width:34rem;margin:24px 0 0;color:var(--muted);line-height:1.9}.connection-stack{border-top:1px solid var(--ink)}.connection-stack>div{position:relative;display:grid;grid-template-columns:120px 1fr auto;align-items:center;gap:18px;min-height:112px;border-bottom:1px solid var(--line)}.connection-stack span{font-size:.78rem;font-weight:650}.connection-stack code{direction:ltr;text-align:left;color:var(--ink);font:620 .78rem/1.6 ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}.connection-stack .copy-control{position:static;border:1px solid var(--ink);background:transparent;color:var(--ink);padding:9px 12px;cursor:pointer;font-weight:650}.connection-stack .copy-control:hover{background:var(--ink);color:var(--surface)}.dataset-strip{grid-column:1/-1;margin-top:18px}.dataset-strip h3{margin:0 0 18px;font-size:1rem}.dataset-strip ul{display:flex;gap:12px;margin:0;padding:0 0 10px;list-style:none;overflow-x:auto;scroll-snap-type:x mandatory}.dataset-strip li{flex:0 0 min(300px,78vw);scroll-snap-align:start;padding:20px;background:var(--surface-2);border-inline-start:3px solid var(--accent)}.dataset-strip strong,.dataset-strip span{display:block}.dataset-strip strong{font-size:.78rem}.dataset-strip span{margin-top:8px;color:var(--muted);font-size:.76rem}.archive-final{min-height:58vh;padding-block:clamp(96px,12vw,170px);display:flex;align-items:flex-end;justify-content:space-between;gap:42px}.archive-final p{max-width:34rem;margin:22px 0 0;color:var(--muted);font-size:1rem;line-height:1.8}.archive-reveal{animation:archive-rise linear both;animation-timeline:view();animation-range:entry 8% cover 28%}@keyframes archive-rise{from{opacity:.15;transform:translateY(34px)}to{opacity:1;transform:none}}@media(prefers-color-scheme:dark){.landing-v2{--page:#111923;--surface:#172331;--surface-2:#202e3b;--ink:#edf0ed;--muted:#aeb8bd;--line:#3a4753;--accent:#d66b55;--accent-ink:#111923}.landing-v2 .brand-mark{filter:contrast(.9)}.capability-card--1{background:#edf0ed;color:#152536}.capability-card--1 p{color:#5d6872}.connection-stack .copy-control:hover{color:#111923}}@media(max-width:900px){.archive-hero{grid-template-columns:1fr;min-height:auto}.archive-hero__copy{order:2;border-inline-end:1px solid var(--line);border-top:0}.archive-hero__media{order:1;aspect-ratio:16/9}.archive-stats>.product-shell{grid-template-columns:repeat(2,1fr)}.archive-stats div>div:nth-child(3){border-top:1px solid var(--line);border-inline-start:0}.archive-stats div>div:nth-child(4){border-top:1px solid var(--line)}.source-proof{grid-template-columns:1fr}.source-proof figure{max-width:620px}.capability-card--1,.capability-card--2,.capability-card--3{grid-column:span 12;grid-row:auto}.capability-card--4,.capability-card--5,.capability-card--6{grid-column:span 6}.connect-section{grid-template-columns:1fr}.archive-final{min-height:auto;align-items:flex-start;flex-direction:column}}@media(max-width:640px){.landing-v2 .product-shell{width:min(100% - 28px,1280px)}.archive-hero{padding-block:14px 34px}.archive-hero__media{aspect-ratio:4/3}.archive-hero__copy{padding:32px 22px}.archive-eyebrow{margin-bottom:18px}.archive-hero h1{font-size:clamp(2.75rem,14vw,4rem)}.archive-hero__lede{margin-top:20px;font-size:.95rem}.archive-actions{display:grid;margin-top:26px}.archive-button{width:100%}.archive-stats div>div{min-height:104px;padding:16px}.archive-stats span{font-size:.7rem}.source-proof{padding-block:78px;gap:38px}.source-proof__copy h2,.capability-section h2,.connect-section h2,.archive-final h2{font-size:clamp(2.3rem,11vw,3.4rem)}.proof-points{grid-template-columns:1fr;margin-top:38px}.proof-points article:first-child{grid-column:auto}.capability-section{padding-block:74px}.capability-grid{grid-template-columns:1fr;margin-top:42px}.capability-card--1,.capability-card--2,.capability-card--3,.capability-card--4,.capability-card--5,.capability-card--6{grid-column:auto;min-height:190px}.connect-section{margin-block:18px;padding-block:70px}.connection-stack>div{grid-template-columns:1fr auto;padding-block:20px}.connection-stack span{grid-column:1/-1}.connection-stack code{font-size:.7rem}.archive-final{padding-block:82px}}@media(prefers-reduced-motion:reduce){.archive-reveal{animation:none}.archive-button,.archive-hero__media img,.capability-card{transition:none}.archive-hero:hover .archive-hero__media img{transform:none}}
.archive-hero h1{font-size:clamp(3.3rem,4.7vw,5rem);line-height:1.08;letter-spacing:-.05em}.archive-hero h1 span{white-space:nowrap}@media(max-width:640px){.archive-hero h1 span{white-space:normal}}
@media(max-width:640px){.landing-v2 .product-shell{width:min(calc(100% - 28px),1280px)}.landing-v2 .product-nav__inner,.landing-v2 .brand-lockup,.landing-v2 .product-links,.archive-hero,.archive-hero__copy{min-width:0}.landing-v2 .brand-copy strong{font-size:.88rem}.landing-v2 .product-links{justify-content:flex-start}.landing-v2 .product-links a:nth-child(3),.landing-v2 .product-links a:nth-child(4){display:none}.archive-hero h1{max-width:100%;font-size:clamp(2.1rem,10vw,2.65rem);line-height:1.12;letter-spacing:-.035em;overflow-wrap:anywhere}}

/* ERX evidence system */
.landing-v2{--page:#090b0c;--surface:#0e1211;--surface-2:#151b18;--ink:#eef0e8;--muted:#9ca3a0;--line:#29312d;--accent:#57e389;--accent-ink:#07100a;background-color:var(--page);background-image:linear-gradient(rgba(87,227,137,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(87,227,137,.035) 1px,transparent 1px);background-size:48px 48px}.landing-v2 .product-nav{background:rgba(9,11,12,.93);border-color:var(--line)}.landing-v2 .brand-copy span,.landing-v2 .product-footer{color:var(--muted)}.landing-v2 .language-link{color:var(--accent);border-color:var(--accent)}.archive-hero{min-height:calc(100dvh - 72px);padding-block:28px 34px}.archive-hero__copy{border-color:var(--line);background:linear-gradient(145deg,#101513 0%,#0b0e0d 72%)}.archive-eyebrow,.section-index{font-family:ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;text-transform:uppercase}.archive-promise{width:max-content;margin:0 0 24px;padding:8px 10px;border-inline-start:3px solid var(--accent);background:rgba(87,227,137,.08);color:var(--ink);font-weight:650}.archive-hero h1{font-weight:700}.archive-hero__media{position:relative;border-color:var(--line)}.archive-hero__media img{filter:saturate(.68) contrast(1.07)}.archive-hero__media:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(9,11,12,.38),transparent 38%),linear-gradient(0deg,rgba(9,11,12,.72),transparent 38%)}.archive-hero__media figcaption{position:absolute;z-index:1;inset-inline:28px;bottom:26px;display:flex;justify-content:space-between;gap:24px;color:var(--ink);font:600 .7rem ui-monospace,SFMono-Regular,monospace;letter-spacing:.08em}.archive-hero__media figcaption span{color:var(--accent)}.archive-button{border-color:var(--ink)}.archive-button--primary{border-color:var(--accent);background:var(--accent);color:var(--accent-ink)}.archive-button--primary:hover{background:var(--ink);border-color:var(--ink);color:var(--page)}.archive-button--secondary:hover{background:var(--ink);color:var(--page)}.evidence-workflow{display:grid;grid-template-columns:repeat(4,1fr);margin-block:0 34px;padding:0;list-style:none;border-block:1px solid var(--line)}.evidence-workflow li{position:relative;display:flex;align-items:center;gap:14px;min-height:72px;padding:14px 20px;border-inline-start:1px solid var(--line)}.evidence-workflow li:first-child{border-inline-start:0}.evidence-workflow li:not(:last-child):after{content:"→";position:absolute;z-index:1;inset-inline-end:-10px;color:var(--accent);background:var(--page);padding:2px}.evidence-workflow span{color:var(--accent);font:600 .68rem ui-monospace,SFMono-Regular,monospace}.evidence-workflow strong{font-size:.84rem}.archive-stats{background:#0d110f;border-color:var(--line)}.archive-stats div>div{border-color:var(--line)}.archive-stats strong{color:var(--accent)}.section-index{margin:0 0 20px;color:var(--accent);font-size:.72rem}.source-proof figure{position:relative}.source-proof figure:after{content:"";position:absolute;inset:0;border:1px solid rgba(87,227,137,.3);pointer-events:none}.source-proof img{filter:saturate(.55) contrast(1.05)}.source-proof figcaption{position:absolute;bottom:16px;inset-inline-start:18px;padding:6px 8px;background:var(--page);color:var(--accent);font:600 .66rem ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em}.capability-section,.connect-section{border-color:var(--line)}.capability-card{background:#0e1311;border-color:var(--line)}.capability-card--1{background:var(--ink);color:#0b100d}.capability-card--1 p{color:#56615b}.capability-card code{color:var(--accent)}.connection-stack{border-color:var(--accent)}.connection-stack .copy-control{border-color:var(--accent);color:var(--accent)}.connection-stack .copy-control:hover{background:var(--accent);color:var(--accent-ink)}.dataset-strip li{background:var(--surface-2);border-color:var(--accent)}.archive-final{position:relative}.archive-final:before{content:"ERX";position:absolute;inset-inline-end:0;top:50%;transform:translateY(-56%);z-index:0;color:transparent;-webkit-text-stroke:1px rgba(87,227,137,.15);font:800 clamp(8rem,26vw,24rem)/1 Arial,sans-serif;letter-spacing:-.08em;pointer-events:none}.archive-final>*{position:relative;z-index:1}
@media(prefers-color-scheme:light){.landing-v2{--page:#090b0c;--surface:#0e1211;--surface-2:#151b18;--ink:#eef0e8;--muted:#9ca3a0;--line:#29312d;--accent:#57e389;--accent-ink:#07100a}.capability-card--1{background:var(--ink);color:#0b100d}.capability-card--1 p{color:#56615b}}
@media(max-width:640px){.archive-promise{font-size:.82rem}.archive-hero__media figcaption{inset-inline:16px;bottom:14px;flex-direction:column;gap:4px}.evidence-workflow{grid-template-columns:repeat(2,1fr);margin-bottom:22px}.evidence-workflow li:nth-child(3){border-top:1px solid var(--line);border-inline-start:0}.evidence-workflow li:nth-child(4){border-top:1px solid var(--line)}.evidence-workflow li:nth-child(2):after{content:"↓"}.evidence-workflow li:nth-child(3):after{content:"←"}.archive-final:before{top:35%}}
.coverage-section{padding-block:clamp(88px,10vw,148px);border-bottom:1px solid var(--line)}.coverage-section>header{display:grid;grid-template-columns:4fr 8fr;column-gap:clamp(32px,7vw,96px);align-items:end}.coverage-section>header .section-index{grid-column:1/-1}.coverage-section h2{margin:0;max-width:12ch;font-size:clamp(2.7rem,5.2vw,5.6rem);line-height:1.05;letter-spacing:-.055em}.coverage-section>header>p:last-child{max-width:34rem;margin:0 0 .5rem;color:var(--muted);line-height:1.9}.coverage-grid{display:grid;grid-template-columns:repeat(4,1fr);margin-top:64px;border-block:1px solid var(--line)}.coverage-grid article{min-height:230px;padding:30px 24px;border-inline-start:1px solid var(--line)}.coverage-grid article:first-child{border-inline-start:0}.coverage-grid h3{margin:0 0 60px;font-size:1.08rem}.coverage-grid p{margin:0;color:var(--muted);font-size:.86rem;line-height:1.8}.coverage-grid article:hover{background:rgba(87,227,137,.055)}
@media(max-width:900px){.coverage-section>header{grid-template-columns:1fr}.coverage-section>header>p:last-child{margin-top:24px}.coverage-grid{grid-template-columns:repeat(2,1fr)}.coverage-grid article:nth-child(3){border-top:1px solid var(--line);border-inline-start:0}.coverage-grid article:nth-child(4){border-top:1px solid var(--line)}}
@media(max-width:640px){.coverage-section{padding-block:74px}.coverage-grid{grid-template-columns:1fr;margin-top:42px}.coverage-grid article{min-height:auto;border-inline-start:0;border-top:1px solid var(--line)}.coverage-grid article:first-child{border-top:0}.coverage-grid h3{margin-bottom:24px}.coverage-section h2{font-size:clamp(2.3rem,11vw,3.4rem)}}
`;
