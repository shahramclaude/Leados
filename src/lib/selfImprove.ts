// LEADOS — Part 38: safe self-improvement actions.
//
// These are the concrete "safe auto-fix" actions the remediation tier can
// take. All of them are non-destructive and idempotent by design: refreshing
// a cache or re-running a check cannot corrupt state, which is exactly why
// they are classified "safe" rather than "degrade"/"escalate".

import { evaluateCheck } from "@/lib/evaluation";
import type { Check } from "@/lib/assurance/registry";

export async function rerunFailedCheck(check: Check) {
  // Re-pulls the latest observations and re-evaluates — if the breach was a
  // transient blip (e.g. a single noisy batch), this naturally clears it.
  return evaluateCheck(check);
}

export async function refreshCache(_check: Check) {
  // No persistent cache layer exists yet in this build; documented no-op
  // standing in for "invalidate the derived-metric cache" so the action is
  // auditable even before that cache exists.
  return { refreshed: true, note: "Cache refresh is a documented no-op in this build (no cache layer yet)." };
}

export async function rebuildProjection(_check: Check) {
  // Same rationale as refreshCache — a documented no-op placeholder for a
  // future read-model projection rebuild.
  return { rebuilt: true, note: "Projection rebuild is a documented no-op in this build (no projection layer yet)." };
}
