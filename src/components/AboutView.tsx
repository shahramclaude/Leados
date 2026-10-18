import { Card, SectionHeading } from './ui';

export function AboutView() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="About" title="Provenance ledger" desc="What was checked, what was found, what is original, what is disclosed as unverified." />

      <Card className="space-y-3 text-sm leading-relaxed text-slate-600">
        <h3 className="font-semibold text-slate-900">1. github.com/wbweve/Leados — verified this session</h3>
        <p>
          Fetched directly via <code>web_fetch</code> this session (its README, which itself documents a prior AI session's own inspection of its file tree,
          <code> AI-SESSION-LOG.md</code>, root <code>index.html</code>, and live <code>src/</code> files).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>It is a React + Vite + Tailwind app implementing <strong>information theory ("Thermodynamics")</strong>, a <strong>CAS engine</strong>, and an <strong>8-category Risk Register</strong>, driven by a 50-rule "Signal Board."</li>
          <li>That repo has <strong>no</strong> <code>bayesian.ts</code>, <code>wargame.ts</code>, <code>finIntel.ts</code>, <code>healthScore.ts</code>, <code>performance.ts</code>, <code>scenarios.ts</code>, or <code>livingDocs.ts</code>, and no <code>strategy.doc</code> event type. Not found anywhere in what was fetched.</li>
          <li>It was built by a different AI session, in a different sandbox, with its own storage key (<code>leados-sandbox:v1</code>). This build shares no code or runtime state with it.</li>
        </ul>

        <h3 className="pt-2 font-semibold text-slate-900">2. This sandbox project — verified this session</h3>
        <p>
          Checked via <code>list_files</code> / <code>read_file</code> before writing anything: <code>src/App.tsx</code> was the untouched default scaffold ("Ready to build"), there was no prior
          <code> AI-SESSION-LOG.md</code> or custom README, and no LEADOS code existed here at all. This is a fresh build with no local history to continue.
        </p>

        <h3 className="pt-2 font-semibold text-slate-900">3. The pasted "Part 2 / Part 3" brief — treated as unverified external spec</h3>
        <p>
          The <code>LEADOS.scenarios</code> and <code>LEADOS.livingDocs</code> code pasted into this task's prompt does not exist in the real repo and was not
          independently verifiable. Per the same convention the real repo's own README already uses for its pasted "pt-L" brief, it is treated here as a
          specification of <em>desired behavior</em>, not as working code to copy. Supporting modules the spec assumes already exist
          (<code>LEADOS.bayesian</code>, <code>LEADOS.wargame</code>, <code>LEADOS.finIntel</code>, <code>LEADOS.engine</code>, <code>LEADOS.healthScore</code>,
          <code> LEADOS.performance</code>, <code>LEADOS.events</code>) were <strong>not found anywhere</strong> and were built from scratch, only as deep as Part 2 and Part 3 need.
        </p>

        <h3 className="pt-2 font-semibold text-slate-900">4. A disclosed bug fix in the pasted spec</h3>
        <p>
          <code>buildScenarioSet</code>'s own comment says it sorts beliefs to put "highest uncertainty" first, but its comparator —
          <code> (1 - |a.posterior-0.5|) - (1 - |b.posterior-0.5|)</code>, ascending — actually orders the <em>most confident</em> belief first. Implemented
          literally, "uncertainty-driven scenarios" would pick the belief the org is surest about, defeating the feature's stated purpose. Fixed here to sort
          ascending by <code>|posterior - 0.5|</code> so axis 1 really is the most uncertain belief. This is a disclosed correction, not a silent copy.
        </p>

        <h3 className="pt-2 font-semibold text-slate-900">5. Everything else original to this build</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>The synthetic roster/event generator (<code>seed.ts</code>), deterministic via a seeded PRNG so "reset" is reproducible.</li>
          <li>The simplified log-odds Bayesian scoring model (<code>bayesian.ts</code>) — disclosed in its own label as a heuristic, not a calibrated forecast.</li>
          <li>The findings engine, health score, win-rate/runway/engagement computations — minimal and rule-based, built only to make Part 2/3 real rather than mocked.</li>
          <li>All UI, including the Signal Console that lets you inject real events and watch beliefs / scenarios / strategy validity recompute live.</li>
        </ul>

        <h3 className="pt-2 font-semibold text-slate-900">6. Build property verified this session</h3>
        <p>
          <code>vite.config.ts</code> already had <code>vite-plugin-singlefile</code> configured before this session started. Confirmed via <code>npm run build</code>
          that <code>dist/index.html</code> is produced as a single file with JS/CSS inlined — the same "open one file" property the real repo's README
          describes for itself, produced the same way (a build step, not hand-authoring).
        </p>
      </Card>
    </div>
  );
}
