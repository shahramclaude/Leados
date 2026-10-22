/**
 * Aggregation / k-anonymity gating.
 *
 * STATUS: Part 09 ("people scoping") is expected to own the canonical
 * k-anonymity enforcement module. It is not present in this repository
 * snapshot, so Part 26 bootstraps a compatible, minimal implementation here
 * under `src/lib/privacy/aggregation.ts`. Every change-metric surface in
 * Part 26 routes through this module — nothing computes or renders a
 * group-level number without passing the gate first.
 *
 * Rule: any aggregate derived from individual-level records (training
 * completion, proxy events, sentiment, etc.) must be suppressed unless the
 * underlying group has at least `K_ANONYMITY_THRESHOLD` distinct people
 * contributing to it.
 */

export const K_ANONYMITY_THRESHOLD = 5;

export interface Suppressed {
  ok: false;
  reason: "k_anonymity";
  groupSize: number;
  threshold: number;
}

export interface Aggregated<T> {
  ok: true;
  value: T;
  groupSize: number;
}

export type GateResult<T> = Aggregated<T> | Suppressed;

/**
 * Compute an aggregate only if the contributing population meets the
 * k-anonymity threshold. `compute` is only invoked when the gate passes, so
 * callers can defer expensive aggregation until it is safe to disclose.
 */
export function aggregationGate<T>(
  groupSize: number,
  compute: () => T,
  threshold: number = K_ANONYMITY_THRESHOLD
): GateResult<T> {
  if (groupSize < threshold) {
    return { ok: false, reason: "k_anonymity", groupSize, threshold };
  }
  return { ok: true, value: compute(), groupSize };
}

/**
 * Fields that must never appear in a change-metric computation or API
 * response. Used by the fairness/privacy scanners as a static allow-list
 * check and by tests as an attempt matrix.
 */
export const BANNED_INDIVIDUAL_FIELDS = [
  "personId",
  "employeeId",
  "name",
  "email",
  "individualScore",
  "sentimentScore",
] as const;

export function containsBannedField(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const stack: unknown[] = [obj];
  const seen = new Set<unknown>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const [key, val] of Object.entries(current as Record<string, unknown>)) {
      if ((BANNED_INDIVIDUAL_FIELDS as readonly string[]).includes(key)) {
        return key;
      }
      if (val && typeof val === "object") stack.push(val);
    }
  }
  return null;
}
