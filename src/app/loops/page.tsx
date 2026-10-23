import { listPeople } from "@/lib/db/peopleRepo";
import { health, listLoops } from "@/lib/db/loopRepo";
import { closeLoopAction, parkLoopAction, setNextStepAction, syncLoopsAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-50 text-sky-700 border-sky-200",
  parked: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function LoopsPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const people = await listPeople();
  const viewer = people.find((p) => p.id === as) ?? people[0];
  const loops = await listLoops();
  const report = await health();
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? id.slice(0, 8) : "unassigned");

  const openLoops = loops.filter((l) => l.status === "open");
  const parkedLoops = loops.filter((l) => l.status === "parked");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">Loop Health</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        The invariant: everything has a next step and an owner, or it is explicitly parked. Violations are
        loops missing both — surfaced here, never buried.
      </p>

      <form action={syncLoopsAction} className="mt-6">
        <button className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Sync loops from live surfaces
        </button>
      </form>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total open" value={report.totalOpen} />
        <Metric label="Total parked" value={report.totalParked} />
        <Metric label="Invariant violations" value={report.violationCount} tone={report.violationCount > 0 ? "bad" : "ok"} />
        <Metric label="Surfaces tracked" value={Object.keys(report.bySurface).length} />
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Open loops by age</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(report.byAge).map(([bucket, count]) => (
            <div key={bucket} className="rounded-xl border border-slate-200 p-3 text-center">
              <p className="text-xl font-semibold text-slate-900">{count}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{bucket}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Open loops ({openLoops.length})</h2>
        {openLoops.length === 0 && <p className="text-sm text-slate-500">No open loops — everything is closed or parked.</p>}
        {openLoops.map((l) => {
          const violation = !l.nextStep || !l.ownerId;
          return (
            <div key={l.id} className={`rounded-2xl border p-4 ${violation ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  [{l.surfaceType}] {l.nextStep ?? "— no next step set —"}
                </p>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[l.status]}`}>{l.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">owner: {nameOf(l.ownerId)} {violation && <span className="font-semibold text-rose-600">— invariant violation</span>}</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {violation && (
                  <form action={setNextStepAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="actorId" value={viewer?.id} />
                    <input name="nextStep" placeholder="next step" required className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    <select name="ownerId" defaultValue={viewer?.id} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="rounded-full border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50">Set next step + owner</button>
                  </form>
                )}
                <form action={parkLoopAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="actorId" value={viewer?.id} />
                  <input name="reason" placeholder="park reason" required className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                  <input name="until" type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                  <button className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50">Park</button>
                </form>
                <form action={closeLoopAction}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="actorId" value={viewer?.id} />
                  <button className="rounded-full border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50">Close</button>
                </form>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Parking lot ({parkedLoops.length})</h2>
        {parkedLoops.length === 0 && <p className="text-sm text-slate-500">Nothing parked right now.</p>}
        {parkedLoops.map((l) => (
          <div key={l.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-slate-900">[{l.surfaceType}] {l.nextStep ?? "parked item"}</p>
            <p className="mt-1 text-xs text-slate-600">reason: {l.parkedReason}{l.parkedUntil ? ` · revisit ${l.parkedUntil.toISOString().slice(0, 10)}` : " · no revival date set"}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  const cls = tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-700" : tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-2xl border p-5 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
