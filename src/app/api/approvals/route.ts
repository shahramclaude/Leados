import { NextRequest } from "next/server";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { applyTable, approvalRoutingTable } from "@/lib/rules";
import { appendAuditEvent } from "@/lib/audit";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.orgId, DEFAULT_ORG_ID))
    .orderBy(desc(approvals.createdAt));
  return Response.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.title) {
    return Response.json({ code: "validation_error", detail: "title is required" }, { status: 400 });
  }
  const riskTier = body.riskTier ?? "T2";
  const amountUsd = body.amountUsd ?? 0;

  const trace = applyTable(approvalRoutingTable, { riskTier, amountUsd });

  const [row] = await db
    .insert(approvals)
    .values({
      orgId: DEFAULT_ORG_ID,
      title: body.title,
      description: body.description ?? null,
      riskTier,
      amountUsd,
      status: trace.output.autoApprovable ? "approved" : "pending",
      decisionNote: trace.output.autoApprovable ? `Auto-approved: ${trace.explanation}` : null,
      decidedAt: trace.output.autoApprovable ? new Date() : null,
    })
    .returning();

  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: trace.output.autoApprovable ? "approval.auto_approved" : "approval.requested",
    entityType: "approval",
    entityId: row.id,
    metadata: { riskTier, amountUsd, requiredApprover: trace.output.requiredApprover, because: trace.explanation },
  });

  return Response.json({ item: row, trace }, { status: 201 });
}
