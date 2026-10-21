// The one and only explanation renderer. Intelligence, people, and finance
// findings all pass through this component — there is no per-domain
// "ExplainPanelFinance" twin. See docs/RED-TEAM-2026.md for why the `detail`
// payload is still rendered generically (USE-2).
import type { Explain } from "@/lib/explain";

const CAUSAL_BADGE: Record<string, string> = {
  correlational: "bg-amber-100 text-amber-800",
  causal: "bg-orange-100 text-orange-800",
  experimental: "bg-emerald-100 text-emerald-800",
};

export function ExplainPanel({
  explanation,
  causalConfidence,
}: {
  explanation: Explain<Record<string, unknown>>;
  causalConfidence: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{explanation.headline}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CAUSAL_BADGE[causalConfidence] ?? "bg-slate-200 text-slate-700"}`}
        >
          {causalConfidence}
        </span>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
        {explanation.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
      {explanation.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {explanation.evidence.map((ev, i) => (
            <span
              key={i}
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600"
              title={ev.ref}
            >
              {ev.label}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Confidence: {(explanation.confidence * 100).toFixed(0)}%
      </p>
    </div>
  );
}
