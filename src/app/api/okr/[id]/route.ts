import { db } from "@/db";
import { okrObjectives, okrKeyResults, okrInitiatives } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, parseNumber, parseString, readJsonBody } from "@/lib/api";
import { rollUpObjective, type Objective, type KeyResult } from "@/lib/okr";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const objectiveId = Number(id);
  if (!Number.isFinite(objectiveId)) return jsonError("Invalid objective id");

  const [objectiveRow] = await db.select().from(okrObjectives).where(eq(okrObjectives.id, objectiveId)).limit(1);
  if (!objectiveRow) return jsonError("Objective not found", 404);

  const keyResultRows = await db.select().from(okrKeyResults).where(eq(okrKeyResults.objectiveId, objectiveId));
  const keyResultIds = keyResultRows.map((k) => k.id);
  const initiativeRows = keyResultIds.length
    ? await db.select().from(okrInitiatives)
    : [];
  const initiatives = initiativeRows.filter((i) => keyResultIds.includes(i.keyResultId));

  const objective: Objective = {
    id: objectiveRow.id,
    title: objectiveRow.title,
    description: objectiveRow.description,
    level: objectiveRow.level as Objective["level"],
    owner: objectiveRow.owner,
    parentId: objectiveRow.parentId,
    period: objectiveRow.period,
    weight: objectiveRow.weight,
  };
  const keyResults: KeyResult[] = keyResultRows.map((row) => ({
    id: row.id,
    objectiveId: row.objectiveId,
    title: row.title,
    metricKey: row.metricKey,
    startValue: row.startValue,
    targetValue: row.targetValue,
    currentValue: row.currentValue,
    unit: row.unit,
    weight: row.weight,
    confidence: row.confidence,
    checkInCadence: row.checkInCadence as KeyResult["checkInCadence"],
    lastCheckInAt: row.lastCheckInAt,
  }));

  const health = rollUpObjective(objective, keyResults);
  return Response.json({ objective, keyResults, initiatives, health });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const objectiveId = Number(id);
  if (!Number.isFinite(objectiveId)) return jsonError("Invalid objective id");
  const body = await readJsonBody(request);

  const update: Partial<typeof okrObjectives.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.title === "string") update.title = body.title;
  if (typeof body.description === "string") update.description = body.description;
  if (typeof body.owner === "string") update.owner = body.owner;
  if (body.weight != null) update.weight = parseNumber(body.weight, 1);
  if (typeof body.period === "string") update.period = parseString(body.period, "2026-Q1");

  const [updated] = await db.update(okrObjectives).set(update).where(eq(okrObjectives.id, objectiveId)).returning();
  if (!updated) return jsonError("Objective not found", 404);
  return Response.json(updated);
}
