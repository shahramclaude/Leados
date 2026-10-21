// Collaboration signals (metadata only — no content analytics of any kind).
// GET  /api/comments?entityType=&entityId=  -> thread
// POST /api/comments { entityType, entityId, body, mentionUserIds? }
//
// @-mentions create a notification for each mentioned user (class "action",
// opted-in by default since a direct mention is inherently actionable), and
// nothing about comment *content* is analyzed, scored, or stored beyond the
// raw text the author wrote — this is the data-contract boundary called out
// in the mission brief.

import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { createNotification } from "@/lib/notify";
import { and, asc, eq, inArray } from "drizzle-orm";

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
    .from(comments)
    .where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId)))
    .orderBy(asc(comments.createdAt));

  return Response.json({ items: rows });
}

function extractHandles(body: string): string[] {
  const matches = body.match(/@([a-zA-Z0-9._-]+)/g) ?? [];
  return matches.map((m) => m.slice(1).toLowerCase());
}

export async function POST(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.entityType || !body?.entityId || !body?.body) {
    return Response.json({ error: "entityType, entityId, and body are required" }, { status: 400 });
  }

  const explicitMentions: string[] = Array.isArray(body.mentionUserIds) ? body.mentionUserIds : [];
  const handles = extractHandles(body.body);

  const allUsers = await db.select().from(users);
  const byHandle = new Map(allUsers.map((u) => [u.email.split("@")[0].toLowerCase(), u]));
  const autoDetected = handles.map((h) => byHandle.get(h)?.id).filter((id): id is string => Boolean(id));

  const mentionIds = [...new Set([...explicitMentions, ...autoDetected])].filter((id) => id !== user.id);

  const [created] = await db
    .insert(comments)
    .values({
      entityType: body.entityType,
      entityId: body.entityId,
      authorId: user.id,
      body: body.body,
      mentions: mentionIds,
      parentId: body.parentId ?? null,
    })
    .returning();

  for (const mentionedUserId of mentionIds) {
    await createNotification({
      userId: mentionedUserId,
      class: "action",
      severity: 2,
      domain: "general",
      entityRef: `/${body.entityType}/${body.entityId}`,
      title: `${user.name} mentioned you in a comment`,
      body: body.body,
      dedupeKey: `mention:${created.id}:${mentionedUserId}`,
      actor: user.name,
    });
  }

  return Response.json({ item: created });
}
