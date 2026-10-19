import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blockers } from "@/db/schema";

export const dynamic = "force-dynamic";

// PATCH resolves a blocker by stamping resolved_at. Other editable fields
// (assignedTo, severity) may also be passed through.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blockerId = Number(id);
  if (!Number.isInteger(blockerId)) {
    return Response.json({ error: "Invalid blocker id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  const updates: Partial<typeof blockers.$inferInsert> = {};
  if (body?.resolved === true) {
    updates.resolvedAt = new Date();
  } else if (body?.resolved === false) {
    updates.resolvedAt = null;
  }
  if (typeof body?.assignedTo === "number") updates.assignedTo = body.assignedTo;
  if (typeof body?.severity === "number") {
    updates.severity = Math.max(1, Math.min(5, Math.round(body.severity)));
  }

  if (Object.keys(updates).length === 0) {
    // Default behaviour: PATCH with no recognizable fields resolves the blocker.
    updates.resolvedAt = new Date();
  }

  const [updated] = await db
    .update(blockers)
    .set(updates)
    .where(eq(blockers.id, blockerId))
    .returning();

  if (!updated) {
    return Response.json({ error: "Blocker not found" }, { status: 404 });
  }

  return Response.json(updated);
}
