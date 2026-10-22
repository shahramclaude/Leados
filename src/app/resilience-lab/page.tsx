import { db } from "@/db";
import { chaosRuns, hardeningTasks, riskRegisterEntries } from "@/db/schema";
import { desc } from "drizzle-orm";
import { EXPERIMENTS } from "@/lib/resilience";
import Link from "next/link";
import { runExperimentAction, markTaskDoneAction } from "./actions";

export const dynamic = "force-dynamic";

const outcomeColor: Record<string, string> = {
  passed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-rose-100 text-rose-800 border-rose-300",
  aborted: "bg-amber-100 text-amber-800 border-amber-300",
};

export default async function ResilienceLabPage() {
  const [recentRuns, openTasks, riskEntries] = await Promise.all([
    db.select().from(chaosRuns).orderBy(desc(chaosRuns.id)).limit(25),
    db.select().from(hardeningTasks).orderBy(desc(hardeningTasks.id)),
    db.select().from(riskRegisterEntries).orderBy(riskRegisterEntries.domainKey),
  ]);

  const latestByExperiment = new Map<string, (typeof recentRuns)[number]>();
  for (const run of recentRuns) {
    if (!latestByExperiment.has(run.experimentKey)) latestByExperiment.set(run.experimentKey, run);
  }

  const totalRuns = recentRuns.length;
  const failedCount = recentRuns.filter((r) => r.outcome === "failed").length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm font-medium text-slate-600">
        <Link href="/" className="hover:text-slate-950">Hub</Link>
        <Link href="/resilience-lab" className="text-slate-950 underline">Resilience Lab</Link>
        <Link href="/continuity-plans" className="hover:text-slate-950">Continuity Plans</Link>
        <Link href="/degradation-status" className="hover:text-slate-950">Degradation Status</Link>
        <Link href="/failure-domain-coverage" className="hover:text-slate-950">Failure-Domain Coverage</Link>
      </nav>

      <h1 className="text-3xl font-semibold text-slate-950">Resilience Lab</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Chaos experiment calendar, steady-state results, and honest pass/fail history. Every result shown here
        is a real execution against the fault-injection harness — including failures.
      </p>

      {failedCount === 0 && totalRuns > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Zero of the last {totalRuns} runs shown here failed. In a healthy chaos program that usually means the
          injections are too weak — see the AI-SESSION-LOG for why this suite&apos;s clock-skew experiment is
          expected to fail on its naive run.
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Experiment calendar</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Experiment</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Injection</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Blast radius</th>
                <th className="px-4 py-3">Last outcome</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {EXPERIMENTS.map((exp) => {
                const latest = latestByExperiment.get(exp.key);
                return (
                  <tr key={exp.key} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{exp.title}</td>
                    <td className="px-4 py-3 text-slate-600">{exp.domainKey}</td>
                    <td className="px-4 py-3 text-slate-600">{exp.injectionType}</td>
                    <td className="px-4 py-3 text-slate-600">{exp.schedule}</td>
                    <td className="px-4 py-3 text-slate-600">{exp.blastRadius}</td>
                    <td className="px-4 py-3">
                      {latest ? (
                        <span className={`rounded-full border px-2 py-1 text-xs font-medium ${outcomeColor[latest.outcome] ?? ""}`}>
                          {latest.outcome}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">never run</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <form action={runExperimentAction}>
                        <input type="hidden" name="key" value={exp.key} />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                          Run now
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Experiments default to blastRadius=test. Production runs require safetyPolicy.allowProduction=true, which
          is false for every experiment in this catalog until explicitly reviewed (see RESILIENCE.md).
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Hardening tasks (anti-fragility loop)</h2>
        <div className="mt-4 space-y-3">
          {openTasks.length === 0 ? (
            <p className="text-sm text-slate-500">No hardening tasks recorded yet.</p>
          ) : (
            openTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">{task.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{task.description}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      From run #{task.chaosRunId} ({task.experimentKey}) · status: {task.status}
                    </p>
                  </div>
                  {task.status !== "done" ? (
                    <form action={markTaskDoneAction}>
                      <input type="hidden" name="chaosRunId" value={task.chaosRunId} />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Mark done
                      </button>
                    </form>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                      done
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Recent results (honest transcripts)</h2>
        <div className="mt-4 space-y-3">
          {recentRuns.map((run) => (
            <details key={run.id} className="rounded-xl border border-slate-200 p-4">
              <summary className="flex cursor-pointer items-center justify-between gap-4">
                <span className="font-medium text-slate-900">
                  #{run.id} {run.experimentKey}
                </span>
                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${outcomeColor[run.outcome] ?? ""}`}>
                  {run.outcome}
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p><span className="font-semibold">Observed:</span> {run.observed}</p>
                <p><span className="font-semibold">Conclusion:</span> {run.conclusion}</p>
                <p className="text-xs text-slate-500">
                  started {new Date(run.startedAt).toLocaleString()} · rolledBack={String(run.rolledBack)} ·
                  thunderingHerdChecked={String(run.thunderingHerdChecked)}
                </p>
                <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
{JSON.stringify(
  { injection: run.injectionDetail, before: run.steadyStateBefore, during: run.steadyStateDuring, after: run.steadyStateAfter },
  null,
  2,
)}
                </pre>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10 mb-10">
        <h2 className="text-xl font-semibold text-slate-900">Risk register (Part 29 stand-in)</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Belief</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Source experiment</th>
              </tr>
            </thead>
            <tbody>
              {riskEntries.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 text-slate-600">{r.domainKey}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${
                        r.belief === "tested_holds"
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : r.belief === "tested_broken"
                            ? "border-rose-300 bg-rose-100 text-rose-800"
                            : "border-slate-300 bg-slate-100 text-slate-700"
                      }`}
                    >
                      {r.belief}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.title}</td>
                  <td className="px-4 py-3 text-slate-500">{r.sourceExperimentKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
