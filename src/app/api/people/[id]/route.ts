import { db } from "@/db";
import { leados_people } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  const body = await req.json();
  const patch: Partial<typeof leados_people.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.role === "string") patch.role = body.role;
  if (typeof body.cadenceDays === "number") patch.cadenceDays = body.cadenceDays;
  if (typeof body.archived === "boolean") patch.archived = body.archived;

  const [updated] = await db.update(leados_people).set(patch).where(eq(leados_people.id, personId)).returning();
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  await logAudit("PERSON_UPDATED", `#${personId}: ${Object.keys(patch).join(", ")}`);
  return Response.json(updated);
}
