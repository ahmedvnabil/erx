export interface HtmlConnector {
  kind: "html";
  listingUrl: string;
  articlePathPattern: string;
  titleSelector?: string;
  contentSelector?: string;
}

export interface ApiConnector {
  kind: "api";
  endpointUrl: string;
  adapter: "capmas_news" | "scc_rules" | "idsc_news";
  canonicalUrlBase: string;
  method?: "GET" | "POST";
  requestBody?: Readonly<Record<string, unknown>>;
}

export type SourceConnector = HtmlConnector | ApiConnector;

export const SOURCE_CONNECTORS: Readonly<Record<string, SourceConnector>> = {
  "parliament-egypt": { kind: "html", listingUrl: "https://www.parliament.gov.eg/news_all.aspx", articlePathPattern: "^/News_Show\\.aspx$", titleSelector: "h1", contentSelector: ".col-lg-8.animate-onscroll" },
  "cabinet-egypt": { kind: "html", listingUrl: "https://www.cabinet.gov.eg/News", articlePathPattern: "^/News/Details/\\d+$" },
  "manassa": { kind: "html", listingUrl: "https://manassa.news/", articlePathPattern: "^/(?:stories|news|news-bulletin)/\\d+$" },
  "sinai-foundation": { kind: "html", listingUrl: "https://sinaifhr.org/", articlePathPattern: "^/show/\\d+$" },
  "nchr-egypt": { kind: "html", listingUrl: "https://nchr.eg/ar/News", articlePathPattern: "^/ar/news-details/\\d+$", titleSelector: ".e-page-wrapper h1", contentSelector: ".e-page-wrapper" },
  "rsf-egypt": { kind: "html", listingUrl: "https://rsf.org/en/country/egypt", articlePathPattern: "^/en/egypt-[a-z0-9-]+$" },
  "eipr": { kind: "html", listingUrl: "https://eipr.org/", articlePathPattern: "^(?:/(?:press|blog)/.+|/publications/(?!.*%3c).+)$", titleSelector: ".node-title", contentSelector: ".node-body" },
  "afte": { kind: "html", listingUrl: "https://afteegypt.org/", articlePathPattern: "^/(?:research|advocacy|legal-updates-2|legislations)/.+/\\d+-afteegypt\\.html$", titleSelector: "h1", contentSelector: ".elementor-widget-theme-post-content" },
  "almasryalyoum": { kind: "html", listingUrl: "https://www.almasryalyoum.com/", articlePathPattern: "^/news/details/\\d+$" },
  "akhbar-elyom": { kind: "html", listingUrl: "https://akhbarelyom.com/", articlePathPattern: "^/news/newdetails/\\d+/\\d+/.+$" },
  "masrawy": { kind: "html", listingUrl: "https://www.masrawy.com/", articlePathPattern: "^/[^/]+/[^/]+/details/\\d{4}/\\d{1,2}/\\d{1,2}/\\d+/.+$" },
  "youm7": { kind: "html", listingUrl: "https://www.youm7.com/", articlePathPattern: "^/story/\\d{4}/\\d{1,2}/\\d{1,2}/.+/\\d+$" },
  "shorouk-news": { kind: "html", listingUrl: "https://www.shorouknews.com/mobile/", articlePathPattern: "^/mobile/news/view\\.aspx$", titleSelector: "h1", contentSelector: ".content.borderLess" },
  "capmas": { kind: "api", endpointUrl: "https://www.capmas.gov.eg:8080/api/News/GetLatestNews", adapter: "capmas_news", canonicalUrlBase: "https://www.capmas.gov.eg/mediaLanding/news" },
  "idsc-egypt": { kind: "api", endpointUrl: "https://www.idsc.gov.eg/api/NewsAPI/GetAllNewsWithPagination", adapter: "idsc_news", canonicalUrlBase: "https://www.idsc.gov.eg/News/details", method: "POST", requestBody: { titleA: null, publishDateFrom: null, publishDateTo: null, ownerId: null, pageNumber: 1, pageSize: 20, translated: null } },
  "supreme-constitutional-court": { kind: "api", endpointUrl: "https://www.sccourt.gov.eg/DjangoPortal/api/RecentRules/get-recent-rules-last-add", adapter: "scc_rules", canonicalUrlBase: "https://www.sccourt.gov.eg/DjangoPortal/api/RecentRules/get-recent-rules-last-add?item=" }
};
