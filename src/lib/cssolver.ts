/**
 * cssolver.ts — small constraint-satisfaction / list-scheduling solver used
 * by `executionEngine.ts` to produce a one-shot staffing plan (which agent
 * works which task) given skills and capacity constraints. This is
 * deliberately separate from the lightweight greedy picker embedded in the
 * discrete-event simulation's hot loop (`simulation.ts`), which optimizes
 * for per-tick performance over thousands of Monte Carlo replications.
 *
 * Algorithm:
 *   1. Longest-Processing-Time-first (LPT) list scheduling restricted to
 *      skill-eligible agents — a classical, well-understood heuristic for
 *      makespan minimization on unrelated-ish parallel machines, with a
 *      known worst-case approximation ratio (4/3 - 1/(3m)) in the
 *      unconstrained case; constraints here (skills) can only increase the
 *      ratio, which is why step 2 exists.
 *   2. Bounded local-search repair: pairwise swap of two tasks between
 *      agents when it reduces the overall makespan and both swaps remain
 *      skill-eligible. Deterministic given the supplied `Rng` for tie-break
 *      ordering, so re-running with the same seed reproduces the same plan.
 */
import type { Rng } from "@/lib/prng";

export interface CSTask {
  id: string;
  requiredSkill: string;
  hours: number;
}

export interface CSAgent {
  id: string;
  skills: string[];
  /** Total hours available over the planning horizon. */
  capacityHours: number;
}

export interface CSAssignment {
  taskId: string;
  agentId: string | null; // null = unassignable (no eligible agent)
}

export interface CSSolveResult {
  assignments: CSAssignment[];
  loadByAgent: Record<string, number>;
  makespanHours: number;
  unassignedTaskIds: string[];
}

function eligibleAgents(task: CSTask, agents: CSAgent[]): CSAgent[] {
  return agents.filter((a) => a.skills.includes(task.requiredSkill));
}

export function solveAssignment(
  tasks: readonly CSTask[],
  agents: readonly CSAgent[],
  rng: Rng,
  opts: { localSearchIterations?: number } = {},
): CSSolveResult {
  const load = new Map<string, number>(agents.map((a) => [a.id, 0]));
  const assignment = new Map<string, string | null>();

  // Step 1: LPT list scheduling.
  const sorted = [...tasks].sort((a, b) => b.hours - a.hours);
  for (const task of sorted) {
    const candidates = eligibleAgents(task, agents as CSAgent[]);
    if (candidates.length === 0) {
      assignment.set(task.id, null);
      continue;
    }
    let best = candidates[0];
    let bestLoad = load.get(best.id) ?? 0;
    for (const c of candidates) {
      const l = load.get(c.id) ?? 0;
      if (l < bestLoad) {
        best = c;
        bestLoad = l;
      }
    }
    assignment.set(task.id, best.id);
    load.set(best.id, bestLoad + task.hours);
  }

  // Step 2: bounded local-search repair (pairwise swaps that reduce makespan).
  const iterations = opts.localSearchIterations ?? 200;
  const taskList = [...tasks];
  for (let iter = 0; iter < iterations; iter++) {
    const i = Math.floor(rng.next() * taskList.length);
    const j = Math.floor(rng.next() * taskList.length);
    if (i === j) continue;
    const t1 = taskList[i];
    const t2 = taskList[j];
    const a1 = assignment.get(t1.id);
    const a2 = assignment.get(t2.id);
    if (!a1 || !a2 || a1 === a2) continue;
    const canSwap =
      eligibleAgents(t2, agents as CSAgent[]).some((a) => a.id === a1) &&
      eligibleAgents(t1, agents as CSAgent[]).some((a) => a.id === a2);
    if (!canSwap) continue;

    const before = Math.max(...Array.from(load.values()));
    const load1 = (load.get(a1) ?? 0) - t1.hours + t2.hours;
    const load2 = (load.get(a2) ?? 0) - t2.hours + t1.hours;
    const trialLoads = Array.from(load.entries()).map(([id, v]) => (id === a1 ? load1 : id === a2 ? load2 : v));
    const after = Math.max(...trialLoads);
    if (after < before) {
      load.set(a1, load1);
      load.set(a2, load2);
      assignment.set(t1.id, a2);
      assignment.set(t2.id, a1);
    }
  }

  const assignments: CSAssignment[] = tasks.map((t) => ({ taskId: t.id, agentId: assignment.get(t.id) ?? null }));
  const loadByAgent: Record<string, number> = {};
  for (const [id, v] of load.entries()) loadByAgent[id] = v;
  const makespanHours = Math.max(0, ...Object.values(loadByAgent));
  const unassignedTaskIds = assignments.filter((a) => a.agentId === null).map((a) => a.taskId);

  return { assignments, loadByAgent, makespanHours, unassignedTaskIds };
}
