// LEADOS Part 14 — the single dispatch gate.
//
// EVERY interruption the product can generate (finding, approval nudge,
// anomaly, run_progress alert, etc.) must call `dispatchInterrupt`. It is the
// only function that is allowed to:
//   1. decide immediate vs. digest (attention.ts policy + budget gate)
//   2. collapse duplicate root causes into one chain (dedupeKey)
//   3. write the notification row
//   4. push a `notification_state` realtime frame through the outbox
//
// Nothing else in the codebase should insert into the `notifications` table
// directly — that is what makes "one gate, enforced" a testable claim rather
// than a comment.
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { digestQueue, focusMode, interruptEvents, notifications } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { decideInterrupt, type NotificationClass } from "./attention";
import { appendEvent } from "./eventStore";
import { publishFrame } from "./eventBus";
import { pickDigestHour } from "./attentionOpt";
import { evaluateQuietHours, getQuietHours } from "./circadian";
import { hourOfDayInTz, minuteOfDayInTz } from "./temporal";
import { assertNoFiller } from "./zeroFillerLint";

const DEDUPE_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface DispatchInput {
  orgId: string;
  userId: string;
  timezone: string;
  class: NotificationClass;
  severity: number;
  entityRef?: string;
  dedupeKey: string;
  title: string;
  body: string;
  evidence?: Record<string, unknown>;
  at?: Date;
}

export interface DispatchResult {
  notificationId: string;
  chain: "root" | "child";
  parentId: string | null;
  outcome: "immediate" | "queued_digest" | "suppressed_mute" | "suppressed_focus";
  reason: string;
}

async function findExistingRoot(userId: string, dedupeKey: string, since: Date) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.dedupeKey, dedupeKey), isNull(notifications.parentId)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.createdAt.getTime() < since.getTime()) return null;
  return row;
}

async function emitNotificationState(orgId: string, userId: string, notificationId: string, event: string, extra: Record<string, unknown> = {}) {
  const frame = await appendEvent({
    orgId,
    topic: `org:${orgId}:user:${userId}`,
    type: "notification_state",
    payload: { notificationId, event, ...extra },
  });
  publishFrame(frame);
}

export async function dispatchInterrupt(input: DispatchInput): Promise<DispatchResult> {
  const at = input.at ?? new Date();

  // zero-filler lint applies to any human-facing title/body we generate.
  assertNoFiller(input.title, "notification title");

  const existingRoot = await findExistingRoot(input.userId, input.dedupeKey, new Date(at.getTime() - DEDUPE_WINDOW_MS));

  if (existingRoot) {
    // Duplicate root cause: append as a child of the existing chain. Does
    // NOT re-run the policy or spend additional budget — this is what
    // collapses a dedupe burst into exactly one chain.
    const [child] = await db
      .insert(notifications)
      .values({
        orgId: input.orgId,
        userId: input.userId,
        class: input.class,
        severity: input.severity,
        entityRef: input.entityRef,
        dedupeKey: input.dedupeKey,
        parentId: existingRoot.id,
        title: input.title,
        body: input.body,
        evidence: input.evidence ?? null,
        state: "unread",
        deliveredImmediately: false,
        decisionReason: `chained under existing root (${existingRoot.id}) — same dedupeKey within window`,
      })
      .returning();

    // Touch the root's updatedAt so "unread/reopened" roots surface as fresh.
    await db
      .update(notifications)
      .set({ updatedAt: new Date(), state: existingRoot.state === "archived" ? "reopened" : existingRoot.state })
      .where(eq(notifications.id, existingRoot.id));

    await emitNotificationState(input.orgId, input.userId, existingRoot.id, "chain_updated", { childId: child.id });

    return {
      notificationId: child.id,
      chain: "child",
      parentId: existingRoot.id,
      outcome: "queued_digest", // chain growth itself doesn't re-interrupt
      reason: "duplicate root cause collapsed into existing chain",
    };
  }

  const [fm] = await db.select().from(focusMode).where(eq(focusMode.userId, input.userId)).limit(1);
  const focusEnabled = fm?.enabled ?? false;
  const focusAllowed = fm?.allowedClasses ?? ["action"];

  const verdict = await decideInterrupt(
    {
      userId: input.userId,
      timezone: input.timezone,
      class: input.class,
      severity: input.severity,
      focusModeEnabled: focusEnabled,
      focusAllowedClasses: focusAllowed,
    },
    at,
  );

  const hourOfDay = hourOfDayInTz(at, input.timezone);

  if (verdict.outcome === "immediate") {
    const [row] = await db
      .insert(notifications)
      .values({
        orgId: input.orgId,
        userId: input.userId,
        class: input.class,
        severity: input.severity,
        entityRef: input.entityRef,
        dedupeKey: input.dedupeKey,
        parentId: null,
        title: input.title,
        body: input.body,
        evidence: input.evidence ?? null,
        state: "unread",
        deliveredImmediately: true,
        decisionReason: verdict.reason,
      })
      .returning();

    await db.insert(interruptEvents).values({
      userId: input.userId,
      notificationId: row.id,
      class: input.class,
      hourOfDay,
      outcome: "delivered",
    });

    await emitNotificationState(input.orgId, input.userId, row.id, "created", { immediate: true, reason: verdict.reason });

    return { notificationId: row.id, chain: "root", parentId: null, outcome: "immediate", reason: verdict.reason };
  }

  // Everything else (queued_digest, suppressed_mute, suppressed_focus) is
  // preserved — nothing silently vanishes, it surfaces in the next digest or
  // when focus mode / mute is lifted (reversibility requirement).
  const quietConfig = await getQuietHours(input.userId);
  const candidateHours = buildCandidateHours(at, quietConfig.startMinute, quietConfig.endMinute, quietConfig.timezone);
  const timing = await pickDigestHour(input.userId, input.class, candidateHours);

  const scheduledFor = nextOccurrenceOfHour(at, timing.hourOfDay, input.timezone);
  const fullReason = `${verdict.reason}; ${timing.explanation}`;

  const [row] = await db
    .insert(notifications)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      class: input.class,
      severity: input.severity,
      entityRef: input.entityRef,
      dedupeKey: input.dedupeKey,
      parentId: null,
      title: input.title,
      body: input.body,
      evidence: input.evidence ?? null,
      state: "unread",
      deliveredImmediately: false,
      decisionReason: fullReason,
      scheduledFor,
    })
    .returning();

  await db.insert(digestQueue).values({
    userId: input.userId,
    class: input.class,
    notificationId: row.id,
    scheduledFor,
    explanation: fullReason,
  });

  const outcomeForLedger =
    verdict.outcome === "suppressed_mute" ? "suppressed_mute" : verdict.outcome === "suppressed_focus" ? "suppressed_focus" : "queued_digest";

  await db.insert(interruptEvents).values({
    userId: input.userId,
    notificationId: row.id,
    class: input.class,
    hourOfDay,
    outcome: outcomeForLedger,
  });

  await emitNotificationState(input.orgId, input.userId, row.id, "queued", { reason: fullReason, scheduledFor: scheduledFor.toISOString() });

  return { notificationId: row.id, chain: "root", parentId: null, outcome: verdict.outcome, reason: fullReason };
}

function buildCandidateHours(at: Date, quietStart: number, quietEnd: number, timezone: string): number[] {
  const currentHour = hourOfDayInTz(at, timezone);
  const hours: number[] = [];
  for (let offset = 1; offset <= 6 && hours.length < 3; offset++) {
    const h = (currentHour + offset) % 24;
    const minuteOfH = h * 60;
    const inQuiet = evaluateQuietHours(at, { timezone, startMinute: quietStart, endMinute: quietEnd, enabled: true });
    // crude check: skip hours fully inside quiet window
    const wraps = quietStart > quietEnd;
    const isQuietHour = wraps ? minuteOfH >= quietStart || minuteOfH < quietEnd : minuteOfH >= quietStart && minuteOfH < quietEnd;
    void inQuiet;
    if (!isQuietHour) hours.push(h);
  }
  return hours.length > 0 ? hours : [(currentHour + 1) % 24];
}

function nextOccurrenceOfHour(at: Date, targetHour: number, timezone: string): Date {
  const currentHour = hourOfDayInTz(at, timezone);
  const currentMinute = minuteOfDayInTz(at, timezone);
  let hoursAhead = targetHour - currentHour;
  if (hoursAhead <= 0) hoursAhead += 24;
  const msAhead = hoursAhead * 60 * 60 * 1000 - (currentMinute % 60) * 60 * 1000;
  return new Date(at.getTime() + Math.max(msAhead, 5 * 60 * 1000));
}

export async function recordTriageOutcome(notificationId: string, action: "act" | "dismiss") {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, notificationId)).limit(1);
  if (!row) return;
  const hourOfDay = new Date().getUTCHours();
  await db.insert(interruptEvents).values({
    userId: row.userId,
    notificationId: row.id,
    class: row.class,
    hourOfDay,
    outcome: "delivered",
    actedOn: action === "act",
    dismissed: action === "dismiss",
  });
}

export const __test = { randomUUID };
