import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { cachedJson, jsonError, isRecord, parseNumber } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.title !== "string" || body.title.trim() === "") {
    return jsonError("title is required");
  }
  if (typeof body.owner !== "string" || body.owner.trim() === "") {
    return jsonError("owner is required");
  }
  if (typeof body.domain !== "string" || body.domain.trim() === "") {
    return jsonError("domain is required");
  }
  const deadline = typeof body.deadline === "string" && body.deadline !== "" ? new Date(body.deadline) : null;
  const [created] = await db
    .insert(decisions)
    .values({
      title: body.title,
      description: typeof body.description === "string" ? body.description : "",
      owner: body.owner,
      domain: body.domain,
      status: typeof body.status === "string" ? body.status : "proposed",
      deadline,
      confidence: parseNumber(body.confidence, 50),
      impact: parseNumber(body.impact, 3),
    })
    .returning();
  return cachedJson(created, { status: 201 });
}
