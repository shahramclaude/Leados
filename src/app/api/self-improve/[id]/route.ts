// POST /api/self-improve/[id] — { action: "evaluate"|"approve"|"reject", decidedBy?, reason? }
import { approveProposal, evaluateProposal, rejectProposal } from "@/lib/kernel/selfImprove";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proposalId = Number(id);
    const body = await req.json();
    const { action, decidedBy, reason } = body ?? {};

    if (action === "evaluate") {
      const scorecard = await evaluateProposal(proposalId);
      return Response.json({ ok: true, scorecard });
    }
    if (action === "approve") {
      if (!decidedBy) return Response.json({ ok: false, error: "decidedBy is required to approve" }, { status: 400 });
      const proposal = await approveProposal(proposalId, decidedBy, reason);
      return Response.json({ ok: true, proposal });
    }
    if (action === "reject") {
      if (!decidedBy) return Response.json({ ok: false, error: "decidedBy is required to reject" }, { status: 400 });
      const proposal = await rejectProposal(proposalId, decidedBy, reason);
      return Response.json({ ok: true, proposal });
    }
    return Response.json({ ok: false, error: "action must be evaluate|approve|reject" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
