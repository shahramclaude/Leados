// GET  /api/notifications/preferences — list per-domain/channel delivery prefs
// PUT  /api/notifications/preferences — upsert one preference row
//
// Channels: `in_app` is fully wired today. `email` / `webhook` rows are
// accepted and stored so the actuation layer (Part 4) can pick them up later
// — we only ever actuate `in_app` ourselves here.

import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_CHANNELS = new Set(["in_app", "email", "webhook"]);

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return Response.json({ preferences: rows });
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId(request);
  const body = await request.json().catch(() => null);
  const { domain, channel, enabled, allowInterrupt } = (body ?? {}) as {
    domain?: string;
    channel?: string;
    enabled?: boolean;
    allowInterrupt?: boolean;
  };

  if (!domain || !channel || !VALID_CHANNELS.has(channel)) {
    return Response.json({ error: `domain is required and channel must be one of ${[...VALID_CHANNELS].join(", ")}` }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.domain, domain),
        eq(notificationPreferences.channel, channel),
      ),
    )
    .limit(1);

  const patch = {
    enabled: enabled ?? existing[0]?.enabled ?? true,
    allowInterrupt: allowInterrupt ?? existing[0]?.allowInterrupt ?? false,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    const [updated] = await db
      .update(notificationPreferences)
      .set(patch)
      .where(eq(notificationPreferences.id, existing[0].id))
      .returning();
    return Response.json({ preference: updated });
  }

  const [inserted] = await db
    .insert(notificationPreferences)
    .values({ userId, domain, channel, ...patch })
    .returning();

  return Response.json({ preference: inserted }, { status: 201 });
}
