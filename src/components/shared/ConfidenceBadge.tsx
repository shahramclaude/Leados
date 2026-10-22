import { CONFIDENCE_LABEL, type ConfidenceClass } from "../../lib/types";
import { cn } from "../../utils/cn";

const STYLES: Record<ConfidenceClass, string> = {
  actual: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  evidence: "bg-sky-50 text-sky-700 ring-sky-600/20",
  forecast: "bg-amber-50 text-amber-700 ring-amber-600/20",
  asserted: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export function ConfidenceBadge({ confidence, compact = false }: { confidence: ConfidenceClass; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STYLES[confidence],
      )}
      title={CONFIDENCE_LABEL[confidence]}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {compact ? confidence : CONFIDENCE_LABEL[confidence]}
    </span>
  );
}
