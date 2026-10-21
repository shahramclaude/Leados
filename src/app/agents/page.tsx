import { getSessionContext } from "@/lib/demo-auth";
import { can } from "@/lib/permissions";
import { listAgentRuns } from "@/services/agent-runs";
import { NewAgentRunForm } from "@/components/NewAgentRunForm";
import { ApproveActionButtons } from "@/components/ApproveActionButtons";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  awaiting_approval: "bg-amber-100 text-amber-800",
  executed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  pending: "bg-slate-100 text-slate-600",
};

export default async function AgentsPage() {
  const session = await getSessionContext();
  if (!session) {
    return <p className="text-sm text-slate-600">Pick a demo identity first.</p>;
  }

  const { runs, actions } = await listAgentRuns(session);

  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-950">Agent runs</h1>
        <p className="mt-1 text-sm text-slate-600">
          The interrupt policy (Part 04) stops any medium/high-risk action and waits here for a
          human decision — it is never auto-executed.
        </p>
      </section>

      {can(session.role, "agent_run:create") && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Start a run
          </h2>
          <NewAgentRunForm />
        </section>
      )}

      <section className="space-y-4">
        {runs.length === 0 && <p className="text-sm text-slate-500">No agent runs yet.</p>}
        {runs.map((run) => {
          const runActions = actions.filter((a) => a.agentRunId === run.id);
          return (
            <article key={run.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">
                  {run.agentName} · {run.goal}
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[run.status] ?? ""}`}>
                  {run.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Compute charged: {run.computeUnitsCharged} unit(s)
              </p>
              <ul className="mt-3 space-y-2">
                {runActions.map((action) => (
                  <li
                    key={action.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{action.actionType}</p>
                      <p className="text-xs text-slate-500">risk: {action.riskLevel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[action.status] ?? ""}`}>
                        {action.status}
                      </span>
                      {action.status === "awaiting_approval" && can(session.role, "agent_action:approve") && (
                        <ApproveActionButtons runId={run.id} actionId={action.id} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>
    </main>
  );
}
