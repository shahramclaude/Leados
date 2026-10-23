// src/lib/leaderState/decisionLoad.ts
//
// Pure functions turning a person's OWN decision + recovery records into the
// "My State" dashboard payload. Nothing here touches the database or an
// identity — callers (API routes) fetch self-scoped rows via
// leaderState/repository.ts first. Every returned structure carries an
// explicit confidence/uncertainty field; see UncertaintyNote.tsx and the
// uncertainty-displayed lint test that enforces these are always rendered.

import { decisionCognitiveWeight, isHighStakes } from "@/lib/cognitiveLoad";
import { bucketForHour, type TimeBucket } from "@/lib/circadian";
import { computeFatigueProxy, type FatigueProxyResult } from "@/lib/fatigue";
import { meetingLoadFactor } from "@/lib/timeEconomics";
import type { DecisionRecord, RecoverySignalRecord } from "@/lib/leaderState/types";

export interface DailyDecisionLoad {
  date: string; // YYYY-MM-DD
  decisionCount: number;
  totalCognitiveWeight: number;
  meetingLoadFactor: number | null;
  /** Blend of decision weight and meeting load, 0..~10 scale, descriptive only. */
  combinedLoadScore: number;
}

const MIN_BUCKET_SAMPLE = 3;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function summarizeDailyLoad(
  decisions: DecisionRecord[],
  recoverySignals: RecoverySignalRecord[],
): DailyDecisionLoad[] {
  const weightByDay = new Map<string, { count: number; weight: number }>();
  for (const d of decisions) {
    const key = dateKey(d.decidedAt);
    const entry = weightByDay.get(key) ?? { count: 0, weight: 0 };
    entry.count += 1;
    entry.weight += decisionCognitiveWeight(d, d.reversibility);
    weightByDay.set(key, entry);
  }

  const meetingMinutesByDay = new Map<string, number>();
  for (const r of recoverySignals) meetingMinutesByDay.set(r.date, r.meetingMinutes);

  const allDays = new Set<string>([...weightByDay.keys(), ...meetingMinutesByDay.keys()]);

  return [...allDays].sort().map((date) => {
    const decisionPart = weightByDay.get(date) ?? { count: 0, weight: 0 };
    const minutes = meetingMinutesByDay.get(date);
    const mlf = minutes === undefined ? null : meetingLoadFactor({ meetingMinutes: minutes });
    const combinedLoadScore = decisionPart.weight * (1 + (mlf ?? 0) * 0.5);
    return {
      date,
      decisionCount: decisionPart.count,
      totalCognitiveWeight: Math.round(decisionPart.weight * 100) / 100,
      meetingLoadFactor: mlf,
      combinedLoadScore: Math.round(combinedLoadScore * 100) / 100,
    };
  });
}

export interface DecisionWindowSuggestion {
  bucket: TimeBucket | null;
  confidence: "insufficient-data" | "low" | "moderate";
  sampleSize: number;
  statement: string;
}

/**
 * "Your highest-stakes decisions historically cluster in mornings" style
 * suggestion — built ONLY from the person's own self-rated high-stakes
 * decisions. Always framed as a suggestion, always carries sample size, and
 * never claims causation.
 */
export function decisionWindowSuggestion(decisions: DecisionRecord[]): DecisionWindowSuggestion {
  const highStakesRated = decisions.filter(
    (d) => isHighStakes(d, d.reversibility) && d.selfRatedQuality != null,
  );

  const byBucket = new Map<TimeBucket, number[]>();
  for (const d of highStakesRated) {
    const bucket = bucketForHour(d.decidedAt.getHours());
    const arr = byBucket.get(bucket) ?? [];
    arr.push(d.selfRatedQuality as number);
    byBucket.set(bucket, arr);
  }

  const eligible = [...byBucket.entries()].filter(([, v]) => v.length >= MIN_BUCKET_SAMPLE);
  if (eligible.length === 0) {
    return {
      bucket: null,
      confidence: "insufficient-data",
      sampleSize: highStakesRated.length,
      statement:
        "Not enough self-rated high-stakes decisions yet to suggest a window. Keep logging and rating decisions you consider high-stakes.",
    };
  }

  let best: TimeBucket = eligible[0][0];
  let bestAvg = -Infinity;
  let bestN = 0;
  for (const [bucket, values] of eligible) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = bucket;
      bestN = values.length;
    }
  }

  const confidence: "low" | "moderate" = bestN >= 8 ? "moderate" : "low";
  return {
    bucket: best,
    confidence,
    sampleSize: bestN,
    statement:
      `Based on ${bestN} of your own past high-stakes decisions, you rated your decisions highest when made ` +
      `during the "${best}" window. This is a correlational pattern in your own history, not a rule — ` +
      `treat it as a suggestion to try, not a finding about how you ought to work.`,
  };
}

export interface CapacityDashboard {
  dailyLoad: DailyDecisionLoad[];
  fatigueProxy: FatigueProxyResult;
  decisionWindow: DecisionWindowSuggestion;
  uncertaintyDisclosed: true;
  evidenceNote: string;
}

const EVIDENCE_NOTE =
  "These patterns come only from your own logged, self-rated decisions. They are a self-reflection aid, " +
  "not a validated clinical or performance measurement — small samples, mood, and memory can all skew " +
  "self-ratings. Nothing here is shared with anyone else.";

export function buildCapacityDashboard(
  decisions: DecisionRecord[],
  recoverySignals: RecoverySignalRecord[],
): CapacityDashboard {
  const ratedPoints = decisions
    .filter((d) => d.selfRatedQuality != null)
    .map((d) => ({ hourOfDay: d.decidedAt.getHours(), selfRatedQuality: d.selfRatedQuality as number }));

  return {
    dailyLoad: summarizeDailyLoad(decisions, recoverySignals),
    fatigueProxy: computeFatigueProxy(ratedPoints),
    decisionWindow: decisionWindowSuggestion(decisions),
    uncertaintyDisclosed: true,
    evidenceNote: EVIDENCE_NOTE,
  };
}
