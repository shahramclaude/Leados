import { completeRetrospective, openDueRetrospectives } from "@/lib/decisionEngine";
import { getDecisionDetail } from "@/lib/decisionEngine";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getDecisionDetail(Number(id));
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ retrospective: detail.retro });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body.action === "open_due_sweep") {
    const opened = await openDueRetrospectives();
    return Response.json({ opened });
  }
  const { whatHappened, actualPayoff, lessons } = body;
  if (whatHappened == null || actualPayoff == null) {
    return Response.json({ error: "whatHappened and actualPayoff are required" }, { status: 400 });
  }
  const row = await completeRetrospective(Number(id), { whatHappened, actualPayoff: Number(actualPayoff) }, lessons ?? "");
  if (!row) return Response.json({ error: "No open retrospective for this decision (has it passed its review date yet?)" }, { status: 400 });
  return Response.json({ retrospective: row });
}
