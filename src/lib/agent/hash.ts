// LEADOS Agent Kernel — deterministic hashing utilities.
import { createHash } from "node:crypto";

// Canonicalize an object so that key order never affects the hash.
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashOf(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

// Replay hash: sha256 over the canonicalized, time-stripped, run-id-stripped
// step sequence. Wall-clock timestamps are intentionally excluded (they
// differ between the original run and a replay run started at a different
// instant). The idempotency key is ALSO excluded because it is deliberately
// derived from the run id (`${runId}:${nodeId}`) so that two different runs
// can never collide on the same key — but that same run-id-uniqueness makes
// it unsuitable for a hash that must match across two different run ids
// executing the identical plan. What determinism actually promises is
// captured by: node id, attempt, tool id, input hash, cost, outcome and
// output summary.
export function replayHashOf(
  steps: Array<{
    nodeId: string;
    attempt: number;
    toolId: string;
    idempotencyKey: string;
    inputHash: string;
    costUsd: number;
    outcome: string;
    outputSummary: string | null;
  }>
): string {
  const normalized = steps
    .slice()
    .sort((a, b) => (a.nodeId + a.attempt).localeCompare(b.nodeId + b.attempt))
    .map((s) => ({
      nodeId: s.nodeId,
      attempt: s.attempt,
      toolId: s.toolId,
      inputHash: s.inputHash,
      costUsd: Number(s.costUsd.toFixed(4)),
      outcome: s.outcome,
      outputSummary: s.outputSummary,
    }));
  return hashOf(normalized);
}
