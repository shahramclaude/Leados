import { listDecisions, createDecision } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const decisions = await listDecisions();
  return Response.json({ decisions });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const decision = await createDecision({
    title: body.title,
    description: body.description ?? "",
    impact: body.impact ?? "medium",
    confidence: Number.isFinite(body.confidence) ? body.confidence : 50,
    rationale: body.rationale ?? "",
    ownerId: body.ownerId ?? null,
  });
  return Response.json({ decision }, { status: 201 });
}
