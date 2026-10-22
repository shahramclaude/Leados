// The one Explain<T> shape used everywhere a derived value (a score, a
// recommendation, an agent output, an LLM draft) is shown to a human.
// Nothing in LEADOS is allowed to render a bare number/string that came from
// a model or heuristic without wrapping it in Explain<T> first.
//
// Seam under test: see src/__tests__/explain.seam.test.ts

export type ActorType = "human" | "agent" | "llm" | "system";

export interface Explain<T> {
  /** The derived value itself. */
  value: T;
  /** 0..1 confidence. Never omitted — "no confidence available" is 0. */
  confidence: number;
  /** Human-readable reasons the value is what it is. Never empty. */
  basis: string[];
  /** Free-text caveat surfaced next to the value whenever confidence < 0.66. */
  uncertainty: string | null;
  /** Who/what produced this value. */
  generatedBy: ActorType;
  /** Language-policy violations caught + auto-softened in free text, if any. */
  policyViolations: string[];
}

export interface MakeExplainInput<T> {
  value: T;
  confidence: number;
  basis: string[];
  generatedBy: ActorType;
  uncertaintyNote?: string;
  policyViolations?: string[];
}

export function makeExplain<T>(input: MakeExplainInput<T>): Explain<T> {
  const confidence = clamp01(input.confidence);
  const basis = input.basis.length > 0 ? input.basis : ["no basis recorded"];
  return {
    value: input.value,
    confidence,
    basis,
    uncertainty: input.uncertaintyNote ?? defaultUncertaintyNote(confidence),
    generatedBy: input.generatedBy,
    policyViolations: input.policyViolations ?? [],
  };
}

export function defaultUncertaintyNote(confidence: number): string | null {
  if (confidence >= 0.66) return null;
  if (confidence >= 0.33) {
    return "Moderate confidence — corroborate before acting.";
  }
  return "Low confidence — treat as a hypothesis, not a fact.";
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Runtime shape guard used by seam tests and API boundary validation. */
export function isExplain<T>(x: unknown): x is Explain<T> {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    "value" in o &&
    typeof o.confidence === "number" &&
    Array.isArray(o.basis) &&
    o.basis.length > 0 &&
    ("uncertainty" in o) &&
    typeof o.generatedBy === "string" &&
    Array.isArray(o.policyViolations)
  );
}
