import { useState } from 'react';
import type { AppState } from '../lib/types';
import { runAgentLoop, TASK_TYPES, type AgentLoopRun, type AgentProposal } from '../lib/agent';
import { Panel, Label, Stat } from './Shell';

export function AgentView({
  state,
  today,
  onAuditEvents,
  onAcceptProposal,
  onRejectProposal,
  onProposalsChanged,
}: {
  state: AppState;
  today: Date;
  onAuditEvents: (types: string[]) => void;
  onAcceptProposal: (p: AgentProposal) => void;
  onRejectProposal: (p: AgentProposal) => void;
  onProposalsChanged: (proposals: AgentProposal[]) => void;
}) {
  const [run, setRun] = useState<AgentLoopRun | null>(null);
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    const result = await runAgentLoop(state.events, state.roster, today, state.settings);
    setRun(result);
    onAuditEvents(result.results.filter((r) => r.status === 'COMPLETED').map((r) => r.task));
    onProposalsChanged(result.pendingProposals);
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <Panel title="Authority model" subtitle="Three levels — the agent never exceeds what you've explicitly allowed">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-semibold uppercase text-emerald-700">Level 1 — Autonomous</div>
            <p className="mt-1 text-sm text-emerald-800">Read, analyze, generate drafts. Executes and caches results automatically.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold uppercase text-amber-700">Level 2 — Proposes</div>
            <p className="mt-1 text-sm text-amber-800">Logs events, changes settings — queued, and only applied after you confirm.</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <div className="text-xs font-semibold uppercase text-rose-700">Level 3 — Escalates</div>
            <p className="mt-1 text-sm text-rose-800">Personnel &amp; financial commitments. Always handed back to you, never attempted.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Run the agent loop" subtitle="Builds a prioritized task queue from current data, executes what it's allowed to, queues the rest">
        <button
          onClick={handleRun}
          disabled={running}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run agent loop now'}
        </button>

        {run && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Completed" value={run.tasksExecuted} tone="ok" />
              <Stat label="Queued (needs you)" value={run.tasksQueued} tone="warn" />
              <Stat label="Escalated" value={run.tasksEscalated} tone="bad" />
              <Stat label="Errors" value={run.tasksErrored} />
            </div>

            <div className="space-y-2">
              {run.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <div>
                    <span className="font-mono text-xs text-slate-500">L{r.authority}</span>{' '}
                    <span className="font-medium">{r.task}</span>
                    <span className="ml-2 text-xs text-slate-400">{TASK_TYPES[r.task]?.description}</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : r.status === 'QUEUED'
                        ? 'bg-amber-50 text-amber-700'
                        : r.status === 'ESCALATED'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>

            <Label>{run.label}</Label>
          </div>
        )}
      </Panel>

      {run && run.pendingProposals.length > 0 && (
        <Panel title="Pending proposals" subtitle="Level 2 — nothing here has been applied yet">
          <div className="space-y-3">
            {run.pendingProposals.map((p) => (
              <div key={p.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  Change <code>{p.setting}</code> from <strong>{String(p.currentValue)}</strong> to <strong>{String(p.proposedValue)}</strong>
                </p>
                <p className="mt-1 text-sm text-amber-800">{p.rationale}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      onAcceptProposal(p);
                      const next = run.pendingProposals.filter((x) => x.id !== p.id);
                      setRun({ ...run, pendingProposals: next });
                      onProposalsChanged(next);
                    }}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      onRejectProposal(p);
                      const next = run.pendingProposals.filter((x) => x.id !== p.id);
                      setRun({ ...run, pendingProposals: next });
                      onProposalsChanged(next);
                    }}
                    className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
