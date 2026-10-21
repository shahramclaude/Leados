import { db } from "@/db";
import { approvals } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { findExistingMutation, recordAudit, recordMutation } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [current] = await db.select().from(approvals).where(eq(approvals.id, id));
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Approval not found." }, { status: 404 });
  if (current.status !== "pending") {
    return Response.json(
      { code: "VALIDATION", message: "A decided approval cannot be deleted, only its status changed." },
      { status: 422 },
    );
  }
  await db.delete(approvals).where(eq(approvals.id, id));
  await recordAudit("approval", id, "deleted", "Approval request withdrawn (undo of request)");
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idempotencyKey = request.headers.get("idempotency-key");
  const body = (await request.json()) as {
    status?: "approved" | "rejected" | "changes_requested" | "pending";
    note?: string;
    decidedByName?: string;
    expectedVersion: number;
  };

  if (idempotencyKey) {
    const existing = await findExistingMutation(idempotencyKey);
    if (existing) {
      return Response.json(existing.resultJson, { status: existing.status === "conflict" ? 409 : 200 });
    }
  }

  const [current] = await db.select().from(approvals).where(eq(approvals.id, id));
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Approval not found." }, { status: 404 });

  if (current.version !== body.expectedVersion) {
    if (idempotencyKey) await recordMutation(idempotencyKey, "approval", "conflict", { current });
    return Response.json({ code: "VERSION_CONFLICT", current }, { status: 409 });
  }

  const [updated] = await db
    .update(approvals)
    .set({
      status: body.status ?? current.status,
      note: body.note ?? current.note,
      decidedByName: body.status && body.status !== "pending" ? (body.decidedByName ?? "You") : current.decidedByName,
      version: sql`${approvals.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(approvals.id, id), eq(approvals.version, body.expectedVersion)))
    .returning();

  if (!updated) {
    const [latest] = await db.select().from(approvals).where(eq(approvals.id, id));
    if (idempotencyKey) await recordMutation(idempotencyKey, "approval", "conflict", { current: latest });
    return Response.json({ code: "VERSION_CONFLICT", current: latest }, { status: 409 });
  }

  await recordAudit("approval", updated.id, "status_changed", `Approval ${updated.status}`);
  if (idempotencyKey) await recordMutation(idempotencyKey, "approval", "applied", updated);

  return Response.json(updated);
}
