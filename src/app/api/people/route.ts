import { db } from "@/db";
import { leados_people } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_people).orderBy(asc(leados_people.name));
  return Response.json(rows);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, role, cadenceDays } = body ?? {};
    if (!name) return Response.json({ error: "name is required" }, { status: 400 });
    const [row] = await db
      .insert(leados_people)
      .values({ name, role: role ?? "", cadenceDays: cadenceDays ?? 14 })
      .returning();
    await logAudit("PERSON_ADDED", `${name} (${role ?? "no role"})`);
    return Response.json(row, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "failed to create person" }, { status: 500 });
  }
}
