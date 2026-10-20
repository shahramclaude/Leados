"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { VirtualList } from "./VirtualList";
import type { DailyBucket } from "@/lib/stats";

export type EventRow = {
  id: number;
  occurred_at: string;
  type: string;
  severity: string;
  source: string;
  entity_id: string | null;
  value: string;
};

type MetricsViewProps = {
  initialBuckets: DailyBucket[];
  initialEvents: EventRow[];
  initialNextCursor: { occurredAt: string; id: number } | null;
  totalEventCount: number;
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-rose-100 text-rose-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const MemoKpi = memo(Kpi);

/**
 * Client panel: KPI tiles (derived via useMemo, not recomputed on every
 * render) plus a virtualized, keyset-paginated events table. Even with the
 * full 10x dataset loaded page by page, the DOM only ever holds the rows
 * visible in the 420px viewport (+ overscan).
 */
export function MetricsView({ initialBuckets, initialEvents, initialNextCursor, totalEventCount }: MetricsViewProps) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const kpis = useMemo(() => {
    const totals = initialBuckets.reduce(
      (acc, b) => {
        acc.total += b.total;
        acc.critical += b.critical;
        acc.value += b.value;
        return acc;
      },
      { total: 0, critical: 0, value: 0 },
    );
    const avgPerDay = initialBuckets.length ? totals.total / initialBuckets.length : 0;
    return { ...totals, avgPerDay };
  }, [initialBuckets]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);

    const attempt = async (retries: number): Promise<void> => {
      try {
        const params = new URLSearchParams({
          limit: "100",
          cursorOccurredAt: cursor.occurredAt,
          cursorId: String(cursor.id),
        });
        const res = await fetch(`/api/events?${params.toString()}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setEvents((prev) => [...prev, ...data.items]);
        setCursor(data.nextCursor);
        setRetryCount(0);
      } catch (err) {
        if (retries > 0) {
          // retry with exponential backoff on transient failures
          await new Promise((resolve) => setTimeout(resolve, 2 ** (3 - retries) * 300));
          setRetryCount((r) => r + 1);
          return attempt(retries - 1);
        }
        throw err;
      }
    };

    try {
      await attempt(3);
    } catch {
      /* give up silently; the "load more" button simply remains available */
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MemoKpi label="Total events (all time)" value={totalEventCount.toLocaleString()} />
        <MemoKpi label="Events (90d)" value={kpis.total.toLocaleString()} />
        <MemoKpi label="Critical (90d)" value={kpis.critical.toLocaleString()} />
        <MemoKpi label="Avg / day" value={kpis.avgPerDay.toFixed(1)} hint={`${retryCount ? `${retryCount} retr${retryCount === 1 ? "y" : "ies"}` : ""}`} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Recent events ({events.length.toLocaleString()} loaded)</h3>
          <button
            onClick={loadMore}
            disabled={!cursor || loadingMore}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {loadingMore ? "Loading..." : cursor ? "Load 100 more" : "All loaded"}
          </button>
        </div>
        <VirtualList
          items={events}
          rowHeight={36}
          height={420}
          renderRow={(row) => (
            <div className="flex items-center gap-3 border-b border-slate-50 px-4 py-2 text-xs text-slate-600">
              <span className="w-40 shrink-0 tabular-nums text-slate-400">
                {new Date(row.occurred_at).toLocaleString()}
              </span>
              <span className="w-36 shrink-0 font-medium text-slate-700">{row.type}</span>
              <span
                className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold uppercase ${SEVERITY_BADGE[row.severity] ?? "bg-slate-100 text-slate-600"}`}
              >
                {row.severity}
              </span>
              <span className="flex-1 truncate text-slate-400">{row.entity_id ?? "—"}</span>
              <span className="w-20 shrink-0 text-right tabular-nums">{Number(row.value).toFixed(0)}</span>
            </div>
          )}
        />
      </div>
    </div>
  );
}

export default MetricsView;
