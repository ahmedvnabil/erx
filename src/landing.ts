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

const tools = {
  ar: [
    ["01", "search_egypt", "ابحث داخل مصر", "نتائج عربية مع نوع المصدر والتاريخ ورابط الأصل."],
    ["02", "compare_sources", "قارن الروايات", "اعرض الاتفاق والاختلاف دون اعتبار التكرار تحققًا."],
    ["03", "research_dossier", "ابنِ ملف القضية", "نتائج وخط زمني وكيانات وادعاءات في استدعاء واحد."],
    ["04", "build_timeline", "رتّب الأثر زمنيًا", "افصل تاريخ الحدث عن النشر والأرشفة."],
    ["05", "get_live_data", "اجلب المؤشر الحي", "بيانات عامة مع الترخيص ووقت الجلب ورابط المصدر."],
    ["06", "export_references", "سلّم الدليل", "RIS وBibTeX وCSV وJSONL جاهزة للعمل التالي."]
  ],
  en: [
    ["01", "search_egypt", "Search Egypt", "Arabic results with source type, date and original URL."],
    ["02", "compare_sources", "Compare accounts", "Show agreement and divergence without calling repetition proof."],
    ["03", "research_dossier", "Build the case file", "Results, timeline, entities and claims in one call."],
    ["04", "build_timeline", "Order the trace", "Keep event, publication and archive dates distinct."],
    ["05", "get_live_data", "Fetch live indicators", "Public data with license, retrieval time and source URL."],
    ["06", "export_references", "Hand off evidence", "RIS, BibTeX, CSV and JSONL for the next workflow."]
  ]
} as const;

export function landingContent(model: LandingModel): string {
  const rtl = model.language === "ar";
  const text = rtl ? {
    issue: "سجل بحث مفتوح للشأن المصري",
    title: "كل إجابة تبدأ من أثر.",
    lede: "ERX يربط الباحث والوكيل الذكي بالوثيقة الأصلية، تاريخها، وسياقها. اسأل عن مصر، وقارن المصادر قبل أن تستشهد.",
    explore: "ابدأ بحثًا موثقًا",
    connect: "اربط MCP",
    traceLabel: "مثال على أثر قابل للفحص",
    question: "ما الذي تغيّر في قانون العمل؟",
    result: "وثيقة أصلية، خط زمني، ومقارنة مصادر",
    flowKicker: "من السؤال إلى الدليل",
    flowTitle: "لا نعطيك خلاصة مغلقة. نعطيك طريق العودة.",
    flowIntro: "كل خطوة تحتفظ بالمصدر والتاريخ وسبب ظهور النتيجة، حتى تتمكن من فحصها أو تصديرها أو تمريرها إلى وكيل آخر.",
    connectKicker: "نقطة اتصال واحدة",
    connectTitle: "أدخل الأرشيف في سياق وكيلك.",
    connectIntro: "اتصال بعيد للبدء فورًا، أو تشغيل محلي فوق SQLite. البحث العام لا يحتاج Token.",
    remote: "اتصال بعيد",
    local: "تشغيل محلي",
    copy: "نسخ",
    contractKicker: "عقد البحث",
    contractTitle: "الثقة هنا بنية، لا نبرة.",
    contractIntro: "ERX لا يمنح المصدر درجة حقيقة آلية. يعرض ما تحتاجه لتكوين حكمك بنفسك.",
    final: "اسأل. قارن. استشهد.",
    finalNote: "مفتوح المصدر، قابل للفحص، ومصمم لأسئلة مصر.",
    status: "السجل الآن",
    documents: "وثيقة قابلة للاستشهاد",
    sources: "مصدرًا في الكتالوج",
    healthy: "مصدرًا متاحًا",
    toolCount: "أداة MCP"
  } : {
    issue: "Open research ledger for Egyptian public affairs",
    title: "Every answer starts with a trace.",
    lede: "ERX connects researchers and AI agents to the original document, its date and its context. Ask about Egypt, compare sources, then cite.",
    explore: "Start source-backed research",
    connect: "Connect MCP",
    traceLabel: "Example of an inspectable trace",
    question: "What changed in Egypt's labor law?",
    result: "Original record, timeline and source comparison",
    flowKicker: "From question to evidence",
    flowTitle: "Not a sealed summary. A route back to the record.",
    flowIntro: "Every step keeps its source, date and match reason so you can inspect it, export it or hand it to another agent. ERX answers with evidence.",
    connectKicker: "One connection point",
    connectTitle: "Put the archive in your agent's context.",
    connectIntro: "Use the remote endpoint now or run locally on SQLite. Public research needs no token.",
    remote: "Remote endpoint",
    local: "Local runtime",
    copy: "Copy",
    contractKicker: "Research contract",
    contractTitle: "Trust is structure, not tone.",
    contractIntro: "ERX does not assign automated truth scores. It exposes the context you need to make your own judgment.",
    final: "Ask. Compare. Cite.",
    finalNote: "Open source, inspectable and built for questions about Egypt.",
    status: "Ledger now",
    documents: "citable documents",
    sources: "catalogued sources",
    healthy: "available sources",
    toolCount: "MCP tools"
  };
  const toolRows = tools[model.language].map(([index, tool, title, description]) => `<article class="tool-row"><span class="tool-row__index">${index}</span><code>${tool}</code><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><span class="tool-row__arrow" aria-hidden="true">↙</span></article>`).join("");
  const datasetRows = model.datasets.slice(0, 6).map((dataset, index) => `<li><span>0${index + 1}</span>${escapeHtml(rtl ? dataset.name : dataset.provider)}</li>`).join("");
  return `<div class="evidence-ledger"><section class="ledger-hero product-shell"><div class="ledger-hero__copy"><p class="ledger-kicker">ERX / 001</p><p class="ledger-issue">${text.issue}</p><h1>${text.title}</h1><p class="ledger-lede">${text.lede}</p><div class="ledger-actions"><a class="ledger-action ledger-action--primary" href="/explore">${text.explore}<span aria-hidden="true">←</span></a><a class="ledger-action" href="#connect">${text.connect}<span aria-hidden="true">↙</span></a></div></div><aside class="trace-sample" aria-label="${text.traceLabel}"><header><span>${text.traceLabel}</span><b>TRACE / 072</b></header><div class="trace-question"><span>QUERY</span><p>${text.question}</p></div><ol><li><span>01</span><div><b>SOURCE</b><p>Official record / سجل رسمي</p></div><i>✓</i></li><li><span>02</span><div><b>DATE</b><p>published_at + archived_at</p></div><i>✓</i></li><li><span>03</span><div><b>CONTEXT</b><p>${text.result}</p></div><i>✓</i></li></ol><footer><span>ORIGIN PRESERVED</span><code>citation.url</code></footer></aside></section><div class="archive-ticker"><div class="product-shell"><span class="archive-ticker__status"><i></i>${text.status}</span><span><b>${model.documents}</b> ${text.documents}</span><span><b>${model.sources}</b> ${text.sources}</span><span><b>${model.healthy}</b> ${text.healthy}</span><span><b>${model.tools}</b> ${text.toolCount}</span></div></div><section id="capabilities" class="ledger-section product-shell"><div class="ledger-section__heading"><p class="ledger-kicker">02 / ${text.flowKicker}</p><h2>${text.flowTitle}</h2><p>${text.flowIntro}</p></div><div class="tool-ledger">${toolRows}</div></section><section id="connect" class="connection-field"><div class="product-shell connection-field__inner"><div class="connection-field__copy"><p class="ledger-kicker">03 / ${text.connectKicker}</p><h2>${text.connectTitle}</h2><p>${text.connectIntro}</p></div><div class="connection-lines"><div><span>${text.remote}</span><code>${escapeHtml(model.remote)}</code><button class="copy-control" data-copy="${escapeHtml(model.remote)}">${text.copy}</button></div><div><span>${text.local}</span><code>${escapeHtml(model.install)}</code><button class="copy-control" data-copy="${escapeHtml(model.install)}">${text.copy}</button></div></div></div></section><section class="ledger-section product-shell research-contract"><div class="research-contract__copy"><p class="ledger-kicker">04 / ${text.contractKicker}</p><h2>${text.contractTitle}</h2><p>${text.contractIntro}</p><div class="contract-rules"><p><span>01</span>${rtl ? "الرابط الأصلي ملازم لكل نتيجة" : "Original URL attached to every result"}</p><p><span>02</span>${rtl ? "تاريخ الحدث منفصل عن تاريخ النشر" : "Event date kept separate from publication date"}</p><p><span>03</span>${rtl ? "التكرار لا يُعرض باعتباره تحققًا" : "Repetition is never presented as verification"}</p></div></div><div class="dataset-index"><header><span>LIVE DATA / PUBLIC</span><b>${model.datasets.length.toString().padStart(2, "0")}</b></header><ol>${datasetRows}</ol><footer><a href="/api/v1/openapi.json">OpenAPI ↗</a><a href="/api/v1/status">STATUS ↗</a></footer></div></section><section class="ledger-final product-shell"><div><p>${text.finalNote}</p><h2>${text.final}</h2></div><a class="ledger-action ledger-action--primary" href="/explore">${text.explore}<span aria-hidden="true">←</span></a></section></div>`;
}

export const LANDING_V2_CSS = `
.skip-link{position:fixed;top:10px;inset-inline-start:10px;z-index:100;transform:translateY(-160%);background:oklch(94% .012 94);color:oklch(13% .012 154);padding:10px 14px;font-weight:700}.skip-link:focus{transform:none}
.landing-v2{--ledger-ink:oklch(13% .012 154);--ledger-panel:oklch(17% .014 154);--ledger-paper:oklch(94% .012 94);--ledger-muted:oklch(72% .012 154);--ledger-line:oklch(33% .014 154);--ledger-green:oklch(81% .19 148);background:var(--ledger-ink);color:var(--ledger-paper);font-family:"Readex Pro",Tahoma,Arial,sans-serif}.landing-v2 .product-nav{background:var(--ledger-ink);backdrop-filter:none}.landing-v2 .brand-copy strong{font-family:"Readex Pro",Tahoma,sans-serif;font-weight:700}.landing-v2 .brand-copy span{color:var(--ledger-muted)}.landing-v2 .product-links{font-weight:600}.landing-v2 a:focus-visible,.landing-v2 button:focus-visible{outline:2px solid var(--ledger-green);outline-offset:4px}.evidence-ledger{background-image:linear-gradient(var(--ledger-line) 1px,transparent 1px),linear-gradient(90deg,var(--ledger-line) 1px,transparent 1px);background-size:100% 120px,calc((100vw - 40px)/12) 100%;background-position:center 0}.ledger-hero{min-height:calc(100dvh - 72px);display:grid;grid-template-columns:minmax(0,7fr) minmax(340px,5fr);gap:clamp(48px,7vw,112px);align-items:center;padding-block:clamp(72px,9vw,132px)}.ledger-hero__copy{position:relative}.ledger-kicker{margin:0;color:var(--ledger-green);font:700 .72rem/1.3 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;text-transform:uppercase}.ledger-issue{margin:26px 0 0;color:var(--ledger-muted);font-size:.82rem}.ledger-hero h1{max-width:10ch;margin:18px 0 28px;font-size:clamp(4.4rem,8.8vw,9.6rem);font-weight:700;line-height:.88;letter-spacing:-.07em}.ledger-lede{max-width:62ch;margin:0;color:oklch(82% .01 154);font-size:clamp(1.05rem,1.5vw,1.28rem);line-height:1.9}.ledger-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:36px}.ledger-action{min-height:54px;display:inline-flex;align-items:center;justify-content:space-between;gap:36px;border:1px solid var(--ledger-green);padding:0 20px;color:var(--ledger-green);font-weight:700;text-decoration:none;transition:background-color .24s cubic-bezier(.16,1,.3,1),color .24s cubic-bezier(.16,1,.3,1),transform .24s cubic-bezier(.16,1,.3,1)}.ledger-action:hover{background:var(--ledger-paper);border-color:var(--ledger-paper);color:var(--ledger-ink);text-decoration:none}.ledger-action:active{transform:translateY(1px)}.ledger-action--primary{background:var(--ledger-green);color:var(--ledger-ink)}.trace-sample{align-self:end;margin-bottom:clamp(12px,5vw,72px);border:1px solid var(--ledger-line);background:var(--ledger-ink);box-shadow:16px 16px 0 oklch(81% .19 148/.08)}.trace-sample header,.trace-sample footer{min-height:48px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--ledger-line);color:var(--ledger-muted);font:650 .65rem/1.3 ui-monospace,SFMono-Regular,monospace;letter-spacing:.08em}.trace-sample header b{color:var(--ledger-green)}.trace-question{padding:24px;border-bottom:1px solid var(--ledger-line)}.trace-question span,.trace-sample li b{color:var(--ledger-green);font:700 .62rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.trace-question p{margin:10px 0 0;font-size:1.28rem;font-weight:600}.trace-sample ol{list-style:none;margin:0;padding:0}.trace-sample li{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:14px;padding:17px 20px;border-bottom:1px solid var(--ledger-line)}.trace-sample li>span{font:700 .68rem ui-monospace,SFMono-Regular,monospace;color:var(--ledger-muted)}.trace-sample li p{margin:5px 0 0;color:oklch(79% .01 154);font:500 .74rem/1.5 ui-monospace,SFMono-Regular,monospace}.trace-sample li i{width:22px;height:22px;display:grid;place-items:center;background:var(--ledger-green);color:var(--ledger-ink);font-style:normal}.trace-sample footer{border-bottom:0}.trace-sample footer code{color:var(--ledger-paper)}.archive-ticker{border-block:1px solid var(--ledger-line);background:var(--ledger-panel)}.archive-ticker>div{min-height:58px;display:flex;align-items:center;gap:0;overflow-x:auto;scrollbar-width:none}.archive-ticker span{flex:0 0 auto;padding:0 20px;border-inline-start:1px solid var(--ledger-line);color:var(--ledger-muted);font-size:.7rem;white-space:nowrap}.archive-ticker span:first-child{padding-inline-start:0;border-inline-start:0}.archive-ticker b{color:var(--ledger-paper);font-family:ui-monospace,SFMono-Regular,monospace}.archive-ticker__status{display:flex;align-items:center;gap:8px;color:var(--ledger-green)!important}.archive-ticker__status i{width:7px;height:7px;background:var(--ledger-green);animation:ledger-pulse 2.2s ease-out infinite}.ledger-section{padding-block:clamp(96px,12vw,180px);border-bottom:1px solid var(--ledger-line)}.ledger-section__heading{display:grid;grid-template-columns:2fr 7fr 3fr;gap:28px;align-items:start}.ledger-section h2,.connection-field h2,.ledger-final h2{margin:0;font-size:clamp(2.8rem,6vw,6.5rem);line-height:1.02;letter-spacing:-.055em}.ledger-section__heading>p:last-child,.connection-field__copy>p:last-child,.research-contract__copy>p{margin:4px 0 0;color:var(--ledger-muted);line-height:1.85}.tool-ledger{margin-top:64px;border-top:1px solid var(--ledger-paper)}.tool-row{position:relative;display:grid;grid-template-columns:54px minmax(150px,2fr) minmax(220px,3fr) minmax(260px,4fr) 28px;gap:22px;align-items:center;min-height:112px;border-bottom:1px solid var(--ledger-line);transition:background-color .25s cubic-bezier(.16,1,.3,1),padding .25s cubic-bezier(.16,1,.3,1)}.tool-row:hover{background:var(--ledger-panel);padding-inline:16px}.tool-row__index{color:var(--ledger-green);font:700 .7rem ui-monospace,SFMono-Regular,monospace}.tool-row code{direction:ltr;text-align:left;color:var(--ledger-green);font:650 .72rem ui-monospace,SFMono-Regular,monospace}.tool-row h3{margin:0;font-size:1.35rem}.tool-row p{margin:0;color:var(--ledger-muted);font-size:.86rem;line-height:1.7}.tool-row__arrow{color:var(--ledger-muted)}.connection-field{background:var(--ledger-green);color:var(--ledger-ink)}.connection-field__inner{padding-block:clamp(96px,11vw,156px);display:grid;grid-template-columns:5fr 7fr;gap:clamp(44px,7vw,100px);align-items:start}.connection-field .ledger-kicker{color:var(--ledger-ink)}.connection-field__copy>p:last-child{color:oklch(27% .035 151)}.connection-lines{border-top:1px solid var(--ledger-ink)}.connection-lines>div{position:relative;display:grid;grid-template-columns:120px 1fr auto;gap:18px;align-items:center;min-height:110px;border-bottom:1px solid var(--ledger-ink)}.connection-lines span{font-size:.74rem;font-weight:650}.connection-lines code{direction:ltr;text-align:left;overflow-wrap:anywhere;font:650 .78rem/1.6 ui-monospace,SFMono-Regular,monospace}.connection-lines .copy-control{position:static;border-color:var(--ledger-ink);background:transparent;color:var(--ledger-ink)}.connection-lines .copy-control:hover{background:var(--ledger-ink);color:var(--ledger-green)}.research-contract{display:grid;grid-template-columns:7fr 5fr;gap:clamp(48px,8vw,120px);align-items:start}.research-contract__copy h2{margin-top:18px;max-width:11ch}.research-contract__copy>p{max-width:62ch}.contract-rules{margin-top:48px;border-top:1px solid var(--ledger-paper)}.contract-rules p{display:grid;grid-template-columns:48px 1fr;gap:18px;margin:0;padding:18px 0;border-bottom:1px solid var(--ledger-line);color:var(--ledger-paper);font-weight:600}.contract-rules span{color:var(--ledger-green);font:700 .7rem ui-monospace,SFMono-Regular,monospace}.dataset-index{border:1px solid var(--ledger-line);background:var(--ledger-panel)}.dataset-index header,.dataset-index footer{min-height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid var(--ledger-line);font:700 .68rem ui-monospace,SFMono-Regular,monospace;color:var(--ledger-green)}.dataset-index header b{font-size:1.2rem}.dataset-index ol{list-style:none;margin:0;padding:0}.dataset-index li{display:grid;grid-template-columns:38px 1fr;gap:14px;padding:17px 18px;border-bottom:1px solid var(--ledger-line);font-size:.78rem;color:var(--ledger-muted)}.dataset-index li span{color:var(--ledger-green);font:700 .66rem ui-monospace,SFMono-Regular,monospace}.dataset-index footer{border-bottom:0;border-top:1px solid var(--ledger-paper);justify-content:flex-start;gap:22px}.dataset-index footer a{text-decoration:none}.ledger-final{padding-block:clamp(92px,12vw,168px);display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end}.ledger-final p{margin:0 0 18px;color:var(--ledger-muted)}.ledger-final h2{font-size:clamp(4rem,9vw,10rem)}@keyframes ledger-pulse{0%{box-shadow:0 0 0 0 oklch(81% .19 148/.38)}70%{box-shadow:0 0 0 8px oklch(81% .19 148/0)}100%{box-shadow:0 0 0 0 oklch(81% .19 148/0)}}@media(max-width:900px){.ledger-hero{grid-template-columns:1fr;min-height:auto}.trace-sample{align-self:auto;margin:0;max-width:640px}.ledger-section__heading{grid-template-columns:1fr}.ledger-section__heading h2{max-width:13ch}.tool-row{grid-template-columns:42px minmax(120px,1fr) 2fr 24px}.tool-row p{display:none}.connection-field__inner,.research-contract{grid-template-columns:1fr}.dataset-index{max-width:680px}.ledger-final{grid-template-columns:1fr;align-items:start}}@media(max-width:640px){.landing-v2 .product-shell{width:min(100% - 28px,1280px)}.evidence-ledger{background-size:100% 96px,25vw 100%}.ledger-hero{padding-block:64px 72px;gap:48px}.ledger-hero h1{font-size:clamp(3.6rem,19vw,5.8rem);max-width:9ch}.ledger-lede{font-size:1rem}.ledger-actions{display:grid}.ledger-action{width:100%}.archive-ticker span{padding-inline:14px}.ledger-section{padding-block:82px}.ledger-section h2,.connection-field h2{font-size:clamp(2.5rem,13vw,4rem)}.tool-ledger{margin-top:44px}.tool-row{grid-template-columns:32px 1fr 22px;gap:12px;min-height:100px}.tool-row code{display:none}.tool-row h3{font-size:1.08rem}.connection-field__inner{padding-block:82px}.connection-lines>div{grid-template-columns:1fr auto;padding-block:20px}.connection-lines>div>span{grid-column:1/-1}.connection-lines code{font-size:.68rem}.ledger-final{padding-block:80px}.ledger-final h2{font-size:clamp(3.5rem,18vw,6rem)}}@media(prefers-reduced-motion:reduce){.archive-ticker__status i{animation:none}.ledger-action,.tool-row{transition:none}}
`;
