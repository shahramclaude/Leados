import { listSignals } from "@/lib/queries";
import { createSignalAction, updateSignalStatusAction } from "@/app/actions";
import { Card, PageHeader, Badge, EmptyState, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const NEXT_STATUS: Record<string, string[]> = {
  new: ["investigating", "dismissed"],
  investigating: ["resolved", "dismissed"],
  resolved: ["investigating"],
  dismissed: ["investigating"],
};

export default async function SignalsPage() {
  const signalList = await listSignals();

  return (
    <div>
      <PageHeader
        title="Sensing & early warning"
        description="Weak signals and emerging risks surfaced before they become crises. Triage, investigate, resolve."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="order-2 lg:order-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Signal board</h2>
          {signalList.length === 0 ? (
            <EmptyState message="No signals captured yet." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {signalList.map((s) => (
                <li key={s.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-100">{s.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{s.description || "No description."}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Source: {s.source} · {fmtDate(s.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge label={s.severity} />
                      <Badge label={s.status} />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {(NEXT_STATUS[s.status] ?? []).map((next) => (
                      <form key={next} action={updateSignalStatusAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="status" value={next} />
                        <button
                          type="submit"
                          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
                        >
                          Mark {next}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="order-1 h-fit lg:order-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Capture a signal</h2>
          <form action={createSignalAction} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Title</label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="e.g. Churn rate uptick in EU segment"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
              <textarea
                name="description"
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Severity</label>
                <select
                  name="severity"
                  defaultValue="medium"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Source</label>
                <input
                  name="source"
                  defaultValue="manual"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Capture signal
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
