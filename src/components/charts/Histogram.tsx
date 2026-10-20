"use client";
// src/components/charts/Histogram.tsx
//
// Dependency-free SVG histogram. Deliberately hand-rolled instead of
// pulling in a charting library — see docs/PERFORMANCE.md "Bundle
// discipline" for the measured bundle-size difference. Always loaded via
// next/dynamic (see MetricsClient.tsx) so it is never part of the route's
// initial JS even though it is this small.
import type { HistogramBucket } from "@/lib/stats";

export default function Histogram({ data, color = "#2563eb" }: { data: HistogramBucket[]; color?: string }) {
  if (data.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 480;
  const height = 180;
  const barWidth = width / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full" role="img" aria-label="Outcome histogram">
      {data.map((bucket, i) => {
        const barHeight = (bucket.count / max) * (height - 20);
        return (
          <g key={bucket.bucketStart}>
            <rect
              x={i * barWidth + 2}
              y={height - barHeight - 16}
              width={Math.max(1, barWidth - 4)}
              height={barHeight}
              fill={color}
              opacity={0.8}
              rx={2}
            />
            {i % Math.ceil(data.length / 8 || 1) === 0 && (
              <text x={i * barWidth + barWidth / 2} y={height - 2} fontSize={9} textAnchor="middle" fill="#64748b">
                {bucket.bucketStart}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
