"use client";

import { useEffect, useState } from "react";

interface Decision {
  id: string;
  sequence: number;
  entityType: string;
  entityId: string;
  action: string;
  rationale: string;
  prevHash: string;
  hash: string;
  createdAt: string;
}

interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAtSequence: number | null;
  reason: string | null;
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/decisions");
    const data = await res.json();
    setDecisions(data.decisions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function verify() {
    setVerifying(true);
    setVerifyResult(null);
    const res = await fetch("/api/decisions/verify");
    const data = await res.json();
    setVerifyResult(data);
    setVerifying(false);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Evidence ledger</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Every score and stage change is appended as a SHA-256 hash-chained record. Recompute the
            chain to confirm nothing has been altered.
          </p>
        </div>
        <button
          onClick={verify}
          disabled={verifying}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {verifying ? "Verifying…" : "Verify chain"}
        </button>
      </div>

      {verifyResult && (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            verifyResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {verifyResult.ok ? (
            <p>✅ Chain verified: {verifyResult.checked} records, no tampering detected.</p>
          ) : (
            <p>
              ❌ Chain broken at sequence #{verifyResult.brokenAtSequence}: {verifyResult.reason}
            </p>
          )}
        </div>
      )}

      <div className="mt-8 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading ledger…</p>}
        {!loading && decisions.length === 0 && (
          <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            No decisions recorded yet.
          </p>
        )}
        {decisions.map((d) => (
          <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-950">
                #{d.sequence} · {d.action}{" "}
                <span className="font-normal text-slate-500">
                  ({d.entityType} {d.entityId.slice(0, 8)})
                </span>
              </p>
              <p className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleString()}</p>
            </div>
            <p className="mt-2 text-sm text-slate-700">{d.rationale}</p>
            <div className="mt-3 grid grid-cols-1 gap-1 font-mono text-[11px] text-slate-400 sm:grid-cols-2">
              <p className="truncate">prev: {d.prevHash}</p>
              <p className="truncate">hash: {d.hash}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
