import { CONFIDENCE_LEVELS, DOMAIN_META, type ConfidenceLevelId, type DomainId } from "@/design/tokens";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface DecisionTimelineEvent {
  id: string;
  date: string;
  title: string;
  description?: string;
  domain: DomainId;
  confidence: ConfidenceLevelId;
}

export interface DecisionTimelineProps {
  events: DecisionTimelineEvent[];
  className?: string;
}

/**
 * DecisionTimeline — vertical sequence of decisions/events. Grouping is by
 * Gestalt PROXIMITY (spacing) along a single rail; the domain is shown as a
 * colored node + text label (redundant coding), never as a colored
 * background block (so the rail stays one visual object, not a trellis of
 * competing borders).
 */
export function DecisionTimeline({ events, className }: DecisionTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-6 text-center text-[var(--text-sm)] text-[var(--text-muted)]">
        No decisions recorded yet.
      </div>
    );
  }

  return (
    <ol className={cn("relative flex flex-col gap-6 pl-6", className)}>
      <div aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--border-subtle)]" />
      {events.map((event) => {
        const domain = DOMAIN_META[event.domain];
        const confidence = CONFIDENCE_LEVELS.find((l) => l.id === event.confidence)!;
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-6 top-1 size-3.5 rounded-full border-2 border-[var(--surface-0)]"
              style={{ backgroundColor: `var(${domain.cssVar})` }}
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <time dateTime={event.date} className="text-[var(--text-sm)] tabular-nums text-[var(--text-muted)]">
                {formatDate(event.date)}
              </time>
              <span className="text-[var(--text-sm)] font-medium" style={{ color: `var(${domain.cssVar})` }}>
                {domain.label}
              </span>
              <span className="text-[var(--text-sm)] text-[var(--text-muted)]">· {confidence.label}</span>
            </div>
            <h4 className="mt-0.5 text-[var(--text-base)] font-semibold text-[var(--text-primary)]">{event.title}</h4>
            {event.description && <p className="measure mt-0.5 text-[var(--text-sm)] text-[var(--text-secondary)]">{event.description}</p>}
          </li>
        );
      })}
    </ol>
  );
}
