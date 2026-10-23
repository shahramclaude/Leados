import { fullFairnessReport, MIN_SAMPLE_SIZE } from "@/lib/fairness";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default async function FairnessReportPage() {
  const report = await fullFairnessReport();

  return (
    <>
      <TopNav crumb="Fairness report" />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-semibold text-slate-950">Coaching &amp; feedback fairness report</h1>
          <p className="mt-2 text-sm text-slate-600">
            Generated {new Date(report.generatedAt).toLocaleString()}. Groups smaller than{" "}
            <strong>{MIN_SAMPLE_SIZE}</strong> people are suppressed from disaggregated rows to prevent
            re-identification, but still count toward totals.
          </p>
        </section>

        {report.reports.map((r) => (
          <section key={r.surface + r.metric} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              {r.surface === "coaching" ? "Coaching access" : "Feedback distribution"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{r.metric.replace(/_/g, " ")}</p>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2">Group</th>
                  <th className="py-2">Sample size (n)</th>
                  <th className="py-2">Value</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {r.groups.map((g) => (
                  <tr key={g.group} className="border-b border-slate-100">
                    <td className="py-2">{g.group}</td>
                    <td className="py-2">{g.sampleSize}</td>
                    <td className="py-2">{g.suppressed ? "—" : g.value}</td>
                    <td className="py-2 text-xs">
                      {g.suppressed ? (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">suppressed (n &lt; {MIN_SAMPLE_SIZE})</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">reported</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-slate-700">
              Max observed disparity across reported groups:{" "}
              <strong>{r.maxObservedDisparity ?? "n/a (not enough reportable groups)"}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-400">{r.note}</p>
          </section>
        ))}

        <section className="rounded-2xl bg-slate-50 p-5 text-xs text-slate-500 ring-1 ring-slate-200">
          This report never shows individual coaching transcripts, feedback text, or journal content — aggregate
          counts and rates only, and never below the sample-size floor above.
        </section>
      </main>
    </>
  );
}
