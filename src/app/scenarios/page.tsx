import Link from "next/link";
import { listScenarios, diffScenarios } from "@/lib/scenarioEngine";
import { listWargameScenarios } from "@/lib/wargameEngine";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const scenarios = await listScenarios();
  const diff = scenarios.length ? await diffScenarios(scenarios.map((s) => s.id).slice(0, 3), 6) : null;
  const wargames = await listWargameScenarios();

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">← Cockpit</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Scenario &amp; Wargame Studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Scenarios apply driver deltas on top of base-case assumptions and reproject the financial model; wargame branches become scenarios with probabilities the strategic layer monitors via early-warning indicators.</p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-5xl space-y-6 px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Revenue diff — base case vs. scenarios (6mo projection)</h2>
          {diff && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="pb-2">Month</th>
                    <th className="pb-2">Base case revenue</th>
                    {diff.scenarios.map((s) => (
                      <th key={s.scenarioId} className="pb-2">{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diff.base.months.map((m, i) => (
                    <tr key={m.month} className="border-t border-slate-100">
                      <td className="py-1.5">M+{m.month}</td>
                      <td className="py-1.5 font-mono">{money(m.revenue)}</td>
                      {diff.scenarios.map((s) => (
                        <td key={s.scenarioId} className="py-1.5 font-mono">{money(s.months[i]?.revenue ?? 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {scenarios.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">{s.title}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{s.source}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{s.description}</p>
              <p className="mt-2 text-xs text-slate-500">probability {Number(s.probability).toFixed(2)} · category {s.category}</p>
              <p className="mt-1 text-xs font-mono text-slate-400">{JSON.stringify(s.driverDeltas)}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Wargame branches</h2>
          {wargames.map(({ scenario, moves }) => (
            <div key={scenario.id} className="mt-4 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
              <p className="font-medium text-slate-900">{scenario.title}</p>
              <ol className="mt-2 space-y-2">
                {moves.map((m) => (
                  <li key={m.id} className="text-sm">
                    <span className="font-semibold text-slate-700">Round {m.round} — {m.actor}:</span> <span className="text-slate-700">{m.move}</span>
                    {m.ourResponse && <p className="text-slate-600">Our response: {m.ourResponse}</p>}
                    {m.impact && <p className="text-xs text-slate-500">Impact: {m.impact}</p>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
