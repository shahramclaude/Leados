"use client";

import { cloneElement, useId, useState } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
}

/**
 * Tooltip — single implementation, used for provenance notes (MetricTile),
 * truncated labels, and icon-only buttons. Shows on hover AND focus (never
 * hover-only), dismissible with Escape.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(e) => e.key === "Escape" && setVisible(false)}
    >
      {cloneElement(children, { "aria-describedby": id } as Record<string, unknown>)}
      {visible && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-64 -translate-x-1/2 rounded-[var(--radius-md)]",
            "bg-[var(--text-primary)] px-2.5 py-1.5 text-[var(--text-sm)] text-[var(--surface-0)] shadow-[var(--elevation-2)]",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
