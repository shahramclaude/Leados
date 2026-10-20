"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Input } from "./Input";
import { DropdownMenu } from "./DropdownMenu";
import { Button } from "./Button";
import { EmptyState } from "./States";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  numeric?: boolean;
  defaultWidth?: number;
  filterValue?: (row: T) => string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowId: (row: T) => string;
  onRowActivate?: (row: T) => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Switch on virtualization once row count passes this threshold (default 30). */
  virtualizeThreshold?: number;
  rowHeight?: number;
  caption: string;
}

type SortDir = "asc" | "desc" | null;

/**
 * DataTable: sort, global filter, column visibility, column resize,
 * row-level keyboard navigation (roving tabindex + Enter to activate),
 * and viewport virtualization for large row counts.
 */
export function DataTable<T>({
  columns,
  rows,
  rowId,
  onRowActivate,
  searchPlaceholder = "Filter rows…",
  emptyTitle = "No matching rows",
  emptyDescription = "Try clearing filters or search terms.",
  virtualizeThreshold = 30,
  rowHeight = 44,
  caption,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.defaultWidth ?? 160])),
  );
  const [activeRow, setActiveRow] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const resizeState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const value = col.filterValue ? col.filterValue(row) : String(col.render(row));
        return value.toLowerCase().includes(q);
      }),
    );
  }, [rows, query, columns]);

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return filteredRows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filteredRows;
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filteredRows, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  function onHeaderResizeStart(key: string, event: React.PointerEvent) {
    resizeState.current = { key, startX: event.clientX, startWidth: widths[key] };
    function onMove(moveEvent: PointerEvent) {
      if (!resizeState.current) return;
      const delta = moveEvent.clientX - resizeState.current.startX;
      setWidths((prev) => ({ ...prev, [resizeState.current!.key]: Math.max(80, resizeState.current!.startWidth + delta) }));
    }
    function onUp() {
      resizeState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const virtualize = sortedRows.length > virtualizeThreshold;
  const containerHeight = Math.min(sortedRows.length, 12) * rowHeight;
  const overscan = 4;
  const startIndex = virtualize ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const endIndex = virtualize
    ? Math.min(sortedRows.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan)
    : sortedRows.length;
  const renderedRows = sortedRows.slice(startIndex, endIndex);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (sortedRows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveRow((i) => Math.min(sortedRows.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveRow((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      const row = sortedRows[activeRow];
      if (row) onRowActivate?.(row);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          aria-label="Filter table rows"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="sm"
          className="w-56"
        />
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {sortedRows.length} of {rows.length}
          </span>
          <DropdownMenu
            align="end"
            trigger={({ onClick, ref, open }) => (
              <Button ref={ref} size="sm" variant="outline" onClick={onClick} aria-expanded={open}>
                Columns
              </Button>
            )}
            items={columns.map((col) => ({
              id: col.key,
              label: `${hiddenCols.has(col.key) ? "Show" : "Hide"} ${col.header}`,
              onSelect: () =>
                setHiddenCols((prev) => {
                  const next = new Set(prev);
                  if (next.has(col.key)) next.delete(col.key);
                  else next.add(col.key);
                  return next;
                }),
            }))}
          />
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div
          ref={viewportRef}
          role="table"
          aria-label={caption}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onScroll={(e) => virtualize && setScrollTop(e.currentTarget.scrollTop)}
          className="overflow-auto rounded-[var(--radius-md)] border border-border-subtle focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]"
          style={{ maxHeight: virtualize ? containerHeight + rowHeight : undefined }}
        >
          <div role="rowgroup" className="sticky top-0 z-10 flex bg-surface-sunken" style={{ height: "var(--comp-table-row-height)" }}>
            {visibleColumns.map((col) => (
              <div
                key={col.key}
                role="columnheader"
                aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                className="relative flex shrink-0 items-center gap-1 border-r border-border-subtle px-[var(--comp-table-cell-pad-x)] text-xs font-semibold uppercase tracking-wide text-text-muted last:border-r-0"
                style={{ width: widths[col.key] }}
              >
                {col.sortValue ? (
                  <button type="button" onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-text-primary">
                    {col.header}
                    <span aria-hidden="true" className="text-[10px]">
                      {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                ) : (
                  <span>{col.header}</span>
                )}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={(e) => onHeaderResizeStart(col.key, e)}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                />
              </div>
            ))}
          </div>

          <div role="rowgroup" style={virtualize ? { height: sortedRows.length * rowHeight, position: "relative" } : undefined}>
            <div style={virtualize ? { position: "absolute", top: startIndex * rowHeight, left: 0, right: 0 } : undefined}>
              {renderedRows.map((row, i) => {
                const absoluteIndex = startIndex + i;
                const isActive = absoluteIndex === activeRow;
                return (
                  <div
                    key={rowId(row)}
                    role="row"
                    tabIndex={-1}
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveRow(absoluteIndex);
                      onRowActivate?.(row);
                    }}
                    className={[
                      "flex cursor-pointer border-b border-border-subtle text-[length:var(--comp-table-font-size)] last:border-b-0",
                      isActive ? "bg-accent-subtle" : "hover:bg-surface-sunken",
                    ].join(" ")}
                    style={{ height: rowHeight }}
                  >
                    {visibleColumns.map((col) => (
                      <div
                        key={col.key}
                        role="cell"
                        className={[
                          "flex shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap px-[var(--comp-table-cell-pad-x)] text-text-primary",
                          col.numeric ? "justify-end font-mono tabular-nums" : "",
                        ].join(" ")}
                        style={{ width: widths[col.key] }}
                      >
                        {col.render(row)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
