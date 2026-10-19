import { db } from "@/db";
import { execBlockers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, readJsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blockerId = Number(id);
  if (!Number.isFinite(blockerId)) return jsonError("Invalid blocker id");
  const [row] = await db.select().from(execBlockers).where(eq(execBlockers.id, blockerId)).limit(1);
  if (!row) return jsonError("Blocker not found", 404);
  return Response.json(row);
}

// PATCH { action: "resolve" } to resolve a blocker.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blockerId = Number(id);
  if (!Number.isFinite(blockerId)) return jsonError("Invalid blocker id");
  const body = await readJsonBody(request);

  const update: Partial<typeof execBlockers.$inferInsert> = {};
  if (body.action === "resolve") update.resolvedAt = new Date();
  if (typeof body.severity === "string") update.severity = body.severity;
  if (body.impactDays != null) update.impactDays = Number(body.impactDays);

  const [updated] = await db.update(execBlockers).set(update).where(eq(execBlockers.id, blockerId)).returning();
  if (!updated) return jsonError("Blocker not found", 404);
  return Response.json(updated);
}
