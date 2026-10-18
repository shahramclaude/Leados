import { db } from "@/db";
import { leados_people } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_people).orderBy(asc(leados_people.name));
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [person] = await db
    .insert(leados_people)
    .values({
      name: body.name,
      role: body.role,
      reports_to: body.reports_to ?? null,
      cadence_days: body.cadence_days ?? 14,
      joined_at: body.joined_at ? new Date(body.joined_at) : new Date(),
    })
    .returning();
  return Response.json(person, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...rest } = body;
  const [updated] = await db
    .update(leados_people)
    .set(rest)
    .where(eq(leados_people.id, id))
    .returning();
  return Response.json(updated);
}
