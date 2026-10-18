// src/lib/circadian.ts
// Heuristic "time of day" phase model used only to scale the weekly
// cognitive-load budget shown in the Attention Optimizer.
//
// ORIGINAL to this sandbox. This is a simplified, disclosed HEURISTIC
// loosely informed by commonly-cited chronobiology summaries (a morning
// analytical peak, a post-lunch dip). It is illustrative guidance, not a
// diagnosis, and does not model individual chronotype, sleep debt, or shift
// work. Not copied from any file in github.com/wbweve/Leados — a same-named
// `src/lib/circadian.ts` does genuinely exist in that repo (verified this
// session, see AI-SESSION-LOG.md), but its phase table was read only in
// summary, not reproduced here; the numbers below are independently chosen
// and should be treated as illustrative weights, not shared constants.

import type { CircadianProfile } from "./types";

interface PhaseDef extends CircadianProfile {
  startHour: number;
  endHour: number;
}

const PHASES: PhaseDef[] = [
  { phase: "NIGHT", label: "Low alertness (night)", analytical: 0.3, workingMemory: 0.4, note: "Heuristic: avoid high-stakes irreversible calls if possible.", startHour: 0, endHour: 6 },
  { phase: "MORNING_PEAK", label: "Morning analytical peak", analytical: 1.0, workingMemory: 0.95, note: "Heuristic: commonly-reported window for strategic work.", startHour: 6, endHour: 11 },
  { phase: "MIDDAY", label: "Midday — steady", analytical: 0.85, workingMemory: 0.85, note: "Heuristic: reliable capacity before the post-lunch dip.", startHour: 11, endHour: 13 },
  { phase: "POST_LUNCH_DIP", label: "Post-lunch dip", analytical: 0.6, workingMemory: 0.65, note: "Heuristic: widely-reported early-afternoon alertness dip.", startHour: 13, endHour: 15 },
  { phase: "AFTERNOON_RECOVERY", label: "Afternoon recovery", analytical: 0.8, workingMemory: 0.78, note: "Heuristic: capacity typically recovers mid/late afternoon.", startHour: 15, endHour: 18 },
  { phase: "EVENING", label: "Evening wind-down", analytical: 0.55, workingMemory: 0.6, note: "Heuristic: better for review than novel analysis.", startHour: 18, endHour: 22 },
  { phase: "SLEEP_PREP", label: "Sleep preparation window", analytical: 0.35, workingMemory: 0.45, note: "Heuristic: consider deferring consequential decisions to morning.", startHour: 22, endHour: 24 },
];

export function getCurrentProfile(d: Date = new Date()): CircadianProfile {
  const h = d.getHours();
  const def = PHASES.find((p) => h >= p.startHour && h < p.endHour) ?? PHASES[0];
  const { startHour: _s, endHour: _e, ...profile } = def;
  return profile;
}
