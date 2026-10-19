import { ExplanationCard } from "./ExplanationCard";
import { generateFindings, runCalibration, causalInsight, forecast } from "@/lib/intelligence/intelligence";
import { runScenario } from "@/lib/intelligence/scenarioEngine";
import { sampleAccounts, INTERRUPT_OPT_IN, DEFAULT_FORECAST_INPUT } from "@/lib/intelligence/demoData";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const findings = generateFindings(sampleAccounts(), INTERRUPT_OPT_IN);
  const calibrationReports = runCalibration();
  const confoundedFinding = causalInsight(false);
  const adjustedFinding = causalInsight(true);
  const forecastResult = await forecast(DEFAULT_FORECAST_INPUT);
  const scenario = runScenario({
    name: "Hire 3 reps + delay launch 6 weeks",
    interventions: [
      { type: "hire", amount: 3 },
      { type: "delayLaunch", amount: 6 },
    ],
    trials: 1500,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
      <header>
        <p className="text-sm uppercase tracking-wide text-indigo-600">LEADOS Intelligence Core</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Evidence-based reasoning dashboard</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Every number below ships with an interval, drivers, evidence and a method — the explainability contract
          from <code>explainFinding()</code>. Nothing here is a bare score.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Fused findings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Deduplicated by root cause, severity-stabilized with hysteresis, interrupt-eligible only for severity 5 +
          explicit opt-in.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {findings.map((f) => (
            <div key={f.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                  Severity {f.displayedSeverity}
                </span>
                {f.interruptEligible && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                    Interrupt-eligible
                  </span>
                )}
                <span className="text-xs text-slate-400">{f.domain}</span>
              </div>
              <ExplanationCard explanation={f.explanation} title={f.title} />
              <ul className="list-inside list-disc text-sm text-slate-600">
                {f.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Causal honesty check</h2>
        <p className="mt-1 text-sm text-slate-500">
          Same question — &ldquo;does headcount cause more pipeline?&rdquo; — with and without the confounder
          (market demand) measured.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Confounder unmeasured</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">kind: {confoundedFinding.kind}</p>
            {confoundedFinding.kind === "association" && (
              <>
                <p className="mt-2 text-sm text-slate-600">{confoundedFinding.reason}</p>
                <ul className="mt-2 text-xs text-amber-700">
                  {confoundedFinding.confounderWarnings.map((w, i) => (
                    <li key={i}>⚠ {w}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Confounder measured &amp; adjusted</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">kind: {adjustedFinding.kind}</p>
            {adjustedFinding.kind === "causal" && (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  Effect: {adjustedFinding.effectPerUnit.toFixed(2)} ({adjustedFinding.identification})
                </p>
                <ul className="mt-2 text-xs text-slate-500">
                  {adjustedFinding.assumptions.map((a, i) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Forecast with uncertainty</h2>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">
            P10 {Math.round(forecastResult.distribution.p10).toLocaleString()} · P50{" "}
            {Math.round(forecastResult.distribution.p50).toLocaleString()} · P90{" "}
            {Math.round(forecastResult.distribution.p90).toLocaleString()}
          </p>
          {forecastResult.accuracy && (
            <p className="mt-1 text-xs text-slate-500">
              Historical accuracy ({forecastResult.accuracy.metric}): {(forecastResult.accuracy.value * 100).toFixed(1)}%
              over {forecastResult.accuracy.historyPoints} periods.
            </p>
          )}
          <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
            {forecastResult.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Counterfactual scenario</h2>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-800">{scenario.name}</p>
          <ExplanationCard explanation={scenario.explanation} title="Median incremental revenue vs. baseline" />
          <div className="mt-3 text-xs text-slate-500">
            <p>
              Baseline P50: {Math.round(scenario.baselineDistribution.p50).toLocaleString()} · Scenario P50:{" "}
              {Math.round(scenario.scenarioDistribution.p50).toLocaleString()}
            </p>
            {scenario.causalChains.map((chain, i) => (
              <p key={i} className="mt-1">
                Chain: {chain.primaryPath.map((s) => s.label).join(" → ")} ({chain.note})
              </p>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Calibration report (monthly, per domain)</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {calibrationReports.map((report) => (
            <div key={report.domain} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">{report.domain}</p>
              <p className="mt-1 text-sm text-slate-700">Brier: {report.domainBrierScore.toFixed(4)}</p>
              <p className="text-sm text-slate-700">ECE: {report.domainExpectedCalibrationError.toFixed(4)}</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {report.rules.map((r) => (
                  <li key={r.report.ruleId}>
                    {r.report.ruleId}: weight {r.proposal.currentWeight.toFixed(2)} → {r.proposal.proposedWeight.toFixed(2)}{" "}
                    (needs approval) {r.report.drift?.driftDetected ? "⚠ drift" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
