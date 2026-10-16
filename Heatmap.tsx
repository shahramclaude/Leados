import { useEffect, useRef, useState } from "react";
import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { HeatCell, VizMeta } from "./types";

function mix(color: string, t: number) {
  // interpolate from --surface-3 to the given domain color via opacity overlay trick
  return { background: color, opacity: 0.18 + t * 0.82 };
}

export function DomainHeatmap({
  cells,
  meta,
  onSelect,
}: {
  cells: HeatCell[];
  meta: VizMeta;
  onSelect?: (label: string) => void;
}) {
  const table = (
    <table>
      <caption>Domain health heatmap</caption>
      <thead>
        <tr>
          <th>domain</th>
          <th>score</th>
        </tr>
      </thead>
      <tbody>
        {cells.map((c) => (
          <tr key={c.label}>
            <td>{c.label}</td>
            <td>
              {c.value}/{c.maxValue}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={64}>
      {({ titleId, descId }) => (
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          width="100%"
          viewBox={`0 0 ${cells.length * 82} 64`}
        >
          {vizTitleDesc(
            "Domain health heatmap, 14 domains",
            `${cells.length} domains scored; darkest cells are highest-scoring`,
            { titleId, descId }
          )}
          {cells.map((c, i) => {
            const t = c.value / c.maxValue;
            const style = mix(c.color, t);
            return (
              <g
                key={c.label}
                transform={`translate(${i * 82},0)`}
                onClick={() => onSelect?.(c.label)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
              >
                <rect width={78} height={60} rx={3} fill={style.background} opacity={style.opacity} />
                <rect width={78} height={60} rx={3} fill="none" stroke="var(--line)" />
                <text x={6} y={16} fontSize={8} fontFamily="var(--font-mono)" fill="var(--ink-1)">
                  {c.label}
                </text>
                <text x={6} y={40} fontSize={14} fontFamily="var(--font-mono)" fill="var(--ink-1)">
                  {c.value}
                </text>
                <text x={6} y={52} fontSize={7} fontFamily="var(--font-mono)" fill="var(--ink-3)">
                  / {c.maxValue}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
}

/** Calendar heatmap: 52 weeks x 7 days. Rendered on <canvas> per the
 * performance rule (>100 data points -> canvas). */
export function CalendarHeatmap({
  data,
  meta,
}: {
  data: { date: string; count: number }[];
  meta: VizMeta;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<{ date: string; count: number } | null>(null);
  const cell = 10;
  const gap = 2;
  const weeks = Math.ceil(data.length / 7);
  const width = weeks * (cell + gap);
  const height = 7 * (cell + gap);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    data.forEach((d, i) => {
      const week = Math.floor(i / 7);
      const day = i % 7;
      const t = d.count / maxCount;
      ctx.fillStyle = d.count === 0 ? "#e8eaee" : `rgba(52, 84, 209, ${0.15 + t * 0.85})`;
      ctx.fillRect(week * (cell + gap), day * (cell + gap), cell, cell);
    });
  }, [data, width, height, maxCount]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const week = Math.floor(px / (cell + gap));
    const day = Math.floor(py / (cell + gap));
    const idx = week * 7 + day;
    const d = data[idx];
    if (d) setSelected(d);
  }

  const activeDays = data.filter((d) => d.count > 0).length;

  const table = (
    <table>
      <caption>Activity calendar (events logged per day)</caption>
      <thead>
        <tr>
          <th>date</th>
          <th>events</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.date}>
            <td>{d.date}</td>
            <td>{d.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={height + 20}>
      {({ titleId, descId }) => (
        <div role="img" aria-labelledby={`${titleId} ${descId}`}>
          <span id={titleId} className="sr-only">
            Calendar heatmap of logging activity
          </span>
          <span id={descId} className="sr-only">
            {activeDays} of {data.length} days have at least one logged event. Sparse days mean thinner data and
            less reliable findings.
          </span>
          <canvas ref={canvasRef} onClick={handleClick} style={{ cursor: "pointer" }} />
          {selected && (
            <p className="mt-1 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-2)" }}>
              {selected.date}: {selected.count} event{selected.count === 1 ? "" : "s"} logged
            </p>
          )}
        </div>
      )}
    </ChartFrame>
  );
}
