import Link from "next/link";
import { buildDashboardData } from "@/lib/esgSurfaces";
import { EvidenceBadge } from "@/components/esg/EvidenceBadge";
import { EVIDENCE_LABEL } from "@/lib/evidence";

export const dynamic = "force-dynamic";

function fmt(n: number, digits = 1) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default async function EsgDashboardPage() {
  const data = await buildDashboardData();
  const scope = data.scopeTotalsByPeriod[data.currentPeriod];
  const prevPeriod = data.periods[data.periods.length - 2];
  const prevScope = prevPeriod ? data.scopeTotalsByPeriod[prevPeriod] : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">LEADOS · Sustainability Intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">ESG Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Period: {data.currentPeriod} · three pillars, trend, target trajectory, data-quality chips per figure.</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="rounded-full border border-slate-300 px-4 py-2 hover:bg-slate-50" href="/esg/carbon-ledger">
            Carbon Ledger
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 hover:bg-slate-50" href="/esg/disclosure-studio">
            Disclosure Studio
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 hover:bg-slate-50" href="/esg/reduction-portfolio">
            Reduction Portfolio
          </Link>
        </nav>
      </header>

      {data.lintViolations.length > 0 && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Evidence-class lint found {data.lintViolations.length} violation(s) — figures were withheld from this dashboard rather than shown
          without provenance: {data.lintViolations.map((v) => `${v.key} (${v.reason})`).join("; ")}
        </div>
      )}

      {/* Pillar: Environmental */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">🌎 Environmental</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PillarFigure label="Scope 1 (direct)" explain={scope.scope1} unit="tCO2e" />
          <PillarFigure label="Scope 2 — location-based" explain={scope.scope2Location} unit="tCO2e" />
          <PillarFigure label="Scope 2 — market-based" explain={scope.scope2Market} unit="tCO2e" />
          <PillarFigure label="Scope 3 (value chain)" explain={scope.scope3} unit="tCO2e" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PillarFigure label="Total (location-based)" explain={scope.grandTotalLocationBased} unit="tCO2e" highlight />
          <PillarFigure label="Total (market-based)" explain={scope.grandTotalMarketBased} unit="tCO2e" highlight />
          <SimpleStat label="Energy consumption" value={data.environmental.energy} unit="kWh" evidenceClass="metered-measured" />
          <SimpleStat label="Waste generated" value={data.environmental.waste} unit="kg" evidenceClass="activity-based-estimate" />
        </div>
        {prevScope && (
          <p className="mt-3 text-xs text-slate-500">
            Trend vs {prevPeriod}: total (location-based) {prevScope.grandTotalLocationBased.value > 0 ? (
              <>
                {fmt(scope.grandTotalLocationBased.value - prevScope.grandTotalLocationBased.value)} tCO2e (
                {(((scope.grandTotalLocationBased.value - prevScope.grandTotalLocationBased.value) / prevScope.grandTotalLocationBased.value) * 100).toFixed(1)}%)
              </>
            ) : (
              "n/a"
            )}
          </p>
        )}
      </section>

      {/* Pillar: Social */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">🧑‍🤝‍🧑 Social (aggregate-only)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.social.map((s) => (
            <div key={`${s.metric}-${s.cohort}`} className={`rounded-2xl border p-5 ${s.suppressed ? "border-dashed border-slate-300 bg-slate-50" : "border-slate-200 bg-white shadow-sm"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {s.metric.replace(/_/g, " ")} · {s.cohort}
              </p>
              {s.suppressed ? (
                <>
                  <p className="mt-2 text-lg font-semibold text-slate-400">Suppressed</p>
                  <p className="mt-2 text-[11px] text-slate-500">{s.reason}</p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{fmt(s.explain!.value, 2)}</p>
                  <div className="mt-3">
                    <EvidenceBadge explain={s.explain!} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pillar: Governance */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">🏛️ Governance</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PillarFigure label="Decision quality score" explain={data.governance.decisionQualityScore} unit="(share of decisions)" />
          <PillarFigure label="Board oversight cadence" explain={data.governance.oversightCadenceDays} unit="days (median)" />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Internal governance KPI derived from the decision log — not a third-party-assured figure. See evidence badge for method.
        </p>
      </section>

      {/* Targets & trajectory */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">🎯 Targets &amp; trajectory</h2>
        <div className="space-y-4">
          {data.targets.map((t) => {
            const latestVariance = t.variance[t.variance.length - 1];
            return (
              <div key={t.target.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{t.target.name}</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {t.target.pathway} pathway · {t.target.baselineYear}→{t.target.targetYear}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">OKR ref: {t.target.okrRef ?? "none"}</p>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Baseline" value={`${fmt(t.target.baselineValueTco2e)} tCO2e`} />
                  <Stat label="Target" value={`${fmt(t.target.targetValueTco2e)} tCO2e`} />
                  {latestVariance ? (
                    <>
                      <Stat label={`Expected (${latestVariance.year})`} value={`${fmt(latestVariance.expectedTco2e)} tCO2e`} />
                      <Stat
                        label={`Variance (${latestVariance.year})`}
                        value={`${latestVariance.varianceTco2e >= 0 ? "+" : ""}${fmt(latestVariance.varianceTco2e)} tCO2e`}
                        tone={latestVariance.onTrack ? "good" : "bad"}
                      />
                    </>
                  ) : (
                    <Stat label="Variance" value="no actuals in range" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Obligations */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">📋 Disclosure obligations</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Obligation</th>
                <th className="px-4 py-2">Standard</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.obligations.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{o.name}</td>
                  <td className="px-4 py-2">{o.standard}</td>
                  <td className="px-4 py-2">{o.dueDate}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.status === "satisfied"
                          ? "bg-emerald-100 text-emerald-700"
                          : o.status === "overdue"
                            ? "bg-red-100 text-red-700"
                            : o.status === "in-progress"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 text-[11px] text-slate-400">
        Evidence classes used on this page: {Object.values(EVIDENCE_LABEL).join(" · ")}
      </footer>
    </main>
  );
}

function PillarFigure({ label, explain, unit, highlight }: { label: string; explain: import("@/lib/evidence").Explain<number>; unit: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${highlight ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white shadow-sm"}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-slate-300" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${highlight ? "text-white" : "text-slate-900"}`}>
        {fmt(explain.value)} <span className={`text-sm font-normal ${highlight ? "text-slate-300" : "text-slate-500"}`}>{unit}</span>
      </p>
      <div className="mt-3">
        <EvidenceBadge explain={explain} />
      </div>
    </div>
  );
}

function SimpleStat({ label, value, unit, evidenceClass }: { label: string; value: number | null; unit: string; evidenceClass: string }) {
  if (value === null) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-lg font-semibold text-slate-400">No data</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {fmt(value)} <span className="text-sm font-normal text-slate-500">{unit}</span>
      </p>
      <p className="mt-3 text-[11px] text-slate-400">evidence class: {evidenceClass}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
