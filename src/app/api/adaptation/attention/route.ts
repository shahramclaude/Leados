import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireUserId } from "@/app/api/adaptation/_util";
import { getOrCreateAttentionProfile, saveAttentionProfile } from "@/lib/state/profileStore";
import {
  DIGEST_TIMING_OPTIONS,
  reorderQuestions,
  resetAttentionProfile,
  setDigestTiming,
  setInterruptThreshold,
  type DigestTiming,
} from "@/lib/adaptation/attentionProfile";
import { DOMAINS, type Domain } from "@/lib/familiarity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) return badRequest("userId is required");
  const profile = await getOrCreateAttentionProfile(userId);
  return NextResponse.json({ ok: true, profile });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string") return badRequest("userId is required");

  let profile = await getOrCreateAttentionProfile(body.userId);

  if (body.action === "reset") {
    profile = resetAttentionProfile(body.userId);
  } else {
    if (body.patch?.interruptThresholds && typeof body.patch.interruptThresholds === "object") {
      for (const [domain, value] of Object.entries(body.patch.interruptThresholds)) {
        if (DOMAINS.includes(domain as Domain) && typeof value === "number") {
          profile = setInterruptThreshold(profile, domain as Domain, value);
        }
      }
    }
    if (typeof body.patch?.digestTiming === "string" && DIGEST_TIMING_OPTIONS.includes(body.patch.digestTiming)) {
      profile = setDigestTiming(profile, body.patch.digestTiming as DigestTiming);
    }
    if (Array.isArray(body.patch?.questionOrder)) {
      try {
        profile = reorderQuestions(profile, body.patch.questionOrder);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "invalid questionOrder");
      }
    }
  }

  const saved = await saveAttentionProfile(profile);
  return NextResponse.json({ ok: true, profile: saved });
}
