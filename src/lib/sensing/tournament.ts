// Rolling leaderboard for the forecasting tournament.
//
// Anti-gaming rules (see Phase 5 write-up in the delivery doc):
//  1. Probabilities are clamped to [0.02, 0.98] before scoring (scoring.ts).
//  2. Ranking uses the MEAN Brier score per resolved question, never the sum
//     -- so a forecaster cannot climb the board purely by forecasting on
//     more questions (volume is not rewarded).
//  3. A forecaster needs MIN_RESOLVED_FOR_RANKING resolved forecasts before
//     they are ranked at all; below that they show up in a separate
//     "provisional" list. This stops a single lucky extreme call from
//     topping the board.
//  4. Ties / close scores are broken by calibration error (ascending) so
//     that a forecaster who is well-calibrated overall outranks one who got
//     a good mean Brier score through a few lucky extreme bets.

import { brierScore, logLoss, calibrationError, clampProbability } from "./scoring";

export const MIN_RESOLVED_FOR_RANKING = 3;

export interface ResolvedForecastRecord {
  forecaster: string;
  isModel: boolean;
  probability: number;
  outcome: boolean;
  questionId: number;
}

export interface LeaderboardEntry {
  forecaster: string;
  isModel: boolean;
  resolvedCount: number;
  avgBrier: number;
  avgLogLoss: number;
  calibrationError: number;
  rank: number | null; // null if provisional
}

export function buildLeaderboard(records: ResolvedForecastRecord[]): LeaderboardEntry[] {
  const byForecaster = new Map<string, ResolvedForecastRecord[]>();
  for (const r of records) {
    const list = byForecaster.get(r.forecaster) ?? [];
    list.push(r);
    byForecaster.set(r.forecaster, list);
  }

  const entries: LeaderboardEntry[] = [];
  for (const [forecaster, list] of byForecaster.entries()) {
    const brierScores = list.map((r) => brierScore(r.probability, r.outcome));
    const logLosses = list.map((r) => logLoss(r.probability, r.outcome));
    const avgBrier = brierScores.reduce((a, b) => a + b, 0) / brierScores.length;
    const avgLogLoss = logLosses.reduce((a, b) => a + b, 0) / logLosses.length;
    const calib = calibrationError(list.map((r) => ({ probability: clampProbability(r.probability), outcome: r.outcome })));
    entries.push({
      forecaster,
      isModel: list[0].isModel,
      resolvedCount: list.length,
      avgBrier,
      avgLogLoss,
      calibrationError: calib.error,
      rank: null,
    });
  }

  const ranked = entries.filter((e) => e.resolvedCount >= MIN_RESOLVED_FOR_RANKING);
  const provisional = entries.filter((e) => e.resolvedCount < MIN_RESOLVED_FOR_RANKING);

  ranked.sort((a, b) => {
    const brierDiff = a.avgBrier - b.avgBrier;
    if (Math.abs(brierDiff) > 1e-9) return brierDiff;
    return a.calibrationError - b.calibrationError;
  });
  ranked.forEach((e, i) => (e.rank = i + 1));

  provisional.sort((a, b) => a.avgBrier - b.avgBrier);

  return [...ranked, ...provisional];
}
