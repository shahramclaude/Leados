import { db } from "@/db";
import { metricBaselines, metricObservations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fullBootstrap } from "@/lib/assurance/sync";
import { AssuranceNav } from "@/app/assurance/_components/AssuranceNav";
import { TrendChart } from "@/app/assurance/_components/TrendChart";
import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { detectDrift } from "@/lib/drift";

export const dynamic = "force-dynamic";

async function getAllMetricKeys() {
  const keys = new Set<string>();
  for (const c of CHECK_REGISTRY) {
    for (const k of c.metricKeys) keys.add(k);
  }
  return Array.from(keys);
}

async function getMetricTrend(metricKey: string) {
  const observations = await db
    .select()
    .from(metricObservations)
    .where(eq(metricObservations.metricKey, metricKey))
    .orderBy(metricObservations.observedAt)
    .limit(60);
  const [baselineRow] = await db
    .select()
    .from(metricBaselines)
    .where(eq(metricBaselines.metricKey, metricKey))
    .limit(1);
  const baseline = baselineRow?.baselineValue ?? 0;
  const values = observations.map((o) => o.value);
  const drift = values.length > 0 ? detectDrift(values, baseline) : null;
  return { observations, baseline, drift };
}

export default async function DriftTrendsPage() {
  await fullBootstrap();
  const metricKeys = await getAllMetricKeys();
  const trends = await Promise.all(metricKeys.map(async (key) => ({ key, ...(await getMetricTrend(key)) })));

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 38</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Drift Trends</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Every monitored metric plotted against its declared baseline (dashed line) and EWMA control band
          (shaded). CUSUM status is shown below each chart. Sensitivity parameters are documented in{" "}
          <code className="rounded bg-slate-200 px-1">src/lib/drift.ts</code>.
        </p>
        <AssuranceNav active="/assurance/drift" />

        <div className="grid gap-6 md:grid-cols-2">
          {trends.map((t) => (
            <div key={t.key} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-sm font-semibold text-slate-900">{t.key}</h3>
                {t.drift && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      t.drift.flagged ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {t.drift.flagged ? "drift flagged" : "no drift"}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <TrendChart
                  points={t.observations.map((o) => ({ value: o.value, observedAt: o.observedAt.toString() }))}
                  baseline={t.baseline}
                  ucl={t.drift?.ewma.points[0]?.ucl}
                  lcl={t.drift?.ewma.points[0]?.lcl}
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>
                  <dt className="font-medium text-slate-500">Baseline</dt>
                  <dd>{t.baseline.toFixed(4)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">CUSUM+</dt>
                  <dd>{t.drift ? t.drift.latestCusumPos.toFixed(4) : "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">CUSUM-</dt>
                  <dd>{t.drift ? t.drift.latestCusumNeg.toFixed(4) : "—"}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
