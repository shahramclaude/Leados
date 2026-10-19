import { db } from "@/db";
import { events as eventsTable, oneOnOnes as oneOnOnesTable } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord, parseNumber } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const personIdParam = url.searchParams.get("personId");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam) || 50)) : 50;

  const rows = personIdParam
    ? await db
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.personId, Number(personIdParam)))
        .orderBy(desc(eventsTable.occurredAt))
        .limit(limit)
    : await db.select().from(eventsTable).orderBy(desc(eventsTable.occurredAt)).limit(limit);

  return cachedJson(rows);
}

/**
 * Quick-log capture. `type` drives which engine reads the event:
 *   pulse.mood.logged, oneonone.logged, feedback.logged, conflict.logged,
 *   conflict.resolved, growth_plan.opened, action_item.logged,
 *   action_item.resolved, milestone.delivered, skill.acquired,
 *   promotion.logged, activity.after_hours, meeting.attended
 *
 * If `type` is "oneonone.logged" and `notes` is provided, a matching row is
 * also written to `one_on_ones` so QualityScorer has real content to score.
 */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.type !== "string" || body.type.trim() === "") {
    return jsonError("type is required");
  }
  const personId = typeof body.personId === "number" ? body.personId : null;
  const occurredAt = typeof body.occurredAt === "string" ? new Date(body.occurredAt) : new Date();

  const [created] = await db
    .insert(eventsTable)
    .values({
      type: body.type,
      domain: typeof body.domain === "string" ? body.domain : "people",
      personId,
      title: typeof body.title === "string" ? body.title : body.type,
      description: typeof body.description === "string" ? body.description : "",
      severity: parseNumber(body.severity, 1),
      source: typeof body.source === "string" ? body.source : "manual",
      data: isRecord(body.data) ? body.data : {},
      occurredAt,
    })
    .returning();

  if (body.type === "oneonone.logged" && personId !== null && typeof body.notes === "string") {
    await db.insert(oneOnOnesTable).values({
      personId,
      occurredAt,
      notes: body.notes,
      actionItems: [],
    });
  }

  return cachedJson(created, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.id !== "number") return jsonError("id is required");
  const patch: Partial<typeof eventsTable.$inferInsert> = {};
  if (typeof body.status === "string") patch.status = body.status;
  const [updated] = await db.update(eventsTable).set(patch).where(eq(eventsTable.id, body.id)).returning();
  if (!updated) return jsonError("event not found", 404);
  return cachedJson(updated);
}
