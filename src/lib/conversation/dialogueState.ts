// Dialogue state machine primitives for the Ask-LEADOS conversational agent.
//
// state = { turns, resolvedEntities, activeContext, groundingSet } as
// specified in the Part 42 brief. This module owns scope inheritance (follow
// -up resolution) so "and for Q3?" keeps whatever metric was last discussed.
export interface ActiveContext {
  timeframe?: string;
  metric?: string;
  scope?: string;
}

const TIMEFRAME_PATTERN = /\bQ[1-4]\s?(?:'?\d{2,4})?\b|\b(?:FY)?\d{4}\b|\b(?:this|last|next)\s+(?:quarter|month|year)\b/i;

const KNOWN_METRICS = [
  "revenue",
  "churn",
  "pipeline",
  "headcount",
  "margin",
  "nps",
  "retention",
  "arr",
  "burn",
  "runway",
  "cac",
];

export function extractExplicitTimeframe(text: string): string | undefined {
  const m = text.match(TIMEFRAME_PATTERN);
  return m ? m[0].toUpperCase().replace(/\s+/g, " ").trim() : undefined;
}

export function extractExplicitMetric(text: string): string | undefined {
  const lower = text.toLowerCase();
  return KNOWN_METRICS.find((m) => lower.includes(m));
}

/**
 * Merge the current turn's explicit scope signals with the prior turn's
 * active context. Explicit mentions always win; anything unmentioned is
 * inherited when the utterance reads as a follow-up.
 */
export function resolveScope(text: string, priorContext: ActiveContext, isFollowUp: boolean): ActiveContext {
  const explicitTimeframe = extractExplicitTimeframe(text);
  const explicitMetric = extractExplicitMetric(text);

  if (!isFollowUp && !explicitTimeframe && !explicitMetric) {
    // Fresh topic with no detectable scope at all — nothing to inherit.
    return {};
  }

  return {
    timeframe: explicitTimeframe ?? (isFollowUp ? priorContext.timeframe : undefined),
    metric: explicitMetric ?? (isFollowUp ? priorContext.metric : undefined),
    scope: priorContext.scope,
  };
}

export function scopeKey(context: ActiveContext): string {
  return `${context.metric ?? "?"}::${context.timeframe ?? "?"}`;
}
