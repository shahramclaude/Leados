"use client";

import { ConfidenceClass } from "@/lib/intelligence/types";

const CLASS_STYLES: Record<ConfidenceClass, { bg: string; text: string; label: string }> = {
  observed: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Observed" },
  estimated: { bg: "bg-sky-100", text: "text-sky-800", label: "Estimated" },
  inferred: { bg: "bg-amber-100", text: "text-amber-800", label: "Inferred" },
  assumed: { bg: "bg-rose-100", text: "text-rose-800", label: "Assumed — no data" },
};

export function ConfidenceChip({ confidenceClass }: { confidenceClass: ConfidenceClass }) {
  const s = CLASS_STYLES[confidenceClass];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

/**
 * Renders a value against its [lo, hi] interval as a small horizontal bar.
 * If the interval is degenerate/NaN (observed counts, or "assumed" with no
 * data), it falls back to a plain value rather than drawing a fake bar.
 */
export function ConfidenceBar({
  value,
  interval,
  confidenceClass,
  domain,
  formatValue,
}: {
  value: number;
  interval: [number, number];
  confidenceClass: ConfidenceClass;
  domain?: [number, number];
  formatValue?: (v: number) => string;
}) {
  const fmt = formatValue ?? ((v: number) => v.toFixed(2));
  const [lo, hi] = interval;
  const hasInterval = Number.isFinite(lo) && Number.isFinite(hi) && !(confidenceClass === "observed");

  if (!hasInterval) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-slate-900">{fmt(value)}</span>
        <ConfidenceChip confidenceClass={confidenceClass} />
      </div>
    );
  }

  const [dLo, dHi] = domain ?? [Math.min(lo, value) - (hi - lo) * 0.25, Math.max(hi, value) + (hi - lo) * 0.25];
  const span = Math.max(dHi - dLo, 1e-9);
  const pct = (x: number) => Math.min(100, Math.max(0, ((x - dLo) / span) * 100));

  return (
    <div className="w-full">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-slate-900">{fmt(value)}</span>
        <span className="text-xs text-slate-500">
          [{fmt(lo)}, {fmt(hi)}]
        </span>
        <ConfidenceChip confidenceClass={confidenceClass} />
      </div>
      <div className="relative mt-2 h-2 w-full rounded-full bg-slate-100">
        <div
          className="absolute top-0 h-2 rounded-full bg-sky-200"
          style={{ left: `${pct(lo)}%`, width: `${Math.max(pct(hi) - pct(lo), 1)}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-sky-600 shadow"
          style={{ left: `${pct(value)}%` }}
        />
      </div>
    </div>
  );
}
