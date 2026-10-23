"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Badge from "@/components/Badge";
import { formatDate } from "@/lib/format";

type Decision = {
  id: number;
  title: string;
  description: string;
  owner: string;
  status: "proposed" | "under_review" | "committed" | "archived";
  impact: "low" | "medium" | "high" | "critical";
  dueDate: string | null;
  createdAt: string;
};

const STATUS_FILTERS = ["all", "proposed", "under_review", "committed", "archived"] as const;

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", owner: "", impact: "medium", dueDate: "" });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/decisions");
      const data = await res.json();
      setDecisions(data.decisions ?? []);
    } catch {
      setError("Failed to load decisions.");
    } finally {
      setLoading(false);
    }
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
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create decision.");
      }
      setForm({ title: "", description: "", owner: "", impact: "medium", dueDate: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = filter === "all" ? decisions : decisions.filter((d) => d.status === filter);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.1em] text-indigo-600">Decision Governance</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Decisions</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Log, review, and commit decisions with a full audit trail of status transitions.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-950">Log a new decision</h2>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. Approve Q3 regional expansion budget"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="Context, options considered, and rationale"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Owner</label>
            <input
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="e.g. CFO"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Impact</label>
            <select
              value={form.impact}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {submitting ? "Logging…" : "Log decision"}
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">All decisions</h2>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                  filter === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No decisions match this filter.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {filtered.map((decision) => (
              <li key={decision.id} className="py-3">
                <Link href={`/decisions/${decision.id}`} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{decision.title}</p>
                    <p className="text-xs text-slate-500">
                      {decision.owner} · due {formatDate(decision.dueDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={decision.impact} />
                    <Badge value={decision.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
