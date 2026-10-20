export interface ProgressRingProps {
  value: number; // 0-100
  label: string;
  size?: number;
  tone?: "accent" | "success" | "warning" | "danger";
}

const TONE_VAR: Record<NonNullable<ProgressRingProps["tone"]>, string> = {
  accent: "var(--accent-default)",
  success: "var(--status-success)",
  warning: "var(--status-warning)",
  danger: "var(--status-danger)",
};

export function ProgressRing({ value, label, size = 56, tone = "accent" }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div role="img" aria-label={`${label}: ${clamped.toFixed(0)}%`} className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_VAR[tone]}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-decelerate)" }}
        />
      </svg>
      <span className="font-mono-nums absolute text-[var(--text-xs)] text-[var(--text-primary)]">{clamped.toFixed(0)}%</span>
    </div>
  );
}
