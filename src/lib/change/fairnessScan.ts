import { containsBannedField, K_ANONYMITY_THRESHOLD } from "@/lib/privacy/aggregation";
import type { Finding } from "@/lib/explain";

/**
 * Extension of Part 09's `test:fairness` for change metrics (Phase 3e).
 * Two kinds of checks:
 *  1. Static allow-list: the fields used to compute readiness/momentum/load
 *     must never include a banned individual-level or protected-ish field.
 *  2. Runtime disclosure check: any group-level payload returned by an API
 *     must either be suppressed or carry a groupSize >= K_ANONYMITY_THRESHOLD.
 */

export interface GroupMetricPayload {
  groupId: string;
  groupSize: number;
  suppressed?: boolean;
  [key: string]: unknown;
}

export function scanGroupPayloadsForDisclosureRisk(payloads: readonly GroupMetricPayload[]): Finding[] {
  const findings: Finding[] = [];
  for (const p of payloads) {
    if (p.suppressed) continue;
    if (p.groupSize < K_ANONYMITY_THRESHOLD) {
      findings.push({
        id: `fairness:k_anon:${p.groupId}`,
        severity: "critical",
        title: `Group ${p.groupId} metric disclosed below k-anonymity threshold`,
        detail: `groupSize=${p.groupSize} < threshold=${K_ANONYMITY_THRESHOLD} but payload was not suppressed.`,
        evidence: { groupId: p.groupId, groupSize: p.groupSize },
      });
    }
    const bannedField = containsBannedField(p);
    if (bannedField) {
      findings.push({
        id: `fairness:banned_field:${p.groupId}:${bannedField}`,
        severity: "critical",
        title: `Banned individual-level field '${bannedField}' present in group payload`,
        detail: `Group metric payloads must never carry individual-identifying or sentiment-scoring fields.`,
        evidence: { groupId: p.groupId, field: bannedField },
      });
    }
  }
  return findings;
}

/**
 * Static scan: ensures the declared readiness/momentum/load computation
 * input keys never include a demographic or protected-attribute-shaped
 * field. This project does not model protected attributes at all (by
 * design, see docs/CHANGE.md Phase 5), so the allow-list is the full set of
 * legitimate inputs.
 */
const ALLOWED_READINESS_INPUT_KEYS = new Set([
  "trainingCompletionRate",
  "capacityHeadroom",
  "priorChangeLoad",
  "loadPenalty",
]);

const BANNED_SHAPED_KEYS = [
  "gender",
  "age",
  "race",
  "ethnicity",
  "disability",
  "religion",
  "nationality",
  "maritalStatus",
  "sexualOrientation",
];

export function scanComputationInputKeys(inputs: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];
  for (const key of Object.keys(inputs)) {
    if (BANNED_SHAPED_KEYS.includes(key.toLowerCase())) {
      findings.push({
        id: `fairness:protected_attribute_input:${key}`,
        severity: "critical",
        title: `Protected-attribute-shaped input '${key}' used in a change metric`,
        detail: "Readiness/momentum/load computations must only use the approved operational inputs.",
        evidence: { key, allowed: Array.from(ALLOWED_READINESS_INPUT_KEYS) },
      });
    }
  }
  return findings;
}
