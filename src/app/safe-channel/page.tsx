"use client";

import { useEffect, useState } from "react";
import { ActorPickerBar, actorHeaders, useActor } from "@/components/ActorPicker";

interface CaseSummary {
  id: number;
  caseRef: string;
  category: string;
  isAnonymous: boolean;
  status: string;
  createdAt: string;
}

export default function SafeChannelPage() {
  const { actor } = useActor();
  const [reportForm, setReportForm] = useState({ category: "harassment", body: "", reporterIdentity: "" });
  const [submitResult, setSubmitResult] = useState<{ caseRef: string; lookupSecret: string; note: string } | null>(null);

  const [statusForm, setStatusForm] = useState({ caseRef: "", lookupSecret: "" });
  const [statusResult, setStatusResult] = useState<{ status: string; createdAt: string } | string | null>(null);

  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [identityAttempt, setIdentityAttempt] = useState<{ caseId: number; result: string } | null>(null);

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/safe-channel/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportForm),
    });
    const data = await res.json();
    setSubmitResult(data);
    setReportForm({ category: "harassment", body: "", reporterIdentity: "" });
  }

  async function checkStatus(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/safe-channel/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(statusForm),
    });
    const data = await res.json();
    setStatusResult(res.ok ? data.status : data.error);
  }

  async function loadCases() {
    setCasesError(null);
    const res = await fetch("/api/safe-channel/cases", { headers: actorHeaders(actor) });
    const data = await res.json();
    if (!res.ok) {
      setCasesError(data.error);
      setCases(null);
    } else {
      setCases(data.cases);
    }
  }

  async function tryIdentity(caseId: number) {
    const res = await fetch(`/api/safe-channel/cases/${caseId}/identity`, { headers: actorHeaders(actor) });
    const data = await res.json();
    setIdentityAttempt({ caseId, result: res.ok ? `Granted: ${data.identity ?? data.note}` : `Denied (${res.status}): ${data.error}` });
  }

  useEffect(() => {
    if (actor.personId != null) loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor.personId, actor.role]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-950">Safe Channel (ombudsman-grade)</h1>
        <p className="mt-2 text-sm text-slate-600">
          Reports are encrypted at rest. Reporter identity is viewable only by the ombudsman or ethics-officer
          roles — not admins, not the CEO. Every access to identity is logged, and every unauthorized attempt is
          alerted. This channel is reachable outside any management chain.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">File a report (no login required)</h2>
        <form onSubmit={submitReport} className="mt-4 space-y-3">
          <select
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={reportForm.category}
            onChange={(e) => setReportForm({ ...reportForm, category: e.target.value })}
          >
            <option value="harassment">Harassment</option>
            <option value="retaliation">Retaliation</option>
            <option value="safety">Safety</option>
            <option value="fraud">Fraud / financial</option>
            <option value="other">Other</option>
          </select>
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            rows={4}
            placeholder="Describe what happened..."
            value={reportForm.body}
            onChange={(e) => setReportForm({ ...reportForm, body: e.target.value })}
            required
          />
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Your identity (optional — leave blank to stay fully anonymous)"
            value={reportForm.reporterIdentity}
            onChange={(e) => setReportForm({ ...reportForm, reporterIdentity: e.target.value })}
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="submit">
            Submit report
          </button>
        </form>
        {submitResult && (
          <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p>
              Case reference: <strong>{submitResult.caseRef}</strong>
            </p>
            <p>
              Lookup secret: <strong>{submitResult.lookupSecret}</strong>
            </p>
            <p className="mt-1">{submitResult.note}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Check status anonymously</h2>
        <form onSubmit={checkStatus} className="mt-4 flex flex-wrap gap-3">
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Case reference"
            value={statusForm.caseRef}
            onChange={(e) => setStatusForm({ ...statusForm, caseRef: e.target.value })}
          />
          <input
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Lookup secret"
            value={statusForm.lookupSecret}
            onChange={(e) => setStatusForm({ ...statusForm, lookupSecret: e.target.value })}
          />
          <button className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white" type="submit">
            Check status
          </button>
        </form>
        {statusResult && (
          <pre className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(statusResult, null, 2)}</pre>
        )}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-slate-950">Case handling (role-restricted)</h2>
        <ActorPickerBar />
        <button onClick={loadCases} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Load cases as current actor
        </button>
        {casesError && <p className="mt-3 rounded bg-rose-50 p-3 text-sm text-rose-800">Denied: {casesError}</p>}
        {cases && (
          <div className="mt-4 space-y-3">
            {cases.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{c.caseRef}</p>
                    <p className="text-sm text-slate-600">
                      {c.category} · status: {c.status} · {c.isAnonymous ? "anonymous" : "identified"}
                    </p>
                  </div>
                  <button
                    onClick={() => tryIdentity(c.id)}
                    className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Attempt identity reveal
                  </button>
                </div>
              </div>
            ))}
            {cases.length === 0 && <p className="text-sm text-slate-500">No cases yet.</p>}
          </div>
        )}
        {identityAttempt && (
          <p className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-800">
            Case #{identityAttempt.caseId}: {identityAttempt.result}
          </p>
        )}
      </section>
    </div>
  );
}
