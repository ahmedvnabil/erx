import { describe, expect, it } from "vitest";

import { evaluateRanking, precisionCeiling } from "../src/evaluation.js";

describe("retrieval evaluation metrics", () => {
  it("computes precision, recall, nDCG, and reciprocal rank", () => {
    const metrics = evaluateRanking(["a", "x", "b", "c"], { a: 3, b: 2, c: 1 }, { precisionAt: 3, recallAt: 4, ndcgAt: 3 });

    expect(metrics.precisionAtK).toBeCloseTo(2 / 3);
    expect(metrics.recallAtK).toBe(1);
    expect(metrics.mrr).toBe(1);
    expect(metrics.ndcgAtK).toBeGreaterThan(0.7);
    expect(metrics.ndcgAtK).toBeLessThan(1);
  });

  it("returns zero metrics when no relevant result is retrieved", () => {
    expect(evaluateRanking(["x"], { a: 2 }, { precisionAt: 5, recallAt: 20, ndcgAt: 10 })).toEqual({
      precisionAtK: 0,
      recallAtK: 0,
      ndcgAtK: 0,
      mrr: 0
    });
  });

  it("reports when incomplete judgments make a precision target impossible", () => {
    expect(precisionCeiling([{ a: 3 }, { b: 2, c: 1 }], 5)).toBeCloseTo(0.3);
  });
});
