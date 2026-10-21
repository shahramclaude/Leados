import { NextRequest } from "next/server";
import { runMonthlyRecalibration } from "@/lib/scheduler/recalibration";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";
import { assertAccess, isHr } from "@/lib/accessControl";

export const dynamic = "force-dynamic";

/** POST /api/admin/recalibration/run — manual trigger for the Part 07
 * scheduler seam. In production this endpoint is called unattended by the
 * monthly job; HR-only because the report references individual outcomes. */
export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    assertAccess(isHr(actor), `actor ${actor.id} (${actor.globalRole}) may not trigger recalibration`);
    const report = await runMonthlyRecalibration();
    return Response.json(report);
  } catch (err) {
    return toErrorResponse(err);
  }
}
