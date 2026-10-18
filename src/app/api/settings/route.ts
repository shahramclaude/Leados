import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";
import type { NotificationPrefs } from "@/db/schema";

export const dynamic = "force-dynamic";

async function ensureSettings(): Promise<typeof settings.$inferSelect> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(settings).values({ id: 1 }).returning();
  return created;
}

export async function GET(): Promise<Response> {
  const row = await ensureSettings();
  return cachedJson(row);
}

export async function PATCH(request: Request): Promise<Response> {
  await ensureSettings();
  const body: unknown = await request.json();
  if (!isRecord(body)) return jsonError("invalid body");

  const patch: Partial<typeof settings.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.orgName === "string") patch.orgName = body.orgName;
  if (typeof body.industry === "string") patch.industry = body.industry;
  if (typeof body.stage === "string") patch.stage = body.stage;
  if (typeof body.teamSize === "number") patch.teamSize = body.teamSize;
  if (typeof body.autonomousEnabled === "boolean") patch.autonomousEnabled = body.autonomousEnabled;
  if (typeof body.autonomousIntervalMinutes === "number") patch.autonomousIntervalMinutes = body.autonomousIntervalMinutes;
  if (isRecord(body.notificationPrefs)) patch.notificationPrefs = body.notificationPrefs as NotificationPrefs;

  const [updated] = await db.update(settings).set(patch).where(eq(settings.id, 1)).returning();
  return cachedJson(updated);
}
