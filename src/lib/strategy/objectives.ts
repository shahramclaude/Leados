// Data-access layer for objectives, alignment links, key results, and
// evidence refs. Converts Drizzle rows <-> the plain types used by the pure
// engine modules (alignmentEngine, okrsEngine, driftRadar, northStar).
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  evidenceRefs,
  keyResults,
  objectiveLinks,
  objectives,
  type ConfidenceClass,
  type KeyResultDirection,
  type KeyResultProgressMode,
  type ObjectiveLevel,
  type ObjectiveLinkType,
  type ObjectiveStatus,
} from "@/db/schema";
import { newId } from "./ids";
import type {
  EvidenceRefInput,
  KeyResultInput,
  ObjectiveLinkEdge,
  ObjectiveNode,
} from "./strategyModels";

function toObjectiveNode(row: typeof objectives.$inferSelect): ObjectiveNode {
  return {
    id: row.id,
    title: row.title,
    level: row.level,
    timeframe: row.timeframe,
    ownerName: row.ownerName,
    status: row.status,
    stretch: row.stretch,
    isNorthStarAligned: row.isNorthStarAligned,
    parentId: row.parentId,
    priorityRank: row.priorityRank,
  };
}

function toLinkEdge(row: typeof objectiveLinks.$inferSelect): ObjectiveLinkEdge {
  return {
    id: row.id,
    fromObjectiveId: row.fromObjectiveId,
    toObjectiveId: row.toObjectiveId,
    linkType: row.linkType,
  };
}

function toKeyResultInput(row: typeof keyResults.$inferSelect): KeyResultInput {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    title: row.title,
    baseline: row.baseline,
    target: row.target,
    current: row.current,
    unit: row.unit,
    direction: row.direction,
    progressMode: row.progressMode,
    weight: row.weight,
    stretch: row.stretch,
    confidenceClass: row.confidenceClass,
    milestonesTotal: row.milestonesTotal,
    milestonesComplete: row.milestonesComplete,
    thresholdValue: row.thresholdValue,
  };
}

function toEvidenceInput(row: typeof evidenceRefs.$inferSelect): EvidenceRefInput {
  return {
    id: row.id,
    keyResultId: row.keyResultId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    value: row.value,
    observedAt: row.observedAt.toISOString(),
    note: row.note,
  };
}

export async function listObjectives(): Promise<ObjectiveNode[]> {
  const rows = await db.select().from(objectives);
  return rows.map(toObjectiveNode);
}

export async function getObjective(id: string): Promise<ObjectiveNode | null> {
  const rows = await db.select().from(objectives).where(eq(objectives.id, id)).limit(1);
  return rows[0] ? toObjectiveNode(rows[0]) : null;
}

export async function listObjectiveLinks(): Promise<ObjectiveLinkEdge[]> {
  const rows = await db.select().from(objectiveLinks);
  return rows.map(toLinkEdge);
}

export async function listKeyResults(objectiveIds?: string[]): Promise<KeyResultInput[]> {
  const rows = objectiveIds && objectiveIds.length > 0
    ? await db.select().from(keyResults).where(inArray(keyResults.objectiveId, objectiveIds))
    : await db.select().from(keyResults);
  return rows.map(toKeyResultInput);
}

export async function listEvidenceRefs(keyResultIds?: string[]): Promise<EvidenceRefInput[]> {
  const rows = keyResultIds && keyResultIds.length > 0
    ? await db.select().from(evidenceRefs).where(inArray(evidenceRefs.keyResultId, keyResultIds))
    : await db.select().from(evidenceRefs);
  return rows.map(toEvidenceInput);
}

export interface CreateObjectiveInput {
  title: string;
  description?: string;
  level: ObjectiveLevel;
  timeframe: string;
  ownerName: string;
  status?: ObjectiveStatus;
  stretch?: boolean;
  isNorthStarAligned?: boolean;
  parentId?: string | null;
  priorityRank?: number;
}

export async function createObjective(input: CreateObjectiveInput): Promise<ObjectiveNode> {
  const id = newId("obj");
  const [row] = await db
    .insert(objectives)
    .values({
      id,
      title: input.title,
      description: input.description ?? "",
      level: input.level,
      timeframe: input.timeframe,
      ownerName: input.ownerName,
      status: input.status ?? "active",
      stretch: input.stretch ?? false,
      isNorthStarAligned: input.isNorthStarAligned ?? false,
      parentId: input.parentId ?? null,
      priorityRank: input.priorityRank ?? 100,
    })
    .returning();
  return toObjectiveNode(row);
}

export async function createObjectiveLink(
  fromObjectiveId: string,
  toObjectiveId: string,
  linkType: ObjectiveLinkType,
): Promise<ObjectiveLinkEdge> {
  const id = newId("link");
  const [row] = await db
    .insert(objectiveLinks)
    .values({ id, fromObjectiveId, toObjectiveId, linkType })
    .returning();
  return toLinkEdge(row);
}

export interface CreateKeyResultInput {
  objectiveId: string;
  title: string;
  baseline?: number;
  target: number;
  current?: number;
  unit?: string;
  direction?: KeyResultDirection;
  progressMode?: KeyResultProgressMode;
  weight?: number;
  stretch?: boolean;
  confidenceClass?: ConfidenceClass | null;
  milestonesTotal?: number | null;
  milestonesComplete?: number | null;
  thresholdValue?: number | null;
}

export async function createKeyResult(input: CreateKeyResultInput): Promise<KeyResultInput> {
  const id = newId("kr");
  const [row] = await db
    .insert(keyResults)
    .values({
      id,
      objectiveId: input.objectiveId,
      title: input.title,
      baseline: input.baseline ?? 0,
      target: input.target,
      current: input.current ?? 0,
      unit: input.unit ?? "",
      direction: input.direction ?? "up",
      progressMode: input.progressMode ?? "linear",
      weight: input.weight ?? 1,
      stretch: input.stretch ?? false,
      confidenceClass: input.confidenceClass ?? null,
      milestonesTotal: input.milestonesTotal ?? null,
      milestonesComplete: input.milestonesComplete ?? null,
      thresholdValue: input.thresholdValue ?? null,
    })
    .returning();
  return toKeyResultInput(row);
}

export async function addEvidenceRef(input: {
  keyResultId: string;
  sourceType: EvidenceRefInput["sourceType"];
  sourceId?: string | null;
  value: number;
  observedAt?: string;
  note?: string | null;
}): Promise<EvidenceRefInput> {
  const id = newId("ev");
  const [row] = await db
    .insert(evidenceRefs)
    .values({
      id,
      keyResultId: input.keyResultId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      value: input.value,
      observedAt: input.observedAt ? new Date(input.observedAt) : new Date(),
      note: input.note ?? null,
    })
    .returning();
  return toEvidenceInput(row);
}

export async function updateObjectiveStatus(id: string, status: ObjectiveStatus): Promise<void> {
  await db.update(objectives).set({ status, updatedAt: new Date() }).where(eq(objectives.id, id));
}

export async function deleteObjective(id: string): Promise<void> {
  await db.delete(objectives).where(eq(objectives.id, id));
}

export async function listKeyResultsAndEvidenceForObjectives(
  objectiveIds: string[],
): Promise<{ keyResults: KeyResultInput[]; evidence: EvidenceRefInput[] }> {
  const krs = await listKeyResults(objectiveIds);
  const evidence = await listEvidenceRefs(krs.map((k) => k.id));
  return { keyResults: krs, evidence };
}

// Re-exported so API routes can filter on link type without importing schema types directly.
export async function listLinksByType(linkType: ObjectiveLinkType): Promise<ObjectiveLinkEdge[]> {
  const rows = await db.select().from(objectiveLinks).where(and(eq(objectiveLinks.linkType, linkType)));
  return rows.map(toLinkEdge);
}
