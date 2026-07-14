import type { ResearchStore } from "./store.js";
import { SOURCE_CONNECTORS } from "./connectors.js";
import type { Language, SourceInput, SourceType } from "./types.js";

type Seed = [slug: string, name: string, url: string, sourceType: SourceType, ownershipType: string, language?: Language, feedUrl?: string | undefined, sitemapUrl?: string];

const seeds: Seed[] = [
  ["alamiria", "الهيئة العامة لشئون المطابع الأميرية", "https://www.alamiria.com", "legal", "government"],
  ["parliament-egypt", "مجلس النواب المصري", "https://www.parliament.gov.eg", "official", "government"],
  ["cabinet-egypt", "مجلس الوزراء المصري", "https://www.cabinet.gov.eg", "official", "government"],
  ["presidency-egypt", "رئاسة جمهورية مصر العربية", "https://www.presidency.eg/ar", "official", "government", "ar", "https://www.presidency.eg/rss-الأحداث/"],
  ["supreme-constitutional-court", "المحكمة الدستورية العليا", "https://www.sccourt.gov.eg", "legal", "judiciary"],
  ["ministry-of-justice-egypt", "وزارة العدل المصرية", "https://moj.gov.eg", "legal", "government"],
  ["manshurat", "منشورات قانونية", "https://manshurat.org", "legal", "independent_archive", "ar", "https://manshurat.org/rss.xml"],
  ["capmas", "الجهاز المركزي للتعبئة العامة والإحصاء", "https://www.capmas.gov.eg", "statistics", "government"],
  ["central-bank-egypt", "البنك المركزي المصري", "https://www.cbe.org.eg", "statistics", "government"],
  ["idsc-egypt", "مركز المعلومات ودعم اتخاذ القرار", "https://www.idsc.gov.eg", "academic", "government_research_center"],
  ["ministry-of-finance-egypt", "وزارة المالية المصرية", "https://mof.gov.eg", "statistics", "government"],
  ["national-planning-institute", "معهد التخطيط القومي", "https://repository.inp.edu.eg", "academic", "government_research_center"],
  ["eces-egypt", "المركز المصري للدراسات الاقتصادية", "https://eces.org.eg", "academic", "independent_research_center", "ar", "https://eces.org.eg/feed/"],
  ["economic-research-forum", "منتدى البحوث الاقتصادية", "https://erf.org.eg", "academic", "regional_research_center", "mixed", "https://erf.org.eg/feed/"],
  ["auc-knowledge-fountain", "AUC Knowledge Fountain", "https://fount.aucegypt.edu", "academic", "university", "en", "https://fount.aucegypt.edu/recent.rss"],
  ["bue-scholar", "BUE Scholar", "https://buescholar.bue.edu.eg", "academic", "university", "en", "https://buescholar.bue.edu.eg/recent.rss"],
  ["msa-repository", "MSA Repository", "https://repository.msa.edu.eg", "academic", "university", "en"],
  ["fra-egypt", "الهيئة العامة للرقابة المالية", "https://fra.gov.eg", "legal", "financial_regulator"],
  ["goeic-laws", "الهيئة العامة للرقابة على الصادرات والواردات", "https://www.goeic.gov.eg/ar/laws-and-decisions/list", "legal", "trade_regulator", "ar", undefined, "https://www.goeic.gov.eg/sitemap.xml"],
  ["ntra-laws", "الجهاز القومي لتنظيم الاتصالات", "https://www.tra.gov.eg/ar/%D8%A7%D9%84%D8%AA%D9%86%D8%B8%D9%8A%D9%85/%D8%A7%D9%84%D9%82%D9%88%D8%A7%D9%86%D9%8A%D9%86-%D9%88%D8%A7%D9%84%D8%AA%D8%B4%D8%B1%D9%8A%D8%B9%D8%A7%D8%AA/", "legal", "telecom_regulator", "ar", undefined, "https://www.tra.gov.eg/ar/sitemap_index.xml"],
  ["egyptera", "جهاز تنظيم مرفق الكهرباء وحماية المستهلك", "https://www.egyptera.org/ar/Regulation.aspx", "legal", "energy_regulator"],
  ["egyptian-public-prosecution", "النيابة العامة المصرية", "https://www.eg-pp.com/home", "legal", "judiciary"],
  ["egyptian-customs-legislations", "مصلحة الجمارك المصرية", "https://customs.gov.eg/Legislations/Manshorat?categoryId=2", "legal", "government"],
  ["eeaa-laws", "جهاز شئون البيئة", "https://www.eeaa.gov.eg/Laws/55/index", "legal", "government"],
  ["eda-laws", "هيئة الدواء المصرية", "https://www.edaegypt.gov.eg/en/the-regulatory-reference-of-the-egyptian-drug-authority-eda/laws-and-executive-regulations/", "legal", "drug_regulator", "en"],
  ["mped-sdds", "وزارة التخطيط والتنمية الاقتصادية والتعاون الدولي - بيانات SDDS", "https://mped.gov.eg/assets/uploads/NSDP.html", "statistics", "government"],
  ["icnl-egypt", "ICNL Civic Freedom Monitor - Egypt", "https://www.icnl.org/resources/civic-freedom-monitor/egypt", "human_rights", "international_ngo", "en"],
  ["hrw-egypt", "Human Rights Watch - Egypt", "https://www.hrw.org/middle-east/n-africa/egypt", "human_rights", "international_ngo", "en"],
  ["amnesty-egypt", "Amnesty International - Egypt", "https://www.amnesty.org/en/location/middle-east-and-north-africa/north-africa/egypt/", "human_rights", "international_ngo", "en"],
  ["nchr-egypt", "المجلس القومي لحقوق الإنسان", "https://nchr.eg", "official", "national_institution"],
  ["eipr", "المبادرة المصرية للحقوق الشخصية", "https://eipr.org", "human_rights", "civil_society", "ar", "https://eipr.org/rss.xml"],
  ["afte", "مؤسسة حرية الفكر والتعبير", "https://afteegypt.org", "human_rights", "civil_society", "ar", "https://afteegypt.org/feed"],
  ["ec-rf", "المفوضية المصرية للحقوق والحريات", "https://www.ec-rf.net", "human_rights", "civil_society", "ar", "https://www.ec-rf.net/feed/"],
  ["egyptian-front", "الجبهة المصرية لحقوق الإنسان", "https://egyptianfront.org", "human_rights", "civil_society", "ar", "https://egyptianfront.org/feed/"],
  ["committee-for-justice", "Committee for Justice", "https://www.cfjustice.org", "human_rights", "civil_society", "mixed", "https://www.cfjustice.org/feed/"],
  ["refugees-platform-egypt", "منصة اللاجئين في مصر", "https://rpegy.org", "human_rights", "civil_society", "ar", "https://rpegy.org/feed/"],
  ["cihrs", "مركز القاهرة لدراسات حقوق الإنسان", "https://cihrs.org", "human_rights", "civil_society", "mixed", "https://cihrs.org/feed/"],
  ["sinai-foundation", "مؤسسة سيناء لحقوق الإنسان", "https://sinaifhr.org", "human_rights", "civil_society"],
  ["cpj-egypt", "لجنة حماية الصحفيين - مصر", "https://cpj.org/mideast/egypt/", "human_rights", "international_ngo", "en", "https://cpj.org/mideast/egypt/feed/"],
  ["rsf-egypt", "مراسلون بلا حدود - مصر", "https://rsf.org/en/country/egypt", "human_rights", "international_ngo", "en"],
  ["ahram-gate", "بوابة الأهرام", "https://gate.ahram.org.eg", "news", "state_media"],
  ["shorouk-news", "الشروق", "https://www.shorouknews.com", "news", "private_media"],
  ["almasryalyoum", "المصري اليوم", "https://www.almasryalyoum.com", "news", "private_media", "ar", "https://www.almasryalyoum.com/rss/rssfeeds"],
  ["masrawy", "مصراوي", "https://www.masrawy.com", "news", "private_media", "ar", "https://www.masrawy.com/rss/feed/25/أخبار"],
  ["mada-masr", "مدى مصر", "https://www.madamasr.com", "investigative", "independent_media", "mixed", "https://www.madamasr.com/feed/"],
  ["manassa", "المنصة", "https://manassa.news", "investigative", "independent_media"],
  ["cairo24", "القاهرة 24", "https://www.cairo24.com", "news", "private_media", "ar", undefined, "https://www.cairo24.com/sitemaps.xml"],
  ["youm7", "اليوم السابع", "https://www.youm7.com", "news", "private_media", "ar", "https://www.youm7.com/rss/SectionRss?SectionID=203"],
  ["akhbar-elyom", "أخبار اليوم", "https://akhbarelyom.com", "news", "state_media", "ar", "https://akhbarelyom.com/RSS/GetSectionNewsRSS/1?SectionID=1"],
  ["daily-news-egypt", "Daily News Egypt", "https://www.dailynewsegypt.com", "news", "private_media", "en", "https://www.dailynewsegypt.com/feed/"],
  ["egyptian-streets", "Egyptian Streets", "https://egyptianstreets.com", "news", "private_media", "en", "https://egyptianstreets.com/feed/"],
  ["egypt-independent", "Egypt Independent", "https://www.egyptindependent.com", "news", "private_media", "en", "https://www.egyptindependent.com/feed/"]
];

export const INITIAL_SOURCES: SourceInput[] = seeds.map(([slug, name, url, sourceType, ownershipType, language = "ar", feedUrl, sitemapUrl]) => ({
  slug, name, url, sourceType, ownershipType, language, ...(feedUrl ? { feedUrl } : {}), ...(sitemapUrl ? { sitemapUrl } : {}),
  ...(SOURCE_CONNECTORS[slug] ? { collectionMethod: feedUrl || sitemapUrl ? "hybrid" : SOURCE_CONNECTORS[slug].kind } : {}), active: true
}));

export function bootstrapCatalog(store: ResearchStore): number {
  for (const source of INITIAL_SOURCES) store.upsertSource(source);
  return INITIAL_SOURCES.length;
}
