import { SEVERITY_META, type SeverityLevel } from "./tokens";

export interface GaugeArcProps {
  value: number; // 0-100
  label: string;
  severity?: SeverityLevel;
  size?: number;
}

/** Semicircular gauge. Color encodes severity but the numeric value and a
 * text label are always rendered too (colorblind-safe). */
export function GaugeArc({ value, label, severity = 3, size = 120 }: GaugeArcProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 10;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const stroke = `var(${SEVERITY_META[severity].var})`;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <figure className="flex flex-col items-center gap-[var(--space-1)]" role="img" aria-label={`${label}: ${clamped.toFixed(0)} of 100, ${SEVERITY_META[severity].label}`}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={stroke}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-decelerate)" }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" className="font-mono-nums" fontSize={20} fill="var(--text-primary)">
          {clamped.toFixed(0)}
        </text>
      </svg>
      <figcaption className="flex items-center gap-[var(--space-1)] text-[var(--text-xs)] text-[var(--text-muted)]">
        <span aria-hidden style={{ color: stroke }}>
          {SEVERITY_META[severity].shape}
        </span>
        {label} · {SEVERITY_META[severity].label}
      </figcaption>
    </figure>
  );
}
