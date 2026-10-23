"use client";

import { useEffect, useState } from "react";

type Person = { id: number; name: string; unitId: number; role: string };
type SimRun = { id: number; label: string; createdAt: string; humanImpactSummary: { totalAffected: number } };

type SelfEntry = {
  id: number;
  simulationRunId: number;
  roleChangeType: string;
  disruptionClass: string;
  rationale: string;
  supportPlan: { name: string; description: string } | null;
  visibilityNote: string;
};

export default function LedgerPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [runs, setRuns] = useState<SimRun[]>([]);
  const [selfPersonId, setSelfPersonId] = useState<number | "">("");
  const [selfEntries, setSelfEntries] = useState<SelfEntry[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | "">("");
  const [orgWide, setOrgWide] = useState<{ announced: boolean; aggregate: { totalAffected: number; byDisruptionClass: Record<string, number> }; entries?: unknown[]; note: string } | null>(null);
  const [announceMsg, setAnnounceMsg] = useState("");
  const [privacyEntryId, setPrivacyEntryId] = useState("");
  const [privacyResult, setPrivacyResult] = useState<{ matrix: { label: string; allowed: boolean; expected: boolean; pass: boolean }[]; allPass: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/org-design/graph").then((r) => r.json()).then((d) => setPeople(d.people ?? []));
    fetch("/api/org-design/simulations").then((r) => r.json()).then((d) => setRuns(d.runs ?? []));
  }, []);

  async function loadSelf(personId: number) {
    setSelfPersonId(personId);
    const res = await fetch(`/api/org-design/human-impact/me?personId=${personId}`);
    const data = await res.json();
    setSelfEntries(data.entries ?? []);
  }

  async function loadOrgWide(runId: number) {
    setSelectedRunId(runId);
    const res = await fetch(`/api/org-design/human-impact/org-wide?simulationRunId=${runId}`);
    const data = await res.json();
    setOrgWide(data);
  }

  async function announce() {
    if (!selectedRunId) return;
    const res = await fetch("/api/org-design/human-impact/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulationRunId: selectedRunId }),
    });
    const data = await res.json();
    setAnnounceMsg(`Announced ${data.announcedCount} entries at ${new Date(data.announcedAt).toLocaleTimeString()}`);
    loadOrgWide(selectedRunId as number);
  }

  async function runPrivacyCheck() {
    if (!privacyEntryId) return;
    const res = await fetch(`/api/org-design/human-impact/privacy-check?entryId=${privacyEntryId}`);
    const data = await res.json();
    setPrivacyResult(data);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Self-first view</h2>
        <p className="mt-1 text-sm text-slate-500">
          Policy: a person sees their own human-impact status before any org-wide announcement. Pick a person below to view the
          ledger exactly as they would see it.
        </p>
        <select
          value={selfPersonId}
          onChange={(e) => loadSelf(Number(e.target.value))}
          className="mt-3 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">View as…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.role})
            </option>
          ))}
        </select>
        <div className="mt-4 space-y-2">
          {selfEntries.length === 0 && selfPersonId !== "" && <p className="text-sm text-slate-400">No human-impact entries for this person yet.</p>}
          {selfEntries.map((e) => (
            <div key={e.id} className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="m-0 text-sm font-semibold text-indigo-900">
                {e.roleChangeType.replace("_", " ")} · disruption: {e.disruptionClass}
              </p>
              <p className="mt-1 text-sm text-indigo-800">{e.rationale}</p>
              {e.supportPlan && (
                <p className="mt-1 text-sm text-indigo-700">
                  <strong>Support offered:</strong> {e.supportPlan.name} — {e.supportPlan.description}
                </p>
              )}
              <p className="mt-2 text-xs text-indigo-500">{e.visibilityNote}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Org-wide view (post-announcement reveal)</h2>
        <select
          value={selectedRunId}
          onChange={(e) => loadOrgWide(Number(e.target.value))}
          className="mt-3 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Choose a simulation run…</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} — {r.label} ({r.humanImpactSummary.totalAffected} affected)
            </option>
          ))}
        </select>
        {orgWide && (
          <div className="mt-4">
            <p className="text-sm text-slate-600">{orgWide.note}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(orgWide.aggregate.byDisruptionClass).map(([k, v]) => (
                <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  {k}: {v}
                </span>
              ))}
            </div>
            {!orgWide.announced && (
              <button onClick={announce} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                Announce org-wide now
              </button>
            )}
            {announceMsg && <p className="mt-2 text-sm text-emerald-700">{announceMsg}</p>}
            {orgWide.announced && Array.isArray(orgWide.entries) && (
              <div className="mt-4 space-y-2">
                {(orgWide.entries as { personName: string; roleChangeType: string; disruptionClass: string }[]).map((e, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    {e.personName} — {e.roleChangeType.replace("_", " ")} ({e.disruptionClass})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Privacy attempt-matrix self-check</h2>
        <p className="mt-1 text-sm text-slate-500">Enter a human-impact entry id to verify who can see it, and whether that matches policy.</p>
        <div className="mt-3 flex gap-2">
          <input value={privacyEntryId} onChange={(e) => setPrivacyEntryId(e.target.value)} placeholder="entry id" className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button onClick={runPrivacyCheck} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Run matrix
          </button>
        </div>
        {privacyResult && (
          <div className="mt-4">
            <p className={`text-sm font-semibold ${privacyResult.allPass ? "text-emerald-700" : "text-rose-700"}`}>
              {privacyResult.allPass ? "All attempts match policy ✅" : "Policy mismatch detected ❌"}
            </p>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1">Attempt</th>
                  <th className="py-1">Allowed</th>
                  <th className="py-1">Expected</th>
                  <th className="py-1">Pass</th>
                </tr>
              </thead>
              <tbody>
                {privacyResult.matrix.map((m) => (
                  <tr key={m.label} className="border-t border-slate-100">
                    <td className="py-1">{m.label}</td>
                    <td className="py-1">{String(m.allowed)}</td>
                    <td className="py-1">{String(m.expected)}</td>
                    <td className="py-1">{m.pass ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
