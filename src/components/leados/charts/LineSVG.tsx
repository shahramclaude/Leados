"use client";

export interface LineSVGHistoryPoint {
  date: string | Date;
  value: number;
}

export interface LineSVGForecastPoint {
  date: string | Date;
  p10: number;
  p50: number;
  p90: number;
}

export interface LineSVGAnomaly {
  at: string | Date;
  value: number;
  type: "point" | "structural_break";
}

interface LineSVGProps {
  history: LineSVGHistoryPoint[];
  forecast?: LineSVGForecastPoint[];
  anomalies?: LineSVGAnomaly[];
  target?: number | null;
  benchmark?: number | null;
  width?: number;
  height?: number;
  unit?: string | null;
  color?: string;
}

function toTime(d: string | Date): number {
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}

export function LineSVG({
  history,
  forecast = [],
  anomalies = [],
  target,
  benchmark,
  width = 720,
  height = 280,
  unit,
  color = "#2563eb",
}: LineSVGProps) {
  const margin = { top: 18, right: 18, bottom: 28, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const histSorted = [...history].sort((a, b) => toTime(a.date) - toTime(b.date));
  const fcSorted = [...forecast].sort((a, b) => toTime(a.date) - toTime(b.date));

  if (!histSorted.length) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-slate-400 text-sm">
          No history yet.
        </text>
      </svg>
    );
  }

  const allTimes = [...histSorted.map((p) => toTime(p.date)), ...fcSorted.map((p) => toTime(p.date))];
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const spanT = maxT - minT || 1;

  const allValues = [
    ...histSorted.map((p) => p.value),
    ...fcSorted.flatMap((p) => [p.p10, p.p50, p.p90]),
    ...(target != null ? [target] : []),
    ...(benchmark != null ? [benchmark] : []),
  ];
  let minV = Math.min(...allValues);
  let maxV = Math.max(...allValues);
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }
  const padV = (maxV - minV) * 0.08;
  minV -= padV;
  maxV += padV;
  const spanV = maxV - minV || 1;

  const x = (t: number) => margin.left + ((t - minT) / spanT) * innerW;
  const y = (v: number) => margin.top + innerH - ((v - minV) / spanV) * innerH;

  const historyPath = histSorted
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(toTime(p.date)).toFixed(2)},${y(p.value).toFixed(2)}`)
    .join(" ");

  // Connect forecast to the last historical point so the dashed line is continuous.
  const bridge = histSorted[histSorted.length - 1];
  const forecastLinePts = bridge ? [{ date: bridge.date, p50: bridge.value }, ...fcSorted] : fcSorted;
  const forecastPath = forecastLinePts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(toTime(p.date)).toFixed(2)},${y(p.p50).toFixed(2)}`)
    .join(" ");

  const bandTop = fcSorted.map((p) => `${x(toTime(p.date)).toFixed(2)},${y(p.p90).toFixed(2)}`);
  const bandBottom = fcSorted
    .slice()
    .reverse()
    .map((p) => `${x(toTime(p.date)).toFixed(2)},${y(p.p10).toFixed(2)}`);
  const bandStart = bridge ? `${x(toTime(bridge.date)).toFixed(2)},${y(bridge.value).toFixed(2)}` : "";
  const bandPath =
    fcSorted.length > 0 ? `M${bandStart} L${bandTop.join(" L")} L${bandBottom.join(" L")} Z` : "";

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => minV + (spanV * i) / yTicks);

  const anomalyDots = anomalies
    .map((a) => {
      const t = toTime(a.at);
      if (t < minT || t > maxT) return null;
      return { ...a, cx: x(t), cy: y(a.value) };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" className="overflow-visible">
      {/* gridlines + y-axis labels */}
      {tickVals.map((v, i) => (
        <g key={i}>
          <line x1={margin.left} x2={width - margin.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={margin.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={10}>
            {v.toFixed(v >= 100 ? 0 : 1)}
          </text>
        </g>
      ))}

      {/* benchmark + target reference lines */}
      {benchmark != null && (
        <g>
          <line x1={margin.left} x2={width - margin.right} y1={y(benchmark)} y2={y(benchmark)} stroke="#a855f7" strokeDasharray="3 3" strokeWidth={1.5} />
          <text x={width - margin.right} y={y(benchmark) - 4} textAnchor="end" fontSize={10} className="fill-purple-500">
            benchmark {benchmark}
            {unit ?? ""}
          </text>
        </g>
      )}
      {target != null && (
        <g>
          <line x1={margin.left} x2={width - margin.right} y1={y(target)} y2={y(target)} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1.5} />
          <text x={width - margin.right} y={y(target) - 4} textAnchor="end" fontSize={10} className="fill-amber-500">
            target {target}
            {unit ?? ""}
          </text>
        </g>
      )}

      {/* forecast confidence band */}
      {bandPath && <path d={bandPath} fill={color} opacity={0.12} stroke="none" />}

      {/* forecast dashed line */}
      {forecastPath && <path d={forecastPath} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 4" opacity={0.85} />}

      {/* historical solid line */}
      <path d={historyPath} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />

      {/* anomaly markers */}
      {anomalyDots.map((a, i) => (
        <g key={i}>
          <circle cx={a.cx} cy={a.cy} r={a.type === "structural_break" ? 6 : 4.5} fill="none" stroke="#dc2626" strokeWidth={2} />
          <text x={a.cx} y={a.cy - 10} textAnchor="middle" fontSize={11}>
            ⚠
          </text>
        </g>
      ))}

      {/* x-axis labels: first, mid, last of history + last forecast */}
      {[histSorted[0], histSorted[Math.floor(histSorted.length / 2)], histSorted[histSorted.length - 1]]
        .filter(Boolean)
        .map((p, i) => (
          <text key={i} x={x(toTime((p as LineSVGHistoryPoint).date))} y={height - 8} textAnchor="middle" fontSize={10} className="fill-slate-400">
            {new Date((p as LineSVGHistoryPoint).date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        ))}
      {fcSorted.length > 0 && (
        <text x={x(toTime(fcSorted[fcSorted.length - 1].date))} y={height - 8} textAnchor="middle" fontSize={10} className="fill-slate-400">
          {new Date(fcSorted[fcSorted.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </text>
      )}
    </svg>
  );
}
