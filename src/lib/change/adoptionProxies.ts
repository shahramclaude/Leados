import { aggregationGate, K_ANONYMITY_THRESHOLD, type GateResult } from "@/lib/privacy/aggregation";
import { explain, type Explain } from "@/lib/explain";
import type { FunnelCounts, FunnelStage, ProxyKind } from "./types";

/**
 * Adoption-proxy extraction rules (Phase 3a) + validity caveats (Phase 4
 * gate 5 — published in full in docs/CHANGE.md). Each rule states what it
 * assumes about the event log and how it could mislead if that assumption
 * breaks.
 */
export const PROXY_RULES: Record<
  ProxyKind,
  { description: string; assumes: string; misleadingWhen: string }
> = {
  feature_usage: {
    description: "Count of a defined event type emitted by a person's use of a system/feature.",
    assumes: "The event fires only on genuine, intended use of the feature (not on page load, bot, or accidental clicks).",
    misleadingWhen:
      "Usage can be gamed by opening/clicking without engaging (checkbox compliance), or by shared logins inflating distinct-user counts.",
  },
  process_conformance: {
    description: "Count of workflow-step completions recorded by the system of record for a changed process.",
    assumes: "The recorded step reflects the actual work done, not a late/batch backfill or a parallel shadow process.",
    misleadingWhen:
      "People can satisfy the recorded step while continuing the old process off-system ('entering data to look compliant').",
  },
  ritual_participation: {
    description: "Count of calendar/attendance events for a defined recurring ritual (standup, retro, review).",
    assumes: "Attendance implies participation, and the ritual itself is a faithful proxy for the target behavior.",
    misleadingWhen:
      "Attendance without engagement (silently present), or ritual fatigue that persists attendance while value declines.",
  },
};

export interface ChangeEventRecord {
  personId: string;
  groupId: string;
  proxyEventType: string;
  occurredAt: Date;
  periodIndex?: number | null;
}

export interface FunnelThresholds {
  /** Distinct calendar weeks with at least one event, within the lookback window, to count as "habit". */
  habitWeeks: number;
  lookbackDays: number;
}

export const DEFAULT_FUNNEL_THRESHOLDS: FunnelThresholds = {
  habitWeeks: 3,
  lookbackDays: 42, // 6 weeks
};

function weekKey(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(copy.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((copy.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${copy.getUTCFullYear()}-W${week}`;
}

export type PersonStage = { personId: string; stage: FunnelStage; distinctWeeks: number; totalEvents: number };

/**
 * Lightweight per-period activity rate: fraction of the roster with at least
 * one proxy event tagged with the given `periodIndex`. Used as the outcome
 * series for stepped-wedge intervention effect estimation (a simpler signal
 * than the full awareness/trial/habit funnel, appropriate for short
 * per-period windows).
 */
export function periodActivityRate(
  events: readonly ChangeEventRecord[],
  groupId: string,
  periodIndex: number,
  rosterPersonIds: readonly string[]
): number {
  if (rosterPersonIds.length === 0) return 0;
  const activePeople = new Set(
    events
      .filter((e) => e.groupId === groupId)
      .filter((e) => e.periodIndex === periodIndex)
      .map((e) => e.personId)
  );
  let count = 0;
  for (const pid of rosterPersonIds) if (activePeople.has(pid)) count += 1;
  return count / rosterPersonIds.length;
}

/**
 * Classify a single person's funnel stage from raw proxy events, relative to
 * `now`. This function operates on individual records but is never exposed
 * directly — callers must pass the result through `aggregateFunnelCounts`,
 * which enforces k-anonymity before any number reaches an API response.
 */
export function classifyPersonStage(
  events: readonly ChangeEventRecord[],
  personId: string,
  now: Date,
  thresholds: FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS
): PersonStage {
  const cutoff = new Date(now.getTime() - thresholds.lookbackDays * 86400000);
  const personEvents = events.filter((e) => e.personId === personId && e.occurredAt >= cutoff && e.occurredAt <= now);
  const totalEvents = personEvents.length;
  const distinctWeeks = new Set(personEvents.map((e) => weekKey(e.occurredAt))).size;

  let stage: FunnelStage = "awareness";
  if (totalEvents === 0) {
    // No proxy events at all means we cannot even assert awareness; treat as
    // pre-awareness but the funnel only tracks awareness+ so we still label
    // it "awareness" with zero weight at aggregation time via `reached`.
    stage = "awareness";
  } else if (distinctWeeks >= thresholds.habitWeeks) {
    stage = "habit";
  } else {
    stage = "trial";
  }
  return { personId, stage, distinctWeeks, totalEvents };
}

/**
 * Aggregate per-group funnel counts (awareness/trial/habit) from raw events,
 * gated by k-anonymity. Returns a suppressed result if the group has fewer
 * than `K_ANONYMITY_THRESHOLD` distinct people with any recorded activity
 * in-window (including zero-activity "awareness only" members who are known
 * to be in the affected group roster).
 */
/** Raw (ungated) funnel counts for a roster. Internal building block — callers must apply `aggregationGate` before this leaves the server. */
export function countFunnelStages(
  events: readonly ChangeEventRecord[],
  groupId: string,
  rosterPersonIds: readonly string[],
  now: Date,
  thresholds: FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS
): FunnelCounts {
  const groupEvents = events.filter((e) => e.groupId === groupId);
  let awareness = 0;
  let trial = 0;
  let habit = 0;
  for (const pid of rosterPersonIds) {
    const p = classifyPersonStage(groupEvents, pid, now, thresholds);
    if (p.totalEvents > 0) awareness += 1;
    if (p.stage === "trial") trial += 1;
    if (p.stage === "habit") habit += 1;
  }
  return { awareness, trial, habit };
}

export function aggregateFunnelCounts(
  events: readonly ChangeEventRecord[],
  groupId: string,
  rosterPersonIds: readonly string[],
  now: Date,
  thresholds: FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS
): GateResult<Explain<FunnelCounts>> {
  const groupSize = rosterPersonIds.length;

  return aggregationGate(groupSize, () => {
    const counts = countFunnelStages(events, groupId, rosterPersonIds, now, thresholds);
    return explain<FunnelCounts>(
      counts,
      "aggregate_funnel_counts_v1",
      { groupId, groupSize, habitWeeks: thresholds.habitWeeks, lookbackDays: thresholds.lookbackDays },
      {
        confidence: groupSize >= K_ANONYMITY_THRESHOLD * 2 ? "high" : "medium",
        caveats: [
          "Awareness is approximated by 'any recorded proxy event in-window'; true awareness (knowledge of the change) is not directly observable.",
          "Trial vs habit boundary is a fixed weekly-recurrence heuristic, not a validated behavioral threshold.",
          PROXY_RULES.feature_usage.misleadingWhen,
        ],
      }
    );
  });
}
