"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PersonRow {
  id: string;
  name: string;
  role: string;
  team: string;
  riskScore: number;
  managerName: string | null;
}

const ROW_HEIGHT = 36;
const VIEWPORT_HEIGHT = 420;
const PAGE_SIZE = 50;
const OVERSCAN = 6;

/**
 * Hand-rolled list virtualization (no react-window dependency, to keep the
 * initial bundle small — see perf-budgets.json). Only renders the rows
 * intersecting the scrolled viewport plus an overscan buffer, regardless of
 * how many of the 5,000 (10x) rows have been paged in. Backed by
 * `/api/people`, which is itself paginated and index-backed server-side —
 * this component never requests more than `PAGE_SIZE` rows per fetch.
 */
export function PeopleTable() {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const loadedOffsets = useRef(new Set<number>());

  const loadPage = useCallback(async (offset: number) => {
    if (loadedOffsets.current.has(offset)) return;
    loadedOffsets.current.add(offset);
    setLoading(true);
    try {
      const res = await fetch(`/api/people?limit=${PAGE_SIZE}&offset=${offset}`);
      const page = await res.json();
      setTotal(page.total);
      setRows((prev) => {
        const next = [...prev];
        page.items.forEach((item: PersonRow, i: number) => {
          next[offset + i] = item;
        });
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const lastVisible = Math.min(
    Math.max(total, rows.length),
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );

  useEffect(() => {
    const neededPage = Math.floor(firstVisible / PAGE_SIZE) * PAGE_SIZE;
    const lastPage = Math.floor(lastVisible / PAGE_SIZE) * PAGE_SIZE;
    for (let p = neededPage; p <= lastPage; p += PAGE_SIZE) {
      if (p < total || total === 0) loadPage(p);
    }
  }, [firstVisible, lastVisible, total, loadPage]);

  const visibleRows = [];
  for (let i = firstVisible; i < lastVisible; i++) {
    visibleRows.push({ index: i, row: rows[i] });
  }

  return (
    <div>
      <div
        className="relative overflow-y-auto rounded border border-slate-200"
        style={{ height: VIEWPORT_HEIGHT }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
          {visibleRows.map(({ index, row }) =>
            row ? (
              <div
                key={row.id}
                className="absolute left-0 right-0 flex items-center gap-3 border-b border-slate-100 px-3 text-sm"
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <span className="w-48 truncate font-medium text-slate-800">{row.name}</span>
                <span className="w-32 truncate text-slate-500">{row.team}</span>
                <span className="w-40 truncate text-slate-500">{row.role}</span>
                <span className="w-32 truncate text-slate-500">{row.managerName ?? "—"}</span>
                <span className="ml-auto text-xs text-slate-400">risk {row.riskScore.toFixed(2)}</span>
              </div>
            ) : (
              <div
                key={`ph-${index}`}
                className="absolute left-0 right-0 animate-pulse bg-slate-50"
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT - 1 }}
              />
            ),
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {total.toLocaleString()} people total, {loading ? "loading page…" : `${rows.filter(Boolean).length.toLocaleString()} loaded`} — only
        rows in view are rendered (windowed list, {PAGE_SIZE}/page).
      </p>
    </div>
  );
}
