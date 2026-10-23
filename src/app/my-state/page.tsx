import { listLeaderStateEntries, listUsers } from "@/lib/queries";
import { createLeaderStateEntryAction } from "@/app/actions";
import { Card, PageHeader, EmptyState, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

function loadColor(score: number) {
  if (score >= 75) return "bg-rose-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

export default async function LeaderStatePage() {
  const [entries, users] = await Promise.all([listLeaderStateEntries(), listUsers()]);
  const avgLoad = entries.length
    ? Math.round(entries.reduce((sum, e) => sum + e.decisionLoadScore, 0) / entries.length)
    : 0;

  return (
    <div>
      <PageHeader
        title="Leader state & decision-load science"
        description="Track decision load, stress index, and focus hours across the leadership team to prevent burnout and decision fatigue."
      />

      <div className="mb-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Team average decision load</p>
              <p className="mt-1 text-3xl font-semibold text-white">{avgLoad}</p>
            </div>
            <div className="h-3 w-48 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full ${loadColor(avgLoad)}`} style={{ width: `${Math.min(avgLoad, 100)}%` }} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="order-2 lg:order-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Entries</h2>
          {entries.length === 0 ? (
            <EmptyState message="No leader-state entries logged yet." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {entries.map((e) => (
                <li key={e.id} className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-100">{e.userName ?? "Unknown"}</p>
                    <p className="text-xs text-slate-500">{fmtDate(e.date)}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <Metric label="Decision load" value={e.decisionLoadScore} />
                    <Metric label="Stress index" value={e.stressIndex} />
                    <Metric label="Focus hours" value={e.focusHours} suffix="h" />
                  </div>
                  {e.notes ? <p className="mt-2 text-sm text-slate-400">{e.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="order-1 h-fit lg:order-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Log today&apos;s state</h2>
          <form action={createLeaderStateEntryAction} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Leader</label>
              <select
                name="userId"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Decision load</label>
                <input
                  type="number"
                  name="decisionLoadScore"
                  min={0}
                  max={100}
                  defaultValue={40}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Stress index</label>
                <input
                  type="number"
                  name="stressIndex"
                  min={0}
                  max={100}
                  defaultValue={30}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Focus hrs</label>
                <input
                  type="number"
                  name="focusHours"
                  min={0}
                  max={24}
                  step="0.5"
                  defaultValue={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Log entry
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, suffix = "" }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-slate-950/60 p-2 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-mono text-slate-200">
        {value}
        {suffix}
      </p>
    </div>
  );
}
