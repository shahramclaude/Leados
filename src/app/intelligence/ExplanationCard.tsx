import type { Explanation } from "@/lib/intelligence/types";

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toFixed(3);
}

/** Renders the explainability contract — EVERY field of `Explanation` is
 * shown. This component is the only sanctioned way findings/scores reach
 * the screen; nothing in this app renders a bare number. */
export function ExplanationCard({ explanation, title }: { explanation: Explanation; title?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{title ?? explanation.label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(explanation.value)}</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          {explanation.method}
        </span>
      </div>

      <div className="mt-3 text-sm text-slate-600">
        {explanation.interval.kind} interval ({Math.round(explanation.interval.level * 100)}%): {formatNumber(explanation.interval.low)} – {formatNumber(explanation.interval.high)}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${Math.round(explanation.confidence * 100)}%` }} />
        </div>
        <span className="text-xs text-slate-500">confidence {Math.round(explanation.confidence * 100)}%</span>
      </div>

      {explanation.drivers.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Drivers</p>
          <ul className="mt-1 space-y-1">
            {explanation.drivers.slice(0, 5).map((d, i) => (
              <li key={`${d.name}-${i}`} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{d.name}</span>
                <span className={d.contribution >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {d.contribution >= 0 ? "+" : ""}
                  {formatNumber(d.contribution)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {explanation.evidence.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-500">
            {explanation.evidence.slice(0, 4).map((e, i) => (
              <li key={`${e.id}-${i}`}>
                [{e.type}] {e.label} — {new Date(e.timestamp).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {explanation.caveats.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          {explanation.caveats.map((c, i) => (
            <p key={i}>⚠ {c}</p>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">as of {new Date(explanation.asOf).toLocaleString()}</p>
    </div>
  );
}
