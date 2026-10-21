import { db } from "@/db";
import { findings } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { findExistingMutation, recordAudit, recordMutation } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deleted] = await db.delete(findings).where(eq(findings.id, id)).returning();
  if (!deleted) return Response.json({ code: "NOT_FOUND", message: "Finding not found." }, { status: 404 });
  await recordAudit("finding", id, "deleted", `Finding "${deleted.title}" removed (undo of create)`);
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idempotencyKey = request.headers.get("idempotency-key");
  const body = (await request.json()) as {
    title?: string;
    body?: string;
    confidence?: string;
    expectedVersion: number;
  };

  if (idempotencyKey) {
    const existing = await findExistingMutation(idempotencyKey);
    if (existing) {
      return Response.json(existing.resultJson, { status: existing.status === "conflict" ? 409 : 200 });
    }
  }

  const [current] = await db.select().from(findings).where(eq(findings.id, id));
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Finding not found." }, { status: 404 });

  if (current.version !== body.expectedVersion) {
    if (idempotencyKey) await recordMutation(idempotencyKey, "finding", "conflict", { current });
    return Response.json({ code: "VERSION_CONFLICT", current }, { status: 409 });
  }

  const [updated] = await db
    .update(findings)
    .set({
      title: body.title ?? current.title,
      body: body.body ?? current.body,
      confidence: body.confidence ?? current.confidence,
      version: sql`${findings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(findings.id, id), eq(findings.version, body.expectedVersion)))
    .returning();

  if (!updated) {
    const [latest] = await db.select().from(findings).where(eq(findings.id, id));
    if (idempotencyKey) await recordMutation(idempotencyKey, "finding", "conflict", { current: latest });
    return Response.json({ code: "VERSION_CONFLICT", current: latest }, { status: 409 });
  }

  await recordAudit("finding", updated.id, "updated", `Finding "${updated.title}" updated`);
  if (idempotencyKey) await recordMutation(idempotencyKey, "finding", "applied", updated);

  return Response.json(updated);
}
