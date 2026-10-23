// Part 44 — Wisdom-of-the-crowd metrics.
//
// Two product questions this module answers:
//   1. "For this class of question, does the crowd beat the model (Part 11 ensemble),
//      or vice versa?" -> crowd-vs-model Brier comparison, tracked over time per
//      question class so the product can learn where its crowd is actually wise
//      (and, implicitly, where it should defer to the model instead).
//   2. "Is this crowd's agreement real convergence or manufactured conformity?" ->
//      diversity-of-thought index combining dispersion (how spread out beliefs are)
//      and independence (how uncorrelated forecasters' estimates are across
//      questions). A high aggregate confidence built on LOW diversity is a
//      groupthink warning sign (see PHASE 5 attack review).

import { brierScore, mean, stdDev } from "./aggregation";
import type { DispersionStats } from "./types";

export interface ResolvedQuestionSample {
  questionClass: string;
  crowdProbability: number; // the aggregate (e.g. calibration-weighted) at resolution time
  modelProbability: number; // Part 11 ensemble's probability at the same time
  marketProbability?: number; // LMSR price at resolution time, if a market ran
  outcome: 0 | 1;
}

export interface WisdomComparison {
  questionClass: string;
  sampleSize: number;
  crowdBrier: number;
  modelBrier: number;
  marketBrier: number | null;
  winner: "crowd" | "model" | "market" | "tie";
  marginOverRunnerUp: number;
}

export function compareCrowdVsModel(samples: ResolvedQuestionSample[]): WisdomComparison[] {
  const byClass = new Map<string, ResolvedQuestionSample[]>();
  for (const s of samples) {
    if (!byClass.has(s.questionClass)) byClass.set(s.questionClass, []);
    byClass.get(s.questionClass)!.push(s);
  }

  const results: WisdomComparison[] = [];
  for (const [questionClass, rows] of byClass) {
    const crowdBrier = mean(rows.map((r) => brierScore(r.crowdProbability, r.outcome)));
    const modelBrier = mean(rows.map((r) => brierScore(r.modelProbability, r.outcome)));
    const marketRows = rows.filter((r) => typeof r.marketProbability === "number");
    const marketBrier =
      marketRows.length > 0
        ? mean(marketRows.map((r) => brierScore(r.marketProbability as number, r.outcome)))
        : null;

    const scores: Array<{ key: "crowd" | "model" | "market"; brier: number }> = [
      { key: "crowd", brier: crowdBrier },
      { key: "model", brier: modelBrier },
    ];
    if (marketBrier !== null) scores.push({ key: "market", brier: marketBrier });
    scores.sort((a, b) => a.brier - b.brier);
    const best = scores[0];
    const runnerUp = scores[1];
    const margin = runnerUp ? runnerUp.brier - best.brier : 0;
    const winner = margin < 0.01 ? "tie" : best.key;

    results.push({
      questionClass,
      sampleSize: rows.length,
      crowdBrier,
      modelBrier,
      marketBrier,
      winner,
      marginOverRunnerUp: margin,
    });
  }
  return results.sort((a, b) => a.questionClass.localeCompare(b.questionClass));
}

/** Dispersion: normalized std dev of a set of beliefs on [0,1] (max possible stdDev ~0.5). */
export function dispersionIndex(values: number[]): number {
  if (values.length < 2) return 0;
  return Math.min(1, stdDev(values) / 0.5);
}

/**
 * Independence: 1 minus the average absolute pairwise correlation of forecasters'
 * estimates across multiple questions. Requires a forecaster x question matrix.
 * Returns 1 (fully independent) when there's not enough data to detect correlation,
 * which is the conservative (non-alarming) default.
 */
export function independenceIndex(forecasterByQuestionMatrix: number[][]): number {
  // rows = forecasters, columns = questions
  const nForecasters = forecasterByQuestionMatrix.length;
  if (nForecasters < 2) return 1;
  const nQuestions = forecasterByQuestionMatrix[0]?.length ?? 0;
  if (nQuestions < 2) return 1;

  const pearson = (a: number[], b: number[]): number => {
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    const denom = Math.sqrt(da * db);
    return denom === 0 ? 0 : num / denom;
  };

  let total = 0;
  let count = 0;
  for (let i = 0; i < nForecasters; i++) {
    for (let j = i + 1; j < nForecasters; j++) {
      total += Math.abs(pearson(forecasterByQuestionMatrix[i], forecasterByQuestionMatrix[j]));
      count++;
    }
  }
  const avgCorrelation = count === 0 ? 0 : total / count;
  return Math.max(0, 1 - avgCorrelation);
}

/** Composite diversity-of-thought index = geometric mean of dispersion and independence. */
export function diversityOfThoughtIndex(dispersion: number, independence: number): number {
  return Math.sqrt(Math.max(0, dispersion) * Math.max(0, independence));
}

export function computeDispersionStats(values: number[]): DispersionStats {
  return {
    n: values.length,
    mean: mean(values),
    stdDev: stdDev(values),
    diversityIndex: dispersionIndex(values),
  };
}
