import { POSSIBILITY_DISCLAIMER } from "../../lib/core/explain";

interface PossibilityBannerProps {
  authoredAt: string;
  authoredBy?: string;
  extra?: string;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Standing affordance required on every scenario/foresight surface:
 * possibilities-not-predictions disclaimer + authored timestamp. The
 * timestamp is the anti-hindsight-bias record — it proves when this was
 * written, so nobody can claim foresight after the fact.
 */
export function PossibilityBanner({ authoredAt, authoredBy, extra }: PossibilityBannerProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5">🧭</span>
        <p>
          <span className="font-semibold">Possibility, not prediction.</span> {POSSIBILITY_DISCLAIMER}
          {extra ? <span> {extra}</span> : null}
        </p>
      </div>
      <div className="shrink-0 text-xs font-medium text-amber-700 sm:text-right">
        Authored {formatTimestamp(authoredAt)}
        {authoredBy ? ` · ${authoredBy}` : ""}
      </div>
    </div>
  );
}
