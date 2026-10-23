import { getActorFromRequest } from "@/lib/auth";
import { getCapacitySignalForScheduler } from "@/lib/leaderState/capacitySignals";

export const dynamic = "force-dynamic";

/**
 * Demo/preview of what Part 45's scheduling optimizer receives. It is only
 * ever invoked here for the caller's own id (there is no other-person path
 * over HTTP). The underlying function is itself grant-gated: with no active
 * `scheduler-optimizer` grant — including an expired or revoked one — it
 * returns `granted: false` and no signal, never falling back to raw data.
 */
export async function GET(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  const result = await getCapacitySignalForScheduler(actor.userId);
  return Response.json(result);
}
