import { useMemo, useState } from "react";
import { ORG_DATASETS } from "../../lib/domainData";
import { runExecutiveJourney, runMobileLeadershipLoop } from "../../lib/journey";
import { compileDailyBrief } from "../../lib/briefingCompiler";
import { renderSsml } from "../../lib/ssml";

/** Phase 3e / Phase 4: the executive-journey e2e test harness, runnable live
 * in the browser (and re-run headlessly by `scripts/verify.ts` against the
 * same `lib/journey.ts` module for the written verification log). */
export function JourneyPanel() {
  const [orgId, setOrgId] = useState<keyof typeof ORG_DATASETS>("northwind");
  const ds = ORG_DATASETS[orgId];
  const journey = useMemo(() => runExecutiveJourney(ds), [ds]);
  const mobile = useMemo(() => runMobileLeadershipLoop(ds), [ds]);
  const brief = useMemo(() => compileDailyBrief(ds), [ds]);
  const ssml = useMemo(() => renderSsml(brief.sections.flatMap((s) => s.sentences), brief.ledger.all(), brief.title), [brief]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">LEADOS · Executive-journey tests</p>
          <h1 className="text-2xl font-bold text-slate-900">Measured, not asserted</h1>
        </div>
        <select value={orgId} onChange={(e) => setOrgId(e.target.value as keyof typeof ORG_DATASETS)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {Object.values(ORG_DATASETS).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gate 1 — 5 questions in ≤2 interactions</p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${journey.allWithinBudget ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {journey.allWithinBudget ? "PASS" : "FAIL"} · max {journey.maxInteractions} / budget {journey.budget}
          </span>
        </div>
        <ul className="mt-3 space-y-3">
          {journey.steps.map((s) => (
            <li key={s.questionId} className="rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{s.question}</p>
                <span className="text-xs text-slate-400">{s.interactions} interaction(s) · compile {s.computeMs.toFixed(2)}ms</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{s.headlineOrReason}</p>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-xs text-slate-500">
                {s.interactionTranscript.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gate 4 — mobile leadership loop @ 390px</p>
        <p className="mt-1 text-sm text-slate-600">Estimated total loop time: {(mobile.totalEstimateMs / 1000).toFixed(1)}s at a {mobile.viewportPx}px viewport.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          {mobile.steps.map((s, i) => (
            <li key={i}>{s.action} <span className="text-slate-400">(~{(s.elapsedMsEstimate / 1000).toFixed(1)}s)</span></li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gate 5 — speech-ready lint (DailyBrief)</p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${brief.speechLint.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {brief.speechLint.passed ? "PASS" : "FAIL"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{brief.wordCount} words · ~{brief.estReadMinutes} min read · {ssml.sayAsCount} SSML say-as tags generated for the voice seam.</p>
        <details className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium">View generated SSML (voice/ambient seam)</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words">{ssml.ssml}</pre>
        </details>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gate 2 — citation lint on generated narrative</p>
        <p className={`mt-1 text-sm font-semibold ${brief.citationIssues.length === 0 ? "text-emerald-700" : "text-rose-700"}`}>
          {brief.citationIssues.length === 0 ? "PASS — every sentence with a number cites a real fact that matches verbatim." : `FAIL — ${brief.citationIssues.length} issue(s).`}
        </p>
      </section>
    </div>
  );
}
