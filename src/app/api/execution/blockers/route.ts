import { db } from "@/db";
import { execBlockers } from "@/db/schema";
import { desc } from "drizzle-orm";
import { jsonError, parseNumber, parseString, readJsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(execBlockers).orderBy(desc(execBlockers.raisedAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (typeof body.title !== "string" || body.title.trim() === "") return jsonError("title is required");
  const [created] = await db
    .insert(execBlockers)
    .values({
      projectId: parseNumber(body.projectId, 0),
      milestoneId: body.milestoneId != null ? parseNumber(body.milestoneId, 0) : null,
      title: body.title,
      severity: parseString(body.severity, "medium"),
      impactDays: parseNumber(body.impactDays, 0),
    })
    .returning();
  return Response.json(created, { status: 201 });
}
