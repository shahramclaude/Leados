import { NextResponse } from "next/server";
import { requireContext } from "@/lib/api-helpers";
import { markOnboardingComplete } from "@/lib/repo/orgs";

export const dynamic = "force-dynamic";

// Marks onboarding complete without adding sample data (user opted out at
// the "sample data" step of OrgProfileWizard).
export async function POST() {
  const result = await requireContext("POST", "/api/onboarding/complete");
  if ("error" in result) return result.error;
  await markOnboardingComplete(result.ctx.orgId);
  return NextResponse.json({ ok: true });
}
