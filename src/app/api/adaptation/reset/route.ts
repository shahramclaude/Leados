import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/app/api/adaptation/_util";
import { resetProfileRow } from "@/lib/state/profileStore";
import { getOrCreateAttentionProfile, saveAttentionProfile } from "@/lib/state/profileStore";
import { resetAttentionProfile } from "@/lib/adaptation/attentionProfile";

export const dynamic = "force-dynamic";

/**
 * Reset-to-default: a single call that restores the neutral, auto-adaptive
 * baseline — clears density overrides, un-pauses adaptation, and restores
 * the ontology's default question order. One interaction, full restore.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string") return badRequest("userId is required");

  const [profile] = await Promise.all([
    resetProfileRow(body.userId),
    getOrCreateAttentionProfile(body.userId).then((p) => saveAttentionProfile(resetAttentionProfile(p.userId))),
  ]);

  return NextResponse.json({ ok: true, profile });
}
