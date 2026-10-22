import { db } from "@/db";
import { approvals, decisions } from "@/db/schema";
import { requireAdmin, requireAuth } from "@/lib/api/auth";
import { ValidationError } from "@/lib/api/pagination";
import { errorResponse, NotFoundError } from "@/lib/api/respond";
import { decideApprovalSchema } from "@/lib/api/schemas";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("id must be a positive integer");
  }
  return id;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(request);
    requireAdmin(auth); // only admins decide approvals (approve/reject)
    const id = parseId((await params).id);
    const body = decideApprovalSchema.parse(await request.json());

    const existingRows = await db
      .select({ id: approvals.id, decisionId: approvals.decisionId })
      .from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.tenantId, auth.tenantId)))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw new NotFoundError("Approval not found");

    const [updated] = await db
      .update(approvals)
      .set({ status: body.status, decidedAt: new Date() })
      .where(and(eq(approvals.id, id), eq(approvals.tenantId, auth.tenantId)))
      .returning();

    if (body.status === "approved") {
      await db
        .update(decisions)
        .set({ status: "approved" })
        .where(
          and(
            eq(decisions.id, existing.decisionId),
            eq(decisions.tenantId, auth.tenantId),
          ),
        );
    } else {
      await db
        .update(decisions)
        .set({ status: "rejected" })
        .where(
          and(
            eq(decisions.id, existing.decisionId),
            eq(decisions.tenantId, auth.tenantId),
          ),
        );
    }

    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
