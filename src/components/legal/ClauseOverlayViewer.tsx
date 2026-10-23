"use client";

import { useMemo, useState } from "react";
import { CLAUSE_TYPE_LABELS, type ClauseType } from "@/lib/legal/clauseTypes";
import { StatusBadge } from "@/components/StatusBadge";

export interface ViewerClause {
  id: number;
  clauseType: string;
  spanStart: number;
  spanEnd: number;
  excerptText: string;
  confidence: number;
  extractionMethod: string;
  status: string;
  confirmedBy: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  term: "bg-sky-200",
  renewal: "bg-emerald-200",
  termination: "bg-rose-200",
  sla: "bg-amber-200",
  indemnity: "bg-purple-200",
  liability_cap: "bg-orange-200",
  change_of_control: "bg-red-300",
  data_protection: "bg-teal-200",
};

export function ClauseOverlayViewer({
  rawText,
  initialClauses,
}: {
  rawText: string;
  initialClauses: ViewerClause[];
}) {
  const [clauses, setClauses] = useState(initialClauses);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const segments = useMemo(() => {
    const sorted = [...clauses].sort((a, b) => a.spanStart - b.spanStart);
    const parts: Array<{ text: string; clause?: ViewerClause }> = [];
    let cursor = 0;
    for (const c of sorted) {
      if (c.spanStart > cursor) parts.push({ text: rawText.slice(cursor, c.spanStart) });
      parts.push({ text: rawText.slice(c.spanStart, c.spanEnd), clause: c });
      cursor = c.spanEnd;
    }
    if (cursor < rawText.length) parts.push({ text: rawText.slice(cursor) });
    return parts;
  }, [rawText, clauses]);

  async function act(clauseId: number, action: "confirm" | "reject") {
    setBusyId(clauseId);
    try {
      const res = await fetch(`/api/legal/clauses/${clauseId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedBy: "ui-reviewer@leados.example" }),
      });
      const data = await res.json();
      if (res.ok && data.clause) {
        setClauses((prev) => prev.map((c) => (c.id === clauseId ? { ...c, ...data.clause } : c)));
      } else {
        alert(data.error ?? "Action failed");
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-6 font-mono text-sm leading-relaxed text-slate-800">
        {segments.map((seg, i) =>
          seg.clause ? (
            <mark
              key={i}
              className={`cursor-pointer rounded px-0.5 ${TYPE_COLORS[seg.clause.clauseType] ?? "bg-slate-200"} ${
                seg.clause.status === "rejected" ? "opacity-40 line-through" : ""
              } ${selected === seg.clause.id ? "ring-2 ring-slate-900" : ""}`}
              onClick={() => setSelected(seg.clause!.id)}
              title={`${seg.clause.clauseType} — span [${seg.clause.spanStart}, ${seg.clause.spanEnd}) — ${seg.clause.status}`}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Extracted clauses ({clauses.length}) — human confirmation required
        </h3>
        {clauses
          .slice()
          .sort((a, b) => a.spanStart - b.spanStart)
          .map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-3 text-sm ${selected === c.id ? "border-slate-900" : "border-slate-200"}`}
              onMouseEnter={() => setSelected(c.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {CLAUSE_TYPE_LABELS[c.clauseType as ClauseType] ?? c.clauseType}
                </span>
                <StatusBadge status={c.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                span [{c.spanStart}, {c.spanEnd}) · confidence {c.confidence.toFixed(2)} · method {c.extractionMethod}
              </p>
              {c.confirmedBy && <p className="mt-1 text-xs text-slate-500">by {c.confirmedBy}</p>}
              {c.status === "draft" && (
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, "confirm")}
                    className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, "reject")}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        {clauses.length === 0 && <p className="text-sm text-slate-500">No clauses extracted yet.</p>}
      </div>
    </div>
  );
}
