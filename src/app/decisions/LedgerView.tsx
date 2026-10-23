"use client";

import { useState, useTransition } from "react";

type Decision = {
  id: string;
  subjectType: string;
  subjectId: string | null;
  title: string;
  rationale: string;
  outcome: string;
  confidence: number;
  confidenceLabel: string;
  evidence: unknown[];
  actor: string;
  prevHash: string | null;
  hash: string;
  createdAt: string;
};

type Verification = { valid: boolean; checkedCount: number; brokenAt: string | null };

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function LedgerView({ initialDecisions }: { initialDecisions: Decision[] }) {
  const [list] = useState<Decision[]>(initialDecisions);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [isPending, startTransition] = useTransition();

  function runVerification() {
    startTransition(async () => {
      const res = await fetch("/api/decisions/verify");
      const data = await res.json();
      setVerification(data);
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-900">Chain integrity check</p>
          <p className="text-xs text-slate-500">
            Recomputes every hash from stored content and compares it against
            what is on record.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {verification ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                verification.valid
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {verification.valid
                ? `Verified (${verification.checkedCount} entries)`
                : `Broken at ${verification.brokenAt}`}
            </span>
          ) : null}
          <button
            onClick={runVerification}
            disabled={isPending}
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Verifying…" : "Verify chain"}
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No decisions recorded yet.
        </p>
      ) : (
        <ol className="space-y-3 border-l-2 border-slate-200 pl-6">
          {list.map((decision) => (
            <li key={decision.id} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="absolute -left-[31px] top-5 h-3 w-3 rounded-full bg-indigo-500" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{decision.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{decision.rationale}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  {decision.outcome}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  {decision.confidenceLabel} · {decision.confidence}%
                </span>
                <span>actor: {decision.actor}</span>
                <span>{new Date(decision.createdAt).toLocaleString()}</span>
                <span className="font-mono">hash: {shortHash(decision.hash)}</span>
                <span className="font-mono">
                  prev: {decision.prevHash ? shortHash(decision.prevHash) : "genesis"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
