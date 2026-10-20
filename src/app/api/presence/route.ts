// GET  /api/presence?entityType=&entityId=  — list who is currently viewing/editing
// POST /api/presence                        — heartbeat "I'm looking at this" (upsert)
//
// Presence is metadata only (who + status + timestamp) — never message
// content. Rows older than PRESENCE_TTL_MS are treated as stale/offline.

import { db } from "@/db";
import { presence, users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { publishEvent } from "@/lib/eventBus";
import { and, eq, gte, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PRESENCE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) {
    return Response.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const since = new Date(Date.now() - PRESENCE_TTL_MS);
  const rows = await db
    .select({ userId: presence.userId, status: presence.status, updatedAt: presence.updatedAt, name: users.name })
    .from(presence)
    .innerJoin(users, eq(users.id, presence.userId))
    .where(and(eq(presence.entityType, entityType), eq(presence.entityId, entityId), gte(presence.updatedAt, since)));

  return Response.json({ viewers: rows });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request);
  const body = await request.json().catch(() => null);
  const { entityType, entityId, status } = (body ?? {}) as { entityType?: string; entityId?: string; status?: string };

  if (!entityType || !entityId) {
    return Response.json({ error: "entityType and entityId are required" }, { status: 400 });
  }
  const resolvedStatus = status === "editing" ? "editing" : "viewing";

  const existing = await db
    .select()
    .from(presence)
    .where(and(eq(presence.entityType, entityType), eq(presence.entityId, entityId), eq(presence.userId, userId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(presence)
      .set({ status: resolvedStatus, updatedAt: new Date() })
      .where(eq(presence.id, existing[0].id));
  } else {
    await db.insert(presence).values({ entityType, entityId, userId, status: resolvedStatus });
  }

  // Notify other current viewers of this entity so their presence badges update live.
  const since = new Date(Date.now() - PRESENCE_TTL_MS);
  const others = await db
    .select({ userId: presence.userId })
    .from(presence)
    .where(
      and(
        eq(presence.entityType, entityType),
        eq(presence.entityId, entityId),
        gte(presence.updatedAt, since),
        ne(presence.userId, userId),
      ),
    );

  await Promise.all(
    others.map((o) =>
      publishEvent({
        userId: o.userId,
        type: "presence.update",
        domain: "collaboration",
        entityType,
        entityId,
        payload: { userId, status: resolvedStatus },
      }),
    ),
  );

  return Response.json({ ok: true });
}
