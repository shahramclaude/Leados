// POST /api/cadence/tick — the cron-facing endpoint. Idempotent: calling
// this repeatedly (or concurrently) never duplicates an occurrence, see
// src/lib/cadence/scheduler.ts. A real deployment would invoke this from an
// external scheduler (platform cron / CI schedule) on a short interval, the
// same documented seam pattern observed upstream in Part 07's
// `src/lib/scheduler.ts` ("Serverless-honesty note").
import { NextResponse } from "next/server";
import { runCadenceTick } from "@/lib/cadence/scheduler";
import { resolveOrgId } from "@/lib/cadence/resolveOrg";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const orgId = await resolveOrgId(url.searchParams);
  const nowParam = url.searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();
  const results = await runCadenceTick(orgId, now);
  return NextResponse.json({ orgId, now: now.toISOString(), results });
}
