// Lightweight, dependency-free SVG line chart for a metric's rolling
// observation history with baseline and EWMA control-limit bands.

interface Point {
  value: number;
  observedAt: string;
}

export function TrendChart({
  points,
  baseline,
  ucl,
  lcl,
}: {
  points: Point[];
  baseline: number;
  ucl?: number;
  lcl?: number;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-slate-400">No observations yet.</p>;
  }

  const width = 480;
  const height = 140;
  const padding = 10;
  const values = points.map((p) => p.value);
  const allValues = [...values, baseline, ucl ?? baseline, lcl ?? baseline];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const scaleX = (i: number) => padding + (i / Math.max(1, points.length - 1)) * (width - 2 * padding);
  const scaleY = (v: number) => height - padding - ((v - min) / range) * (height - 2 * padding);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(p.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      {ucl !== undefined && lcl !== undefined && (
        <rect
          x={padding}
          y={scaleY(ucl)}
          width={width - 2 * padding}
          height={Math.max(0, scaleY(lcl) - scaleY(ucl))}
          fill="#f1f5f9"
        />
      )}
      <line x1={padding} x2={width - padding} y1={scaleY(baseline)} y2={scaleY(baseline)} stroke="#94a3b8" strokeDasharray="4 3" />
      <path d={linePath} fill="none" stroke="#0f172a" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={scaleX(i)} cy={scaleY(p.value)} r={2.5} fill="#0f172a" />
      ))}
    </svg>
  );
}
