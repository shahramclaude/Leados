import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  betaMean,
  betaUpdate,
  createBetaPrior,
  createHysteresisConfig,
  hysteresisTrace,
  runMonteCarlo,
} from "@/lib/domain";

export type SelfTestCheck = {
  name: string;
  pass: boolean;
  detail?: string;
};

export type SelfTestReport = {
  generatedAt: string;
  pass: boolean;
  checks: SelfTestCheck[];
  note: string;
};

/**
 * Executes a tiny smoke subset of the real domain/db assertions — the same
 * invariants exercised by the Vitest suites, not a bespoke parallel
 * assertion zoo. This is intentionally NOT a replacement for `npm test`;
 * it is a production-safe runtime probe surfaced on /about, and the API
 * response links back to the CI workflow as the source of full test truth.
 */
export async function runSelfTest(): Promise<SelfTestReport> {
  const checks: SelfTestCheck[] = [];

  // 1. Database connectivity (same probe as /api/health).
  try {
    await getDb().execute(sql`select 1`);
    checks.push({ name: "database connectivity", pass: true });
  } catch (error) {
    checks.push({
      name: "database connectivity",
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. Beta updating invariant: a success strictly increases the posterior mean.
  const prior = createBetaPrior(1, 1);
  const updated = betaUpdate(prior, 1);
  checks.push({
    name: "beta posterior mean increases after a success",
    pass: betaMean(updated) > betaMean(prior),
  });

  // 3. Hysteresis invariant: dead-band scores never oscillate.
  const config = createHysteresisConfig(0.6, 0.4);
  const trace = hysteresisTrace(config, "cold", [0.5, 0.52, 0.48, 0.5]);
  checks.push({
    name: "hysteresis dead band does not oscillate",
    pass: new Set(trace).size === 1,
  });

  // 4. Monte Carlo reproducibility: same seed -> identical result.
  const a = runMonteCarlo({ mean: 0, stdDev: 1 }, 200, 7);
  const b = runMonteCarlo({ mean: 0, stdDev: 1 }, 200, 7);
  checks.push({
    name: "monte carlo is reproducible for a fixed seed",
    pass: JSON.stringify(a) === JSON.stringify(b),
  });

  return {
    generatedAt: new Date().toISOString(),
    pass: checks.every((c) => c.pass),
    checks,
    note:
      "This is a runtime smoke subset only. The source of test truth is `npm test` / `npm run verify` and the CI workflow in .github/workflows/ci.yml.",
  };
}
