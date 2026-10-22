import { useMemo, useState } from "react";
import { SEED_HYPOTHESES } from "../../lib/hypotheses/hypothesisRegistry";
import { SEED_PREMORTEM_FINDINGS } from "../../lib/premortem/premortemLink";
import { summarizeCalibration } from "../../lib/foresight/calibration";
import { BackdatingViolation, registerForesight, resolveForesight, SEED_FORESIGHT_CLAIMS, type ForesightClaim } from "../../lib/foresight/registry";
import { PossibilityBanner } from "./PossibilityBanner";
import { Card, Pill, SectionHeading, StatTile } from "./ui";

export function ForesightLedger() {
  const [claims, setClaims] = useState<ForesightClaim[]>(SEED_FORESIGHT_CLAIMS);
  const [statement, setStatement] = useState("");
  const [confidence, setConfidence] = useState(0.5);
  const [horizon, setHorizon] = useState("2026-Q4");
  const [formError, setFormError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeCalibration(claims), [claims]);

  function addClaim() {
    if (!statement.trim()) {
      setFormError("Statement is required.");
      return;
    }
    setFormError(null);
    const claim = registerForesight({
      id: `fc-${Date.now()}`,
      statement: statement.trim(),
      confidence,
      horizon,
      registeredBy: "you (session user)",
    });
    setClaims((prev) => [...prev, claim]);
    setStatement("");
  }

  function resolve(id: string, outcome: boolean) {
    setClaims((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        try {
          return resolveForesight(c, outcome, outcome ? "Resolved true." : "Resolved false.");
        } catch (e) {
          if (e instanceof BackdatingViolation) {
            setFormError(e.message);
            return c;
          }
          throw e;
        }
      })
    );
  }

  return (
    <div className="space-y-6">
      <PossibilityBanner
        authoredAt="2026-03-08T09:00:00.000Z"
        authoredBy="foresight-ledger"
        extra="Every claim is timestamped at registration and locked at resolution — this ledger is the defense against 'we knew it all along.'"
      />

      <Card>
        <SectionHeading title="Org foresight calibration" subtitle="Brier score across resolved claims (0 = perfect, 0.25 = always said 50/50, 1 = maximally wrong)." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Resolved claims" value={String(summary.resolvedCount)} />
          <StatTile label="Open claims" value={String(summary.openCount)} />
          <StatTile label="Brier score" value={Number.isNaN(summary.brier) ? "—" : summary.brier.toFixed(3)} hint="Lower is better" />
          <StatTile label="Linked hypotheses" value={String(SEED_HYPOTHESES.length)} />
        </div>
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Calibration buckets</div>
          <div className="space-y-1">
            {summary.buckets.map((b) => (
              <div key={b.bucketLabel} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-slate-500">{b.bucketLabel}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  {!Number.isNaN(b.actualFrequency) ? <div className="h-full rounded-full bg-indigo-500" style={{ width: `${b.actualFrequency * 100}%` }} /> : null}
                </div>
                <span className="w-32 text-right text-slate-500">
                  {b.claimCount === 0 ? "no claims" : `${b.claimCount} claim(s), ${(b.actualFrequency * 100).toFixed(0)}% true`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Register a new foresight claim" subtitle="Registration timestamp is set now and cannot be edited later." />
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="e.g. Regulator X will publish final guidance within 6 months" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-600">Confidence</span>
            <input type="number" min={0} max={1} step={0.05} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-600">Horizon</span>
            <input value={horizon} onChange={(e) => setHorizon(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button onClick={addClaim} className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500">
            Register
          </button>
        </div>
        {formError ? <p className="mt-2 text-xs font-medium text-rose-700">{formError}</p> : null}
      </Card>

      <Card>
        <SectionHeading title="Foresight ledger" />
        <div className="space-y-2">
          {claims
            .slice()
            .reverse()
            .map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{c.statement}</span>
                  <div className="flex items-center gap-2">
                    <Pill tone="indigo">confidence {(c.confidence * 100).toFixed(0)}%</Pill>
                    <Pill tone={c.status === "resolved" ? (c.outcome ? "emerald" : "rose") : "amber"}>
                      {c.status === "resolved" ? (c.outcome ? "resolved true" : "resolved false") : "open"}
                    </Pill>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Registered {new Date(c.registeredAt).toLocaleDateString()} by {c.registeredBy} · horizon {c.horizon}
                  {c.linkedHypothesisId ? ` · linked to ${c.linkedHypothesisId}` : ""}
                  {c.linkedScenarioId ? ` · scenario ${c.linkedScenarioId}` : ""}
                  {c.status === "resolved" ? ` · Brier component ${c.brierComponent?.toFixed(3)}` : ""}
                </div>
                {c.status === "open" ? (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => resolve(c.id, true)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                      Resolve: true
                    </button>
                    <button onClick={() => resolve(c.id, false)} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                      Resolve: false
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Pre-mortem findings feeding this ledger" subtitle="Imported from the pre-mortem module (Part 23)." />
        <div className="space-y-2">
          {SEED_PREMORTEM_FINDINGS.map((f) => (
            <div key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="font-medium text-slate-800">{f.failureMode}</div>
              <div className="mt-1 text-xs text-slate-500">
                Likelihood {f.likelihood}/5 · Severity {f.severity}/5 · Linked scenarios: {f.linkedScenarioIds.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
