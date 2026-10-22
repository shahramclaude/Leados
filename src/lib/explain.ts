/**
 * `Explain<T>` — the shared "show your work" envelope used across LEADOS
 * scoring and estimation surfaces (readiness, momentum, change-load,
 * intervention effects, ADKAR stage detection, etc).
 *
 * STATUS: this is expected to be a cross-cutting primitive introduced early
 * in the LEADOS build (referenced by Parts 04/05/09/12/23). It is not present
 * in this repository snapshot, so Part 26 defines the minimal contract it
 * needs here. Any later part that introduces a canonical `Explain<T>` should
 * supersede this file; the shape below is intentionally conservative so it
 * can be swapped in without touching call sites.
 */

export type Confidence = "low" | "medium" | "high";

export interface Explain<T> {
  /** The computed value. */
  value: T;
  /** Human-readable name of the method/formula used. */
  method: string;
  /** Named inputs that fed the computation, for audit/replay. */
  inputs: Record<string, number | string | boolean | null>;
  /** Qualitative confidence in the result (not a p-value). */
  confidence: Confidence;
  /** Known limitations, assumptions, or ways this could mislead. */
  caveats: string[];
}

export function explain<T>(
  value: T,
  method: string,
  inputs: Record<string, number | string | boolean | null>,
  options?: { confidence?: Confidence; caveats?: string[] }
): Explain<T> {
  return {
    value,
    method,
    inputs,
    confidence: options?.confidence ?? "medium",
    caveats: options?.caveats ?? [],
  };
}

/** A finding is a surfaced observation, distinct from an asserted "fact". */
export interface Finding {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
}
