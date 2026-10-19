import type { LeadosEvent, OneOneRecord, PersonState } from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ═══════════════════════════════════════════════════════════════
// Shared types
// ═══════════════════════════════════════════════════════════════

export interface FlightRiskDriver {
  key: string;
  label: string;
  weight: number;
}

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface OneOneQualityScore {
  score: number;
  factors: string[];
}

export interface ConversationSignals {
  hasExitSignal: boolean;
  hasCompFrustration: boolean;
  hasBurnoutSignal: boolean;
  hasCareerSignal: boolean;
}

export type NineBoxAxis = 'low' | 'mid' | 'high';
export type NineBoxCell = `${NineBoxAxis}-${NineBoxAxis}`; // performance-potential

export interface SuccessionRisk {
  isKeyPerson: boolean;
  hasSuccessor: boolean;
  timeToReadiness: string;
  warning: string | null;
}

export type PerformanceTrend = 'accelerating' | 'stable' | 'declining' | 'unknown';

export interface PersonIntelligenceReport {
  personId: string;
  name: string;
  title: string;

  flightRiskScore: number;
  flightRiskDrivers: FlightRiskDriver[];
  flightRiskLevel: RiskLevel;

  burnoutRiskScore: number;
  burnoutDrivers: string[];

  latestPerformanceScore: number | null;
  performanceTrend: PerformanceTrend;

  oneOneQuality: OneOneQualityScore;
  conversationSignals: ConversationSignals;
  nextOneOneTopics: string[];

  nineBoxPlacement: NineBoxCell;
  performanceAxis: NineBoxAxis;
  potentialAxis: NineBoxAxis;
  suggestedAction: string;

  successionRisk: SuccessionRisk;

  networkCentrality: number;
  isBottleneck: boolean;
  bridgeCount: number;

  estimatedChangeInertia: number;
}

// ═══════════════════════════════════════════════════════════════
// Keyword banks (exact, per spec)
// ═══════════════════════════════════════════════════════════════

export const EXIT_KEYWORDS = [
  'recruiter',
  'other offer',
  'looking at',
  'considering leaving',
  'interview',
  'notice period',
  'my last',
  'moving on',
  'checking out options',
];

export const COMP_KEYWORDS = [
  'underpaid',
  'market rate',
  'deserve more',
  'equity',
  'below market',
  'not valued financially',
  'competitor pays',
  'compensation review',
];

export const BURNOUT_KEYWORDS = [
  'exhausted',
  'burned out',
  'overwhelmed',
  'too much',
  'no bandwidth',
  "can't keep up",
  'weekends',
  'never off',
  'stretched thin',
  'not sustainable',
];

export const CAREER_KEYWORDS = [
  'growth',
  'promotion',
  'next level',
  'learning',
  'career path',
  'skills',
  'opportunity',
  'stretch',
  'development',
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ═══════════════════════════════════════════════════════════════
// Small date / math helpers
// ═══════════════════════════════════════════════════════════════

const daysBetween = (a: Date | string, b: Date | string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}

// ═══════════════════════════════════════════════════════════════
// Conversation intelligence
// ═══════════════════════════════════════════════════════════════

export function analyzeOneOne(record: OneOneRecord) {
  return {
    exitSignal: containsAny(record.notes, EXIT_KEYWORDS),
    compSignal: containsAny(record.notes, COMP_KEYWORDS),
    burnoutSignal: containsAny(record.notes, BURNOUT_KEYWORDS),
    careerSignal: containsAny(record.notes, CAREER_KEYWORDS),
    wordCount: record.notes.trim().length === 0 ? 0 : record.notes.trim().split(/\s+/).length,
  };
}

export function computeConversationSignals(oneOnes: OneOneRecord[]): ConversationSignals {
  const last2 = lastN(oneOnes, 2);
  const last3 = lastN(oneOnes, 3);
  return {
    hasExitSignal: last2.some((o) => containsAny(o.notes, EXIT_KEYWORDS)),
    hasCompFrustration: last3.some((o) => containsAny(o.notes, COMP_KEYWORDS)),
    hasBurnoutSignal: last2.some((o) => containsAny(o.notes, BURNOUT_KEYWORDS)),
    hasCareerSignal: last3.some((o) => containsAny(o.notes, CAREER_KEYWORDS)),
  };
}

// ═══════════════════════════════════════════════════════════════
// Performance trend
// ═══════════════════════════════════════════════════════════════

export function computePerformanceTrend(person: PersonState): PerformanceTrend {
  const hist = person.performanceHistory;
  if (hist.length < 2) return 'unknown';
  const last = hist[hist.length - 1].score;
  const prev = hist[hist.length - 2].score;
  if (last - prev >= 1) return 'accelerating';
  if (last - prev <= -1) return 'declining';
  return 'stable';
}

// ═══════════════════════════════════════════════════════════════
// Flight risk
// ═══════════════════════════════════════════════════════════════

export function computeFlightRisk(
  person: PersonState,
  now: Date,
  trend: PerformanceTrend,
  signals: ConversationSignals,
): { score: number; drivers: FlightRiskDriver[]; level: RiskLevel } {
  const drivers: FlightRiskDriver[] = [{ key: 'BASELINE', label: 'Baseline risk (everyone)', weight: 0.1 }];

  // ONE_ONE_CADENCE_SLIP
  const daysSinceLastOneOne = person.lastOneOneAt ? daysBetween(person.lastOneOneAt, now) : Infinity;
  if (daysSinceLastOneOne > 30) {
    drivers.push({ key: 'ONE_ONE_CADENCE_SLIP', label: `No 1:1 in ${daysSinceLastOneOne}d (>30d)`, weight: 0.4 });
  } else if (daysSinceLastOneOne > 21) {
    drivers.push({ key: 'ONE_ONE_CADENCE_SLIP', label: `No 1:1 in ${daysSinceLastOneOne}d (>21d)`, weight: 0.25 });
  }

  // PULSE_NEGATIVE
  const last3Pulses = lastN(person.pulses, 3);
  if (last3Pulses.length > 0) {
    const avgMood = last3Pulses.reduce((a, b) => a + b.mood, 0) / last3Pulses.length;
    if (avgMood < 2) {
      drivers.push({ key: 'PULSE_NEGATIVE', label: `Avg mood ${avgMood.toFixed(1)} (<2)`, weight: 0.35 });
    } else if (avgMood < 3) {
      drivers.push({ key: 'PULSE_NEGATIVE', label: `Avg mood ${avgMood.toFixed(1)} (<3)`, weight: 0.2 });
    }
  }

  // EXPLICIT_SIGNAL
  const signalsLast30 = person.flightSignalDates.filter((d) => daysBetween(d, now) <= 30).length;
  if (signalsLast30 > 1) {
    drivers.push({ key: 'EXPLICIT_SIGNAL', label: `${signalsLast30} flight signals in 30d`, weight: 0.6 });
  } else if (signalsLast30 > 0) {
    drivers.push({ key: 'EXPLICIT_SIGNAL', label: `${signalsLast30} flight signal in 30d`, weight: 0.4 });
  }

  // EXIT_KEYWORDS
  if (signals.hasExitSignal) {
    drivers.push({ key: 'EXIT_KEYWORDS', label: 'Exit language in last 2 one:ones', weight: 0.45 });
  }

  // COMP_FRUSTRATION
  if (signals.hasCompFrustration) {
    drivers.push({ key: 'COMP_FRUSTRATION', label: 'Compensation frustration in last 3 one:ones', weight: 0.2 });
  }

  // STALE_GOALS
  const staleGoals = person.goals.filter((g) => g.status === 'open' && daysBetween(g.lastUpdated, now) > 30);
  if (staleGoals.length >= 2) {
    drivers.push({ key: 'STALE_GOALS', label: `${staleGoals.length} stale/silent goals`, weight: 0.1 });
  }

  // OVERLOADED
  if (person.directReports.length > 8) {
    drivers.push({ key: 'OVERLOADED', label: `${person.directReports.length} direct reports (manager overload)`, weight: 0.1 });
  }

  // NO_GROWTH
  const recentSkillAdds = person.skillAddedDates.filter((d) => daysBetween(d, now) <= 90).length;
  if (trend === 'stable' && person.tenureDays > 365 && recentSkillAdds === 0) {
    drivers.push({ key: 'NO_GROWTH', label: 'Stable performance, tenured, no recent skill growth', weight: 0.15 });
  }

  const score = clamp01(drivers.reduce((sum, d) => sum + d.weight, 0));
  const level: RiskLevel = score > 0.7 ? 'critical' : score > 0.5 ? 'high' : score > 0.3 ? 'medium' : 'low';
  return { score, drivers, level };
}

// ═══════════════════════════════════════════════════════════════
// Burnout risk
// ═══════════════════════════════════════════════════════════════

export function computeBurnoutRisk(person: PersonState, now: Date, signals: ConversationSignals): { score: number; drivers: string[] } {
  let score = 0.1;
  const drivers: string[] = ['Baseline risk'];

  const pulsesLast14 = person.pulses.filter((p) => daysBetween(p.date, now) <= 14);
  if (pulsesLast14.length >= 2 && pulsesLast14.every((p) => p.mood < 3)) {
    score += 0.25;
    drivers.push('Avg mood < 3 sustained over last 2+ weeks');
  }

  if (person.directReports.length > 8) {
    score += 0.2;
    drivers.push(`${person.directReports.length} direct reports`);
  }

  const overdueLast30 = person.commitments.filter(
    (c) => !c.resolved && daysBetween(c.byDate, now) >= 0 && daysBetween(c.byDate, now) <= 30,
  ).length;
  const overdueCount = person.commitments.filter((c) => !c.resolved && new Date(c.byDate) < now).length;
  if (overdueCount >= 5 || overdueLast30 >= 5) {
    score += 0.15;
    drivers.push(`${Math.max(overdueCount, overdueLast30)} overdue commitments`);
  }

  if (signals.hasBurnoutSignal) {
    score += 0.3;
    drivers.push('Burnout language in last 2 one:ones');
  }

  const oooLast90 = person.oooDates.some((d) => daysBetween(d, now) <= 90);
  if (!oooLast90) {
    score += 0.1;
    drivers.push('No OOO/vacation logged in 90 days');
  }

  return { score: clamp01(score), drivers };
}

// ═══════════════════════════════════════════════════════════════
// 1:1 quality
// ═══════════════════════════════════════════════════════════════

export function computeOneOneQuality(person: PersonState, now: Date): OneOneQualityScore {
  const factors: string[] = [];
  const oneOnes = person.oneOnes;
  if (oneOnes.length === 0) {
    return { score: 0, factors: ['No 1:1s logged'] };
  }
  const last = oneOnes[oneOnes.length - 1];
  const daysSince = daysBetween(last.date, now);

  let score = 0;
  if (daysSince <= 14) {
    score = 50;
    factors.push('1:1 within last 14 days');
  } else if (daysSince <= 21) {
    score = 30;
    factors.push('1:1 within 15-21 days');
  } else if (daysSince <= 30) {
    score = 10;
    factors.push('1:1 within 22-30 days');
  } else {
    score = 0;
    factors.push(`Last 1:1 was ${daysSince} days ago`);
  }

  const lastWordCount = analyzeOneOne(last).wordCount;
  if (lastWordCount > 200) {
    score += 15;
    factors.push('Detailed notes (>200 words)');
  }
  if (last.topics.length >= 3) {
    score += 10;
    factors.push('3+ topics covered');
  }
  if (last.actionItems.length > 0) {
    score += 10;
    factors.push('Action items captured');
  }
  if (last.actionItems.length > 0 && last.actionItemsResolved) {
    score += 10;
    factors.push('Prior action items followed through');
  }

  const last3 = lastN(oneOnes, 3);
  if (last3.length === 3 && last3.every((o) => o.sentiment === -1)) {
    score -= 15;
    factors.push('Persistent negative sentiment (last 3)');
  }

  if (containsAny(last.notes, CAREER_KEYWORDS)) {
    score += 5;
    factors.push('Career conversation present');
  }

  return { score: Math.max(0, Math.min(100, score)), factors };
}

// ═══════════════════════════════════════════════════════════════
// Next 1:1 topics
// ═══════════════════════════════════════════════════════════════

export function computeNextOneOneTopics(signals: ConversationSignals, burnoutScore: number): string[] {
  const topics: string[] = [];
  if (signals.hasExitSignal) {
    topics.push('Direct retention conversation: career trajectory and what would make you stay');
  }
  if (signals.hasBurnoutSignal || burnoutScore > 0.5) {
    topics.push('Workload audit: what can we remove/defer?');
  }
  if (signals.hasCompFrustration) {
    topics.push('Compensation review scheduling');
  }
  if (topics.length === 0) {
    topics.push('Goal progress check-in + commitment review');
  }
  return topics.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════
// 9-box placement
// ═══════════════════════════════════════════════════════════════

const ACTIONS: Record<NineBoxCell, string> = {
  'high-high': 'Retention priority. Assign board-visible project. Discuss promotion timeline. Risk: {flightRiskLevel}',
  'high-mid': 'Deepen domain expertise. Monthly coaching. Protect from overload.',
  'high-low': 'Value maximization. Resist over-promoting. Recognize publicly.',
  'mid-high': 'Accelerate with stretch assignment. Increase 1:1 frequency.',
  'mid-mid': 'Standard development track. Clear quarterly goals.',
  'mid-low': 'Clarify expectations. Review in 90d.',
  'low-high': 'Investigate root cause. Role mismatch? Blocker? Urgent 1:1.',
  'low-mid': '30-day performance plan. Weekly manager support.',
  'low-low': 'PIP or transition conversation. Not sustainable in current role.',
};

export function computeNineBox(
  person: PersonState,
  trend: PerformanceTrend,
  latestScore: number | null,
  _signals: ConversationSignals,
  flightRiskLevel: RiskLevel,
  now: Date,
): { performanceAxis: NineBoxAxis; potentialAxis: NineBoxAxis; cell: NineBoxCell; action: string } {
  // Performance axis — scores are on a 1-10 scale.
  let performanceAxis: NineBoxAxis;
  if (latestScore === null) {
    performanceAxis = 'mid';
  } else if (latestScore < 4 || trend === 'declining') {
    performanceAxis = 'low';
  } else if (latestScore > 7 || (latestScore > 6 && trend === 'accelerating')) {
    performanceAxis = 'high';
  } else {
    performanceAxis = 'mid';
  }

  // Potential axis
  const skillAddsLast6mo = person.skillAddedDates.filter((d) => daysBetween(d, now) <= 182).length;
  const skillAddsLast12mo = person.skillAddedDates.filter((d) => daysBetween(d, now) <= 365).length;
  const hasCareerConversation = person.oneOnes.some((o) => containsAny(o.notes, CAREER_KEYWORDS));
  const promotionReadiness = clamp01(
    (latestScore ?? 5) / 10 + (trend === 'accelerating' ? 0.1 : trend === 'declining' ? -0.1 : 0),
  );
  const nominatedForSeniorRole = person.successionFor.length > 0;

  let potentialAxis: NineBoxAxis;
  if (skillAddsLast6mo >= 3 || trend === 'accelerating' || nominatedForSeniorRole) {
    potentialAxis = 'high';
  } else if (
    skillAddsLast12mo === 0 &&
    !hasCareerConversation &&
    person.tenureDays > 548 &&
    promotionReadiness < 0.3
  ) {
    potentialAxis = 'low';
  } else {
    potentialAxis = 'mid';
  }

  const cell = `${performanceAxis}-${potentialAxis}` as NineBoxCell;
  const action = ACTIONS[cell].replace('{flightRiskLevel}', flightRiskLevel);
  return { performanceAxis, potentialAxis, cell, action };
}

// ═══════════════════════════════════════════════════════════════
// Succession risk
// ═══════════════════════════════════════════════════════════════

export function computeSuccessionRisk(person: PersonState, potentialAxis: NineBoxAxis): SuccessionRisk {
  const isKeyPerson =
    person.directReports.length >= 3 || /\b(chief|vp|head|director)\b/i.test(person.title) || potentialAxis === 'high';
  const hasSuccessor = person.successors.length > 0;
  let timeToReadiness = 'n/a';
  if (person.successors.length > 0) {
    timeToReadiness = person.successors.length > 1 ? '6-12 months' : '12-18 months';
  }
  let warning: string | null = null;
  if (isKeyPerson && !hasSuccessor) {
    warning = `No successor identified for ${person.title}. Single point of failure.`;
  }
  return { isKeyPerson, hasSuccessor, timeToReadiness, warning };
}

// ═══════════════════════════════════════════════════════════════
// Orchestrator — computePersonIntelligence
// ═══════════════════════════════════════════════════════════════

export function computePersonIntelligence(
  person: PersonState,
  allPeople: PersonState[],
  _events: LeadosEvent[],
  now: Date,
  network?: { pageRankScores: Record<string, number>; maxPageRank: number; bridges: string[]; clusterOf: Record<string, string>; neighborClusters: Record<string, Set<string>> },
): PersonIntelligenceReport {
  const trend = computePerformanceTrend(person);
  const signals = computeConversationSignals(person.oneOnes);
  const flight = computeFlightRisk(person, now, trend, signals);
  const burnout = computeBurnoutRisk(person, now, signals);
  const oneOneQuality = computeOneOneQuality(person, now);
  const latestPerformanceScore = person.performanceHistory.length
    ? person.performanceHistory[person.performanceHistory.length - 1].score
    : null;
  const nineBox = computeNineBox(person, trend, latestPerformanceScore, signals, flight.level, now);
  const successionRisk = computeSuccessionRisk(person, nineBox.potentialAxis);
  const nextOneOneTopics = computeNextOneOneTopics(signals, burnout.score);

  const maxTenure = Math.max(1, ...allPeople.map((p) => p.tenureDays));
  const estimatedChangeInertia = clamp01(person.tenureDays / maxTenure);

  let networkCentrality = 0;
  let isBottleneck = false;
  let bridgeCount = 0;
  if (network) {
    const raw = network.pageRankScores[person.id] ?? 0;
    networkCentrality = network.maxPageRank > 0 ? clamp01(raw / network.maxPageRank) : 0;
    isBottleneck = network.bridges.includes(person.id);
    bridgeCount = network.neighborClusters[person.id]?.size ?? 0;
  }

  return {
    personId: person.id,
    name: person.name,
    title: person.title,
    flightRiskScore: flight.score,
    flightRiskDrivers: flight.drivers,
    flightRiskLevel: flight.level,
    burnoutRiskScore: burnout.score,
    burnoutDrivers: burnout.drivers,
    latestPerformanceScore,
    performanceTrend: trend,
    oneOneQuality,
    conversationSignals: signals,
    nextOneOneTopics,
    nineBoxPlacement: nineBox.cell,
    performanceAxis: nineBox.performanceAxis,
    potentialAxis: nineBox.potentialAxis,
    suggestedAction: nineBox.action,
    successionRisk,
    networkCentrality,
    isBottleneck,
    bridgeCount,
    estimatedChangeInertia,
  };
}

export function formatTenure(days: number): string {
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years === 0 && months === 0) return `${Math.max(1, days)} day${days === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.join(' ');
}
