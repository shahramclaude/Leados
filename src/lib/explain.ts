// Part 23 pattern: every structured judgement the system produces is wrapped
// in Explain<T> so the UI/API can never surface a bare verdict without the
// reasoning, confidence and factors that produced it. This is the backbone
// of the HONESTY RULE for Part 46: ethical lenses are decision support, not
// moral verdicts — Explain<T> makes that explicit in the type itself.

export type Confidence = "low" | "medium" | "high";

export interface Explain<T> {
  value: T;
  reasoning: string;
  confidence: Confidence;
  factors: string[];
}

export function explain<T>(
  value: T,
  reasoning: string,
  factors: string[] = [],
  confidence: Confidence = "medium",
): Explain<T> {
  return { value, reasoning, confidence, factors };
}
