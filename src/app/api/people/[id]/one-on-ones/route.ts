import { db } from "@/db";
import { oneOnOnes, people } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isInteger(personId)) return jsonError("invalid person id");

  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.notes !== "string" || body.notes.trim() === "") {
    return jsonError("notes is required");
  }
  const sentiment = typeof body.sentiment === "number" ? body.sentiment : 0;
  const actionItems = Array.isArray(body.actionItems)
    ? body.actionItems.filter((i): i is string => typeof i === "string")
    : [];

  const [created] = await db
    .insert(oneOnOnes)
    .values({ personId, notes: body.notes, sentiment, actionItems })
    .returning();

  await db.update(people).set({ lastOneOnOneAt: new Date() }).where(eq(people.id, personId));

  return cachedJson(created, { status: 201 });
}
