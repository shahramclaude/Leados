import { recordEvent, listEvents } from "./events";
import { ValidationError } from "./findings";

export async function completeOnboarding(orgName: string): Promise<{ orgName: string }> {
  if (!orgName || orgName.trim().length === 0) {
    throw new ValidationError("orgName is required");
  }
  await recordEvent({
    type: "onboarding.completed",
    version: 1,
    payload: { orgName: orgName.trim() },
  });
  return { orgName: orgName.trim() };
}

export async function getOnboardingStatus(): Promise<{ completed: boolean; orgName: string | null }> {
  const page = await listEvents(new URLSearchParams({ limit: "200" }));
  const match = page.items.find((e) => e.type === "onboarding.completed");
  if (!match) return { completed: false, orgName: null };
  const payload = match.payload as { orgName?: string };
  return { completed: true, orgName: payload.orgName ?? null };
}
