import { useState } from "react";
import { Card, SectionHeader, Badge, ProgressBar } from "../components/ui";
import { recommendations } from "../data/mockData";

export function Recommender() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <SectionHeader title="Recommender" subtitle="Every recommendation passes an honesty lint before it is allowed to render. Failures are shown, not hidden." />
      <div className="space-y-3">
        {recommendations.map((r) => (
          <Card key={r.id} className={!r.lintPassed ? "border-rose-300 bg-rose-50/40" : undefined}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-800">{r.title}</p>
                  <Badge tone={r.lintPassed ? "emerald" : "rose"}>{r.lintPassed ? "Lint passed" : "Lint failed"}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{r.rationale}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Confidence</span>
                  <div className="w-32"><ProgressBar value={r.confidence * 100} tone={r.confidence > 0.6 ? "emerald" : "amber"} /></div>
                  <span className="text-xs font-medium text-slate-600">{Math.round(r.confidence * 100)}%</span>
                </div>
                <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">
                  {expanded === r.id ? "Hide lint notes" : "Show lint notes"}
                </button>
                {expanded === r.id && (
                  <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {r.lintNotes.map((n) => <li key={n}>• {n}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Design rule: a recommendation that fails the lint still displays (transparency), but is visually and
        structurally marked as failed rather than filtered silently.
      </p>
    </div>
  );
}
