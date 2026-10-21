import { Sparkline } from "@/components/charts/Sparkline";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface MetricTileProps {
  label: string;
  value: string;
  interval?: string;
  trend?: number[];
  comparison?: { value: number; label: string };
  provenance?: string;
  className?: string;
  loading?: boolean;
}

/**
 * MetricTile — value + interval + sparkline + comparison + provenance
 * tooltip. The single numeric-summary primitive for dashboards; DataTable
 * numeric cells and dashboard "scorecards" both reuse it.
 * All numerals render with tabular-nums via [data-metric].
 */
export function MetricTile({ label, value, interval, trend, comparison, provenance, className, loading }: MetricTileProps) {
  if (loading) {
    return (
      <div className={cn("flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4", className)}>
        <span className="block h-3 w-20 animate-pulse rounded bg-[var(--surface-sunken)]" />
        <span className="block h-7 w-28 animate-pulse rounded bg-[var(--surface-sunken)]" />
        <span className="block h-8 w-full animate-pulse rounded bg-[var(--surface-sunken)]" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--text-sm)] font-medium text-[var(--text-muted)]">{label}</span>
        {provenance && (
          <Tooltip content={provenance}>
            <button type="button" aria-label={`Provenance for ${label}`} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              ⓘ
            </button>
          </Tooltip>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span data-metric className="text-[var(--text-2xl)] font-semibold leading-[var(--leading-tight)] text-[var(--text-primary)]">
          {value}
        </span>
        {interval && <span data-metric className="text-[var(--text-sm)] text-[var(--text-muted)]">{interval}</span>}
      </div>

      {comparison && (
        <span
          data-metric
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-[var(--radius-full)] px-1.5 py-0.5 text-[var(--text-sm)] font-medium",
          )}
          style={{
            backgroundColor: comparison.value >= 0 ? "var(--success-tint)" : "var(--danger-tint)",
            color: comparison.value >= 0 ? "var(--success-ink)" : "var(--danger-ink)",
          }}
        >
          {formatDelta(comparison.value)} {comparison.label}
        </span>
      )}

      {trend && trend.length > 1 && <Sparkline data={trend} ariaLabel={`${label} trend`} width={140} height={36} />}
    </div>
  );
}
