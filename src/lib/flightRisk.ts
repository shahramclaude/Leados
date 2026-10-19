export interface FlightRiskEvent {
  personId: string;
  type: string;
  weight: number;
  createdAt: string;
}

export interface FlightRiskScore {
  personId: string;
  score: number;
}

// Signed contribution per event type. Positive values push risk up, negative
// values push risk down. Unknown event types contribute nothing.
const TYPE_SIGN: Record<string, number> = {
  negative_sentiment: 1,
  missed_one_on_one: 0.8,
  compensation_flag: 1.2,
  skipped_review: 0.6,
  recognition: -0.6,
  positive_sentiment: -0.8,
  promotion: -1.5,
};

/**
 * Computes a flight-risk score per person, bounded to [0, 1] by construction
 * via a logistic squash — no matter how extreme the input signal sum is, the
 * output can never leave the unit interval.
 */
export function computeFlightRiskScores(events: FlightRiskEvent[]): FlightRiskScore[] {
  const sums = new Map<string, number>();
  for (const e of events) {
    const sign = TYPE_SIGN[e.type] ?? 0;
    sums.set(e.personId, (sums.get(e.personId) ?? 0) + sign * e.weight);
  }
  return Array.from(sums.entries()).map(([personId, sum]) => ({
    personId,
    score: 1 / (1 + Math.exp(-sum)),
  }));
}
