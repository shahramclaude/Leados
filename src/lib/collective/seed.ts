// Part 44 — Demo seed data so the Collective View / Delphi Workspace / Market Floor /
// Wisdom Dashboard are populated out of the box. Idempotent-ish: re-running adds a
// fresh demo question rather than erroring, so it's safe to call from a "Seed demo
// data" button in the UI.

import { db } from "@/db";
import { collectiveQuestions, marketMakers } from "@/db/schema";
import {
  closeDelphiRoundAndSummarize,
  ensureForecaster,
  executeMarketTrade,
  resolveQuestion,
  startDelphiRound,
  submitDelphiEstimate,
  submitForecast,
} from "./service";

const PANEL = [
  { displayName: "Amara Chen", anonymousTag: "Forecaster-Alpha", calibrationScore: 0.86, brierScore: 0.11 },
  { displayName: "Jonas Weber", anonymousTag: "Forecaster-Bravo", calibrationScore: 0.78, brierScore: 0.15 },
  { displayName: "Priya Natarajan", anonymousTag: "Forecaster-Charlie", calibrationScore: 0.7, brierScore: 0.18 },
  { displayName: "Liam O'Connor", anonymousTag: "Forecaster-Delta", calibrationScore: 0.55, brierScore: 0.24 },
  { displayName: "Fatima Zahra", anonymousTag: "Forecaster-Echo", calibrationScore: 0.42, brierScore: 0.29 },
  { displayName: "VP Strategy (exec)", anonymousTag: "Forecaster-Foxtrot", calibrationScore: 0.5, brierScore: 0.25, isAuthoritySignal: true },
];

export async function seedDemoData() {
  const [q1] = await db
    .insert(collectiveQuestions)
    .values({
      title: "Will the EU finalize the cross-border data adequacy ruling by Q3?",
      description:
        "Registered question (Part 12 knowledge graph node ci-reg-0417). Resolution source: official gazette publication.",
      questionClass: "regulatory",
      modelProbability: "0.61000",
    })
    .returning();
  await db.insert(marketMakers).values({ questionId: q1.id, liquidityB: "25.0000" });

  const forecasters = [];
  for (const p of PANEL) {
    forecasters.push(await ensureForecaster(p));
  }

  const probs = [0.58, 0.62, 0.55, 0.9, 0.3, 0.6];
  const rationales = [
    "Base-rate from last 5 similar EU rulings: ~60% on-time.",
    "Trilogue negotiations are ahead of schedule this cycle.",
    "Slight delay risk from the upcoming committee recess.",
    "Internal contact says the vote is essentially locked in — very high confidence.",
    "Political friction from two member states makes Q3 unlikely.",
    "Leadership wants this to land before the board offsite.",
  ];
  for (let i = 0; i < forecasters.length; i++) {
    await submitForecast({
      questionId: q1.id,
      forecasterId: forecasters[i].id,
      probability: probs[i],
      rationale: rationales[i],
    });
  }

  // Delphi: two rounds showing convergence + a preserved dissenter.
  const round1 = await startDelphiRound(q1.id, "anonymous_delayed");
  const round1Estimates = [0.5, 0.65, 0.52, 0.92, 0.28, 0.58];
  for (let i = 0; i < forecasters.length; i++) {
    await submitDelphiEstimate({
      roundId: round1.id,
      forecasterId: forecasters[i].id,
      estimate: round1Estimates[i],
      rationale: rationales[i],
    });
  }
  await closeDelphiRoundAndSummarize(round1.id);

  const round2 = await startDelphiRound(q1.id, "anonymous_delayed");
  const round2Estimates = [0.57, 0.6, 0.56, 0.88, 0.35, 0.59];
  for (let i = 0; i < forecasters.length; i++) {
    await submitDelphiEstimate({
      roundId: round2.id,
      forecasterId: forecasters[i].id,
      estimate: round2Estimates[i],
      rationale: i === 3 ? "Still confident — my source has not changed their account." : `Updated after seeing round 1 distribution.`,
    });
  }
  await closeDelphiRoundAndSummarize(round2.id);

  // Market trades, including a seeded wash-trade pattern from the "authority" account.
  await executeMarketTrade({ questionId: q1.id, traderId: forecasters[0].id, side: "YES", shares: 20 });
  await executeMarketTrade({ questionId: q1.id, traderId: forecasters[1].id, side: "YES", shares: 10 });
  await executeMarketTrade({ questionId: q1.id, traderId: forecasters[4].id, side: "NO", shares: 15 });

  // Authority-signal account attempts to pump the price via rapid self round-trips —
  // this should get flagged by the wash-trade guard (see PHASE 5 attack review).
  const exec = forecasters[5];
  await executeMarketTrade({ questionId: q1.id, traderId: exec.id, side: "YES", shares: 30 });
  await executeMarketTrade({ questionId: q1.id, traderId: exec.id, side: "NO", shares: 30 });
  await executeMarketTrade({ questionId: q1.id, traderId: exec.id, side: "YES", shares: 30 });
  await executeMarketTrade({ questionId: q1.id, traderId: exec.id, side: "NO", shares: 30 });

  // Authority-signal account also tries to brute-force a large directional position —
  // should be rejected outright by the position-limit guard.
  const bruteForce = await executeMarketTrade({ questionId: q1.id, traderId: exec.id, side: "YES", shares: 500 });

  // Second, already-resolved question so the Wisdom Dashboard has data immediately.
  const [q2] = await db
    .insert(collectiveQuestions)
    .values({
      title: "Did the pilot market launch hit its week-1 adoption target?",
      description: "Registered question (Part 24 governance id ci-reg-0290). Resolved from product analytics.",
      questionClass: "product-launch",
      modelProbability: "0.40000",
    })
    .returning();
  await db.insert(marketMakers).values({ questionId: q2.id, liquidityB: "20.0000" });
  const q2Probs = [0.82, 0.78, 0.75, 0.8, 0.2, 0.7];
  for (let i = 0; i < forecasters.length; i++) {
    await submitForecast({
      questionId: q2.id,
      forecasterId: forecasters[i].id,
      probability: q2Probs[i],
      rationale: "Early funnel metrics look strong vs comparable launches.",
    });
  }
  await executeMarketTrade({ questionId: q2.id, traderId: forecasters[0].id, side: "YES", shares: 25 });
  await resolveQuestion(q2.id, 1);

  const [q3] = await db
    .insert(collectiveQuestions)
    .values({
      title: "Will the central bank hold rates steady at the next meeting?",
      description: "Registered question — macro class, model-favored historically.",
      questionClass: "macro-rates",
      modelProbability: "0.90000",
    })
    .returning();
  await db.insert(marketMakers).values({ questionId: q3.id, liquidityB: "20.0000" });
  const q3Probs = [0.5, 0.55, 0.6, 0.45, 0.65, 0.5];
  for (let i = 0; i < forecasters.length; i++) {
    await submitForecast({ questionId: q3.id, forecasterId: forecasters[i].id, probability: q3Probs[i], rationale: "Mixed signals from recent commentary." });
  }
  await executeMarketTrade({ questionId: q3.id, traderId: forecasters[1].id, side: "YES", shares: 10 });
  await resolveQuestion(q3.id, 1);

  return { questionIds: [q1.id, q2.id, q3.id], bruteForceRejected: !bruteForce.accepted };
}
