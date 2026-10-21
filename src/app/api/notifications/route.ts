// GET /api/notifications?cursor=&limit=&state=&class=&domain=&rootsOnly=
//
// Cursor pagination: cursor is an opaque base64 string encoding
// `${createdAtMillis}:${id}` of the last row on the previous page, ordered
// newest-first. Stable under concurrent inserts because it is anchored to a
// specific row, not an offset.

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { runDueWork } from "@/lib/scheduler";
import { and, desc, eq, lt, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}:${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { ts: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [ts, id] = raw.split(":");
    return { ts: Number.parseInt(ts, 10), id };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  runDueWork().catch(() => {});

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10)));
  const state = url.searchParams.get("state");
  const cls = url.searchParams.get("class");
  const domain = url.searchParams.get("domain");
  const rootsOnly = url.searchParams.get("rootsOnly") !== "false"; // default true: chain view
  const cursorParam = url.searchParams.get("cursor");

  const conditions = [eq(notifications.userId, user.id)];
  if (state) conditions.push(eq(notifications.state, state as "unread" | "read" | "archived"));
  if (cls) conditions.push(eq(notifications.class, cls as "alert" | "action" | "info" | "digest"));
  if (domain) conditions.push(eq(notifications.domain, domain));

  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursor) {
    conditions.push(
      or(
        lt(notifications.createdAt, new Date(cursor.ts)),
        and(eq(notifications.createdAt, new Date(cursor.ts)), lt(notifications.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const filtered = rootsOnly ? page.filter((r) => !r.parentId) : page;
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];

  let withChainCounts: Array<(typeof filtered)[number] & { chainCount: number }> = filtered.map((f) => ({
    ...f,
    chainCount: 1,
  }));

  if (rootsOnly && filtered.length > 0) {
    const allForUser = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    const counts = new Map<string, number>();
    for (const row of allForUser) {
      if (row.parentId) counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + 1);
    }
    withChainCounts = filtered.map((f) => ({ ...f, chainCount: 1 + (counts.get(f.id) ?? 0) }));
  }

  return Response.json({
    items: withChainCounts,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  });
}
