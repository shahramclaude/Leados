import type { ReactNode } from "react";
import { SEVERITY_META, STATUS_META, type Severity, type Status } from "./tokens";

const SHAPE_GLYPH: Record<string, string> = {
  circle: "●",
  triangle: "▲",
  diamond: "◆",
  square: "■",
  star: "★",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "accent" ? "bg-accent-subtle text-accent-default" : "bg-surface-sunken text-text-secondary",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/** Status is always encoded by color + glyph + text label — never color alone. */
export function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span aria-hidden="true" className="font-mono">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  );
}

/** Severity is always encoded by color + shape + numeric level + text label. */
export function SeverityBadge({ level }: { level: Severity }) {
  const meta = SEVERITY_META[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span aria-hidden="true">{SHAPE_GLYPH[meta.shape]}</span>
      <span className="font-mono tabular-nums">S{level}</span>
      {meta.label}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-xs)] border border-border-subtle bg-surface-base px-2 py-0.5 text-xs text-text-secondary">
      {children}
    </span>
  );
}
