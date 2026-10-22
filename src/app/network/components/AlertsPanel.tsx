"use client";

import { useEffect, useState } from "react";
import { getJson, patchJson, postJson } from "../lib/api";

interface Alert {
  id: string;
  alertType: string;
  subjectRef: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  status: "open" | "acknowledged" | "resolved";
  notifyChannel: string;
  createdAt: string;
  resolvedAt: string | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  critical: "bg-red-100 text-red-800 border-red-300",
};

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await getJson<{ alerts: Alert[] }>("/api/network/alerts");
      setAlerts(data.alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load alerts");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runChecks() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/network/alerts/evaluate");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: "acknowledged" | "resolved") {
    try {
      await patchJson("/api/network/alerts", { id, status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Key-dependency checks</h3>
          <p className="text-xs text-slate-500">
            Evaluates bus-factor-per-capability and HHI-concentration thresholds; wired to the Part 13
            notification inbox (<code>notifyChannel</code>) on every new breach.
          </p>
        </div>
        <button
          type="button"
          onClick={runChecks}
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Run dependency checks
        </button>
      </div>

      {error && <p role="alert" className="text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="p-3 text-left text-sm font-medium text-slate-700">
            {alerts.length} alert(s). Open alerts need acknowledgement; resolved alerts are kept for audit.
          </caption>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">Severity</th>
              <th scope="col" className="px-3 py-2">Type</th>
              <th scope="col" className="px-3 py-2">Subject</th>
              <th scope="col" className="px-3 py-2">Message</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[a.severity]}`}>
                    {a.severity}
                  </span>
                </td>
                <td className="px-3 py-2">{a.alertType}</td>
                <td className="px-3 py-2">{a.subjectRef}</td>
                <td className="px-3 py-2">{a.message}</td>
                <td className="px-3 py-2">{a.status}</td>
                <td className="px-3 py-2">
                  {a.status !== "resolved" && (
                    <div className="flex gap-2">
                      {a.status === "open" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(a.id, "acknowledged")}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updateStatus(a.id, "resolved")}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {alerts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No alerts yet — run dependency checks after seeding demo data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
