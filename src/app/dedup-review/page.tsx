"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MatchRule {
  rule: string;
  weight: number;
  contribution: number;
  detail: string;
}

interface CandidateRow {
  candidate: {
    id: string;
    entityId: string;
    rawRecordId: string;
    score: string;
    matchedRules: MatchRule[];
    status: string;
    decidedBy: string | null;
    decidedAt: string | null;
    createdAt: string;
  };
  entity: { id: string; goldenRecord: Record<string, unknown> } | null;
  rawRecord: { id: string; normalized: Record<string, unknown> } | null;
}

export default function DedupReviewPage() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/dedup?status=${status}`);
    const data = await res.json();
    setRows(data.candidates ?? []);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(id: string, action: "confirm" | "reject" | "undo") {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/dedup/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, actor: "user:dedup-review" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setMessage(`${action} succeeded for candidate ${id}.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Dedup Review</h1>
        <Link href="/" className="text-sm text-slate-500 underline">
          ← Back
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {["pending", "confirmed", "rejected", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-sm ${status === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {message && <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>}

      <div className="grid gap-4">
        {rows.map(({ candidate, entity, rawRecord }) => (
          <section key={candidate.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                Candidate match — score {(Number(candidate.score) * 100).toFixed(0)}%
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  candidate.status === "pending" ? "bg-amber-100 text-amber-800" : candidate.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {candidate.status}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="mb-1 font-medium text-slate-700">Existing entity ({entity?.id ?? "?"})</p>
                <pre className="overflow-auto">{JSON.stringify(entity?.goldenRecord, null, 2)}</pre>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="mb-1 font-medium text-slate-700">Incoming record ({rawRecord?.id ?? "?"})</p>
                <pre className="overflow-auto">{JSON.stringify(rawRecord?.normalized, null, 2)}</pre>
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-slate-700">Evidence (weighted match rules)</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {candidate.matchedRules.map((r, i) => (
                  <li key={i}>
                    {r.rule}: contributed {(r.contribution * 100).toFixed(1)} pts (weight {(r.weight * 100).toFixed(0)}%) — {r.detail}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {candidate.status === "pending" && (
                <>
                  <button
                    disabled={busyId === candidate.id}
                    onClick={() => act(candidate.id, "confirm")}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Confirm merge
                  </button>
                  <button
                    disabled={busyId === candidate.id}
                    onClick={() => act(candidate.id, "reject")}
                    className="rounded-lg bg-slate-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Reject (keep separate)
                  </button>
                </>
              )}
              {candidate.status === "confirmed" && (
                <button
                  disabled={busyId === candidate.id}
                  onClick={() => act(candidate.id, "undo")}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  Undo merge (7-day window)
                </button>
              )}
              {candidate.decidedBy && (
                <span className="self-center text-xs text-slate-400">
                  decided by {candidate.decidedBy} at {candidate.decidedAt ? new Date(candidate.decidedAt).toLocaleString() : ""}
                </span>
              )}
            </div>
          </section>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">No {status} candidates.</p>}
      </div>
    </main>
  );
}
