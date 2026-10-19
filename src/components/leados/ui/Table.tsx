"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "./utils";
import { Input } from "./Forms";
import { EmptyState } from "./Primitives";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  width?: string;
}

export interface TableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  filterRow?: (row: T, query: string) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  initialSortKey?: string;
}

/**
 * One accessible, sortable, filterable table used everywhere in LEADOS.
 * Semantics: real <table> markup with scope="col" headers, aria-sort on the
 * active column, and a visible caption — this also doubles as the "view as
 * table" fallback for every chart in Charts.tsx.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  searchable,
  searchPlaceholder = "Filter rows…",
  filterRow,
  emptyTitle = "No results",
  emptyDescription = "Try adjusting your filters.",
  onRowClick,
  initialSortKey,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query || !filterRow) return rows;
    return rows.filter((r) => filterRow(r, query));
  }, [rows, query, filterRow]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, columns, sortKey, sortDir]);

  function toggleSort(col: ColumnDef<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable ? (
        <div className="max-w-xs">
          <label htmlFor={`${caption}-search`} className="sr-only">
            {searchPlaceholder}
          </label>
          <Input id={`${caption}-search`} placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      ) : null}
      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-body-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-border bg-surface-sunken">
                {columns.map((col) => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : col.sortValue ? "none" : undefined}
                      style={{ width: col.width }}
                      className={cn(
                        "px-3.5 py-2.5 text-caption font-semibold uppercase tracking-wide text-text-tertiary",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                      )}
                    >
                      {col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className="inline-flex items-center gap-1 hover:text-text-primary"
                        >
                          {col.header}
                          <span aria-hidden="true" className="text-[0.6rem]">
                            {isSorted ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                          </span>
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter") onRowClick(row);
                        }
                      : undefined
                  }
                  className={cn(
                    "border-b border-border-subtle last:border-0",
                    onRowClick && "cursor-pointer hover:bg-surface-sunken focus-visible:bg-surface-sunken",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3.5 py-2.5 align-middle text-text-primary",
                        col.align === "right" && "text-right tabular-nums",
                        col.align === "center" && "text-center",
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
