import { seedIfEmpty } from "@/db/seed";
import { computeIntelligence } from "@/lib/intelligence";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEV_STYLES: Record<Severity, string> = {
  5: "bg-red-100 text-red-800 border-red-300",
  4: "bg-orange-100 text-orange-800 border-orange-300",
  3: "bg-amber-100 text-amber-800 border-amber-300",
  2: "bg-slate-100 text-slate-700 border-slate-300",
  1: "bg-slate-100 text-slate-600 border-slate-200",
};

const TREND_ICON: Record<string, string> = { up: "▲", down: "▼", flat: "▬" };

export default async function HomePage() {
  await seedIfEmpty();
  const report = await computeIntelligence();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">LeadOS</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Probabilistic Intelligence Report</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString()} — Bayesian belief network, multi-signal
            fusion, causal chain detection, and predictive scoring, fused into one report.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-1">
            <p className="text-sm text-slate-500">Organizational Health</p>
            <p className="mt-2 text-4xl font-semibold text-slate-950">{report.healthScore.composite}</p>
            <p className="mt-1 text-sm text-slate-500">
              {TREND_ICON[report.healthScore.trend]} {report.healthScore.trend} · confidence{" "}
              {Math.round(report.healthScore.confidence * 100)}%
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-2">
            <p className="text-sm text-slate-500">Domain breakdown</p>
            <div className="mt-3 space-y-2">
              {Object.entries(report.healthScore.breakdown).map(([domain, value]) => (
                <div key={domain} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs capitalize text-slate-600">{domain}</span>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-slate-800"
                      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs text-slate-600">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-slate-500">Critical</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">{report.counts.critical}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-slate-500">Major</p>
            <p className="mt-1 text-2xl font-semibold text-orange-700">{report.counts.major}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-slate-500">Minor</p>
            <p className="mt-1 text-2xl font-semibold text-slate-700">{report.counts.minor}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Findings ({report.counts.findings})</h2>
          <div className="mt-4 space-y-3">
            {report.findings.length === 0 && <p className="text-sm text-slate-500">No findings — all clear.</p>}
            {report.findings.map((f) => (
              <div key={f.key} className={`rounded-xl border p-3 ${SEV_STYLES[f.sev]}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{f.title}</p>
                  <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold">
                    sev {f.sev}
                  </span>
                </div>
                <p className="mt-1 text-sm opacity-90">{f.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Causal chains</h2>
          <div className="mt-4 space-y-2">
            {report.causalChains.map((c) => (
              <div key={c.path.join(">")} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                <span className="font-medium text-slate-800">{c.path.join(" → ")}</span>
                <span className="text-slate-500">
                  {c.occurrences}× · avg lag {c.avgLagDays}d · confidence {Math.round(c.confidence * 100)}% · next:{" "}
                  {c.nextLikely}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Flight risk</h2>
            <div className="mt-4 space-y-2">
              {report.predictions.flightRisk
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((fr) => (
                  <div key={fr.personId} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">Person #{fr.personId}</span>
                      <span className="text-slate-500">
                        {Math.round(fr.score * 100)}% · {fr.horizon}
                      </span>
                    </div>
                    {fr.drivers.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">{fr.drivers.join(", ")}</p>
                    )}
                  </div>
                ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Burnout index</h2>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {Math.round(report.predictions.burnoutIndex.value * 100)}%
              </p>
              <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                {report.predictions.burnoutIndex.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">Decision health</h2>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-semibold text-slate-950">{report.predictions.decisionHealth.stale}</p>
                  <p className="text-xs text-slate-500">stale</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-950">
                    {report.predictions.decisionHealth.blockedCount}
                  </p>
                  <p className="text-xs text-slate-500">blocked</p>
                </div>
                <div>
                  <p className="text-sm font-semibold capitalize text-slate-950">
                    {report.predictions.decisionHealth.velocityTrend}
                  </p>
                  <p className="text-xs text-slate-500">velocity</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
