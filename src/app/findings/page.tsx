"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-session";

type Lead = { id: string; name: string };
type Finding = { id: string; summary: string; status: string; alpha: number; beta: number; createdAt: string };

export default function FindingsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [leadId, setLeadId] = useState("");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<"none" | "1" | "0">("none");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [leadsRes, findingsRes] = await Promise.all([
      apiFetch("/api/leads?page=1&pageSize=50"),
      apiFetch("/api/findings?page=1&pageSize=50"),
    ]);
    if (leadsRes.ok) setLeads((await leadsRes.json()).data);
    if (findingsRes.ok) setFindings((await findingsRes.json()).data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const body: Record<string, unknown> = { leadId, summary };
    if (outcome !== "none") body.outcome = Number(outcome);
    const res = await apiFetch("/api/findings", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      const payload = await res.json();
      setError(payload.error ?? "Failed to create finding");
      return;
    }
    setSummary("");
    await refresh();
  }

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Findings</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="finding-lead" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Lead
          </label>
          <select
            id="finding-lead"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="" disabled>
              Select a lead…
            </option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="finding-summary" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Summary
          </label>
          <textarea
            id="finding-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Initial signal (optional)</legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="outcome" checked={outcome === "none"} onChange={() => setOutcome("none")} /> None
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="outcome" checked={outcome === "1"} onChange={() => setOutcome("1")} /> Positive
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="outcome" checked={outcome === "0"} onChange={() => setOutcome("0")} /> Negative
            </label>
          </div>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
          Create finding
        </button>
      </form>

      <ul data-testid="finding-list" className="mt-6 space-y-2">
        {findings.map((f) => (
          <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900 dark:text-white">{f.summary}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  f.status === "hot" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {f.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              α={f.alpha} β={f.beta}
            </p>
          </li>
        ))}
        {findings.length === 0 ? <li className="text-sm text-slate-500">No findings yet.</li> : null}
      </ul>
    </main>
  );
}
