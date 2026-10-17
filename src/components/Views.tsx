import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { RULES, CATEGORIES } from "../lib/rules";
import { computeFindings } from "../lib/engine";
import { forwardChain, backwardChain, computeDepartureCascade } from "../lib/inference";
import { runSelfTests, type TestResult } from "../lib/selfTest";
import { applyDemoPreset, seedAttritionHistory, resetState } from "../lib/store";
import { SectionCard, Pill, type Route } from "./Shell";

// ───────────────────────────── Today ─────────────────────────────

export function TodayView({
  state,
  setState,
  onNavigate,
}: {
  state: AppState;
  setState: (s: AppState) => void;
  onNavigate: (r: Route) => void;
}) {
  const findings = useMemo(() => computeFindings(state), [state]);
  const fc = useMemo(() => forwardChain(findings, state), [findings, state]);
  const bc = useMemo(() => backwardChain(findings), [findings]);
  const cascade = useMemo(() => computeDepartureCascade(state.attritionLog), [state.attritionLog]);

  const firedCount = fc.filter((r) => r.met).length + (bc.observationMet ? 1 : 0) + (cascade?.prediction ? 1 : 0);
  const [tests, setTests] = useState<TestResult[] | null>(null);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/40 p-6">
        <p className="text-cyan-400 text-xs font-semibold tracking-wide uppercase mb-1">Part 1 &middot; Autonomous Reasoning Engine</p>
        <h1 className="text-2xl font-bold mb-2">The Inference Chain Engine</h1>
        <p className="text-slate-400 text-sm max-w-3xl">
          Not ML. Pure deductive (forward chaining) and abductive (backward chaining) inference over a
          small, toggleable Signal Board, plus one temporal pattern computed from a synthetic event
          history you control. Toggle signals on the <b>Signal Board</b>, then open the{" "}
          <b>Inference Engine</b> to watch multi-step conclusions appear or disappear live.
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <button
            onClick={() => setState(applyDemoPreset())}
            className="px-3 py-1.5 rounded-md bg-cyan-500 text-slate-950 text-sm font-semibold hover:bg-cyan-400"
          >
            Load demo preset (fires all 3 forward patterns)
          </button>
          <button
            onClick={() => setState(resetState())}
            className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700"
          >
            Reset to empty board
          </button>
          <button onClick={() => onNavigate("inference")} className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-800">
            Go to Inference Engine &rarr;
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Active findings" value={findings.length} hint="From the Signal Board" />
        <StatCard label="Inferences firing" value={firedCount} hint="Forward + abductive + temporal, combined" tone={firedCount > 0 ? "amber" : "slate"} />
        <StatCard label="Historical attritions logged" value={state.attritionLog.length} hint="Needed: \u2265 3 for the temporal pattern" />
      </div>

      <SectionCard
        title="In-browser self-test runner"
        subtitle="Original tests (ST-001..ST-008) that check this build's own inference math against fixed fixtures — not a reproduction of any other session's test suite."
        right={
          <button onClick={() => setTests(runSelfTests())} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sm font-medium">
            Run self-tests
          </button>
        }
      >
        {tests ? (
          <div className="space-y-1.5">
            {tests.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm font-mono">
                <Pill tone={t.pass ? "green" : "red"}>{t.pass ? "PASS" : "FAIL"}</Pill>
                <span className="text-slate-500">{t.id}</span>
                <span className="text-slate-300">{t.name}</span>
                <span className="text-slate-600 text-xs ml-auto">{t.detail}</span>
              </div>
            ))}
            <div className="pt-2 text-xs text-slate-500">
              {tests.filter((t) => t.pass).length}/{tests.length} passing
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Click "Run self-tests" to execute.</p>
        )}
      </SectionCard>
    </div>
  );
}

function StatCard({ label, value, hint, tone = "cyan" }: { label: string; value: number; hint: string; tone?: "cyan" | "amber" | "slate" }) {
  const toneClass = tone === "amber" ? "text-amber-300" : tone === "slate" ? "text-slate-300" : "text-cyan-300";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-sm font-medium text-slate-200 mt-1">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}

// ───────────────────────────── Signal Board ─────────────────────────────

export function SignalsView({ state, setState }: { state: AppState; setState: (s: AppState) => void }) {
  const findings = useMemo(() => computeFindings(state), [state]);

  function toggle(ruleId: string) {
    const entry = state.signals[ruleId] ?? { active: false };
    setState({ ...state, signals: { ...state.signals, [ruleId]: { ...entry, active: !entry.active } } });
  }
  function setOccurrences(ruleId: string, n: number) {
    const entry = state.signals[ruleId] ?? { active: false };
    setState({ ...state, signals: { ...state.signals, [ruleId]: { ...entry, occurrences: Math.max(0, n) } } });
  }
  function logDepartureToday() {
    const today = new Date().toISOString().slice(0, 10);
    const entry = state.signals.R19 ?? { active: false };
    setState({ ...state, signals: { ...state.signals, R19: { ...entry, active: true } }, attritionLog: [...state.attritionLog, today].sort() });
  }
  function seedHistory() {
    const seeded = seedAttritionHistory();
    const merged = Array.from(new Set([...state.attritionLog, ...seeded])).sort();
    setState({ ...state, attritionLog: merged });
  }
  function clearHistory() {
    setState({ ...state, attritionLog: [] });
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Signal Board" subtitle="Toggle synthetic findings on/off. Counter rules (like R1) accumulate occurrences, used by threshold premises.">
        <div className="space-y-5">
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{cat}</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {RULES.filter((r) => r.category === cat).map((r) => {
                  const entry = state.signals[r.id];
                  const active = !!entry?.active;
                  return (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        active ? "border-cyan-500/40 bg-cyan-500/5" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                      }`}
                    >
                      <input type="checkbox" checked={active} onChange={() => toggle(r.id)} className="mt-1 accent-cyan-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-slate-500">{r.id}</span>
                          <span className="font-medium text-sm text-slate-100">{r.name}</span>
                          <Pill tone={r.severity >= 4 ? "red" : r.severity === 3 ? "amber" : "slate"}>sev {r.severity}</Pill>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{r.description}</p>
                        {r.counter && active && (
                          <div className="flex items-center gap-2 mt-2" onClick={(e) => e.preventDefault()}>
                            <span className="text-xs text-slate-500">{r.counterLabel}:</span>
                            <button onClick={() => setOccurrences(r.id, (entry?.occurrences ?? 1) - 1)} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-sm">
                              &minus;
                            </button>
                            <span className="font-mono text-sm w-5 text-center">{entry?.occurrences ?? 1}</span>
                            <button onClick={() => setOccurrences(r.id, (entry?.occurrences ?? 1) + 1)} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-sm">
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Crisis incidents (metric)" subtitle="Feeds the crisisCount metric used by INF-003. Not a rule — a plain counter.">
        <div className="flex items-center gap-3">
          <button onClick={() => setState({ ...state, crisisCount: Math.max(0, state.crisisCount - 1) })} className="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700">
            &minus;
          </button>
          <span className="font-mono text-lg w-8 text-center">{state.crisisCount}</span>
          <button onClick={() => setState({ ...state, crisisCount: state.crisisCount + 1 })} className="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700">
            +
          </button>
          <span className="text-xs text-slate-500 ml-2">crises logged historically</span>
        </div>
      </SectionCard>

      <SectionCard
        title="Attrition history"
        subtitle="Drives INF-005 (temporal inference). 'Log departure today' both activates R19 and appends to this history; 'Seed history' adds deterministic synthetic past departures."
      >
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={logDepartureToday} className="px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30 text-sm font-medium hover:bg-rose-500/30">
            Log departure today
          </button>
          <button onClick={seedHistory} className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sm font-medium">
            Seed historical attritions (4 synthetic past events)
          </button>
          <button onClick={clearHistory} className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-sm font-medium">
            Clear history
          </button>
        </div>
        {state.attritionLog.length ? (
          <div className="flex gap-2 flex-wrap">
            {state.attritionLog.map((d) => (
              <span key={d} className="font-mono text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
                {d}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No attrition events logged yet.</p>
        )}
      </SectionCard>

      <p className="text-xs text-slate-500">{findings.length} active finding instance(s) currently projected from this board.</p>
    </div>
  );
}

// ───────────────────────────── Inference Engine ─────────────────────────────

export function InferenceView({ state }: { state: AppState }) {
  const findings = useMemo(() => computeFindings(state), [state]);
  const fc = useMemo(() => forwardChain(findings, state), [findings, state]);
  const bc = useMemo(() => backwardChain(findings), [findings]);
  const cascade = useMemo(() => computeDepartureCascade(state.attritionLog), [state.attritionLog]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-cyan-400 text-xs font-semibold tracking-wide uppercase mb-1">#/inference</p>
        <h1 className="text-xl font-bold">Inference Engine</h1>
        <p className="text-slate-400 text-sm mt-1 max-w-3xl">
          Every conclusion below is derived live from the Signal Board. Nothing here is stored as fact —
          each card shows its confidence and its premises so you can verify or dismiss it.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Forward chaining &mdash; "Given A and B, conclude C"</h2>
        <div className="space-y-4">
          {fc.map(({ pattern, met, premiseStatus }) => (
            <div
              key={pattern.id}
              className={`rounded-xl border p-4 ${met ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 bg-slate-900/30"}`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{pattern.id}</span>
                  <span className="font-semibold text-sm">{pattern.name}</span>
                </div>
                <Pill tone={met ? "amber" : "slate"}>{met ? "FIRING" : "not met"}</Pill>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {pattern.premiseLabels.map((label, i) => (
                  <Pill key={label} tone={premiseStatus[i] ? "green" : "slate"}>
                    {premiseStatus[i] ? "\u2713" : "\u25cb"} {label}
                  </Pill>
                ))}
              </div>
              {met && (
                <div className="border-t border-slate-800 pt-3 mt-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-100">{pattern.conclusion.title}</h3>
                    <Pill tone="red">severity {pattern.conclusion.severity}</Pill>
                    <Pill tone="cyan">{Math.round(pattern.conclusion.confidence * 100)}% confidence</Pill>
                  </div>
                  <p className="text-sm text-slate-300">{pattern.conclusion.body}</p>
                  <p className="text-xs text-slate-500 italic">{pattern.conclusion.confLabel}</p>
                  <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 text-sm text-cyan-200">
                    <span className="font-semibold">Recommended intervention: </span>
                    {pattern.conclusion.intervention}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Backward chaining (abductive) &mdash; "I observe X. What combination of causes best explains it?"
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">INF-004</span>
              <span className="font-semibold text-sm">Velocity Decline Root Cause Analysis</span>
            </div>
            <Pill tone={bc.observationMet ? "amber" : "slate"}>{bc.observationMet ? "observation present (R73)" : "no observation (R73 inactive)"}</Pill>
          </div>
          {bc.observationMet ? (
            <div className="space-y-3 mt-3">
              {bc.scored.map((h, i) => (
                <div key={h.name} className={`rounded-lg border p-3 ${i === 0 ? "border-cyan-500/40 bg-cyan-500/5" : "border-slate-800"}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {i === 0 && <Pill tone="cyan">Best explanation</Pill>}
                    <span className="font-semibold text-sm">{h.name}</span>
                    <span className="text-xs text-slate-500 font-mono">
                      for={h.forScore} against={h.againstScore} net={h.netScore}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{h.explanation}</p>
                  {i === 0 && (
                    <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 text-sm text-cyan-200 mt-2">
                      <span className="font-semibold">Recommended intervention: </span>
                      {h.intervention}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-slate-500 italic pt-1">{BACKWARD_LABEL}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">Activate R73 (Velocity declining) on the Signal Board to run this analysis.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Temporal inference &mdash; "Given what happened in the past, what is likely next?"
        </h2>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">INF-005</span>
              <span className="font-semibold text-sm">Departure Cascade Prediction</span>
            </div>
            <Pill tone={cascade ? "amber" : "slate"}>{cascade ? `n=${cascade.historicalAttritions}` : "insufficient history"}</Pill>
          </div>
          {cascade ? (
            <div className="space-y-2 mt-2">
              <p className="text-sm text-slate-300">
                Cascade rate: <span className="font-mono text-slate-100">{(cascade.cascadeRate * 100).toFixed(0)}%</span>
              </p>
              {cascade.prediction ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-200">{cascade.prediction}</div>
              ) : (
                <p className="text-sm text-slate-400">Cascade rate is at or below 50% &mdash; no predictive claim is made.</p>
              )}
              <p className="text-xs text-slate-500 italic">{cascade.label}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">
              Needs \u2265 3 historical attrition events. Go to Signal Board \u2192 "Seed historical attritions" or log departures manually.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const BACKWARD_LABEL =
  "Abductive inference: best explanation for R73 from the active finding set. All hypotheses are evaluated; the one with the most supporting evidence is presented first. Others remain visible for leader verification.";

// ───────────────────────────── About ─────────────────────────────

export function AboutView() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-cyan-400 text-xs font-semibold tracking-wide uppercase mb-1">#/about</p>
        <h1 className="text-xl font-bold">About / Provenance</h1>
      </div>

      <SectionCard title="What this is">
        <p className="text-sm text-slate-300">
          This is <b>pt-M, Part 1</b> of a multi-part spec ("Autonomous Reasoning Engine"). Only Part 1
          &mdash; the Inference Chain Engine (forward chaining, backward/abductive chaining, one temporal
          pattern) &mdash; was provided in full and is implemented here. The rest of pt-M's framing
          (continuous autonomous reasoning, self-maintenance, "complete work products", one-click
          approval) is described in the brief's introduction but no mechanism for it was specified in
          this message, so none of it is built yet. Treat those paragraphs as a roadmap statement, not a
          shipped feature.
        </p>
      </SectionCard>

      <SectionCard title="What was verified against github.com/wbweve/Leados, this session">
        <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
          <li>
            The real repo is two deliveries in one place: ~60 loose root-level files (an older, larger
            build) plus a separate <code>src/</code> Vite+React+TypeScript app. Confirmed via the GitHub
            REST API file tree.
          </li>
          <li>
            <code>src/lib/core.ts</code> is real and exports a working <code>loadState/saveState/project</code>{" "}
            projection over a small event-log model. Confirmed by fetching and reading the file in full.
          </li>
          <li>
            <code>src/lib/intelligence.ts</code> and <code>src/lib/physics.ts</code> both{" "}
            <code>import {"{ engine, run }"} from "./core"</code> &mdash; but the real{" "}
            <code>core.ts</code> exports neither <code>engine</code> nor a function called{" "}
            <code>run</code>. This is a directly verified broken import, not an inference from the
            repo's own README: both files were fetched and read, and <code>core.ts</code>'s full export
            list was checked against what they expect (<code>P.state.events</code>,{" "}
            <code>P.openGoals</code>, <code>engine.iso()</code>, <code>engine._days()</code>) &mdash; none
            of that shape exists in the real <code>core.ts</code>.
          </li>
          <li>
            The repo's own root <code>README.md</code> (fetched this session) independently states the
            same conclusion. It also notes no CAS engine, risk register, or "58/62-file" / "144-rule" /
            "T_L_*/G_L_*" test-suite history was found anywhere &mdash; this session did not re-run that
            full search, so that specific claim is reported here as <i>README-reported, not
            independently re-verified this session</i>.
          </li>
          <li>
            <b>Disclosed inconsistency found in the real repo itself:</b> <code>src/lib/intelligence.ts</code>{" "}
            carries its own in-file disclosure comment, written by an earlier session, that tells a
            different story (it claims "88 files" were enumerated and references a "Part 1 velocity.ts,
            Part 2 orgPhysics.ts, Part 6 synthesis build" lineage) than the top-level README's provenance
            section does. Both cannot be a complete picture of the same repo state. This session does not
            attempt to reconcile them &mdash; it only reports that the repo's own self-documentation is
            internally inconsistent across files/sessions, which is itself worth knowing.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="What's original here">
        <p className="text-sm text-slate-300">
          Everything in this sandbox (<code>src/lib/types.ts</code>, <code>rules.ts</code>,{" "}
          <code>engine.ts</code>, <code>store.ts</code>, <code>inference.ts</code>,{" "}
          <code>selfTest.ts</code>, and all components) is written fresh for this task's environment. The
          17-rule catalog reuses specific rule IDs from the pasted brief (R1, R3, R7, R10, R19, R20, R38,
          R68, R73, R74, R79, R81, R87, R104, R109, R128, R133) so the brief's own named scenarios are
          explorable, but the catalog, the projection math, and the UI are original, not ported from the
          real repo or any other session's sandbox build.
        </p>
      </SectionCard>

      <SectionCard title="Changelog">
        <ul className="text-sm text-slate-300 space-y-1.5 list-disc pl-5">
          <li>
            <b>Inspected github.com/wbweve/Leados directly (file tree, README, core.ts, intelligence.ts,
            physics.ts) before writing code</b> &mdash; why: the task requires verifying claims against
            actual code, not trusting prose, including this session's own prose.
          </li>
          <li>
            <b>Built only Part 1 (Inference Chain Engine)</b> &mdash; why: that is the only part of pt-M
            with a complete, runnable specification in this message; inventing Parts 2+ would misrepresent
            unspecified behavior as delivered.
          </li>
          <li>
            <b>Replaced the brief's pseudocode event-log helpers with a small typed AppState</b> &mdash;
            why: the pasted code calls undefined helpers (<code>LEADOS.engine._days</code>,{" "}
            <code>P.state.events</code>) that exist in no verified source; a minimal self-contained model
            was written instead so every pattern is genuinely executable.
          </li>
          <li>
            <b>Added a demo preset and a self-test runner</b> &mdash; why: with 17 togglable rules it's
            otherwise tedious to see all 3 forward patterns fire at once, and unverified math is worse
            than no math &mdash; the tests pin down the exact threshold/metric edge cases (R1&ge;2, not
            &ge;1; crisisCount gating INF-003 independent of the two findings).
          </li>
          <li>
            <b>New localStorage key (<code>leados-ptm:v1</code>)</b> &mdash; why: this sandbox began from
            the default scaffold with no prior state; reusing another session's key would imply a shared
            history that doesn't exist here.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
