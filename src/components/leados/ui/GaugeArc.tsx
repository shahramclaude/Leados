export interface GaugeArcProps {
  value: number; // 0 - 100
  label?: string;
  colorStops?: [number, string][]; // [percentThreshold, color]
  size?: number;
}

const defaultStops: [number, string][] = [
  [33, "var(--sev2)"],
  [66, "var(--sev3)"],
  [100, "var(--sev5)"],
];

function resolveColor(value: number, stops: [number, string][]) {
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);
  for (const [threshold, color] of sorted) {
    if (value <= threshold) return color;
  }
  return sorted[sorted.length - 1]?.[1] ?? "var(--accent-blue)";
}

export default function GaugeArc({ value, label, colorStops = defaultStops, size = 160 }: GaugeArcProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const color = resolveColor(clamped, colorStops);

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
        />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="font-data tabular-nums font-semibold"
          style={{ fill: "var(--text-primary)", fontSize: 22 }}
        >
          {Math.round(clamped)}
        </text>
      </svg>
      {label && (
        <span
          className="-mt-1 text-center uppercase tracking-wide"
          style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
