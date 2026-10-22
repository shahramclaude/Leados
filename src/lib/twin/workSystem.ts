// src/lib/twin/workSystem.ts
//
// Initiative backlog: Poisson arrivals, log-normal effort, WIP-limited
// capacity-based progress, and Little's-law instrumentation.
//
// Little's law: for any work-conserving queueing system that reaches
// steady state, L = λW where
//   L = time-average number of items "in system" (queued + active)
//   λ = long-run average arrival (= departure) rate
//   W = long-run average time an item spends in system
// `computeLittlesLaw` in this file computes all three from a weekly history
// window and reports the relative error so tests can assert it stays <2%.

import { ALL_SKILLS, type QueueDiscipline, type WorkItem, type WeeklyMetrics, type Skill } from "./types";
import type { Rng } from "./prng";

export function sampleArrivals(
  week: number,
  lambda: number,
  effortMeanHrs: number,
  effortSpread: number,
  nextSeqRef: { value: number },
  rng: Rng,
): WorkItem[] {
  const count = rng.poisson(lambda);
  const items: WorkItem[] = [];
  const sigma = Math.max(0.05, effortSpread);
  const mu = Math.log(Math.max(1, effortMeanHrs)) - (sigma * sigma) / 2;
  const maxEffort = Math.max(effortMeanHrs * 4, 20);
  for (let i = 0; i < count; i++) {
    const effort = Math.min(maxEffort, Math.max(4, rng.logNormal(mu, sigma)));
    const skill: Skill = rng.pick(ALL_SKILLS);
    items.push({
      id: `wi-${week}-${nextSeqRef.value++}`,
      arrivalWeek: week,
      effortHrsEstimate: effort,
      effortHrsRemaining: effort,
      requiredSkill: skill,
      priority: Math.round(rng.uniform(1, 5)),
      status: "queued",
      startWeek: null,
      completeWeek: null,
    });
  }
  return items;
}

export interface ProgressResult {
  backlog: WorkItem[];
  completedThisWeek: WorkItem[];
  hoursSpent: number;
  /**
   * Number of items "in system" at any point during this week — i.e. queued
   * or active BEFORE this week's completions are removed. This is the
   * correct L sample for Little's law: an item that completes this week was
   * still present (consuming capacity) for part of the week and must be
   * counted, otherwise L is systematically undercounted by completedThisWeek
   * every period and L = λW appears to fail even though the underlying
   * dynamics are stable.
   */
  inSystemCount: number;
}

/**
 * Advance the backlog by one week given total available capacity hours.
 * Only up to `wipLimit` items may be "active" (consuming capacity)
 * concurrently; the rest wait in queue. This is a generic, work-conserving
 * single-pool queueing model (not tied to a specific queueing formula),
 * which is exactly the kind of system Little's law applies to.
 */
export function progressBacklog(
  backlog: WorkItem[],
  week: number,
  availableHours: number,
  wipLimit: number,
  discipline: QueueDiscipline,
): ProgressResult {
  const items = backlog.filter((i) => i.status === "queued" || i.status === "active");
  const ordered = [...items].sort((a, b) => {
    if (discipline === "priority") {
      if (a.priority !== b.priority) return a.priority - b.priority;
    }
    return a.arrivalWeek - b.arrivalWeek || a.id.localeCompare(b.id);
  });

  // Promote queued -> active up to WIP limit.
  let activeCount = ordered.filter((i) => i.status === "active").length;
  for (const item of ordered) {
    if (activeCount >= wipLimit) break;
    if (item.status === "queued") {
      item.status = "active";
      item.startWeek = week;
      activeCount++;
    }
  }

  const activeItems = ordered.filter((i) => i.status === "active");
  let remainingHours = availableHours;
  const completed: WorkItem[] = [];
  for (const item of activeItems) {
    if (remainingHours <= 0) break;
    const spend = Math.min(remainingHours, item.effortHrsRemaining);
    item.effortHrsRemaining -= spend;
    remainingHours -= spend;
    if (item.effortHrsRemaining <= 1e-6) {
      item.status = "done";
      item.completeWeek = week;
      completed.push(item);
    }
  }

  const untouched = backlog.filter((i) => i.status === "done" || i.status === "dropped");
  const stillInSystem = ordered.filter((i) => i.status === "queued" || i.status === "active");

  return {
    backlog: [...stillInSystem, ...untouched],
    completedThisWeek: completed,
    hoursSpent: availableHours - remainingHours,
    inSystemCount: ordered.length,
  };
}

export interface LittlesLawReport {
  L: number;
  lambda: number;
  W: number;
  productLambdaW: number;
  relativeErrorPct: number;
}

/**
 * Compute L, λ, W over a (steady-state) window of weekly metrics plus the raw
 * backlog needed for completed-item sojourn times.
 */
export function computeLittlesLaw(
  weeks: WeeklyMetrics[],
  warmupWeeks: number,
): LittlesLawReport {
  const window = weeks.filter((w) => w.week > warmupWeeks);
  if (window.length === 0) {
    return { L: 0, lambda: 0, W: 0, productLambdaW: 0, relativeErrorPct: 100 };
  }
  const L = window.reduce((s, w) => s + w.backlogLength, 0) / window.length;
  const totalCompleted = window.reduce((s, w) => s + w.completedThisWeek, 0);
  const lambda = totalCompleted / window.length;

  const sojournWeighted = window.reduce((s, w) => {
    if (w.avgSojournWeeksCompleted === null) return s;
    return s + w.avgSojournWeeksCompleted * w.completedThisWeek;
  }, 0);
  const W = totalCompleted > 0 ? sojournWeighted / totalCompleted : 0;

  const productLambdaW = lambda * W;
  const relativeErrorPct = L > 0 ? (Math.abs(L - productLambdaW) / L) * 100 : 0;

  return { L, lambda, W, productLambdaW, relativeErrorPct };
}
