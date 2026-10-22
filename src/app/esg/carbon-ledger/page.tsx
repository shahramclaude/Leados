import Link from "next/link";
import { buildCarbonLedgerData } from "@/lib/esgSurfaces";
import { EvidenceBadge } from "@/components/esg/EvidenceBadge";

export const dynamic = "force-dynamic";

function fmt(n: number, digits = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default async function CarbonLedgerPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  const data = await buildCarbonLedgerData(period);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">LEADOS · Sustainability Intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Carbon Ledger</h1>
          <p className="mt-1 text-sm text-slate-600">
            Period: {data.period} · activity → factor → emission chain, drill to source. Click an evidence badge for method + uncertainty.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/esg">
          ← Dashboard
        </Link>
      </header>

      <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Activity</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Quantity</th>
              <th className="px-4 py-2">Factor (versioned)</th>
              <th className="px-4 py-2">Grid method</th>
              <th className="px-4 py-2">Emission (tCO2e)</th>
              <th className="px-4 py-2">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {data.ledger.map((row) => (
              <tr key={row.activity.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.activity.id}</p>
                  <p className="text-[11px] text-slate-500">{row.activity.sourceDescription}</p>
                </td>
                <td className="px-4 py-3">{row.activity.scope}</td>
                <td className="px-4 py-3">{row.activity.category.replace(/_/g, " ")}</td>
                <td className="px-4 py-3">
                  {fmt(row.activity.quantity, 0)} {row.activity.unit}
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-[11px] text-slate-700">{row.factor.id}</p>
                  <p className="text-[11px] text-slate-500">
                    {fmt(row.factor.factorValue, 5)} kgCO2e/{row.factor.unit} · v{row.factor.version} · {row.factor.source}
                  </p>
                </td>
                <td className="px-4 py-3">{row.activity.gridMethod ?? "—"}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{fmt(row.emissionTco2e.value, 3)}</td>
                <td className="px-4 py-3">
                  <EvidenceBadge explain={row.emissionTco2e} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.unresolvedActivities.length > 0 && (
          <div className="border-t border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {data.unresolvedActivities.length} activity record(s) have no resolvable emission factor for this period/region/category and are
            excluded from totals — shown here as an explicit gap rather than silently dropped:{" "}
            {data.unresolvedActivities.map((a) => a.id).join(", ")}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Reconciliation: spend-based activity ↔ finance ledger</h2>
        <p className="mb-3 text-xs text-slate-500">
          Identity check reused from the finance decomposition discipline: dollars used for spend-based carbon estimation must match the
          dollars recorded in the finance ledger for the same period/category, within tolerance.
        </p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Activity total ($)</th>
                <th className="px-4 py-2">Finance total ($)</th>
                <th className="px-4 py-2">Δ%</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.reconciliation.map((r) => (
                <tr key={r.category} className="border-t border-slate-100">
                  <td className="px-4 py-2">{r.category.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2">{fmt(r.activityTotalUsd)}</td>
                  <td className="px-4 py-2">{fmt(r.financeTotalUsd)}</td>
                  <td className="px-4 py-2">{(r.deltaPct * 100).toFixed(3)}%</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {r.pass ? "reconciled" : "mismatch"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Scope totals, this period</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["Scope 1", data.scopeTotals.scope1],
            ["Scope 2 (location)", data.scopeTotals.scope2Location],
            ["Scope 2 (market)", data.scopeTotals.scope2Market],
            ["Scope 3", data.scopeTotals.scope3],
          ].map(([label, ex]) => (
            <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label as string}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{fmt((ex as { value: number }).value)} tCO2e</p>
              <div className="mt-2">
                <EvidenceBadge explain={ex as import("@/lib/evidence").Explain<number>} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
