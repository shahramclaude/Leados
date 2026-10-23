/**
 * STAND-IN for Part 48's commitments module. Not present in this repository
 * snapshot (confirmed via grep before writing). Part 51's anti-manipulation
 * policy requires that outcome feedback be gated on *measured follow-through*
 * rather than raw acceptance clicks. This file defines the minimal shape of
 * a "commitment" the real Part 48 module would expose; Part 51's outcome API
 * accepts payloads in this shape. Replace with the real Part 48 client when
 * it lands.
 */

export interface CommitmentFollowThrough {
  commitmentId: string;
  orgId: string;
  interventionId: string;
  /** Did the org actually do the thing (not just click "accept")? */
  completed: boolean;
  /** Optional measured effect magnitude, 0..1, if available at follow-through time. */
  measuredEffect?: number;
  measuredAt: string; // ISO timestamp
}

/**
 * Validates that a payload claiming to be a measured commitment
 * follow-through actually carries the fields the anti-manipulation policy
 * requires (completed boolean must be explicit — no implicit "truthy accept"
 * coercion from engagement events).
 */
export function isValidCommitmentFollowThrough(payload: unknown): payload is CommitmentFollowThrough {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.commitmentId === "string" &&
    typeof p.orgId === "string" &&
    typeof p.interventionId === "string" &&
    typeof p.completed === "boolean" &&
    typeof p.measuredAt === "string"
  );
}
