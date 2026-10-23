import { listCadenceMeetings, listUsers } from "@/lib/queries";
import { createCadenceMeetingAction, markCadenceCompleteAction, skipCadenceAction } from "@/app/actions";
import { Card, PageHeader, Badge, EmptyState, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function CadencePage() {
  const [meetings, users] = await Promise.all([listCadenceMeetings(), listUsers()]);
  const defaultNext = toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));

  return (
    <div>
      <PageHeader
        title="Operating cadence & rituals"
        description="Recurring decision rituals — standups, reviews, planning cycles — tracked for effectiveness, not just attendance."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="order-2 lg:order-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Cadence board</h2>
          {meetings.length === 0 ? (
            <EmptyState message="No rituals scheduled yet." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {meetings.map((m) => (
                <li key={m.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-100">{m.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Owner: {m.ownerName ?? "Unassigned"} · Next: {fmtDate(m.nextOccurrence)}
                      </p>
                      {m.notes ? <p className="mt-1 text-sm text-slate-400">{m.notes}</p> : null}
                      {m.effectivenessScore != null ? (
                        <p className="mt-1 text-xs text-emerald-400">Effectiveness score: {m.effectivenessScore}/100</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge label={m.type} />
                      <Badge label={m.status} />
                    </div>
                  </div>
                  {m.status === "scheduled" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={markCadenceCompleteAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={m.id} />
                        <input
                          type="number"
                          name="effectivenessScore"
                          min={0}
                          max={100}
                          defaultValue={70}
                          className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
                        >
                          Mark completed
                        </button>
                      </form>
                      <form action={skipCadenceAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:border-slate-500"
                        >
                          Skip
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="order-1 h-fit lg:order-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Schedule a ritual</h2>
          <form action={createCadenceMeetingAction} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Title</label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="e.g. Executive weekly sync"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
                <select
                  name="type"
                  defaultValue="weekly"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="standup">Standup</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="adhoc">Ad hoc</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Owner</label>
                <select
                  name="ownerId"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Next occurrence</label>
              <input
                type="datetime-local"
                name="nextOccurrence"
                defaultValue={defaultNext}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
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
              Schedule
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
