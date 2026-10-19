// src/lib/repositories/executionRepository.ts — typed reads/writes-via-
// events over the execution_* projections (projects/milestones/blockers).
import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { blockersProjection, milestonesProjection, projectsProjection } from "@/db/schema";

export type ProjectRow = typeof projectsProjection.$inferSelect;
export type MilestoneRow = typeof milestonesProjection.$inferSelect;
export type BlockerRow = typeof blockersProjection.$inferSelect;

export async function listProjects(params: { status?: string; limit?: number } = {}): Promise<ProjectRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  if (params.status) {
    return db.select().from(projectsProjection).where(eq(projectsProjection.status, params.status)).limit(limit);
  }
  return db.select().from(projectsProjection).orderBy(desc(projectsProjection.updatedAt)).limit(limit);
}

export async function getProjectById(id: string): Promise<ProjectRow | null> {
  const [row] = await db.select().from(projectsProjection).where(eq(projectsProjection.id, id)).limit(1);
  return row ?? null;
}

export async function listMilestonesForProject(projectId: string): Promise<MilestoneRow[]> {
  return db.select().from(milestonesProjection).where(eq(milestonesProjection.projectId, projectId));
}

export async function listOpenBlockers(limit = 50): Promise<BlockerRow[]> {
  return db
    .select()
    .from(blockersProjection)
    .where(eq(blockersProjection.resolved, false))
    .orderBy(desc(blockersProjection.raisedAt))
    .limit(limit);
}

export async function executionKpis(): Promise<{
  activeProjects: number;
  blockedProjects: number;
  openBlockers: number;
  overdueMilestones: number;
}> {
  const [active, blocked, blockers, overdueMilestones] = await Promise.all([
    db.select({ id: projectsProjection.id }).from(projectsProjection).where(ne(projectsProjection.status, "done")),
    db.select({ id: projectsProjection.id }).from(projectsProjection).where(eq(projectsProjection.status, "blocked")),
    db.select({ id: blockersProjection.id }).from(blockersProjection).where(eq(blockersProjection.resolved, false)),
    db.select({ id: milestonesProjection.id }).from(milestonesProjection).where(eq(milestonesProjection.overdue, true)),
  ]);
  return {
    activeProjects: active.length,
    blockedProjects: blocked.length,
    openBlockers: blockers.length,
    overdueMilestones: overdueMilestones.length,
  };
}
