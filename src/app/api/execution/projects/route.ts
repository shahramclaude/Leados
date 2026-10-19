import { db } from "@/db";
import { execProjects } from "@/db/schema";
import { asc } from "drizzle-orm";
import { jsonError, parseString, readJsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(execProjects).orderBy(asc(execProjects.id));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (typeof body.name !== "string" || body.name.trim() === "") return jsonError("name is required");
  const [created] = await db
    .insert(execProjects)
    .values({
      name: body.name,
      description: typeof body.description === "string" ? body.description : null,
      status: parseString(body.status, "active"),
      startDate: parseString(body.startDate, new Date().toISOString().slice(0, 10)),
      targetDate: parseString(body.targetDate, new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)),
      okrInitiativeId: typeof body.okrInitiativeId === "number" ? body.okrInitiativeId : null,
    })
    .returning();
  return Response.json(created, { status: 201 });
}
