import { decide, DecisionGateError } from "@/lib/decisionEngine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const row = await decide(Number(id), Number(body.chosenOptionId), Boolean(body.downsideAcknowledged), body.reviewInDays ?? 90);
    return Response.json({ decision: row });
  } catch (err) {
    if (err instanceof DecisionGateError) return Response.json({ error: err.message, gate: "downside_acknowledgement_required" }, { status: 422 });
    throw err;
  }
}
