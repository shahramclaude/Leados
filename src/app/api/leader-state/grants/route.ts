import { getActorFromRequest } from "@/lib/auth";
import { AccessDeniedError, createGrant, listGrants, revokeGrant } from "@/lib/leaderState/repository";
import type { GrantScope } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const VALID_SCOPES: GrantScope[] = ["scheduler-optimizer", "research-aggregate"];

export async function GET(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  try {
    const grants = await listGrants(actor, actor.userId);
    return Response.json({ grants });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const scope = body?.scope as GrantScope | undefined;
  const ttlMs = Number(body?.ttlMs);
  if (!scope || !VALID_SCOPES.includes(scope)) {
    return Response.json({ error: `scope must be one of ${VALID_SCOPES.join(", ")}` }, { status: 400 });
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return Response.json({ error: "ttlMs must be a positive number of milliseconds" }, { status: 400 });
  }

  try {
    const grant = await createGrant(actor, actor.userId, scope, ttlMs);
    return Response.json({ grant }, { status: 201 });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    if (err instanceof RangeError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  const url = new URL(req.url);
  const grantId = url.searchParams.get("id");
  if (!grantId) return Response.json({ error: "missing id query parameter" }, { status: 400 });

  try {
    await revokeGrant(actor, actor.userId, grantId);
    return Response.json({ revoked: true });
  } catch (err) {
    if (err instanceof AccessDeniedError) return Response.json({ error: err.message }, { status: 403 });
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
