"use client";
import React from "react";

export function Sparkline({ values, width = 120, height = 32, color = "#38bdf8" }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function Histogram({
  data,
  width = 320,
  height = 120,
  color = "#818cf8",
  annotations,
}: {
  data: { bucket: number; count: number }[];
  width?: number;
  height?: number;
  color?: string;
  annotations?: { label: string; value: number; color?: string }[];
}) {
  if (data.length === 0) return <svg width={width} height={height} />;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const minBucket = data[0].bucket;
  const maxBucket = data[data.length - 1].bucket || minBucket + 1;
  const barWidth = width / data.length;
  return (
    <svg width={width} height={height + 20} className="overflow-visible">
      {data.map((d, i) => {
        const h = (d.count / maxCount) * height;
        return <rect key={i} x={i * barWidth} y={height - h} width={Math.max(1, barWidth - 1)} height={h} fill={color} opacity={0.85} />;
      })}
      {(annotations ?? []).map((a, i) => {
        const x = ((a.value - minBucket) / (maxBucket - minBucket || 1)) * width;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={0} y2={height} stroke={a.color ?? "#f472b6"} strokeDasharray="3,3" strokeWidth={1.5} />
            <text x={x} y={height + 14} fontSize={9} fill={a.color ?? "#f472b6"} textAnchor="middle">
              {a.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  series,
  width = 480,
  height = 160,
  color = "#34d399",
  forecastColor = "#f59e0b",
  splitIndex,
}: {
  series: { ts: string; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  forecastColor?: string;
  splitIndex?: number;
}) {
  if (series.length < 2) return <svg width={width} height={height} />;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (series.length - 1);
  const toPoint = (v: number, i: number) => `${i * step},${height - ((v - min) / range) * height}`;
  const historyPts = series.slice(0, splitIndex ?? series.length).map((p, i) => toPoint(p.value, i));
  const forecastPts = splitIndex !== undefined ? series.slice(splitIndex - 1).map((p, i) => toPoint(p.value, i + splitIndex - 1)) : [];
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={historyPts.join(" ")} fill="none" stroke={color} strokeWidth={2} />
      {forecastPts.length > 0 && <polyline points={forecastPts.join(" ")} fill="none" stroke={forecastColor} strokeWidth={2} strokeDasharray="4,3" />}
    </svg>
  );
}

export function GaugeRing({ value, max = 100, size = 120, color = "#38bdf8", label }: { value: number; max?: number; size?: number; color?: string; label?: string }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value / max));
  const offset = circumference * (1 - pct);
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeWidth={10} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={10}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 2} textAnchor="middle" fontSize={20} fontWeight={700} fill="#e2e8f0">
        {Math.round(value)}
      </text>
      {label && (
        <text x={size / 2} y={size / 2 + 20} textAnchor="middle" fontSize={9} fill="#94a3b8">
          {label}
        </text>
      )}
    </svg>
  );
}

export function ProbabilityBar({ p5, p50, p95, max, width = 320, height = 28 }: { p5: number; p50: number; p95: number; max: number; width?: number; height?: number }) {
  const x = (v: number) => (Math.max(0, Math.min(max, v)) / max) * width;
  return (
    <svg width={width} height={height}>
      <rect x={0} y={height / 2 - 4} width={width} height={8} rx={4} fill="#1e293b" />
      <rect x={x(p5)} y={height / 2 - 4} width={Math.max(0, x(p95) - x(p5))} height={8} rx={4} fill="#38bdf8" opacity={0.4} />
      <circle cx={x(p50)} cy={height / 2} r={6} fill="#38bdf8" />
    </svg>
  );
}

export function CalibrationPlot({ points, width = 240, height = 240 }: { points: { predictedBucket: number; actualRate: number; n: number }[]; width?: number; height?: number }) {
  const pad = 24;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const toXY = (px: number, py: number) => [pad + px * w, height - pad - py * h];
  return (
    <svg width={width} height={height}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#334155" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#334155" />
      <line x1={pad} y1={height - pad} x2={width - pad} y2={pad} stroke="#475569" strokeDasharray="4,4" />
      {points.map((p, i) => {
        const [x, y] = toXY(p.predictedBucket, p.actualRate);
        return <circle key={i} cx={x} cy={y} r={Math.max(3, Math.min(10, p.n))} fill="#f472b6" opacity={0.85} />;
      })}
      {points.length > 1 && (
        <polyline
          points={points.map((p) => toXY(p.predictedBucket, p.actualRate).join(",")).join(" ")}
          fill="none"
          stroke="#f472b6"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
