import { explain, type Explain } from "@/lib/explain";
import type { FunnelCounts } from "./types";

/**
 * ADKAR-style stage instrumentation, derived from observable proxies (funnel
 * counts + aggregate training completion as a knowledge proxy) — not from
 * self-report alone. Because proxies are indirect, the result is a
 * distribution over "most likely blocking stage" with an explicit
 * confidence/margin, and ambiguous cases name the runner-up stage instead of
 * silently picking one.
 */
export type AdkarStage = "Awareness" | "Desire" | "Knowledge" | "Ability" | "Reinforcement";

export interface AdkarAssessment {
  primaryBlockingStage: AdkarStage;
  deficits: Record<AdkarStage, number>;
  margin: number;
}

function safeDiv(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

export function assessAdkarStage(
  funnel: FunnelCounts,
  rosterSize: number,
  trainingCompletionRate: number
): Explain<AdkarAssessment> {
  const awareFrac = safeDiv(funnel.awareness, rosterSize);
  const trialFrac = safeDiv(funnel.trial, rosterSize);
  const habitFrac = safeDiv(funnel.habit, rosterSize);
  const knowledge = Math.max(0, Math.min(1, trainingCompletionRate));

  const deficits: Record<AdkarStage, number> = {
    Awareness: 1 - awareFrac,
    Knowledge: 1 - knowledge,
    // Desire deficit only meaningful once there is awareness to desire from.
    Desire: awareFrac > 0.1 ? 1 - safeDiv(trialFrac, awareFrac) : 0,
    // Ability/Reinforcement collapsed to "Ability" deficit when trial exists but doesn't convert to habit.
    Ability: trialFrac > 0.05 ? 1 - safeDiv(habitFrac, trialFrac) : 0,
    Reinforcement: habitFrac > 0 ? Math.max(0, 1 - habitFrac) * 0.5 : 0,
  };

  const ranked = (Object.entries(deficits) as [AdkarStage, number][]).sort((a, b) => b[1] - a[1]);
  const [topStage, topDeficit] = ranked[0];
  const [, secondDeficit] = ranked[1];
  const margin = Number((topDeficit - secondDeficit).toFixed(3));

  const caveats = [
    "Derived from behavioral proxies, not direct self-report; stage assignment is a hypothesis, not a diagnosis.",
    "Knowledge is approximated by training completion, which does not guarantee retained understanding.",
  ];
  if (margin < 0.08) {
    caveats.push(
      `Low margin (${margin}) between top candidates '${ranked[0][0]}' and '${ranked[1][0]}' — treat this classification as uncertain and avoid acting on it alone.`
    );
  }

  return explain(
    { primaryBlockingStage: topStage, deficits, margin },
    "adkar_proxy_deficit_v1",
    { awareFrac, trialFrac, habitFrac, knowledge, margin },
    {
      confidence: margin >= 0.15 ? "medium" : "low",
      caveats,
    }
  );
}
