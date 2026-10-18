// The Emergent Pattern Detector — statistical anomaly detection over the
// event log that is not keyed to any predefined rule: frequency anomalies
// (Poisson z-score), temporal co-occurrence clustering, and per-person
// behavioral change points (CUSUM control chart).
//
// Original implementation for this sandbox, built from the task's pasted
// "pt-V" brief's *described behavior* (LEADOS.emergent) — no such module
// was found anywhere in github.com/wbweve/Leados this session.

import type { LeadosEvent, Person } from './types';
import { ageDays, mean, round1, stdDev } from './metrics';

export interface FrequencyAnomaly {
  eventType: string;
  recent30d: number;
  baseline30d: number;
  zScore: number;
  direction: 'SPIKE' | 'DROP';
  severity: 'STRONG' | 'MODERATE';
  interpretation: string;
}

export function detectFrequencyAnomalies(events: LeadosEvent[], today: Date) {
  const anomalies: FrequencyAnomaly[] = [];
  const allTypes = Array.from(new Set(events.map((e) => e.type)));

  allTypes.forEach((type) => {
    const recent30 = events.filter((e) => e.type === type && ageDays(e.ts, today) <= 30).length;
    const prior90 = events.filter((e) => e.type === type && ageDays(e.ts, today) > 30 && ageDays(e.ts, today) <= 120).length;
    if (prior90 < 3) return;

    const expectedRate = prior90 / 3;
    const zScore = expectedRate > 0 ? (recent30 - expectedRate) / Math.sqrt(expectedRate) : 0;

    if (Math.abs(zScore) >= 2.0) {
      const direction: 'SPIKE' | 'DROP' = zScore > 0 ? 'SPIKE' : 'DROP';
      anomalies.push({
        eventType: type,
        recent30d: recent30,
        baseline30d: Math.round(expectedRate),
        zScore: round1(zScore),
        direction,
        severity: Math.abs(zScore) >= 3 ? 'STRONG' : 'MODERATE',
        interpretation:
          direction === 'SPIKE'
            ? `${type} events are occurring ${Math.round((recent30 / expectedRate) * 100 - 100)}% more than baseline. Something changed.`
            : `${type} events have dropped ${Math.round(100 - (recent30 / expectedRate) * 100)}% below baseline. Something stopped.`,
      });
    }
  });

  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  return {
    anomalies,
    label: `${anomalies.length} frequency anomalies across ${allTypes.length} event types. Threshold |z| ≥ 2.0. Method: Poisson frequency comparison (30d vs. prior-90d baseline).`,
  };
}

export interface TemporalCluster {
  typeA: string;
  typeB: string;
  coOccurrences: number;
  expectedRate: number;
  ratio: number;
  interpretation: string;
  hypothesis: string;
}

const INTERESTING_PAIRS: [string, string][] = [
  ['hr.attrition.logged', 'conflict.logged'],
  ['ops.incident.logged', 'hr.attrition.logged'],
  ['feedback.given', 'engagement.pulse'],
  ['decision.logged', 'conflict.logged'],
  ['fin.pl.logged', 'hr.pip.started'],
];

export function detectTemporalClustering(events: LeadosEvent[], historySpanDays = 150) {
  const clusters: TemporalCluster[] = [];

  INTERESTING_PAIRS.forEach(([typeA, typeB]) => {
    const eventsA = events.filter((e) => e.type === typeA);
    const eventsB = events.filter((e) => e.type === typeB);
    if (eventsA.length < 2 || eventsB.length < 2) return;

    let coOccurrences = 0;
    eventsA.forEach((a) => {
      const within = eventsB.some((b) => Math.abs((new Date(a.ts).getTime() - new Date(b.ts).getTime()) / 86400000) <= 7);
      if (within) coOccurrences++;
    });

    const windowFraction = 7 / historySpanDays;
    const expectedRate = eventsA.length * eventsB.length * windowFraction;
    const observedRate = coOccurrences;

    if (observedRate > expectedRate * 2 && coOccurrences >= 2) {
      clusters.push({
        typeA,
        typeB,
        coOccurrences,
        expectedRate: round1(expectedRate),
        ratio: round1(observedRate / Math.max(0.1, expectedRate)),
        interpretation: `${typeA} and ${typeB} co-occur within 7 days ${Math.round(observedRate / Math.max(0.1, expectedRate))}× more than expected by chance.`,
        hypothesis: `There may be a causal or common-cause relationship between ${typeA} and ${typeB}.`,
      });
    }
  });

  return {
    clusters,
    label: `${clusters.length} temporal co-occurrence patterns. Method: expected-vs-observed co-occurrence rate, 7-day window.`,
  };
}

export interface BehaviorChangePoint {
  person: Person;
  changeWeek: number;
  direction: 'INCREASE' | 'DECREASE';
  preMean: number;
  postMean: number;
}

export function detectBehaviorChangePoints(events: LeadosEvent[], roster: Person[], today: Date) {
  const changePoints: BehaviorChangePoint[] = [];

  roster.forEach((person) => {
    const personEvents = events
      .filter((e) => e.data?.personId === person.id || e.data?.person1Id === person.id || e.data?.person2Id === person.id)
      .sort((a, b) => (a.ts < b.ts ? -1 : 1));
    if (personEvents.length < 10) return;

    const weekBins: Record<number, number> = {};
    personEvents.forEach((e) => {
      const week = Math.floor(ageDays(e.ts, today) / 7);
      weekBins[week] = (weekBins[week] || 0) + 1;
    });

    // Order weeks oldest -> newest for CUSUM walk.
    const weekKeys = Object.keys(weekBins).map(Number).sort((a, b) => b - a);
    const counts = weekKeys.map((w) => weekBins[w]);
    if (counts.length < 4) return;

    const m = mean(counts) ?? 0;
    const sd = stdDev(counts);
    let cusum = 0;
    const k = sd * 0.5;
    let changeDetected = false;
    let changeWeekIdx: number | null = null;

    counts.forEach((count, i) => {
      cusum = Math.max(0, cusum + (count - m) - k);
      if (cusum > 3 * sd && !changeDetected && sd > 0) {
        changeDetected = true;
        changeWeekIdx = i;
      }
    });

    if (changeDetected && changeWeekIdx !== null) {
      const post = counts.slice(changeWeekIdx);
      const postMean = mean(post) ?? m;
      changePoints.push({
        person,
        changeWeek: weekKeys[changeWeekIdx],
        direction: postMean > m ? 'INCREASE' : 'DECREASE',
        preMean: round1(m),
        postMean: round1(postMean),
      });
    }
  });

  return {
    changePoints,
    label: `${changePoints.length} behavioral change points. Method: CUSUM control chart over weekly event-frequency bins per person.`,
  };
}
