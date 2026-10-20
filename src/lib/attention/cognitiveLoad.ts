// Cognitive load composes fatigue + circadian receptivity + current
// attention-budget spend into a single 0..100 score used by the interrupt
// policy. Higher load => higher bar for what is allowed to interrupt.

import { getCircadianState } from "./circadian";
import { getFatigueState } from "./fatigue";
import { getBudgetState } from "./budget";

export interface CognitiveLoadState {
  score: number; // 0 (fresh/available) .. 100 (overloaded)
  fatigue: number;
  receptivity: number;
  budgetSpendRatio: number;
  explanation: string[];
}

export async function getCognitiveLoad(userId: string, now: Date = new Date()): Promise<CognitiveLoadState> {
  const [circadian, fatigue, budget] = await Promise.all([
    getCircadianState(userId, now),
    getFatigueState(userId, now),
    getBudgetState(userId, now),
  ]);

  const explanation: string[] = [];
  const receptivityLoad = 100 - circadian.receptivity; // low receptivity => high load
  const budgetSpendRatio = budget.budget > 0 ? budget.used / budget.budget : 1;
  const budgetLoad = Math.min(100, budgetSpendRatio * 100);

  explanation.push(`fatigue ${fatigue.score}/100 (${fatigue.interruptsLastHour} interrupts in last hour)`);
  explanation.push(`time-of-day receptivity ${circadian.receptivity}/100`);
  explanation.push(`budget spent ${budget.used}/${budget.budget} today`);

  const score = Math.round(fatigue.score * 0.5 + receptivityLoad * 0.25 + budgetLoad * 0.25);

  return {
    score: Math.min(100, score),
    fatigue: fatigue.score,
    receptivity: circadian.receptivity,
    budgetSpendRatio: Number(budgetSpendRatio.toFixed(2)),
    explanation,
  };
}
