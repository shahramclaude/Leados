export type OnboardingStepId = "profile" | "terminology" | "team" | "sample" | "invite";

export const ONBOARDING_STEPS: { id: OnboardingStepId; labelKey: string }[] = [
  { id: "profile", labelKey: "onboarding.step.profile" },
  { id: "terminology", labelKey: "onboarding.step.terminology" },
  { id: "team", labelKey: "onboarding.step.team" },
  { id: "sample", labelKey: "onboarding.step.sample" },
  { id: "invite", labelKey: "onboarding.step.invite" },
];

export function computeOnboardingProgress(stepsCompleted: string[]) {
  const total = ONBOARDING_STEPS.length;
  const completed = ONBOARDING_STEPS.filter((s) => stepsCompleted.includes(s.id)).length;
  return { completed, total, isComplete: completed === total };
}
