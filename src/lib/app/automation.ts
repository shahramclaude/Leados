import type { AutomationRun, Page } from "@/lib/domain/types";
import { runMonteCarloForecast } from "@/lib/domain/monteCarlo";
import { insertRun, listRunsPage } from "@/lib/platform/db/runsRepository";
import { recordEvent } from "./events";
import { ValidationError } from "./findings";

export interface RunAutomationInput {
  kind: "monte_carlo_forecast";
  base: number;
  volatility: number;
  trials: number;
  seed: number;
}

export async function runAutomation(input: RunAutomationInput): Promise<AutomationRun> {
  if (input.kind !== "monte_carlo_forecast") {
    throw new ValidationError(`Unsupported automation kind: ${input.kind}`);
  }
  if (!Number.isFinite(input.base) || input.base < 0) {
    throw new ValidationError("base must be a non-negative number");
  }
  if (!Number.isFinite(input.volatility) || input.volatility < 0) {
    throw new ValidationError("volatility must be a non-negative number");
  }
  if (!Number.isInteger(input.trials) || input.trials < 1 || input.trials > 50_000) {
    throw new ValidationError("trials must be an integer between 1 and 50000");
  }
  if (!Number.isInteger(input.seed)) {
    throw new ValidationError("seed must be an integer");
  }

  const result = runMonteCarloForecast({
    base: input.base,
    volatility: input.volatility,
    trials: input.trials,
    seed: input.seed,
  });

  // Don't persist the full sample array — summary stats only.
  const { samples: _samples, ...summary } = result;
  void _samples;

  const run = await insertRun({
    kind: input.kind,
    seed: input.seed,
    trials: input.trials,
    input: { base: input.base, volatility: input.volatility },
    result: summary,
  });

  await recordEvent({
    type: "automation.run_completed",
    version: 1,
    payload: { runId: run.id, kind: run.kind },
  });

  return run;
}

export async function listRuns(searchParams: URLSearchParams): Promise<Page<AutomationRun>> {
  return listRunsPage(searchParams);
}
