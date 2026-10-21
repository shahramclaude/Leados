import { NextResponse } from "next/server";
import { getCurrentUser, UnauthenticatedError } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { removeSampleDataForOrg, seedSampleDataForOrg } from "@/lib/onboardingSeed";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    await seedSampleDataForOrg(user.orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    await removeSampleDataForOrg(user.orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
