"use client";

import { useState } from "react";
import type { Explain } from "@/lib/explain";
import { CONFIDENCE_LEVELS } from "@/design/tokens";
import { ConfidenceBar } from "./ConfidenceBar";
import { ExplainDrawer } from "./ExplainDrawer";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export interface InsightCardProps<T> {
  title: string;
  insight: Explain<T>;
  className?: string;
}

/**
 * InsightCard — the display face of `Explain<T>`.
 * Contract:
 *  - Always shows: title, claim (prose, measure-constrained), confidence
 *    step (compact ConfidenceBar), up to 4 evidence chips (+N overflow).
 *  - "Explain" button opens a Dialog(variant="drawer") with the full
 *    method/evidence/caveats — nothing in the drawer is exclusive
 *    information; it is always a superset of what the card shows.
 *  - States: default / hover (raise elevation) / focus-visible on the
 *    Explain trigger / loading (skeleton, see styleguide) / error (claim
 *    replaced by a retry affordance — see DataTable error pattern reused).
 */
export function InsightCard<T>({ title, insight, className }: InsightCardProps<T>) {
  const [explainOpen, setExplainOpen] = useState(false);
  const level = CONFIDENCE_LEVELS.find((l) => l.id === insight.confidence)!;
  const visibleEvidence = insight.evidence.slice(0, 4);
  const overflow = insight.evidence.length - visibleEvidence.length;

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4",
        "transition-shadow duration-[var(--motion-base)] ease-[var(--motion-ease-standard)] hover:shadow-[var(--elevation-2)]",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-[var(--text-md)] font-semibold text-[var(--text-primary)]">{title}</h3>
        <Badge tone={level.index <= 2 ? "success" : level.index >= 4 ? "warn" : "info"}>{level.label}</Badge>
      </header>

      <p className="measure text-[var(--text-base)] leading-[var(--leading-normal)] text-[var(--text-secondary)]">
        {insight.claim}
      </p>

      <ConfidenceBar level={insight.confidence} compact />

      {visibleEvidence.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Evidence">
          {visibleEvidence.map((chip) => (
            <li key={chip.id}>
              <Badge tone="neutral">{chip.label}</Badge>
            </li>
          ))}
          {overflow > 0 && (
            <li>
              <Badge tone="neutral">+{overflow} more</Badge>
            </li>
          )}
        </ul>
      )}

      <div>
        <button
          type="button"
          onClick={() => setExplainOpen(true)}
          className="text-[var(--text-sm)] font-medium text-[var(--text-link)] hover:underline"
        >
          Explain this →
        </button>
      </div>

      <ExplainDrawer open={explainOpen} onClose={() => setExplainOpen(false)} title={title} insight={insight} />
    </article>
  );
}
