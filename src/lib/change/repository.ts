import { db } from "@/db";
import { changeGroups, people, changePrograms, changeInterventions, changeEvents, interventionResults } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { ChangeProgram, Intervention } from "./types";
import { SEED_GROUPS, SEED_PROGRAMS, SEED_INTERVENTIONS, buildSeedPeople, buildSeedEvents } from "./seed";
import type { ChangeEventRecord } from "./adoptionProxies";
import type { InterventionResultRecord } from "./interventionEffect";

/**
 * All DB access for the change/transformation domain lives here. This is the
 * single seam where individual-level rows (`people`, `change_events`) could
 * leak if a caller queried them directly — every read used by an API route
 * goes through the group-roster / group-events helpers below, which return
 * only what the aggregation layer needs (ids for counting, never names).
 */

export async function seedDatabase(now: Date = new Date()): Promise<{ groups: number; people: number; programs: number; events: number; interventions: number }> {
  await db.execute(sql`truncate table ${changeEvents}`);
  await db.execute(sql`truncate table ${interventionResults}`);
  await db.execute(sql`truncate table ${changeInterventions}`);
  await db.execute(sql`truncate table ${changePrograms}`);
  await db.execute(sql`truncate table ${people}`);
  await db.execute(sql`truncate table ${changeGroups}`);

  await db.insert(changeGroups).values(
    SEED_GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      department: g.department,
      headcount: g.headcount,
      capacityHeadroom: g.capacityHeadroom.toFixed(3),
    }))
  );

  const seedPeople = buildSeedPeople();
  await db.insert(people).values(
    seedPeople.map((p) => ({
      id: p.id,
      groupId: p.groupId,
      trainingCompletionPct: p.trainingCompletionPct.toFixed(2),
    }))
  );

  await db.insert(changePrograms).values(
    SEED_PROGRAMS.map((p) => ({
      id: p.id,
      intent: p.intent,
      targetBehaviors: p.targetBehaviors,
      affectedGroupIds: p.affectedGroups,
      resistanceMap: p.resistanceMap,
      status: p.status,
      startDate: new Date(p.startDate),
      loadWeight: p.loadWeight.toFixed(2),
    }))
  );

  await db.insert(changeInterventions).values(
    SEED_INTERVENTIONS.map((i) => ({
      id: i.id,
      programId: i.programId,
      kind: i.kind,
      cost: i.cost.toFixed(2),
      expectedEffectJson: i.expectedEffect,
      rolloutDesignJson: i.rolloutDesign ?? null,
      status: i.status,
      startDate: new Date(i.startDate),
    }))
  );

  const events = buildSeedEvents(seedPeople, now);
  const batchSize = 500;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    await db.insert(changeEvents).values(
      batch.map((e) => ({
        programId: e.programId,
        groupId: e.groupId,
        personId: e.personId,
        proxyEventType: e.proxyEventType,
        periodIndex: e.periodIndex,
        occurredAt: e.occurredAt,
        metadata: null,
      }))
    );
  }

  return {
    groups: SEED_GROUPS.length,
    people: seedPeople.length,
    programs: SEED_PROGRAMS.length,
    events: events.length,
    interventions: SEED_INTERVENTIONS.length,
  };
}

export interface GroupRow {
  id: string;
  name: string;
  department: string;
  headcount: number;
  capacityHeadroom: number;
}

export async function listGroups(): Promise<GroupRow[]> {
  const rows = await db.select().from(changeGroups);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    department: r.department,
    headcount: r.headcount,
    capacityHeadroom: Number(r.capacityHeadroom),
  }));
}

/** Returns only person ids for a group's roster — never names/emails. */
export async function getGroupRosterIds(groupId: string): Promise<string[]> {
  const rows = await db.select({ id: people.id }).from(people).where(eq(people.groupId, groupId));
  return rows.map((r) => r.id);
}

export async function getGroupTrainingCompletionRate(groupId: string): Promise<{ rate: number; n: number }> {
  const rows = await db
    .select({ pct: people.trainingCompletionPct })
    .from(people)
    .where(eq(people.groupId, groupId));
  if (rows.length === 0) return { rate: 0, n: 0 };
  const avg = rows.reduce((sum, r) => sum + Number(r.pct), 0) / rows.length / 100;
  return { rate: avg, n: rows.length };
}

function parseProgram(row: typeof changePrograms.$inferSelect): ChangeProgram {
  return {
    id: row.id,
    intent: row.intent,
    targetBehaviors: row.targetBehaviors as ChangeProgram["targetBehaviors"],
    affectedGroups: row.affectedGroupIds as string[],
    resistanceMap: row.resistanceMap as ChangeProgram["resistanceMap"],
    status: row.status as ChangeProgram["status"],
    startDate: new Date(row.startDate).toISOString().slice(0, 10),
    loadWeight: Number(row.loadWeight),
  };
}

export async function listPrograms(): Promise<ChangeProgram[]> {
  const rows = await db.select().from(changePrograms);
  return rows.map(parseProgram);
}

export async function getProgram(programId: string): Promise<ChangeProgram | null> {
  const rows = await db.select().from(changePrograms).where(eq(changePrograms.id, programId));
  return rows[0] ? parseProgram(rows[0]) : null;
}

function parseIntervention(row: typeof changeInterventions.$inferSelect): Intervention {
  return {
    id: row.id,
    programId: row.programId,
    kind: row.kind,
    cost: Number(row.cost),
    expectedEffect: row.expectedEffectJson as Intervention["expectedEffect"],
    rolloutDesign: (row.rolloutDesignJson as Intervention["rolloutDesign"]) ?? undefined,
    status: row.status as Intervention["status"],
    startDate: new Date(row.startDate).toISOString().slice(0, 10),
  };
}

export async function listInterventions(programId?: string): Promise<Intervention[]> {
  const rows = programId
    ? await db.select().from(changeInterventions).where(eq(changeInterventions.programId, programId))
    : await db.select().from(changeInterventions);
  return rows.map(parseIntervention);
}

export async function saveInterventionRolloutDesign(interventionId: string, design: Intervention["rolloutDesign"]): Promise<void> {
  await db.update(changeInterventions).set({ rolloutDesignJson: design }).where(eq(changeInterventions.id, interventionId));
}

export async function createIntervention(intervention: Intervention, designIdentification: string): Promise<void> {
  await db.insert(changeInterventions).values({
    id: intervention.id,
    programId: intervention.programId,
    kind: intervention.kind,
    cost: intervention.cost.toFixed(2),
    expectedEffectJson: intervention.expectedEffect,
    rolloutDesignJson: intervention.rolloutDesign ?? null,
    designIdentification,
    status: intervention.status,
    startDate: new Date(intervention.startDate),
  });
}

export async function getIntervention(interventionId: string): Promise<(Intervention & { designIdentification: string }) | null> {
  const rows = await db.select().from(changeInterventions).where(eq(changeInterventions.id, interventionId));
  if (!rows[0]) return null;
  return { ...parseIntervention(rows[0]), designIdentification: rows[0].designIdentification };
}

/** Raw events for a set of groups/program — internal aggregation input only, never returned as-is via an API. */
export async function getEventsForGroups(groupIds: readonly string[]): Promise<ChangeEventRecord[]> {
  if (groupIds.length === 0) return [];
  const rows = await db.select().from(changeEvents).where(inArray(changeEvents.groupId, groupIds as string[]));
  return rows.map((r) => ({
    personId: r.personId,
    groupId: r.groupId,
    proxyEventType: r.proxyEventType,
    occurredAt: new Date(r.occurredAt),
    periodIndex: r.periodIndex,
  }));
}

export async function getEventsForProgram(programId: string): Promise<ChangeEventRecord[]> {
  const rows = await db.select().from(changeEvents).where(eq(changeEvents.programId, programId));
  return rows.map((r) => ({
    personId: r.personId,
    groupId: r.groupId,
    proxyEventType: r.proxyEventType,
    occurredAt: new Date(r.occurredAt),
    periodIndex: r.periodIndex,
  }));
}

export async function saveInterventionResult(record: InterventionResultRecord, method: string): Promise<void> {
  await db.insert(interventionResults).values({
    id: `${record.interventionId}-${Date.now()}`,
    interventionId: record.interventionId,
    estimateJson: record,
    method,
    surprise: record.surprise.toFixed(4),
    withinExpectedBounds: record.withinExpectedBounds,
  });
}

export async function listInterventionResults(interventionId: string) {
  const rows = await db.select().from(interventionResults).where(eq(interventionResults.interventionId, interventionId));
  return rows;
}
