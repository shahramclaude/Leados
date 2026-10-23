import { z } from "zod";
import { recordApprovalDecision } from "@/lib/agent/approvals";

export const dynamic = "force-dynamic";

const DecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().min(1).max(2000),
  reviewer: z.string().min(1).max(200),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const approvalId = Number(id);
  if (!Number.isFinite(approvalId)) {
    return Response.json({ ok: false, error: "invalid approval id" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const result = await recordApprovalDecision(approvalId, parsed.data);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "ALREADY_RESOLVED" ? 409 : 422;
    return Response.json({ ok: false, error: result.message, qualityScore: result.qualityScore }, { status });
  }
  return Response.json({ ok: true, qualityScore: result.qualityScore });
}
