import { Card, Label, Badge } from "./ui";

export function AboutView() {
  return (
    <div className="space-y-6">
      <Card title="Provenance — read before assuming this continues github.com/wbweve/Leados">
        <p className="text-sm text-slate-700">
          <code>github.com/wbweve/Leados</code> was inspected directly this session — via GitHub's REST Trees API
          (full recursive file list, 148 files), raw fetches of <code>package.json</code>, <code>vite.config.ts</code>,
          root <code>index.html</code>, <code>src/App.tsx</code>, the rendered root <code>README.md</code>, and the
          repo's own <code>AI-SESSION-LOG.md</code> / <code>AI-SESSION-LOG.append.md</code> / <code>SESSION-3.patch.md</code> —
          before any code in this delivery was written.
        </p>

        <h4 className="mt-4 text-sm font-semibold text-slate-800">Verified, first-hand, this session</h4>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>The repo mixes two things in one tree: ~90 loose <b>root-level</b> files (many duplicated as <code>.js</code> AND <code>.ts</code>/<code>.tsx</code> pairs — e.g. <code>engine.js</code> + <code>engine.ts</code>, <code>store.js</code> + <code>store.ts</code>, <code>ui.js</code> + <code>ui.tsx</code>) alongside a separate, self-contained <code>src/</code> Vite+React+TypeScript app.</li>
          <li>The real <code>package.json</code>/<code>vite.config.ts</code> confirm: React 19.2.6, Vite 7.3.2, Tailwind 4 (via <code>@tailwindcss/vite</code>), TypeScript 5.9.3, and <code>vite-plugin-singlefile</code> — so a real build does inline everything into one <code>dist/index.html</code>.</li>
          <li>The <b>live</b> <code>src/App.tsx</code>, read directly, routes <code>/today /signals /thermodynamics /cas /risk /about</code> to <code>TodayView / SignalBoardView / ThermodynamicsView / CasView / RiskView / AboutView</code> — this matches the rendered README's own "Pages" table exactly, corroborating that part of the README first-hand.</li>
          <li>The root-level <code>index.html</code>, read directly <b>this session</b>, is the default 352-byte Vite scaffold pointing at <code>/src/main.tsx</code> — <b>not</b> a large hand-rolled single-file demo. This directly contradicts byte-size claims in the repo's own prior session logs (which, across different sessions, variously describe the root <code>index.html</code> as 1,920 B, 54,081 B, 251,817 B, and 337,974 B at different points in time). Conclusion: file state in this repo is highly volatile between sessions — a historical claim about file size/contents is not evidence of current state.</li>
          <li>No file, export, or path containing <code>talent</code>, <code>financial_os</code>, <code>regulatory</code>, <code>narrative</code>, <code>org_ode</code>/<code>orgPhysics-ODE</code>, <code>attention_opt</code>, <code>living_docs</code>, or <code>scenarios</code> exists anywhere in the 148-file tree (checked by direct substring match against every path, this session).</li>
        </ul>

        <h4 className="mt-4 text-sm font-semibold text-slate-800">Treated as unverified</h4>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>The task prompt's pasted "Part 4–8" brief and its "pt-U Implementation Summary" (105 files, 220 rules, <code>T_U_1…T_U_20</code> test suite) — <b>no trace of this file list, rule count, or test-ID scheme was found anywhere in the real repo.</b> It is treated here exactly as the real repo's own prior sessions treated their own pasted "pt-L" brief: an external specification to satisfy functionally, not a claim about repo history.</li>
          <li>This delivery does <b>not</b> fork, copy, or continue any file from <code>github.com/wbweve/Leados</code>. This sandbox began from the default Vite scaffold <code>App.tsx</code>, with no access to any prior session's actual code.</li>
        </ul>

        <h4 className="mt-4 text-sm font-semibold text-slate-800">Disclosed gaps in this delivery</h4>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li><b>Rules R206, R207, R220</b> (living strategy documents) and <b>R216</b> (simulated-annealing attention optimizer) are <b>not implemented</b> — their dependencies are described only in the pasted summary's "Parts 1–3", whose full code was not pasted into this session. Inventing them would misattribute original work to an unseen spec.</li>
          <li><b>Scenario federation</b> (<code>LEADOS.scenarios</code>) is replaced by a small local 3-scenario stand-in inside <code>financialOS.ts</code>, clearly labeled, since the full module wasn't pasted either.</li>
          <li>The ODE system's own formulas (as given in the pasted brief) have <b>no exact all-variables-zero fixed point</b> for generic states — e.g. <code>dC</code> never references <code>C</code> itself, and the pulls toward 5 vs 8 for different variables are not mutually consistent. This is a mechanical observation about the pasted formulas, not a bug introduced here; self-tests (ST-05/ST-06/ST-07) verify directional and boundary behavior instead of a false "equilibrium" claim.</li>
          <li>All people, events, metrics, jurisdictions, and narrative outcomes are <b>fabricated demo data</b> (<code>src/lib/seed.ts</code>), regenerated deterministically unless "Regenerate synthetic data" is clicked.</li>
        </ul>

        <Label>
          Full session-by-session ledger (calls made, raw responses, byte counts) is in <code>AI-SESSION-LOG.md</code> in
          this delivery's repo root.
        </Label>
      </Card>

      <Card title="What's original vs. what's a reused idea">
        <div className="space-y-2 text-sm text-slate-700">
          <div><Badge tone="indigo">Original</Badge> <span className="ml-1">All TypeScript in <code>src/lib/*.ts</code> and all UI components — written fresh for this delivery, satisfying the pasted brief's described behavior.</span></div>
          <div><Badge tone="slate">Reused idea, not code</Badge> <span className="ml-1">The event-type shapes (<code>talent.succession.candidate</code>, <code>reg.interpretation</code>, <code>narrative.outcome</code>, etc.) and formula definitions (LTV:CAC, Rule of 40, RK4 integration) come from the task's pasted brief — no source for them exists in the real repo, so "reused" means "implemented to match the brief's description," not "copied from a verified prior implementation."</span></div>
          <div><Badge tone="amber">Gap, left as a gap</Badge> <span className="ml-1">R206/R207/R216/R220 and full scenario federation — see above.</span></div>
        </div>
      </Card>
    </div>
  );
}
