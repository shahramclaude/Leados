"use client";

import { useMemo, useRef, useState, useCallback, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => string | number;
  numeric?: boolean;
  sortable?: boolean;
  width?: number;
}

export type Density = "compact" | "comfortable" | "spacious";

const ROW_HEIGHT: Record<Density, number> = { compact: 32, comfortable: 40, spacious: 52 };
const OVERSCAN = 6;

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  density?: Density;
  /** When set, rows are windowed to this viewport height (px) — only rows
   * intersecting the scroll window (+ overscan) are mounted. */
  viewportHeight?: number;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyMessage?: string;
  className?: string;
}

/**
 * DataTable — the single tabular-data primitive in LEADOS.
 *
 * STATE/INTERACTION CONTRACT (see docs/DESIGN-SYSTEM.md §3.1 for the full
 * prose version):
 *  - loading=true  -> renders `rows.length || 6` skeleton rows, header still
 *    sticky and visible, no sort/filter interaction (disabled, not hidden).
 *  - error         -> replaces the body with an inline error row + a Retry
 *    button calling `onRetry`; header/filter remain visible so the user
 *    does not lose their filter text.
 *  - rows.length===0 (post-filter, not loading/error) -> empty state with
 *    the exact phrase "No rows match <filter>" plus a "Clear filter" action
 *    when a filter is active, or a neutral "No data yet" when it is not.
 *  - sortable column header: aria-sort reflects state (none/ascending/
 *    descending); clicking/Enter/Space cycles asc -> desc -> none.
 *  - Keyboard grid navigation: ArrowUp/Down/Left/Right move the active
 *    cell; Home/End move to row start/end; Ctrl+Home/End move to the first/
 *    last cell in the table. Exactly one cell is in the tab order at a
 *    time (roving tabindex) — the grid itself is a single Tab stop.
 *  - Density: compact/comfortable/spacious change ROW_HEIGHT only (never
 *    font-size — the modular type scale is constant; density changes
 *    whitespace, not legibility).
 *  - Sticky header via `position: sticky; top: 0`, scoped to the table's own
 *    scroll container so it works inside any page layout.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  density = "comfortable",
  viewportHeight,
  loading = false,
  error,
  onRetry,
  emptyMessage,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null);
  const [filter, setFilter] = useState("");
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) => columns.some((col) => String(col.accessor(row)).toLowerCase().includes(q)));
  }, [rows, columns, filter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  const rowHeight = ROW_HEIGHT[density];
  const windowed = Boolean(viewportHeight);
  const totalHeight = sorted.length * rowHeight;

  const range = useMemo(() => {
    if (!windowed || !viewportHeight) return { start: 0, end: sorted.length };
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2;
    const end = Math.min(sorted.length, start + visibleCount);
    return { start, end };
  }, [windowed, viewportHeight, scrollTop, rowHeight, sorted.length]);

  function toggleSort(columnId: string) {
    setSort((prev) => {
      if (!prev || prev.columnId !== columnId) return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  }

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableElement>) => {
      const maxRow = sorted.length - 1;
      const maxCol = columns.length - 1;
      let { row, col } = activeCell;
      switch (e.key) {
        case "ArrowDown":
          row = Math.min(maxRow, row + 1);
          break;
        case "ArrowUp":
          row = Math.max(0, row - 1);
          break;
        case "ArrowRight":
          col = Math.min(maxCol, col + 1);
          break;
        case "ArrowLeft":
          col = Math.max(0, col - 1);
          break;
        case "Home":
          col = e.ctrlKey ? 0 : 0;
          row = e.ctrlKey ? 0 : row;
          break;
        case "End":
          col = e.ctrlKey ? maxCol : maxCol;
          row = e.ctrlKey ? maxRow : row;
          break;
        default:
          return;
      }
      e.preventDefault();
      setActiveCell({ row, col });
    },
    [activeCell, sorted.length, columns.length],
  );

  const skeletonRowCount = rows.length > 0 ? Math.min(rows.length, 6) : 6;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <Input
          label={`Filter ${caption}`}
          hideLabel
          placeholder={`Filter ${caption}…`}
          value={filter}
          disabled={loading || Boolean(error)}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)]"
        style={viewportHeight ? { maxHeight: viewportHeight } : undefined}
        onScroll={windowed ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      >
        <table role="grid" aria-label={caption} className="w-full border-collapse" onKeyDown={onKeyDown}>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.columnId === col.id;
                const ariaSort = isSorted ? (sort!.direction === "asc" ? "ascending" : "descending") : "none";
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={col.sortable ? (ariaSort as "ascending" | "descending" | "none") : undefined}
                    style={{ width: col.width }}
                    className={cn(
                      "sticky top-0 z-10 border-b border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-left",
                      "text-[var(--text-sm)] font-semibold text-[var(--text-secondary)]",
                      col.numeric && "text-right",
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        disabled={loading || Boolean(error)}
                        className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] disabled:opacity-50"
                      >
                        {col.header}
                        <span aria-hidden className="text-[var(--text-muted)]">
                          {isSorted ? (sort!.direction === "asc" ? "▲" : "▼") : "↕"}
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
            {loading && (
              <>
                {Array.from({ length: skeletonRowCount }).map((_, i) => (
                  <tr key={`skeleton-${i}`} style={{ height: rowHeight }}>
                    {columns.map((col) => (
                      <td key={col.id} className="px-3 py-2">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center">
                  <p className="text-[var(--text-base)] font-medium text-[var(--danger-ink)]">{error}</p>
                  {onRetry && (
                    <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
                      Retry
                    </Button>
                  )}
                </td>
              </tr>
            )}

            {!loading && !error && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-[var(--text-sm)] text-[var(--text-muted)]">
                  {filter.trim() ? (
                    <>
                      {emptyMessage ?? `No rows match "${filter}".`}{" "}
                      <button type="button" onClick={() => setFilter("")} className="font-medium text-[var(--text-link)] hover:underline">
                        Clear filter
                      </button>
                    </>
                  ) : (
                    emptyMessage ?? "No data yet."
                  )}
                </td>
              </tr>
            )}

            {!loading && !error && sorted.length > 0 && (
              <>
                {windowed && range.start > 0 && (
                  <tr aria-hidden style={{ height: range.start * rowHeight }}>
                    <td colSpan={columns.length} />
                  </tr>
                )}
                {sorted.slice(range.start, range.end).map((row, i) => {
                  const rIndex = range.start + i;
                  return (
                    <tr key={rowKey(row)} style={{ height: rowHeight }} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-sunken)]">
                      {columns.map((col, cIndex) => {
                        const isActive = activeCell.row === rIndex && activeCell.col === cIndex;
                        return (
                          <td
                            key={col.id}
                            role="gridcell"
                            tabIndex={isActive ? 0 : -1}
                            data-metric={col.numeric || undefined}
                            onFocus={() => setActiveCell({ row: rIndex, col: cIndex })}
                            className={cn(
                              "px-3 py-2 text-[var(--text-base)] text-[var(--text-primary)] focus-visible:bg-[var(--domain-strategy-tint)]",
                              col.numeric && "text-right tabular-nums",
                            )}
                          >
                            {col.accessor(row)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {windowed && range.end < sorted.length && (
                  <tr aria-hidden style={{ height: (sorted.length - range.end) * rowHeight }}>
                    <td colSpan={columns.length} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[var(--text-sm)] tabular-nums text-[var(--text-muted)]">
        {sorted.length} of {rows.length} rows{windowed ? ` · virtualized (${totalHeight}px total)` : ""}
      </p>
    </div>
  );
}
