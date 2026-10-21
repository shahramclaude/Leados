// Adaptive batching: learns, per (user, notification class, hour-of-day),
// how likely the user is to open/act-on/dismiss a digest sent at that hour,
// and uses that to pick when to actually send.
//
// METHOD (and why): decayed-statistics counters, not a contextual bandit.
//   - Each (user, class, hour) cell stores four exponentially-decayed
//     running totals: sent, opened, actedOn, dismissed.
//   - On every new observation we age the existing totals by the elapsed
//     time (half-life = 14 days, see temporal.decayWeight) before adding the
//     new 1.0, so a user's behavior from 3 months ago matters much less than
//     last week's, without ever discarding history outright or needing a
//     background decay job.
//   - The "engagement score" for a cell is a Laplace-smoothed blend of open
//     rate and act rate: score = 0.35*openRate + 0.65*actRate, smoothed with
//     +1/+2 pseudo-counts so a single lucky/unlucky event can't dominate.
//
// Why not a multi-armed bandit (e.g. Thompson sampling over hours)? Each
// user generates at most a handful of notifications per class per day, so
// an explore/exploit bandit would spend most of its (tiny) sample budget
// exploring instead of serving the user well, and its output is harder to
// turn into a one-line human explanation. Decayed statistics give almost
// the same adaptivity with a trivially explainable score and sane behavior
// from the very first observation (thanks to Laplace smoothing), which
// matters because every scheduling decision must be explainable per the
// product requirement. This is a documented, deliberate trade-off — not an
// oversight — and the module is small enough to swap for a bandit later if
// volume ever justifies it.

import { db } from "@/db";
import { attentionStats } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { NotificationClass } from "@/lib/attention";
import { decayWeight } from "@/lib/temporal";

export type EngagementSignal = "sent" | "opened" | "acted" | "dismissed";

const HALF_LIFE_DAYS = 14;

export async function recordEngagement(args: {
  userId: string;
  class: NotificationClass;
  hourOfDay: number;
  signal: EngagementSignal;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  const [existing] = await db
    .select()
    .from(attentionStats)
    .where(
      and(
        eq(attentionStats.userId, args.userId),
        eq(attentionStats.class, args.class),
        eq(attentionStats.hourOfDay, args.hourOfDay),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(attentionStats).values({
      userId: args.userId,
      class: args.class,
      hourOfDay: args.hourOfDay,
      sent: args.signal === "sent" ? 1 : 0,
      opened: args.signal === "opened" ? 1 : 0,
      actedOn: args.signal === "acted" ? 1 : 0,
      dismissed: args.signal === "dismissed" ? 1 : 0,
      updatedAt: now,
    });
    return;
  }

  const ageDays = (now.getTime() - existing.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
  const w = decayWeight(Math.max(0, ageDays), HALF_LIFE_DAYS);

  await db
    .update(attentionStats)
    .set({
      sent: existing.sent * w + (args.signal === "sent" ? 1 : 0),
      opened: existing.opened * w + (args.signal === "opened" ? 1 : 0),
      actedOn: existing.actedOn * w + (args.signal === "acted" ? 1 : 0),
      dismissed: existing.dismissed * w + (args.signal === "dismissed" ? 1 : 0),
      updatedAt: now,
    })
    .where(
      and(
        eq(attentionStats.userId, args.userId),
        eq(attentionStats.class, args.class),
        eq(attentionStats.hourOfDay, args.hourOfDay),
      ),
    );
}

export interface HourScore {
  hour: number;
  score: number;
  sent: number;
  confidence: "low" | "medium" | "high";
}

function engagementScore(opened: number, actedOn: number, sent: number): number {
  const openRate = (opened + 1) / (sent + 2);
  const actRate = (actedOn + 1) / (sent + 2);
  return 0.35 * openRate + 0.65 * actRate;
}

export async function hourlyScores(userId: string, cls: NotificationClass): Promise<HourScore[]> {
  const rows = await db
    .select()
    .from(attentionStats)
    .where(and(eq(attentionStats.userId, userId), eq(attentionStats.class, cls)));

  const byHour = new Map(rows.map((r) => [r.hourOfDay, r]));
  const scores: HourScore[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const row = byHour.get(hour);
    const sent = row?.sent ?? 0;
    const score = engagementScore(row?.opened ?? 0, row?.actedOn ?? 0, sent);
    scores.push({
      hour,
      score: Number(score.toFixed(4)),
      sent: Number(sent.toFixed(2)),
      confidence: sent >= 8 ? "high" : sent >= 2 ? "medium" : "low",
    });
  }
  return scores;
}

export interface DigestTimingDecision {
  hour: number;
  explain: string;
  confidence: "low" | "medium" | "high";
}

const DEFAULT_HOUR = 9; // sensible default: start of workday

export async function bestDigestHour(userId: string, cls: NotificationClass, domain: string): Promise<DigestTimingDecision> {
  const scores = await hourlyScores(userId, cls);
  const totalSent = scores.reduce((acc, s) => acc + s.sent, 0);

  if (totalSent < 3) {
    return {
      hour: DEFAULT_HOUR,
      confidence: "low",
      explain: `not enough history yet for ${domain}/${cls} — defaulting to ${DEFAULT_HOUR}:00 local`,
    };
  }

  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    hour: best.hour,
    confidence: best.confidence,
    explain: `sent at ${best.hour}:00 because you typically act on ${domain} ${cls} notifications around that hour (engagement score ${best.score.toFixed(2)}, based on ${best.sent.toFixed(1)} decayed observations)`,
  };
}
