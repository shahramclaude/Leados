import { db } from "@/db";
import { insights } from "@/db/schema";
import { desc } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(insights).orderBy(desc(insights.createdAt));
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.title !== "string" || typeof body.body !== "string") {
    return jsonError("title and body are required");
  }
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
  const [created] = await db
    .insert(insights)
    .values({
      title: body.title,
      body: body.body,
      domain: typeof body.domain === "string" ? body.domain : "execution",
      tags,
    })
    .returning();
  return cachedJson(created, { status: 201 });
}
