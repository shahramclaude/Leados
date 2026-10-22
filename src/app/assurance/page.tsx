import { db } from "@/db";
import { assuranceChecks, assuranceRuns, remediationActions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { fullBootstrap } from "@/lib/assurance/sync";
import { AssuranceNav, StatusBadge } from "@/app/assurance/_components/AssuranceNav";
import { RunCycleButton } from "@/app/assurance/_components/RunCycleButton";
import { RevertRemediationButton } from "@/app/assurance/_components/RevertRemediationButton";
import { runSelfDiagnostics } from "@/lib/selfDiagnostics";

export const dynamic = "force-dynamic";

async function getConsoleData() {
  await fullBootstrap();
  const checks = await db.select().from(assuranceChecks).orderBy(assuranceChecks.domain, assuranceChecks.id);

  const checksWithHistory = await Promise.all(
    checks.map(async (check) => {
      const runs = await db
        .select()
        .from(assuranceRuns)
        .where(eq(assuranceRuns.checkId, check.id))
        .orderBy(desc(assuranceRuns.runAt))
        .limit(10);
      return { check, runs };
    }),
  );

  const remediations = await db.select().from(remediationActions).orderBy(desc(remediationActions.createdAt)).limit(25);
  const diagnostics = await runSelfDiagnostics();

  return { checksWithHistory, remediations, diagnostics };
}

const OVERALL_COPY: Record<string, { label: string; style: string }> = {
  healthy: { label: "Healthy", style: "bg-emerald-100 text-emerald-800" },
  degraded: { label: "Degraded", style: "bg-amber-100 text-amber-800" },
  attention_needed: { label: "Attention needed", style: "bg-rose-100 text-rose-800" },
};

export default async function AssuranceConsolePage() {
  const { checksWithHistory, remediations, diagnostics } = await getConsoleData();
  const overall = OVERALL_COPY[diagnostics.overall];

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 38</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Assurance Console</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Registry of every continuous-assurance check, its latest health, breach history, and the remediation
          log. Checks run on an idempotent, budgeted cycle (Part 10 scheduler compatibility shim) and every breach
          is handled by one of three auditable, reversible tiers: safe auto-fix, degrade, or escalate.
        </p>

        <AssuranceNav active="/assurance" />

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${overall.style}`}>{overall.label}</span>
            <span className="text-sm text-slate-600">
              {diagnostics.openFindings} open finding(s) · {diagnostics.degradedFeatures} degraded feature(s) ·{" "}
              {diagnostics.recentRemediations} active remediation(s)
            </span>
          </div>
          <RunCycleButton />
        </div>

        <section className="mb-10 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Checks registry</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {checksWithHistory.map(({ check, runs }) => {
              const latest = runs[0];
              const breachCount = runs.filter((r) => r.status === "breach").length;
              return (
                <div key={check.id} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{check.domain} · {check.relatedPart}</p>
                      <h3 className="mt-1 font-semibold text-slate-950">{check.name}</h3>
                    </div>
                    <StatusBadge status={latest?.status ?? null} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{check.method}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <dt className="font-medium text-slate-500">Cadence</dt>
                      <dd>{check.cadence}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">On breach</dt>
                      <dd>{check.onBreach}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Breaches (last {runs.length} runs)</dt>
                      <dd>{breachCount}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Last run</dt>
                      <dd>{latest ? new Date(latest.runAt).toLocaleString() : "never"}</dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-xs font-medium text-slate-500">Trend (recent → oldest)</p>
                    <div className="mt-1 flex gap-1">
                      {runs.length === 0 && <span className="text-xs text-slate-400">No runs yet.</span>}
                      {runs.map((r) => (
                        <span
                          key={r.id}
                          title={`${r.status} @ ${new Date(r.runAt).toLocaleString()}`}
                          className={`h-3 w-3 rounded-sm ${
                            r.status === "pass"
                              ? "bg-emerald-500"
                              : r.status === "warn"
                                ? "bg-amber-400"
                                : r.status === "breach"
                                  ? "bg-rose-500"
                                  : "bg-slate-400"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500">
                      Blind spots ({check.blindSpots.length})
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                      {check.blindSpots.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Remediation log</h2>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Check</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Revert</th>
                </tr>
              </thead>
              <tbody>
                {remediations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      No remediation actions have been taken yet.
                    </td>
                  </tr>
                )}
                {remediations.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.checkId}</td>
                    <td className="px-4 py-3 text-slate-600">{r.tier}</td>
                    <td className="px-4 py-3 text-slate-600">{r.action}</td>
                    <td className="px-4 py-3 text-slate-600">{r.status}</td>
                    <td className="px-4 py-3">
                      <RevertRemediationButton actionId={r.id} reversible={r.reversible && r.status !== "reverted"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
