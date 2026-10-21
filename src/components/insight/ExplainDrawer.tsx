import type { Explain } from "@/lib/explain";
import { Dialog } from "@/components/ui/Dialog";
import { ConfidenceBar } from "./ConfidenceBar";
import { formatDate } from "@/lib/format";

export interface ExplainDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  insight: Explain<T>;
}

/**
 * ExplainDrawer — full detail view for an `Explain<T>`. Always a superset of
 * the InsightCard summary: full confidence rationale, every evidence chip
 * (as links where available), method text, and caveats (rendered even when
 * empty-state copy is needed — caveats are never silently dropped).
 */
export function ExplainDrawer<T>({ open, onClose, title, insight }: ExplainDrawerProps<T>) {
  return (
    <Dialog open={open} onClose={onClose} title={`Explain: ${title}`} variant="drawer">
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Claim</h3>
          <p className="measure mt-1 text-[var(--text-base)] text-[var(--text-primary)]">{insight.claim}</p>
        </section>

        <section>
          <h3 className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Confidence</h3>
          <div className="mt-2">
            <ConfidenceBar level={insight.confidence} />
          </div>
        </section>

        {insight.method && (
          <section>
            <h3 className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Method</h3>
            <p className="measure mt-1 text-[var(--text-base)] text-[var(--text-secondary)]">{insight.method}</p>
          </section>
        )}

        <section>
          <h3 className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Evidence ({insight.evidence.length})
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {insight.evidence.map((chip) =>
              chip.href ? (
                <li key={chip.id}>
                  <a href={chip.href} className="text-[var(--text-sm)] font-medium text-[var(--text-link)] hover:underline">
                    {chip.label} ↗
                  </a>
                </li>
              ) : (
                <li key={chip.id} className="text-[var(--text-sm)] text-[var(--text-secondary)]">
                  {chip.label}
                </li>
              ),
            )}
          </ul>
        </section>

        <section>
          <h3 className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Caveats</h3>
          {insight.caveats && insight.caveats.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--text-sm)] text-[var(--text-secondary)]">
              {insight.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[var(--text-sm)] text-[var(--text-muted)]">No caveats recorded for this insight.</p>
          )}
        </section>

        {insight.asOf && (
          <p className="text-[var(--text-sm)] tabular-nums text-[var(--text-muted)]">As of {formatDate(insight.asOf)}</p>
        )}
      </div>
    </Dialog>
  );
}
