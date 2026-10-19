import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc } from "drizzle-orm";
import { isPlainObject, jsonError, logDuration, safeParseJson } from "@/lib/apiUtils";
import { markAllNotificationsRead } from "@/lib/dataset.server";
import type { NotificationSummary } from "@/lib/types";
import { DOMAINS } from "@/lib/types";
import type { DomainKey } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROUTE = "api/events";

function toDomainKey(value: string): DomainKey {
  return (DOMAINS as readonly string[]).includes(value) ? (value as DomainKey) : "execution";
}

export async function GET() {
  const start = Date.now();
  try {
    const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(50);
    const payload: NotificationSummary[] = rows.map((r) => ({
      id: r.id,
      domain: toDomainKey(r.domain),
      title: r.title,
      message: r.message,
      sev: (r.sev >= 1 && r.sev <= 5 ? r.sev : 3) as NotificationSummary["sev"],
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    }));
    logDuration(ROUTE, start);
    return Response.json({ notifications: payload });
  } catch (err) {
    console.error(`[${ROUTE}] error`, err);
    logDuration(ROUTE, start);
    return jsonError(503, "DB_UNAVAILABLE", "Failed to load events.");
  }
}

export async function POST(req: Request) {
  const start = Date.now();
  const body = await safeParseJson(req);
  if (body === undefined) {
    logDuration(ROUTE, start);
    return jsonError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!isPlainObject(body) || body.action !== "markAllRead") {
    logDuration(ROUTE, start);
    return jsonError(400, "INVALID_BODY", "Expected a JSON body shaped like { action: 'markAllRead' }.");
  }

  try {
    const updated = await markAllNotificationsRead();
    logDuration(ROUTE, start);
    return Response.json({ ok: true, updated });
  } catch (err) {
    console.error(`[${ROUTE}] error`, err);
    logDuration(ROUTE, start);
    return jsonError(503, "DB_UNAVAILABLE", "Failed to update events.");
  }
}
