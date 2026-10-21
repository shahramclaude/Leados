// Part 09-D: growth plans with milestones tied to skill evidence.

import { db } from "@/db";
import { growthPlans, personSkills, skills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import { type Actor, isSelf, isManagerOf, isHr, assertAccess } from "./accessControl";
import { people } from "@/db/schema";

export interface Milestone {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "done";
  evidenceEventIds: string[];
}

async function assertCanEditPlan(actor: Actor, personId: string) {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) throw new Error("Person not found");
  assertAccess(
    isSelf(actor, personId) || isManagerOf(actor, person.managerId) || isHr(actor),
    `actor ${actor.id} may not edit growth plans for ${personId}`,
  );
}

export async function createGrowthPlan(
  actor: Actor,
  personId: string,
  title: string,
  targetSkillId: string | null,
  milestones: Omit<Milestone, "evidenceEventIds">[],
) {
  await assertCanEditPlan(actor, personId);
  const id = newId("gp");
  const seeded: Milestone[] = milestones.map((m) => ({ ...m, evidenceEventIds: [] }));
  await db.insert(growthPlans).values({
    id,
    personId,
    title,
    targetSkillId,
    milestonesJson: seeded,
  });
  await appendEvent({
    type: "GROWTH_PLAN_CREATED",
    entityType: "growthPlan",
    entityId: id,
    actorId: actor.id,
    payload: { personId, title },
  });
  // Also index under the person for the timeline.
  await appendEvent({
    type: "GROWTH_PLAN_CREATED",
    entityType: "person",
    entityId: personId,
    actorId: actor.id,
    payload: { growthPlanId: id, title },
  });
  return id;
}

export async function updateMilestone(
  actor: Actor,
  planId: string,
  milestoneId: string,
  status: Milestone["status"],
  evidenceEventIds: string[] = [],
) {
  const [plan] = await db.select().from(growthPlans).where(eq(growthPlans.id, planId)).limit(1);
  if (!plan) throw new Error("Growth plan not found");
  await assertCanEditPlan(actor, plan.personId);

  const milestones = (plan.milestonesJson as Milestone[]).map((m) =>
    m.id === milestoneId
      ? { ...m, status, evidenceEventIds: [...new Set([...m.evidenceEventIds, ...evidenceEventIds])] }
      : m,
  );
  await db.update(growthPlans).set({ milestonesJson: milestones, updatedAt: new Date() }).where(eq(growthPlans.id, planId));

  // Milestone completion backed by skill evidence is how "done" is earned —
  // if the milestone targets a skill, bump observed skill evidence.
  if (status === "done" && plan.targetSkillId) {
    const [existing] = await db
      .select()
      .from(personSkills)
      .where(eq(personSkills.personId, plan.personId))
      .limit(1);
    const evId = await appendEvent({
      type: "SKILL_OBSERVED",
      entityType: "person",
      entityId: plan.personId,
      actorId: actor.id,
      payload: { skillId: plan.targetSkillId, growthPlanId: planId },
    });
    const [skill] = await db.select().from(skills).where(eq(skills.id, plan.targetSkillId)).limit(1);
    if (skill) {
      const currentLevel = existing?.level ?? 0;
      await db.insert(personSkills).values({
        id: newId("psk"),
        personId: plan.personId,
        skillId: plan.targetSkillId,
        level: Math.min(5, currentLevel + 1),
        source: "observed",
        evidenceEventIds: [evId],
      });
    }
  }

  await appendEvent({
    type: "GROWTH_PLAN_MILESTONE_UPDATED",
    entityType: "person",
    entityId: plan.personId,
    actorId: actor.id,
    payload: { planId, milestoneId, status },
  });
}

export async function listGrowthPlans(actor: Actor, personId: string) {
  await assertCanEditPlan(actor, personId); // same visibility rule as editing: self/manager/HR
  return db.select().from(growthPlans).where(eq(growthPlans.personId, personId));
}
