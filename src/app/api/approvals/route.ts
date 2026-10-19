// GET /api/approvals — list approvals (?status=pending to filter).
// POST /api/approvals — { approvalId, decision: "approved"|"rejected", decidedBy, reason? }
import { decideApproval, listApprovals, listPendingApprovals } from "@/lib/kernel/approvals";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const rows = status === "pending" ? await listPendingApprovals() : await listApprovals();
  return Response.json({ ok: true, approvals: rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { approvalId, decision, decidedBy, reason } = body ?? {};
    if (!approvalId || !decision || !decidedBy) {
      return Response.json({ ok: false, error: "approvalId, decision, decidedBy are required" }, { status: 400 });
    }
    if (decision !== "approved" && decision !== "rejected") {
      return Response.json({ ok: false, error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
    }
    const result = await decideApproval(Number(approvalId), decision, decidedBy, reason);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
