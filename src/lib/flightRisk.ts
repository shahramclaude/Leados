// Flight risk scoring — builds a weighted behavioural signature per person
// from the raw event log (pulses, 1:1 cadence, feedback polarity, conflicts,
// growth plans, tenure-since-promotion) and turns it into a 0-100 score with
// a human-readable explanation. No ML dependency: this is an explicit,
// auditable heuristic model a manager can trust and override.

export type PersonEvent = {
  id: number;
  type: string;
  domain: string;
  personId: number | null;
  data: Record<string, unknown>;
  occurredAt: string | Date;
};

export interface PersonSignal {
  meanMood: number | null; // 0-10
  moodTrend: number | null; // slope per event
  meanLoad: number | null; // 0-10
  daysSinceOneOnOne: number | null;
  cadenceRatio: number; // daysSinceOneOnOne / targetCadence
  feedbackBalance: number | null; // 0..1 share positive
  hasGrowthPlan: boolean;
  recentConflicts: number;
  tenureDays: number | null;
  daysSinceLastPromotion: number | null;
  okrScore: number | null;
}

export interface SignalComponent {
  factor: string;
  value: string;
  contribution: "HIGH" | "MEDIUM" | "LOW";
  action: string;
}

export interface FlightRiskScore {
  score: number; // 0-100
  level: "low" | "moderate" | "elevated" | "high";
  signal: PersonSignal;
  components: SignalComponent[];
  label: string;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function linearTrend(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const num = values.reduce((a, y, i) => a + (i - xMean) * (y - yMean), 0);
  const den = values.reduce((a, _, i) => a + (i - xMean) ** 2, 0);
  return den ? num / den : 0;
}

export function buildPersonSignal(
  events: PersonEvent[],
  today: Date,
  opts?: { tenureStart?: string | Date | null; lastPromotedAt?: string | Date | null; okrScore?: number | null; cadenceDays?: number }
): PersonSignal {
  const cadenceDays = opts?.cadenceDays ?? 14;

  const pulses = events
    .filter((e) => e.type === "pulse.mood.logged" && daysBetween(today, toDate(e.occurredAt)) <= 60)
    .sort((a, b) => toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime());

  const moods = pulses.map((p) => Number(p.data.mood ?? 5));
  const loads = pulses.filter((p) => p.data.load !== undefined).map((p) => Number(p.data.load));

  const oneOnOnes = events
    .filter((e) => e.type === "oneonone.logged")
    .sort((a, b) => toDate(b.occurredAt).getTime() - toDate(a.occurredAt).getTime());
  const lastOneOnOne = oneOnOnes[0];
  const daysSinceOneOnOne = lastOneOnOne ? daysBetween(today, toDate(lastOneOnOne.occurredAt)) : null;

  const feedback = events.filter(
    (e) => e.type === "feedback.logged" && daysBetween(today, toDate(e.occurredAt)) <= 90
  );

  const recentConflicts = events.filter(
    (e) => e.type === "conflict.logged" && daysBetween(today, toDate(e.occurredAt)) <= 60
  ).length;

  const hasGrowthPlan = events.some(
    (e) => e.type === "growth_plan.opened" && daysBetween(today, toDate(e.occurredAt)) <= 365
  );

  const tenureStart = opts?.tenureStart ? toDate(opts.tenureStart) : null;
  const lastPromotedAt = opts?.lastPromotedAt ? toDate(opts.lastPromotedAt) : null;

  return {
    meanMood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    moodTrend: linearTrend(moods),
    meanLoad: loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : null,
    daysSinceOneOnOne,
    cadenceRatio: daysSinceOneOnOne !== null ? daysSinceOneOnOne / cadenceDays : 3,
    feedbackBalance: feedback.length
      ? feedback.filter((f) => f.data.polarity === "positive").length / feedback.length
      : null,
    hasGrowthPlan,
    recentConflicts,
    tenureDays: tenureStart ? daysBetween(today, tenureStart) : null,
    daysSinceLastPromotion: lastPromotedAt ? daysBetween(today, lastPromotedAt) : null,
    okrScore: opts?.okrScore ?? null,
  };
}

function explainSignal(signal: PersonSignal): SignalComponent[] {
  const components: SignalComponent[] = [];

  if (signal.meanMood !== null && signal.meanMood < 5) {
    components.push({
      factor: "Low engagement pulse",
      value: `${signal.meanMood.toFixed(1)}/10`,
      contribution: "HIGH",
      action: "Schedule a well-being check-in this week.",
    });
  }
  if (signal.moodTrend !== null && signal.moodTrend < -0.08) {
    components.push({
      factor: "Declining mood trend",
      value: `${(signal.moodTrend * 10).toFixed(1)} pts/pulse`,
      contribution: "HIGH",
      action: "Trend predicts better than level — intervene before it bottoms out.",
    });
  }
  if (signal.cadenceRatio > 1.5) {
    components.push({
      factor: "1:1 cadence miss",
      value: `${signal.cadenceRatio.toFixed(1)}× target cadence`,
      contribution: signal.cadenceRatio > 2.5 ? "HIGH" : "MEDIUM",
      action: "Book a 1:1 this week — reconnection matters more than agenda.",
    });
  }
  if (!signal.hasGrowthPlan) {
    components.push({
      factor: "No active growth plan",
      value: "none on file",
      contribution: "MEDIUM",
      action: "Open a growth plan — signals investment in their trajectory.",
    });
  }
  if (signal.recentConflicts >= 2) {
    components.push({
      factor: "Recent conflict involvement",
      value: `${signal.recentConflicts} in 60d`,
      contribution: "MEDIUM",
      action: "Address unresolved conflict directly — it is a retention risk.",
    });
  }
  if (signal.feedbackBalance !== null && signal.feedbackBalance < 0.4) {
    components.push({
      factor: "Negative feedback skew",
      value: `${Math.round(signal.feedbackBalance * 100)}% positive`,
      contribution: "MEDIUM",
      action: "Balance feedback — reinforce strengths alongside correction.",
    });
  }
  if (signal.daysSinceLastPromotion !== null && signal.daysSinceLastPromotion > 730 && (signal.okrScore ?? 0) >= 75) {
    components.push({
      factor: "Promotion stagnation",
      value: `${Math.round(signal.daysSinceLastPromotion / 365)}y since last promotion, strong OKRs`,
      contribution: "HIGH",
      action: "High performer overdue for promotion — flight risk from stalled growth.",
    });
  }
  if (signal.meanLoad !== null && signal.meanLoad >= 8) {
    components.push({
      factor: "Sustained high workload",
      value: `${signal.meanLoad.toFixed(1)}/10`,
      contribution: "MEDIUM",
      action: "Rebalance workload — sustained overload precedes attrition.",
    });
  }

  return components;
}

export function heuristicRiskScore(signal: PersonSignal): number {
  let risk = 0;
  if (signal.meanMood !== null) risk += Math.max(0, (5 - signal.meanMood) / 5) * 0.22;
  if (signal.moodTrend !== null && signal.moodTrend < 0) risk += Math.min(1, Math.abs(signal.moodTrend) * 6) * 0.18;
  risk += Math.min(1, Math.max(0, signal.cadenceRatio - 1) / 2) * 0.16;
  if (!signal.hasGrowthPlan) risk += 0.1;
  risk += Math.min(1, signal.recentConflicts / 3) * 0.14;
  if (signal.feedbackBalance !== null) risk += Math.max(0, 0.5 - signal.feedbackBalance) * 0.2;
  if (signal.meanLoad !== null) risk += Math.max(0, (signal.meanLoad - 6) / 4) * 0.12;
  if (
    signal.daysSinceLastPromotion !== null &&
    signal.daysSinceLastPromotion > 730 &&
    (signal.okrScore ?? 0) >= 75
  ) {
    risk += 0.18;
  }
  return Math.max(0, Math.min(1, risk));
}

export function computeFlightRisk(
  events: PersonEvent[],
  today: Date,
  opts?: { tenureStart?: string | Date | null; lastPromotedAt?: string | Date | null; okrScore?: number | null; cadenceDays?: number }
): FlightRiskScore {
  const signal = buildPersonSignal(events, today, opts);
  const risk = heuristicRiskScore(signal);
  const score = Math.round(risk * 100);
  const level: FlightRiskScore["level"] = score >= 70 ? "high" : score >= 45 ? "elevated" : score >= 25 ? "moderate" : "low";
  const components = explainSignal(signal);

  return {
    score,
    level,
    signal,
    components,
    label: `Flight risk ${score}% (${level}) from ${components.length} signal(s). Heuristic model — treat as a leading indicator, not a prediction.`,
  };
}
