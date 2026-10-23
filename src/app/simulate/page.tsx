import { db } from "@/db";
import { metrics, simulationRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getObservations, getBacktestSummary } from "@/lib/worldModel";
import { FanChart } from "@/components/FanChart";
import { runSimulationAction, runBacktestAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SimulatePage({ searchParams }: { searchParams: Promise<{ metricId?: string }> }) {
  const allMetrics = await db.select().from(metrics);
  const sp = await searchParams;
  const activeMetricId = sp.metricId ?? allMetrics[0]?.id;
  const activeMetric = allMetrics.find((m) => m.id === activeMetricId);

  const observations = activeMetricId ? await getObservations(activeMetricId) : [];
  const latestRun = activeMetricId
    ? (await db.select().from(simulationRuns).where(eq(simulationRuns.metricId, activeMetricId)).orderBy(desc(simulationRuns.createdAt)).limit(1))[0]
    : undefined;
  const recentRuns = activeMetricId
    ? await db.select().from(simulationRuns).where(eq(simulationRuns.metricId, activeMetricId)).orderBy(desc(simulationRuns.createdAt)).limit(5)
    : [];
  const backtest = activeMetricId ? await getBacktestSummary(activeMetricId) : null;

  const historyLabels = observations.map((o) => o.period);
  const historyValues = observations.map((o) => o.value);
  const horizon = latestRun ? (latestRun.p50 as number[]).length : 0;
  const futureLabels = Array.from({ length: horizon }, (_, i) => `+${i + 1}`);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 59</p>
        <h1 className="text-2xl font-semibold text-white">Organizational World Model &amp; Simulation</h1>
        <p className="mt-1 text-sm text-slate-400">
          Linear-dynamic transition model fit on trailing history, forward Monte Carlo with explicit do()
          intervention surgery, and rolling backtests that measure real 80% interval coverage.
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2">
          {allMetrics.map((m) => (
            <a
              key={m.id}
              href={`/simulate?metricId=${m.id}`}
              className={`btn ${m.id === activeMetricId ? "btn-primary" : "btn-secondary"}`}
            >
              {m.label}
            </a>
          ))}
        </div>
      </div>

      {activeMetric && (
        <>
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">
                {activeMetric.label} <span className="text-slate-500">({activeMetric.unit})</span>
              </h2>
              {backtest && (
                <span
                  className={`badge ${
                    backtest.coverageRate >= 0.72 && backtest.coverageRate <= 0.88
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  80% interval coverage: {isNaN(backtest.coverageRate) ? "n/a" : `${(backtest.coverageRate * 100).toFixed(0)}%`} (
                  {backtest.covered}/{backtest.evaluated} periods) — gate 72–88%
                </span>
              )}
            </div>
            {latestRun ? (
              <div className="mt-4">
                <FanChart
                  historyLabels={historyLabels}
                  historyValues={historyValues}
                  futureLabels={futureLabels}
                  p10={latestRun.p10 as number[]}
                  p50={latestRun.p50 as number[]}
                  p90={latestRun.p90 as number[]}
                  unit={activeMetric.unit}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Model confidence strip — fitted slope {(latestRun.diagnostics as { fittedSlope: number }).fittedSlope.toFixed(2)}
                  /period, residual σ {(latestRun.diagnostics as { residualStd: number }).residualStd.toFixed(2)}, trained on{" "}
                  {(latestRun.diagnostics as { trainPoints: number }).trainPoints} periods. Assumptions:{" "}
                  {(latestRun.assumptions as string[]).join(" · ")}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No simulation run yet for this metric — run one below.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <form action={runSimulationAction} className="card space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">What-if canvas</h3>
              <input type="hidden" name="metricId" value={activeMetricId} />
              <label className="block text-xs text-slate-400">
                Scenario label
                <input name="label" defaultValue="baseline" className="mt-1 w-full" />
              </label>
              <label className="block text-xs text-slate-400">
                Horizon (periods)
                <input type="number" name="horizonPeriods" defaultValue={6} min={1} max={24} className="mt-1 w-full" />
              </label>
              <label className="block text-xs text-slate-400">
                Intervention: do(per-period change := Δ) — 0 means baseline forecast
                <input type="number" step="0.01" name="interventionDelta" defaultValue={0} className="mt-1 w-full" />
              </label>
              <label className="block text-xs text-slate-400">
                Monte Carlo paths (n)
                <input type="number" name="n" defaultValue={2000} min={200} max={20000} className="mt-1 w-full" />
              </label>
              <button className="btn btn-primary" type="submit">
                Run simulation
              </button>
            </form>

            <form action={runBacktestAction} className="card space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Rolling backtest (falsifiability)</h3>
              <input type="hidden" name="metricId" value={activeMetricId} />
              <p className="text-xs text-slate-500">
                Re-fits the model walk-forward on train-only history and checks whether the realized value actually
                fell inside the forecasted 80% interval — the honest calibration check, not a vibe.
              </p>
              <button className="btn btn-secondary" type="submit">
                Run rolling backtest
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-slate-200">Recent simulation runs</h3>
            <table className="mt-3">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Horizon</th>
                  <th>n</th>
                  <th>Intervention Δ</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.horizonPeriods}</td>
                    <td>{r.n}</td>
                    <td>{r.interventionDelta}</td>
                    <td>{new Date(r.createdAt!).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
