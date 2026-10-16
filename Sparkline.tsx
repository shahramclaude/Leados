import { useId } from "react";
import type { Confidence } from "./types";

interface SparklineProps {
  points: number[];
  type?: "line" | "bar" | "area" | "winloss";
  size?: "compact" | "extended";
  conf?: Confidence;
  color?: string;
  unit?: string;
  label?: string;
}

/** Inline sparkline — intentionally NOT wrapped in ChartFrame (no caption/
 * table toggle chrome) since the brief specifies this is a compact, inline
 * element for table cells and cards. It still carries title/desc/role=img
 * for accessibility per the brief's blanket a11y rule. */
export function Sparkline({
  points,
  type = "line",
  size = "compact",
  conf = "high",
  color = "var(--accent)",
  unit = "",
  label,
}: SparklineProps) {
  const uid = useId();
  const w = size === "compact" ? 80 : 240;
  const h = size === "compact" ? 24 : 48;
  const pad = 2;
  const last3 = points.slice(-3);
  const slope = last3.length >= 2 ? last3[last3.length - 1] - last3[0] : 0;
  const arrow = slope > 0.01 ? "↗" : slope < -0.01 ? "↘" : "→";
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1 || 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const last = points[points.length - 1];

  const titleId = `${uid}-t`;
  const descId = `${uid}-d`;
  const desc = `${label ?? "Series"} trend ${arrow}, last value ${last}${unit}`;

  return (
    <span className="inline-flex items-center gap-1 align-middle" style={{ opacity: conf === "low" ? 0.5 : 1 }}>
      <svg
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
      >
        <title id={titleId}>{label ?? "Sparkline"}</title>
        <desc id={descId}>{desc}</desc>
        {type === "winloss" ? (
          points.map((v, i) => {
            const bw = (w - pad * 2) / points.length - 1;
            const bh = h / 2 - pad;
            const bx = pad + i * ((w - pad * 2) / points.length);
            return (
              <rect
                key={i}
                x={bx}
                y={v >= 0 ? h / 2 - bh : h / 2}
                width={Math.max(1, bw)}
                height={bh}
                fill={v >= 0 ? "var(--sev-1)" : "var(--sev-5)"}
              />
            );
          })
        ) : type === "bar" ? (
          points.map((v, i) => {
            const bw = (w - pad * 2) / points.length - 1;
            const bx = pad + i * ((w - pad * 2) / points.length);
            return (
              <rect
                key={i}
                x={bx}
                y={y(v)}
                width={Math.max(1, bw)}
                height={h - pad - y(v)}
                fill={color}
              />
            );
          })
        ) : (
          <>
            {type === "area" && (
              <path
                d={
                  `M ${x(0)},${h - pad} ` +
                  points.map((v, i) => `L ${x(i)},${y(v)}`).join(" ") +
                  ` L ${x(points.length - 1)},${h - pad} Z`
                }
                fill={color}
                opacity={0.15}
              />
            )}
            <path
              d={points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={conf === "low" ? "3 2" : undefined}
            />
          </>
        )}
      </svg>
      <span className="font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-2)" }}>
        {last}
        {unit} {arrow}
      </span>
    </span>
  );
}
