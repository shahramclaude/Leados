import type { ReactNode } from "react";
import { cx } from "./cx";
import { SEVERITY_META, STATUS_META, type SeverityLevel } from "./tokens";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  success: "bg-[var(--status-success-subtle)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-subtle)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-subtle)] text-[var(--status-danger)]",
  info: "bg-[var(--status-info-subtle)] text-[var(--status-info)]",
  accent: "bg-[var(--accent-subtle)] text-[var(--accent-default)]",
};

export function Badge({ tone = "neutral", children, icon }: { tone?: BadgeTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-full)] px-[var(--space-2)] py-[2px] text-[var(--text-xs)] font-medium",
        TONE_CLASS[tone],
      )}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<keyof typeof STATUS_META, BadgeTone> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

/** Status is always encoded by color + icon glyph + text label — never
 * color alone (colorblind-safe requirement). */
export function StatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={STATUS_TONE[status]} icon={meta.shape}>
      {meta.label}
    </Badge>
  );
}

/** Severity 1–5 is always encoded by color + shape + numeric level + label. */
export function SeverityBadge({ level }: { level: SeverityLevel }) {
  const meta = SEVERITY_META[level];
  const tone: BadgeTone = level <= 2 ? "success" : level === 3 ? "warning" : "danger";
  return (
    <Badge tone={tone} icon={meta.shape}>
      S{level} · {meta.label}
    </Badge>
  );
}
