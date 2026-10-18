// src/lib/attentionOpt.ts
// Quantum-inspired (so named by the source brief) attention-sequencing
// optimizer. This is a direct TypeScript implementation of the simulated-
// annealing algorithm and cost/benefit/urgency/dependency model described in
// this task's pasted "pt-U" brief.
//
// PROVENANCE, read before trusting any claim about "the real repo" here:
// github.com/wbweve/Leados was inspected this session (file tree via GitHub's
// REST API, raw fetches of src/App.tsx, src/lib/core.ts, src/lib/circadian.ts,
// src/lib/engine.ts, the repo's own AI-SESSION-LOG.md, and its README). No
// file, export, or identifier named `attentionOpt`, `buildAttentionItems`,
// `optimizeSequence`, `buildWeeklyAttentionPlan`, or any global `LEADOS`
// namespace object was found anywhere in that repo. The repo's real code
// (confirmed live) uses ES-module named exports per file, never a single
// global `LEADOS.*` object. The pasted brief's `LEADOS.attentionOpt = {...}`
// code sample is therefore treated here as an UNVERIFIED external
// specification, not as repo fact — full ledger in AI-SESSION-LOG.md.
//
// What follows reimplements the brief's *described algorithm* (simulated
// annealing per Kirkpatrick et al. 1983, applied to a knapsack-shaped
// attention-allocation problem) as fresh, original TypeScript, adapted to
// this app's own Finding/Playbook model. It is not a port of any verified
// prior implementation, because none was found to port.

import type { AttentionConstraints, AttentionItem, AttentionPlanResult, Finding, WeeklyAttentionPlan } from "./types";
import { PLAYBOOK_COST, DEFAULT_COST } from "./playbooks";
import { dependenciesForFinding } from "./engine";
import { getCurrentProfile } from "./circadian";
import { RULES_BY_ID } from "./rules";

export function buildAttentionItems(findings: Finding[], runwayMonths: number): AttentionItem[] {
  return findings.map((f) => {
    const downstreamBlocked = findings.filter(
      (other) => other.rule !== f.rule && other.sources.some((s) => f.sources.includes(s))
    ).length;

    const benefit = Math.round(f.score * (1 + downstreamBlocked * 0.3) * 100) / 100;

    const playId = ruleToPlaybook(f.rule);
    const cost = (playId && PLAYBOOK_COST[playId]) || DEFAULT_COST;

    // Urgency: days until escalation. Runway < 6 months pulls finance
    // findings forward, mirroring the brief's described runway-sensitivity.
    let urgency = f.sev >= 5 ? 0 : f.sev >= 4 ? 3 : f.sev >= 3 ? 7 : 14;
    if (f.category === "finance" && runwayMonths < 6) urgency = Math.min(urgency, 2);

    const dependencies = dependenciesForFinding(f.rule);
    const roi = Math.round((benefit / Math.max(0.5, cost.timeHours)) * 100) / 100;

    return {
      key: f.key,
      finding: f,
      benefit,
      timeHours: cost.timeHours,
      cogLoad: cost.cogLoad,
      urgency,
      dependencies,
      roi,
      playId,
      label:
        `${f.rule}: benefit=${benefit.toFixed(1)}, time=${cost.timeHours}h, ` +
        `cogLoad=${cost.cogLoad}/12, urgency=${urgency}d, ROI=${roi.toFixed(2)}`,
    };
  });
}

function ruleToPlaybook(rule: string) {
  return RULES_BY_ID[rule]?.playId ?? null;
}

// Simple deterministic PRNG (mulberry32) so a given seed reproduces a given
// plan — used for the optional "repeat last run" control in the UI.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function optimizeSequence(
  items: AttentionItem[],
  constraints: AttentionConstraints,
  rand: () => number = Math.random
): AttentionPlanResult {
  const { availableHours, maxCogLoad, temperature, coolingRate, iterations } = constraints;

  // Filter out items whose dependencies aren't present among candidate items
  // at all (can never be satisfied this run).
  const resolvable = items.filter((item) =>
    item.dependencies.every((dep) => items.some((other) => other.finding.rule === dep))
  );

  if (resolvable.length === 0) {
    return {
      sequence: [],
      totalBenefit: 0,
      totalHours: 0,
      totalCogLoad: 0,
      utilizationHours: 0,
      utilizationCog: 0,
      deferred: items,
      iterations,
      label: "No resolvable findings (either none active, or all dependencies unmet).",
    };
  }

  let current = [...resolvable].sort((a, b) => b.roi - a.roi);

  const evaluate = (sequence: AttentionItem[]) => {
    let hours = 0,
      cogLoad = 0,
      benefit = 0;
    const included = new Set<string>();
    for (const item of sequence) {
      const depsMet = item.dependencies.every((dep) => included.has(dep));
      if (!depsMet) continue;
      if (hours + item.timeHours > availableHours) continue;
      if (cogLoad + item.cogLoad > maxCogLoad) continue;
      const positionHours = hours;
      if (item.urgency > 0 && positionHours > item.urgency * 8) continue;
      hours += item.timeHours;
      cogLoad += item.cogLoad;
      benefit += item.benefit;
      included.add(item.finding.rule);
    }
    return { benefit, hours, cogLoad, included };
  };

  let bestSolution = current;
  let bestScore = evaluate(current).benefit;
  let T = temperature;

  for (let i = 0; i < iterations; i++) {
    const idx1 = Math.floor(rand() * current.length);
    const idx2 = Math.floor(rand() * current.length);
    const neighbor = [...current];
    [neighbor[idx1], neighbor[idx2]] = [neighbor[idx2], neighbor[idx1]];

    const neighborScore = evaluate(neighbor).benefit;
    const currentScore = evaluate(current).benefit;
    const delta = neighborScore - currentScore;

    if (delta > 0 || rand() < Math.exp(delta / Math.max(T, 1e-6))) {
      current = neighbor;
      if (neighborScore > bestScore) {
        bestSolution = neighbor;
        bestScore = neighborScore;
      }
    }
    T *= 1 - coolingRate;
  }

  const result = evaluate(bestSolution);
  const selectedItems: AttentionItem[] = [];
  let hrs = 0,
    cog = 0;
  const included = new Set<string>();
  for (const item of bestSolution) {
    const depsMet = item.dependencies.every((d) => included.has(d));
    if (!depsMet) continue;
    if (hrs + item.timeHours > availableHours) continue;
    if (cog + item.cogLoad > maxCogLoad) continue;
    hrs += item.timeHours;
    cog += item.cogLoad;
    selectedItems.push(item);
    included.add(item.finding.rule);
  }

  const deferredSet = new Set(selectedItems.map((i) => i.key));
  return {
    sequence: selectedItems,
    totalBenefit: Math.round(result.benefit * 100) / 100,
    totalHours: hrs,
    totalCogLoad: cog,
    utilizationHours: availableHours > 0 ? Math.round((hrs / availableHours) * 100) : 0,
    utilizationCog: maxCogLoad > 0 ? Math.round((cog / maxCogLoad) * 100) : 0,
    deferred: items.filter((i) => !deferredSet.has(i.key)),
    iterations,
    label:
      `Simulated annealing optimization: ${iterations} iterations. ` +
      `Initial temperature ${temperature}, cooling rate ${coolingRate}. ` +
      `Method named after Kirkpatrick et al. (1983) — labeled: this is an ` +
      `NP-hard knapsack-with-dependencies approximation. Optimality is not ` +
      `guaranteed; result is a high-quality heuristic, not a proof of best fit.`,
  };
}

function scheduleToDays(sequence: AttentionItem[]): Record<string, AttentionItem[]> {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const schedule: Record<string, AttentionItem[]> = {};
  let dayIdx = 0,
    dayHours = 0;
  sequence.forEach((item) => {
    if (dayHours + item.timeHours > 6 || dayIdx >= days.length) {
      dayIdx++;
      dayHours = 0;
    }
    if (dayIdx >= days.length) {
      schedule["Next Week"] = [...(schedule["Next Week"] || []), item];
      return;
    }
    const day = days[dayIdx];
    schedule[day] = [...(schedule[day] || []), item];
    dayHours += item.timeHours;
  });
  return schedule;
}

export function buildWeeklyAttentionPlan(
  findings: Finding[],
  runwayMonths: number,
  overrides?: Partial<AttentionConstraints>,
  seed?: number
): WeeklyAttentionPlan {
  const items = buildAttentionItems(findings, runwayMonths);
  const circadian = getCurrentProfile();
  const baseHours = overrides?.availableHours ?? 6 * 5;
  const cogBudget = overrides?.maxCogLoad ?? Math.round(40 * circadian.analytical);

  const constraints: AttentionConstraints = {
    availableHours: baseHours,
    maxCogLoad: cogBudget,
    temperature: overrides?.temperature ?? 1000,
    coolingRate: overrides?.coolingRate ?? 0.003,
    iterations: overrides?.iterations ?? 4000,
  };

  const rand = typeof seed === "number" ? mulberry32(seed) : Math.random;
  const plan = optimizeSequence(items, constraints, rand);
  const scheduled = scheduleToDays(plan.sequence);

  return {
    ...plan,
    scheduled,
    weekSummary:
      `${plan.sequence.length} findings addressed, ${plan.deferred.length} deferred. ` +
      `${plan.totalHours}h of ${baseHours}h budget used. Total benefit: ${plan.totalBenefit}.`,
  };
}
