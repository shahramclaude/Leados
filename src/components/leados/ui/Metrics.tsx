"use client";

import { useEffect, useRef, useState } from "react";
import { SparklineSVG } from "../charts/SparklineSVG";

export function ProgressBar({
  value,
  max = 100,
  label,
  tone = "accent",
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const toneVar = tone === "accent" ? "var(--accent-default)" : `var(--status-${tone})`;
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <div className="flex justify-between text-xs text-text-secondary">
          <span>{label}</span>
          <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]"
          style={{ width: `${pct}%`, backgroundColor: toneVar }}
        />
      </div>
    </div>
  );
}

/** Counts up once from 0 on mount/update — respects prefers-reduced-motion by skipping to final value. */
function useCountUp(target: number, durationMs = 600) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setValue(target);
      return;
    }
    startRef.current = null;
    let frame: number;
    function step(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const progress = Math.min(1, (timestamp - startRef.current) / durationMs);
      setValue(target * progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export interface StatTileProps {
  label: string;
  value: number;
  unit?: string;
  format?: (value: number) => string;
  delta?: number;
  deltaLabel?: string;
  sparkline?: number[];
  tone?: "neutral" | "success" | "danger";
}

export function StatTile({ label, value, unit, format, delta, deltaLabel, sparkline, tone = "neutral" }: StatTileProps) {
  const animated = useCountUp(value);
  const formatted = format ? format(animated) : animated.toFixed(1);
  const deltaPositive = (delta ?? 0) >= 0;
  const deltaTone = tone === "neutral" ? (deltaPositive ? "success" : "danger") : tone;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--comp-card-radius)] border border-border-subtle bg-surface-raised p-[var(--comp-card-padding)]">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold tabular-nums text-text-primary">{formatted}</span>
        {unit ? <span className="text-sm text-text-muted">{unit}</span> : null}
      </div>
      {typeof delta === "number" ? (
        <p
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: `var(--status-${deltaTone})` }}
        >
          <span aria-hidden="true">{deltaPositive ? "▲" : "▼"}</span>
          <span className="font-mono tabular-nums">
            {deltaPositive ? "+" : ""}
            {delta}%
          </span>
          {deltaLabel ? <span className="text-text-muted">{deltaLabel}</span> : null}
        </p>
      ) : null}
      {sparkline ? (
        <div className="mt-1">
          <SparklineSVG data={sparkline} width={140} height={32} ariaLabel={`${label} trend`} />
        </div>
      ) : null}
    </div>
  );
}

export function GaugeArc({
  value,
  max = 100,
  label,
  size = 120,
}: {
  value: number;
  max?: number;
  label: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = size / 2 - 10;
  const circumference = Math.PI * radius; // semicircle
  const cx = size / 2;
  const cy = size / 2;
  const offset = circumference * (1 - pct);

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 12} role="img" aria-label={`${label}: ${Math.round(pct * 100)}%`}>
        <path
          d={`M 10 ${cy} A ${radius} ${radius} 0 0 1 ${size - 10} ${cy}`}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={`M 10 ${cy} A ${radius} ${radius} 0 0 1 ${size - 10} ${cy}`}
          fill="none"
          stroke="var(--accent-default)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-standard)" }}
        />
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-text-primary font-mono text-sm font-semibold tabular-nums">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <figcaption className="text-xs text-text-muted">{label}</figcaption>
    </figure>
  );
}

export function ProgressRing({ value, max = 100, size = 56, strokeWidth = 6, label }: { value: number; max?: number; size?: number; strokeWidth?: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  return (
    <svg width={size} height={size} role="img" aria-label={`${label}: ${Math.round(pct * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--chart-grid)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent-default)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-standard)" }}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="fill-text-primary font-mono text-xs font-semibold tabular-nums">
        {Math.round(pct * 100)}
      </text>
    </svg>
  );
}
