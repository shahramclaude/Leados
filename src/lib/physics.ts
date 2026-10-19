// src/lib/physics.ts
//
// BOOTSTRAP NOTE: no prior physics.ts existed in the repository. These are
// original-derivation heuristics used by the talent/execution engines; they
// are not consumed by the belief fabric formulas themselves (Part 1 scope),
// but Part 1's orchestrator wires them into the execution/talent stages so
// they are no longer "isolated silos" the next engine never reads.

import type { LeadosPerson } from "./types";
import { clamp01 } from "./temporal";

/** Shannon entropy (Shannon, 1948, "A Mathematical Theory of Communication")
 * of headcount distribution across teams, normalized to 0-1 by dividing by
 * log2(n) (max entropy for n equiprobable buckets). Higher = headcount more
 * evenly spread across teams; lower = concentrated in few teams.
 *   H = -Σ p_i * log2(p_i),  normalized = H / log2(n)
 */
export function orgEntropy(people: LeadosPerson[]): number {
  const counts = new Map<string, number>();
  for (const p of people) {
    const key = p.teamId ?? "unassigned";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const n = counts.size;
  if (n <= 1 || people.length === 0) return 0;

  const total = people.length;
  let h = 0;
  for (const count of counts.values()) {
    const pi = count / total;
    if (pi > 0) h -= pi * Math.log2(pi);
  }
  const maxH = Math.log2(n);
  return maxH > 0 ? clamp01(h / maxH) : 0;
}

/** Remaining discretionary "energy" budget across the org: 1 minus the
 * average fraction of calendar booked. DESIGN PARAMETER: people with no
 * calendarLoadPct recorded are assumed at 50% load (neutral default).
 */
export function energyBudget(people: LeadosPerson[]): number {
  if (people.length === 0) return 1;
  const loads = people.map((p) => (p.calendarLoadPct ?? 50) / 100);
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  return clamp01(1 - avgLoad);
}
