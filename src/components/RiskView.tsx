import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { buildRiskRegister } from "../lib/riskIntelligence";
import type { RiskStatus } from "../lib/riskIntelligence";
import { Card, Bar, Badge, Stat } from "./ui";

const STATUS_TONE: Record<RiskStatus, "slate" | "sky" | "amber" | "rose"> = {
  CLEAR: "slate",
  WATCH: "sky",
  ELEVATED: "amber",
  CRITICAL: "rose",
};

export function RiskView({ state }: { state: AppState }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const register = useMemo(() => buildRiskRegister(findings), [findings]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Risk Register</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          All 8 categories are always shown, even at zero. Scores are a disclosed, simplified severity-weighted formula, not a calibrated
          actuarial model.
        </p>
      </div>

      <Card>
        <Stat label="Overall risk score" value={`${register.overallScore} / 100`} tone={register.overallScore > 50 ? "rose" : register.overallScore > 20 ? "amber" : "emerald"} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {register.categories.map((c) => (
          <Card key={c.category} title={c.category}>
            <div className="flex items-center justify-between">
              <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              <span className="text-xs text-slate-500">{c.findingCount} findings</span>
            </div>
            <div className="mt-3">
              <Bar value={c.score} max={100} tone={c.score > 60 ? "rose" : c.score > 25 ? "amber" : "emerald"} />
            </div>
            <div className="mt-1 text-right text-[11px] text-slate-500">{c.score}/100</div>
          </Card>
        ))}
      </div>

      <Card title={`Cross-category amplifications (${register.amplifications.length})`} subtitle="Rule combinations that span two categories and compound each other's score.">
        {register.amplifications.length === 0 ? (
          <p className="text-xs text-slate-500">None detected with the current Signal Board state.</p>
        ) : (
          <ul className="space-y-2">
            {register.amplifications.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 font-medium text-slate-200">
                  {a.label}
                  {a.categories.map((c) => (
                    <Badge key={c} tone="amber">{c}</Badge>
                  ))}
                </div>
                <p className="mt-1 text-slate-500">{a.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
