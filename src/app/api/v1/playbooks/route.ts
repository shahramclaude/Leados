import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { playbooks } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { buildPageMeta, cursorRowCondition, decodeCursor, parseLimit, parseSort } from "@/lib/api/pagination";
import { toPlaybook } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export const GET = withApi("automation:read", async (req, { correlationId, rl }) => {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { direction } = parseSort(sp.get("sort"), ["createdAt"], "-createdAt");
    const sortColumn = playbooks.createdAt;

    const conditions = sp.get("cursor") ? [cursorRowCondition(sortColumn, playbooks.id, decodeCursor(sp.get("cursor")!), direction)] : [];
    const orderFns = direction === "desc" ? [desc(sortColumn), desc(playbooks.id)] : [asc(sortColumn), asc(playbooks.id)];
    const rows = await db
      .select()
      .from(playbooks)
      .where(conditions[0])
      .orderBy(...orderFns)
      .limit(limit + 1);
    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, "createdAt");
    return jsonOk({ data: items.map(toPlaybook), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
