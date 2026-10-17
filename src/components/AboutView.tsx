import { Card, Label, Mono } from "./ui";

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">About / Provenance</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          This task began by asking me to read <Mono>github.com/wbweve/Leados</Mono> and inspect the actual code before
          claiming anything about it. This page is the resulting ledger: what was fetched, what it actually contains, and
          how that compares to the "pt-L implementation summary" pasted into this task's prompt.
        </p>
      </div>

      <Card title="1. What was actually fetched this session" subtitle="Read-only, via web_fetch / GitHub REST API — no code executed">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Rendered README of <Mono>github.com/wbweve/Leados</Mono> (treated as a claim to verify, not a fact).</li>
          <li>Full recursive file tree via <Mono>git/trees/main?recursive=1</Mono>.</li>
          <li>The repo's own <Mono>AI-SESSION-LOG.md</Mono> at HEAD (a prior session's ledger for a "Part 2+3" delivery).</li>
          <li>Directory listings of <Mono>src/</Mono>, <Mono>src/lib/</Mono>, <Mono>src/components/</Mono>.</li>
          <li>
            Raw file contents of: <Mono>src/App.tsx</Mono>, <Mono>src/components/IntelligenceView.tsx</Mono>,{" "}
            <Mono>src/components/Thermodynamics.tsx</Mono>, <Mono>src/lib/engine.ts</Mono>, <Mono>src/lib/core.ts</Mono>,{" "}
            <Mono>src/lib/intelligence.ts</Mono>, and the repo-root <Mono>index.html</Mono>.
          </li>
        </ul>
      </Card>

      <Card title="2. Verified facts about the real repo (this session, first-hand)" subtitle="Everything below was read directly, not inferred from a README's framing">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>
            <strong>The repo is not one coherent app.</strong> It has loose root-level <Mono>.tsx</Mono>/<Mono>.md</Mono> files
            (including a 54KB single-file <Mono>index.html</Mono> demo with its own inline React-free JS) <em>and</em> a
            separate, real Vite+React+TypeScript tree under <Mono>src/</Mono>. These are two different deliveries living
            in the same repo.
          </li>
          <li>
            <strong>The live <Mono>src/App.tsx</Mono></strong> renders routes <Mono>/today</Mono>, <Mono>/intelligence</Mono>,{" "}
            <Mono>/people</Mono>, <Mono>/log</Mono>, <Mono>/about</Mono> via a <Mono>Shell</Mono> + <Mono>useHashRoute</Mono>,
            and imports only <Mono>./lib/useHashRoute</Mono> and <Mono>./lib/store</Mono> directly.
          </li>
          <li>
            <strong><Mono>IntelligenceView.tsx</Mono> is live</strong> and imports <Mono>engine</Mono> from{" "}
            <Mono>../lib/engine</Mono> (a disclosed-fabricated, 6-rule findings engine) and renders a live{" "}
            <Mono>Thermodynamics</Mono> component beneath it.
          </li>
          <li>
            <strong><Mono>src/lib/infoTheory.ts</Mono> genuinely exists and is genuinely wired up</strong> — confirmed by
            reading <Mono>Thermodynamics.tsx</Mono> directly, which calls <Mono>infoTheory.shannonEntropy</Mono>,{" "}
            <Mono>infoTheory.mutualInformation</Mono>, <Mono>infoTheory.identifyBottlenecks</Mono>,{" "}
            <Mono>infoTheory.signalToNoise</Mono>, each rendered with its own disclosed-limit label in the UI. This is a
            real, shipped information-theory layer in the real repo.
          </li>
          <li>
            <strong><Mono>src/lib/core.ts</Mono>, <Mono>intelligence.ts</Mono>, <Mono>physics.ts</Mono> are orphaned and
            partly broken</strong> — confirmed first-hand this session (not just quoted from the repo's own prior log):{" "}
            <Mono>intelligence.ts</Mono> contains <Mono>import {"{ engine, run }"} from "./core"</Mono>, but the{" "}
            <Mono>core.ts</Mono> at HEAD exports no <Mono>engine</Mono> and no <Mono>run</Mono> (it exports{" "}
            <Mono>loadState</Mono>, <Mono>project</Mono>, etc.). Neither file is imported by the live{" "}
            <Mono>App.tsx</Mono> or any component actually read this session.
          </li>
          <li>
            <strong>No CAS engine or risk register found anywhere.</strong> The full <Mono>src/lib</Mono> listing (23
            files, enumerated by name this session) contains no file named <Mono>cas.ts</Mono>, <Mono>risk.ts</Mono>, or
            equivalent. No string match for <Mono>riskIntelligence</Mono>, <Mono>buildRiskRegister</Mono>,{" "}
            <Mono>identifyFeedbackLoops</Mono>, <Mono>identifyBifurcationPoints</Mono>, or <Mono>identifyAttractors</Mono>{" "}
            was found in any file actually fetched this session.
          </li>
          <li>
            <strong>The root <Mono>index.html</Mono> single-file demo is real</strong> and does contain an{" "}
            <Mono>identifyAttractors()</Mono> dead-end bug disclosed in its own comments, and ~60 distinct <Mono>R#</Mono>{" "}
            rule IDs — both confirmed by grepping the raw file directly this session. That file's own commentary explicitly
            calls the <strong>"pt-L" label itself "a prior session['s] own README"</strong> framing, i.e. earlier deliveries
            in this same lineage already flagged "pt-L" as an unverified, pasted-prompt narrative — not a settled fact about
            the repo.
          </li>
        </ul>
      </Card>

      <Card title="3. The task's pasted 'pt-L summary', checked against the above" subtitle="Treated as an unverified external claim, per instructions — not as repo fact">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Its central claim — a prior "pt-K" delivery of 58 files, extended here to 62 with{" "}
            <Mono>js/info_theory.js</Mono>, <Mono>js/cas_engine.js</Mono>, <Mono>js/risk_intelligence.js</Mono>,{" "}
            <Mono>js/thermodynamics.js</Mono>, a 144-rule catalog, and a "T_L_*/G_L_*" health-wall test suite — was{" "}
            <strong>not found anywhere</strong> in the file tree, the live app, or the orphaned <Mono>src/lib</Mono> files
            fetched this session.
          </li>
          <li>
            One part of it is <strong>directionally correct but mislabeled</strong>: the real repo does have a live,
            working information-theory module — but it's named <Mono>infoTheory.ts</Mono> (singular file, TypeScript,
            already wired into a <Mono>Thermodynamics.tsx</Mono> component), not a vanilla <Mono>js/info_theory.js</Mono>{" "}
            module inside a 58-file vanilla-JS build.
          </li>
          <li>
            Its closing claims ("62 files. 144 rules. Zero network. Open index.html. That is still the install.") describe
            an install model (single static HTML file, zero build step) that does not match the real repo's primary,
            currently-live surface (a Vite+React+TypeScript app) — and does not match this task's own tool environment
            either (React+Vite+Tailwind, built via <Mono>npm run build</Mono> into <Mono>dist/index.html</Mono>, not a
            hand-authored single file).
          </li>
        </ul>
      </Card>

      <Card title="4. What this delivery actually is" subtitle="Original work, built for this sandbox's tool environment">
        <p className="text-sm text-slate-300">
          Given the above, this app does not continue, fork, or port any unverified prior code. It is a fresh
          React/TypeScript implementation of the <em>functional ideas</em> described in the pasted brief — Shannon
          entropy, mutual information, signal-to-noise, an 8-category risk register, feedback loops, bifurcation points,
          and attractors — written from scratch against this session's own synthetic data model (<Mono>src/lib/seed.ts</Mono>,{" "}
          <Mono>src/lib/rules.ts</Mono>). Specific rule IDs referenced by the pasted brief (R1, R4, R7, R17, R73, R88) were
          deliberately reused in the rule catalog so the named scenarios (burnout loop, velocity death spiral, austerity
          trap, trust collapse) are directly explorable here — this is a design choice for continuity of narrative, not a
          claim that these IDs were found in any real rule engine.
        </p>
        <Label>
          A "cultural bifurcation" is intentionally left unimplemented (its dependency, <Mono>scoreCulture()</Mono>, is
          never defined in the pasted brief, matching a gap the real repo's own prior sessions also found and declined to
          invent a fix for).
        </Label>
      </Card>
    </div>
  );
}
