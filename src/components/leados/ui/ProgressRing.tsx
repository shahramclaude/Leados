export interface ProgressRingProps {
  value: number; // 0 - 100
  size?: "sm" | "md" | "lg";
  color?: string;
  label?: string;
}

const sizeMap: Record<"sm" | "md" | "lg", { box: number; stroke: number; font: number }> = {
  sm: { box: 36, stroke: 4, font: 10 },
  md: { box: 56, stroke: 5, font: 13 },
  lg: { box: 84, stroke: 6, font: 17 },
};

export default function ProgressRing({ value, size = "md", color = "var(--accent-blue)", label }: ProgressRingProps) {
  const { box, stroke, font } = sizeMap[size];
  const r = box / 2 - stroke;
  const cx = box / 2;
  const cy = box / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: box, height: box }}>
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span
        className="font-data tabular-nums absolute font-semibold"
        style={{ fontSize: font, color: "var(--text-primary)" }}
      >
        {label ?? Math.round(clamped)}
      </span>
    </div>
  );
}
