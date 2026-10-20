import { getNotificationsPage } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

/** Keyset-paginated, unbounded notification feed. Backed by notifications_created_at_id_idx. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
  const cursorCreatedAt = url.searchParams.get("cursorCreatedAt");
  const cursorId = url.searchParams.get("cursorId");
  const since = url.searchParams.get("since"); // ISO timestamp, used by the realtime poller

  const { items, nextCursor } = await getNotificationsPage({
    limit,
    since,
    cursor: cursorCreatedAt && cursorId ? { createdAt: cursorCreatedAt, id: Number(cursorId) } : null,
  });

  return Response.json({ items, nextCursor, serverTime: new Date().toISOString() });
}
