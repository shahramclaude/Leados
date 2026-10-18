import { db } from "@/db";
import { leados_growth_plans } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_growth_plans).orderBy(desc(leados_growth_plans.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(leados_growth_plans)
    .values({ title: body.title, personId: body.personId ?? null })
    .returning();
  return Response.json(row, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body?.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (body.checkin) updates.lastCheckinAt = new Date();
  if (body.status) updates.status = body.status;
  const [row] = await db
    .update(leados_growth_plans)
    .set(updates)
    .where(eq(leados_growth_plans.id, body.id))
    .returning();
  return Response.json(row);
}
