import "@/lib/kernel/bootstrap";
import { decideApproval, listPendingApprovals } from "@/lib/kernel/approvals";
import { runCycle } from "@/lib/kernel/orchestrator";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const approvals = await listPendingApprovals();
  return Response.json({ approvals });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    approvalId?: string;
    decision?: "approved" | "rejected" | "modified";
    decidedBy?: string;
    note?: string;
    modifiedInput?: unknown;
  };
  if (!body.approvalId || !body.decision) {
    return Response.json({ error: "approvalId and decision are required" }, { status: 400 });
  }
  const decidedBy: Actor = { kind: "human", id: body.decidedBy ?? "unknown-reviewer" };
  const approval = await decideApproval({ approvalId: body.approvalId, decision: body.decision, decidedBy, note: body.note, modifiedInput: body.modifiedInput });

  // Immediately try to resume the run so an approve/reject click has a
  // visible, fast effect — this is the "one-click" part of the HITL design.
  const result = await runCycle(approval.runId, { actor: decidedBy });

  return Response.json({ approval, result });
}
