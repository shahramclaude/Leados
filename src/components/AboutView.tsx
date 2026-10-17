import { Card, Badge } from "./ui";

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">About / Provenance</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          What was actually checked against <code className="text-slate-400">github.com/wbweve/Leados</code> before this app was written,
          what was found, and exactly which parts of this delivery are original, modeled on a verified pattern, or a disclosed gap. Full
          ledger in <code className="text-slate-400">AI-SESSION-LOG.md</code>.
        </p>
      </div>

      <Card title="This session's independent verification">
        <p className="text-xs text-slate-400">
          The repo's rendered README (fetched first) contains its own "provenance ledger" narrative, written by an earlier session, which
          includes this claim:
        </p>
        <blockquote className="mt-2 border-l-2 border-slate-700 pl-3 text-xs italic text-slate-500">
          "Not found anywhere in the real repo, this session: any CAS engine, any risk register, any file named cas.ts/risk.ts/equivalent…"
        </blockquote>
        <p className="mt-2 text-xs text-slate-400">
          That claim was <Badge tone="rose">checked, not trusted</Badge> and found to be <strong>false against the repository's current
          main branch</strong>, verified directly this session via GitHub's REST API and raw file fetches:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
          <li><code className="text-slate-300">src/lib/casEngine.ts</code> exists (feedback loops, bifurcation points, attractors).</li>
          <li><code className="text-slate-300">src/lib/riskIntelligence.ts</code> exists (8-category register, cross-category amplification).</li>
          <li>
            The live <code className="text-slate-300">src/App.tsx</code> imports <code className="text-slate-300">CasView</code> and{" "}
            <code className="text-slate-300">RiskView</code> and routes to them at <code className="text-slate-300">/cas</code> and{" "}
            <code className="text-slate-300">/risk</code>.
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Most likely explanation (unverified — no commit history was inspected): the README describing their absence was written against
          an earlier commit, and a later session added these files without updating that README. The repository's own prior session log
          and README should therefore be read as a snapshot in time, not as current fact — exactly the caution this app's own provenance
          claims below are trying to avoid repeating.
        </p>
      </Card>

      <Card title="What was independently verified this session, directly">
        <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate-400">
          <li>Full recursive file tree via <code className="text-slate-300">GET /repos/wbweve/Leados/git/trees/main?recursive=1</code>.</li>
          <li>
            Root <code className="text-slate-300">index.html</code> is a standard Vite entry point (12 lines, <code className="text-slate-300">&lt;div id="root"&gt;</code> +{" "}
            <code className="text-slate-300">/src/main.tsx</code>), not a hand-authored single-file demo.
          </li>
          <li>
            Current <code className="text-slate-300">src/App.tsx</code> imports <code className="text-slate-300">Shell</code>,{" "}
            <code className="text-slate-300">TodayView</code>, <code className="text-slate-300">SignalBoardView</code>,{" "}
            <code className="text-slate-300">ThermodynamicsView</code>, <code className="text-slate-300">CasView</code>,{" "}
            <code className="text-slate-300">RiskView</code>, <code className="text-slate-300">AboutView</code>; routes <code className="text-slate-300">/today</code>,{" "}
            <code className="text-slate-300">/signals</code>, <code className="text-slate-300">/thermodynamics</code>, <code className="text-slate-300">/cas</code>,{" "}
            <code className="text-slate-300">/risk</code>, <code className="text-slate-300">/about</code>.
          </li>
          <li>
            <code className="text-slate-300">src/lib/infoTheory.ts</code> exists and is imported by <code className="text-slate-300">ThermodynamicsView.tsx</code>, which calls{" "}
            <code className="text-slate-300">shannonEntropy</code>, <code className="text-slate-300">mutualInformation</code>,{" "}
            <code className="text-slate-300">signalToNoise</code>, <code className="text-slate-300">identifyBottlenecks</code> — a real, live information-theory layer.
          </li>
          <li>
            <code className="text-slate-300">src/lib/core.ts</code> exports <code className="text-slate-300">DOMAINS, DECAY, CORRELATION_WINDOW_DAYS, DECISION_MAX_OPEN_DAYS, STORAGE_KEY, loadState, saveState, appendEvent, seedIfEmpty, project</code>.
            It does <strong>not</strong> export <code className="text-slate-300">engine</code> or <code className="text-slate-300">run</code>.
          </li>
          <li>
            <code className="text-slate-300">src/lib/intelligence.ts</code> contains <code className="text-slate-300">import {"{ engine, run }"} from "./core"</code> — confirmed broken
            against the export list above. Neither <code className="text-slate-300">intelligence.ts</code> nor <code className="text-slate-300">physics.ts</code> is imported by the
            current <code className="text-slate-300">src/App.tsx</code>: both are orphaned in the current tree.
          </li>
          <li>
            The repo mixes dozens of loose root-level <code className="text-slate-300">.tsx</code>/<code className="text-slate-300">.ts</code> files (an older,
            apparently superseded delivery) alongside a separate, currently-live <code className="text-slate-300">src/</code> Vite+React+TS app. This app was
            compared only against the <code className="text-slate-300">src/</code> tree, since that is what <code className="text-slate-300">index.html</code> actually boots.
          </li>
        </ul>
      </Card>

      <Card title="What's original, modeled, or a disclosed gap in THIS delivery">
        <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate-400">
          <li>
            <strong>Modeled on a verified real-repo pattern, reimplemented from scratch:</strong> <code className="text-slate-300">src/lib/infoTheory.ts</code> here
            (Shannon entropy, mutual information, SNR, bottlenecks). The real repo's pair was confirmed to exist and render the same four
            metrics; this file's internals were written fresh, not copied line-by-line, using the standard textbook formulas the metrics are named after.
          </li>
          <li>
            <strong>Built from scratch, modeled on the real repo's module boundaries (not its code):</strong>{" "}
            <code className="text-slate-300">src/lib/casEngine.ts</code> and <code className="text-slate-300">src/lib/riskIntelligence.ts</code> here. The real
            repo's equivalents exist and are wired up, but their internals were not fetched line-by-line for this delivery — only their existence,
            file names, and import graph were verified. The logic inside this app's versions (which rule IDs compose into which named loop) is original
            to this delivery.
          </li>
          <li>
            <strong>A gap, left as a gap:</strong> "cultural bifurcation" is not implemented. Its dependency, a hypothetical{" "}
            <code className="text-slate-300">scoreCulture()</code>, is not defined anywhere this session verified — inventing one would misattribute
            invented behavior to a "verified" source.
          </li>
          <li><strong>Original to this delivery:</strong> all UI, the 50-rule catalog, the synthetic roster/event generator, the self-test suite, and the storage layer.</li>
        </ul>
      </Card>

      <Card title="Build / environment note">
        <p className="text-xs text-slate-400">
          This task's tool environment requires a React + Vite + Tailwind app with a single <code className="text-slate-300">src/App.tsx</code> entry
          point, built with <code className="text-slate-300">npm run build</code>. This project's <code className="text-slate-300">vite.config.ts</code>{" "}
          includes the <code className="text-slate-300">vite-plugin-singlefile</code> plugin, so the build output is a single{" "}
          <code className="text-slate-300">dist/index.html</code> with JS/CSS inlined — verified by running the build and inspecting the output file,
          not assumed from the plugin's name alone.
        </p>
      </Card>
    </div>
  );
}
