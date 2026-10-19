import { db } from "@/db";
import { execMilestones } from "@/db/schema";
import { asc } from "drizzle-orm";
import { jsonError, parseNumber, parseString, readJsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(execMilestones).orderBy(asc(execMilestones.id));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (typeof body.title !== "string" || body.title.trim() === "") return jsonError("title is required");
  const [created] = await db
    .insert(execMilestones)
    .values({
      projectId: parseNumber(body.projectId, 0),
      title: body.title,
      durationDays: parseNumber(body.durationDays, 5),
      durationP90Days: body.durationP90Days != null ? parseNumber(body.durationP90Days, 0) : null,
      dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn : [],
      dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
      status: parseString(body.status, "not_started"),
    })
    .returning();
  return Response.json(created, { status: 201 });
}
