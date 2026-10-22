// LEADOS Part 14 — adaptive digest timing.
// Maintains a decayed engagement score per (user, class, hour-of-day) and
// picks the best upcoming digest send time with an epsilon-greedy bandit.
// Every decision returns a human-readable explanation string so the UI can
// show "sent now because…" (see docs/REALTIME.md "Explainability" section).
import { db } from "@/db";
import { engagementStats } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decayedUpdate } from "./temporal";

const EPSILON = 0.15; // exploration rate
const DEFAULT_SCORE = 0.5;

export interface EngagementRow {
  hourOfDay: number;
  score: number;
  samples: number;
}

export async function recordEngagement(userId: string, klass: string, hourOfDay: number, acted: boolean): Promise<void> {
  const [existing] = await db
    .select()
    .from(engagementStats)
    .where(and(eq(engagementStats.userId, userId), eq(engagementStats.class, klass), eq(engagementStats.hourOfDay, hourOfDay)))
    .limit(1);

  const observation = acted ? 1 : 0;
  const nextScore = decayedUpdate(existing ? Number(existing.score) : DEFAULT_SCORE, existing?.samples ?? 0, observation);
  const nextSamples = (existing?.samples ?? 0) + 1;

  if (existing) {
    await db
      .update(engagementStats)
      .set({ score: nextScore.toFixed(4), samples: nextSamples, updatedAt: new Date() })
      .where(eq(engagementStats.id, existing.id));
  } else {
    await db.insert(engagementStats).values({
      userId,
      class: klass,
      hourOfDay,
      score: nextScore.toFixed(4),
      samples: nextSamples,
    });
  }
}

export async function getEngagementCurve(userId: string, klass: string): Promise<EngagementRow[]> {
  const rows = await db
    .select()
    .from(engagementStats)
    .where(and(eq(engagementStats.userId, userId), eq(engagementStats.class, klass)));
  return rows.map((r) => ({ hourOfDay: r.hourOfDay, score: Number(r.score), samples: r.samples }));
}

export interface DigestTimingDecision {
  hourOfDay: number;
  explored: boolean;
  explanation: string;
  candidateScores: Array<{ hourOfDay: number; score: number; samples: number }>;
}

/**
 * Pick the best hour-of-day (local time) to send the next digest, from a set
 * of candidate hours (typically the next N quiet-hours-safe slots).
 */
export async function pickDigestHour(
  userId: string,
  klass: string,
  candidateHours: number[],
  random: () => number = Math.random,
): Promise<DigestTimingDecision> {
  const curve = await getEngagementCurve(userId, klass);
  const byHour = new Map(curve.map((c) => [c.hourOfDay, c]));
  const candidateScores = candidateHours.map((h) => {
    const row = byHour.get(h);
    return { hourOfDay: h, score: row?.score ?? DEFAULT_SCORE, samples: row?.samples ?? 0 };
  });

  const totalSamples = candidateScores.reduce((sum, c) => sum + c.samples, 0);

  // Not enough data yet -> use the earliest candidate (soonest delivery),
  // explained as "not enough history".
  if (totalSamples < 3) {
    const pick = candidateScores[0];
    return {
      hourOfDay: pick.hourOfDay,
      explored: false,
      explanation: `sent at ${pick.hourOfDay}:00 because there isn't enough engagement history yet for "${klass}" — defaulting to the soonest available slot`,
      candidateScores,
    };
  }

  const explore = random() < EPSILON;
  if (explore) {
    const pick = candidateScores[Math.floor(random() * candidateScores.length)];
    return {
      hourOfDay: pick.hourOfDay,
      explored: true,
      explanation: `sent at ${pick.hourOfDay}:00 as an exploration slot (${Math.round(EPSILON * 100)}% of the time we try a slot outside your usual pattern to keep learning)`,
      candidateScores,
    };
  }

  const best = candidateScores.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    hourOfDay: best.hourOfDay,
    explored: false,
    explanation: `sent at ${best.hourOfDay}:00 because you act on ${klass} notifications ${Math.round(best.score * 100)}% of the time in that hour, the best of your available slots (based on ${best.samples} past observations)`,
    candidateScores,
  };
}
