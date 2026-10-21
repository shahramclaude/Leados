// Single entry point for creating notifications. Owns:
//   - dedupe (one root cause -> one chain, children link to parent)
//   - the unread -> read -> archived -> reopened state machine
//   - running the interrupt policy and logging the decision
//   - realtime fan-out via the outbox (eventStore)
//   - queuing to the right digest when the policy says "batch it"

import { db } from "@/db";
import { digests, notifications } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { appendEvent } from "@/lib/eventStore";
import {
  evaluateInterruptPolicy,
  getUserAttentionPrefs,
  logInterruptDecision,
  spentToday,
  type NotificationClass,
} from "@/lib/attention";
import { bestDigestHour, recordEngagement } from "@/lib/attentionOpt";
import { localHourNow } from "@/lib/circadian";
import { maybeGenerateWeeklyReportOnExhaustion } from "@/lib/scheduler";
import { visibleDomainsForRole } from "@/lib/scoping";

export interface CreateNotificationInput {
  userId: string;
  class: NotificationClass;
  severity: number; // 1-5
  domain: string;
  entityRef?: string | null;
  title: string;
  body?: string;
  dedupeKey: string;
  actor?: string;
}

export async function createNotification(input: CreateNotificationInput) {
  const prefs = await getUserAttentionPrefs(input.userId);
  const now = new Date();
  const localHour = localHourNow(prefs.timezone, now);

  const [root] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.dedupeKey, input.dedupeKey),
        isNull(notifications.parentId),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  if (root) {
    // Existing chain: attach a child, never spawn a second root for the same
    // root cause. Only treat it as a fresh interrupt-worthy event if the
    // chain had already been archived (a "material update").
    const materialUpdate = root.state === "archived";

    const [child] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        class: input.class,
        severity: input.severity,
        domain: input.domain,
        entityRef: input.entityRef ?? root.entityRef,
        title: input.title,
        body: input.body ?? "",
        dedupeKey: input.dedupeKey,
        parentId: root.id,
        actor: input.actor ?? "system",
        state: "unread",
      })
      .returning();

    const updatedSeverity = Math.max(root.severity, input.severity);

    if (materialUpdate) {
      await db
        .update(notifications)
        .set({
          state: "unread",
          severity: updatedSeverity,
          reopenedAt: now,
          title: input.title,
          body: input.body ?? root.body,
        })
        .where(eq(notifications.id, root.id));

      await routeThroughInterruptPolicy({
        notificationId: root.id,
        userId: input.userId,
        cls: input.class,
        domain: input.domain,
        severity: updatedSeverity,
        prefs,
        localHour,
        now,
      });
    } else {
      // Quietly fold into the existing chain: bump severity if needed, keep
      // the user's current read/unread state (no extra interrupt spend),
      // but still surface a lightweight realtime "chain updated" frame so
      // open UIs can refresh counts without a new interrupt.
      if (updatedSeverity !== root.severity) {
        await db
          .update(notifications)
          .set({ severity: updatedSeverity })
          .where(eq(notifications.id, root.id));
      }
      const visible = await visibleRolesForDomain(input.domain);
      await appendEvent({
        type: "notification",
        domain: input.domain,
        entityRef: input.entityRef ?? root.entityRef,
        visibleRoles: visible,
        payload: {
          notificationId: root.id,
          childId: child.id,
          dedupeKey: input.dedupeKey,
          chainUpdate: true,
          severity: updatedSeverity,
        },
      });
    }

    return { id: root.id, chained: true, childId: child.id };
  }

  // No existing chain: this is a brand new root cause.
  const [created] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      class: input.class,
      severity: input.severity,
      domain: input.domain,
      entityRef: input.entityRef ?? null,
      title: input.title,
      body: input.body ?? "",
      dedupeKey: input.dedupeKey,
      actor: input.actor ?? "system",
      state: "unread",
      channelPrefsSnapshot: Object.fromEntries(
        Object.entries(prefs.perClass[input.class] ?? {}).map(([k, v]) => [k, Boolean(v)]),
      ),
    })
    .returning();

  await routeThroughInterruptPolicy({
    notificationId: created.id,
    userId: input.userId,
    cls: input.class,
    domain: input.domain,
    severity: input.severity,
    prefs,
    localHour,
    now,
  });

  return { id: created.id, chained: false, childId: null };
}

async function visibleRolesForDomain(domain: string): Promise<string[]> {
  // Notifications are personal (single recipient) but still carry a role
  // envelope so the same outbox + stream pipeline can scope them; a
  // personal notification is marked visible to all roles that can see its
  // domain (the per-user filter happens at read time via userId).
  const allRoles = ["admin", "exec", "finance", "ops", "viewer"] as const;
  const visible: string[] = [];
  for (const role of allRoles) {
    const domains = await visibleDomainsForRole(role);
    if (domains.has(domain) || domains.has("*")) visible.push(role);
  }
  return visible.length ? visible : ["admin"];
}

async function routeThroughInterruptPolicy(args: {
  notificationId: string;
  userId: string;
  cls: NotificationClass;
  domain: string;
  severity: number;
  prefs: Awaited<ReturnType<typeof getUserAttentionPrefs>>;
  localHour: number;
  now: Date;
}) {
  const decision = await evaluateInterruptPolicy({
    userId: args.userId,
    class: args.cls,
    domain: args.domain,
    severity: args.severity,
    prefs: args.prefs,
    now: args.now,
  });

  await logInterruptDecision({
    userId: args.userId,
    notificationId: args.notificationId,
    class: args.cls,
    domain: args.domain,
    decision,
    localHour: args.localHour,
  });

  const visibleRoles = await visibleRolesForDomain(args.domain);

  if (decision.decision === "interrupted") {
    await appendEvent({
      type: "notification",
      domain: args.domain,
      entityRef: null,
      visibleRoles,
      payload: {
        notificationId: args.notificationId,
        userId: args.userId,
        class: args.cls,
        severity: args.severity,
        decision: decision.decision,
        reason: decision.reason,
      },
    });
    await recordEngagement({ userId: args.userId, class: args.cls, hourOfDay: args.localHour, signal: "sent", now: args.now });

    if (decision.countedAgainstBudget) {
      const spend = await spentToday(args.userId, args.prefs.timezone, args.now);
      if (spend >= args.prefs.dailyInterruptBudget) {
        await maybeGenerateWeeklyReportOnExhaustion(args.userId);
      }
    }
    return;
  }

  // Queued to digest or suppressed by quiet hours: find-or-create the next
  // pending digest for this user and append this notification id.
  const timing = await bestDigestHour(args.userId, args.cls, args.domain);
  const scheduledFor = nextOccurrenceOfHour(timing.hour, args.now);

  const [pending] = await db
    .select()
    .from(digests)
    .where(and(eq(digests.userId, args.userId), isNull(digests.sentAt)))
    .orderBy(desc(digests.createdAt))
    .limit(1);

  if (pending) {
    await db
      .update(digests)
      .set({
        notificationIds: [...pending.notificationIds, args.notificationId],
        explain: timing.explain,
        scheduledFor: timing.confidence === "low" ? pending.scheduledFor : scheduledFor,
      })
      .where(eq(digests.id, pending.id));
  } else {
    await db.insert(digests).values({
      userId: args.userId,
      scheduledFor,
      notificationIds: [args.notificationId],
      explain: timing.explain,
    });
  }
}

function nextOccurrenceOfHour(hour: number, now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
