import { db } from "@/db";
import { growthMilestones, growthPlans } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { GrowthMilestone, GrowthPlan } from "../../domain/types";

type PlanRow = typeof growthPlans.$inferSelect;
type MilestoneRow = typeof growthMilestones.$inferSelect;

function milestoneToDomain(row: MilestoneRow): GrowthMilestone {
  return {
    id: row.id,
    planId: row.planId,
    title: row.title,
    skill: row.skill,
    targetDate: row.targetDate ? String(row.targetDate) : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    evidence: (row.evidence as string[]) ?? [],
  };
}

async function hydratePlan(row: PlanRow): Promise<GrowthPlan> {
  const milestoneRows = await db
    .select()
    .from(growthMilestones)
    .where(eq(growthMilestones.planId, row.id));
  return {
    id: row.id,
    personId: row.personId,
    title: row.title,
    status: row.status as GrowthPlan["status"],
    milestones: milestoneRows.map(milestoneToDomain),
  };
}

export const growthRepository = {
  async listForPerson(personId: number): Promise<GrowthPlan[]> {
    const rows = await db.select().from(growthPlans).where(eq(growthPlans.personId, personId));
    return Promise.all(rows.map(hydratePlan));
  },

  async createPlan(input: { personId: number; title: string }): Promise<GrowthPlan> {
    const [row] = await db
      .insert(growthPlans)
      .values({ personId: input.personId, title: input.title })
      .returning();
    return hydratePlan(row);
  },

  async addMilestone(input: {
    planId: number;
    title: string;
    skill: string;
    targetDate?: string | null;
  }): Promise<GrowthMilestone> {
    const [row] = await db
      .insert(growthMilestones)
      .values({
        planId: input.planId,
        title: input.title,
        skill: input.skill,
        targetDate: input.targetDate ?? null,
        evidence: [],
      })
      .returning();
    return milestoneToDomain(row);
  },

  async completeMilestone(milestoneId: number, evidence: string): Promise<GrowthMilestone | null> {
    const [existing] = await db
      .select()
      .from(growthMilestones)
      .where(eq(growthMilestones.id, milestoneId))
      .limit(1);
    if (!existing) return null;
    const nextEvidence = [...((existing.evidence as string[]) ?? []), evidence];
    const [row] = await db
      .update(growthMilestones)
      .set({ completedAt: new Date(), evidence: nextEvidence })
      .where(eq(growthMilestones.id, milestoneId))
      .returning();
    return row ? milestoneToDomain(row) : null;
  },
};
