import { useMemo } from "react";
import { useAppState } from "../lib/AppContext";
import { runInference } from "../lib/inference";
import { getProtocol } from "../lib/protocol";
import { Card, SectionTitle, SeverityBadge, Pill } from "../components/ui";

export function InferenceView() {
  const { state } = useAppState();
  const findings = useMemo(() => runInference(state.signalBoard), [state.signalBoard]);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Inference"
        subtitle="js/inference.js — forward-chaining engine: Signal Board -> one finding per category with active rules, plus cross-category amplification."
      />
      {findings.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">No active signals. Toggle rules on in Signal Board to see findings here.</p>
        </Card>
      )}
      <div className="space-y-4">
        {findings.map((f) => {
          const protocol = getProtocol(f.category, f.severity);
          return (
            <Card key={f.id}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{f.title}</div>
                  <div className="text-xs text-slate-400">{f.category}</div>
                </div>
                <div className="flex items-center gap-2">
                  {f.amplified && <Pill tone="violet">amplified</Pill>}
                  <SeverityBadge severity={f.severity} />
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">{f.narrative}</p>
              {f.ruleIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.ruleIds.map((id) => (
                    <Pill key={id}>{id}</Pill>
                  ))}
                </div>
              )}
              {protocol.length > 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Suggested protocol</div>
                  <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-600">
                    {protocol.map((step) => (
                      <li key={step.order}>
                        <span className="font-medium">{step.owner}:</span> {step.action}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
