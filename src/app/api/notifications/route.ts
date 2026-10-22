// LEADOS Part 14 — /api/notifications
// GET: cursor-paginated notification list (chains collapsed: parent + count)
// POST: dispatch a notification through the single gate (test/dev harness —
//       in production this would be called from domain events, not the API).
import { resolveActor } from "@/lib/demoContext";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { dispatchInterrupt } from "@/lib/notifications";
import type { NotificationClass } from "@/lib/attention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}
function decodeCursor(raw: string): Cursor | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 100);
  const stateFilter = url.searchParams.get("state"); // unread|read|archived|reopened
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

  const conditions = [eq(notifications.userId, actor.userId), isNull(notifications.parentId)];
  if (stateFilter) conditions.push(eq(notifications.state, stateFilter));
  if (cursor) {
    conditions.push(
      or(
        lt(notifications.createdAt, new Date(cursor.createdAt)),
        and(eq(notifications.createdAt, new Date(cursor.createdAt)), lt(notifications.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const chainCounts = await Promise.all(
    page.map(async (root) => {
      const children = await db.select().from(notifications).where(eq(notifications.parentId, root.id));
      return { rootId: root.id, count: children.length, latestChild: children.at(-1) ?? null };
    }),
  );
  const countByRoot = new Map(chainCounts.map((c) => [c.rootId, c]));

  const items = page.map((row) => ({
    ...row,
    chainLength: 1 + (countByRoot.get(row.id)?.count ?? 0),
  }));

  const last = page.at(-1);
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

  return Response.json({ items, nextCursor, actor });
}

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  const body = await req.json().catch(() => ({}));

  const result = await dispatchInterrupt({
    orgId: actor.orgId,
    userId: body.userId ?? actor.userId,
    timezone: body.timezone ?? actor.timezone,
    class: (body.class ?? "info") as NotificationClass,
    severity: Number(body.severity ?? 3),
    entityRef: body.entityRef,
    dedupeKey: body.dedupeKey ?? `manual:${Date.now()}`,
    title: body.title ?? "Untitled",
    body: body.body ?? "",
    evidence: body.evidence,
  });

  return Response.json(result, { status: 201 });
}
