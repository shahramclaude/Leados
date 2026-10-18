import { computeAllBeliefs, highRiskBeliefs, PRIORS } from "../lib/bayesian";
import { extractEvidenceSignals } from "../lib/engine";
import type { AppState, HypothesisId } from "../lib/types";
import { Badge, Card, ProgressBar } from "./ui";
import { todayISO } from "../lib/seed";

const HYPOTHESIS_LABELS: Record<HypothesisId, string> = {
  "attrition.next60d": "Attrition — next 60 days",
  "revenue.miss.next_quarter": "Revenue miss — next quarter",
  "crisis.next30d": "Operational crisis — next 30 days",
  "okr.on_track": "OKRs on track",
  "key_hire.success": "Key hire 12-month success",
};

function toneFor(hypothesis: HypothesisId, pct: number): "good" | "warn" | "bad" | "info" {
  // For 'okr.on_track' and 'key_hire.success', HIGH is good. For the others, HIGH is bad.
  const highIsGood = hypothesis === "okr.on_track" || hypothesis === "key_hire.success";
  const effective = highIsGood ? 100 - pct : pct;
  if (effective >= 60) return "bad";
  if (effective >= 35) return "warn";
  return "good";
}

export function BeliefsView({ state }: { state: AppState }) {
  const evidenceSignals = extractEvidenceSignals(state);
  const beliefs = computeAllBeliefs(evidenceSignals, todayISO());
  const highRisk = highRiskBeliefs(beliefs);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Belief Network</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Every hypothesis below is a probability, not a fact. P(H|E) = P(E|H)×P(H)/P(E), computed via
              the likelihood-ratio odds form. Toggle evidence in the Signal Board tab and watch the posteriors move.
            </p>
          </div>
          <Badge tone={highRisk.length > 0 ? "bad" : "good"}>
            {highRisk.length} hypothesis{highRisk.length === 1 ? "" : "es"} ≥ 60%
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {(Object.keys(PRIORS) as HypothesisId[]).map((h) => {
          const belief = beliefs[h];
          const prior = PRIORS[h];
          const tone = toneFor(h, belief.posteriorPct);
          return (
            <Card key={h} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">{HYPOTHESIS_LABELS[h]}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{prior.description}</p>
                </div>
                {!belief.hasLikelihoodModel && <Badge tone="neutral">static prior</Badge>}
              </div>

              <div>
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-white">
                      {belief.posteriorPct}%
                    </span>
                    <span className="text-xs text-slate-500">
                      prior {Math.round(belief.prior * 100)}%
                    </span>
                  </div>
                  <Badge tone={tone}>
                    {belief.posteriorPct > Math.round(belief.prior * 100)
                      ? "↑ increased"
                      : belief.posteriorPct < Math.round(belief.prior * 100)
                        ? "↓ decreased"
                        : "unchanged"}
                  </Badge>
                </div>
                <div className="mt-2">
                  <ProgressBar value={belief.posteriorPct} tone={tone} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Evidence applied ({belief.appliedEvidence.length})
                </div>
                {belief.appliedEvidence.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    No matching evidence currently active. Toggle rules or manual evidence in the Signal Board.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {belief.appliedEvidence.map((e) => (
                      <li
                        key={e.evidence}
                        className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-300">{e.evidence}</span>
                          <Badge tone={e.effect === "increases" ? "bad" : "good"}>
                            LR {e.likelihoodRatio.toFixed(1)}× {e.effect === "increases" ? "↑" : "↓"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-slate-500">{e.source}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="mt-auto border-t border-white/5 pt-3 text-[11px] leading-snug text-slate-500">
                {belief.label}
              </p>
              <p className="text-[10px] leading-snug text-slate-600">
                Prior source: {prior.source}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
