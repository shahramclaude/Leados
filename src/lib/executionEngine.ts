// C. Execution orchestration: turns raw milestone/blocker rows into a derived
// project status and progress percentage. This is what OKR cascade reconciles
// against self-reported key-result status (see okr.ts).
import { db } from "@/db";
import { execProjects, execMilestones, execBlockers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { num } from "@/lib/format";
import { criticalPathToday } from "@/lib/delivery";

export type DerivedProjectStatus = "on_track" | "at_risk" | "blocked" | "done";

export async function projectProgress(projectId: number) {
  const [project] = await db.select().from(execProjects).where(eq(execProjects.id, projectId));
  const milestones = await db.select().from(execMilestones).where(eq(execMilestones.projectId, projectId));
  const blockers = await db.select().from(execBlockers).where(eq(execBlockers.projectId, projectId));
  if (!project) return null;

  const total = milestones.length || 1;
  const done = milestones.filter((m) => m.status === "done").length;
  const percentComplete = done / total;

  const openBlockers = blockers.filter((b) => !b.resolvedAt);
  const lateMilestones = milestones.filter((m) => m.actualDate && new Date(m.actualDate) > new Date(m.plannedDate));

  const cpm = await criticalPathToday(projectId);
  const dueDays = (new Date(project.dueDate).getTime() - new Date(project.startDate).getTime()) / 86400000;
  const scheduleGapDays = cpm.finish - dueDays; // positive = projected to run past due date on current critical path

  let derivedStatus: DerivedProjectStatus;
  if (percentComplete >= 1) derivedStatus = "done";
  else if (openBlockers.some((b) => num(b.impactDays) >= 5)) derivedStatus = "blocked";
  else if (scheduleGapDays > 5 || lateMilestones.length > 0) derivedStatus = "at_risk";
  else derivedStatus = "on_track";

  return {
    project,
    percentComplete,
    derivedStatus,
    openBlockerCount: openBlockers.length,
    lateMilestoneCount: lateMilestones.length,
    scheduleGapDays,
    criticalPath: cpm.criticalPath,
  };
}

export async function allProjectStatuses() {
  const projects = await db.select().from(execProjects);
  const results = await Promise.all(projects.map((p) => projectProgress(p.id)));
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}
