import crypto from "crypto";
import type { GroundingSet } from "./types";

/**
 * Stable hash of a GroundingSet, used as:
 *  - the semantic cache key component (task + groundingHash)
 *  - a tamper-evident reference stored in the audit log
 *  - a quick way to detect "nothing changed since last time" (briefings)
 *
 * We sort all collections by ref/id so the hash is stable regardless of the
 * order evidence was fetched in.
 */
export function computeGroundingHash(set: GroundingSet): string {
  const normalized = {
    orgId: set.orgId,
    topic: set.topic ?? null,
    timeframe: set.timeframe,
    entities: [...set.entities].sort((a, b) => a.ref.localeCompare(b.ref)).map((e) => ({ ref: e.ref, name: e.name, type: e.type })),
    events: [...set.events]
      .sort((a, b) => a.ref.localeCompare(b.ref))
      .map((e) => ({ ref: e.ref, title: e.title, occurredAt: e.occurredAt, type: e.type })),
    metrics: [...set.metrics]
      .sort((a, b) => a.ref.localeCompare(b.ref))
      .map((m) => ({ ref: m.ref, value: m.value, previousValue: m.previousValue, periodEnd: m.periodEnd })),
    documents: [...set.documents]
      .sort((a, b) => a.ref.localeCompare(b.ref))
      .map((d) => ({ ref: d.ref, trust: d.trust })),
  };
  const json = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(json).digest("hex");
}

export function computeCacheKey(task: string, groundingHash: string, promptVersion: string): string {
  return crypto.createHash("sha256").update(`${task}::${groundingHash}::${promptVersion}`).digest("hex");
}
