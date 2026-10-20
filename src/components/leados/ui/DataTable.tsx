"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { EmptyState } from "./EmptyState";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  filterValue?: (row: T) => string;
  width?: number;
  minWidth?: number;
  align?: "left" | "right";
  numeric?: boolean;
}

export interface DataTableProps<T> {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowActivate?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rows above this count are windowed; keeps very large tables smooth
   * while small tables (the common case) render normally with no
   * virtualization overhead. */
  virtualizeThreshold?: number;
  rowHeight?: number;
}

type SortState = { columnId: string; direction: "asc" | "desc" } | null;

/**
 * DataTable: sortable headers, global filter, column visibility toggle,
 * draggable column resize, windowed rendering past `virtualizeThreshold`
 * rows, and roving keyboard navigation (arrow keys move the active row,
 * Enter activates it). Headers stay sticky on scroll.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  onRowActivate,
  emptyTitle = "No rows match",
  emptyDescription = "Try clearing filters or widening your search.",
  virtualizeThreshold = 150,
  rowHeight = 44,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [activeRow, setActiveRow] = useState(0);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleColumns = columns.filter((c) => !hidden.has(c.id));

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((row) =>
      columns.some((c) => {
        const text = c.filterValue ? c.filterValue(row) : String(c.accessor(row) ?? "");
        return text.toLowerCase().includes(q);
      }),
    );
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  const virtualize = sorted.length > virtualizeThreshold;
  const containerHeight = Math.min(sorted.length, 14) * rowHeight;
  const overscan = 6;
  const startIndex = virtualize ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const visibleCount = virtualize ? Math.ceil(containerHeight / rowHeight) + overscan * 2 : sorted.length;
  const endIndex = virtualize ? Math.min(sorted.length, startIndex + visibleCount) : sorted.length;
  const windowRows = sorted.slice(startIndex, endIndex);
  const topSpacer = virtualize ? startIndex * rowHeight : 0;
  const bottomSpacer = virtualize ? (sorted.length - endIndex) * rowHeight : 0;

  function toggleSort(columnId: string) {
    setSort((prev) => {
      if (!prev || prev.columnId !== columnId) return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  }

  function onHeaderResizeStart(e: React.MouseEvent, columnId: string, currentWidth: number) {
    e.preventDefault();
    const startX = e.clientX;
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      setWidths((w) => ({ ...w, [columnId]: Math.max(60, currentWidth + delta) }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onBodyKeyDown(e: React.KeyboardEvent) {
    if (sorted.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveRow((i) => Math.min(sorted.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveRow((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveRow(sorted.length - 1);
    } else if (e.key === "Enter" && onRowActivate) {
      e.preventDefault();
      onRowActivate(sorted[activeRow]);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <label className="flex items-center gap-[var(--space-2)]">
          <span className="sr-only">Filter {caption}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveRow(0);
            }}
            placeholder="Filter rows…"
            className="h-[var(--control-height-sm)] w-56 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-[var(--space-2)] text-[var(--text-xs)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
          />
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsMenuOpen((v) => !v)}
            aria-expanded={columnsMenuOpen}
            aria-haspopup="true"
            className="h-[var(--control-height-sm)] rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-[var(--space-2)] text-[var(--text-xs)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
          >
            Columns
          </button>
          {columnsMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 flex w-48 flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-[var(--space-2)] shadow-[var(--shadow-md)]">
              {columns.map((c) => (
                <label key={c.id} className="flex items-center gap-[var(--space-2)] text-[var(--text-xs)]">
                  <input
                    type="checkbox"
                    checked={!hidden.has(c.id)}
                    onChange={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div
          ref={scrollRef}
          onScroll={(e) => virtualize && setScrollTop(e.currentTarget.scrollTop)}
          className="leados-scroll overflow-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)]"
          style={{ maxHeight: virtualize ? containerHeight + 40 : undefined }}
        >
          <table className="w-full border-collapse text-[var(--text-sm)]">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
              <tr style={{ height: "var(--table-header-height)" }}>
                {visibleColumns.map((c) => {
                  const sortActive = sort?.columnId === c.id;
                  return (
                    <th
                      key={c.id}
                      scope="col"
                      style={{ width: widths[c.id] ?? c.width, minWidth: c.minWidth ?? 80 }}
                      className={cx(
                        "relative border-b border-[var(--border-subtle)] px-[var(--space-3)] text-left text-[var(--text-xs)] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]",
                        c.align === "right" && "text-right",
                      )}
                    >
                      {c.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.id)}
                          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          {c.header}
                          <span aria-hidden>{sortActive ? (sort!.direction === "asc" ? "↑" : "↓") : "↕"}</span>
                          <span className="sr-only">{sortActive ? `sorted ${sort!.direction}ending` : "not sorted"}</span>
                        </button>
                      ) : (
                        c.header
                      )}
                      <span
                        role="presentation"
                        onMouseDown={(e) => onHeaderResizeStart(e, c.id, widths[c.id] ?? c.width ?? 160)}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-[var(--accent-default)]"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody tabIndex={0} onKeyDown={onBodyKeyDown} aria-activedescendant={`row-${activeRow}`}>
              {topSpacer > 0 && (
                <tr aria-hidden style={{ height: topSpacer }}>
                  <td colSpan={visibleColumns.length} />
                </tr>
              )}
              {windowRows.map((row, i) => {
                const index = startIndex + i;
                const isActive = index === activeRow;
                return (
                  <tr
                    id={`row-${index}`}
                    key={getRowId(row)}
                    onClick={() => setActiveRow(index)}
                    onDoubleClick={() => onRowActivate?.(row)}
                    style={{ height: rowHeight }}
                    className={cx(
                      "cursor-default border-b border-[var(--border-subtle)] last:border-0",
                      isActive ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    {visibleColumns.map((c) => (
                      <td
                        key={c.id}
                        className={cx("px-[var(--space-3)] text-[var(--text-sm)] text-[var(--text-primary)]", c.align === "right" && "text-right", c.numeric && "font-mono-nums")}
                      >
                        {c.accessor(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {bottomSpacer > 0 && (
                <tr aria-hidden style={{ height: bottomSpacer }}>
                  <td colSpan={visibleColumns.length} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[var(--text-xs)] text-[var(--text-muted)]">
        {sorted.length} of {rows.length} rows · Enter activates the focused row · Arrow keys move selection
      </p>
    </div>
  );
}
