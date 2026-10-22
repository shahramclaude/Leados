import { GrcNav } from "@/components/GrcNav";
import { buildBoardRiskSection } from "@/lib/boardpack";

export const dynamic = "force-dynamic";

export default async function BoardReportPage() {
  const section = await buildBoardRiskSection();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/board-report" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-slate-950">Board Risk Report</h1>
        <a
          href="/api/board-report"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          download="board-risk-report.json"
        >
          Export JSON
        </a>
      </div>
      <p className="mt-1 text-xs text-slate-500">Generated {new Date(section.generatedAt).toLocaleString()}</p>

      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {section.honestyNotice}
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Portfolio loss distribution (financial risks only)</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Inherent VaR95" value={fmt(section.portfolio.inherentP95, section.portfolio.currency)} />
          <Stat label="Residual VaR95" value={fmt(section.portfolio.residualP95, section.portfolio.currency)} />
          <Stat label="Residual TVaR99" value={fmt(section.portfolio.residualTVaR99, section.portfolio.currency)} />
          <Stat label="Trials" value={section.portfolio.trials.toLocaleString()} />
        </div>
        <p className="mt-3 text-xs text-slate-500">Correlation assumption: {section.portfolio.correlationAssumption}</p>
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-xs text-red-800">{section.portfolio.tailDependenceCaveat}</p>

        <h3 className="mt-4 text-sm font-semibold text-slate-900">Correlation sensitivity (residual P99)</h3>
        <table className="mt-2 w-full max-w-md text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="py-1">Assumption</th>
              <th className="py-1">rho</th>
              <th className="py-1">P99</th>
            </tr>
          </thead>
          <tbody>
            {section.correlationSensitivity.map((s) => (
              <tr key={s.assumption} className="border-t border-slate-100">
                <td className="py-1">{s.assumption}</td>
                <td className="py-1">{s.rho}</td>
                <td className="py-1">{fmt(s.p99, section.portfolio.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Top risks</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="py-1">Risk</th>
              <th className="py-1">Owner</th>
              <th className="py-1">Inherent P95</th>
              <th className="py-1">Residual P95</th>
              <th className="py-1">Likelihood evidence</th>
            </tr>
          </thead>
          <tbody>
            {section.topRisks.map((r) => (
              <tr key={r.code} className="border-t border-slate-100 align-top">
                <td className="py-2">
                  {r.code} — {r.title}
                </td>
                <td className="py-2">{r.owner}</td>
                <td className="py-2">{fmt(r.inherentP95, r.currency)}</td>
                <td className="py-2">{fmt(r.residualP95, r.currency)}</td>
                <td className="py-2">
                  <span className="italic">{r.likelihoodEvidence}</span>
                  <p className="text-xs text-slate-400">{r.evidenceCaveat}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Control assurance</h2>
          <ul className="mt-2 text-sm text-slate-700">
            <li>Total risk-control mappings: {section.controlAssurance.totalControls}</li>
            <li>Overdue tests: {section.controlAssurance.overdueTests}</li>
            <li>Recent failures (sampled): {section.controlAssurance.recentFailures}</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Obligations</h2>
          <ul className="mt-2 text-sm text-slate-700">
            <li>Open instances: {section.obligations.totalOpenInstances}</li>
            <li>Overdue: {section.obligations.overdue}</li>
            <li>Breached: {section.obligations.breached}</li>
          </ul>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Appetite snapshot</h2>
        <ul className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-700 sm:grid-cols-2">
          {section.appetite.map((a) => (
            <li key={a.metricCode}>
              {a.metricName}: <strong>{a.status}</strong> ({a.value ?? "no observation"})
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Open findings ({section.openFindings.length})</h2>
        <ul className="mt-2 text-sm text-slate-700">
          {section.openFindings.map((f) => (
            <li key={f.code}>
              [{f.severity}] {f.code} — {f.title}
            </li>
          ))}
          {section.openFindings.length === 0 && <li className="text-slate-400">None open.</li>}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Policies due for review: {section.policiesDueForReview}</p>
      </section>
    </main>
  );
}

function fmt(n: number, currency: string | null) {
  if (currency) {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  }
  return n.toFixed(2);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
