"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface ColDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (value: unknown, row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: ColDef<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  filterable?: boolean;
  getRowId?: (row: T, index: number) => string | number;
  emptyLabel?: string;
}

function getValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

export default function DataTable<T>({
  columns,
  rows,
  onRowClick,
  loading = false,
  filterable = true,
  getRowId,
  emptyLabel = "No records found.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(getValue(row, col.key) ?? "").toLowerCase().includes(q))
    );
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {filterable && (
        <div className="flex items-center gap-2">
          <div
            className="flex w-64 items-center gap-2 rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5" stroke="var(--text-tertiary)" strokeWidth="1.5" />
              <path d="M11 11L14.5 14.5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter rows…"
              className="w-full bg-transparent focus-visible:outline-none"
              style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}
            />
          </div>
          <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>
            {sorted.length} of {rows.length}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-default)" }}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: "var(--bg-surface)" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  className="select-none whitespace-nowrap border-b px-3 py-2 text-left font-medium uppercase tracking-wide"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--fs-xs)",
                    width: col.width,
                    textAlign: col.align ?? "left",
                    cursor: col.sortable ? "pointer" : "default",
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      <div className="skeleton h-3.5 w-full max-w-[140px] rounded" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && sorted.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center"
                  style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}
                >
                  {emptyLabel}
                </td>
              </tr>
            )}

            {!loading &&
              sorted.map((row, i) => (
                <tr
                  key={getRowId ? getRowId(row, i) : i}
                  onClick={() => onRowClick?.(row)}
                  className="transition-colors"
                  style={{
                    borderTop: "1px solid var(--border-subtle)",
                    cursor: onRowClick ? "pointer" : "default",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {columns.map((col) => {
                    const val = getValue(row, col.key);
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-2.5 align-middle"
                        style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)", textAlign: col.align ?? "left" }}
                      >
                        {col.render ? col.render(val, row) : (val as ReactNode)}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
