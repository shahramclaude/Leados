// Loop-closure engine: "everything has a next step and an owner, or it is
// explicitly parked" — the product's invariant. Open-loop counts surface as a
// health metric per meeting/decision/ritual surface.

export type LoopSurfaceType = "meeting" | "decision" | "ritual" | "commitment" | "delegation";

export type LoopHorizon = "short" | "long" | "exploratory";

export type Loop = {
  id: string;
  surfaceType: LoopSurfaceType;
  surfaceRef: Record<string, unknown>;
  ownerId: string | null;
  nextStep: string | null;
  status: "open" | "closed" | "parked";
  parkedReason: string | null;
  parkedUntil: Date | null;
  openedAt: Date;
  closedAt: Date | null;
  horizon?: LoopHorizon;
};

export function isWellFormed(loop: Loop): boolean {
  if (loop.status === "closed") return true;
  if (loop.status === "parked") return !!loop.parkedReason;
  // open: must have BOTH a next step and an owner, or it violates the invariant
  return !!loop.nextStep && !!loop.ownerId;
}

export function invariantViolations(loops: Loop[]): Loop[] {
  return loops.filter((l) => !isWellFormed(l));
}

export type LoopAgeBucket = "0-2d" | "3-7d" | "8-14d" | "15d+";

export function ageBucket(loop: Loop, now: Date): LoopAgeBucket {
  const ageDays = (now.getTime() - loop.openedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 2) return "0-2d";
  if (ageDays <= 7) return "3-7d";
  if (ageDays <= 14) return "8-14d";
  return "15d+";
}

export type LoopHealthReport = {
  bySurface: Record<LoopSurfaceType, { open: number; parked: number; closed: number; violations: number }>;
  byAge: Record<LoopAgeBucket, number>;
  totalOpen: number;
  totalParked: number;
  violationCount: number;
};

export function computeLoopHealth(loops: Loop[], now: Date): LoopHealthReport {
  const surfaces: LoopSurfaceType[] = ["meeting", "decision", "ritual", "commitment", "delegation"];
  const bySurface = Object.fromEntries(
    surfaces.map((s) => [s, { open: 0, parked: 0, closed: 0, violations: 0 }]),
  ) as LoopHealthReport["bySurface"];
  const byAge: Record<LoopAgeBucket, number> = { "0-2d": 0, "3-7d": 0, "8-14d": 0, "15d+": 0 };

  let totalOpen = 0;
  let totalParked = 0;
  let violationCount = 0;

  for (const loop of loops) {
    const bucket = bySurface[loop.surfaceType];
    if (loop.status === "open") {
      bucket.open++;
      totalOpen++;
      byAge[ageBucket(loop, now)]++;
    } else if (loop.status === "parked") {
      bucket.parked++;
      totalParked++;
    } else {
      bucket.closed++;
    }
    if (!isWellFormed(loop)) {
      bucket.violations++;
      violationCount++;
    }
  }

  return { bySurface, byAge, totalOpen, totalParked, violationCount };
}

// ---------------------------------------------------------------------------
// Parking lot + revival + "better left open" recommendation
// ---------------------------------------------------------------------------

export function dueForRevival(loop: Loop, now: Date): boolean {
  return loop.status === "parked" && !!loop.parkedUntil && loop.parkedUntil.getTime() <= now.getTime();
}

/**
 * Some loop classes are genuinely better left open rather than forced to a
 * false deadline: long-horizon aspirational goals and exploratory threads
 * (e.g. "someday explore X") shouldn't be pressured into a fake owner/next
 * step just to satisfy the invariant. For these, PARKING (with an explicit
 * reason and an optional revival date) *is* the correct closure, not a
 * cop-out — the invariant is satisfied by "owner+next-step OR parked", and
 * parked-with-no-revival-date is a legitimate terminal-ish state for
 * exploratory horizon items.
 */
export function recommendParkOverForcedClose(loop: Loop): { recommend: boolean; reason: string } {
  if (loop.horizon === "exploratory") {
    return { recommend: true, reason: "exploratory horizon — forcing a fake owner/deadline would misrepresent its status; park with a revival window instead" };
  }
  if (loop.horizon === "long" && !loop.nextStep) {
    return { recommend: true, reason: "long-horizon aspirational item with no concrete next action yet — park it rather than invent a placeholder step" };
  }
  return { recommend: false, reason: "this loop has (or should have) a concrete near-term next step; closing or parking without one would hide real work" };
}
