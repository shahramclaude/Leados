import { getActorFromRequest } from "@/lib/auth";
import { AccessDeniedError, listRecoverySignals, upsertRecoverySignal } from "@/lib/leaderState/repository";
import type { RecoverySignalInput } from "@/lib/leaderState/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  try {
    const signals = await listRecoverySignals(actor, actor.userId);
    return Response.json({ signals });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  let body: RecoverySignalInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const signal = await upsertRecoverySignal(actor, actor.userId, body);
    return Response.json({ signal }, { status: 201 });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
