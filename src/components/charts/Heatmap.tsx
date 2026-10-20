"use client";

import { memo, useMemo } from "react";
import type { DailyBucket } from "@/lib/stats";

type HeatmapProps = {
  buckets: DailyBucket[];
};

const SEVERITIES: (keyof Pick<DailyBucket, "critical" | "warning" | "info">)[] = ["critical", "warning", "info"];
const COLORS: Record<string, string> = {
  critical: "#dc2626",
  warning: "#d97706",
  info: "#0891b2",
};

/** Severity x day intensity grid. Pure SVG/DOM, memoized against bucket identity. */
function HeatmapImpl({ buckets }: HeatmapProps) {
  const cellSize = 18;
  const gap = 3;

  const maxValue = useMemo(() => {
    let max = 1;
    for (const bucket of buckets) {
      for (const severity of SEVERITIES) {
        max = Math.max(max, bucket[severity]);
      }
    }
    return max;
  }, [buckets]);

  if (buckets.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No events yet</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-[3px]">
        {SEVERITIES.map((severity) => (
          <div key={severity} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-slate-400">
              {severity}
            </span>
            <div className="flex gap-[3px]">
              {buckets.map((bucket) => {
                const intensity = bucket[severity] / maxValue;
                return (
                  <div
                    key={`${severity}-${bucket.day}`}
                    title={`${bucket.day}: ${bucket[severity]} ${severity}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: COLORS[severity],
                      opacity: 0.12 + intensity * 0.88,
                      borderRadius: 4,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <div className="ml-[72px] mt-1 flex justify-between text-[9px] text-slate-400" style={{ gap }}>
          <span>{buckets[0]?.day}</span>
          <span>{buckets[buckets.length - 1]?.day}</span>
        </div>
      </div>
    </div>
  );
}

export const Heatmap = memo(HeatmapImpl);
export default Heatmap;
