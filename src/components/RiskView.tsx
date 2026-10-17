import { useMemo } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { buildRiskRegister, detectCrossRiskAmplification } from "../lib/riskIntelligence";
import { Card, Label, Badge, Bar } from "./ui";

const STATUS_TONE: Record<string, "slate" | "amber" | "rose" | "emerald"> = {
  CLEAR: "emerald",
  WATCH: "slate",
  ELEVATED: "amber",
  CRITICAL: "rose",
};

export function RiskView({ state }: { state: AppState }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const register = useMemo(() => buildRiskRegister(findings), [findings]);
  const amps = useMemo(() => detectCrossRiskAmplification(register), [register]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Unified Risk Register</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          8 fixed categories, always shown even at zero. Score = capped sum of (severity × 8) per category. Overall risk =
          mean of the 8 category scores. Cross-category amplification is detected separately below.
        </p>
      </div>

      <Card title="Overall Risk" subtitle="0 when every category is CLEAR, 100 when every category is saturated CRITICAL">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-mono font-bold text-white">{register.overallRisk}</div>
          <Badge tone={STATUS_TONE[register.overallRisk === 0 ? "CLEAR" : register.overallRisk < 35 ? "WATCH" : register.overallRisk < 70 ? "ELEVATED" : "CRITICAL"]}>
            {register.overallRisk === 0 ? "CLEAR" : register.overallRisk < 35 ? "WATCH" : register.overallRisk < 70 ? "ELEVATED" : "CRITICAL"}
          </Badge>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {register.categories.map((c) => (
          <Card key={c.category} title={c.category} subtitle={`${c.findingCount} active finding(s), max severity ${c.maxSev}`} right={<Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>}>
            <Bar value={c.score} max={100} color={c.status === "CLEAR" ? "from-emerald-400 to-emerald-600" : c.status === "WATCH" ? "from-slate-400 to-slate-600" : c.status === "ELEVATED" ? "from-amber-400 to-amber-600" : "from-rose-400 to-rose-600"} />
            <Label>score {c.score}/100</Label>
          </Card>
        ))}
      </div>

      <Card title={`Cross-Category Amplification (${amps.length})`} subtitle="Pairs of simultaneously-elevated categories that are worse together than apart">
        {amps.length === 0 ? (
          <p className="text-sm text-slate-400">None detected right now.</p>
        ) : (
          <ul className="space-y-3">
            {amps.map((a) => (
              <li key={a.id} className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{a.label}</span>
                  <Badge tone="rose">sev {a.sev}</Badge>
                  <span className="text-[10px] text-slate-600">{a.categories.join(" + ")}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{a.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <Label>
          Wired up: AUSTERITY_TRAP (FINANCIAL+PEOPLE), TRUST_COLLAPSE (GOVERNANCE+REPUTATIONAL, always severity 5 by
          definition), EXECUTION_STRATEGY_GAP (STRATEGIC+OPERATIONAL).
        </Label>
      </Card>
    </div>
  );
}
