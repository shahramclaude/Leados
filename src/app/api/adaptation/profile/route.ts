import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireUserId } from "@/app/api/adaptation/_util";
import { getLearnedProfile, getOrCreateProfileRow, updateProfileRow, type ProfilePatch } from "@/lib/state/profileStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) return badRequest("userId is required");

  const [profileRow, learned] = await Promise.all([getOrCreateProfileRow(userId), getLearnedProfile(userId)]);

  return NextResponse.json({
    ok: true,
    profile: profileRow,
    expertise: learned.expertise,
    inferredStyle: learned.inferredStyle,
    effectiveStyle: learned.effectiveStyle,
    eventCount: learned.eventCount,
    asOf: learned.asOf,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string") return badRequest("userId is required");

  const patch: ProfilePatch = {};
  if (body.patch && typeof body.patch === "object") {
    if ("densityModeOverride" in body.patch) {
      const v = body.patch.densityModeOverride;
      if (v === null || v === "guided" || v === "standard" || v === "dense") patch.densityModeOverride = v;
    }
    if (typeof body.patch.adaptationPaused === "boolean") patch.adaptationPaused = body.patch.adaptationPaused;
    if (typeof body.patch.onboardingCompleted === "boolean") patch.onboardingCompleted = body.patch.onboardingCompleted;
    if (typeof body.patch.onboardingSkipped === "boolean") patch.onboardingSkipped = body.patch.onboardingSkipped;
  }

  const row = await updateProfileRow(body.userId, patch);
  return NextResponse.json({ ok: true, profile: row });
}
