import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, UnauthenticatedError } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { getOnboardingState, upsertOnboardingState } from "@/db/repositories/orgs";
import { computeOnboardingProgress } from "@/lib/onboarding";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const state = await getOnboardingState(user.orgId);
    const stepsCompleted = (state?.stepsCompleted as string[]) ?? [];
    return NextResponse.json({ state, progress: computeOnboardingProgress(stepsCompleted) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const body = await request.json().catch(() => ({}));
    const { stepId, wizardCompleted } = body as { stepId?: string; wizardCompleted?: boolean };
    const current = await getOnboardingState(user.orgId);
    const stepsCompleted = new Set((current?.stepsCompleted as string[]) ?? []);
    if (stepId) stepsCompleted.add(stepId);
    const state = await upsertOnboardingState(user.orgId, {
      stepsCompleted: [...stepsCompleted],
      ...(typeof wizardCompleted === "boolean" ? { wizardCompleted } : {}),
    });
    return NextResponse.json({ state, progress: computeOnboardingProgress([...stepsCompleted]) });
  } catch (err) {
    return handleApiError(err);
  }
}
