// Data-access layer for initiatives, milestones, and teams. Converts Drizzle
// rows <-> the plain types used by the pure engine modules
// (initiativesEngine, portfolioMath, alignmentEngine capacity checks).
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  initiativeMilestones,
  initiatives,
  teams,
  type InitiativeStatus,
  type MilestoneStatus,
} from "@/db/schema";
import { newId } from "./ids";
import type { InitiativeNode, MilestoneNode, TeamNode } from "./strategyModels";

function toInitiativeNode(row: typeof initiatives.$inferSelect): InitiativeNode {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    teamId: row.teamId,
    title: row.title,
    status: row.status,
    blockerNote: row.blockerNote,
    budgetAllocated: row.budgetAllocated,
    budgetSpent: row.budgetSpent,
    timeCriticality: row.timeCriticality,
    riskReduction: row.riskReduction,
    userValue: row.userValue,
    jobSize: row.jobSize,
    requiredSkill: row.requiredSkill,
    requiredHoursPerWeek: row.requiredHoursPerWeek,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    targetEndDate: row.targetEndDate ? row.targetEndDate.toISOString() : null,
  };
}

function toMilestoneNode(row: typeof initiativeMilestones.$inferSelect): MilestoneNode {
  return {
    id: row.id,
    initiativeId: row.initiativeId,
    name: row.name,
    sequence: row.sequence,
    dependsOnMilestoneId: row.dependsOnMilestoneId,
    optimisticDays: row.optimisticDays,
    mostLikelyDays: row.mostLikelyDays,
    pessimisticDays: row.pessimisticDays,
    status: row.status,
  };
}

function toTeamNode(row: typeof teams.$inferSelect): TeamNode {
  return {
    id: row.id,
    name: row.name,
    capacityHoursPerWeek: row.capacityHoursPerWeek,
    skills: row.skills,
  };
}

export async function listInitiatives(): Promise<InitiativeNode[]> {
  const rows = await db.select().from(initiatives);
  return rows.map(toInitiativeNode);
}

export async function getInitiative(id: string): Promise<InitiativeNode | null> {
  const rows = await db.select().from(initiatives).where(eq(initiatives.id, id)).limit(1);
  return rows[0] ? toInitiativeNode(rows[0]) : null;
}

export async function listMilestones(initiativeIds?: string[]): Promise<MilestoneNode[]> {
  const rows = initiativeIds && initiativeIds.length > 0
    ? await db.select().from(initiativeMilestones).where(inArray(initiativeMilestones.initiativeId, initiativeIds))
    : await db.select().from(initiativeMilestones);
  return rows.map(toMilestoneNode);
}

export async function listTeams(): Promise<TeamNode[]> {
  const rows = await db.select().from(teams);
  return rows.map(toTeamNode);
}

export interface CreateInitiativeInput {
  objectiveId: string;
  teamId?: string | null;
  title: string;
  description?: string;
  status?: InitiativeStatus;
  blockerNote?: string | null;
  budgetAllocated?: number;
  budgetSpent?: number;
  timeCriticality: number;
  riskReduction: number;
  userValue: number;
  jobSize: number;
  requiredSkill?: string | null;
  requiredHoursPerWeek?: number;
  startDate?: string | null;
  targetEndDate?: string | null;
}

export async function createInitiative(input: CreateInitiativeInput): Promise<InitiativeNode> {
  const id = newId("init");
  const [row] = await db
    .insert(initiatives)
    .values({
      id,
      objectiveId: input.objectiveId,
      teamId: input.teamId ?? null,
      title: input.title,
      description: input.description ?? "",
      status: input.status ?? "planned",
      blockerNote: input.blockerNote ?? null,
      budgetAllocated: input.budgetAllocated ?? 0,
      budgetSpent: input.budgetSpent ?? 0,
      timeCriticality: input.timeCriticality,
      riskReduction: input.riskReduction,
      userValue: input.userValue,
      jobSize: input.jobSize,
      requiredSkill: input.requiredSkill ?? null,
      requiredHoursPerWeek: input.requiredHoursPerWeek ?? 10,
      startDate: input.startDate ? new Date(input.startDate) : null,
      targetEndDate: input.targetEndDate ? new Date(input.targetEndDate) : null,
    })
    .returning();
  return toInitiativeNode(row);
}

export async function updateInitiativeStatus(
  id: string,
  status: InitiativeStatus,
  blockerNote?: string | null,
): Promise<void> {
  await db
    .update(initiatives)
    .set({ status, blockerNote: blockerNote ?? null, updatedAt: new Date() })
    .where(eq(initiatives.id, id));
}

export async function deleteInitiative(id: string): Promise<void> {
  await db.delete(initiatives).where(eq(initiatives.id, id));
}

export interface CreateMilestoneInput {
  initiativeId: string;
  name: string;
  sequence?: number;
  dependsOnMilestoneId?: string | null;
  optimisticDays: number;
  mostLikelyDays: number;
  pessimisticDays: number;
  status?: MilestoneStatus;
}

export async function createMilestone(input: CreateMilestoneInput): Promise<MilestoneNode> {
  const id = newId("ms");
  const [row] = await db
    .insert(initiativeMilestones)
    .values({
      id,
      initiativeId: input.initiativeId,
      name: input.name,
      sequence: input.sequence ?? 0,
      dependsOnMilestoneId: input.dependsOnMilestoneId ?? null,
      optimisticDays: input.optimisticDays,
      mostLikelyDays: input.mostLikelyDays,
      pessimisticDays: input.pessimisticDays,
      status: input.status ?? "planned",
    })
    .returning();
  return toMilestoneNode(row);
}

export async function createTeam(input: { name: string; capacityHoursPerWeek?: number; skills?: string[] }): Promise<TeamNode> {
  const id = newId("team");
  const [row] = await db
    .insert(teams)
    .values({
      id,
      name: input.name,
      capacityHoursPerWeek: input.capacityHoursPerWeek ?? 40,
      skills: input.skills ?? [],
    })
    .returning();
  return toTeamNode(row);
}
