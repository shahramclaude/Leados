// LEADOS Part 31 — stakeholder map model: interest x influence x affectedness,
// plus aggregate-safe relationship health from interaction cadence signals.
//
// "Aggregate-safe" here means: we only ever look at counts, dates, and a coarse
// positive/neutral/negative tag — never message content — and we only ever
// surface a banded health signal, not a raw log of who-said-what.

export interface InteractionSignal {
  occurredAt: Date;
  sentiment: "positive" | "neutral" | "negative" | null;
}

export type Quadrant = "manage_closely" | "keep_satisfied" | "keep_informed" | "monitor";

/** Classic power/interest grid quadrant, using influence as the "power" axis. */
export function stakeholderQuadrant(interest: number, influence: number): Quadrant {
  const highInterest = interest >= 5;
  const highInfluence = influence >= 5;
  if (highInterest && highInfluence) return "manage_closely";
  if (!highInterest && highInfluence) return "keep_satisfied";
  if (highInterest && !highInfluence) return "keep_informed";
  return "monitor";
}

export interface RelationshipHealth {
  daysSinceLastInteraction: number | null;
  interactionCount90d: number;
  sentimentBalance: number; // -1..1, positive minus negative share
  band: "healthy" | "attention" | "at_risk";
}

const STALE_DAYS_THRESHOLD = 60;
const ATTENTION_DAYS_THRESHOLD = 30;

export function computeRelationshipHealth(
  interactionsLog: InteractionSignal[],
  now: Date = new Date(),
): RelationshipHealth {
  if (interactionsLog.length === 0) {
    return { daysSinceLastInteraction: null, interactionCount90d: 0, sentimentBalance: 0, band: "at_risk" };
  }

  const sorted = [...interactionsLog].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const daysSinceLastInteraction = Math.floor(
    (now.getTime() - sorted[0].occurredAt.getTime()) / 86400000,
  );

  const cutoff90 = new Date(now.getTime() - 90 * 86400000);
  const recent = interactionsLog.filter((i) => i.occurredAt >= cutoff90);

  const positives = recent.filter((i) => i.sentiment === "positive").length;
  const negatives = recent.filter((i) => i.sentiment === "negative").length;
  const sentimentBalance = recent.length > 0 ? (positives - negatives) / recent.length : 0;

  let band: RelationshipHealth["band"] = "healthy";
  if (daysSinceLastInteraction > STALE_DAYS_THRESHOLD || sentimentBalance < -0.3) {
    band = "at_risk";
  } else if (daysSinceLastInteraction > ATTENTION_DAYS_THRESHOLD || sentimentBalance < 0) {
    band = "attention";
  }

  return {
    daysSinceLastInteraction,
    interactionCount90d: recent.length,
    sentimentBalance: Math.round(sentimentBalance * 100) / 100,
    band,
  };
}
