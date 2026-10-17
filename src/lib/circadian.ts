// circadian.ts — heuristic "time of day" phase model.
// ORIGINAL to this build. This is a simplified, disclosed HEURISTIC loosely
// informed by commonly-cited chronobiology findings (e.g. a post-lunch dip
// in alertness, a morning analytical peak for many "lark"/neutral
// chronotypes). It is GUIDANCE, NOT a diagnosis, and does not model
// individual chronotype, sleep debt, or shift work. Source: general,
// widely-cited circadian-rhythm literature summaries — not a specific
// cited study, and not personalized. Treat all numbers below as
// illustrative weights, not measured biological constants.

import type { CircadianProfile } from "./types";

export interface PhaseDef extends CircadianProfile {
  startHour: number; // inclusive, local time
  endHour: number; // exclusive
}

export const PHASES: PhaseDef[] = [
  {
    phase: "LOW_ALERTNESS_NIGHT",
    label: "Low alertness (night)",
    analytical: 0.3,
    workingMemory: 0.4,
    note: "Heuristic: avoid high-stakes irreversible decisions if possible.",
    startHour: 0,
    endHour: 6,
  },
  {
    phase: "MORNING_PEAK",
    label: "Morning analytical peak",
    analytical: 1.0,
    workingMemory: 0.95,
    note: "Heuristic: a commonly-reported window for analytical/strategic work.",
    startHour: 6,
    endHour: 11,
  },
  {
    phase: "MIDDAY_STEADY",
    label: "Midday — steady",
    analytical: 0.85,
    workingMemory: 0.85,
    note: "Heuristic: generally reliable capacity before the post-lunch dip.",
    startHour: 11,
    endHour: 13,
  },
  {
    phase: "POST_LUNCH_DIP",
    label: "Post-lunch dip",
    analytical: 0.6,
    workingMemory: 0.65,
    note: "Heuristic: widely-reported early-afternoon alertness dip (~35% working-memory reduction from peak, illustrative).",
    startHour: 13,
    endHour: 15,
  },
  {
    phase: "AFTERNOON_RECOVERY",
    label: "Afternoon recovery",
    analytical: 0.8,
    workingMemory: 0.78,
    note: "Heuristic: capacity typically recovers through mid/late afternoon.",
    startHour: 15,
    endHour: 18,
  },
  {
    phase: "EVENING_WIND_DOWN",
    label: "Evening wind-down",
    analytical: 0.55,
    workingMemory: 0.6,
    note: "Heuristic: good for review/reflection, weaker for novel analysis.",
    startHour: 18,
    endHour: 22,
  },
  {
    phase: "SLEEP_PREPARATION",
    label: "Sleep preparation window",
    analytical: 0.35,
    workingMemory: 0.45,
    note: "Heuristic: consider deferring consequential decisions to morning.",
    startHour: 22,
    endHour: 24,
  },
];

export function getProfileForDate(d: Date = new Date()): CircadianProfile {
  const h = d.getHours();
  const def = PHASES.find((p) => h >= p.startHour && h < p.endHour) ?? PHASES[0];
  const { startHour: _s, endHour: _e, ...profile } = def;
  return profile;
}

export function getProfileForISO(iso: string): CircadianProfile {
  return getProfileForDate(new Date(iso));
}
