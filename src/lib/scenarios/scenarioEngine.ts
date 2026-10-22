import { createTwin, stepTwin } from "../twin/twinEngine";
import type { TwinConfig, TwinState } from "../twin/types";
import type { Scenario } from "./types";

export interface ScenarioRunOptions {
  ticks: number;
  /** Extra per-tick parameter deltas representing a strategy under test, applied on top of the scenario's own shocks. */
  strategyDeltas?: Record<string, number>;
}

export interface ScenarioRunResult {
  scenarioId: string;
  trace: TwinState[];
  finalState: TwinState;
}

/**
 * Run a single scenario deterministically: the scenario's own twin config
 * (seed baked in) plus its shocks at their declared ticks, plus optional
 * strategy deltas applied every tick (representing a strategy's ongoing
 * effect, used by the wind tunnel).
 */
export function runScenario(scenario: Scenario, options: ScenarioRunOptions): ScenarioRunResult {
  const config: TwinConfig = scenario.twinConfig;
  const trace: TwinState[] = [createTwin(config)];
  const shocksByTick = new Map<number, Record<string, number>>();
  for (const shock of scenario.shocks) {
    const existing = shocksByTick.get(shock.appliesAtTick) ?? {};
    shocksByTick.set(shock.appliesAtTick, mergeDeltas(existing, shock.parameterDeltas));
  }

  for (let t = 1; t <= options.ticks; t++) {
    const prev = trace[trace.length - 1];
    const shockDeltas = shocksByTick.get(t);
    const combined = mergeDeltas(shockDeltas ?? {}, options.strategyDeltas ?? {});
    const note = shockDeltas ? `scenario shock applied (${scenario.shocks.filter((s) => s.appliesAtTick === t).map((s) => s.label).join(", ")})` : undefined;
    trace.push(stepTwin(prev, config, { deltas: Object.keys(combined).length ? combined : undefined, note }));
  }

  return { scenarioId: scenario.id, trace, finalState: trace[trace.length - 1] };
}

/** Run the same scenario-run function across an ensemble of scenarios — same seeds in, same matrix out. */
export function runEnsemble(scenarios: Scenario[], options: ScenarioRunOptions): ScenarioRunResult[] {
  return scenarios.map((s) => runScenario(s, options));
}

function mergeDeltas(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}
