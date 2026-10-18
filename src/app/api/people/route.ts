import { db } from "@/db";
import { leados_people } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_people).where(eq(leados_people.archived, false));
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, role, cadenceDays } = await req.json();
  if (!name || !role) {
    return Response.json({ error: "name and role required" }, { status: 400 });
  }
  const [person] = await db
    .insert(leados_people)
    .values({ name, role, cadenceDays: cadenceDays ?? 14 })
    .returning();
  await logAudit("PERSON_ADDED", name);
  return Response.json(person, { status: 201 });
}
