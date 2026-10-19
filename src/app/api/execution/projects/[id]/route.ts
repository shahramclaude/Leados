import { db } from "@/db";
import { execProjects, execMilestones, execBlockers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, readJsonBody } from "@/lib/api";
import { analyzeProject, type ExecBlocker, type ExecMilestone, type ExecProjectRecord } from "@/lib/executionEngine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) return jsonError("Invalid project id");

  const [projectRow] = await db.select().from(execProjects).where(eq(execProjects.id, projectId)).limit(1);
  if (!projectRow) return jsonError("Project not found", 404);
  const milestoneRows = await db.select().from(execMilestones).where(eq(execMilestones.projectId, projectId));
  const blockerRows = await db.select().from(execBlockers).where(eq(execBlockers.projectId, projectId));

  const project: ExecProjectRecord = { id: projectRow.id, name: projectRow.name, status: projectRow.status, startDate: projectRow.startDate, targetDate: projectRow.targetDate };
  const milestones: ExecMilestone[] = milestoneRows.map((m) => ({ id: m.id, projectId: m.projectId, title: m.title, durationDays: m.durationDays, durationP90Days: m.durationP90Days, dependsOn: (m.dependsOn as number[]) ?? [], dueDate: m.dueDate, status: m.status as ExecMilestone["status"], completedAt: m.completedAt ? m.completedAt.toISOString() : null }));
  const blockers: ExecBlocker[] = blockerRows.map((b) => ({ id: b.id, projectId: b.projectId, milestoneId: b.milestoneId, title: b.title, severity: b.severity as ExecBlocker["severity"], impactDays: b.impactDays, raisedAt: b.raisedAt.toISOString(), resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null }));

  const report = analyzeProject(project, milestones, blockers);
  return Response.json(report);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) return jsonError("Invalid project id");
  const body = await readJsonBody(request);

  const update: Partial<typeof execProjects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.status === "string") update.status = body.status;
  if (typeof body.targetDate === "string") update.targetDate = body.targetDate;
  if (typeof body.description === "string") update.description = body.description;

  const [updated] = await db.update(execProjects).set(update).where(eq(execProjects.id, projectId)).returning();
  if (!updated) return jsonError("Project not found", 404);
  return Response.json(updated);
}
