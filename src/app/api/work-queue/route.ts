// LEADOS Part 14 — GET /api/work-queue
// Powers the "Now" surface: top-3 ranked decisions, delta-since-last-visit,
// pending approvals, and one recommended next action with evidence.
import { resolveActor } from "@/lib/demoContext";
import { getDecisionQueue, getDeltaSinceLastVisit, markNowVisited, recommendNextAction } from "@/lib/workQueue";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const now = new Date();

  const previousLastSeen = await markNowVisited(actor.userId, now);
  const queue = await getDecisionQueue(actor.orgId, actor.role, now);
  const delta = await getDeltaSinceLastVisit(actor.orgId, actor.role, previousLastSeen, now);
  const pendingApprovals = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.orgId, actor.orgId), eq(approvals.assigneeRole, actor.role), eq(approvals.status, "pending")));

  return Response.json({
    top3: queue.slice(0, 3),
    recommendedAction: recommendNextAction(queue),
    pendingApprovals,
    delta,
    isEmptyOrg: queue.length === 0 && pendingApprovals.length === 0,
  });
}
