import { db } from "@/db";
import { people as peopleTable } from "@/db/schema";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(peopleTable).orderBy(peopleTable.name);
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.name !== "string" || body.name.trim() === "") {
    return jsonError("name is required");
  }
  if (typeof body.role !== "string" || body.role.trim() === "") {
    return jsonError("role is required");
  }
  const [created] = await db
    .insert(peopleTable)
    .values({
      name: body.name,
      role: body.role,
      team: typeof body.team === "string" && body.team.trim() ? body.team : "General",
      managerId: typeof body.managerId === "number" ? body.managerId : null,
    })
    .returning();
  return cachedJson(created, { status: 201 });
}
