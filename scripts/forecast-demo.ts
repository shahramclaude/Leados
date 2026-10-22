// Prints a worked forecasting tournament scenario: a handful of resolved
// questions, several forecasters (including a model baseline), the crowd
// aggregate with and without extremizing, resulting scores, and the rolling
// leaderboard. Run via `npm run forecast:demo`. Pure/no DB dependency.

import { brierScore, logLoss, crowdAggregate, clampProbability } from "../src/lib/sensing/scoring";
import { buildLeaderboard, type ResolvedForecastRecord } from "../src/lib/sensing/tournament";

interface DemoQuestion {
  id: number;
  question: string;
  outcome: boolean;
  forecasts: { forecaster: string; isModel: boolean; probability: number }[];
}

const QUESTIONS: DemoQuestion[] = [
  {
    id: 1,
    question: "Will weekly signups exceed 1,200 by the end of the sprint?",
    outcome: true,
    forecasts: [
      { forecaster: "alice", isModel: false, probability: 0.75 },
      { forecaster: "bob", isModel: false, probability: 0.55 },
      { forecaster: "model:ewma-baseline", isModel: true, probability: 0.68 },
      { forecaster: "carol", isModel: false, probability: 0.9 },
    ],
  },
  {
    id: 2,
    question: "Will churn rate stay under 4% this month?",
    outcome: false,
    forecasts: [
      { forecaster: "alice", isModel: false, probability: 0.6 },
      { forecaster: "bob", isModel: false, probability: 0.3 },
      { forecaster: "model:ewma-baseline", isModel: true, probability: 0.45 },
      { forecaster: "carol", isModel: false, probability: 0.2 },
    ],
  },
  {
    id: 3,
    question: "Will the 'checkout-latency' indicator breach its threshold this week?",
    outcome: true,
    forecasts: [
      { forecaster: "alice", isModel: false, probability: 0.4 },
      { forecaster: "bob", isModel: false, probability: 0.65 },
      { forecaster: "model:ewma-baseline", isModel: true, probability: 0.7 },
      { forecaster: "carol", isModel: false, probability: 0.55 },
    ],
  },
  {
    id: 4,
    question: "Will the weak-signal theme 'refund delays' persist to trend status?",
    outcome: false,
    forecasts: [
      { forecaster: "alice", isModel: false, probability: 0.35 },
      { forecaster: "bob", isModel: false, probability: 0.2 },
      { forecaster: "model:ewma-baseline", isModel: true, probability: 0.3 },
      { forecaster: "carol", isModel: false, probability: 0.5 },
    ],
  },
];

console.log("=== Tournament Board demo ===\n");

const records: ResolvedForecastRecord[] = [];

for (const q of QUESTIONS) {
  const probs = q.forecasts.map((f) => f.probability);
  const { mean, extremized } = crowdAggregate(probs);
  console.log(`Q#${q.id} "${q.question}" — resolved ${q.outcome ? "YES" : "NO"}`);
  console.log(`  crowd mean = ${mean.toFixed(3)}, crowd extremized (a=1.5) = ${extremized.toFixed(3)}`);
  for (const f of q.forecasts) {
    const b = brierScore(f.probability, q.outcome);
    const l = logLoss(f.probability, q.outcome);
    console.log(
      `  ${f.forecaster.padEnd(22)} p=${clampProbability(f.probability).toFixed(2)}  brier=${b.toFixed(4)}  logLoss=${l.toFixed(4)}`,
    );
    records.push({ forecaster: f.forecaster, isModel: f.isModel, probability: f.probability, outcome: q.outcome, questionId: q.id });
  }
  const crowdBrier = brierScore(extremized, q.outcome);
  console.log(`  ${"crowd (extremized)".padEnd(22)} p=${extremized.toFixed(2)}  brier=${crowdBrier.toFixed(4)}`);
  console.log("");
}

console.log("=== Rolling leaderboard (calibration-weighted, mean Brier, min 3 resolved) ===\n");
const leaderboard = buildLeaderboard(records);
console.log("rank".padEnd(6) + "forecaster".padEnd(24) + "resolved".padEnd(10) + "avgBrier".padEnd(10) + "avgLogLoss".padEnd(12) + "calibErr");
for (const e of leaderboard) {
  console.log(
    (e.rank ?? "prov.").toString().padEnd(6) +
      e.forecaster.padEnd(24) +
      e.resolvedCount.toString().padEnd(10) +
      e.avgBrier.toFixed(4).padEnd(10) +
      e.avgLogLoss.toFixed(4).padEnd(12) +
      e.calibrationError.toFixed(4),
  );
}
console.log("\nforecast:demo: done");
