import { db } from "@/db";
import { dualControlActions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { requestAction, T4_ACTIONS } from "@/lib/powerActions";
import { actorFromHeaders, DUAL_CONTROL_ELIGIBLE_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(dualControlActions).orderBy(desc(dualControlActions.createdAt));
  return Response.json({ actions: rows, t4Actions: T4_ACTIONS });
}

export async function POST(req: Request) {
  const actor = actorFromHeaders(req.headers);
  const body = await req.json();

  if (!actor.personId || !actor.role) {
    return Response.json({ error: "x-actor-id and x-actor-role headers are required" }, { status: 400 });
  }
  if (!DUAL_CONTROL_ELIGIBLE_ROLES.includes(actor.role)) {
    return Response.json({ error: `Role "${actor.role}" cannot request T4 actions.` }, { status: 403 });
  }
  if (!body.actionType) return Response.json({ error: '"actionType" is required' }, { status: 400 });

  try {
    const row = await requestAction({
      actionType: body.actionType,
      payload: body.payload ?? {},
      requestedByPersonId: actor.personId,
      requestedByRole: actor.role,
    });
    return Response.json({ action: row }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
