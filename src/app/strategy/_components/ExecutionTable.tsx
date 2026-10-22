"use client";

import { useMemo, useState } from "react";

export interface ExecutionRow {
  id: string;
  title: string;
  status: string;
  blockerNote: string | null;
  wsjf: number;
  rank: number;
  teamName: string | null;
  budgetAllocated: number;
  budgetSpent: number;
  p50: string | null;
  p80: string | null;
  p95: string | null;
  objectiveTitle: string;
  objectiveId: string;
}

type SortKey = "rank" | "wsjf" | "budgetSpent" | "p50" | "status";

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-50 text-sky-700",
  blocked: "bg-rose-50 text-rose-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-400",
};

// Simple windowed rendering ("virtualized-lite"): only render the first
// `pageSize` rows and let the user load more, which keeps the DOM small for
// large portfolios without pulling in a virtualization dependency.
const PAGE_SIZE = 25;

export function ExecutionTable({ rows }: { rows: ExecutionRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "p50") {
        cmp = (a.p50 ? new Date(a.p50).getTime() : Infinity) - (b.p50 ? new Date(b.p50).getTime() : Infinity);
      } else if (sortKey === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = sorted.slice(0, visibleCount);

  const headers: { key: SortKey; label: string }[] = [
    { key: "rank", label: "WSJF Rank" },
    { key: "wsjf", label: "WSJF" },
    { key: "status", label: "Status" },
    { key: "budgetSpent", label: "Budget burn" },
    { key: "p50", label: "P50 delivery" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Initiative</th>
            {headers.map((h) => (
              <th key={h.key} className="cursor-pointer select-none px-4 py-3" onClick={() => toggleSort(h.key)}>
                {h.label} {sortKey === h.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
            ))}
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3">Blocker</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id} className="border-t border-slate-100 align-top">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{row.title}</div>
                <div className="text-xs text-slate-500">→ {row.objectiveTitle}</div>
                <a href={`/strategy/map#${row.objectiveId}`} className="text-xs text-indigo-600 hover:underline">
                  View evidence
                </a>
              </td>
              <td className="px-4 py-3">#{row.rank}</td>
              <td className="px-4 py-3">{row.wsjf.toFixed(2)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[row.status] ?? ""}`}>
                  {row.status.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-3">
                ${row.budgetSpent.toLocaleString()} / ${row.budgetAllocated.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                {row.p50 ? (
                  <div>
                    <div>{new Date(row.p50).toLocaleDateString()}</div>
                    <div className="text-xs text-slate-500">
                      P80 {row.p80 ? new Date(row.p80).toLocaleDateString() : "—"} · P95{" "}
                      {row.p95 ? new Date(row.p95).toLocaleDateString() : "—"}
                    </div>
                  </div>
                ) : (
                  "No milestones"
                )}
              </td>
              <td className="px-4 py-3">{row.teamName ?? "Unassigned"}</td>
              <td className="px-4 py-3 text-rose-600">{row.blockerNote ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visibleCount < sorted.length && (
        <div className="border-t border-slate-100 p-3 text-center">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Load {Math.min(PAGE_SIZE, sorted.length - visibleCount)} more of {sorted.length - visibleCount} remaining
          </button>
        </div>
      )}
    </div>
  );
}
