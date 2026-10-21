import type { ConfidenceLevelId } from "@/design/tokens";

/**
 * `Explain<T>` — the canonical "explainable value" wrapper used everywhere
 * LEADOS shows a number, claim, or recommendation that a user might ask
 * "why?" about. `InsightCard` is the visual face of this type: claim +
 * confidence class + evidence chips + an "explain" drawer that renders the
 * remaining fields (method, evidence detail, caveats).
 */
export interface EvidenceChip {
  id: string;
  label: string;
  /** Link to the source-of-record (table row, document, model run id). */
  href?: string;
}

export interface Explain<T> {
  /** The underlying typed value this explanation is about. */
  value: T;
  /** One-sentence, plain-language claim derived from `value`. */
  claim: string;
  confidence: ConfidenceLevelId;
  evidence: EvidenceChip[];
  /** Short method/model description shown inside the explain drawer. */
  method?: string;
  /** Known limitations/caveats, rendered in the drawer, never hidden. */
  caveats?: string[];
  asOf?: string;
}

export function explain<T>(value: T, partial: Omit<Explain<T>, "value">): Explain<T> {
  return { value, ...partial };
}
