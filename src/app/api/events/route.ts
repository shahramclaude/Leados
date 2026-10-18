import { db } from "@/db";
import { leados_events } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_events).orderBy(desc(leados_events.ts)).limit(500);
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [event] = await db
    .insert(leados_events)
    .values({
      type: body.type,
      domain: body.domain,
      person_id: body.personId ?? null,
      ts: body.ts ? new Date(body.ts) : new Date(),
      data: body.data ?? {},
    })
    .returning();
  return Response.json(event, { status: 201 });
}
