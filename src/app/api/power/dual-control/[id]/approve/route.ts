import { approveAction } from "@/lib/powerActions";
import { actorFromHeaders, DUAL_CONTROL_ELIGIBLE_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);

  if (!actor.personId || !actor.role) {
    return Response.json({ error: "x-actor-id and x-actor-role headers are required" }, { status: 400 });
  }
  if (!DUAL_CONTROL_ELIGIBLE_ROLES.includes(actor.role)) {
    return Response.json({ error: `Role "${actor.role}" cannot approve T4 actions.` }, { status: 403 });
  }

  try {
    const result = await approveAction({ actionId: Number(id), approverPersonId: actor.personId, approverRole: actor.role });
    const status = result.status === "blocked" ? 403 : 200;
    return Response.json(result, { status });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
