import { db } from "@/db";
import { rules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(rules).orderBy(rules.domain, rules.name);
  return cachedJson(rows);
}

export async function PATCH(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.key !== "string") return jsonError("key is required");
  const patch: Partial<typeof rules.$inferInsert> = {};
  if (typeof body.weight === "number") patch.weight = String(body.weight);
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  const [updated] = await db.update(rules).set(patch).where(eq(rules.key, body.key)).returning();
  if (!updated) return jsonError("rule not found", 404);
  return cachedJson(updated);
}
