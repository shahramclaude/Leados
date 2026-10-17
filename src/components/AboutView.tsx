import { Card, DisclosureTag, Label, Mono } from "./ui";

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">About / Provenance</h1>
        <p className="mt-1 text-sm text-slate-400">
          What was checked against the real <Mono>github.com/wbweve/Leados</Mono> repository this session, what was found,
          and what in this app is original vs. heuristic. Condensed from AI-SESSION-LOG.md.
        </p>
      </div>

      <Card title="How the repo was inspected" subtitle="GitHub REST API, this session — not assumed from the task prompt">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li>
            Fetched repo metadata (<Mono>GET /repos/wbweve/Leados</Mono>) and the full recursive git tree (<Mono>GET
            /git/trees/main?recursive=1</Mono>).
          </li>
          <li>
            Fetched root directory listing (<Mono>GET /contents/</Mono>) and the <Mono>src/</Mono>, <Mono>src/lib/</Mono>
            subdirectory listings directly.
          </li>
          <li>
            Read raw file contents for <Mono>README.md</Mono>, <Mono>index.html</Mono>, <Mono>src/App.tsx</Mono>,{" "}
            <Mono>src/lib/core.ts</Mono>, <Mono>src/lib/intelligence.ts</Mono> via <Mono>raw.githubusercontent.com</Mono>.
          </li>
          <li>Did not run the repo's own build or test suite — read-only, API-based inspection only.</li>
        </ul>
      </Card>

      <Card title="Verified facts about the real repo">
        <div className="space-y-4">
          <Finding tag="real" text="The repo root contains ~45+ loose, duplicate-concept .tsx files (e.g. AboutView.tsx, App.tsx, IntelligenceDashboard.tsx, IntelligenceView.tsx, FinanceDashboard.tsx, Network.tsx, RosterView.tsx, Catalog.tsx, CommandPalette.tsx…) that sit outside any src/ folder." />
          <Finding tag="real" text="The repo also contains a complete, separate src/ tree (src/App.tsx, src/components/*, src/lib/*, src/main.tsx, src/index.css) — a Vite + React + TypeScript project shape." />
          <Finding tag="real" text="src/App.tsx (the file Vite would actually build) only imports from ./components/* and ./lib/{storage,circadian,fatigue,workers,types}. It does not import src/lib/core.ts, src/lib/intelligence.ts, or src/lib/physics.ts." />
          <Finding tag="real" text="src/lib/intelligence.ts imports { engine, run } from './core' — but the src/lib/core.ts fetched this session exports no 'engine' and no 'run' (it exports project(), loadState(), DOMAINS, etc. instead). That import would fail to resolve as written." />
          <Finding tag="real" text="src/lib/core.ts and src/lib/intelligence.ts contain their own disclosure comments, written by a prior session in this same lineage, stating that LEADOS.temporalField / correlate / simulate / predict / leaderSelf / calibration were not found anywhere in the real repo and are that prior session's own invention." />
          <Finding tag="gap" text="No file, export, string, or comment matching 'infoTheory', 'shannonEntropy', 'mutualInformation', 'LEADOS.infoTheory', or 'thermodynamics' was found anywhere in the fetched repo content (root files, src/, src/lib/). The pt-L brief's module is therefore treated as an unverified specification pasted into this task, not as code known to exist in that repository." />
          <Finding tag="real" text="The repo's own README (top of main) accurately describes the src/ tree (Today / Decisions / Energy & Fatigue / Memory & Genome / Accessibility / Event Log / About-Provenance views) and explicitly documents the root-level duplicate-files contradiction — i.e. the README's own provenance section matches what this session independently re-verified via the API." />
        </div>
      </Card>

      <Card title="What's real vs. heuristic vs. not implemented in THIS app (pt-L delivery)">
        <div className="space-y-4">
          <Finding tag="real" text="The event log (localStorage, append-only), the roster, the Export/Reset/Wipe controls, and the hash-based router (#/today, #/intelligence, #/people, #/log, #/about) are working code in this sandbox." />
          <Finding tag="real" text="Shannon entropy (shannonEntropy) is a correct, standard implementation of H = −Σ p(x)·log2(p(x)) over the event-type distribution — the math itself is real information theory." />
          <Finding tag="heuristic" text="The 'RIGID / ADAPTIVE / CHAOTIC' interpretation bands (normalized entropy <40% / 40–80% / >80%) are this delivery's own illustrative convention. No study is cited because none was used — this is disclosed, not hidden." />
          <Finding tag="heuristic" text="Mutual information here is a coarse, weekly-binned event-type co-occurrence measure between two people's logged activity — not the rigorous channel-capacity mutual information of information theory proper. The in-app label says this every time it's shown." />
          <Finding tag="heuristic" text="Information bottleneck detection (people under 30% of mean 'information in') cannot distinguish real isolation from 'this tool just doesn't see their work' — both are stated in the UI." />
          <Finding tag="heuristic" text="Signal-to-noise ratio reuses the engineering SNR/decibel formula as a labeled metaphor for findings-coverage of the log, not a physical signal." />
          <Finding tag="real" text="LEADOS.engine (6 rules: SIGNAL, DECISION_STALE, GOAL_OWNERLESS, CONFLICT_UNRESOLVED, ONEONONE_GAP, NETWORK_ISOLATION) is original, working code for this delivery, built only because the pt-L brief's own signalToNoise() function requires a findings engine as input. Thresholds (14/21/45 days) are arbitrary and disclosed as such." />
          <Finding tag="gap" text="The roster and all event data are synthetic/seeded (mulberry32, fixed seed), generated for this demo. No real organization's data is used or implied." />
        </div>
      </Card>

      <Card title="Why this isn't a port of the real repo">
        <p className="text-sm text-slate-300">
          This sandbox environment is fixed to React + Vite + TypeScript with <Mono>src/App.tsx</Mono> as the entry point,
          and the task explicitly asks for original, disclosed work rather than assuming code exists because a prompt
          describes it. Given the real repo's own internal contradictions (two incompatible project shapes, an
          orphaned/broken intelligence.ts) and the confirmed absence of any infoTheory-style module, building this part
          as a fresh, labeled implementation — rather than fabricating a "port" of something that was never found — was
          the only honest option.
        </p>
      </Card>
    </div>
  );
}

function Finding({ tag, text }: { tag: "real" | "heuristic" | "gap"; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <DisclosureTag kind={tag} />
      <Label>{text}</Label>
    </div>
  );
}
