import { db } from "@/db";
import { execMilestones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, readJsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const milestoneId = Number(id);
  if (!Number.isFinite(milestoneId)) return jsonError("Invalid milestone id");
  const [row] = await db.select().from(execMilestones).where(eq(execMilestones.id, milestoneId)).limit(1);
  if (!row) return jsonError("Milestone not found", 404);
  return Response.json(row);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const milestoneId = Number(id);
  if (!Number.isFinite(milestoneId)) return jsonError("Invalid milestone id");
  const body = await readJsonBody(request);

  const update: Partial<typeof execMilestones.$inferInsert> = {};
  if (typeof body.title === "string") update.title = body.title;
  if (typeof body.status === "string") {
    update.status = body.status;
    if (body.status === "done") update.completedAt = new Date();
  }
  if (body.durationDays != null) update.durationDays = Number(body.durationDays);
  if (typeof body.dueDate === "string") update.dueDate = body.dueDate;
  if (Array.isArray(body.dependsOn)) update.dependsOn = body.dependsOn;

  const [updated] = await db.update(execMilestones).set(update).where(eq(execMilestones.id, milestoneId)).returning();
  if (!updated) return jsonError("Milestone not found", 404);
  return Response.json(updated);
}
