// Part 28 — DB access layer. Converts between DB rows and the pipeline's
// DB-agnostic RawEvent/ProcessDefinition shapes.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationProposals,
  metricSnapshots,
  processDefinitions,
  processEvents,
  processRoster,
} from "@/db/schema";
import type { AutomationScore, ProcessDefinition, RawEvent } from "./types";

export async function getEventsForProcess(processName: string): Promise<RawEvent[]> {
  const rows = await db
    .select()
    .from(processEvents)
    .where(eq(processEvents.processName, processName))
    .orderBy(processEvents.occurredAt);

  return rows.map(rowToRawEvent);
}

export async function listDistinctProcessNames(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ processName: processEvents.processName })
    .from(processEvents);
  return rows.map((r) => r.processName).sort();
}

function rowToRawEvent(row: typeof processEvents.$inferSelect): RawEvent {
  return {
    eventId: row.eventId,
    caseId: row.caseId,
    correlationId: row.correlationId,
    processName: row.processName,
    activity: row.activity,
    resourceId: row.resourceId,
    occurredAt: new Date(row.occurredAt),
    durationMs: row.durationMs,
    status: row.status,
    attributes: (row.attributes as Record<string, unknown>) ?? {},
  };
}

export async function insertEvents(events: RawEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK).map((e) => ({
      eventId: e.eventId,
      caseId: e.caseId,
      correlationId: e.correlationId,
      processName: e.processName,
      activity: e.activity,
      resourceId: e.resourceId,
      occurredAt: e.occurredAt,
      durationMs: e.durationMs,
      status: e.status,
      attributes: e.attributes,
    }));
    await db.insert(processEvents).values(chunk).onConflictDoNothing();
    inserted += chunk.length;
  }
  return inserted;
}

export async function getDeclaredDefinition(processName: string): Promise<ProcessDefinition | null> {
  const rows = await db
    .select()
    .from(processDefinitions)
    .where(eq(processDefinitions.processName, processName))
    .orderBy(processDefinitions.version);
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  return {
    processName: latest.processName,
    version: latest.version,
    steps: latest.steps as ProcessDefinition["steps"],
  };
}

export async function upsertDeclaredDefinition(definition: ProcessDefinition): Promise<void> {
  const existing = await db
    .select()
    .from(processDefinitions)
    .where(
      and(eq(processDefinitions.processName, definition.processName), eq(processDefinitions.version, definition.version)),
    );
  if (existing.length > 0) return;
  await db.insert(processDefinitions).values({
    processName: definition.processName,
    version: definition.version,
    steps: definition.steps,
  });
}

export async function upsertRoster(entries: { resourceId: string; displayName: string; team: string }[]): Promise<void> {
  for (const entry of entries) {
    await db
      .insert(processRoster)
      .values({ resourceId: entry.resourceId, displayName: entry.displayName, team: entry.team })
      .onConflictDoNothing();
  }
}

export async function saveAutomationProposal(score: AutomationScore): Promise<number> {
  const [row] = await db
    .insert(automationProposals)
    .values({
      processName: score.processName,
      activity: score.activity,
      score: score.score.value.toFixed(4),
      explain: { score: score.score, roi: score.roi },
      status: "draft",
    })
    .returning({ id: automationProposals.id });
  return row.id;
}

export async function listAutomationProposals(processName?: string) {
  if (processName) {
    return db.select().from(automationProposals).where(eq(automationProposals.processName, processName));
  }
  return db.select().from(automationProposals);
}

export async function saveMetricSnapshot(input: {
  processName: string;
  metric: string;
  periodStart: Date;
  periodEnd: Date;
  value: number;
  sampleSize: number;
}): Promise<void> {
  await db.insert(metricSnapshots).values({
    processName: input.processName,
    metric: input.metric,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    value: input.value.toFixed(4),
    sampleSize: input.sampleSize,
  });
}
