// Commitment ledger lifecycle + follow-through metrics + renegotiation chain.
//
// Renegotiation is modelled as a *chain*: renegotiating a commitment closes
// the current row with status='renegotiated' (never silently overwritten)
// and opens a new row (new id) carrying the new due date, linked via
// `renegotiatedFromId`. A `commitment_events` row records the transition.
// This guarantees "broken ≠ renamed deadline — the history shows it": you can
// always walk renegotiatedFromId backwards and see the original terms.

import type { Commitment, CommitmentStatus } from "./types";

export type CommitmentEvent = {
  id: string;
  commitmentId: string;
  type: "created" | "renegotiated" | "kept" | "broken" | "nudged" | "parked";
  fromDueAt: Date | null;
  toDueAt: Date | null;
  note: string;
  actorId: string | null;
  createdAt: Date;
};

export function deriveStatusOnTick(c: Commitment, now: Date): CommitmentStatus {
  if (c.status !== "open") return c.status;
  if (c.dueAt.getTime() < now.getTime()) return "broken";
  return "open";
}

export type RenegotiationResult = {
  closedOriginal: Commitment;
  newCommitment: Commitment;
  event: Omit<CommitmentEvent, "id" | "createdAt">;
};

export function renegotiate(
  original: Commitment,
  newDueAt: Date,
  actorId: string,
  note: string,
): RenegotiationResult {
  const closedOriginal: Commitment = {
    ...original,
    status: "renegotiated",
    updatedAt: new Date(),
  };
  const newCommitment: Commitment = {
    ...original,
    id: crypto.randomUUID(),
    dueAt: newDueAt,
    status: "open",
    renegotiatedFromId: original.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const event: Omit<CommitmentEvent, "id" | "createdAt"> = {
    commitmentId: original.id,
    type: "renegotiated",
    fromDueAt: original.dueAt,
    toDueAt: newDueAt,
    note,
    actorId,
  };
  return { closedOriginal, newCommitment, event };
}

export type FollowThroughMetrics = {
  scopeLabel: string;
  totalTerminal: number; // kept + broken + renegotiated chains resolved
  kept: number;
  broken: number;
  renegotiatedThenKept: number;
  renegotiatedThenBroken: number;
  stillOpenAfterRenegotiation: number;
  openNeverRenegotiated: number;
  keepRate: number; // kept / (kept + broken), aggregate-safe (no identities)
};

/**
 * Aggregate-safe: callers pass already-scoped (team/role) commitment lists;
 * this function never reveals which individual made which commitment — it
 * only returns counts and rates for the scope as a whole.
 */
export function computeFollowThrough(
  scopeLabel: string,
  commitments: Commitment[],
): FollowThroughMetrics {
  let kept = 0;
  let broken = 0;
  let renegotiatedThenKept = 0;
  let renegotiatedThenBroken = 0;
  let stillOpenAfterRenegotiation = 0;
  let openNeverRenegotiated = 0;

  const byId = new Map(commitments.map((c) => [c.id, c]));

  for (const c of commitments) {
    if (c.status === "renegotiated") {
      // find the leaf of this chain among the provided set, if present
      const child = commitments.find((x) => x.renegotiatedFromId === c.id);
      if (!child) continue; // chain continues outside scope; skip to avoid double count
      if (child.status === "kept") renegotiatedThenKept++;
      else if (child.status === "broken") renegotiatedThenBroken++;
      else if (child.status === "open") stillOpenAfterRenegotiation++;
      continue;
    }
    if (c.renegotiatedFromId && byId.has(c.renegotiatedFromId)) continue; // counted above
    if (c.status === "kept") kept++;
    else if (c.status === "broken") broken++;
    else if (c.status === "open") openNeverRenegotiated++;
  }

  const totalTerminal = kept + broken + renegotiatedThenKept + renegotiatedThenBroken;
  const keptTotal = kept + renegotiatedThenKept;
  const brokenTotal = broken + renegotiatedThenBroken;
  const keepRate = keptTotal + brokenTotal === 0 ? 1 : keptTotal / (keptTotal + brokenTotal);

  return {
    scopeLabel,
    totalTerminal,
    kept,
    broken,
    renegotiatedThenKept,
    renegotiatedThenBroken,
    stillOpenAfterRenegotiation,
    openNeverRenegotiated,
    keepRate,
  };
}
