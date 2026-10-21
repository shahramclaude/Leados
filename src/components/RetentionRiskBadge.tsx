// A compact badge rendering a flight-risk Explain<number> without ever
// stating a causal/ predictive claim ("will leave"). Scanned by
// scripts/scan-causal-language.ts.
import type { Explain } from "@/lib/explain";

function tier(value: number): { label: string; classes: string } {
  if (value >= 0.5) return { label: "Elevated signal", classes: "bg-rose-100 text-rose-800 border-rose-200" };
  if (value >= 0.25) return { label: "Watch", classes: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "Low signal", classes: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

export function RetentionRiskBadge({ explain }: { explain: Explain<number> }) {
  const t = tier(explain.value);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.classes}`}
      title={`Estimated probability: ${(explain.value * 100).toFixed(1)}% (80% interval ${
        explain.confidence ? `${(explain.confidence.low * 100).toFixed(0)}–${(explain.confidence.high * 100).toFixed(0)}%` : "n/a"
      }). Decision support, not a prediction of what this person will do.`}
    >
      {t.label} · {(explain.value * 100).toFixed(0)}%
    </span>
  );
}
