import { listDecisionEvents, addDecisionComment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const events = await listDecisionEvents(decisionId);
  return Response.json({ events });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  if (!Number.isInteger(decisionId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.comment !== "string" || !body.comment.trim()) {
    return Response.json({ error: "comment is required" }, { status: 400 });
  }
  const event = await addDecisionComment(decisionId, body.comment, body.actor ?? "api");
  return Response.json({ event }, { status: 201 });
}
