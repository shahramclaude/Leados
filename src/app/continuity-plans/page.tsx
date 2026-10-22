import { db } from "@/db";
import { continuityDrills } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { CRITICAL_PROCESSES, DRILL_SCENARIOS, listContinuityProcesses } from "@/lib/continuity";
import { runDrillAction } from "./actions";

export const dynamic = "force-dynamic";

const criticalityColor: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800 border-rose-300",
  high: "bg-amber-100 text-amber-800 border-amber-300",
  medium: "bg-sky-100 text-sky-800 border-sky-300",
  low: "bg-slate-100 text-slate-700 border-slate-300",
};

export default async function ContinuityPlansPage() {
  const [processes, drills] = await Promise.all([
    listContinuityProcesses(),
    db.select().from(continuityDrills).orderBy(desc(continuityDrills.id)).limit(20),
  ]);

  const processByKey = new Map(
    (processes.length > 0 ? processes : CRITICAL_PROCESSES.map((p, i) => ({ ...p, id: i, lastDrillAt: null }))).map(
      (p) => [p.key, p],
    ),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-8 flex gap-4 text-sm font-medium text-slate-600">
        <Link href="/" className="hover:text-slate-950">Hub</Link>
        <Link href="/resilience-lab" className="hover:text-slate-950">Resilience Lab</Link>
        <Link href="/continuity-plans" className="text-slate-950 underline">Continuity Plans</Link>
        <Link href="/degradation-status" className="hover:text-slate-950">Degradation Status</Link>
        <Link href="/failure-domain-coverage" className="hover:text-slate-950">Failure-Domain Coverage</Link>
      </nav>

      <h1 className="text-3xl font-semibold text-slate-950">Continuity Plans</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Business continuity for operational processes, not just IT: critical process list, RTO/RPO, manual
        workaround playbooks, and tabletop drill history.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Critical processes</h2>
        <div className="mt-4 space-y-4">
          {processes.map((p) => (
            <div key={p.key} className="rounded-xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{p.name}</h3>
                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${criticalityColor[p.criticality] ?? ""}`}>
                  {p.criticality}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">RTO</dt>
                  <dd className="font-medium text-slate-900">{p.rtoMinutes} min</dd>
                </div>
                <div>
                  <dt className="text-slate-500">RPO</dt>
                  <dd className="font-medium text-slate-900">{p.rpoMinutes} min</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Owner</dt>
                  <dd className="font-medium text-slate-900">{p.owner}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Last drill</dt>
                  <dd className="font-medium text-slate-900">
                    {p.lastDrillAt ? new Date(p.lastDrillAt).toLocaleDateString() : "never"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm text-slate-600">
                <span className="font-semibold">Manual workaround: </span>
                {p.workaroundPlaybook}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900">Tabletop drill scenarios</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {DRILL_SCENARIOS.map((s) => (
            <div key={s.key} className="rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                process: {processByKey.get(s.processKey)?.name ?? s.processKey}
              </p>
              <p className="mt-2 text-sm text-slate-600">{s.script}</p>
              <form action={runDrillAction} className="mt-3">
                <input type="hidden" name="scenarioKey" value={s.key} />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Run scripted dry-run
                </button>
              </form>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          These buttons automate the mechanics (timer, scenario script, after-action capture). A real tabletop drill
          still needs human participants in the room — see RESILIENCE.md Phase 3(c) and the drill history below for
          the honesty note.
        </p>
      </section>

      <section className="mt-10 mb-10">
        <h2 className="text-xl font-semibold text-slate-900">Drill history / after-action record</h2>
        <div className="mt-4 space-y-3">
          {drills.length === 0 ? (
            <p className="text-sm text-slate-500">No drills recorded yet.</p>
          ) : (
            drills.map((d) => (
              <details key={d.id} className="rounded-xl border border-slate-200 p-4">
                <summary className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="font-medium text-slate-900">{d.scenarioTitle}</span>
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {d.outcome}
                  </span>
                </summary>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>started {new Date(d.startedAt).toLocaleString()} · timer {d.timerSeconds ?? "–"}s</p>
                  {d.afterActionNotes ? <p><span className="font-semibold">After-action:</span> {d.afterActionNotes}</p> : null}
                  {Array.isArray(d.actionItems) && d.actionItems.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {(d.actionItems as { owner: string; item: string; dueInDays: number }[]).map((item, i) => (
                        <li key={i}>
                          [{item.owner}] {item.item} (due in {item.dueInDays}d)
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
