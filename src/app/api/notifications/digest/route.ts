// LEADOS Part 14 — /api/notifications/digest
// GET: preview what's currently queued for the user's next digest, with the
//      "sent now because…" explanation for each item.
// POST: force the digest sweep to run now (test/cron harness). In production
//       this would be invoked by a scheduler, not a public endpoint.
import { db } from "@/db";
import { digestQueue, notifications } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { resolveActor } from "@/lib/demoContext";
import { runDigestSweep } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const rows = await db
    .select({ queue: digestQueue, notification: notifications })
    .from(digestQueue)
    .innerJoin(notifications, eq(digestQueue.notificationId, notifications.id))
    .where(and(eq(digestQueue.userId, actor.userId), isNull(digestQueue.sentAt)));

  return Response.json({
    pending: rows.map((r) => ({
      notificationId: r.notification.id,
      class: r.notification.class,
      title: r.notification.title,
      scheduledFor: r.queue.scheduledFor,
      explanation: r.queue.explanation,
    })),
  });
}

export async function POST() {
  const bundles = await runDigestSweep(new Date());
  return Response.json({ sent: bundles.length, bundles });
}
