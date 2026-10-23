interface FanChartProps {
  historyLabels: string[];
  historyValues: number[];
  futureLabels: string[];
  p10: number[];
  p50: number[];
  p90: number[];
  unit?: string;
  height?: number;
}

/** Minimal dependency-free SVG fan chart: history line + forecast median + 80% band. */
export function FanChart({ historyLabels, historyValues, futureLabels, p10, p50, p90, unit, height = 220 }: FanChartProps) {
  const width = 760;
  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = [...historyValues, ...p10, ...p90, ...p50];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;

  const totalPoints = historyValues.length + p50.length;
  const xFor = (i: number) => padding.left + (i / Math.max(totalPoints - 1, 1)) * innerW;
  const yFor = (v: number) => padding.top + innerH - ((v - min) / span) * innerH;

  const historyPath = historyValues.map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
  const offset = historyValues.length - 1;
  const medianPath = p50
    .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(offset + i + 1).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(" ");
  const connectorMedian = `M${xFor(offset).toFixed(1)},${yFor(historyValues[offset] ?? p50[0]).toFixed(1)} ${medianPath.replace("M", "L")}`;

  const bandTop = p90.map((v, i) => `${xFor(offset + i + 1).toFixed(1)},${yFor(v).toFixed(1)}`);
  const bandBottom = p10
    .map((v, i) => `${xFor(offset + i + 1).toFixed(1)},${yFor(v).toFixed(1)}`)
    .reverse();
  const anchor = `${xFor(offset).toFixed(1)},${yFor(historyValues[offset] ?? p50[0]).toFixed(1)}`;
  const bandPath = `M${anchor} L${bandTop.join(" L")} L${bandBottom.join(" L")} Z`;

  const ticks = [0, 0.5, 1].map((f) => min + f * span);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Forecast fan chart">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padding.left} x2={width - padding.right} y1={yFor(t)} y2={yFor(t)} stroke="#1e293b" strokeWidth={1} />
          <text x={4} y={yFor(t) + 4} fontSize={10} fill="#64748b">
            {t.toFixed(unit === "pct" ? 1 : 0)}
          </text>
        </g>
      ))}
      <path d={bandPath} fill="#6366f1" opacity={0.18} />
      <path d={historyPath} fill="none" stroke="#94a3b8" strokeWidth={2} />
      <path d={connectorMedian} fill="none" stroke="#818cf8" strokeWidth={2.5} strokeDasharray="0" />
      <line x1={xFor(offset)} x2={xFor(offset)} y1={padding.top} y2={height - padding.bottom} stroke="#334155" strokeDasharray="4 4" />
      <text x={xFor(offset)} y={padding.top - 4} fontSize={10} fill="#64748b" textAnchor="middle">
        now
      </text>
      {[...historyLabels, ...futureLabels].filter((_, i) => i % Math.ceil(totalPoints / 8 || 1) === 0).map((l, i) => {
        const idx = i * Math.ceil(totalPoints / 8 || 1);
        return (
          <text key={l + idx} x={xFor(idx)} y={height - 8} fontSize={9} fill="#64748b" textAnchor="middle">
            {l.slice(2, 7)}
          </text>
        );
      })}
    </svg>
  );
}
