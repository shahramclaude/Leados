import Link from "next/link";
import { computeFailureDomainCoverage } from "@/lib/resilience";

export const dynamic = "force-dynamic";

export default async function FailureDomainCoveragePage() {
  const coverage = await computeFailureDomainCoverage();
  const excluded = coverage.filter((c) => !c.chaosTestable);
  const testableGaps = coverage.filter((c) => c.chaosTestable && c.gap);
  const covered = coverage.filter((c) => c.chaosTestable && !c.gap);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm font-medium text-slate-600">
        <Link href="/" className="hover:text-slate-950">Hub</Link>
        <Link href="/resilience-lab" className="hover:text-slate-950">Resilience Lab</Link>
        <Link href="/continuity-plans" className="hover:text-slate-950">Continuity Plans</Link>
        <Link href="/degradation-status" className="hover:text-slate-950">Degradation Status</Link>
        <Link href="/failure-domain-coverage" className="text-slate-950 underline">Failure-Domain Coverage</Link>
      </nav>

      <h1 className="text-3xl font-semibold text-slate-950">Failure-Domain Coverage</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        The chaos program&apos;s own gap map: which failure domains have been exercised, how many times, and —
        just as importantly — which ones have zero coverage and why.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-emerald-800">Covered ({covered.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-200">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-emerald-50 text-emerald-800">
              <tr>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Experiments</th>
                <th className="px-4 py-3">Runs executed</th>
                <th className="px-4 py-3">Ever failed</th>
              </tr>
            </thead>
            <tbody>
              {covered.map((c) => (
                <tr key={c.domainKey} className="border-t border-emerald-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.experimentCount}</td>
                  <td className="px-4 py-3 text-slate-600">{c.runCount}</td>
                  <td className="px-4 py-3 text-slate-600">{c.everFailed ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {testableGaps.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-amber-800">Testable but uncovered ({testableGaps.length})</h2>
          <div className="mt-3 space-y-3">
            {testableGaps.map((c) => (
              <div key={c.domainKey} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">{c.name}</p>
                <p className="mt-1">{c.untestedAssumption}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 mb-10">
        <h2 className="text-lg font-semibold text-rose-800">Deliberately excluded from chaos coverage ({excluded.length})</h2>
        <div className="mt-3 space-y-3">
          {excluded.map((c) => (
            <div key={c.domainKey} className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-semibold">{c.name}</p>
              <p className="mt-1">{c.untestedAssumption}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          See RESILIENCE.md Phase 5, Q1 for how these domains are covered instead (continuity drills, not chaos
          injection).
        </p>
      </section>
    </main>
  );
}
