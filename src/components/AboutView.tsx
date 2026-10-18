import { Badge, Card } from "./ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-white/5 py-3 last:border-0 sm:grid-cols-[180px_1fr]">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-sm text-slate-300">{children}</div>
    </div>
  );
}

export function AboutView() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-white">About / Provenance</h2>
        <p className="mt-1 text-sm text-slate-400">
          This session inspected <code>github.com/wbweve/Leados</code> directly before writing any code, per
          the task's instruction. Full ledger below.
        </p>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-white">What was fetched, this session</h3>
        <Row label="1. README">
          <code>web_fetch https://github.com/wbweve/Leados</code> — rendered README, treated as a claim to
          verify, not fact. It already disclosed (from an earlier session in this lineage) that the repo is
          two deliveries: loose root-level files + a live <code>src/</code> Vite+React+TS app.
        </Row>
        <Row label="2. File tree">
          <code>GET api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1</code> — 148 files
          confirmed. Grepped (case-insensitive) for <code>bayes*</code> and <code>belief*</code> across every
          path: <Badge tone="bad">zero matches</Badge>.
        </Row>
        <Row label="3. Session log">
          <code>raw.githubusercontent.com/.../AI-SESSION-LOG.md</code> — read a prior session's own
          first-hand ledger. Confirms a live <code>infoTheory.ts</code>/<code>Thermodynamics.tsx</code> pair,
          and that <code>core.ts</code>/<code>intelligence.ts</code>/<code>physics.ts</code> exist but are
          orphaned (broken import: <code>intelligence.ts</code> imports <code>{"{ engine, run }"}</code> from{" "}
          <code>./core</code>, which does not export them).
        </Row>
        <Row label="4. src/App.tsx">
          Fetched raw. Current live app imports <code>Shell</code>, <code>TodayView</code>,{" "}
          <code>SignalBoardView</code>, <code>ThermodynamicsView</code>, <code>CasView</code>,{" "}
          <code>RiskView</code>, <code>AboutView</code> — i.e. the repo has since moved to a
          Thermodynamics + CAS Engine + Risk Register build (a later session than the one in #3). No
          Bayesian import anywhere in this file.
        </Row>
        <Row label="5. Root index.html">
          Fetched raw (12 lines — a Vite-built shell, not the earlier hand-authored demo described in older
          logs). Grepped for <code>bayes</code>/<code>belief</code>: <Badge tone="bad">zero matches</Badge>.
        </Row>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-white">Verified facts (first-hand, this session)</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li>No file, export, symbol, or string resembling a Bayesian belief network exists anywhere in
            <code> github.com/wbweve/Leados</code> as of this session's inspection.</li>
          <li>The real repo's live <code>src/App.tsx</code> currently renders a Thermodynamics + CAS Engine +
            Risk Register build, per its own README's route table (Today / Signal Board / Thermodynamics /
            CAS / Risk / About).</li>
          <li>Earlier <code>src/lib/core.ts</code>, <code>intelligence.ts</code>, <code>physics.ts</code> were
            confirmed (by an earlier session's own log) to be present but orphaned/broken.</li>
        </ul>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-white">What this delivery is — and isn't</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li><Badge tone="good">Original</Badge> — <code>src/lib/bayesian.ts</code>, <code>engine.ts</code>,
            <code>rules.ts</code>, <code>seed.ts</code>, <code>store.ts</code>, all components. Built to
            satisfy the <em>described behavior</em> in the task's pasted "pt-S" brief; not a port of any file
            in the real repo (none exists there to port, per the verified facts above).</li>
          <li><Badge tone="warn">Unverified citations</Badge> — every prior probability and likelihood ratio
            (SHRM, Bessemer, Lattice, Gallup, Leiter &amp; Maslach, Doerr, Reichheld, LinkedIn Talent Trends)
            is reproduced verbatim from the pasted brief's own text, not checked against the original sources
            this session. Treat as illustrative, not validated.</li>
          <li><Badge tone="bad">Disclosed gaps in the pasted spec itself</Badge> — applying "inspect before
            claiming" to the brief's own code, not only to GitHub:
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li><code>crisis.next30d</code> and <code>key_hire.success</code> have priors but no
                likelihood-ratio entries in the brief's own <code>LIKELIHOODS</code> table, so its own{" "}
                <code>update()</code> can never move them. Reproduced faithfully (see "static prior" badges
                in the Belief Network tab) instead of inventing ratios the brief never specified.</li>
              <li>Five likelihood keys (<code>comp.at_market</code>, <code>promotion.recent</code>,{" "}
                <code>pipeline.shrinking</code>, <code>nps.high</code>, <code>velocity.stable</code>) are
                defined but never emitted by the brief's own <code>_extractEvidenceSignals()</code> — dead
                code in the source spec. Exposed here as explicit manual toggles rather than silently wired
                into automatic rules.</li>
              <li>The brief's <code>beliefs: {"{}"}</code> cache is declared but never written to by{" "}
                <code>update()</code> (which writes to a different object, <code>state.meta.beliefs</code>),
                so every recompute always restarts from the original prior. Replicated intentionally: this
                build performs a full, stateless re-derivation from the base prior across the current
                evidence snapshot on every change, not a running sequential update.</li>
            </ol>
          </li>
          <li><Badge tone="info">Scope limit</Badge> — only "Part 1: The Bayesian Belief Network Engine" was
            pasted into this conversation. The brief's own framing describes further parts (a forward
            30/60/90-day scenario simulator; an always-on background process that proactively composes and
            delivers insights). Neither is implemented, because neither's text was supplied this part — per
            the delivery instruction to ship after every part, not to pre-build unseen future parts.</li>
        </ul>
      </Card>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-white">Environment constraint</h3>
        <p className="text-sm text-slate-300">
          This tool environment requires a React + Vite + Tailwind app with <code>src/App.tsx</code> as the
          entry point, built via <code>npm run build</code>. <code>vite-plugin-singlefile</code> is already
          configured in <code>vite.config.ts</code>, so the build still inlines all JS/CSS into one{" "}
          <code>dist/index.html</code> with no runtime network calls — the same "open one file" property the
          pasted brief's framing implies, just produced by a build step rather than hand-authored, matching
          the convention the real repo's own prior session used for the same constraint.
        </p>
      </Card>
    </div>
  );
}
