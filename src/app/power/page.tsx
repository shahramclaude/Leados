"use client";

import { useEffect, useState } from "react";
import { ActorPickerBar, actorHeaders, useActor } from "@/components/ActorPicker";

interface DashboardData {
  dualControl: {
    totalRequested: number;
    executed: number;
    pending: number;
    blockedSingleActorAttempts: number;
    coveragePct: number;
    note: string;
  };
  conflictsOfInterest: {
    totalDeclarations: number;
    recusalsRecorded: number;
    proximityWarningsRaised: number;
    proximityWarningsResolved: number;
    proximityWarningsUnresolved: number;
    recusalCompliancePct: number;
  };
}

interface DualControlAction {
  id: number;
  actionType: string;
  status: string;
  requestedByPersonId: number;
  createdAt: string;
}

const T4_ACTIONS = ["bulk_people_data_export", "evaluation_policy_change", "mass_notification_all_staff", "org_wide_policy_publish"];

export default function PowerPage() {
  const { actor } = useActor();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [actions, setActions] = useState<DualControlAction[]>([]);
  const [actionType, setActionType] = useState(T4_ACTIONS[0]);
  const [log, setLog] = useState<string[]>([]);

  async function refresh() {
    const [d, a] = await Promise.all([
      fetch("/api/power/dashboard").then((r) => r.json()),
      fetch("/api/power/dual-control").then((r) => r.json()),
    ]);
    setDashboard(d);
    setActions(a.actions ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  function appendLog(line: string) {
    setLog((prev) => [line, ...prev].slice(0, 20));
  }

  async function requestT4() {
    const res = await fetch("/api/power/dual-control", {
      method: "POST",
      headers: actorHeaders(actor),
      body: JSON.stringify({ actionType, payload: { via: "power-dashboard-ui" } }),
    });
    const data = await res.json();
    appendLog(res.ok ? `Requested action #${data.action.id} (${actionType}) by ${actor.role}` : `Request failed: ${data.error}`);
    refresh();
  }

  async function approve(actionId: number) {
    const res = await fetch(`/api/power/dual-control/${actionId}/approve`, {
      method: "POST",
      headers: actorHeaders(actor),
    });
    const data = await res.json();
    appendLog(`Approve #${actionId} as ${actor.role}: ${data.status} — ${data.message ?? data.error}`);
    refresh();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-950">Power Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Org-level aggregates only — no individual profiling. Dual-control coverage of high-power (T4) actions and
          conflict-of-interest recusal compliance.
        </p>
      </section>

      {dashboard && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="font-semibold text-slate-900">Dual control coverage</h2>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div className="flex justify-between"><dt>Total T4 requests</dt><dd>{dashboard.dualControl.totalRequested}</dd></div>
              <div className="flex justify-between"><dt>Executed (2-person rule met)</dt><dd>{dashboard.dualControl.executed}</dd></div>
              <div className="flex justify-between"><dt>Pending</dt><dd>{dashboard.dualControl.pending}</dd></div>
              <div className="flex justify-between"><dt>Blocked single-actor attempts</dt><dd>{dashboard.dualControl.blockedSingleActorAttempts}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Coverage</dt><dd>{dashboard.dualControl.coveragePct}%</dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">{dashboard.dualControl.note}</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="font-semibold text-slate-900">Conflict-of-interest compliance</h2>
            <dl className="mt-3 space-y-1 text-sm text-slate-700">
              <div className="flex justify-between"><dt>Declarations</dt><dd>{dashboard.conflictsOfInterest.totalDeclarations}</dd></div>
              <div className="flex justify-between"><dt>Recusals recorded</dt><dd>{dashboard.conflictsOfInterest.recusalsRecorded}</dd></div>
              <div className="flex justify-between"><dt>Proximity warnings raised</dt><dd>{dashboard.conflictsOfInterest.proximityWarningsRaised}</dd></div>
              <div className="flex justify-between"><dt>Resolved</dt><dd>{dashboard.conflictsOfInterest.proximityWarningsResolved}</dd></div>
              <div className="flex justify-between"><dt>Unresolved</dt><dd>{dashboard.conflictsOfInterest.proximityWarningsUnresolved}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Resolution rate</dt><dd>{dashboard.conflictsOfInterest.recusalCompliancePct}%</dd></div>
            </dl>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Simulate a dual-control (two-person rule) flow</h2>
        <ActorPickerBar />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={actionType} onChange={(e) => setActionType(e.target.value)}>
            {T4_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button onClick={requestT4} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Request as current actor
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <span>
                #{a.id} {a.actionType} — requested by person {a.requestedByPersonId} — <strong>{a.status}</strong>
              </span>
              {a.status === "pending" && (
                <button onClick={() => approve(a.id)} className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  Approve as current actor
                </button>
              )}
            </div>
          ))}
          {actions.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Try requesting as one person, then approving as the <em>same</em> person — it will be blocked. Switch the
          actor picker to a different eligible role (admin, CEO, HR manager, or ethics officer) to approve for real.
        </p>

        {log.length > 0 && (
          <div className="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-700">
            {log.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
