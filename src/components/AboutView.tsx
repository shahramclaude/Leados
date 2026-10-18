import { Panel, Label } from './Shell';

export function AboutView() {
  return (
    <div className="space-y-6">
      <Panel title="Provenance — read before assuming this continues github.com/wbweve/Leados">
        <p className="text-sm text-slate-700">
          <code>github.com/wbweve/Leados</code> was inspected directly this session via GitHub's REST API (commits, git
          trees, contents listings) and direct raw-file fetches — before any code in this app was written. Full detail
          is in <code>AI-SESSION-LOG.md</code>; short version below.
        </p>
      </Panel>

      <Panel title="1. What was verified, first-hand, this session">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Repo churn:</strong> at the time of inspection, HEAD was commit <code>5c84566</code> (2026-10-17
            14:03 UTC) — the <em>fifth</em> "Add files via upload" commit in under an hour (13:10–14:03 UTC). This is
            consistent with successive sessions repeatedly overwriting the repo, not incremental development.
          </li>
          <li>
            <strong>The repo's own README/AI-SESSION-LOG at that commit</strong> describe a "LEADOS Sandbox —
            Thermodynamics, CAS Engine, Risk Intelligence" app with hash routes <code>#/today #/signals
            #/thermodynamics #/cas #/risk #/about</code> and a project tree under <code>src/lib/*</code> (types,
            rules, seed, store, engine, infoTheory, casEngine, riskIntelligence, selfTest) and <code>src/components/*</code>.
          </li>
          <li>
            <strong>But the live <code>src/App.tsx</code> at that same commit</strong> (fetched raw, 1195 bytes)
            imports a different set entirely — <code>./lib/store</code>, <code>./lib/seed</code>,{' '}
            <code>./lib/engine</code>, <code>./lib/types</code>, and components <code>Shell, TodayView,
            IntelligenceView, DataView, HealthView, AboutView</code> — five routes
            (today/intelligence/data/health/about), <strong>not</strong> the six the README documents. No file named
            <code> casEngine.ts</code>, <code>riskIntelligence.ts</code>, or <code>SignalBoardView</code> was found
            under <code>src/</code> at this commit.
          </li>
          <li>
            <strong>A large, separate pile of ~30+ loose <code>.tsx</code> files sits at repo root</strong> alongside
            the real <code>src/</code> tree — e.g. <code>FinanceDashboard.tsx</code>, <code>ContractView.tsx</code>,{' '}
            <code>RosterView.tsx</code>, <code>BundlesView.tsx</code>, <code>BundleModal.tsx</code>,{' '}
            <code>Catalog.tsx</code>, <code>PlaybooksView.tsx</code>, <code>PeopleDashboard.tsx</code>,{' '}
            <code>Network.tsx</code>, <code>Radar.tsx</code>, <code>Heatmap.tsx</code>, <code>CommandPalette.tsx</code>,
            and a <em>second, different</em> <code>App.tsx</code> (1847 bytes — a distinct file from{' '}
            <code>src/App.tsx</code>'s 1195 bytes, confirmed by differing blob SHAs). These filenames don't match
            anything in the README's documented structure and don't match what the live <code>src/App.tsx</code>{' '}
            imports. This looks like debris from an unrelated delivery (a finance/CRM-style dashboard), not part of
            the live LeadOS app.
          </li>
          <li>
            <strong>A public search index</strong> separately surfaced an older cached version of this repo
            describing a completely different, vanilla-JS, no-build-step app ("pt-3 growth slice": <code>engine.js</code>,{' '}
            <code>store.js</code>, <code>events.js</code>, <code>health.js</code>, flat 14-entry tree). That does not
            match current HEAD and is treated here strictly as a <strong>stale snapshot</strong>, not current fact.
          </li>
        </ul>
      </Panel>

      <Panel title="2. What this means for this delivery">
        <p className="text-sm text-slate-700">
          The repo does not currently contain a working, internally-consistent implementation of anything resembling
          this task's pasted "pt-V" brief (<code>LEADOS.hypothesis</code>, <code>LEADOS.emergent</code>,{' '}
          <code>LEADOS.agent</code>, <code>LEADOS.layout</code>, the 20-step boot sequence, etc.) — no matching file,
          export, or identifier was found anywhere fetched this session. The brief is therefore treated as an{' '}
          <strong>unverified external specification</strong>, the same convention the repo's own prior sessions
          already used for their own pasted briefs.
        </p>
      </Panel>

      <Panel title="3. What's original in this delivery vs. what's a disclosed simplification">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Original, built from scratch:</strong> every file under this app's own <code>src/lib</code> and{' '}
            <code>src/components</code> — the Hypothesis Engine, Emergent Pattern Detector (Poisson z-score frequency
            anomalies, 7-day co-occurrence clustering, CUSUM behavioral change points), the three-level Autonomous
            Agent authority model, the Cognitive Load score, and the synthetic seed generator/roster. These implement
            the <em>functional ideas</em> described in the pasted brief, not a port of any verified prior code.
          </li>
          <li>
            <strong>Disclosed simplification:</strong> the brief's 20-step session "boot sequence" (workers, haptics,
            voice input, gamepad support, a living stylesheet, a protocol server, circadian adaptation, etc.) is not
            implemented — those modules were not found anywhere in the real repo either, and inventing 15+ speculative
            subsystems for a static sandbox would misrepresent effort as verified capability. The four modules
            actually built (Hypothesis Engine, Emergent Pattern Detector, Autonomous Agent Loop, and a working slice
            of the Cognitive Load Architecture) are the ones this delivery can run live, on real computed numbers, in
            front of you.
          </li>
          <li>
            <strong>Disclosed simplification:</strong> "cognitive load" here is recomputed on each render from
            counts of open findings/hypotheses/anomalies/pending proposals — not a continuously-running background
            fatigue model, since this is a static build with no server or timer loop.
          </li>
          <li>
            <strong>Command palette / voice / keyboard map</strong> from the pasted brief's "Final Interface" section
            are out of scope for this delivery — left out rather than stubbed, to avoid implying a capability that
            isn't there.
          </li>
        </ul>
      </Panel>

      <Label>
        Full call-by-call inspection ledger (commit SHAs, byte sizes, exact imports fetched) is in this project's{' '}
        <code>AI-SESSION-LOG.md</code>.
      </Label>
    </div>
  );
}
