import { Card, Badge } from "./ui";

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">About / Provenance</h1>
        <p className="mt-1 text-sm text-slate-500">What was actually checked against github.com/wbweve/Leados this session, and what in this delivery is original.</p>
      </div>

      <Card title="1. What was verified, first-hand, this session">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Fetched the repo's rendered README, its full recursive file tree (148 entries, confirmed not truncated), its root <code>AI-SESSION-LOG.md</code>, and the raw root <code>index.html</code> and <code>package.json</code> directly via GitHub's REST/raw endpoints.</li>
          <li><strong>Verified:</strong> the repo's root <code>index.html</code> is a 352-byte Vite dev-entry stub (<code>&lt;div id="root"&gt;</code> + a script tag to <code>/src/main.tsx</code>) — not a hand-authored, feature-complete single-file app.</li>
          <li><strong>Verified:</strong> <code>src/lib/</code> contains 27 files including <code>casEngine.ts</code>, <code>riskIntelligence.ts</code>, <code>infoTheory.ts</code>, <code>rules.ts</code>, <code>seed.ts</code>, <code>selfTest.ts</code> — consistent with a prior session's documented delivery.</li>
          <li><strong>Verified:</strong> the live <code>src/App.tsx</code> renders Today / Signal Board / Thermodynamics / CAS / Risk / About routes, matching the repo's own current README description — i.e. the README and the live app agree with each other as of this read.</li>
          <li><strong>Verified:</strong> the repo also carries ~40 orphaned root-level loose files (<code>.tsx</code>, <code>.ts</code>, <code>.js</code> — e.g. <code>IntelligenceDashboard.tsx</code>, <code>FinanceDashboard.tsx</code>, <code>engine.js</code>, <code>rules.js</code>) that are not imported by the live <code>src/</code> app — leftovers from earlier, unrelated sessions in this same lineage.</li>
          <li><strong>Searched and NOT found anywhere in the repo:</strong> a <code>js/</code> directory, or any file named <code>life_stage.js</code>, <code>compound_intel.js</code>, <code>wargame.js</code>, <code>org_design.js</code>, <code>stakeholders.js</code>, <code>real_options.js</code>, <code>executive_presence.js</code>, <code>innovation_portfolio.js</code>, <code>change_management.js</code>, or <code>competitive_intel.js</code>.</li>
        </ul>
      </Card>

      <Card title="2. Conclusion">
        <p className="text-sm text-slate-600">
          This task's pasted "pt-O" and "pt-P" module lists are treated as an <Badge tone="amber">unverified specification supplied by the task prompt</Badge>,
          not as a claim about what exists in <code>github.com/wbweve/Leados</code>. This is the same convention the
          real repo's own prior sessions already used for an earlier pasted "pt-L" brief (visible in the repo's own
          <code> AI-SESSION-LOG.md</code>, which treats "pt-K"/"pt-L" the same way). This delivery does not fork, copy,
          or continue any code from the real repo — it is a fresh build in this task's own sandbox, implementing only
          the <em>functional ideas</em> named in the pasted brief, with original code throughout.
        </p>
      </Card>

      <Card title="3. What's real theory vs. original heuristic, per module">
        <div className="space-y-3 text-sm text-slate-600">
          <p><strong>Real, citable frameworks used as-is:</strong> Black-Scholes option pricing (Black & Scholes, 1973) in Real Options; Graicunas' span-of-control formula (1933) in Org Design; the power/interest stakeholder grid (Mendelow, 1981); ADKAR (Hiatt) and Kotter's 8-Step Process (1996) in Change Management; the Three Horizons framework (Baghai, Coley & White, 2000) in Innovation Portfolio; the three-factor Gravitas/Communication/Appearance structure (Hewlett/CTI) in Executive Presence.</p>
          <p><strong>Original, disclosed-fabricated heuristics:</strong> the 12 Life Stage dimensions and their stage thresholds; the compound/fragility detection thresholds in Compound Intelligence; the Wargame payoff matrix; the Org Design coordination-cost and decision-latency formulas; the stakeholder game's payoff numbers; the ADKAR→Kotter step mapping; the Competitive Intel threat-score weighting. None of these are claimed to be validated organizational-science instruments.</p>
          <p><strong>Rule IDs / naming continuity:</strong> this delivery labels sidebar groups "pt-P" (life stage, compound intelligence) and "pt-O" (the other eight modules) purely to mirror the task's own labels for traceability — these are this session's own organizing labels, not evidence that "pt-O"/"pt-P" exist in the real repo.</p>
        </div>
      </Card>

      <Card title="4. Environment constraint that shaped this delivery">
        <p className="text-sm text-slate-600">
          This task's tool environment requires a React + Vite + Tailwind app with <code>src/App.tsx</code> as the entry
          point, built via <code>npm run build</code>. The ten modules were therefore implemented as TypeScript files
          under <code>src/lib/</code> (e.g. <code>lifeStage.ts</code>, <code>compoundIntel.ts</code>) rather than as
          literal <code>js/*.js</code> files, since this sandbox has no vanilla-JS runtime path. This sandbox's own
          <code>package.json</code>/<code>vite.config.ts</code> already matches the real repo's stack exactly, including
          <code>vite-plugin-singlefile</code> — so the build still inlines everything into one <code>dist/index.html</code>
          with zero runtime network calls, preserving the "open index.html, that is the install" property.
        </p>
      </Card>

      <Card title="5. Storage">
        <p className="text-sm text-slate-600">
          State lives in <code>localStorage</code> under <code>leados-oip:v1</code> — a new key, since this sandbox began
          from the default scaffold with no prior app state to continue.
        </p>
      </Card>
    </div>
  );
}
