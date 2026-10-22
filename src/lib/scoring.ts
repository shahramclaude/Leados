// Deterministic lead scoring. No external model call is made anywhere in
// this build (there is no LLM API key wired up) — "LLM-proposed" text below
// is produced by a local deterministic template generator that stands in
// for one. This is documented plainly in docs/FEATURES.md; nothing in the
// UI claims a real external model is being called.
import type { Explain } from "@/lib/explain";
import { makeExplain } from "@/lib/explain";

export interface SignalLike {
  type: string;
  confidence: number;
  createdAt: Date | string;
}

const TYPE_WEIGHT: Record<string, number> = {
  email_open: 0.5,
  email_reply: 3,
  meeting_booked: 5,
  pricing_page_view: 1.5,
  firmographic_match: 1,
  webhook_import: 0.75,
};

export function scoreLead(signals: SignalLike[]): Explain<number> {
  if (signals.length === 0) {
    return makeExplain({
      value: 0,
      confidence: 0,
      basis: ["no signals recorded for this lead yet"],
      generatedBy: "system",
    });
  }

  let raw = 0;
  const basis: string[] = [];
  for (const s of signals) {
    const weight = TYPE_WEIGHT[s.type] ?? 0.25;
    raw += weight * s.confidence;
    basis.push(`${s.type} (signal confidence ${(s.confidence * 100).toFixed(0)}%, weight ${weight})`);
  }

  const score = Math.max(0, Math.min(100, raw * 6));
  const avgSignalConfidence = signals.reduce((a, s) => a + s.confidence, 0) / signals.length;
  // Scoring confidence rewards both signal quality AND volume — a single
  // high-confidence signal is not treated the same as corroborated signals.
  const volumeFactor = Math.min(1, signals.length / 5);
  const confidence = avgSignalConfidence * (0.5 + 0.5 * volumeFactor);

  return makeExplain({
    value: Math.round(score * 100) / 100,
    confidence,
    basis,
    generatedBy: "system",
  });
}
