import type { CSSProperties } from "react";
import { cx } from "./cx";

export function Skeleton({
  className,
  style,
  "aria-label": ariaLabel,
}: {
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  return <div role="presentation" aria-hidden={!ariaLabel} aria-label={ariaLabel} style={style} className={cx("leados-skeleton", className)} />;
}

/** A skeleton shaped like the final layout it stands in for — this is what
 * keeps CLS near zero: the real content, once loaded, occupies the same
 * box the skeleton reserved. */
export function SkeletonText({ lines = 3, lastLineWidth = "60%" }: { lines?: number; lastLineWidth?: string }) {
  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: i === lines - 1 ? lastLineWidth : "100%" }} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-[var(--card-padding)]">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-[var(--space-3)]">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
