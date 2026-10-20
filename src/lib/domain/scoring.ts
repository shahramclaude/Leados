// Finding prioritization score: Impact * Confidence / Effort (an ICE-style
// weighted score), each input on a 1-10 scale. Pure function, no I/O.

export interface FindingScoreInput {
  impact: number;
  confidence: number;
  effort: number;
}

const SCALE_MIN = 1;
const SCALE_MAX = 10;

export function clampScale(value: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

export function scoreFinding(input: FindingScoreInput): number {
  const impact = clampScale(input.impact);
  const confidence = clampScale(input.confidence);
  const effort = clampScale(input.effort);
  const raw = (impact * confidence) / effort;
  return Math.round(raw * 100) / 100;
}

export function rankFindings<T extends { score: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.score - a.score);
}
