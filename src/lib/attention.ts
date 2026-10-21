// The interrupt policy state machine + daily interrupt budget enforcement.
//
// Policy (documented here because this file IS the policy declaration this
// part builds on top of):
//
//   1. severity-5 findings ALWAYS interrupt. They bypass quiet hours, deep
//      work, and the daily budget. They do not consume budget. This is the
//      one deliberate "money can't buy this" exception — true emergencies.
//   2. Everything else interrupts only if the user has explicitly opted the
//      notification class into interrupts (channelPrefs.perClass[class].optInInterrupt).
//   3. Opted-in, non-critical candidates are still blocked by (in order):
//        a. quiet hours (per-user, timezone-aware)
//        b. an active deep-work block (cognitive load signal, if any)
//        c. an exhausted daily interrupt budget
//      Any of these routes the notification to the next digest instead.
//   4. Everything not covered above batches into the digest by default.
//
// Every decision is written to `interrupt_log` — this is both the
// enforcement ledger (so budget checks are exact, not estimated) and the
// training data for adaptive batching in attentionOpt.ts.

import { db } from "@/db";
import { interruptLog, notificationPrefs } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { isQuietNow } from "@/lib/circadian";
import { assessCognitiveLoad, type CognitiveLoadSignals } from "@/lib/cognitiveLoad";
import { startOfLocalDay } from "@/lib/temporal";

export type NotificationClass = "alert" | "action" | "info" | "digest";

export interface ClassPref {
  inApp: boolean;
  email: boolean;
  webhook: boolean;
  optInInterrupt: boolean;
}

export interface UserAttentionPrefs {
  userId: string;
  timezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  dailyInterruptBudget: number;
  perClass: Record<string, ClassPref>;
}

export type InterruptDecisionKind = "interrupted" | "queued_to_digest" | "suppressed_quiet_hours";

export interface InterruptDecision {
  decision: InterruptDecisionKind;
  reason: string;
  countedAgainstBudget: boolean;
}

export const DEFAULT_CLASS_PREFS: Record<NotificationClass, ClassPref> = {
  alert: { inApp: true, email: false, webhook: false, optInInterrupt: true },
  action: { inApp: true, email: false, webhook: false, optInInterrupt: true },
  info: { inApp: true, email: false, webhook: false, optInInterrupt: false },
  digest: { inApp: true, email: false, webhook: false, optInInterrupt: false },
};

export async function getUserAttentionPrefs(userId: string): Promise<UserAttentionPrefs> {
  const [row] = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);

  if (!row) {
    return {
      userId,
      timezone: "UTC",
      quietHoursStart: 22,
      quietHoursEnd: 7,
      dailyInterruptBudget: 6,
      perClass: DEFAULT_CLASS_PREFS,
    };
  }

  return {
    userId,
    timezone: "UTC",
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    dailyInterruptBudget: row.dailyInterruptBudget,
    perClass: { ...DEFAULT_CLASS_PREFS, ...row.perClass },
  };
}

export async function spentToday(userId: string, timezone: string, now: Date = new Date()): Promise<number> {
  const dayStart = startOfLocalDay(now, timezone);
  const rows = await db
    .select()
    .from(interruptLog)
    .where(
      and(
        eq(interruptLog.userId, userId),
        eq(interruptLog.countedAgainstBudget, true),
        gte(interruptLog.occurredAt, dayStart),
      ),
    );
  return rows.length;
}

export async function minutesSinceLastInterrupt(userId: string, now: Date = new Date()): Promise<number | null> {
  const [row] = await db
    .select()
    .from(interruptLog)
    .where(and(eq(interruptLog.userId, userId), eq(interruptLog.countedAgainstBudget, true)))
    .orderBy(desc(interruptLog.occurredAt))
    .limit(1);
  if (!row) return null;
  return (now.getTime() - row.occurredAt.getTime()) / 60_000;
}

export async function evaluateInterruptPolicy(args: {
  userId: string;
  class: NotificationClass;
  domain: string;
  severity: number;
  prefs: UserAttentionPrefs;
  cognitiveLoad?: CognitiveLoadSignals | null;
  now?: Date;
}): Promise<InterruptDecision> {
  const now = args.now ?? new Date();

  // Rule 1: severity-5 always interrupts, bypasses everything, costs nothing.
  if (args.severity >= 5) {
    return {
      decision: "interrupted",
      reason: "severity-5 findings always interrupt (policy override, does not consume budget)",
      countedAgainstBudget: false,
    };
  }

  const classPref = args.prefs.perClass[args.class] ?? DEFAULT_CLASS_PREFS[args.class];
  if (!classPref?.optInInterrupt) {
    return {
      decision: "queued_to_digest",
      reason: `class "${args.class}" is not opted in to interrupts — batched to digest`,
      countedAgainstBudget: false,
    };
  }

  if (
    isQuietNow(
      { timezone: args.prefs.timezone, quietHoursStart: args.prefs.quietHoursStart, quietHoursEnd: args.prefs.quietHoursEnd },
      now,
    )
  ) {
    return {
      decision: "suppressed_quiet_hours",
      reason: `quiet hours active (${args.prefs.quietHoursStart}:00-${args.prefs.quietHoursEnd}:00 local) — batched to digest`,
      countedAgainstBudget: false,
    };
  }

  const cognitive = assessCognitiveLoad(args.cognitiveLoad, now);
  if (cognitive.inDeepWork) {
    return {
      decision: "queued_to_digest",
      reason: `cognitive load guard: ${cognitive.reason} — batched to digest`,
      countedAgainstBudget: false,
    };
  }

  const spend = await spentToday(args.userId, args.prefs.timezone, now);
  if (spend >= args.prefs.dailyInterruptBudget) {
    return {
      decision: "queued_to_digest",
      reason: `daily interrupt budget exhausted (${spend}/${args.prefs.dailyInterruptBudget}) — batched to next digest`,
      countedAgainstBudget: false,
    };
  }

  return {
    decision: "interrupted",
    reason: `opted-in class within budget (${spend}/${args.prefs.dailyInterruptBudget} spent before this one)`,
    countedAgainstBudget: true,
  };
}

export async function logInterruptDecision(args: {
  userId: string;
  notificationId: string | null;
  class: NotificationClass;
  domain: string;
  decision: InterruptDecision;
  localHour: number;
}) {
  await db.insert(interruptLog).values({
    userId: args.userId,
    notificationId: args.notificationId,
    class: args.class,
    domain: args.domain,
    decision: args.decision.decision,
    reason: args.decision.reason,
    countedAgainstBudget: args.decision.countedAgainstBudget,
    localHour: args.localHour,
  });
}
