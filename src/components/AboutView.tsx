import { Card } from "./Shell";

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">About / Provenance</h1>
        <p className="text-sm text-slate-400">
          What was actually checked against <code className="rounded bg-slate-800 px-1">github.com/wbweve/Leados</code> this
          session, what it showed, and what in this delivery is original versus a reimplementation
          of an unverified pasted brief. Full ledger in <code className="rounded bg-slate-800 px-1">AI-SESSION-LOG.md</code>.
        </p>
      </div>

      <Card title="Verified directly this session (read-only, via GitHub's REST API and raw file fetches)">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>
            The repo currently mixes two deliveries: ~40 loose root-level files (incl. a root
            <code className="mx-1 rounded bg-slate-800 px-1">index.html</code> single-file demo,
            <code className="mx-1 rounded bg-slate-800 px-1">AI-SESSION-LOG.md</code>,
            <code className="mx-1 rounded bg-slate-800 px-1">SESSION-3.patch.md</code>) and a
            separate, live Vite+React+TypeScript app under <code className="rounded bg-slate-800 px-1">src/</code>.
          </li>
          <li>
            <code className="rounded bg-slate-800 px-1">src/App.tsx</code> (live, confirmed by raw
            fetch) imports <code className="rounded bg-slate-800 px-1">Shell</code>,{" "}
            <code className="rounded bg-slate-800 px-1">TodayView</code>,{" "}
            <code className="rounded bg-slate-800 px-1">SignalBoardView</code>,{" "}
            <code className="rounded bg-slate-800 px-1">ThermodynamicsView</code>,{" "}
            <code className="rounded bg-slate-800 px-1">CasView</code>,{" "}
            <code className="rounded bg-slate-800 px-1">RiskView</code>,{" "}
            <code className="rounded bg-slate-800 px-1">AboutView</code> from{" "}
            <code className="rounded bg-slate-800 px-1">./components</code>, and{" "}
            <code className="rounded bg-slate-800 px-1">useHashRoute</code>,{" "}
            <code className="rounded bg-slate-800 px-1">loadState</code>,{" "}
            <code className="rounded bg-slate-800 px-1">AppState</code> from{" "}
            <code className="rounded bg-slate-800 px-1">./lib</code>.
          </li>
          <li>
            <code className="rounded bg-slate-800 px-1">src/lib/</code> currently contains 29
            files, including <code className="rounded bg-slate-800 px-1">circadian.ts</code>,{" "}
            <code className="rounded bg-slate-800 px-1">core.ts</code>,{" "}
            <code className="rounded bg-slate-800 px-1">intelligence.ts</code>,{" "}
            <code className="rounded bg-slate-800 px-1">physics.ts</code>,{" "}
            <code className="rounded bg-slate-800 px-1">casEngine.ts</code>,{" "}
            <code className="rounded bg-slate-800 px-1">infoTheory.ts</code>,{" "}
            <code className="rounded bg-slate-800 px-1">riskIntelligence.ts</code>, and more —
            fetched and enumerated directly via the GitHub trees API this session.
          </li>
          <li>
            <code className="rounded bg-slate-800 px-1">src/lib/core.ts</code> (read in full) is a
            self-described "rebuild" layer from an earlier <code className="rounded bg-slate-800 px-1">pt-j</code>-labeled
            session (its own storage key is literally{" "}
            <code className="rounded bg-slate-800 px-1">"leados-pt-j:data"</code>). It exports{" "}
            <code className="rounded bg-slate-800 px-1">DOMAINS</code>,{" "}
            <code className="rounded bg-slate-800 px-1">loadState</code>,{" "}
            <code className="rounded bg-slate-800 px-1">project</code>, etc. — not{" "}
            <code className="rounded bg-slate-800 px-1">engine</code> or{" "}
            <code className="rounded bg-slate-800 px-1">run</code>, which{" "}
            <code className="rounded bg-slate-800 px-1">intelligence.ts</code> tries to import from
            it. That import is broken, and neither file is wired into the live{" "}
            <code className="rounded bg-slate-800 px-1">src/App.tsx</code> — consistent with what
            the repo's own <code className="rounded bg-slate-800 px-1">AI-SESSION-LOG.md</code> already
            documents from an earlier session's inspection.
          </li>
          <li>
            A real <code className="rounded bg-slate-800 px-1">src/lib/circadian.ts</code> exists in
            the repo and was read: a 7-phase, disclosed chronobiology heuristic. This app's own{" "}
            <code className="rounded bg-slate-800 px-1">circadian.ts</code> implements the same
            general idea (phase → analytical/working-memory multiplier) independently, with its own
            numbers — it is not a byte-for-byte copy.
          </li>
          <li>
            The repo's own <code className="rounded bg-slate-800 px-1">AI-SESSION-LOG.md</code> (read
            in full) is itself a prior AI session's provenance ledger, which in turn treats an even
            earlier pasted "pt-L" brief as an unverified specification — this delivery continues
            that same convention for the "pt-U" brief pasted into this task.
          </li>
        </ul>
      </Card>

      <Card title="Not found anywhere in the real repo, this session" className="border-amber-500/30">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>
            No file, export, or global object named <code className="rounded bg-slate-800 px-1">attentionOpt</code>,{" "}
            <code className="rounded bg-slate-800 px-1">buildAttentionItems</code>,{" "}
            <code className="rounded bg-slate-800 px-1">optimizeSequence</code>, or{" "}
            <code className="rounded bg-slate-800 px-1">buildWeeklyAttentionPlan</code> exists in{" "}
            <code className="rounded bg-slate-800 px-1">src/lib</code>'s 29-file listing.
          </li>
          <li>
            No file named <code className="rounded bg-slate-800 px-1">playbooks.ts</code> (or
            equivalent) exists — the "playbooks" concept referenced by the pasted brief is not a
            verified part of the real repo.
          </li>
          <li>
            No evidence anywhere of a global <code className="rounded bg-slate-800 px-1">LEADOS.*</code> namespace
            object. The real repo's verified live code (App.tsx, core.ts, circadian.ts, engine.ts) is
            consistently ES-module named exports per file. The pasted brief's{" "}
            <code className="rounded bg-slate-800 px-1">LEADOS.attentionOpt = {"{ ... }"}</code> code
            sample is therefore treated as an <strong>unverified external specification</strong>, not
            as a quote from real repo code.
          </li>
        </ul>
      </Card>

      <Card title="What this delivery actually is">
        <p className="text-sm leading-relaxed text-slate-300">
          A fresh React + Vite + Tailwind app (this task's required stack), implementing only the{" "}
          <em>described algorithm</em> from the pasted "pt-U" brief — simulated-annealing attention
          sequencing over a cost/benefit/urgency/dependency model — as original TypeScript. It does
          not fork, copy, or claim continuity with any file in{" "}
          <code className="rounded bg-slate-800 px-1">github.com/wbweve/Leados</code>, nor with any
          prior "pt-" session's actual code (none of which is accessible from this workspace, which
          began from the default Vite scaffold). Rule IDs R1/R4/R7/R10/R17/R73/R88/R103/R104 are
          deliberately reused from the brief's own named examples so its dependency chains (R10→R1,
          R104→R103) stay explorable; the rest of the 24-rule catalog, the cost map, the circadian
          heuristic, and all UI are invented for this delivery and disclosed as such.
        </p>
      </Card>
    </div>
  );
}
