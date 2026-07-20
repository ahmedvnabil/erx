import { BRAND, esc, pageShell } from "./product.js";

// Human-facing trust and transparency surface. Every page is Arabic-first with an
// English sub-block, rendered through the shared pageShell so the nav, footer,
// external stylesheet and CSP-safe head stay identical to the rest of the site.

const en = (text: string): string => `<span class="trust-en" lang="en" dir="ltr">${text}</span>`;
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function aboutPage(baseUrl: string): string {
  const content = `<section class="product-shell docs-hero"><p class="eyebrow">ERX / ${esc(BRAND.englishName)}</p><h1>من نحن</h1><p class="section-intro">${esc(BRAND.arabicName)} — بنية بحث مفتوحة تجعل كل معلومة عن الشأن المصري قابلة للاستشهاد بمصدرها الأصلي.</p></section>
<div class="product-shell docs-content trust-page">
<section><h2>ما هو ERX؟</h2><p>ERX أرشيف بحثي موثّق للشأن العام المصري. يجمع الوثائق الرسمية والقانونية والإحصائية والحقوقية والإخبارية والأكاديمية في فهرس واحد قابل للبحث، ويعيد مع كل نتيجة رابطها الأصلي وناشرها وتاريخها.</p><p><strong>ما لسنا كذلك:</strong> ERX ليس منصّة إعلامية ولا جهة تحقّق، ولا يصدر حكمًا على صحة أي ادعاء. نوع المصدر وملكيته سياقٌ بحثي يعينك على المقارنة، وليس درجة حقيقة آلية.</p>${en("ERX is a source-grounded research archive for Egyptian public affairs. It is not a media outlet and does not adjudicate truth; source type and ownership are research context, not an automated truth score.")}</section>
<section><h2>مهمتنا</h2><p>أن يبدأ كل بحث عن مصر من وثيقة ورابط وتاريخ — لا من تخمين. نخدم الباحثين والصحفيين والوكلاء الذكية من طبقة بيانات واحدة قابلة للمراجعة، بحيث يمكن لأي شخص أن يرجع بنفسه إلى المصدر الأصلي ويتحقق.</p>${en("Every claim needs a source. We serve researchers, journalists and AI agents from one reviewable data layer where anyone can return to the original source and verify.")}</section>
<section><h2>المنهجية باختصار</h2><ol><li>الأولوية للوثائق الأولية والنصوص القانونية والإحصاءات الرسمية.</li><li>ثم التغطية المستقلة والتحقيقات المتقاطعة.</li><li>ثم البيانات الحقوقية والمنهجيات المنشورة.</li></ol><p>نفصل دائمًا بين تاريخ الحدث وتاريخ النشر وتاريخ الأرشفة. وتكرار الادعاء عبر عدة منافذ لا يجعله تحققًا مستقلًا. للتفاصيل الكاملة انظر <a href="/methodology">صفحة المنهجية</a> و<a href="/docs">التوثيق</a>.</p>${en("Primary documents first, then independent reporting, then published rights data. Event, publication and archive dates are always separated. Repetition across outlets is not independent verification.")}</section>
<section><h2>الجهة المشغّلة والتواصل</h2>
<!-- OPERATOR: to be filled by maintainer — do not invent an operator name, organization, email, or address -->
<div class="operator-block"><p><b>الجهة المشغّلة:</b> —</p><p><b>للتواصل:</b> —</p><p>هذا الحقل مخصّص لجهة تشغيل الخدمة كي تعلن هويتها ووسيلة التواصل معها. الكود مفتوح المصدر بترخيص MIT ومتاح للمراجعة العلنية.</p></div>${en("Operator identity and contact are to be filled in by the maintainer. The code is open source under the MIT license and open to public review.")}</section>
</div>`;
  return pageShell(content, { language: "ar", title: `من نحن — ${BRAND.arabicName}`, description: "من نحن: بنية بحث مفتوحة موثّقة للشأن المصري، ليست منصّة إعلامية ولا جهة تحقّق.", path: "/about", baseUrl });
}

export function privacyPage(baseUrl: string): string {
  const content = `<section class="product-shell docs-hero"><p class="eyebrow">ERX / PRIVACY</p><h1>الخصوصية</h1><p class="section-intro">نذكر هنا وقائع يمكن التحقق منها في الكود المفتوح فقط — لا وعود لا يسندها المصدر.</p></section>
<div class="product-shell docs-content trust-page">
<section><h2>لا تسجيل لاستعلامات البحث</h2><p>طبقة الويب <strong>لا تسجّل ولا تخزّن استعلامات البحث</strong> على الخادم. تمرّ عمليات البحث كاستعلام قراءة فقط على قاعدة البيانات، ولا يُكتب نص الاستعلام في أي سجل. (تُسجَّل الأخطاء التقنية مع معرّف الطلب فقط، دون محتوى استعلامك.) «عمليات البحث المحفوظة» ميزة اختيارية محلية بطلب صريح منك، وهي معطّلة على واجهة الويب العامة.</p>${en("The web layer does not log or store search queries server-side. Searches run as read-only database queries; only technical errors are logged, with a request id and no query text.")}</section>
<section><h2>لا كوكيز تتبّع ولا تحليلات طرف ثالث</h2><p>لا يضع الموقع <strong>أي كوكيز تتبّع</strong> ولا يحمّل أدوات <strong>تحليلات أو تتبّع من طرف ثالث</strong>. لا توجد بكسلات تتبّع ولا معرّفات إعلانية.</p>${en("No tracking cookies. No third-party analytics or tracking. No tracking pixels or advertising identifiers.")}</section>
<section><h2>احترام robots.txt أثناء الجمع</h2><p>أثناء جمع المصادر يُطبَّق فحص <code>robots.txt</code> ويُحترم وفق سياسة كل مصدر (السياسة الافتراضية هي الاحترام). لا نتجاوز توجيهات المواقع التي تضبط سياستها على الاحترام.</p>${en("robots.txt is honored during ingestion, per each source's robots policy (the default policy is respect).")}</section>
<section><h2>الترخيص وحقوق المحتوى</h2><p>كود ERX مفتوح المصدر بترخيص <strong>MIT</strong>، بينما تبقى حقوق محتوى المصادر المفهرسة لأصحابها الأصليين. نحن نفهرس البيانات الوصفية والمقتطفات ونعيدك إلى المصدر الأصلي؛ الحقوق الكاملة تخصّ الناشرين.</p>${en("The ERX code is MIT-licensed, while rights to indexed source content remain with their original owners.")}</section>
</div>`;
  return pageShell(content, { language: "ar", title: `الخصوصية — ${BRAND.arabicName}`, description: "الخصوصية: لا تسجيل لاستعلامات البحث، لا كوكيز تتبّع، احترام robots.txt، وترخيص MIT للكود.", path: "/privacy", baseUrl });
}

export function safetyPage(baseUrl: string): string {
  const content = `<section class="product-shell docs-hero"><p class="eyebrow">ERX / RESEARCHER SAFETY</p><h1>السلامة للباحثين</h1><p class="section-intro">إرشادات عملية للبحث في الموضوعات الحسّاسة عبر ERX.</p></section>
<div class="product-shell docs-content trust-page">
<section><h2>ما الذي يُجمع وما الذي لا يُجمع</h2><p>لا تجمع طبقة الويب استعلامات بحثك ولا تخزّنها على الخادم، ولا تستخدم كوكيز تتبّع أو تحليلات طرف ثالث (انظر <a href="/privacy">صفحة الخصوصية</a>). ما نفهرسه هو وثائق ومصادر عامة منشورة، لا نشاطك أنت.</p>${en("Your searches are not logged or stored server-side, and there are no tracking cookies or third-party analytics. What we index is public published material, not your activity.")}</section>
<section><h2>المصدر الأصلي هو المرجع دائمًا</h2><p>كل نتيجة تعيد رابط <strong>المصدر الأصلي</strong> وتاريخه وناشره. اعتمد دائمًا على الرابط الأصلي كمرجعك النهائي، وتحقّق منه مباشرة قبل الاقتباس أو النشر.</p>${en("Every result links back to the original source. Always treat that original link as your reference of record and verify it directly before citing.")}</section>
<section><h2>لا تجميع لبيانات الأفراد</h2><p>لا يُنشئ ERX ملفات عن أفراد بعينهم ولا يجمّع بياناتهم الشخصية؛ تركيزه على الشأن العام والوثائق والجهات، وفق سياسة المصادر. إذا صادفت بيانات شخصية داخل وثيقة مصدر، فهي مسؤولية ناشرها الأصلي.</p>${en("ERX does not compile personal data about private individuals; its focus is public affairs, documents and institutions, per the source policy.")}</section>
<section><h2>حافظ على أمنك التشغيلي</h2><p>إذا كنت تبحث في موضوع حسّاس، فاتّبع ممارسات الأمن التشغيلي الخاصة بك: استخدم شبكة تثق بها، وافصل هويّاتك عند الحاجة، وانتبه إلى أن أي بيانات تصفّح تمرّ عبر شبكتك أو مزوّد خدمتك خارجة عن سيطرة ERX. هذه الصفحة إرشادية ولا تُغني عن تقدير المخاطر الخاص بك.</p>${en("For sensitive research, follow your own operational-security practices. Browsing metadata handled by your network or provider is outside ERX's control; this guidance does not replace your own risk assessment.")}</section>
</div>`;
  return pageShell(content, { language: "ar", title: `السلامة للباحثين — ${BRAND.arabicName}`, description: "السلامة للباحثين: ما يُجمع وما لا يُجمع، المصدر الأصلي هو المرجع، ولا تجميع لبيانات الأفراد.", path: "/safety", baseUrl });
}

export function statusPage(coverage: Record<string, unknown>, baseUrl: string): string {
  const documents = num(coverage["documents"]);
  const searchable = num(coverage["searchableDocuments"]);
  const sources = num(coverage["sources"]);
  const healthy = num(coverage["healthySources"]);
  const rawTopics = coverage["topicCounts"];
  const topics = rawTopics && typeof rawTopics === "object" ? Object.entries(rawTopics as Record<string, unknown>) : [];
  const stats: Array<[number, string]> = [
    [documents, "وثيقة مؤرشفة"],
    [searchable, "وثيقة قابلة للبحث"],
    [sources, "مصدر"],
    [healthy, "مصدر صحّي"]
  ];
  const topicRows = topics.length
    ? topics.map(([topic, count]) => `<tr><td>${esc(topic)}</td><td>${num(count)}</td></tr>`).join("")
    : `<tr><td>—</td><td>0</td></tr>`;
  const content = `<section class="product-shell docs-hero"><p class="eyebrow">ERX / STATUS</p><h1>حالة الأرشيف</h1><p class="section-intro">لقطة حيّة لحجم الأرشيف وصحّة المصادر والتغطية حسب الموضوع. النسخة المهيّأة للآلة متاحة على <a href="/status">/status</a> بصيغة JSON.</p></section>
<section class="mcp-stats"><div class="product-shell mcp-stats__inner">${stats.map(([value, label]) => `<div><strong>${value}</strong><span>${esc(label)}</span></div>`).join("")}</div></section>
<div class="product-shell docs-content trust-page">
<section><h2>التغطية حسب الموضوع</h2><div class="scroll-x"><table class="status-topics"><thead><tr><th>الموضوع</th><th>عدد الوثائق</th></tr></thead><tbody>${topicRows}</tbody></table></div>${en("Live snapshot of archive size, source health and topic coverage. A machine-readable JSON version is available at /status.")}</section>
</div>`;
  return pageShell(content, { language: "ar", title: `الحالة — ${BRAND.arabicName}`, description: "حالة أرشيف ERX: عدد الوثائق والمصادر الصحّية والتغطية حسب الموضوع.", path: "/status.html", baseUrl });
}
