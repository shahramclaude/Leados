import { db } from "@/db";
import { okrObjectives, okrKeyResults, okrInitiatives, okrCheckIns } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { jsonError, parseNumber, parseString, readJsonBody } from "@/lib/api";
import { buildCascadeMap, rollUpObjective, type Objective, type KeyResult, type Initiative } from "@/lib/okr";

export const dynamic = "force-dynamic";

function toObjective(row: typeof okrObjectives.$inferSelect): Objective {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    level: row.level as Objective["level"],
    owner: row.owner,
    parentId: row.parentId,
    period: row.period,
    weight: row.weight,
  };
}

function toKeyResult(row: typeof okrKeyResults.$inferSelect): KeyResult {
  return {
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
  };
}

function toInitiative(row: typeof okrInitiatives.$inferSelect): Initiative {
  return {
    id: row.id,
    keyResultId: row.keyResultId,
    title: row.title,
    status: row.status as Initiative["status"],
    contributionWeight: row.contributionWeight,
    executionProjectId: row.executionProjectId,
  };
}

export async function GET() {
  try {
    const [objectiveRows, keyResultRows, initiativeRows] = await Promise.all([
      db.select().from(okrObjectives).orderBy(asc(okrObjectives.id)),
      db.select().from(okrKeyResults).orderBy(asc(okrKeyResults.id)),
      db.select().from(okrInitiatives).orderBy(asc(okrInitiatives.id)),
    ]);
    const objectives = objectiveRows.map(toObjective);
    const keyResults = keyResultRows.map(toKeyResult);
    const initiatives = initiativeRows.map(toInitiative);

    const now = new Date();
    const { roots, misalignments } = buildCascadeMap(objectives, keyResults, initiatives, now);
    const objectiveHealths = objectives.map((o) => rollUpObjective(o, keyResults, now));

    return Response.json({ roots, misalignments, objectiveHealths, objectives, keyResults, initiatives });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const action = parseString(body.action, "objective");

  try {
    if (action === "objective") {
      const [created] = await db
        .insert(okrObjectives)
        .values({
          title: parseString(body.title, "Untitled objective"),
          description: typeof body.description === "string" ? body.description : null,
          level: parseString(body.level, "company"),
          owner: parseString(body.owner, "Unassigned"),
          parentId: body.parentId != null ? parseNumber(body.parentId, 0) : null,
          period: parseString(body.period, "2026-Q1"),
          weight: parseNumber(body.weight, 1),
        })
        .returning();
      return Response.json(created, { status: 201 });
    }

    if (action === "keyResult") {
      const [created] = await db
        .insert(okrKeyResults)
        .values({
          objectiveId: parseNumber(body.objectiveId, 0),
          title: parseString(body.title, "Untitled key result"),
          metricKey: typeof body.metricKey === "string" ? body.metricKey : null,
          startValue: parseNumber(body.startValue, 0),
          targetValue: parseNumber(body.targetValue, 1),
          currentValue: parseNumber(body.currentValue, 0),
          unit: parseString(body.unit, "number"),
          weight: parseNumber(body.weight, 1),
          confidence: parseNumber(body.confidence, 0.6),
          checkInCadence: parseString(body.checkInCadence, "weekly"),
        })
        .returning();
      return Response.json(created, { status: 201 });
    }

    if (action === "initiative") {
      const [created] = await db
        .insert(okrInitiatives)
        .values({
          keyResultId: parseNumber(body.keyResultId, 0),
          title: parseString(body.title, "Untitled initiative"),
          status: parseString(body.status, "on_track"),
          contributionWeight: parseNumber(body.contributionWeight, 1),
          ownerId: body.ownerId != null ? parseNumber(body.ownerId, 0) : null,
          executionProjectId: body.executionProjectId != null ? parseNumber(body.executionProjectId, 0) : null,
        })
        .returning();
      return Response.json(created, { status: 201 });
    }

    if (action === "checkin") {
      const keyResultId = parseNumber(body.keyResultId, 0);
      const value = parseNumber(body.value, 0);
      const confidence = parseNumber(body.confidence, 0.6);
      const [checkIn] = await db
        .insert(okrCheckIns)
        .values({ keyResultId, value, confidence, note: typeof body.note === "string" ? body.note : null, author: parseString(body.author, "system") })
        .returning();
      const [updated] = await db
        .update(okrKeyResults)
        .set({ currentValue: value, confidence, lastCheckInAt: new Date(), updatedAt: new Date() })
        .where(eq(okrKeyResults.id, keyResultId))
        .returning();
      return Response.json({ checkIn, keyResult: updated }, { status: 201 });
    }

    return jsonError(`Unknown action "${action}"`);
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
