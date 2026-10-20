import { getDecision, updateDecisionBelief, NotFoundError } from "@/lib/app/decisions";
import { ValidationError } from "@/lib/app/findings";
import { checkAuth } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ error: "id must be an integer" }, { status: 400 });
  }
  const decision = await getDecision(numericId);
  if (!decision) {
    return Response.json({ error: "Decision not found" }, { status: 404 });
  }
  return Response.json(decision);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = checkAuth(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return Response.json({ error: "id must be an integer" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { successes, failures, decide } = (body ?? {}) as Record<string, unknown>;
  try {
    const decision = await updateDecisionBelief(numericId, {
      successes: Number(successes ?? 0),
      failures: Number(failures ?? 0),
      decide: Boolean(decide),
    });
    return Response.json(decision);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
