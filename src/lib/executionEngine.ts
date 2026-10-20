/**
 * executionEngine.ts — Part 06 execution/forecasting glue: combines the
 * Critical Path Method (`criticalPath.ts`) deterministic baseline schedule,
 * the constraint-satisfaction staffing plan (`cssolver.ts`), and the
 * discrete-event Monte Carlo engine (`simulation.ts` + `monteCarlo.ts`) to
 * answer "given this backlog, these dependencies, and this team, what's
 * our plan AND how uncertain is it?"
 *
 * Pipeline:
 *   1. CPM on task durations (point estimates) -> deterministic baseline
 *      duration + critical path + slack per task.
 *   2. cssolver assigns agents to tasks (skills + capacity balancing).
 *   3. The same task set is handed to the discrete-event Monte Carlo model
 *      to produce a *distributional* forecast (p10/p50/p90 completion),
 *      which is what should actually be trusted for planning — the CPM
 *      number is a useful deterministic anchor, not a promise.
 */
import { computeCriticalPath, type CPMResult, type CPMTask } from "@/lib/criticalPath";
import { solveAssignment, type CSAgent, type CSSolveResult, type CSTask } from "@/lib/cssolver";
import { runDiscreteEventSimulation, type SimConfig } from "@/lib/simulation";
import { createRng } from "@/lib/prng";
import { quantile } from "@/lib/stats";

export interface ExecutionPlanInput {
  tasks: Array<{ id: string; requiredSkill: string; estimatedHours: number; dependsOn: string[] }>;
  agents: Array<{ id: string; skills: string[]; weeklyCapacityHours: number }>;
  hoursPerDay?: number;
}

export interface ExecutionPlanResult {
  cpm: CPMResult;
  staffing: CSSolveResult;
  deterministicDurationDays: number;
  distributionalForecast: { p10Days: number; p50Days: number; p90Days: number; replications: number };
  caveat: string;
}

export function buildExecutionPlan(input: ExecutionPlanInput, simConfig: SimConfig, opts: { replications?: number; seedRoot?: string } = {}): ExecutionPlanResult {
  const hoursPerDay = input.hoursPerDay ?? 6;
  const cpmTasks: CPMTask[] = input.tasks.map((t) => ({ id: t.id, durationDays: t.estimatedHours / hoursPerDay, dependsOn: t.dependsOn }));
  const cpm = computeCriticalPath(cpmTasks);

  const csTasks: CSTask[] = input.tasks.map((t) => ({ id: t.id, requiredSkill: t.requiredSkill, hours: t.estimatedHours }));
  const csAgents: CSAgent[] = input.agents.map((a) => ({ id: a.id, skills: a.skills, capacityHours: a.weeklyCapacityHours * (cpm.projectDurationDays / 5) }));
  const staffingRng = createRng(opts.seedRoot ?? "execution-plan-staffing");
  const staffing = solveAssignment(csTasks, csAgents, staffingRng);

  const replications = opts.replications ?? 200;
  const seedRoot = opts.seedRoot ?? "execution-plan-forecast";
  const completionDays: number[] = [];
  for (let i = 0; i < replications; i++) {
    const rng = createRng(seedRoot).substream(`rep#${i}`);
    const result = runDiscreteEventSimulation(simConfig, rng);
    const lastDone = result.dailySnapshots.filter((d) => d.doneCount > 0).map((d) => d.day);
    const allDone = result.unfinishedCount === 0;
    const completion = allDone && lastDone.length > 0 ? Math.max(...lastDone) + 1 : simConfig.horizonDays;
    completionDays.push(completion);
  }

  return {
    cpm,
    staffing,
    deterministicDurationDays: cpm.projectDurationDays,
    distributionalForecast: {
      p10Days: quantile(completionDays, 0.1),
      p50Days: quantile(completionDays, 0.5),
      p90Days: quantile(completionDays, 0.9),
      replications,
    },
    caveat:
      "The CPM duration is a deterministic point estimate assuming perfect staffing and no queueing/coordination overhead. " +
      "The distributional forecast (p10/p50/p90) comes from the stochastic discrete-event model and includes WIP limits, " +
      "Brooks's-law overhead, handoff latency and onboarding ramp — treat the distributional numbers as the operative forecast.",
  };
}
