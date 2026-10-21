// Part 07 seam, reused: unattended scheduler for digest generation/send and
// the weekly attention report. This sandbox has no standing background
// worker process, so the seam is: an API route (`/api/cron/tick`) that a
// real deployment would invoke from Part 07's scheduler (cron/queue) on a
// short interval. To keep the feature correct and demonstrable without that
// external trigger, the notifications list/stream routes also opportunistically
// call `runDueWork()` (cheap, idempotent, short-circuits when nothing is due)
// so due digests still fire during normal usage in this environment. This
// is documented, not hidden — see docs/REALTIME.md "Automation mandate".

import { db } from "@/db";
import { digests, interruptLog, notificationPrefs, notifications, weeklyAttentionReports } from "@/db/schema";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { appendEvent } from "@/lib/eventStore";
import { recordEngagement } from "@/lib/attentionOpt";
import { localHourNow } from "@/lib/circadian";
import { startOfWeek } from "@/lib/temporal";
import { visibleDomainsForRole } from "@/lib/scoping";
import type { NotificationClass } from "@/lib/attention";

let lastDueSweep = 0;
const SWEEP_MIN_INTERVAL_MS = 5_000; // debounce opportunistic calls

export async function runDueWork(): Promise<{ digestsSent: number }> {
  const now = Date.now();
  if (now - lastDueSweep < SWEEP_MIN_INTERVAL_MS) return { digestsSent: 0 };
  lastDueSweep = now;
  return runDueDigests();
}

export async function runDueDigests(now: Date = new Date()): Promise<{ digestsSent: number }> {
  const due = await db
    .select()
    .from(digests)
    .where(and(isNull(digests.sentAt), lte(digests.scheduledFor, now)));

  let sent = 0;
  for (const digest of due) {
    if (digest.notificationIds.length === 0) {
      await db.update(digests).set({ sentAt: now }).where(eq(digests.id, digest.id));
      continue;
    }

    const items = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, digest.userId)));
    const included = items.filter((n) => digest.notificationIds.includes(n.id));

    const [prefs] = await db
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, digest.userId))
      .limit(1);
    const timezone = "UTC";
    const localHour = localHourNow(timezone, now);

    const allRoles = ["admin", "exec", "finance", "ops", "viewer"] as const;
    const domains = new Set(included.map((i) => i.domain));
    const visibleRoles = new Set<string>();
    for (const role of allRoles) {
      const vis = await visibleDomainsForRole(role);
      for (const d of domains) {
        if (vis.has(d) || vis.has("*")) visibleRoles.add(role);
      }
    }

    await appendEvent({
      type: "notification",
      domain: included[0]?.domain ?? "general",
      entityRef: null,
      visibleRoles: [...visibleRoles],
      payload: {
        digestId: digest.id,
        userId: digest.userId,
        notificationIds: digest.notificationIds,
        explain: digest.explain,
        count: included.length,
      },
    });

    for (const item of included) {
      await recordEngagement({
        userId: digest.userId,
        class: item.class as NotificationClass,
        hourOfDay: localHour,
        signal: "sent",
        now,
      });
    }

    await db.update(digests).set({ sentAt: now }).where(eq(digests.id, digest.id));
    sent++;
  }

  return { digestsSent: sent };
}

export async function maybeGenerateWeeklyReportOnExhaustion(userId: string, now: Date = new Date()): Promise<void> {
  const weekStart = startOfWeek(now);
  const [existing] = await db
    .select()
    .from(weeklyAttentionReports)
    .where(and(eq(weeklyAttentionReports.userId, userId), eq(weeklyAttentionReports.weekStart, weekStart)))
    .limit(1);
  if (existing) return; // already generated this week
  await generateWeeklyAttentionReport(userId, now);
}

export async function generateWeeklyAttentionReport(userId: string, now: Date = new Date()) {
  const weekStart = startOfWeek(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const logs = await db
    .select()
    .from(interruptLog)
    .where(and(eq(interruptLog.userId, userId), gte(interruptLog.occurredAt, sevenDaysAgo)));

  const interruptionsReceived = logs.filter((l) => l.decision === "interrupted").length;

  const notifIds = logs.map((l) => l.notificationId).filter((id): id is string => Boolean(id));
  let actedOn = 0;
  let dismissed = 0;
  if (notifIds.length > 0) {
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of notifIds) {
      const n = byId.get(id);
      if (!n) continue;
      if (n.readAt) actedOn++;
      else if (n.archivedAt) dismissed++;
    }
  }

  // Cost estimate: ~1.5 minutes of context-switch recovery per interruption
  // (widely-cited context-switch research order-of-magnitude; treated here
  // as an explicit, adjustable estimate, NOT a measured value for this org).
  const costEstimateMinutes = interruptionsReceived * 1.5;

  const [report] = await db
    .insert(weeklyAttentionReports)
    .values({
      userId,
      weekStart,
      interruptionsReceived,
      actedOn,
      dismissed,
      costEstimateMinutes: costEstimateMinutes.toFixed(2),
    })
    .returning();
  return report;
}
