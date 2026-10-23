import Link from "next/link";
import { listDecisions, listUsers } from "@/lib/queries";
import { createDecisionAction } from "@/app/actions";
import { Card, PageHeader, Badge, EmptyState, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const [decisionList, users] = await Promise.all([listDecisions(), listUsers()]);

  return (
    <div>
      <PageHeader
        title="Decision governance"
        description="A committed, event-sourced record of every consequential decision: proposed, reviewed, committed, or reversed."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="order-2 lg:order-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Decision log</h2>
          {decisionList.length === 0 ? (
            <EmptyState message="No decisions recorded yet. Log the first one." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {decisionList.map((d) => (
                <li key={d.id} className="py-4">
                  <Link href={`/decisions/${d.id}`} className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-100 hover:text-indigo-300">{d.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{d.description || "No description."}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Owner: {d.ownerName ?? "Unassigned"} · Confidence {d.confidence}% · {fmtDate(d.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge label={d.status} />
                      <Badge label={d.impact} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="order-1 h-fit lg:order-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Log a new decision</h2>
          <form action={createDecisionAction} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Title</label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="e.g. Approve Q3 pricing change"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="Context for this decision"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Impact</label>
                <select
                  name="impact"
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
                <label className="mb-1 block text-xs font-medium text-slate-400">Confidence %</label>
                <input
                  type="number"
                  name="confidence"
                  min={0}
                  max={100}
                  defaultValue={60}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>
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
                    {u.name} — {u.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Rationale</label>
              <textarea
                name="rationale"
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                placeholder="Why this decision, and what evidence supports it"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Log decision
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
