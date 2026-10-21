import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import type { DomainId, SemanticId } from "@/design/tokens";

export type BadgeTone = SemanticId | DomainId | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_VARS: Record<BadgeTone, { tint: string; ink: string }> = {
  success: { tint: "var(--success-tint)", ink: "var(--success-ink)" },
  warn: { tint: "var(--warn-tint)", ink: "var(--warn-ink)" },
  danger: { tint: "var(--danger-tint)", ink: "var(--danger-ink)" },
  info: { tint: "var(--info-tint)", ink: "var(--info-ink)" },
  strategy: { tint: "var(--domain-strategy-tint)", ink: "var(--domain-strategy-ink)" },
  people: { tint: "var(--domain-people-tint)", ink: "var(--domain-people-ink)" },
  finance: { tint: "var(--domain-finance-tint)", ink: "var(--domain-finance-ink)" },
  operations: { tint: "var(--domain-operations-tint)", ink: "var(--domain-operations-ink)" },
  risk: { tint: "var(--domain-risk-tint)", ink: "var(--domain-risk-ink)" },
  knowledge: { tint: "var(--domain-knowledge-tint)", ink: "var(--domain-knowledge-ink)" },
  neutral: { tint: "var(--surface-sunken)", ink: "var(--text-secondary)" },
};

/**
 * Badge — the only chip/pill implementation in the system. Uses the
 * tint+ink token pair for each tone, which is script-verified to clear
 * APCA Lc >= 90 (body text class) against both the tint and the page
 * surface in light and dark themes.
 */
export function Badge({ tone = "neutral", className, style, children, ...props }: BadgeProps) {
  const vars = TONE_VARS[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5",
        "text-[var(--text-sm)] font-medium leading-[var(--leading-tight)]",
        className,
      )}
      style={{ backgroundColor: vars.tint, color: vars.ink, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
