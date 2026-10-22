"use client";

import { useMemo } from "react";

export interface HeatmapCell {
  day: string;
  count: number;
  avgImpact: number;
}

/**
 * Calendar heatmap of decision activity. The cell count is naturally bounded
 * (<= 371 cells for a year-ish window) so no virtualization is needed here —
 * the perf risk for this view is the *query*, not the render, which is why
 * the heavy lifting (GROUP BY aggregation + stale-while-revalidate caching)
 * lives in src/db/repositories/heatmap.ts. This component just memoizes the
 * color scale so re-renders from parent state changes don't re-walk the
 * array.
 */
export function Heatmap({ cells, stale, staleForMs }: { cells: HeatmapCell[]; stale?: boolean; staleForMs?: number }) {
  const maxCount = useMemo(() => Math.max(1, ...cells.map((c) => c.count)), [cells]);

  return (
    <div>
      {stale && (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          slow query — showing cached result from {Math.round((staleForMs ?? 0) / 1000)}s ago while it refreshes
        </p>
      )}
      <div className="grid grid-cols-[repeat(26,minmax(0,1fr))] gap-[2px]">
        {cells.map((cell) => {
          const intensity = cell.count / maxCount;
          return (
            <div
              key={cell.day}
              title={`${cell.day}: ${cell.count} decisions, avg impact ${cell.avgImpact.toFixed(2)}`}
              className="aspect-square rounded-[2px]"
              style={{ backgroundColor: `rgba(79, 70, 229, ${0.08 + intensity * 0.82})` }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500">{cells.length} days aggregated server-side (one GROUP BY query).</p>
    </div>
  );
}
