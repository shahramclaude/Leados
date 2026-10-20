// Fatigue layer: tracks how "worn down" a user's attention is based on
// recent interrupt volume and how they responded to past notifications.
// Dismissing things quickly without acting raises fatigue (interrupts were
// probably not worth it); opening + acting lowers it.

import { db } from "@/db";
import { attentionDecisions, notificationFeedback } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export interface FatigueState {
  score: number; // 0 (fresh) .. 100 (exhausted)
  interruptsLastHour: number;
  dismissRate: number; // 0..1 across recent feedback
}

const LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 hours of signal

export async function getFatigueState(userId: string, now: Date = new Date()): Promise<FatigueState> {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [recentDecisions, recentFeedback] = await Promise.all([
    db
      .select()
      .from(attentionDecisions)
      .where(and(eq(attentionDecisions.userId, userId), gte(attentionDecisions.createdAt, since)))
      .orderBy(desc(attentionDecisions.createdAt))
      .limit(200),
    db
      .select()
      .from(notificationFeedback)
      .where(and(eq(notificationFeedback.userId, userId), gte(notificationFeedback.createdAt, since)))
      .orderBy(desc(notificationFeedback.createdAt))
      .limit(200),
  ]);

  const interruptsLastHour = recentDecisions.filter(
    (d) => d.decision === "interrupt" && d.createdAt >= hourAgo,
  ).length;

  const dismissed = recentFeedback.filter((f) => f.action === "dismissed").length;
  const acted = recentFeedback.filter((f) => f.action === "acted" || f.action === "opened").length;
  const totalFeedback = dismissed + acted;
  const dismissRate = totalFeedback > 0 ? dismissed / totalFeedback : 0;

  // Fatigue score: volume pressure (interrupts/hour, capped) + dismiss-rate pressure.
  const volumePressure = Math.min(100, interruptsLastHour * 18);
  const dismissPressure = dismissRate * 100;
  const score = Math.round(Math.min(100, volumePressure * 0.6 + dismissPressure * 0.4));

  return { score, interruptsLastHour, dismissRate: Number(dismissRate.toFixed(2)) };
}
