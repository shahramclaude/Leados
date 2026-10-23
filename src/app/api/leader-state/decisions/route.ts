import { getActorFromRequest } from "@/lib/auth";
import { AccessDeniedError, createDecision, listDecisions } from "@/lib/leaderState/repository";
import type { NewDecisionInput } from "@/lib/leaderState/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  try {
    // This endpoint always resolves the owner as the caller themselves —
    // there is no `ownerUserId` query parameter by design. "My State" data
    // has no other-person read path, full stop.
    const decisions = await listDecisions(actor, actor.userId);
    return Response.json({ decisions });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  let body: NewDecisionInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const decision = await createDecision(actor, actor.userId, {
      ...body,
      decidedAt: body.decidedAt ? new Date(body.decidedAt) : undefined,
    });
    return Response.json({ decision }, { status: 201 });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    if (err instanceof RangeError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
