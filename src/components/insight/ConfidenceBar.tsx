import { CONFIDENCE_LEVELS, type ConfidenceLevelId } from "@/design/tokens";
import { cn } from "@/lib/cn";

export interface ConfidenceBarProps {
  level: ConfidenceLevelId;
  /** Optional interval whiskers, e.g. a modeled estimate's [p10, p90] band
   * expressed as 0..1 fractions of the bar width. */
  interval?: { low: number; high: number; point: number };
  className?: string;
  compact?: boolean;
}

/**
 * ConfidenceBar — 5-step ramp (observed -> assumed) + optional interval
 * whiskers. Behavior contract:
 *  - Always renders the step INDEX and LABEL as text, never color alone.
 *  - The active step gets a filled glyph + ring; inactive steps are outline.
 *  - Interval whiskers (if provided) draw a [low, high] bracket with a
 *    point marker, all on the same horizontal scale (position encodes
 *    value, per Cleveland–McGill — never angle/area for this).
 */
export function ConfidenceBar({ level, interval, className, compact = false }: ConfidenceBarProps) {
  const activeIndex = CONFIDENCE_LEVELS.findIndex((l) => l.id === level);
  const active = CONFIDENCE_LEVELS[activeIndex];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1" role="img" aria-label={`Confidence: ${active.label} (${active.index} of 5, most confident)`}>
          {CONFIDENCE_LEVELS.map((step, i) => (
            <span
              key={step.id}
              aria-hidden
              className={cn("h-2 rounded-full transition-[width] duration-[var(--motion-base)]", compact ? "w-4" : "w-6")}
              style={{
                backgroundColor: i <= activeIndex ? `var(${step.cssVar})` : "var(--border-subtle)",
              }}
            />
          ))}
        </div>
        {!compact && (
          <span className="text-[var(--text-sm)] font-medium text-[var(--text-secondary)]">
            {active.label}
          </span>
        )}
      </div>
      {!compact && <p className="text-[var(--text-sm)] text-[var(--text-muted)]">{active.description}</p>}

      {interval && (
        <div className="relative h-5 w-full rounded-full bg-[var(--surface-sunken)]" aria-hidden>
          <div
            className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-[var(--text-muted)]"
            style={{ left: `${interval.low * 100}%`, width: `${(interval.high - interval.low) * 100}%` }}
          />
          <div
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface-0)]"
            style={{ left: `${interval.point * 100}%`, backgroundColor: `var(${active.cssVar})` }}
          />
        </div>
      )}
      {interval && (
        <p className="text-[var(--text-sm)] tabular-nums text-[var(--text-muted)]">
          Interval {(interval.low * 100).toFixed(0)}–{(interval.high * 100).toFixed(0)} · point {(interval.point * 100).toFixed(0)}
        </p>
      )}
    </div>
  );
}
