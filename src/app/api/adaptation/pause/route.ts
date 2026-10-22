import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/app/api/adaptation/_util";
import { setAdaptationPaused } from "@/lib/state/profileStore";

export const dynamic = "force-dynamic";

/** Pause/resume adaptation. Paused = render the neutral default, one call, no second step. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string" || typeof body.paused !== "boolean") {
    return badRequest("userId and paused (boolean) are required");
  }
  const profile = await setAdaptationPaused(body.userId, body.paused);
  return NextResponse.json({ ok: true, profile });
}
