# Launch Checklist

## جاهز داخل المستودع

- [x] TypeScript build ونسخة npm قابلة للحزم.
- [x] `server.json` متوافق مع MCP Registry.
- [x] Docker image غير root مع health check.
- [x] Landing عربية وإنجليزية وتوثيق حي.
- [x] robots، sitemap، llms.txt، manifest وOpenGraph.
- [x] CI، اختبارات، تغطية، audit، وإصدار GitHub.
- [x] خطة rollback ونسخ SQLite.
- [x] Brand system وحزمة محتوى إطلاق.

## يحتاج حسابًا أو قرارًا من المالك

- [ ] إنشاء المستودع العام `ahmedvnabil/egypt-research-mcp` وإضافة remote.
- [ ] تسجيل الدخول إلى npm وإضافة `NPM_TOKEN` في GitHub Actions.
- [ ] ربط `erx.marsaplatform.com` أو اعتماد نطاق بديل.
- [ ] إعداد TLS و`EGYPT_RESEARCH_PUBLIC_URL` في الإنتاج.
- [ ] تشغيل أول جمع وفهرسة على نسخة الإنتاج.
- [ ] نشر tag `v0.5.0` بعد نجاح staging.
- [ ] التأكد من ظهور الحزمة على npm ثم MCP Registry.
- [ ] إرسال GitHub URL إلى Glama وPulseMCP.

## قرار الإطلاق

لا يُنشر `server.json` بRemote endpoint قبل أن يعيد `/readyz` و`/mcp` استجابات صحيحة عبر HTTPS. يمكن نشر حزمة stdio أولًا، ثم إضافة `remotes` في إصدار patch لاحق.

## Rollback

1. أوقف توجيه النطاق أو أعد نشر آخر Docker digest سليم.
2. استعد نسخة SQLite عبر `restore --input ... --yes` إذا تأثرت البيانات.
3. تحقق من `/readyz` و`/healthz` وMCP `list_tools`.
4. انشر سبب rollback وحالة البيانات، ولا تحذف الإصدار المنشور من npm؛ استخدم deprecate عند الحاجة.
