import Link from "next/link";
import { GrcNav } from "@/components/GrcNav";
import { listRisks, summarizeBeliefs } from "@/lib/risk";
import { betaMean } from "@/lib/beta";

export const dynamic = "force-dynamic";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function RiskRegisterPage() {
  const risks = await listRisks();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/risk" />
      <h1 className="text-3xl font-semibold text-slate-950">Risk Register</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Likelihood and control effectiveness are Beta beliefs shown with 90% credible intervals, not single
        numbers. Impact is log-normal for financial risks (currency) or an ordinal categorical scale for
        non-financial risks — the two are never mixed into one number.
      </p>

      <div className="mt-6 space-y-4">
        {risks.map((r) => {
          const beliefs = summarizeBeliefs(r);
          const overdueControls = beliefs.controlEffectivenessSummaries.filter((c) => c.overdue).length;
          return (
            <Link
              key={r.id}
              href={`/risk/${r.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-400"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {r.code} · {r.category} · owner: {r.owner}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">{r.title}</h2>
                </div>
                <div className="flex flex-col items-end gap-1 text-sm">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                    Likelihood {pct(beliefs.likelihoodMean)} ({beliefs.likelihoodEvidence} evidence)
                  </span>
                  {overdueControls > 0 && (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                      {overdueControls} control test(s) overdue
                    </span>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
                <div>
                  <dt className="text-slate-400">Likelihood 90% CI</dt>
                  <dd>
                    {pct(beliefs.likelihoodInterval90.low)} – {pct(beliefs.likelihoodInterval90.high)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Detectability (mean)</dt>
                  <dd>{pct(beliefs.detectabilityMean)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Velocity</dt>
                  <dd>{r.velocityDays} days to peak consequence</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Controls mapped</dt>
                  <dd>
                    {r.controls.length} ({r.controls.map((c) => `${c.controlCode}: ${pct(betaMean(c.effectiveness))}`).join(", ") || "none"})
                  </dd>
                </div>
              </dl>
            </Link>
          );
        })}
        {risks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            No risks registered yet. Run <code>npx tsx src/db/seed.ts</code> to load the demo portfolio.
          </p>
        )}
      </div>
    </main>
  );
}
