// POST /api/notifications/read-all — marks every unread notification (optionally
// scoped to a single domain) as read in one call.

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request);
  const body = await request.json().catch(() => ({}));
  const { domain } = body as { domain?: string };

  const conditions = [eq(notifications.userId, userId), eq(notifications.status, "unread")];
  if (domain) conditions.push(eq(notifications.domain, domain));

  const updated = await db
    .update(notifications)
    .set({ status: "read", updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: notifications.id });

  return Response.json({ updatedCount: updated.length });
}
