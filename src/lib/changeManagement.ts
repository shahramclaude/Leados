// change_management — ADKAR + Kotter frameworks.
//
// PROVENANCE: pasted "pt-O" brief names `js/change_management.js`. Not found
// in github.com/wbweve/Leados this session. ADKAR (Awareness, Desire,
// Knowledge, Ability, Reinforcement — Prosci / Jeff Hiatt) and Kotter's
// 8-Step Process (Kotter, 1996) are both real, citable change-management
// frameworks, applied here with original scoring/mapping code.

import type { AdkarState } from "./types";
import { round1 } from "./prng";

export interface ChangeManagementResult {
  adkar: AdkarState;
  barrierPoint: keyof AdkarState;
  barrierScore: number;
  overallReadiness: number;
  kotterStep: number;
  kotterLabel: string;
  guidance: string;
}

const KOTTER_STEPS = [
  "1. Create urgency",
  "2. Build a guiding coalition",
  "3. Form a strategic vision",
  "4. Enlist a volunteer army",
  "5. Enable action by removing barriers",
  "6. Generate short-term wins",
  "7. Sustain acceleration",
  "8. Institute change",
];

/**
 * ADKAR's own doctrine: a change moves only as fast as its lowest-scoring
 * element (the "barrier point") — not as fast as the average. This is the
 * model's real, citable core claim (Hiatt, 2006), applied directly here.
 */
export function computeChangeManagement(adkar: AdkarState): ChangeManagementResult {
  const entries = Object.entries(adkar) as [keyof AdkarState, number][];
  const [barrierPoint, barrierScore] = entries.sort((a, b) => a[1] - b[1])[0];
  const overallReadiness = round1(entries.reduce((s, [, v]) => s + v, 0) / entries.length);

  // Heuristic mapping of ADKAR readiness onto Kotter's 8 steps — original to
  // this delivery (the two frameworks are not formally unified in the source
  // literature; this mapping is a disclosed convenience, not a citation).
  const kotterStepIndex = Math.min(7, Math.max(0, Math.floor((overallReadiness / 100) * 8)));
  const kotterStep = kotterStepIndex + 1;

  const barrierLabel: Record<keyof AdkarState, string> = {
    awareness: "Awareness",
    desire: "Desire",
    knowledge: "Knowledge",
    ability: "Ability",
    reinforcement: "Reinforcement",
  };

  const guidance = `The change effort is gated by ${barrierLabel[barrierPoint]} (${barrierScore}/100) — per ADKAR, raising other dimensions will not accelerate adoption until this one moves.`;

  return {
    adkar,
    barrierPoint,
    barrierScore,
    overallReadiness,
    kotterStep,
    kotterLabel: KOTTER_STEPS[kotterStepIndex],
    guidance,
  };
}

export function changeManagementSignal(adkar: AdkarState): number {
  // Deliberately uses the barrier (min), not the average, as the signal —
  // consistent with ADKAR's own "weakest link gates the whole change" claim.
  return computeChangeManagement(adkar).barrierScore;
}
