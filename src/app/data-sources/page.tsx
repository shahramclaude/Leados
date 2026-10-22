"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AllDimensionsTable, QualityChips } from "@/components/QualityChips";

interface SyncRun {
  id: string;
  mode: string;
  status: string;
  rowsRead: number;
  rowsImported: number;
  rowsQuarantined: number;
  startedAt: string;
  finishedAt: string | null;
}

interface ConnectorRow {
  id: string;
  name: string;
  kind: string;
  authType: string;
  healthState: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
  limits: string[];
  recentSyncRuns: SyncRun[];
}

interface DashboardBatch {
  id: string;
  status: string;
  createdAt: string;
  rawRowCount: number;
  qualityReport: { dimensions: Record<string, { value: number; explanation: string; isProxy?: boolean }>; thresholds: Record<string, number> } | null;
}

const FIXTURES = ["success", "schema-drift", "malformed", "server-error-then-success", "always-down"];

function healthColor(state: string) {
  if (state === "healthy") return "bg-emerald-100 text-emerald-800";
  if (state === "degraded") return "bg-amber-100 text-amber-800";
  if (state === "down") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-600";
}

function staleBanner(lastSuccessAt: string | null) {
  if (!lastSuccessAt) return null;
  const ageMs = Date.now() - new Date(lastSuccessAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 24) {
    return (
      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
        Last successful sync was {ageHours.toFixed(0)}h ago. Data shown elsewhere in the product may be stale — it is NOT being silently refreshed.
      </p>
    );
  }
  return null;
}

export default function DataSourcesPage() {
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [dashboard, setDashboard] = useState<Record<string, DashboardBatch[]>>({});
  const [fixture, setFixture] = useState("success");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);

  async function refresh() {
    const [cRes, dRes] = await Promise.all([fetch("/api/connectors"), fetch("/api/quality/dashboard")]);
    const cData = await cRes.json();
    const dData = await dRes.json();
    setConnectors(cData.connectors ?? []);
    const map: Record<string, DashboardBatch[]> = {};
    for (const d of dData.dashboard ?? []) map[d.connectorId] = d.batches;
    setDashboard(map);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function trigger(connectorId: string, dryRun: boolean) {
    setBusy(connectorId + dryRun);
    setLastOutcome(null);
    try {
      const res = await fetch(`/api/connectors/${connectorId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, fixture, actor: "user:data-sources-ui" }),
      });
      const data = await res.json();
      setLastOutcome(JSON.stringify(data, null, 2));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Data Sources</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          ← Back
        </Link>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">HRIS demo fixture (recorded, no live network)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={fixture} onChange={(e) => setFixture(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {FIXTURES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            disabled={busy === "hris-directorytrue"}
            onClick={() => trigger("hris-directory", true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Dry-run sync
          </button>
          <button
            disabled={busy === "hris-directoryfalse"}
            onClick={() => trigger("hris-directory", false)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Commit sync
          </button>
        </div>
        {lastOutcome && <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{lastOutcome}</pre>}
      </section>

      <div className="grid gap-6">
        {connectors.map((c) => (
          <section key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{c.name}</h3>
                <p className="text-xs text-slate-500">
                  id: {c.id} · kind: {c.kind} · auth: {c.authType}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthColor(c.healthState)}`}>{c.healthState}</span>
            </div>

            {staleBanner(c.lastSuccessAt)}
            {c.lastErrorMessage && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">Last error: {c.lastErrorMessage}</p>
            )}

            <div className="mt-3 grid gap-1 text-xs text-slate-500">
              <p>Last attempt: {c.lastAttemptAt ? new Date(c.lastAttemptAt).toLocaleString() : "never"}</p>
              <p>Last success: {c.lastSuccessAt ? new Date(c.lastSuccessAt).toLocaleString() : "never"}</p>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Documented limits</summary>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                {c.limits.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Sync history</h4>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="py-1 pr-3">Mode</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3">Read</th>
                    <th className="py-1 pr-3">Imported</th>
                    <th className="py-1 pr-3">Quarantined</th>
                    <th className="py-1 pr-3">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {c.recentSyncRuns.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1 pr-3">{r.mode}</td>
                      <td className="py-1 pr-3">{r.status}</td>
                      <td className="py-1 pr-3">{r.rowsRead}</td>
                      <td className="py-1 pr-3">{r.rowsImported}</td>
                      <td className="py-1 pr-3">{r.rowsQuarantined}</td>
                      <td className="py-1 pr-3">{new Date(r.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {c.recentSyncRuns.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-2 text-slate-400">
                        No sync runs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Quality dashboard (recent batches)</h4>
              <div className="grid gap-3">
                {(dashboard[c.id] ?? []).map((b) => (
                  <div key={b.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        {b.status} · {b.rawRowCount} rows · {new Date(b.createdAt).toLocaleString()}
                      </span>
                      {b.qualityReport && <QualityChips dimensions={b.qualityReport.dimensions} thresholds={b.qualityReport.thresholds} />}
                    </div>
                    {b.qualityReport && <AllDimensionsTable dimensions={b.qualityReport.dimensions} thresholds={b.qualityReport.thresholds} />}
                  </div>
                ))}
                {(dashboard[c.id] ?? []).length === 0 && <p className="text-xs text-slate-400">No batches yet.</p>}
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
