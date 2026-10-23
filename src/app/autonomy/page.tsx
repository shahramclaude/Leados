import { db } from "@/db";
import { grandGates, cadenceRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { remeasureGatesAction, runDailyPulseAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AutonomyPage() {
  const gates = await db.select().from(grandGates).orderBy(grandGates.part);
  const runs = await db.select().from(cadenceRuns).orderBy(desc(cadenceRuns.startedAt)).limit(10);

  const counts = {
    pass: gates.filter((g) => g.status === "pass").length,
    fail: gates.filter((g) => g.status === "fail").length,
    unknown: gates.filter((g) => g.status === "unknown").length,
    neverRun: gates.filter((g) => g.status === "never-run").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Parts 74 &amp; 75 (program gate)</p>
        <h1 className="text-2xl font-semibold text-white">Autonomy Dashboard &amp; Grand Gate</h1>
        <p className="mt-1 text-sm text-slate-400">
          Orchestration layer over the existing engines — no duplicated logic. Every gate below is re-measured
          against live data when you click &quot;Re-measure&quot;, never copied forward from a prior run. Honesty is
          the point: &quot;never-run&quot; is reported plainly instead of being counted as a pass.
        </p>
      </div>

      <div className="flex gap-3">
        <form action={remeasureGatesAction}>
          <button className="btn btn-primary" type="submit">
            Re-measure all gates now
          </button>
        </form>
        <form action={runDailyPulseAction}>
          <button className="btn btn-secondary" type="submit">
            Run daily pulse cadence loop
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pass</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-400">{counts.pass}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Fail</p>
          <p className="mt-2 text-3xl font-semibold text-rose-400">{counts.fail}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unknown</p>
          <p className="mt-2 text-3xl font-semibold text-amber-400">{counts.unknown}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Never run</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">{counts.neverRun}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Grand gate matrix</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Part</th>
              <th>Gate</th>
              <th>Accept</th>
              <th>Status</th>
              <th>Measured value</th>
              <th>Last measured</th>
            </tr>
          </thead>
          <tbody>
            {gates.map((g) => (
              <tr key={g.id}>
                <td>{g.part}</td>
                <td>{g.statement}</td>
                <td>{g.accept}</td>
                <td>
                  <span
                    className={`badge ${
                      g.status === "pass"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : g.status === "fail"
                          ? "bg-rose-500/20 text-rose-300"
                          : g.status === "unknown"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {g.status}
                  </span>
                </td>
                <td className="text-xs text-slate-400">{g.measuredValue ?? "—"}</td>
                <td className="text-xs text-slate-500">{g.measuredAt ? new Date(g.measuredAt).toLocaleString() : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Cadence loop runs</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Loop</th>
              <th>Cadence</th>
              <th>Verdict</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.loopId}</td>
                <td>{r.cadence}</td>
                <td>
                  <span
                    className={`badge ${
                      r.verdict === "complete" ? "bg-emerald-500/20 text-emerald-300" : r.verdict === "degraded" ? "bg-amber-500/20 text-amber-300" : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {r.verdict}
                  </span>
                </td>
                <td>{new Date(r.startedAt!).toLocaleString()}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={4} className="text-slate-500">
                  No cadence runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Honest state — what this build does NOT do</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-400">
          <li>No PC-algorithm / Granger causal discovery — a transparent lagged-correlation + bootstrap-stability screen stands in, clearly labeled as a simplification.</li>
          <li>No bitemporal query DSL (Part 63) — history is append-only for observations and audit events, but a full valid-time/transaction-time query language was not built in this pass.</li>
          <li>No design-token compiler / axe-core CI gate (Part 65) — the UI follows a consistent dark design system but was not run through an automated accessibility audit in this session.</li>
          <li>No i18n/domain-pack registry (Part 68), self-healing data pipelines (Part 69), comms-automation voice profiler (Part 70), survival-analysis LTV (Part 71), or org-design simulator (Part 72) — out of scope for this session&apos;s budget.</li>
          <li>Portfolio optimizer is greedy + bounded local search, not a certified ILP solver — the optimality gap is not computed.</li>
          <li>Beta-distribution sampling for the bandit uses a normal approximation, not exact Marsaglia–Tsang gamma sampling.</li>
        </ul>
      </div>
    </div>
  );
}
