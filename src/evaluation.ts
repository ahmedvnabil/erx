export interface RankingMetrics {
  precisionAtK: number;
  recallAtK: number;
  ndcgAtK: number;
  mrr: number;
}

export interface EvaluationCutoffs {
  precisionAt: number;
  recallAt: number;
  ndcgAt: number;
}

export function evaluateRanking(rankedIds: string[], relevance: Record<string, number>, cutoffs: EvaluationCutoffs): RankingMetrics {
  const relevantIds = new Set(Object.entries(relevance).filter(([, grade]) => grade > 0).map(([id]) => id));
  const precisionHits = rankedIds.slice(0, cutoffs.precisionAt).filter((id) => relevantIds.has(id)).length;
  const recallHits = new Set(rankedIds.slice(0, cutoffs.recallAt).filter((id) => relevantIds.has(id))).size;
  const dcg = discountedGain(rankedIds.slice(0, cutoffs.ndcgAt).map((id) => relevance[id] ?? 0));
  const ideal = discountedGain(Object.values(relevance).sort((left, right) => right - left).slice(0, cutoffs.ndcgAt));
  const firstRelevant = rankedIds.findIndex((id) => relevantIds.has(id));
  return {
    precisionAtK: precisionHits / cutoffs.precisionAt,
    recallAtK: relevantIds.size ? recallHits / relevantIds.size : 0,
    ndcgAtK: ideal ? dcg / ideal : 0,
    mrr: firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0
  };
}

export function meanMetrics(metrics: RankingMetrics[]): RankingMetrics {
  if (!metrics.length) return { precisionAtK: 0, recallAtK: 0, ndcgAtK: 0, mrr: 0 };
  return metrics.reduce((mean, item) => ({
    precisionAtK: mean.precisionAtK + item.precisionAtK / metrics.length,
    recallAtK: mean.recallAtK + item.recallAtK / metrics.length,
    ndcgAtK: mean.ndcgAtK + item.ndcgAtK / metrics.length,
    mrr: mean.mrr + item.mrr / metrics.length
  }), { precisionAtK: 0, recallAtK: 0, ndcgAtK: 0, mrr: 0 });
}

export function precisionCeiling(relevanceSets: Array<Record<string, number>>, cutoff: number): number {
  if (!relevanceSets.length || cutoff < 1) return 0;
  const maximumHits = relevanceSets.reduce((sum, relevance) => {
    const relevantCount = Object.values(relevance).filter((grade) => grade > 0).length;
    return sum + Math.min(cutoff, relevantCount);
  }, 0);
  return maximumHits / (relevanceSets.length * cutoff);
}

function discountedGain(grades: number[]): number {
  return grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
}
