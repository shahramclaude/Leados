"use client";

import { useId, useState } from "react";
import type { StatusKey } from "./tokens";
import { statusColor } from "./tokens";

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string | number;
  deltaDir?: "up" | "down" | "flat";
  status?: StatusKey;
  sparklineData?: number[];
  tooltip?: string;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent-indigo)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const deltaGlyph: Record<"up" | "down" | "flat", string> = {
  up: "▲",
  down: "▼",
  flat: "▬",
};

const deltaColor: Record<"up" | "down" | "flat", string> = {
  up: "var(--sev2)",
  down: "var(--sev5)",
  flat: "var(--text-tertiary)",
};

export default function StatTile({
  label,
  value,
  unit,
  delta,
  deltaDir = "flat",
  status,
  sparklineData,
  tooltip,
}: StatTileProps) {
  const id = useId();
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative flex flex-col gap-3 rounded-xl border p-4 transition-colors"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderColor: "var(--border-default)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="relative flex items-center gap-1.5 uppercase tracking-wide"
          style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <span>{label}</span>
          {tooltip && (
            <>
              <span
                aria-describedby={id}
                tabIndex={0}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full border normal-case focus-visible:outline-none"
                style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)", fontSize: 9 }}
              >
                i
              </span>
              {hover && (
                <span
                  id={id}
                  role="tooltip"
                  className="absolute left-0 top-5 z-20 w-48 rounded-md border px-2 py-1.5 normal-case shadow-lg"
                  style={{
                    backgroundColor: "var(--bg-overlay)",
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                    fontSize: "var(--fs-xs)",
                    boxShadow: "var(--shadow-overlay)",
                  }}
                >
                  {tooltip}
                </span>
              )}
            </>
          )}
        </div>
        {status && (
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: statusColor[status], boxShadow: `0 0 0 3px color-mix(in srgb, ${statusColor[status]} 20%, transparent)` }}
          />
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span
            className="font-data tabular-nums font-semibold"
            style={{ fontSize: "var(--fs-2xl)", color: "var(--text-primary)" }}
          >
            {value}
          </span>
          {unit && (
            <span style={{ color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>{unit}</span>
          )}
        </div>
        {sparklineData && <Sparkline data={sparklineData} />}
      </div>

      {delta !== undefined && (
        <div
          className="font-data flex items-center gap-1"
          style={{ fontSize: "var(--fs-xs)", color: deltaColor[deltaDir] }}
        >
          <span>{deltaGlyph[deltaDir]}</span>
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}
