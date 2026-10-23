// Assumption registers for time-boxed decisions under pressure.
//
// Every crisis decision made on incomplete information records explicit
// assumptions with a "re-verify at T+Nh" timestamp. SEAM: Part 10's kernel
// task scheduler should own the actual recurring job; in this self-contained
// build, POST /api/crisis/assumptions/tick performs the same evaluation and
// can be invoked by cron, by the kernel once merged, or manually in a drill.

export type AssumptionStatus = "pending" | "reverified_true" | "reverified_false" | "overdue";

export interface AssumptionLike {
  id: string;
  status: AssumptionStatus;
  reverifyAt: Date;
}

export interface TickResult {
  id: string;
  previousStatus: AssumptionStatus;
  newStatus: AssumptionStatus;
  shouldEscalate: boolean;
}

/**
 * Evaluate a single assumption against "now". If it is still pending and the
 * reverify time has passed, it becomes "overdue" and must escalate to the
 * crisis commander (per the standing order: "auto-reverification tasks via
 * Part 10" — escalation is the fallback when the task isn't actioned).
 */
export function evaluateAssumptionTick(a: AssumptionLike, now: Date): TickResult {
  if (a.status !== "pending") {
    return { id: a.id, previousStatus: a.status, newStatus: a.status, shouldEscalate: false };
  }

  if (now.getTime() >= a.reverifyAt.getTime()) {
    return { id: a.id, previousStatus: a.status, newStatus: "overdue", shouldEscalate: true };
  }

  return { id: a.id, previousStatus: a.status, newStatus: "pending", shouldEscalate: false };
}

export function evaluateAssumptionTicks(assumptions: AssumptionLike[], now: Date): TickResult[] {
  return assumptions.map((a) => evaluateAssumptionTick(a, now));
}
