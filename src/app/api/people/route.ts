import { db } from "@/db";
import { people, oneOnOnes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(people).orderBy(people.name);
  const withOneOnOnes = await Promise.all(
    rows.map(async (p) => {
      const last = await db
        .select()
        .from(oneOnOnes)
        .where(eq(oneOnOnes.personId, p.id))
        .orderBy(desc(oneOnOnes.occurredAt))
        .limit(3);
      return { ...p, recentOneOnOnes: last };
    })
  );
  return cachedJson(withOneOnOnes);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.name !== "string" || body.name.trim() === "") {
    return jsonError("name is required");
  }
  if (typeof body.role !== "string" || body.role.trim() === "") {
    return jsonError("role is required");
  }
  if (typeof body.team !== "string" || body.team.trim() === "") {
    return jsonError("team is required");
  }
  const managerId = typeof body.managerId === "number" ? body.managerId : null;
  const [created] = await db
    .insert(people)
    .values({ name: body.name, role: body.role, team: body.team, managerId })
    .returning();
  return cachedJson(created, { status: 201 });
}
