import { useMemo, useState } from "react";
import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { Annotation, LineSeries, VizMeta } from "./types";

interface LineChartOptions {
  width?: number;
  height?: number;
  yLabel?: string;
  yUnit?: string;
  showArea?: boolean;
  showDots?: boolean;
  target?: number;
  annotations?: Annotation[];
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export function LineChart({
  series,
  options = {},
  meta,
}: {
  series: LineSeries[];
  options?: LineChartOptions;
  meta: VizMeta;
}) {
  const {
    width = 560,
    height = 220,
    yLabel = "",
    yUnit = "",
    showArea = false,
    showDots = true,
    target,
    annotations = [],
  } = options;

  const pad = { top: 16, right: 92, bottom: 26, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const allPoints = series.flatMap((s) => s.points);
  const allX = Array.from(new Set(allPoints.map((p) => p.x))).sort();
  const allYVals = allPoints.map((p) => p.y).filter((y): y is number => y !== null);
  const yMin = Math.min(...allYVals, target ?? Infinity);
  const yMax = Math.max(...allYVals, target ?? -Infinity);
  const yPad = (yMax - yMin) * 0.12 || 1;
  const y0 = yMin - yPad;
  const y1 = yMax + yPad;

  const xScale = (x: string) => {
    const idx = allX.indexOf(x);
    return pad.left + (idx / Math.max(1, allX.length - 1)) * innerW;
  };
  const yScale = (y: number) => pad.top + innerH - ((y - y0) / (y1 - y0)) * innerH;

  const [hover, setHover] = useState<{ x: number; y: number; label: string; value: string } | null>(null);

  const xTickIdx = useMemo(() => {
    const n = Math.min(8, allX.length);
    if (n <= 1) return allX.map((_, i) => i);
    const step = (allX.length - 1) / (n - 1);
    return Array.from({ length: n }).map((_, i) => Math.round(i * step));
  }, [allX]);

  const table = (
    <table>
      <caption>{meta.label}</caption>
      <thead>
        <tr>
          <th>date</th>
          {series.map((s) => (
            <th key={s.label}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {allX.map((x) => (
          <tr key={x}>
            <td>{x}</td>
            {series.map((s) => {
              const p = s.points.find((pt) => pt.x === x);
              return <td key={s.label}>{p?.y ?? "—"}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={height}>
      {({ titleId, descId }) => (
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
        >
          {vizTitleDesc(
            `Line chart of ${series.map((s) => s.label).join(", ")}`,
            meta.label,
            { titleId, descId }
          )}
          {/* y=0 baseline only, no grid junk */}
          {y0 <= 0 && y1 >= 0 && (
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yScale(0)}
              y2={yScale(0)}
              stroke="var(--ink-4)"
              strokeWidth={1}
            />
          )}

          {/* y axis labels, left-aligned text right-anchored */}
          {[y0 + yPad, (y0 + y1) / 2, y1 - yPad].map((yv, i) => (
            <text
              key={i}
              x={pad.left - 8}
              y={yScale(yv) + 3}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={9}
              fill="var(--ink-3)"
            >
              {yv.toFixed(0)}
              {yUnit}
            </text>
          ))}
          {yLabel && (
            <text x={pad.left} y={10} fontSize={9} fontFamily="var(--font-mono)" fill="var(--ink-3)">
              {yLabel}
            </text>
          )}

          {/* target line */}
          {target !== undefined && (
            <>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={yScale(target)}
                y2={yScale(target)}
                stroke="var(--ink-4)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text
                x={width - pad.right + 4}
                y={yScale(target) + 3}
                fontSize={9}
                fontFamily="var(--font-mono)"
                fill="var(--ink-3)"
              >
                target
              </text>
            </>
          )}

          {/* annotations */}
          {annotations.map((a, i) => (
            <g key={i}>
              <line
                x1={xScale(a.x)}
                x2={xScale(a.x)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="var(--ink-4)"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <text
                x={xScale(a.x)}
                y={pad.top - 4}
                fontSize={8}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fill="var(--ink-3)"
              >
                {a.label}
              </text>
            </g>
          ))}

          {/* x axis ticks */}
          {xTickIdx.map((i) => (
            <text
              key={i}
              x={xScale(allX[i])}
              y={height - 6}
              fontSize={9}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fill="var(--ink-3)"
            >
              {fmtDate(allX[i])}
            </text>
          ))}

          {/* series */}
          {series.map((s) => {
            const segs: { d: string; dashed: boolean }[] = [];
            let cur = "";
            let dashedGap = false;
            s.points.forEach((p) => {
              if (p.y === null) {
                if (cur) segs.push({ d: cur, dashed: false });
                cur = "";
                dashedGap = true;
                return;
              }
              const cmd = `${xScale(p.x)},${yScale(p.y)}`;
              if (dashedGap) {
                cur = `M ${cmd}`;
                dashedGap = false;
              } else if (!cur) {
                cur = `M ${cmd}`;
              } else {
                cur += ` L ${cmd}`;
              }
            });
            if (cur) segs.push({ d: cur, dashed: false });

            const isLow = s.conf === "low";
            const last = [...s.points].reverse().find((p) => p.y !== null);

            // area
            const areaPts = s.points.filter((p) => p.y !== null);
            const areaD =
              areaPts.length > 1
                ? `M ${xScale(areaPts[0].x)},${yScale(0 > y0 ? 0 : y0)} ` +
                  areaPts.map((p) => `L ${xScale(p.x)},${yScale(p.y as number)}`).join(" ") +
                  ` L ${xScale(areaPts[areaPts.length - 1].x)},${yScale(0 > y0 ? 0 : y0)} Z`
                : "";

            return (
              <g key={s.label}>
                {showArea && areaD && <path d={areaD} fill={s.color} opacity={0.08} />}
                {segs.map((seg, i) => (
                  <path
                    key={i}
                    d={seg.d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.75}
                    strokeDasharray={isLow ? "5 3" : undefined}
                  />
                ))}
                {showDots &&
                  s.points.map((p, i) =>
                    p.y === null ? null : (
                      <circle
                        key={i}
                        cx={xScale(p.x)}
                        cy={yScale(p.y)}
                        r={2.5}
                        fill={s.color}
                        onMouseEnter={() =>
                          setHover({
                            x: xScale(p.x),
                            y: yScale(p.y as number),
                            label: fmtDate(p.x),
                            value: `${p.y}${yUnit}`,
                          })
                        }
                        onMouseLeave={() => setHover(null)}
                      />
                    )
                  )}
                {last && (
                  <text
                    x={xScale(last.x) + 6}
                    y={yScale(last.y as number) + 3}
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    fill={s.color}
                  >
                    {s.label}
                    {isLow ? " (low conf)" : ""}
                  </text>
                )}
              </g>
            );
          })}

          {hover && (
            <foreignObject x={hover.x - 45} y={hover.y - 38} width={90} height={30}>
              <div
                style={{
                  background: "var(--ink-1)",
                  color: "white",
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  textAlign: "center",
                }}
              >
                {hover.label}: {hover.value}
              </div>
            </foreignObject>
          )}
        </svg>
      )}
    </ChartFrame>
  );
}

export function nFromSeries(series: LineSeries[]) {
  return series.reduce((acc, s) => acc + s.points.filter((p) => p.y !== null).length, 0);
}
