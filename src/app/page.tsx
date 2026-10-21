import Link from "next/link";
import { baseForecast, runwayDistribution, runwayTornado, covenantHeadroom, fundraisingReadiness } from "@/lib/financialOS";
import { getCascade } from "@/lib/okr";
import { allProjectStatuses } from "@/lib/executionEngine";
import { deliveryConfidence } from "@/lib/delivery";
import { listDecisions } from "@/lib/decisionEngine";
import { evaluateIndicators, stateOfTheBusiness } from "@/lib/strategicIntelligence";
import { listScenarios } from "@/lib/scenarioEngine";
import { recentJobRuns } from "@/lib/scheduler";
import { money, pct, round2 } from "@/lib/format";

export const dynamic = "force-dynamic";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "green" || status === "ok" || status === "on_track" || status === "done"
      ? "bg-emerald-500"
      : status === "yellow" || status === "watch" || status === "at_risk"
        ? "bg-amber-500"
        : "bg-rose-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function HomePage() {
  const [forecast, runway, tornado, covenants, readiness, cascade, projectStatuses, decisions, indicators, scenarios, sob, jobRuns] = await Promise.all([
    baseForecast(12),
    runwayDistribution(800, 36, 23),
    runwayTornado(),
    covenantHeadroom(),
    fundraisingReadiness(),
    getCascade(),
    allProjectStatuses(),
    listDecisions(),
    evaluateIndicators(),
    listScenarios(),
    stateOfTheBusiness(),
    recentJobRuns(10),
  ]);
  const deliveryConfidences = await Promise.all(projectStatuses.map((p) => deliveryConfidence(p.project.id)));

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">LEADOS — Part 10</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Strategy &amp; Finance Cockpit</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Every number below is simulation output with visible assumptions — it traces to an assumption in the registry or an event in the ledger. See{" "}
            <Link href="/board-pack" className="font-medium text-indigo-600 underline">
              the board pack
            </Link>{" "}
            for the full evidence appendix, or{" "}
            <Link href="/decisions" className="font-medium text-indigo-600 underline">
              the decision workspace
            </Link>
            .
          </p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-7xl space-y-6 px-6">
        <Card title="State of the business (this week's synthesis)" subtitle="Deterministic synthesis over the financial model, OKR cascade, execution status, and indicators — not a model-generated summary.">
          <p className="text-sm leading-relaxed text-slate-700">{sob.value.narrative}</p>
          {sob.value.actions.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {sob.value.actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Cash runway" subtitle={`Monte Carlo, ${runway.method.split(",")[1]?.trim() ?? ""}`}>
            <div className="flex items-end gap-6">
              <div>
                <p className="text-3xl font-bold text-slate-900">{round2(runway.value.p50)}mo</p>
                <p className="text-xs text-slate-500">p50</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-rose-600">{round2(runway.value.p10)}mo</p>
                <p className="text-xs text-slate-500">p10 (downside)</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-emerald-600">{round2(runway.value.p90)}mo</p>
                <p className="text-xs text-slate-500">p90 (upside)</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Fundraising readiness: <span className="font-semibold">{readiness.value.status}</span> (comfort threshold {readiness.value.comfortThresholdMonths}mo, owner: CFO — Marcus Webb)
            </p>
            {runway.caveats.map((c, i) => (
              <p key={i} className="mt-1 text-xs text-amber-700">⚠ {c}</p>
            ))}
          </Card>

          <Card title="Runway tornado" subtitle="Adversarial check: which single assumption, moved alone, swings runway most?">
            <ol className="space-y-1.5 text-sm">
              {tornado.value.slice(0, 5).map((row, i) => (
                <li key={row.key} className="flex items-center justify-between gap-2">
                  <span className={i === 0 ? "font-semibold text-slate-900" : "text-slate-700"}>{row.label}</span>
                  <span className="shrink-0 text-xs text-slate-500">{row.swingMonths}mo · {row.owner}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Covenant headroom">
            <ul className="space-y-2">
              {covenants.map((c) => (
                <li key={c.value.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <StatusDot status={c.value.breached ? "red" : "ok"} />
                    {c.value.name}
                  </span>
                  <span className="font-mono text-xs text-slate-600">
                    {round2(c.value.value)} {c.value.operator} {c.value.threshold}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Anchor month: {forecast.anchor.month} · cash {money(forecast.anchor.cash)}</p>
          </Card>
        </div>

        <Card title="OKR cascade" subtitle={`Health score ${cascade.value.healthScore}/100 — derived status computed purely from execution data, then reconciled against self-reports.`}>
          <div className="space-y-4">
            {cascade.value.objectives.map((o) => (
              <div key={o.objectiveId} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{o.title}</p>
                  <span className="flex items-center gap-2 text-sm">
                    <StatusDot status={o.derivedStatus} /> {pct(o.attainment)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{o.owner}{o.uncovered ? " — ⚠ no key results defined (scored 0 by design)" : ""}</p>
                <ul className="mt-2 space-y-1.5">
                  {o.keyResults.map((k) => (
                    <li key={k.keyResultId} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{k.title}</span>
                      <span className="flex items-center gap-2">
                        {k.disagreement && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            self={k.selfReportedStatus} vs derived={k.derivedStatus}
                          </span>
                        )}
                        {!k.disagreement && <StatusDot status={k.derivedStatus} />}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {(cascade.value.orphanInitiatives.length > 0 || cascade.value.uncoveredObjectives.length > 0 || cascade.value.orphanKeyResults.length > 0) && (
            <p className="mt-3 text-xs text-amber-700">
              Cascade gaps: {cascade.value.uncoveredObjectives.length} uncovered objective(s), {cascade.value.orphanKeyResults.length} orphan KR(s), {cascade.value.orphanInitiatives.length} orphan initiative(s).
            </p>
          )}
        </Card>

        <Card title="Execution & delivery" subtitle="Derived status from milestones/blockers; delivery confidence is Explain<Probability> (Monte Carlo over the critical path).">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {projectStatuses.map((p, i) => (
              <div key={p.project.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{p.project.title}</p>
                  <StatusDot status={p.derivedStatus} />
                </div>
                <p className="text-xs text-slate-500">{p.project.owner} · due {p.project.dueDate}</p>
                <p className="mt-2 text-sm text-slate-700">{pct(p.percentComplete)} complete · schedule gap {round2(p.scheduleGapDays)}d</p>
                {deliveryConfidences[i] && (
                  <>
                    <p className="mt-1 text-sm font-medium text-slate-900">On-time confidence: {pct(deliveryConfidences[i]!.value)}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {deliveryConfidences[i]!.drivers.filter((d) => d.contribution !== 0).map((d, idx) => (
                        <li key={idx}>{d.name}: {d.contribution > 0 ? "+" : ""}{round2(d.contribution)}d {d.note ? `(${d.note})` : ""}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Decisions" subtitle="Structured records with EV distributions (not points) and a hard downside-acknowledgement gate.">
            <ul className="space-y-2">
              {decisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <div>
                    <Link href={`/decisions/${d.id}`} className="font-medium text-indigo-600 hover:underline">{d.title}</Link>
                    <p className="text-xs text-slate-500">{d.reversibility} · {d.status}{d.reviewDate ? ` · review ${d.reviewDate}` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/decisions" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">Open decision workspace →</Link>
          </Card>

          <Card title="Early-warning indicators" subtitle="Threshold breach + trend-break detection (simple, auditable z-score style shift, not a black box).">
            <ul className="space-y-2">
              {indicators.map((ind) => (
                <li key={ind.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <StatusDot status={ind.status} />
                    {ind.name} <span className="text-xs text-slate-400">({ind.domain})</span>
                  </span>
                  <span className="text-xs text-slate-500">{ind.currentValue} vs {ind.threshold}{ind.trendBreak ? " · trend break" : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Scenarios in play" subtitle="Driver deltas on top of base-case assumptions; wargame branches carry probabilities the strategic layer monitors.">
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {scenarios.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                <p className="font-medium text-slate-900">{s.title}</p>
                <p className="text-xs text-slate-500">{s.source} · {s.category} · p={round2(Number(s.probability))}</p>
              </li>
            ))}
          </ul>
          <Link href="/scenarios" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">Open scenario studio →</Link>
        </Card>

        <Card title="Automation log" subtitle="Weekly board pack, daily early-warning scan, monthly delivery recalibration, decision-retrospective sweep. See src/instrumentation.ts for the honest limitation note.">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr><th className="pb-2">Job</th><th className="pb-2">Status</th><th className="pb-2">Run at</th></tr>
            </thead>
            <tbody>
              {jobRuns.length === 0 && (
                <tr><td colSpan={3} className="py-2 text-slate-400">No jobs have run yet in this process — trigger one via POST /api/jobs/run?job=daily-early-warning-scan, or wait for the bootstrap run.</td></tr>
              )}
              {jobRuns.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="py-1.5">{j.jobName}</td>
                  <td className="py-1.5"><StatusDot status={j.status === "ok" ? "green" : "red"} /></td>
                  <td className="py-1.5 text-xs text-slate-500">{new Date(j.runAt).toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}
