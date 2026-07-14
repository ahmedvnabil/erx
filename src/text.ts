const letterMap: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ؤ": "و", "ئ": "ي", "ى": "ي", "ة": "ه",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
};

const stopWords = new Set(["في", "من", "على", "الى", "إلى", "عن", "و", "او", "أو", "ثم", "مع"]);

export const TOPICS = [
  "التشريعات والقرارات", "القضاء والمحاكمات", "حرية التعبير والصحافة", "الحبس الاحتياطي",
  "الاختفاء القسري", "أوضاع السجون", "التعذيب وسوء المعاملة", "حقوق اللاجئين والمهاجرين",
  "الحقوق العمالية", "الحقوق الرقمية", "حرية الدين والمعتقد", "حقوق المرأة", "حقوق الطفل",
  "الاقتصاد والعدالة الاجتماعية", "الانتخابات والأحزاب", "الصحة والتعليم", "السكن والأراضي", "سيناء والحدود"
] as const;

const topicKeywords: Record<(typeof TOPICS)[number], string[]> = {
  "التشريعات والقرارات": ["قانون", "تشريع", "لائحه", "قرار جمهوري", "الجريده الرسميه"],
  "القضاء والمحاكمات": ["محكم", "قضاء", "نيابه", "القبض", "حكم قضائي", "محاكمه"],
  "حرية التعبير والصحافة": ["حريه التعبير", "حريه الصحافه", "صحفي", "اعلامي", "حجب موقع"],
  "الحبس الاحتياطي": ["الحبس الاحتياطي", "حبس احتياطي", "تجديد حبس"],
  "الاختفاء القسري": ["اختفاء قسري", "مختفي قسريا", "مخفي قسريا"],
  "أوضاع السجون": ["السجون", "السجن", "مركز اصلاح", "مكان الاحتجاز"],
  "التعذيب وسوء المعاملة": ["تعذيب", "سوء المعامله", "معامله مهينه"],
  "حقوق اللاجئين والمهاجرين": ["لاجئ", "لاجء", "مهاجر", "ترحيل", "طالبي اللجوء"],
  "الحقوق العمالية": ["حقوق العمال", "الحقوق العماليه", "اضراب عمالي", "قانون العمل"],
  "الحقوق الرقمية": ["خصوصيه رقميه", "امن رقمي", "جريمه الكترونيه", "مراقبه رقميه"],
  "حرية الدين والمعتقد": ["حريه الدين", "حريه المعتقد", "ازدراء الاديان", "تمييز ديني"],
  "حقوق المرأة": ["حقوق المراه", "عنف ضد النساء", "ختان", "تحرش", "زواج مبكر"],
  "حقوق الطفل": ["حقوق الطفل", "اطفال", "عماله الاطفال", "طفل"],
  "الاقتصاد والعدالة الاجتماعية": ["التضخم", "الفقر", "العداله الاجتماعيه", "الدين العام", "الاجور"],
  "الانتخابات والأحزاب": ["انتخابات", "الاحزاب", "حزب سياسي", "مجلس النواب", "مجلس الشيوخ"],
  "الصحة والتعليم": ["الصحه", "التعليم", "مستشفى", "جامعه", "مدرسه"],
  "السكن والأراضي": ["الحق في السكن", "ازاله مساكن", "الايجار", "نزع الملكيه", "الاراضي"],
  "سيناء والحدود": ["سيناء", "رفح", "العريش", "الحدود المصريه"]
};

export function normalizeArabic(value: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/ـ/g, "")
    .replace(/[أإآٱؤئىة٠-٩]/g, (character) => letterMap[character] ?? character)
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeQuery(value: string): string[] {
  const raw = normalizeArabic(value).split(" ");
  const vocabulary = new Set(raw);
  const tokens = raw.map((token) => token.startsWith("و") && token.length > 3 && vocabulary.has(token.slice(1)) ? token.slice(1) : token);
  return [...new Set(tokens.filter((token) => token && !stopWords.has(token)))];
}

export function expandArabicSearchToken(value: string): string[] {
  const token = normalizeArabic(value);
  if (!token || !/[\u0600-\u06ff]/u.test(token)) return token ? [token] : [];

  let articleForm = token;
  if (/^[وفبك]ال/u.test(token) && token.length > 5) articleForm = token.slice(1);
  else if (token.startsWith("لل") && token.length > 4) articleForm = token.slice(1);
  const bare = articleForm.startsWith("ال") && articleForm.length > 4 ? articleForm.slice(2) : articleForm;
  const bareForms = new Set([bare]);
  if ((bare.endsWith("ون") || bare.endsWith("ين")) && bare.length > 4) {
    const stem = bare.slice(0, -2);
    bareForms.add(`${stem}ون`);
    bareForms.add(`${stem}ين`);
  }

  const variants = new Set([token, articleForm]);
  for (const form of bareForms) {
    variants.add(form);
    variants.add(`ال${form}`);
  }
  return [...variants];
}

export function classifyDocument(value: string): string[] {
  const normalized = normalizeArabic(value);
  return TOPICS.filter((topic) => topicKeywords[topic].some((keyword) => normalized.includes(normalizeArabic(keyword))));
}

export function headlineTokens(value: string): Set<string> {
  return new Set(tokenizeQuery(value).filter((token) => token.length > 2));
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}
