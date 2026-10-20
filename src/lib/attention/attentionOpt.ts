// Adaptive batching: learns from what a user actually opens / dismisses /
// acts on and adjusts (a) the minimum severity allowed to interrupt and
// (b) the digest cadence. Pure function of recent feedback history — no
// persisted "model", so it is always explainable and re-derivable.

import { db } from "@/db";
import { notificationFeedback, notifications } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export interface AdaptivePolicy {
  /** Minimum severity (1-5) that is allowed to interrupt for this user. */
  interruptSeverityFloor: number;
  /** Suggested minutes between digest deliveries. */
  digestIntervalMinutes: number;
  sampleSize: number;
  explanation: string[];
}

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const BASE_SEVERITY_FLOOR = 5;
const BASE_DIGEST_INTERVAL = 60;

export async function getAdaptivePolicy(userId: string, now: Date = new Date()): Promise<AdaptivePolicy> {
  const since = new Date(now.getTime() - LOOKBACK_MS);

  const rows = await db
    .select({
      action: notificationFeedback.action,
      severity: notifications.severity,
      delivery: notifications.delivery,
    })
    .from(notificationFeedback)
    .innerJoin(notifications, eq(notifications.id, notificationFeedback.notificationId))
    .where(and(eq(notificationFeedback.userId, userId), gte(notificationFeedback.createdAt, since)))
    .orderBy(desc(notificationFeedback.createdAt))
    .limit(500);

  const explanation: string[] = [];

  if (rows.length < 5) {
    explanation.push("not enough feedback history yet — using defaults");
    return {
      interruptSeverityFloor: BASE_SEVERITY_FLOOR,
      digestIntervalMinutes: BASE_DIGEST_INTERVAL,
      sampleSize: rows.length,
      explanation,
    };
  }

  const interruptRows = rows.filter((r) => r.delivery === "interrupt");
  const interruptDismissed = interruptRows.filter((r) => r.action === "dismissed").length;
  const interruptActed = interruptRows.filter((r) => r.action === "acted").length;
  const interruptDismissRate = interruptRows.length > 0 ? interruptDismissed / interruptRows.length : 0;

  let interruptSeverityFloor = BASE_SEVERITY_FLOOR;
  if (interruptRows.length >= 5 && interruptDismissRate > 0.5) {
    // User frequently dismisses interrupts without acting — tighten further
    // isn't possible past 5 (max severity), so instead we signal via digest
    // interval that we should batch more aggressively.
    explanation.push(
      `${Math.round(interruptDismissRate * 100)}% of interrupts were dismissed without action — raising digest cadence`,
    );
  } else if (interruptActed > 0) {
    explanation.push(`${interruptActed} interrupts were acted on — current threshold is working`);
  }

  const digestRows = rows.filter((r) => r.delivery === "digest");
  const digestOpened = digestRows.filter((r) => r.action === "opened" || r.action === "acted").length;
  const digestOpenRate = digestRows.length > 0 ? digestOpened / digestRows.length : 0.5;

  let digestIntervalMinutes = BASE_DIGEST_INTERVAL;
  if (digestRows.length >= 5) {
    if (digestOpenRate > 0.7) {
      // User engages heavily with digests — deliver them more often (shorter batches).
      digestIntervalMinutes = 30;
      explanation.push(`digest open rate ${Math.round(digestOpenRate * 100)}% — shortening batching interval to 30m`);
    } else if (digestOpenRate < 0.2) {
      digestIntervalMinutes = 180;
      explanation.push(`digest open rate ${Math.round(digestOpenRate * 100)}% — widening batching interval to 3h`);
    }
  }

  if (interruptDismissRate > 0.5) {
    digestIntervalMinutes = Math.min(digestIntervalMinutes, 30);
  }

  return {
    interruptSeverityFloor,
    digestIntervalMinutes,
    sampleSize: rows.length,
    explanation,
  };
}
