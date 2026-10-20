// Backs the /about page. This intentionally does NOT duplicate assertions
// from the real test suites — it imports the same pure domain functions the
// unit tests exercise and runs a tiny, fast smoke subset of them, plus a
// live DB round-trip. The authoritative correctness signal is the CI run of
// `npm test` / `npm run test:e2e` / `npm run test:mutation`; this route (and
// the /about page that renders it) link out to that, per Part 11's
// "no bespoke assertion zoo" requirement.
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { createRng } from "@/lib/domain/prng";
import { runMonteCarloForecast } from "@/lib/domain/monteCarlo";
import { updateBeta, betaMean } from "@/lib/domain/bayesian";
import { simulateOrgDynamics } from "@/lib/domain/orgODE";
import { scoreFinding } from "@/lib/domain/scoring";
import { validateEventPayload } from "@/lib/domain/eventSchema";

export const dynamic = "force-dynamic";

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

function check(name: string, fn: () => void): Check {
  try {
    fn();
    return { name, pass: true, detail: "ok" };
  } catch (error) {
    return { name, pass: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function GET() {
  const checks: Check[] = [];

  checks.push(
    check("prng is deterministic for a fixed seed", () => {
      const a = createRng(42);
      const b = createRng(42);
      if (a() !== b()) throw new Error("same seed produced different first values");
    }),
  );

  checks.push(
    check("monte carlo forecast percentiles are ordered", () => {
      const result = runMonteCarloForecast({ base: 100, volatility: 0.2, trials: 500, seed: 7 });
      if (!(result.min <= result.p10 && result.p10 <= result.p50 && result.p50 <= result.p90 && result.p90 <= result.max)) {
        throw new Error("percentiles out of order");
      }
    }),
  );

  checks.push(
    check("bayesian update moves belief toward evidence", () => {
      const prior = { alpha: 1, beta: 1 };
      const posterior = updateBeta(prior, { successes: 8, failures: 2 });
      if (!(betaMean(posterior) > betaMean(prior))) throw new Error("belief did not move toward success evidence");
    }),
  );

  checks.push(
    check("org ODE simulation stays finite", () => {
      const trajectory = simulateOrgDynamics(
        { morale: 0.5, velocity: 0.5 },
        { a: 0.3, b: 0.1, c: 0.2, d: 0.2, targetMorale: 0.8 },
        50,
        0.1,
      );
      if (trajectory.some((s) => !Number.isFinite(s.morale) || !Number.isFinite(s.velocity))) {
        throw new Error("non-finite state encountered");
      }
    }),
  );

  checks.push(
    check("finding scoring rewards high impact/confidence, low effort", () => {
      const high = scoreFinding({ impact: 10, confidence: 10, effort: 1 });
      const low = scoreFinding({ impact: 1, confidence: 1, effort: 10 });
      if (!(high > low)) throw new Error("scoring did not rank high-value finding above low-value one");
    }),
  );

  checks.push(
    check("event schema rejects unknown event types", () => {
      let threw = false;
      try {
        validateEventPayload("not.a.real.type", 1, {});
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected unknown event type to be rejected");
    }),
  );

  let dbPass = true;
  let dbDetail = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    dbPass = false;
    dbDetail = error instanceof Error ? error.message : String(error);
  }
  checks.push({ name: "database is reachable", pass: dbPass, detail: dbDetail });

  const ok = checks.every((c) => c.pass);
  return Response.json({ ok, checks }, { status: ok ? 200 : 500 });
}
