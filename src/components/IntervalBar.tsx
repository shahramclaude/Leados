export function IntervalBar({
  low,
  mean,
  high,
  max = 1,
  label,
}: {
  low: number;
  mean: number;
  high: number;
  max?: number;
  label?: string;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="w-full">
      {label ? <div className="mb-1 text-xs text-slate-500">{label}</div> : null}
      <div className="relative h-3 w-full rounded-full bg-slate-100">
        <div
          className="absolute h-3 rounded-full bg-violet-200"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        <div
          className="absolute top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-full bg-violet-700"
          style={{ left: pct(mean) }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>p10: {(low * 100).toFixed(1)}%</span>
        <span className="font-semibold text-violet-700">mean: {(mean * 100).toFixed(1)}%</span>
        <span>p90: {(high * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
