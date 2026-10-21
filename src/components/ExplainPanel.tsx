// Generic renderer for the Explain<T> contract (Part 04). Any score surfaced
// anywhere in the app should go through this component so the uncertainty,
// inputs and lawful purpose are always visible, never just the headline
// number. scripts/test-contracts.ts asserts every engine output has the
// shape this component expects.
import type { Explain, Driver, Counterfactual } from "@/lib/explain";

function DriverRow({ d }: { d: Driver }) {
  const sign = d.direction === "increases" ? "+" : "−";
  const color = d.direction === "increases" ? "text-rose-600" : "text-emerald-600";
  return (
    <li className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-slate-700">{d.name}</span>
      <span className={`shrink-0 font-mono text-xs ${color}`}>
        {sign}
        {Math.abs(d.contribution * 100).toFixed(1)}pp
        <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{d.causalStatus}</span>
      </span>
    </li>
  );
}

function CounterfactualRow({ c }: { c: Counterfactual }) {
  const sign = c.estimatedDelta >= 0 ? "+" : "";
  return (
    <li className="rounded-lg bg-slate-50 p-2 text-sm">
      <div className="font-medium text-slate-800">{c.change}</div>
      <div className="mt-0.5 text-xs text-slate-600">
        {sign}
        {(c.estimatedDelta * 100).toFixed(1)}pp estimated — {c.note}
      </div>
    </li>
  );
}

export function ExplainPanel<T>({ explain }: { explain: Explain<T> }) {
  return (
    <div className="space-y-3 text-sm">
      {explain.confidence && (
        <div className="text-xs text-slate-500">
          80% interval: {(explain.confidence.low * 100).toFixed(1)}%–{(explain.confidence.high * 100).toFixed(1)}%
        </div>
      )}
      {explain.drivers && explain.drivers.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Drivers</div>
          <ul className="mt-1 divide-y divide-slate-100">
            {explain.drivers.map((d, i) => (
              <DriverRow key={i} d={d} />
            ))}
          </ul>
        </div>
      )}
      {explain.counterfactuals && explain.counterfactuals.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Counterfactual recommendations
          </div>
          <ul className="mt-1 space-y-1.5">
            {explain.counterfactuals.map((c, i) => (
              <CounterfactualRow key={i} c={c} />
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        {explain.uncertaintyNote}
      </div>
      <div className="text-xs text-slate-500">
        <span className="font-medium text-slate-600">Method:</span> {explain.method}
      </div>
      <div className="text-xs text-slate-500">
        <span className="font-medium text-slate-600">Lawful purpose:</span> {explain.lawfulPurpose}
      </div>
      {explain.limitations && explain.limitations.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
          {explain.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <div className="text-[11px] text-slate-400">As of {new Date(explain.asOf).toLocaleString()}</div>
    </div>
  );
}
