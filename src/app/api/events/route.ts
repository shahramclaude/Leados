import { db } from "@/db";
import { events } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord, parseNumber } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(events).orderBy(desc(events.createdAt));
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.title !== "string" || body.title.trim() === "") {
    return jsonError("title is required");
  }
  if (typeof body.domain !== "string" || body.domain.trim() === "") {
    return jsonError("domain is required");
  }
  const [created] = await db
    .insert(events)
    .values({
      type: typeof body.type === "string" ? body.type : "note",
      domain: body.domain,
      severity: parseNumber(body.severity, 1),
      title: body.title,
      description: typeof body.description === "string" ? body.description : "",
      source: typeof body.source === "string" ? body.source : "manual",
    })
    .returning();
  return cachedJson(created, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.id !== "number") return jsonError("id is required");
  const patch: Partial<typeof events.$inferInsert> = {};
  if (typeof body.status === "string") patch.status = body.status;
  const [updated] = await db.update(events).set(patch).where(eq(events.id, body.id)).returning();
  if (!updated) return jsonError("event not found", 404);
  return cachedJson(updated);
}
