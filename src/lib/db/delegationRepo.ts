import { db } from "@/db";
import {
  authorityRights,
  capacityTwin,
  delegationChecks,
  delegations,
  growthGoals,
  people,
  timeAllocations,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { evaluateDelegation, findStaleDelegations, type DelegationForFollowup } from "@/lib/delegationEngine";
import { audit } from "./autonomyRepo";

export async function listDelegations() {
  return db.select().from(delegations).orderBy(desc(delegations.createdAt));
}

export async function getDelegation(id: string) {
  const rows = await db.select().from(delegations).where(eq(delegations.id, id));
  return rows[0] ?? null;
}

export async function proposeDelegation(input: {
  delegatorId: string;
  delegateId: string;
  task: string;
  actionClassKey: string;
  estimatedHours: number;
  weekOf: string;
  skillTags: string[];
  commitmentId?: string;
}) {
  const [delegateRow] = await db.select().from(people).where(eq(people.id, input.delegateId));
  if (!delegateRow) throw new Error("delegate not found");

  const rules = await db.select().from(authorityRights);
  const [capacityRow] = await db
    .select()
    .from(capacityTwin)
    .where(eq(capacityTwin.personId, input.delegateId));
  const snapshot = capacityRow
    ? { personId: capacityRow.personId, weekOf: capacityRow.weekOf, allocatedHours: capacityRow.allocatedHours, capacityHours: capacityRow.capacityHours }
    : { personId: input.delegateId, weekOf: input.weekOf, allocatedHours: 0, capacityHours: 40 };

  const [goalRow] = await db.select().from(growthGoals).where(eq(growthGoals.personId, input.delegateId));
  const goal = goalRow ? { personId: goalRow.personId, goalLabel: goalRow.goalLabel, relatedSkillTags: goalRow.relatedSkillTags as string[] } : undefined;

  const timeRows = (await db.select().from(timeAllocations).where(eq(timeAllocations.personId, input.delegateId))).map((r) => ({
    personId: r.personId,
    weekOf: r.weekOf,
    category: r.category,
    hours: r.hours,
  }));

  const decision = evaluateDelegation(
    { delegateRole: delegateRow.role, actionClassKey: input.actionClassKey, rules },
    { snapshot, estimatedHours: input.estimatedHours },
    { goal, taskSkillTags: input.skillTags, timeRows, weekOf: input.weekOf },
  );

  const [row] = await db
    .insert(delegations)
    .values({
      delegatorId: input.delegatorId,
      delegateId: input.delegateId,
      commitmentId: input.commitmentId ?? null,
      task: input.task,
      actionClassKey: input.actionClassKey,
      estimatedHours: input.estimatedHours,
      weekOf: input.weekOf,
      skillTags: input.skillTags,
      status: decision.blocked ? "blocked" : "proposed",
    })
    .returning();

  await db.insert(delegationChecks).values([
    { delegationId: row.id, checkType: "authority", passed: decision.authority.passed, explanation: decision.authority },
    { delegationId: row.id, checkType: "capacity", passed: decision.capacity.passed, explanation: decision.capacity },
    { delegationId: row.id, checkType: "growth", passed: decision.growth.passed, explanation: decision.growth },
  ]);

  await audit({
    actorType: "system",
    action: decision.blocked ? "delegation.blocked" : "delegation.proposed",
    entityType: "delegation",
    entityId: row.id,
    details: { blockReasons: decision.blockReasons },
  });

  return { delegation: row, decision };
}

export async function overrideBlockedDelegation(id: string, overriddenBy: string, reason: string) {
  await db.update(delegations).set({ status: "proposed", overriddenBy, overrideReason: reason }).where(eq(delegations.id, id));
  await audit({ actorType: "human", actorId: overriddenBy, action: "delegation.override", entityType: "delegation", entityId: id, details: { reason } });
}

export async function acceptDelegation(id: string) {
  await db.update(delegations).set({ status: "accepted", lastCheckinAt: new Date() }).where(eq(delegations.id, id));
}

export async function checkinDelegation(id: string) {
  await db.update(delegations).set({ lastCheckinAt: new Date() }).where(eq(delegations.id, id));
}

export async function completeDelegation(id: string) {
  await db.update(delegations).set({ status: "completed", lastCheckinAt: new Date() }).where(eq(delegations.id, id));
}

export async function listChecks(delegationId: string) {
  return db.select().from(delegationChecks).where(eq(delegationChecks.delegationId, delegationId));
}

export async function findStale(now: Date, staleDays = 3): Promise<DelegationForFollowup[]> {
  const rows = await db.select().from(delegations).where(eq(delegations.status, "accepted"));
  const mapped: DelegationForFollowup[] = rows.map((r) => ({
    id: r.id,
    delegatorId: r.delegatorId,
    delegateId: r.delegateId,
    task: r.task,
    status: r.status,
    createdAt: r.createdAt,
    lastCheckinAt: r.lastCheckinAt,
  }));
  return findStaleDelegations(mapped, now, staleDays);
}
