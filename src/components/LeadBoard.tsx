"use client";

import { useState, useTransition } from "react";
import type { Lead } from "@/db/schema";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/scoring";

interface Props {
  initialLeads: Lead[];
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-200 text-slate-700",
  contacted: "bg-blue-100 text-blue-700",
  qualified: "bg-emerald-100 text-emerald-700",
  disqualified: "bg-rose-100 text-rose-700",
  converted: "bg-violet-100 text-violet-700",
};

/**
 * Client-side board for the LEADOS "first hour" tutorial: add a lead (an
 * intake event), see its rule-based score (the "first insight"), and record
 * a status decision (the "first decision"). See docs/tutorials.md.
 */
export default function LeadBoard({ initialLeads }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", company: "", source: "website", notes: "" });

  async function refresh() {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads ?? []);
  }

  function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "failed to create lead");
        return;
      }
      setForm({ name: "", email: "", company: "", source: "website", notes: "" });
      await refresh();
    });
  }

  function setStatus(id: number, status: string) {
    startTransition(async () => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await refresh();
    });
  }

  function rescore(id: number) {
    startTransition(async () => {
      const res = await fetch(`/api/leads/${id}/score`, { method: "POST" });
      if (res.ok) await refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS</p>
        <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-slate-950">
          Lead intake &amp; rule-based scoring
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Every score below is a transparent sum of named rules (see{" "}
          <code className="rounded bg-slate-200 px-1">src/lib/scoring.ts</code>) — not a trained model. Add a
          lead, inspect its score breakdown, and record a qualify/disqualify decision.
        </p>
      </header>

      <form
        onSubmit={submitLead}
        className="mb-10 grid grid-cols-1 gap-3 rounded-2xl bg-white p-6 shadow-sm sm:grid-cols-2"
      >
        <input
          required
          placeholder="Name"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          required
          type="email"
          placeholder="Email"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Company"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
        >
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <textarea
          placeholder="Notes (context on this lead)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2"
        >
          {isPending ? "Working…" : "Add lead"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Decision</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No leads yet — add one above.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{lead.name}</div>
                  <div className="text-xs text-slate-500">{lead.email}</div>
                  {lead.company && <div className="text-xs text-slate-500">{lead.company}</div>}
                </td>
                <td className="px-4 py-3">{lead.source}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => rescore(lead.id)}
                    title={JSON.stringify(lead.scoreBreakdown)}
                    className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-semibold hover:bg-slate-200"
                  >
                    {lead.score}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[lead.status] ?? ""}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.status}
                    onChange={(e) => setStatus(lead.id, e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
