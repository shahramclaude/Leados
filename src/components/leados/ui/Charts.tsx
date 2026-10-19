"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "./utils";
import { chartPalette, chartVar } from "./tokens";
import { DataTable, type ColumnDef } from "./Table";
import { IconButton } from "./Primitives";

/* ============================== ChartFrame ============================== */

export interface ChartTableSpec<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

/**
 * Every chart in LEADOS renders inside a ChartFrame: consistent title/legend
 * chrome plus a "view as table" toggle that swaps the SVG for the exact same
 * data in an accessible <table>. This is the one required a11y/data fallback
 * for all visualizations, not a per-chart afterthought.
 */
export function ChartFrame<T>({
  title,
  description,
  legend,
  table,
  children,
  isEmpty,
  emptyLabel = "No data for this period",
}: {
  title: string;
  description?: string;
  legend?: { label: string; color: string }[];
  table: ChartTableSpec<T>;
  children: ReactNode;
  isEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 id={headingId} className="text-body font-semibold text-text-primary">
            {title}
          </h4>
          {description ? <p className="text-caption text-text-tertiary">{description}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {legend && !showTable ? (
            <ul className="flex flex-wrap items-center gap-3">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5 text-caption text-text-secondary">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          ) : null}
          <IconButton
            label={showTable ? "Switch to chart view" : "View as table"}
            active={showTable}
            size="sm"
            onClick={() => setShowTable((s) => !s)}
          >
            <span aria-hidden="true">{showTable ? "📈" : "▦"}</span>
          </IconButton>
        </div>
      </div>
      {isEmpty ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-body-sm text-text-tertiary">
          {emptyLabel}
        </div>
      ) : showTable ? (
        <DataTable caption={title} columns={table.columns} rows={table.rows} rowKey={table.rowKey} />
      ) : (
        <div className="w-full overflow-x-auto">{children}</div>
      )}
    </figure>
  );
}

/* ============================== LineSVG ============================== */

export interface LineSeries {
  label: string;
  color?: string;
  points: number[];
  /** optional uncertainty band, same length as points */
  band?: { low: number; high: number }[];
}

export function LineSVG({
  series,
  labels,
  height = 220,
  yFormat = (v: number) => String(Math.round(v)),
}: {
  series: LineSeries[];
  labels: string[];
  height?: number;
  yFormat?: (v: number) => string;
}) {
  const width = 640;
  const padding = { top: 12, right: 16, bottom: 28, left: 42 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => [...s.points, ...(s.band?.flatMap((b) => [b.low, b.high]) ?? [])]);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;

  const xAt = (i: number) => padding.left + (i / Math.max(1, labels.length - 1)) * innerW;
  const yAt = (v: number) => padding.top + innerH - ((v - min) / range) * innerH;

  const ticks = 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Line chart: ${series.map((s) => s.label).join(", ")}`}
      className="h-auto w-full min-w-[320px]"
      preserveAspectRatio="xMidYMid meet"
    >
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = min + (range / ticks) * i;
        const y = yAt(v);
        return (
          <g key={i}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={chartVar.grid} strokeWidth={1} />
            <text x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-text-tertiary" style={{ font: "500 10px var(--font-mono)" }}>
              {yFormat(v)}
            </text>
          </g>
        );
      })}
      {labels.map((label, i) => {
        if (labels.length > 8 && i % Math.ceil(labels.length / 8) !== 0) return null;
        return (
          <text key={label} x={xAt(i)} y={height - 8} textAnchor="middle" className="fill-text-tertiary" style={{ font: "500 10px var(--font-sans)" }}>
            {label}
          </text>
        );
      })}
      {series.map((s, si) => {
        const color = s.color ?? chartPalette[si % chartPalette.length];
        const linePath = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p)}`).join(" ");
        const bandPath = s.band
          ? `${s.band.map((b, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(b.high)}`).join(" ")} ${[...s.band]
              .reverse()
              .map((b, i) => `L ${xAt(s.band!.length - 1 - i)} ${yAt(b.low)}`)
              .join(" ")} Z`
          : null;
        return (
          <g key={s.label}>
            {bandPath ? <path d={bandPath} fill={color} opacity={0.14} stroke="none" /> : null}
            <path d={linePath} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={xAt(i)} cy={yAt(p)} r={2.5} fill={color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ============================== SparklineSVG ============================== */

export function SparklineSVG({
  points,
  color = chartPalette[0],
  width = 120,
  height = 32,
  label,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  label: string;
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xAt = (i: number) => (i / Math.max(1, points.length - 1)) * (width - 4) + 2;
  const yAt = (v: number) => height - 2 - ((v - min) / range) * (height - 4);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xAt(points.length - 1)} cy={yAt(points[points.length - 1])} r={2} fill={color} />
    </svg>
  );
}

/* ============================== HeatmapSVG ============================== */

export function HeatmapSVG({
  rows,
  cols,
  values,
  valueLabel,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  valueLabel: (v: number) => string;
}) {
  const cell = 34;
  const labelW = 120;
  const width = labelW + cols.length * cell;
  const height = 24 + rows.length * cell;
  const max = Math.max(...values.flat(), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Heatmap" className="h-auto w-full min-w-[320px]">
      {cols.map((c, ci) => (
        <text key={c} x={labelW + ci * cell + cell / 2} y={14} textAnchor="middle" className="fill-text-tertiary" style={{ font: "600 9px var(--font-sans)" }}>
          {c}
        </text>
      ))}
      {rows.map((r, ri) => (
        <g key={r}>
          <text x={0} y={24 + ri * cell + cell / 2} dominantBaseline="middle" className="fill-text-secondary" style={{ font: "500 10px var(--font-sans)" }}>
            {r}
          </text>
          {cols.map((c, ci) => {
            const v = values[ri]?.[ci] ?? 0;
            const intensity = Math.min(1, v / max);
            return (
              <g key={c}>
                <rect
                  x={labelW + ci * cell + 2}
                  y={24 + ri * cell + 2}
                  width={cell - 4}
                  height={cell - 4}
                  rx={6}
                  fill="var(--accent)"
                  opacity={0.12 + intensity * 0.78}
                >
                  <title>
                    {r} · {c}: {valueLabel(v)}
                  </title>
                </rect>
                <text
                  x={labelW + ci * cell + cell / 2}
                  y={24 + ri * cell + cell / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={intensity > 0.55 ? "fill-on-accent" : "fill-text-primary"}
                  style={{ font: "600 9px var(--font-mono)" }}
                >
                  {valueLabel(v)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/* ============================== Radar ============================== */

export function RadarSVG({
  axes,
  series,
  size = 260,
}: {
  axes: string[];
  series: { label: string; color?: string; values: number[] }[];
  size?: number;
}) {
  const center = size / 2;
  const radius = size / 2 - 36;
  const angleFor = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
  const pointFor = (i: number, value: number) => {
    const angle = angleFor(i);
    const r = radius * Math.min(1, Math.max(0, value));
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Radar chart across ${axes.join(", ")}`} className="mx-auto h-auto w-full max-w-[320px]">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, i) => pointFor(i, ring).join(",")).join(" ")}
          fill="none"
          stroke={chartVar.grid}
          strokeWidth={1}
        />
      ))}
      {axes.map((axis, i) => {
        const [x, y] = pointFor(i, 1.14);
        return (
          <text key={axis} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-text-tertiary" style={{ font: "600 9px var(--font-sans)" }}>
            {axis}
          </text>
        );
      })}
      {series.map((s, si) => {
        const color = s.color ?? chartPalette[si % chartPalette.length];
        return (
          <polygon
            key={s.label}
            points={s.values.map((v, i) => pointFor(i, v).join(",")).join(" ")}
            fill={color}
            fillOpacity={0.16}
            stroke={color}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}

/* ============================== Network ============================== */

export interface NetworkNode {
  id: string;
  label: string;
  group?: number;
}
export interface NetworkEdge {
  source: string;
  target: string;
  weight?: number;
}

export function NetworkSVG({ nodes, edges, size = 320 }: { nodes: NetworkNode[]; edges: NetworkEdge[]; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 40;
  const positions = new Map<string, [number, number]>();
  nodes.forEach((n, i) => {
    const angle = (Math.PI * 2 * i) / nodes.length - Math.PI / 2;
    positions.set(n.id, [center + radius * Math.cos(angle), center + radius * Math.sin(angle)]);
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Relationship network" className="mx-auto h-auto w-full max-w-[380px]">
      {edges.map((e, i) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;
        return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={chartVar.grid} strokeWidth={1 + (e.weight ?? 1)} />;
      })}
      {nodes.map((n) => {
        const pos = positions.get(n.id)!;
        const color = chartPalette[(n.group ?? 0) % chartPalette.length];
        return (
          <g key={n.id}>
            <circle cx={pos[0]} cy={pos[1]} r={9} fill={color} />
            <text x={pos[0]} y={pos[1] + 20} textAnchor="middle" className="fill-text-secondary" style={{ font: "600 9px var(--font-sans)" }}>
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================== Waterfall ============================== */

export interface WaterfallStep {
  label: string;
  delta: number;
  isTotal?: boolean;
}

export function WaterfallSVG({ steps, height = 220, valueFormat = (v: number) => String(Math.round(v)) }: { steps: WaterfallStep[]; height?: number; valueFormat?: (v: number) => string }) {
  const width = Math.max(480, steps.length * 90);
  const padding = { top: 16, bottom: 28, left: 44, right: 12 };
  const innerH = height - padding.top - padding.bottom;
  let running = 0;
  const bars = steps.map((s) => {
    const start = s.isTotal ? 0 : running;
    const end = s.isTotal ? s.delta : running + s.delta;
    running = s.isTotal ? s.delta : end;
    return { ...s, start, end };
  });
  const allValues = bars.flatMap((b) => [b.start, b.end]);
  const min = Math.min(0, ...allValues);
  const max = Math.max(...allValues, 1);
  const range = max - min || 1;
  const bandWidth = (width - padding.left - padding.right) / steps.length;
  const yAt = (v: number) => padding.top + innerH - ((v - min) / range) * innerH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Waterfall chart" className="h-auto w-full min-w-[320px]">
      <line x1={padding.left} x2={width - padding.right} y1={yAt(0)} y2={yAt(0)} stroke={chartVar.axis} strokeWidth={1} />
      {bars.map((b, i) => {
        const x = padding.left + i * bandWidth + bandWidth * 0.15;
        const w = bandWidth * 0.7;
        const top = yAt(Math.max(b.start, b.end));
        const barHeight = Math.max(2, Math.abs(yAt(b.start) - yAt(b.end)));
        const color = b.isTotal ? chartPalette[0] : b.delta >= 0 ? "var(--severity-good)" : "var(--severity-critical)";
        return (
          <g key={b.label}>
            <rect x={x} y={top} width={w} height={barHeight} rx={4} fill={color} />
            <text x={x + w / 2} y={top - 6} textAnchor="middle" className="fill-text-primary" style={{ font: "600 10px var(--font-mono)" }}>
              {valueFormat(b.end)}
            </text>
            <text x={x + w / 2} y={height - 8} textAnchor="middle" className="fill-text-tertiary" style={{ font: "500 10px var(--font-sans)" }}>
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function cssClassForTrend(delta: number) {
  return cn(delta > 0 ? "text-severity-good" : delta < 0 ? "text-severity-critical" : "text-text-tertiary");
}
