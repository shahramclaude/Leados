"use client";

import { useEffect, useState, type FormEvent } from "react";
import Badge from "@/components/Badge";
import { formatDateTime } from "@/lib/format";

type Signal = {
  id: number;
  title: string;
  description: string;
  category: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "acknowledged" | "resolved";
  detectedAt: string;
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  active: [
    { status: "acknowledged", label: "Acknowledge" },
    { status: "resolved", label: "Resolve" },
  ],
  acknowledged: [{ status: "resolved", label: "Resolve" }],
  resolved: [],
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", source: "", severity: "medium" });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/signals");
    const data = await res.json();
    setSignals(data.signals ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to log signal.");
      }
      setForm({ title: "", description: "", category: "", source: "", severity: "medium" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log signal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/signals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  const sorted = [...signals].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.1em] text-indigo-600">Early Warning</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Signals</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Track emerging risks and opportunities, triage by severity, and move them through
          acknowledgement to resolution.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">Log a new signal</h2>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Churn risk rising in enterprise segment"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Customer, Market, Ops"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Source</label>
            <input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. CRM, Support, Analyst"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Severity</label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {submitting ? "Logging…" : "Log signal"}
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">All signals</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-500">No signals logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {sorted.map((signal) => (
              <li key={signal.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{signal.title}</p>
                  {signal.description && <p className="text-xs text-slate-500">{signal.description}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    {signal.category} · {signal.source} · detected {formatDateTime(signal.detectedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge value={signal.severity} />
                  <Badge value={signal.status} />
                  {NEXT_ACTIONS[signal.status]?.map((action) => (
                    <button
                      key={action.status}
                      onClick={() => updateStatus(signal.id, action.status)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
