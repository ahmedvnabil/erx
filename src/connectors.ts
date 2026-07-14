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
  adapter: "capmas_news" | "scc_rules";
  canonicalUrlBase: string;
}

export type SourceConnector = HtmlConnector | ApiConnector;

export const SOURCE_CONNECTORS: Readonly<Record<string, SourceConnector>> = {
  "parliament-egypt": { kind: "html", listingUrl: "https://www.parliament.gov.eg/news_all.aspx", articlePathPattern: "^/News_Show\\.aspx$", titleSelector: "h1", contentSelector: ".col-lg-8.animate-onscroll" },
  "cabinet-egypt": { kind: "html", listingUrl: "https://www.cabinet.gov.eg/News", articlePathPattern: "^/News/Details/\\d+$" },
  "manassa": { kind: "html", listingUrl: "https://manassa.news/", articlePathPattern: "^/(?:stories|news|news-bulletin)/\\d+$" },
  "sinai-foundation": { kind: "html", listingUrl: "https://sinaifhr.org/", articlePathPattern: "^/show/\\d+$" },
  "nchr-egypt": { kind: "html", listingUrl: "https://nchr.eg/ar/News", articlePathPattern: "^/ar/news-details/\\d+$", titleSelector: ".e-page-wrapper h1", contentSelector: ".e-page-wrapper" },
  "rsf-egypt": { kind: "html", listingUrl: "https://rsf.org/en/country/egypt", articlePathPattern: "^/en/egypt-[a-z0-9-]+$" },
  "capmas": { kind: "api", endpointUrl: "https://www.capmas.gov.eg:8080/api/News/GetLatestNews", adapter: "capmas_news", canonicalUrlBase: "https://www.capmas.gov.eg/mediaLanding/news" },
  "supreme-constitutional-court": { kind: "api", endpointUrl: "https://www.sccourt.gov.eg/DjangoPortal/api/RecentRules/get-recent-rules-last-add", adapter: "scc_rules", canonicalUrlBase: "https://www.sccourt.gov.eg/DjangoPortal/api/RecentRules/get-recent-rules-last-add?item=" }
};
