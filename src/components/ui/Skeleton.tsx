import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
  /** Accessible label announced once via a visually-hidden node; avoids a
   * live region per skeleton (which would spam screen readers). */
  label?: string;
}

/**
 * Skeleton — the single loading-placeholder primitive. Respects
 * prefers-reduced-motion (the shimmer animation is driven by --motion-base,
 * which collapses to 0ms automatically).
 */
export function Skeleton({ className, label = "Loading" }: SkeletonProps) {
  return (
    <span
      role="status"
      className={cn(
        "block animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunken)]",
        className,
      )}
    >
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
