import { Card, SectionTitle, Tag, Callout } from './ui';
import { DISCLOSED_GAPS } from '../lib/extras';

export function AboutView() {
  return (
    <div className="space-y-6">
      <SectionTitle title="About / Provenance" subtitle="What was checked against github.com/wbweve/Leados this session, what was found, and what in this delivery is spec-faithful, original, or a disclosed gap." />

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">1. What was verified about the real repo, this session</h3>
        <p className="mb-3 text-sm text-slate-600">Checked via GitHub's REST API and raw-file fetches only (no clone, no code execution, no git history/PRs/issues).</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li><Tag kind="VERIFIED" /> <strong>The repo mixes at least three separate, mutually inconsistent lineages in one place:</strong> (a) ~60 loose root-level <code>.tsx</code>/<code>.md</code> files plus a root <code>index.html</code>/<code>README.md</code> describing a "LEADOS Sandbox" (Thermodynamics + CAS Engine + Risk Intelligence); (b) a separate live <code>src/</code> Vite+React+TypeScript tree with its own <code>App.tsx</code>, <code>components/</code>, and 28 files under <code>src/lib/</code>; (c) an <code>AI-SESSION-LOG.append.md</code> describing yet another, vanilla-JS single-file lineage ("mf-1"/"mf-2": <code>index.html</code>, <code>store.js</code>, <code>events.js</code>, <code>engine.js</code>, <code>ui.js</code>) that doesn't match either (a) or (b).</li>
          <li><Tag kind="VERIFIED" /> The repo's own <code>AI-SESSION-LOG.md</code> documents an earlier session finding <strong>no</strong> CAS engine, risk register, or info-theory files anywhere in <code>src/lib</code> (24 files listed) — yet the <em>current</em> <code>src/lib</code> listing (fetched independently this session) has 28 files, including <code>casEngine.ts</code>, <code>riskIntelligence.ts</code>, <code>rules.ts</code>, and <code>selfTest.ts</code>, none of which appear in that log's own file list. <strong>Conclusion: the repo's own session log is stale relative to its current tree</strong> — a later, unlogged (or separately-logged) session added those files after the log entry was written.</li>
          <li><Tag kind="VERIFIED" /> <code>src/App.tsx</code> (current, raw-fetched) imports <code>TodayView</code>, <code>SignalBoardView</code>, <code>ThermodynamicsView</code>, <code>CasView</code>, <code>RiskView</code>, <code>AboutView</code> from <code>./components</code> — consistent with the current root README's description of a Signal-Board-driven app, and inconsistent with the older session log's own description of the live app's import list (<code>IntelligenceView</code>, <code>PeopleView</code>, <code>EventLogView</code>), confirming the component tree was substantially replaced at some point.</li>
          <li><Tag kind="UNVERIFIED" /> Anything about "pt-P" specifically. No part of this conversation or the repo's fetched files used that exact label — the task's own framing ("everything through pt-P is retrospective and correlational") is treated as a claim about this session's input brief, not as a verified fact about repo history.</li>
        </ul>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">2. Why this delivery does not continue any of that history</h3>
        <p className="text-sm text-slate-600">This sandbox's tool environment began from the default Vite scaffold (plain <code>src/App.tsx</code>, no prior state) — it is not a checkout of <code>github.com/wbweve/Leados</code> and has no access to its git history. Given that the real repo's own lineages already actively contradict and supersede each other, continuing any one of them here (e.g. porting <code>src/lib/casEngine.ts</code>) would misrepresent a chosen fragment as "the" continuation when the repo itself has no single continuous thread. This build is therefore <strong>original, in this task's own environment</strong>, implementing the functional ideas in the pasted pt-Q brief — not a port of any verified repo file.</p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">3. What's spec-faithful vs. original in this delivery</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li><Tag kind="CONFIRMED" /> <code>src/lib/causal.ts</code> — ported line-for-line in structure from the pasted pt-Q Part 1 (<code>LEADOS.causal</code>): the same variable set, ASSUMED edge list with the same citations, EVIDENCED Pearson-correlation computation, CONFIRMED annotation mechanism, backdoor-adjustment do-calculus estimator, and Lewis-style counterfactual replay.</li>
          <li><Tag kind="CONFIRMED" /> <code>src/lib/flightRisk.ts</code> — ported from the pasted pt-Q Part 2 (<code>LEADOS.flightRisk</code>): departure-signature construction, weighted similarity scoring, heuristic fallback, and the explicit "never used for any employment decision" label.</li>
          <li><Tag kind="ORIGINAL" /> <code>src/lib/extras.ts</code> (High-Potential, Power Network, Meeting Intelligence) — the pasted brief only names these capabilities in its intro, without algorithms. Everything here is invented for this build and labeled as a simplified heuristic, not a verified method.</li>
          <li><Tag kind="ORIGINAL" /> All seed data, UI components, routing, storage layer (<code>leados-ptq:v1</code>), and the minimal findings engine (<code>engine.ts</code>) used to support the counterfactual tool's "active findings" metric.</li>
        </ul>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold text-slate-900">4. Disclosed gaps</h3>
        <p className="mb-3 text-sm text-slate-600">Named in the pasted pt-Q brief's intro but <strong>not implemented</strong> this session, with why:</p>
        <ul className="space-y-2">
          {DISCLOSED_GAPS.map((g, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-800">{g.name}</div>
              <div className="mt-1 text-slate-500">{g.why}</div>
            </li>
          ))}
        </ul>
      </Card>

      <Callout tone="amber">
        All org/people data in this app is synthetic demo data generated by a seeded PRNG (<code>src/lib/seed.ts</code>), not real. Every causal and
        flight-risk claim is labeled with its type (ASSUMED / EVIDENCED / CONFIRMED / HYPOTHETICAL) and evidence base directly in the UI, per the brief's own
        stated requirement.
      </Callout>
    </div>
  );
}
