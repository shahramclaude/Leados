"use client";

// Renders "low-quality input" chips for any dimension below threshold.
// Chips are deliberately alarming (amber/red) — a passing dimension gets no
// chip at all, so the UI never implies false confidence.

export interface DimensionScore {
  value: number;
  explanation: string;
  isProxy?: boolean;
}

export function QualityChips({
  dimensions,
  thresholds,
}: {
  dimensions: Record<string, DimensionScore>;
  thresholds: Record<string, number>;
}) {
  const entries = Object.entries(dimensions);
  const low = entries.filter(([key, d]) => d.value < (thresholds[key] ?? 1));

  if (low.length === 0) {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">All quality dimensions passed</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {low.map(([key, d]) => (
        <span
          key={key}
          title={d.explanation}
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900"
        >
          ⚠ low-quality input: {key} ({(d.value * 100).toFixed(0)}% &lt; {(thresholds[key] * 100).toFixed(0)}%)
          {d.isProxy ? <span className="text-amber-700">(proxy)</span> : null}
        </span>
      ))}
    </div>
  );
}

export function AllDimensionsTable({ dimensions, thresholds }: { dimensions: Record<string, DimensionScore>; thresholds: Record<string, number> }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-slate-500">
          <th className="py-2 pr-4">Dimension</th>
          <th className="py-2 pr-4">Score</th>
          <th className="py-2 pr-4">Threshold</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2">Explanation</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(dimensions).map(([key, d]) => {
          const threshold = thresholds[key] ?? 1;
          const passed = d.value >= threshold;
          return (
            <tr key={key} className="border-b border-slate-100 align-top">
              <td className="py-2 pr-4 font-medium text-slate-900">
                {key}
                {d.isProxy ? <span className="ml-1 text-xs text-slate-400">(proxy — no ground truth)</span> : null}
              </td>
              <td className="py-2 pr-4 tabular-nums">{(d.value * 100).toFixed(1)}%</td>
              <td className="py-2 pr-4 tabular-nums text-slate-500">{(threshold * 100).toFixed(0)}%</td>
              <td className="py-2 pr-4">
                <span className={passed ? "text-emerald-700" : "text-amber-700"}>{passed ? "OK" : "LOW QUALITY"}</span>
              </td>
              <td className="py-2 text-slate-600">{d.explanation}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
