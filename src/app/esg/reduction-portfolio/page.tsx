import Link from "next/link";
import { buildMaccData } from "@/lib/esgSurfaces";

export const dynamic = "force-dynamic";

function fmt(n: number, digits = 1) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default async function ReductionPortfolioPage() {
  const macc = await buildMaccData();
  const maxAbsCost = Math.max(...macc.bars.map((b) => Math.abs(b.costPerTonneUsd)), 1);
  const maxCumulative = macc.totalAbatementTco2e || 1;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">LEADOS · Sustainability Intelligence</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Reduction Portfolio — MACC</h1>
          <p className="mt-1 text-sm text-slate-600">
            Marginal abatement cost curve, linked to the Part 07-style initiative portfolio. Bars sorted cheapest (most negative) to most
            expensive per tonne.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" href="/esg">
          ← Dashboard
        </Link>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total abatement potential" value={`${fmt(macc.totalAbatementTco2e)} tCO2e/yr`} />
        <Stat label="Net-negative-cost abatement" value={`${fmt(macc.netNegativeAbatementTco2e)} tCO2e/yr`} />
        <Stat label="Portfolio net cost" value={`$${fmt(macc.totalNetCostUsd, 0)}/yr`} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="relative h-64 border-b border-l border-slate-300">
          <div className="absolute left-0 right-0 border-t border-dashed border-slate-300" style={{ top: `${(maxAbsCost / (2 * maxAbsCost)) * 100}%` }} />
          <div className="flex h-full items-end">
            {macc.bars.map((b) => {
              const widthPct = (b.annualAbatementTco2e / maxCumulative) * 100;
              const heightPct = (Math.abs(b.costPerTonneUsd) / maxAbsCost) * 50;
              const isNegative = b.costPerTonneUsd < 0;
              return (
                <div
                  key={b.id}
                  className="group relative flex h-full flex-col justify-end"
                  style={{ width: `${widthPct}%` }}
                  title={`${b.name}: ${fmt(b.costPerTonneUsd, 0)} $/tCO2e, ${fmt(b.annualAbatementTco2e)} tCO2e/yr`}
                >
                  <div
                    className={`mx-0.5 rounded-t ${isNegative ? "bg-emerald-400" : "bg-orange-400"} transition group-hover:opacity-80`}
                    style={{ height: `${heightPct}%`, alignSelf: isNegative ? "flex-end" : "flex-end", marginTop: isNegative ? "auto" : 0 }}
                  />
                </div>
              );
            })}
          </div>
          <p className="absolute -left-2 top-1/2 -translate-x-full text-[10px] text-slate-400">$/tCO2e</p>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">Cumulative abatement (tCO2e/yr) →</p>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Initiative</th>
              <th className="px-4 py-2">Scope</th>
              <th className="px-4 py-2">Annual abatement (tCO2e)</th>
              <th className="px-4 py-2">Net cost ($/yr)</th>
              <th className="px-4 py-2">$/tCO2e</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Portfolio ref</th>
              <th className="px-4 py-2">Evidence class</th>
            </tr>
          </thead>
          <tbody>
            {macc.bars.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">{b.name}</td>
                <td className="px-4 py-2">{b.scope}</td>
                <td className="px-4 py-2">{fmt(b.annualAbatementTco2e)}</td>
                <td className="px-4 py-2">{fmt(b.annualNetCostUsd, 0)}</td>
                <td className={`px-4 py-2 font-semibold ${b.costPerTonneUsd < 0 ? "text-emerald-600" : "text-orange-600"}`}>{fmt(b.costPerTonneUsd, 0)}</td>
                <td className="px-4 py-2">{b.implementationStatus}</td>
                <td className="px-4 py-2 font-mono text-[11px]">{b.portfolioRef ?? "—"}</td>
                <td className="px-4 py-2 text-[11px] text-slate-500">{b.evidenceClass}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
