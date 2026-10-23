import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { metricObservations, metrics } from "@/db/schema";
import { getCalibrationReport } from "@/lib/worldModel";
import { Badge, Card } from "@/components/ui";
import { MetricForm } from "./MetricForm";

export const dynamic = "force-dynamic";

export default async function WorldModelPage() {
  const allMetrics = await db.select().from(metrics).orderBy(asc(metrics.createdAt));
  const allObservations = await db.select().from(metricObservations);

  const countByMetric = new Map<string, number>();
  for (const obs of allObservations) {
    countByMetric.set(obs.metricId, (countByMetric.get(obs.metricId) ?? 0) + 1);
  }

  const calibration = await getCalibrationReport();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.08em] text-slate-500">Part 59</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">World Model &amp; Scenario Simulation</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Each metric gets a fitted linear-dynamic model (OLS trend + residual noise). Run a seeded Monte Carlo
          simulation to project it forward, with or without an intervention, and backtest past forecasts against what
          actually happened to measure calibration honestly.
        </p>
      </header>

      <Card className="mb-8">
        <h2 className="text-base font-semibold text-slate-900">Calibration gate (80% interval, P10–P90)</h2>
        {calibration.totalBacktests === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            <Badge tone="amber">unknown</Badge> No backtests have been run yet. Run one from a metric&apos;s page once it
            has enough history, or run <code className="rounded bg-slate-100 px-1">npx tsx scripts/evalWorldModel.ts</code> for
            the synthetic-data version of this gate.
          </p>
        ) : (
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            <p>
              <Badge tone={calibration.pass === true ? "green" : "red"}>{calibration.pass === true ? "PASS" : "FAIL"}</Badge>{" "}
              {calibration.withinIntervalCount}/{calibration.totalBacktests} backtests fell inside their forecast
              interval ={" "}
              <strong>{((calibration.coverageRate ?? 0) * 100).toFixed(1)}%</strong> coverage (accept band{" "}
              {calibration.acceptLow * 100}%–{calibration.acceptHigh * 100}%).
            </p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {calibration.perMetric.map((m) => (
                <li key={m.metricId} className="text-xs text-slate-500">
                  {m.metricKey}: {m.within}/{m.total} ({(m.coverageRate * 100).toFixed(1)}%)
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Add a metric</h2>
        <MetricForm />
        <p className="mt-3 text-xs text-slate-500">
          No demo data yet? Run <code className="rounded bg-slate-100 px-1">npx tsx scripts/seedWorldModel.ts</code> to
          seed three synthetic metrics with 24 months of history.
        </p>
      </Card>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Metrics</h2>
        {allMetrics.length === 0 ? (
          <p className="text-sm text-slate-600">No metrics yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {allMetrics.map((m) => (
              <Link key={m.id} href={`/world-model/${m.id}`} className="block">
                <Card className="transition hover:shadow-[0_18px_40px_rgba(16,24,40,0.14)]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{m.name}</h3>
                    <Badge>{countByMetric.get(m.id) ?? 0} obs</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.key}
                    {m.unit ? ` · ${m.unit}` : ""}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
