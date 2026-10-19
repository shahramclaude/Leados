// src/lib/temporalBeliefTracker.ts
//
// Part 1 deliverable: persistence + drift detection for belief history.

import { and, asc, gte } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { beliefSnapshots } from "@/db/schema";
import type {
  BeliefDrift,
  BeliefFabricResult,
  BeliefTrajectoryPoint,
  LatentNodeId,
} from "./types";
import { daysBetween } from "./temporal";

type Database = typeof defaultDb;

const ALERT_THRESHOLD = 0.7;
/** DESIGN PARAMETER: minimum slope (probability/day) to call a trend
 * "drifting" rather than noise. */
const DRIFT_SLOPE_THRESHOLD = 0.005;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function persistBeliefSnapshot(
  result: BeliefFabricResult,
  db: Database,
): Promise<void> {
  await db.insert(beliefSnapshots).values({
    snapshotAt: new Date(result.generatedAt),
    posteriors: result.posteriors,
    cascadeRisk: result.cascadeRisk.p,
    dominantRisk: result.dominantRisk,
    observables: result.observables,
    generatedAt: new Date(),
  });
}

/** Non-blocking wrapper for callers on a critical path. */
export function queueBeliefSnapshotPersist(result: BeliefFabricResult, db: Database): void {
  void persistBeliefSnapshot(result, db).catch((err) => {
    console.error("[temporalBeliefTracker] failed to persist belief snapshot", err);
  });
}

// ---------------------------------------------------------------------------
// Trajectory read
// ---------------------------------------------------------------------------

export async function getBeliefTrajectory(
  db: Database,
  latentNode: LatentNodeId,
  days: number,
): Promise<BeliefTrajectoryPoint[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      snapshotAt: beliefSnapshots.snapshotAt,
      posteriors: beliefSnapshots.posteriors,
    })
    .from(beliefSnapshots)
    .where(and(gte(beliefSnapshots.snapshotAt, cutoff)))
    .orderBy(asc(beliefSnapshots.snapshotAt));

  return rows
    .map((row) => {
      const marginal = (row.posteriors as Record<string, { p: number; confidence: number }>)[
        latentNode
      ];
      if (!marginal) return null;
      return {
        date: new Date(row.snapshotAt).toISOString(),
        p: marginal.p,
        confidence: marginal.confidence,
      } satisfies BeliefTrajectoryPoint;
    })
    .filter((v): v is BeliefTrajectoryPoint => v !== null);
}

// ---------------------------------------------------------------------------
// Belief drift detection — OLS linear regression, from scratch.
//
//   β = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)
//   α = (Σy - β·Σx) / n
// ---------------------------------------------------------------------------

function olsFit(points: { x: number; y: number }[]): { alpha: number; beta: number } {
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denominator = n * sumX2 - sumX * sumX;
  const beta = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const alpha = (sumY - beta * sumX) / n;
  return { alpha, beta };
}

export function detectBeliefDrift(
  node: LatentNodeId,
  trajectory: BeliefTrajectoryPoint[],
): BeliefDrift {
  const now = trajectory.length > 0 ? new Date(trajectory[trajectory.length - 1].date) : new Date();
  const windowed = trajectory.filter((pt) => daysBetween(pt.date, now) <= 14);

  if (windowed.length < 2) {
    return { node, drifting: false, ratePerDay: 0, projectedCrossing: null };
  }

  const firstDate = new Date(windowed[0].date);
  const points = windowed.map((pt) => ({
    x: daysBetween(firstDate, new Date(pt.date)),
    y: pt.p,
  }));

  const { alpha, beta } = olsFit(points);
  const lastX = points[points.length - 1].x;
  const drifting = beta > DRIFT_SLOPE_THRESHOLD;

  let projectedCrossing: Date | null = null;
  if (beta > 0) {
    const xCross = (ALERT_THRESHOLD - alpha) / beta;
    const effectiveX = Math.max(xCross, lastX);
    projectedCrossing = new Date(firstDate.getTime() + effectiveX * 86_400_000);
  }

  return { node, drifting, ratePerDay: beta, projectedCrossing };
}
