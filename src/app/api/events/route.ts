import { db } from "@/db";
import { leados_events } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_events).orderBy(desc(leados_events.createdAt)).limit(200);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.type || !body?.domain) {
    return Response.json({ error: "type and domain are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(leados_events)
    .values({
      type: body.type,
      domain: body.domain,
      personId: body.personId ?? null,
      data: body.data ?? {},
    })
    .returning();
  return Response.json(row, { status: 201 });
}
