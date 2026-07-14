import type { ResearchStore } from "./store.js";
import type { Language, SourceInput, SourceType } from "./types.js";

type Seed = [slug: string, name: string, url: string, sourceType: SourceType, ownershipType: string, language?: Language, feedUrl?: string];

const seeds: Seed[] = [
  ["alamiria", "الهيئة العامة لشئون المطابع الأميرية", "https://www.alamiria.com", "legal", "government"],
  ["parliament-egypt", "مجلس النواب المصري", "https://www.parliament.gov.eg", "official", "government"],
  ["cabinet-egypt", "مجلس الوزراء المصري", "https://www.cabinet.gov.eg", "official", "government"],
  ["presidency-egypt", "رئاسة جمهورية مصر العربية", "https://www.presidency.eg/ar", "official", "government"],
  ["supreme-constitutional-court", "المحكمة الدستورية العليا", "https://www.sccourt.gov.eg", "legal", "judiciary"],
  ["ministry-of-justice-egypt", "وزارة العدل المصرية", "https://moj.gov.eg", "legal", "government"],
  ["manshurat", "منشورات قانونية", "https://manshurat.org", "legal", "independent_archive"],
  ["capmas", "الجهاز المركزي للتعبئة العامة والإحصاء", "https://www.capmas.gov.eg", "statistics", "government"],
  ["central-bank-egypt", "البنك المركزي المصري", "https://www.cbe.org.eg", "statistics", "government"],
  ["idsc-egypt", "مركز المعلومات ودعم اتخاذ القرار", "https://www.idsc.gov.eg", "academic", "government_research_center"],
  ["eces-egypt", "المركز المصري للدراسات الاقتصادية", "https://eces.org.eg", "academic", "independent_research_center"],
  ["economic-research-forum", "منتدى البحوث الاقتصادية", "https://erf.org.eg", "academic", "regional_research_center", "mixed"],
  ["auc-knowledge-fountain", "AUC Knowledge Fountain", "https://fount.aucegypt.edu", "academic", "university", "en"],
  ["nchr-egypt", "المجلس القومي لحقوق الإنسان", "https://nchr.eg", "official", "national_institution"],
  ["eipr", "المبادرة المصرية للحقوق الشخصية", "https://eipr.org", "human_rights", "civil_society", "ar", "https://eipr.org/rss.xml"],
  ["afte", "مؤسسة حرية الفكر والتعبير", "https://afteegypt.org", "human_rights", "civil_society", "ar", "https://afteegypt.org/feed"],
  ["ec-rf", "المفوضية المصرية للحقوق والحريات", "https://www.ec-rf.net", "human_rights", "civil_society", "ar", "https://www.ec-rf.net/feed/"],
  ["egyptian-front", "الجبهة المصرية لحقوق الإنسان", "https://egyptianfront.org", "human_rights", "civil_society", "ar", "https://egyptianfront.org/feed/"],
  ["committee-for-justice", "Committee for Justice", "https://www.cfjustice.org", "human_rights", "civil_society", "mixed", "https://www.cfjustice.org/feed/"],
  ["refugees-platform-egypt", "منصة اللاجئين في مصر", "https://rpegy.org", "human_rights", "civil_society", "ar", "https://rpegy.org/feed/"],
  ["cihrs", "مركز القاهرة لدراسات حقوق الإنسان", "https://cihrs.org", "human_rights", "civil_society", "mixed", "https://cihrs.org/feed/"],
  ["sinai-foundation", "مؤسسة سيناء لحقوق الإنسان", "https://sinaifhr.org", "human_rights", "civil_society"],
  ["cpj-egypt", "لجنة حماية الصحفيين - مصر", "https://cpj.org/mideast/egypt/", "human_rights", "international_ngo", "en"],
  ["rsf-egypt", "مراسلون بلا حدود - مصر", "https://rsf.org/en/country/egypt", "human_rights", "international_ngo", "en"],
  ["ahram-gate", "بوابة الأهرام", "https://gate.ahram.org.eg", "news", "state_media"],
  ["shorouk-news", "الشروق", "https://www.shorouknews.com", "news", "private_media"],
  ["almasryalyoum", "المصري اليوم", "https://www.almasryalyoum.com", "news", "private_media", "ar", "https://www.almasryalyoum.com/rss/rssfeeds"],
  ["masrawy", "مصراوي", "https://www.masrawy.com", "news", "private_media"],
  ["mada-masr", "مدى مصر", "https://www.madamasr.com", "investigative", "independent_media", "mixed"],
  ["manassa", "المنصة", "https://manassa.news", "investigative", "independent_media"],
  ["cairo24", "القاهرة 24", "https://www.cairo24.com", "news", "private_media"],
  ["youm7", "اليوم السابع", "https://www.youm7.com", "news", "private_media"],
  ["akhbar-elyom", "أخبار اليوم", "https://akhbarelyom.com", "news", "state_media"]
];

export const INITIAL_SOURCES: SourceInput[] = seeds.map(([slug, name, url, sourceType, ownershipType, language = "ar", feedUrl]) => ({
  slug, name, url, sourceType, ownershipType, language, ...(feedUrl ? { feedUrl } : {}), active: true
}));

export function bootstrapCatalog(store: ResearchStore): number {
  for (const source of INITIAL_SOURCES) store.upsertSource(source);
  return INITIAL_SOURCES.length;
}
