// Presence: who's viewing what, right now. Metadata only (userId + entity +
// last-seen timestamp) — no activity/content analytics.
// POST /api/presence { entityType, entityId }  -> heartbeat upsert
// GET  /api/presence?entityType=&entityId=     -> active viewers (last 60s)

import { db } from "@/db";
import { presence, users } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { and, eq, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.entityType || !body?.entityId) {
    return Response.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  await db
    .insert(presence)
    .values({ userId: user.id, entityType: body.entityType, entityId: body.entityId, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [presence.userId, presence.entityType, presence.entityId],
      set: { lastSeenAt: new Date() },
    });

  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) return Response.json({ error: "entityType and entityId required" }, { status: 400 });

  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const rows = await db
    .select({ userId: presence.userId, lastSeenAt: presence.lastSeenAt, name: users.name })
    .from(presence)
    .innerJoin(users, eq(users.id, presence.userId))
    .where(and(eq(presence.entityType, entityType), eq(presence.entityId, entityId), gte(presence.lastSeenAt, cutoff)));

  return Response.json({ viewers: rows });
}
