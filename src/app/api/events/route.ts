import { db } from "@/db";
import { leados_events } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_events).orderBy(desc(leados_events.createdAt)).limit(200);
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { type, domain, personId, data = {} } = await req.json();
  if (!type || !domain) {
    return Response.json({ error: "type and domain required" }, { status: 400 });
  }
  const [ev] = await db
    .insert(leados_events)
    .values({ type, domain, personId: personId ?? null, data })
    .returning();
  await logAudit("EVENT_LOGGED", `${type} / ${domain}${personId ? ` / person ${personId}` : ""}`);
  return Response.json(ev, { status: 201 });
}
