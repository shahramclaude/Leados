import { db } from "@/db";
import { approvals } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { appendAuditEvent } from "@/lib/audit";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = body?.decision === "rejected" ? "rejected" : "approved";
  const note = typeof body?.note === "string" ? body.note : null;

  const [existing] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, id), eq(approvals.orgId, DEFAULT_ORG_ID)));
  if (!existing) {
    return Response.json({ code: "not_found", detail: "Approval not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return Response.json({ code: "conflict", detail: "Approval already decided" }, { status: 409 });
  }

  const [updated] = await db
    .update(approvals)
    .set({ status: decision, decisionNote: note, decidedAt: new Date() })
    .where(eq(approvals.id, id))
    .returning();

  await appendAuditEvent({
    orgId: DEFAULT_ORG_ID,
    action: `approval.${decision}`,
    entityType: "approval",
    entityId: id,
    metadata: { note },
  });

  return Response.json({ item: updated });
}
