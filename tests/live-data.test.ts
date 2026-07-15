import { describe, expect, it } from "vitest";
import { getLiveData, listLiveDatasets, compareLiveData, type LiveQuery } from "../src/live-data.js";

function responder(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("live data connectors", () => {
  it("catalogues only public no-token datasets", () => {
    const datasets = listLiveDatasets();
    expect(datasets.length).toBe(6);
    expect(datasets.every((dataset) => dataset.auth === "none")).toBe(true);
    expect(datasets.every((dataset) => !dataset.baseUrl.includes("token") && !dataset.baseUrl.includes("key"))).toBe(true);
  });

  it("normalizes World Bank observations with provenance", async () => {
    const result = await getLiveData({ source: "world-bank", indicator: "SP.POP.TOTL", country: "EGY", limit: 2 }, responder([
      { page: 1, pages: 1, per_page: 2, total: 2 },
      [{ date: "2024", value: 110000000, unit: "", country: { id: "EG", value: "Egypt" }, indicator: { id: "SP.POP.TOTL", value: "Population" } }]
    ]));
    expect(result.observations[0]).toEqual(expect.objectContaining({ period: "2024", country: "EGY", value: 110000000, source: "world-bank" }));
    expect(result.sourceUrl).toContain("api.worldbank.org");
    expect(result.retrievedAt).toMatch(/T/);
  });

  it("normalizes IMF, WHO and UNHCR response shapes", async () => {
    const imf = await getLiveData({ source: "imf-datamapper", indicator: "NGDP_RPCH", country: "EGY" }, responder({ values: { NGDP_RPCH: { EGY: { "2024": 4.2 } } } }));
    expect(imf.observations[0]).toEqual(expect.objectContaining({ period: "2024", value: 4.2 }));

    const who = await getLiveData({ source: "who-gho", indicator: "WHOSIS_000001", country: "EGY" }, responder({ value: [{ TimeDim: 2023, SpatialDim: "EGY", NumericValue: 71.2, Dim1: "MLE" }] }));
    expect(who.observations[0]).toEqual(expect.objectContaining({ period: "2023", country: "EGY", value: 71.2, unit: "MLE" }));

    const unhcr = await getLiveData({ source: "unhcr", country: "EGY", refugeeDimension: "asylum" }, responder({ items: [{ year: 2024, coa_id: "EGY", refugees: 100, asylum_seekers: 200 }] }));
    expect(unhcr.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ indicator: "refugees", value: 100, unit: "persons" }),
      expect.objectContaining({ indicator: "asylum_seekers", value: 200, unit: "persons" })
    ]));
  });

  it("keeps scholarly and trade records structured", async () => {
    const crossref = await getLiveData({ source: "crossref", query: "Egypt", limit: 1 }, responder({ message: { items: [{ DOI: "10.1234/example", title: ["Egypt study"], publisher: "Example", type: "journal-article", URL: "https://doi.org/10.1234/example", issued: { "date-parts": [[2024]] } }] } }));
    expect(crossref.observations[0]).toEqual(expect.objectContaining({ value: "Egypt study", period: "2024" }));
    expect(crossref.observations[0]?.dimensions).toEqual(expect.objectContaining({ doi: "10.1234/example" }));

    const trade = await getLiveData({ source: "un-comtrade", period: "2023", flowCode: "X", limit: 1 }, responder({ data: [{ period: "2023", reporterISO: "EGY", primaryValue: 1234, flowDesc: "Export", partnerDesc: "World", cmdDesc: "TOTAL" }] }));
    expect(trade.observations[0]).toEqual(expect.objectContaining({ value: 1234, country: "EGY", unit: "USD" }));
  });

  it("bundles live series without pretending units are identical", async () => {
    const queries: LiveQuery[] = [
      { source: "world-bank", indicator: "SP.POP.TOTL", country: "EGY" },
      { source: "imf-datamapper", indicator: "NGDP_RPCH", country: "EGY" }
    ];
    const fetcher: typeof fetch = async (input) => String(input).includes("worldbank")
      ? new Response(JSON.stringify([{}, []]), { status: 200 })
      : new Response(JSON.stringify({ values: { NGDP_RPCH: { EGY: { "2024": 4.2 } } } }), { status: 200 });
    const result = await compareLiveData(queries, fetcher);
    expect(result.queries).toHaveLength(2);
    expect(result.warnings[0]).toContain("الوحدات");
  });
});
