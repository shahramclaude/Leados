// js/onboarding.js (requested module) -> src/lib/onboarding.ts.
// A short wizard for first-time setup: baseline team facts used by
// leadershipScience.ts and the runway slider used across the app.

import type { OnboardingState } from "./types";

export interface OnboardingStepDef {
  id: number;
  title: string;
  field: keyof OnboardingState["baseline"];
  help: string;
  min: number;
  max: number;
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  { id: 0, title: "Team size", field: "teamSize", help: "How many people are on the team you're monitoring?", min: 1, max: 60 },
  { id: 1, title: "Manager span", field: "managerSpan", help: "How many direct reports does the primary manager have?", min: 1, max: 20 },
  { id: 2, title: "Team age (months)", field: "teamAgeMonths", help: "How long has this team existed in its current form?", min: 0, max: 240 },
  { id: 3, title: "Runway (months)", field: "runwayMonths", help: "How many months of budget runway remain?", min: 0, max: 60 },
];

export function isOnboardingValid(baseline: OnboardingState["baseline"]): boolean {
  return ONBOARDING_STEPS.every((step) => {
    const value = baseline[step.field];
    return typeof value === "number" && value >= step.min && value <= step.max;
  });
}

export function nextStep(current: number): number {
  return Math.min(current + 1, ONBOARDING_STEPS.length - 1);
}

export function prevStep(current: number): number {
  return Math.max(current - 1, 0);
}
