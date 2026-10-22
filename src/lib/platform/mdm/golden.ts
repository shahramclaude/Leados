// src/lib/platform/mdm/golden.ts
//
// Golden-record construction with documented source precedence. For each
// canonical field, the value is taken from the highest-precedence source
// that provides a non-null value. Conflicting values from lower-precedence
// sources are recorded (never discarded silently) so Lineage Explorer/Dedup
// Review can show "why this value won".
import { CANONICAL_FIELDS, type NormalizedLead } from "../types";

export interface SourcedRecord {
  connectorId: string;
  rawRecordId: string;
  precedenceRank: number; // lower = more trusted
  record: NormalizedLead;
}

export interface FieldProvenanceEntry {
  connectorId: string;
  rawRecordId: string;
  value: unknown;
}

export interface GoldenRecordResult {
  goldenRecord: NormalizedLead;
  fieldProvenance: Record<string, FieldProvenanceEntry>;
  conflicts: Record<string, FieldProvenanceEntry[]>; // fields where sources disagreed
}

/**
 * Documented precedence rule: lower `precedenceRank` wins. Ties are broken by
 * most-recent `sourceUpdatedAt`, then by insertion order (first supplied wins)
 * — never randomly.
 */
export function buildGoldenRecord(sources: SourcedRecord[]): GoldenRecordResult {
  if (sources.length === 0) {
    throw new Error("buildGoldenRecord requires at least one source record.");
  }

  const ordered = [...sources].sort((a, b) => {
    if (a.precedenceRank !== b.precedenceRank) return a.precedenceRank - b.precedenceRank;
    const aTime = a.record.sourceUpdatedAt ? Date.parse(a.record.sourceUpdatedAt) : -Infinity;
    const bTime = b.record.sourceUpdatedAt ? Date.parse(b.record.sourceUpdatedAt) : -Infinity;
    return bTime - aTime;
  });

  const golden: Partial<NormalizedLead> = {};
  const fieldProvenance: Record<string, FieldProvenanceEntry> = {};
  const conflicts: Record<string, FieldProvenanceEntry[]> = {};

  for (const field of CANONICAL_FIELDS) {
    const providers = ordered
      .map((s) => ({ connectorId: s.connectorId, rawRecordId: s.rawRecordId, value: s.record[field] }))
      .filter((p) => p.value !== null && p.value !== undefined && p.value !== "");

    if (providers.length === 0) {
      (golden as Record<string, unknown>)[field] = null;
      continue;
    }

    const winner = providers[0];
    (golden as Record<string, unknown>)[field] = winner.value;
    fieldProvenance[field] = winner;

    const distinctValues = new Set(providers.map((p) => String(p.value)));
    if (distinctValues.size > 1) {
      conflicts[field] = providers;
    }
  }

  return { goldenRecord: golden as NormalizedLead, fieldProvenance, conflicts };
}
