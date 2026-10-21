// Review/ack states: "I'm handling this" with hand-off notes. Metadata only.
// GET  /api/acks?entityType=&entityId=
// POST /api/acks { entityType, entityId, status: "handling"|"released", note? }

import { db } from "@/db";
import { acks } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) return Response.json({ error: "entityType and entityId required" }, { status: 400 });

  const rows = await db
    .select()
    .from(acks)
    .where(and(eq(acks.entityType, entityType), eq(acks.entityId, entityId)))
    .orderBy(desc(acks.createdAt));

  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.entityType || !body?.entityId || !body?.status) {
    return Response.json({ error: "entityType, entityId, and status are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(acks)
    .values({
      entityType: body.entityType,
      entityId: body.entityId,
      userId: user.id,
      status: body.status,
      note: body.note ?? "",
    })
    .returning();

  return Response.json({ item: created });
}
