import { Card } from "./Shell";

export function ProvenanceView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Provenance</h1>
        <p className="text-sm text-stone-500">What was actually checked in <code>github.com/wbweve/Leados</code> this session, and how this build relates to it.</p>
      </div>

      <Card title="1. The repo was inspected directly, not assumed">
        <p className="text-sm text-stone-600">
          Fetched the GitHub REST API tree (<code>git/trees/main?recursive=1</code>), the commit history, and several
          raw files directly, instead of trusting a rendered README or the task's own pasted summary.
        </p>
      </Card>

      <Card title="2. Verified fact: the repo is being overwritten extremely fast and is internally contradictory">
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          <li>5 commits landed inside roughly one hour (13:10–14:03 UTC on the day it was checked), every one titled "Add files via upload" by the same author — consistent with repeated whole-repo overwrites, not incremental edits.</li>
          <li>At the inspected commit, the tree had <strong>148 entries</strong>: a flat vanilla-JS app at the root (<code>index.html</code>, <code>app.css</code>, <code>engine.js</code>, <code>events.js</code>, <code>health.js</code>, <code>playbooks.js</code>, <code>store.js</code>, <code>ui.js</code>, <code>rules.js</code>), a second, separate pile of 50+ loose root-level <code>.tsx</code>/<code>.ts</code> files (another <code>App.tsx</code>, dashboards, charts, widgets), <em>and</em> a third, properly nested <code>src/</code> Vite+React+TypeScript app — three incompatible deliveries layered in one place.</li>
          <li>The repo's own <code>README.md</code> (fetched directly) describes only the <code>src/</code> app's file list — and that description is already stale against the tree sitting next to it (it lists ~10 <code>src/lib</code> files; the real tree has 26; it lists ~8 <code>src/components</code> files; the real tree has 23).</li>
          <li>The root <code>index.html</code> is a Vite dev shell (<code>&lt;script type="module" src="/src/main.tsx"&gt;</code>) requiring a build step — contradicting an earlier, separately-indexed description of this same repo as a hand-authored, zero-build-step, "open index.html" vanilla-JS app.</li>
        </ul>
      </Card>

      <Card title="3. The pasted 'pt-R implementation summary' in this task: not found anywhere">
        <p className="text-sm text-stone-600">
          The task prompt included a detailed "pt-R" summary claiming 89 files, modules named
          <code> js/attention.js</code>, <code>js/layout_engine.js</code>, <code>js/proactive.js</code>,{" "}
          <code>js/command_intel.js</code>, <code>js/notifications.js</code>, <code>js/health_score.js</code>, rules
          R176–R185, and tests T_R_1…T_R_10. <strong>None of those file names, rule IDs, or test IDs appear anywhere
          in the 148-entry tree, the README, or the session log actually fetched this session.</strong> It is treated
          here as an <strong>unverified pasted narrative</strong>, exactly like the repo's own prior sessions treated
          their own pasted "pt-K" / "pt-L" briefs (per the matching disclosure found in one of the repo's own
          generations) — not as a fact about the real repository, and not as something this build continues.
        </p>
      </Card>

      <Card title="4. What this delivery actually is">
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          <li>A fresh React + Vite + Tailwind app, built in this task's own sandbox, entry point <code>src/App.tsx</code>.</li>
          <li>It does <strong>not</strong> fork, copy, or continue any state from <code>wbweve/Leados</code>. It uses its own storage key, its own 11-rule catalog, and its own 6-test self-test suite — all original to this session.</li>
          <li>The general shape of a few ideas — a decayed severity-weighted domain score, "project live from state on every read," composite/meta-rules, a self-test runner that exercises real production functions — mirrors patterns common across small leadership-tracking tools (including fragments of the inspected repo's own generations), but every line of code here is a fresh implementation, not a port.</li>
          <li>Scope is deliberately modest (11 rules, 6 domains, 6 self-tests) rather than matching the escalating file/rule counts claimed in the pasted brief — inflating scope to match an unverified narrative would itself be a false claim.</li>
        </ul>
      </Card>

      <Card title="5. Labeling key">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800"><strong>Verified</strong> — confirmed by direct API/raw-file fetch this session.</div>
          <div className="rounded-lg bg-amber-50 p-3 text-amber-800"><strong>Unverified</strong> — present in a prior README/log/pasted brief, not independently re-checked byte-for-byte.</div>
          <div className="rounded-lg bg-stone-100 p-3 text-stone-700"><strong>Original</strong> — written for this delivery, no claimed external source.</div>
        </div>
      </Card>
    </div>
  );
}
