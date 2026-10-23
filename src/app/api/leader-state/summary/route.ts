import { getActorFromRequest } from "@/lib/auth";
import { AccessDeniedError, listDecisions, listRecoverySignals } from "@/lib/leaderState/repository";
import { buildCapacityDashboard } from "@/lib/leaderState/decisionLoad";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  try {
    const [decisions, recoverySignals] = await Promise.all([
      listDecisions(actor, actor.userId),
      listRecoverySignals(actor, actor.userId),
    ]);
    const dashboard = buildCapacityDashboard(decisions, recoverySignals);
    return Response.json({ dashboard });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
