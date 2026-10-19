import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export const dynamic = "force-dynamic";

const STATUS_VALUES = ["planning", "active", "blocked", "complete"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) {
    return Response.json({ error: "Invalid project id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Partial<typeof projects.$inferInsert> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.domain === "string") updates.domain = body.domain;
  if (body.ownerId === null || typeof body.ownerId === "number") updates.ownerId = body.ownerId;
  if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.targetDate !== undefined)
    updates.targetDate = body.targetDate ? new Date(body.targetDate) : null;
  if (typeof body.status === "string" && (STATUS_VALUES as readonly string[]).includes(body.status)) {
    updates.status = body.status as (typeof STATUS_VALUES)[number];
  }
  if (typeof body.confidence === "number") {
    updates.confidence = Math.max(0, Math.min(100, body.confidence));
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, projectId)).returning();

  if (!updated) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json(updated);
}
