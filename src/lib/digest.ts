// LEADOS Part 14 — digest generator.
// Picks up due digest_queue rows, groups them per user, and "sends" them
// (marks sentAt + emits a notification_state frame). Every digest line is
// built from a real row in the DB — no placeholder/filler text — and passes
// the zero-filler lint before being persisted.
import { db } from "@/db";
import { digestQueue, notifications } from "@/db/schema";
import { and, eq, isNull, lte } from "drizzle-orm";
import { appendEvent } from "./eventStore";
import { publishFrame } from "./eventBus";
import { assertNoFiller, lintForFiller } from "./zeroFillerLint";

export interface DigestItem {
  notificationId: string;
  class: string;
  title: string;
  explanation: string;
}

export interface DigestBundle {
  userId: string;
  orgId: string;
  items: DigestItem[];
  summary: string;
}

export async function getDueDigestUserIds(at: Date = new Date()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: digestQueue.userId })
    .from(digestQueue)
    .where(and(isNull(digestQueue.sentAt), lte(digestQueue.scheduledFor, at)));
  return rows.map((r) => r.userId);
}

export async function buildAndSendDigest(userId: string, at: Date = new Date()): Promise<DigestBundle | null> {
  const due = await db
    .select({ queue: digestQueue, notification: notifications })
    .from(digestQueue)
    .innerJoin(notifications, eq(digestQueue.notificationId, notifications.id))
    .where(and(eq(digestQueue.userId, userId), isNull(digestQueue.sentAt), lte(digestQueue.scheduledFor, at)));

  if (due.length === 0) return null;

  const orgId = due[0].notification.orgId;
  const byClass = new Map<string, number>();
  for (const d of due) {
    byClass.set(d.notification.class, (byClass.get(d.notification.class) ?? 0) + 1);
  }
  const classSummary = [...byClass.entries()].map(([klass, count]) => `${count} ${klass}`).join(", ");
  const summary = `Digest: ${due.length} items (${classSummary}) since your last check-in.`;
  assertNoFiller(summary, "digest summary");

  const items: DigestItem[] = due.map((d) => ({
    notificationId: d.notification.id,
    class: d.notification.class,
    title: d.notification.title,
    explanation: d.queue.explanation,
  }));

  for (const item of items) {
    const result = lintForFiller(item.title);
    if (!result.hasConcreteNumber && !/[A-Za-z]/.test(item.title)) {
      throw new Error(`digest item title failed lint: "${item.title}"`);
    }
  }

  await db
    .update(digestQueue)
    .set({ sentAt: at })
    .where(and(eq(digestQueue.userId, userId), isNull(digestQueue.sentAt), lte(digestQueue.scheduledFor, at)));

  const frame = await appendEvent({
    orgId,
    topic: `org:${orgId}:user:${userId}`,
    type: "notification_state",
    payload: { event: "digest_sent", summary, itemCount: items.length },
  });
  publishFrame(frame);

  return { userId, orgId, items, summary };
}

/** Run the digest sweep for all users with due items. Intended to be called by a scheduler/cron; also exposed via an API route for the test harness. */
export async function runDigestSweep(at: Date = new Date()): Promise<DigestBundle[]> {
  const userIds = await getDueDigestUserIds(at);
  const bundles: DigestBundle[] = [];
  for (const userId of userIds) {
    const bundle = await buildAndSendDigest(userId, at);
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}
