import { getDecision, updateDecisionStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["proposed", "under_review", "committed", "reversed"] as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const decision = await getDecision(decisionId);
  if (!decision) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ decision });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return Response.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  const decision = await updateDecisionStatus(decisionId, body.status, body.actor ?? "api");
  if (!decision) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ decision });
}
