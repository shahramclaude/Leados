import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord, parseNumber } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100);
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.title !== "string" || typeof body.message !== "string") {
    return jsonError("title and message are required");
  }
  const [created] = await db
    .insert(notifications)
    .values({
      title: body.title,
      message: body.message,
      severity: parseNumber(body.severity, 1),
      domain: typeof body.domain === "string" ? body.domain : "general",
      link: typeof body.link === "string" ? body.link : null,
    })
    .returning();
  return cachedJson(created, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body)) return jsonError("invalid body");
  if (body.markAllRead === true) {
    await db.update(notifications).set({ read: true });
    return cachedJson({ ok: true });
  }
  if (typeof body.id === "number") {
    const [updated] = await db
      .update(notifications)
      .set({ read: body.read !== false })
      .where(eq(notifications.id, body.id))
      .returning();
    if (!updated) return jsonError("notification not found", 404);
    return cachedJson(updated);
  }
  return jsonError("id or markAllRead is required");
}
