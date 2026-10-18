import { db } from "@/db";
import { leados_relationships } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_relationships);
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { fromId, toId, type, strength } = body ?? {};

  if (typeof fromId !== "number" || typeof toId !== "number") {
    return Response.json({ error: "fromId and toId are required numbers" }, { status: 400 });
  }

  const [created] = await db
    .insert(leados_relationships)
    .values({
      fromId,
      toId,
      type: typeof type === "string" ? type : "collaborates",
      strength: typeof strength === "number" ? Math.max(0, Math.min(1.5, strength)) : 0.5,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
