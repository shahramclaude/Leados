import { cx } from "./cx";

export interface ProgressBarProps {
  value: number; // 0-100
  label: string;
  tone?: "accent" | "success" | "warning" | "danger";
  showValue?: boolean;
}

const TONE_CLASS = {
  accent: "bg-[var(--accent-default)]",
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  danger: "bg-[var(--status-danger)]",
};

export function ProgressBar({ value, label, tone = "accent", showValue = true }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <div className="flex items-center justify-between">
        <span className="text-[var(--text-xs)] text-[var(--text-secondary)]">{label}</span>
        {showValue && <span className="font-mono-nums text-[var(--text-xs)] text-[var(--text-muted)]">{clamped.toFixed(0)}%</span>}
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-sunken)]"
      >
        <div
          className={cx("h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-decelerate)]", TONE_CLASS[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
