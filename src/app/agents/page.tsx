import { listAgentRuns } from "@/lib/queries";
import { runAgentAction } from "@/app/actions";
import { Card, PageHeader, Badge, EmptyState, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const PLAYBOOKS = [
  {
    name: "signal-triage",
    label: "Signal triage",
    description: "Scans open signals and escalates the highest-severity items for executive review.",
  },
  {
    name: "cadence-optimizer",
    label: "Cadence optimizer",
    description: "Analyzes meeting effectiveness and proposes consolidating low-value recurring rituals.",
  },
  {
    name: "decision-digest",
    label: "Decision digest",
    description: "Compiles decisions pending commit, ranked by impact and confidence.",
  },
  {
    name: "leader-load-check",
    label: "Leader load check",
    description: "Computes a rolling decision-load index across the leadership team.",
  },
];

export default async function AgentsPage() {
  const runs = await listAgentRuns();

  return (
    <div>
      <PageHeader
        title="Autonomous agent kernel"
        description="A single agent kernel executing named playbooks on demand. Every run is logged with inputs and outputs for auditability."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="h-fit">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Run a playbook</h2>
          <div className="space-y-3">
            {PLAYBOOKS.map((p) => (
              <form key={p.name} action={runAgentAction} className="rounded-xl border border-slate-800 p-4">
                <input type="hidden" name="name" value={p.name} />
                <p className="text-sm font-semibold text-slate-100">{p.label}</p>
                <p className="mt-1 text-xs text-slate-500">{p.description}</p>
                <button
                  type="submit"
                  className="mt-3 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"
                >
                  Run now
                </button>
              </form>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Run history</h2>
          {runs.length === 0 ? (
            <EmptyState message="No agent runs yet. Trigger a playbook to see it logged here." />
          ) : (
            <ul className="divide-y divide-slate-800">
              {runs.map((r) => (
                <li key={r.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-100">{r.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{r.summary}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {fmtDate(r.startedAt)} → {fmtDate(r.finishedAt)}
                      </p>
                      {Object.keys(r.output ?? {}).length > 0 ? (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-2 text-xs text-slate-400">
                          {JSON.stringify(r.output, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                    <Badge label={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
