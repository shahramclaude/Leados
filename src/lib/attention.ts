// ════════════════════════════════════════════════════════════════════
// Simulated annealing attention optimizer. Pure. No DB calls.
// ════════════════════════════════════════════════════════════════════

import { Finding } from "./engine";

export interface AttentionItem {
  key: string;
  rule: string;
  title: string;
  domain: string;
  sev: number;
  benefit: number;
  timeHours: number;
  cogLoad: number;
  urgencyDays: number;
  roi: number;
  playId: string | null;
}

export interface AttentionPlan {
  sequence: AttentionItem[];
  deferred: AttentionItem[];
  totalBenefit: number;
  totalHours: number;
  totalCogLoad: number;
  utilizationPct: number;
  schedule: Record<string, AttentionItem[]>;
  label: string;
}

const PLAY_COSTS: Record<string, { timeHours: number; cogLoad: number }> = {
  "oneonone-bundle": { timeHours: 2, cogLoad: 3 },
  "termination-prep": { timeHours: 4, cogLoad: 10 },
  "pl-review": { timeHours: 3, cogLoad: 8 },
  "sprint-plan": { timeHours: 2, cogLoad: 5 },
  "board-narrative": { timeHours: 4, cogLoad: 9 },
  "crisis-response": { timeHours: 6, cogLoad: 12 },
  default: { timeHours: 1.5, cogLoad: 4 },
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildAttentionItems(findings: Finding[]): AttentionItem[] {
  return findings.map((f) => {
    const downstream = findings.filter((other) => other.rule !== f.rule && other.domain === f.domain).length;
    const benefit = f.sev * (1 + downstream * 0.2);
    const cost = PLAY_COSTS["default"];
    const urgency = f.sev >= 5 ? 0 : f.sev >= 4 ? 3 : f.sev >= 3 ? 7 : 14;
    return {
      key: f.key,
      rule: f.rule,
      title: f.title,
      domain: f.domain,
      sev: f.sev,
      benefit: Math.round(benefit * 100) / 100,
      timeHours: cost.timeHours,
      cogLoad: cost.cogLoad,
      urgencyDays: urgency,
      roi: Math.round((benefit / cost.timeHours) * 100) / 100,
      playId: null,
    };
  });
}

function evaluate(
  sequence: AttentionItem[],
  maxHours: number,
  maxCogLoad: number
): { benefit: number; hours: number; cogLoad: number; included: Set<string> } {
  let hours = 0,
    cogLoad = 0,
    benefit = 0;
  const included = new Set<string>();
  for (const item of sequence) {
    if (hours + item.timeHours > maxHours) continue;
    if (cogLoad + item.cogLoad > maxCogLoad) continue;
    hours += item.timeHours;
    cogLoad += item.cogLoad;
    benefit += item.benefit;
    included.add(item.rule);
  }
  return { benefit, hours, cogLoad, included };
}

export function optimizeAttention(
  items: AttentionItem[],
  availableHours = 30,
  maxCogLoad = 40,
  iterations = 3000
): AttentionPlan {
  if (items.length === 0) {
    return {
      sequence: [],
      deferred: [],
      totalBenefit: 0,
      totalHours: 0,
      totalCogLoad: 0,
      utilizationPct: 0,
      schedule: {},
      label: "No active findings — nothing to schedule.",
    };
  }

  const rand = mulberry32(42);
  let current = [...items].sort((a, b) => b.roi - a.roi);
  let bestSolution = current;
  let bestScore = evaluate(current, availableHours, maxCogLoad).benefit;
  let T = 1000;

  for (let i = 0; i < iterations; i++) {
    const idx1 = Math.floor(rand() * current.length);
    const idx2 = Math.floor(rand() * current.length);
    const neighbor = [...current];
    [neighbor[idx1], neighbor[idx2]] = [neighbor[idx2], neighbor[idx1]];

    const delta = evaluate(neighbor, availableHours, maxCogLoad).benefit - evaluate(current, availableHours, maxCogLoad).benefit;
    if (delta > 0 || rand() < Math.exp(delta / T)) {
      current = neighbor;
      const score = evaluate(current, availableHours, maxCogLoad).benefit;
      if (score > bestScore) {
        bestSolution = current;
        bestScore = score;
      }
    }
    T *= 0.997;
  }

  const result = evaluate(bestSolution, availableHours, maxCogLoad);
  const selected: AttentionItem[] = [];
  let hrs = 0,
    cog = 0;
  for (const item of bestSolution) {
    if (hrs + item.timeHours > availableHours) continue;
    if (cog + item.cogLoad > maxCogLoad) continue;
    hrs += item.timeHours;
    cog += item.cogLoad;
    selected.push(item);
  }
  const deferred = items.filter((i) => !selected.some((s) => s.key === i.key));

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const schedule: Record<string, AttentionItem[]> = {};
  let dayIdx = 0,
    dayHrs = 0;
  for (const item of selected) {
    if (dayHrs + item.timeHours > 6 || dayIdx >= DAYS.length) {
      dayIdx++;
      dayHrs = 0;
    }
    if (dayIdx >= DAYS.length) {
      schedule["Next Week"] = [...(schedule["Next Week"] ?? []), item];
    } else {
      const day = DAYS[dayIdx];
      schedule[day] = [...(schedule[day] ?? []), item];
      dayHrs += item.timeHours;
    }
  }

  return {
    sequence: selected,
    deferred,
    totalBenefit: Math.round(result.benefit * 100) / 100,
    totalHours: hrs,
    totalCogLoad: cog,
    utilizationPct: Math.round((hrs / availableHours) * 100),
    schedule,
    label:
      `Simulated annealing: ${iterations} iterations. ` +
      `Benefit scores are heuristic (sev × domain_weight). ` +
      `Source: Kirkpatrick et al. (1983). Labeled: approximate.`,
  };
}
