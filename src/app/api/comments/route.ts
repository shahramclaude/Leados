// GET  /api/comments?entityType=&entityId=  — threaded comments + hand-off notes
// POST /api/comments                        — create a comment/hand-off note.
//   @mentions (e.g. "@Alice please review") create notifications for the
//   mentioned users. No content analytics beyond mention extraction.

import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { publishEvent } from "@/lib/eventBus";
import { and, asc, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

function extractMentionTokens(body: string): string[] {
  const matches = body.match(/@([a-zA-Z0-9_]+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) {
    return Response.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      kind: comments.kind,
      body: comments.body,
      mentions: comments.mentions,
      createdAt: comments.createdAt,
      userId: comments.userId,
      authorName: users.name,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId)))
    .orderBy(asc(comments.createdAt));

  return Response.json({ comments: rows });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request);
  const body = await request.json().catch(() => null);
  const { entityType, entityId, text, kind, parentId } = (body ?? {}) as {
    entityType?: string;
    entityId?: string;
    text?: string;
    kind?: string;
    parentId?: string;
  };

  if (!entityType || !entityId || !text) {
    return Response.json({ error: "entityType, entityId and text are required" }, { status: 400 });
  }

  const resolvedKind = kind === "handoff" ? "handoff" : "comment";
  const mentionTokens = extractMentionTokens(text);

  const allUsers = mentionTokens.length > 0 ? await db.select().from(users) : [];
  const mentionedUsers = allUsers.filter((u) =>
    mentionTokens.includes(u.name.toLowerCase().replace(/\s+/g, "")) ||
    mentionTokens.includes(u.email.split("@")[0].toLowerCase()),
  );

  const [row] = await db
    .insert(comments)
    .values({
      entityType,
      entityId,
      userId,
      parentId: parentId ?? null,
      kind: resolvedKind,
      body: text,
      mentions: mentionedUsers.map((u) => u.id),
    })
    .returning();

  const author = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];

  // @mentions create notifications for the mentioned users.
  await Promise.all(
    mentionedUsers.map((mentioned) =>
      createNotification({
        userId: mentioned.id,
        type: "comment.created",
        domain: "collaboration",
        severity: resolvedKind === "handoff" ? 3 : 2,
        title: resolvedKind === "handoff" ? `Hand-off from ${author?.name ?? "a teammate"}` : `${author?.name ?? "Someone"} mentioned you`,
        body: text,
        entityType,
        entityId,
        dedupKey: `comment:${entityType}:${entityId}:mention:${mentioned.id}`,
      }),
    ),
  );

  // Thread participants (besides the author) get a live update too.
  const priorParticipants = await db
    .selectDistinct({ userId: comments.userId })
    .from(comments)
    .where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId), ne(comments.userId, userId)));

  await Promise.all(
    priorParticipants
      .filter((p) => !mentionedUsers.some((m) => m.id === p.userId))
      .map((p) =>
        publishEvent({
          userId: p.userId,
          type: "comment.created",
          domain: "collaboration",
          entityType,
          entityId,
          payload: { commentId: row.id, authorName: author?.name, kind: resolvedKind },
        }),
      ),
  );

  return Response.json({ comment: row }, { status: 201 });
}
