// LeadOS pt-Q — Part 2: Individual Flight Risk engine.
// Ported from the pasted pt-Q spec's `LEADOS.flightRisk` object into
// TypeScript module form. Computed from this org's own synthetic historical
// departures, not population data — per the spec's stated principle.
import type { Projection } from './types';
import { days } from './stats';
import { project } from './store';

export interface PersonSignal {
  meanMood: number | null;
  moodTrend: number | null;
  meanLoad: number | null;
  cadenceRatio: number;
  feedbackBalance: number | null;
  hasGrowthPlan: number;
  recentConflicts: number;
  tenureDays: number | null;
}

function computeTrend(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const num = values.reduce((a, y, i) => a + (i - xMean) * (y - yMean), 0);
  const den = values.reduce((a, _, i) => a + Math.pow(i - xMean, 2), 0);
  return den ? num / den : 0;
}

function buildPersonSignal(personId: string, P: Projection, today: string): PersonSignal {
  const pulses = (P.pulsesByPerson[personId] || []).filter((pu) => days(pu.ts, today) <= 60);
  const feedback = (P.feedbackByPerson[personId] || []).filter((f) => days(f.ts, today) <= 90);
  const last1on1 = P.oneononeLast[personId];
  const cadence = P.peopleById[personId]?.cadenceDays || 14;

  return {
    meanMood: pulses.length ? pulses.reduce((a, b) => a + (b.mood ?? 5), 0) / pulses.length : null,
    moodTrend: computeTrend(pulses.map((p) => p.mood)),
    meanLoad: pulses.filter((p) => p.load !== undefined).length
      ? pulses.reduce((a, b) => a + (b.load ?? 5), 0) / pulses.length
      : null,
    cadenceRatio: last1on1 ? days(last1on1.ts, today) / cadence : 3,
    feedbackBalance: feedback.length ? feedback.filter((f) => f.polarity === 'positive').length / feedback.length : null,
    hasGrowthPlan: P.openPlans.some((pl) => pl.personId === personId) ? 1 : 0,
    recentConflicts: P.state.events.filter(
      (e) => e.type === 'conflict.logged' && (e.data.person1Id === personId || e.data.person2Id === personId) && days(e.ts, today) <= 60
    ).length,
    tenureDays: P.peopleById[personId]?.startDate ? days(P.peopleById[personId].startDate, today) : null,
  };
}

function heuristicScore(signal: PersonSignal): number {
  let risk = 0;
  if (signal.meanMood !== null && signal.meanMood < 4) risk += 0.25;
  if (signal.moodTrend !== null && signal.moodTrend < -0.1) risk += 0.2;
  if (signal.cadenceRatio > 2) risk += 0.2;
  if (signal.feedbackBalance !== null && signal.feedbackBalance > 0.9) risk += 0.1;
  if (!signal.hasGrowthPlan) risk += 0.1;
  if (signal.recentConflicts >= 2) risk += 0.15;
  return Math.min(1, risk);
}

interface DepartureSignatures {
  n: number;
  signatures: PersonSignal[];
  meanSignature: Partial<Record<keyof PersonSignal, number | null>>;
  insufficient?: boolean;
}

function buildDepartureSignatures(P: Projection, _today: string): DepartureSignatures {
  const departures = P.state.events.filter((e) => e.type === 'hr.attrition.logged');
  if (departures.length < 2) {
    return { n: departures.length, signatures: [], meanSignature: {}, insufficient: true };
  }
  const signatures = departures.map((departure) => {
    const personId = departure.data.personId;
    const departureDate = departure.ts;
    const preDepDate = new Date(new Date(departureDate).getTime() - 60 * 864e5).toISOString();
    const historicalEvents = P.state.events.filter((e) => e.ts < preDepDate);
    // Build a minimal projection restricted to pre-departure history
    const historicalP: Projection = project({ events: historicalEvents, people: P.state.people });
    return buildPersonSignal(personId, historicalP, preDepDate);
  });

  const meanSignature: Partial<Record<keyof PersonSignal, number | null>> = {};
  if (signatures.length) {
    (Object.keys(signatures[0]) as (keyof PersonSignal)[]).forEach((key) => {
      const values = signatures.map((s) => s[key]).filter((v): v is number => v !== null);
      meanSignature[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });
  }
  return { n: departures.length, signatures, meanSignature };
}

function scoreAgainstSignature(signal: PersonSignal, signatures: DepartureSignatures): number {
  if (!signatures.meanSignature || !Object.keys(signatures.meanSignature).length) {
    return heuristicScore(signal);
  }
  let totalWeight = 0;
  let weightedSimilarity = 0;
  const weights: Partial<Record<keyof PersonSignal, number>> = {
    meanMood: 0.25,
    moodTrend: 0.2,
    cadenceRatio: 0.15,
    feedbackBalance: 0.15,
    hasGrowthPlan: 0.1,
    recentConflicts: 0.1,
    meanLoad: 0.05,
  };
  for (const [key, weight] of Object.entries(weights) as [keyof PersonSignal, number][]) {
    const signalVal = signal[key];
    const sigMeanVal = signatures.meanSignature[key];
    if (signalVal === null || signalVal === undefined || sigMeanVal === null || sigMeanVal === undefined) continue;
    const range = key === 'meanMood' ? 10 : key === 'cadenceRatio' ? 3 : key === 'feedbackBalance' ? 1 : key === 'recentConflicts' ? 5 : 1;
    const distance = Math.abs((signalVal as number) - (sigMeanVal as number)) / range;
    const similarity = Math.max(0, 1 - distance);
    weightedSimilarity += similarity * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSimilarity / totalWeight : 0;
}

export interface SignalComponent {
  factor: string;
  value: string;
  contribution: 'HIGH' | 'MEDIUM';
  action: string;
}

function explainSignal(signal: PersonSignal): SignalComponent[] {
  const components: SignalComponent[] = [];
  if (signal.meanMood !== null && signal.meanMood < 5) {
    components.push({ factor: 'Low engagement pulse', value: `${signal.meanMood.toFixed(1)}/10`, contribution: 'HIGH', action: 'Log next pulse result. If trend continues: well-being conversation.' });
  }
  if (signal.moodTrend !== null && signal.moodTrend < -0.1) {
    components.push({ factor: 'Declining mood trend', value: `${signal.moodTrend > 0 ? '+' : ''}${(signal.moodTrend * 10).toFixed(1)}/10 per week`, contribution: 'HIGH', action: 'Trend is more predictive than level. Intervene now, before it bottoms.' });
  }
  if (signal.cadenceRatio > 1.5) {
    components.push({ factor: '1:1 cadence miss', value: `${signal.cadenceRatio.toFixed(1)}\u00d7 target cadence`, contribution: 'MEDIUM', action: 'Log a 1:1 this week. The act of reconnection matters more than what is said.' });
  }
  if (!signal.hasGrowthPlan) {
    components.push({ factor: 'No active growth plan', value: 'No plan', contribution: 'MEDIUM', action: 'Open growth-plan playbook. The plan signals investment, not just the content.' });
  }
  if (signal.recentConflicts >= 2) {
    components.push({ factor: 'Recent conflict involvement', value: `${signal.recentConflicts} conflict(s) in 60d`, contribution: 'MEDIUM', action: 'Unresolved conflict is a retention risk. Address via DESC playbook.' });
  }
  return components;
}

function assessDataQuality(personId: string, P: Projection, today: string) {
  const pulses = (P.pulsesByPerson[personId] || []).filter((pu) => days(pu.ts, today) <= 90);
  const feedback = (P.feedbackByPerson[personId] || []).length;
  const oneOnOnes = P.state.events.filter((e) => e.type === 'oneonone.logged' && e.data.personId === personId).length;
  const score = (pulses.length >= 4 ? 1 : 0) + (feedback >= 3 ? 1 : 0) + (oneOnOnes >= 6 ? 1 : 0);
  return {
    level: score >= 3 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW',
    missingData: [
      pulses.length < 4 ? 'pulse (< 4 in 90d)' : null,
      feedback < 3 ? 'feedback (< 3 total)' : null,
      oneOnOnes < 6 ? '1:1 events (< 6 total)' : null,
    ].filter(Boolean) as string[],
  };
}

export interface FlightRiskScore {
  person: Projection['people'][number];
  riskScore: number;
  riskLevel: 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW';
  signal: PersonSignal;
  signalComponents: SignalComponent[];
  dataQuality: { level: string; missingData: string[] };
  label: string;
}

export function computeFlightRisk(P: Projection, today: string) {
  const departureSignatures = buildDepartureSignatures(P, today);
  const scores: FlightRiskScore[] = P.directs.concat(P.skips).map((person) => {
    const signal = buildPersonSignal(person.id, P, today);
    const riskScore = scoreAgainstSignature(signal, departureSignatures);
    const riskLevel = riskScore >= 0.7 ? 'HIGH' : riskScore >= 0.45 ? 'ELEVATED' : riskScore >= 0.25 ? 'MODERATE' : 'LOW';
    return {
      person,
      riskScore: Math.round(riskScore * 100) / 100,
      riskLevel,
      signal,
      signalComponents: explainSignal(signal),
      dataQuality: assessDataQuality(person.id, P, today),
      label: `Flight risk score: ${Math.round(riskScore * 100)}%. Source: your ${departureSignatures.n} historical departure signatures. Labeled: small sample \u2192 high uncertainty. Treat as a signal, not a prediction.`,
    };
  });
  scores.sort((a, b) => b.riskScore - a.riskScore);
  return {
    scores,
    highRisk: scores.filter((s) => s.riskLevel === 'HIGH'),
    historicalDepartures: departureSignatures.n,
    modelQuality: departureSignatures.n >= 5 ? 'MODERATE' : departureSignatures.n >= 2 ? 'LOW' : 'INSUFFICIENT',
    label:
      `Flight risk model from ${departureSignatures.n} historical departure(s). Model quality: ${departureSignatures.n >= 5 ? 'MODERATE' : 'LOW (n < 5)'}. ` +
      `Labeled: this model improves as more departures are logged. Never used for any employment decision \u2014 a leading indicator only.`,
  };
}
