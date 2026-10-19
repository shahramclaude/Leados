// GET  /api/self-improve — list proposals.
// POST /api/self-improve — propose a rule weight change.
import { listProposals, proposeRuleWeightChange } from "@/lib/kernel/selfImprove";

export const dynamic = "force-dynamic";

export async function GET() {
  const proposals = await listProposals();
  return Response.json({ ok: true, proposals });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ruleId, newWeight, rationale, proposedBy } = body ?? {};
    if (!ruleId || newWeight === undefined || !rationale) {
      return Response.json({ ok: false, error: "ruleId, newWeight, rationale are required" }, { status: 400 });
    }
    const proposal = await proposeRuleWeightChange({ ruleId: Number(ruleId), newWeight: Number(newWeight), rationale, proposedBy });
    return Response.json({ ok: true, proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
