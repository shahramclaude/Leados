// LEADOS Part 14 — interrupt fatigue signal.
// A soft (non-blocking) adaptive signal distinct from the hard budget gate in
// cognitiveLoad.ts. Fatigue looks at recent dismiss-without-action rate per
// class and feeds it into attentionOpt's digest-timing bandit as a damping
// factor, and into the "explain this decision" string shown in the UI.
import { db } from "@/db";
import { interruptEvents } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export interface FatigueSignal {
  class: string;
  sampleSize: number;
  dismissRate: number; // 0..1, share of recent delivered interrupts dismissed without action
  fatigued: boolean; // true when dismissRate is high enough to warrant damping
}

const LOOKBACK = 20;
const FATIGUE_THRESHOLD = 0.6;

export async function getFatigueSignal(userId: string, klass: string): Promise<FatigueSignal> {
  const rows = await db
    .select({ actedOn: interruptEvents.actedOn, dismissed: interruptEvents.dismissed, outcome: interruptEvents.outcome })
    .from(interruptEvents)
    .where(and(eq(interruptEvents.userId, userId), eq(interruptEvents.class, klass)))
    .orderBy(desc(interruptEvents.createdAt))
    .limit(LOOKBACK);

  const delivered = rows.filter((r) => r.outcome === "delivered");
  if (delivered.length === 0) {
    return { class: klass, sampleSize: 0, dismissRate: 0, fatigued: false };
  }
  const dismissedCount = delivered.filter((r) => r.dismissed && !r.actedOn).length;
  const dismissRate = dismissedCount / delivered.length;
  return {
    class: klass,
    sampleSize: delivered.length,
    dismissRate,
    fatigued: delivered.length >= 5 && dismissRate >= FATIGUE_THRESHOLD,
  };
}
