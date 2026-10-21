"use client";

/** Simple bullet graph for scalar scores shown against a 0-1 scale, with an
 * optional confidence-interval band (Part 02 chart grammar: uncertainty is
 * drawn on the chart itself, not hidden). */
export function BulletGraph({
  value,
  low,
  high,
  target,
  label,
  formatAsPercent = true,
}: {
  value: number;
  low?: number;
  high?: number;
  target?: number;
  label?: string;
  formatAsPercent?: boolean;
}) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, x * 100))}%`;
  return (
    <div className="w-full">
      {label && <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>}
      <div className="relative h-4 w-full rounded bg-slate-100">
        {low !== undefined && high !== undefined && (
          <div
            className="absolute top-0 h-4 rounded bg-indigo-100"
            style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
            title={`80% interval: ${(low * 100).toFixed(1)}–${(high * 100).toFixed(1)}%`}
          />
        )}
        <div className="absolute top-1 h-2 rounded bg-indigo-600" style={{ width: pct(value) }} />
        {target !== undefined && (
          <div className="absolute top-0 h-4 w-0.5 bg-slate-700" style={{ left: pct(target) }} />
        )}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        {formatAsPercent ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)}
        {low !== undefined && high !== undefined
          ? ` (80% interval ${(low * 100).toFixed(1)}–${(high * 100).toFixed(1)}%)`
          : ""}
      </div>
    </div>
  );
}
