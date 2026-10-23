// Pure SVG "fan chart": renders historical observations as a solid line and,
// optionally, a forward Monte Carlo simulation as a P10–P90 shaded band with
// the P50 median line continuing from the last historical point. No chart
// library — this is a small, dependency-free renderer so the simulation
// output (named algorithm, real numbers) is always visibly traceable to the
// SVG path data in view-source.
export interface HistoryPoint {
  period: string;
  value: number;
}

export interface BandPoint {
  step: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export function FanChart({
  history,
  bands,
  width = 760,
  height = 280,
}: {
  history: HistoryPoint[];
  bands?: BandPoint[];
  width?: number;
  height?: number;
}) {
  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const historyValues = history.map((h) => h.value);
  const bandValues = bands ? bands.flatMap((b) => [b.p10, b.p90]) : [];
  const allValues = [...historyValues, ...bandValues];
  const minV = allValues.length ? Math.min(...allValues) : 0;
  const maxV = allValues.length ? Math.max(...allValues) : 1;
  const pad = (maxV - minV) * 0.08 || 1;
  const lo = minV - pad;
  const hi = maxV + pad;

  const totalSteps = history.length - 1 + (bands?.length ?? 0);
  const xFor = (idx: number) => padding.left + (totalSteps === 0 ? 0 : (idx / totalSteps) * innerW);
  const yFor = (v: number) => padding.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

  const historyPath = history.map((h, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(2)},${yFor(h.value).toFixed(2)}`).join(" ");

  const lastHistIdx = history.length - 1;
  const lastHistValue = history[history.length - 1]?.value ?? 0;

  let bandAreaPath = "";
  let medianPath = "";
  if (bands && bands.length > 0) {
    const upperPts = [[lastHistIdx, lastHistValue], ...bands.map((b) => [lastHistIdx + b.step, b.p90])];
    const lowerPts = [[lastHistIdx, lastHistValue], ...bands.map((b) => [lastHistIdx + b.step, b.p10])].reverse();
    bandAreaPath =
      upperPts.map(([idx, v], i) => `${i === 0 ? "M" : "L"}${xFor(idx).toFixed(2)},${yFor(v).toFixed(2)}`).join(" ") +
      " " +
      lowerPts.map(([idx, v]) => `L${xFor(idx).toFixed(2)},${yFor(v).toFixed(2)}`).join(" ") +
      " Z";
    medianPath = [[lastHistIdx, lastHistValue], ...bands.map((b) => [lastHistIdx + b.step, b.p50])]
      .map(([idx, v], i) => `${i === 0 ? "M" : "L"}${xFor(idx).toFixed(2)},${yFor(v).toFixed(2)}`)
      .join(" ");
  }

  const gridLines = 4;
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => lo + ((hi - lo) * i) / gridLines);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Metric history and forecast fan chart" className="w-full">
      {gridValues.map((v, i) => (
        <g key={i}>
          <line x1={padding.left} x2={width - padding.right} y1={yFor(v)} y2={yFor(v)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={4} y={yFor(v) + 4} fontSize={10} fill="#64748b">
            {Math.round(v).toLocaleString()}
          </text>
        </g>
      ))}
      {bandAreaPath && <path d={bandAreaPath} fill="#93c5fd" fillOpacity={0.35} stroke="none" data-testid="forecast-band" />}
      {medianPath && <path d={medianPath} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 3" data-testid="forecast-median" />}
      <path d={historyPath} fill="none" stroke="#0f172a" strokeWidth={2} data-testid="history-line" />
      {history.map((h, i) => (
        <circle key={h.period} cx={xFor(i)} cy={yFor(h.value)} r={2.5} fill="#0f172a" />
      ))}
    </svg>
  );
}
