function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <h2 className="mb-3 text-base font-bold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

const Mono = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[0.85em] text-violet-300">{children}</code>
);

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">About / Provenance</h1>
        <p className="mt-1 text-sm text-slate-400">
          What was checked against <Mono>github.com/wbweve/Leados</Mono> this session, what was found, and how
          this delivery relates to the pasted "pt-P / Part 1" brief.
        </p>
      </div>

      <Section title="1. What was actually inspected this session">
        <p>
          <Mono>github.com/wbweve/Leados</Mono> was fetched directly (GitHub's REST contents API, plus raw file
          fetches) before any code here was written. Verified, first-hand, this session:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The repo holds <strong>two structurally different deliveries</strong>: ~90 loose root-level files
            (including a root <Mono>index.html</Mono>, <Mono>App.tsx</Mono>, dozens of dashboard/view files, and
            several <Mono>AI-SESSION-LOG*.md</Mono> files) alongside a separate, live Vite + React + TypeScript
            tree under <Mono>src/</Mono>.
          </li>
          <li>
            The root <Mono>index.html</Mono> is, as of this session's fetch, the standard 12-line Vite template
            pointing at <Mono>/src/main.tsx</Mono> — <em>not</em> a hand-authored single-file demo. (A prior
            session's own log, read directly from the repo, describes an earlier 54KB hand-authored version of
            that same file; it has since been replaced.)
          </li>
          <li>
            The live <Mono>src/App.tsx</Mono> imports exactly: <Mono>Shell</Mono>, <Mono>TodayView</Mono>,{" "}
            <Mono>SignalBoardView</Mono>, <Mono>ThermodynamicsView</Mono>, <Mono>CasView</Mono>,{" "}
            <Mono>RiskView</Mono>, <Mono>AboutView</Mono>, <Mono>useHashRoute</Mono>, and{" "}
            <Mono>loadState</Mono> from <Mono>./lib/store</Mono>. Confirmed by reading the file's raw contents
            directly.
          </li>
          <li>
            <Mono>src/lib/</Mono> contains 28 files and <Mono>src/components/</Mono> contains 24 files — more than
            the six views wired into <Mono>App.tsx</Mono>. Components such as <Mono>AccessibilityView.tsx</Mono>,{" "}
            <Mono>AestheticsView.tsx</Mono>, <Mono>CommandPalette.tsx</Mono>, <Mono>DecisionsView.tsx</Mono>,{" "}
            <Mono>EnergyView.tsx</Mono>, <Mono>EventLogView.tsx</Mono>, <Mono>IntelligenceView.tsx</Mono>,{" "}
            <Mono>MemoryGenomeView.tsx</Mono>, <Mono>PeopleView.tsx</Mono>, and <Mono>SynthesisView.tsx</Mono> exist
            and do import real <Mono>src/lib</Mono> modules (e.g. <Mono>aesthetics.ts</Mono>,{" "}
            <Mono>circadian.ts</Mono>, <Mono>fatigue.ts</Mono>, <Mono>genome.ts</Mono>, <Mono>health.ts</Mono>,{" "}
            <Mono>memory.ts</Mono>, <Mono>synthesis.ts</Mono>, <Mono>workers.ts</Mono>) — but none of them is
            reachable from the live <Mono>App.tsx</Mono> route table. They are real, but orphaned relative to the
            app that actually renders.
          </li>
          <li>
            <Mono>src/lib/intelligence.ts</Mono> still imports <Mono>{"{ engine, run }"}</Mono> from{" "}
            <Mono>./core</Mono>, and <Mono>core.ts</Mono> exports neither symbol — the repo's own{" "}
            <Mono>AboutView.tsx</Mono> discloses this exact break in its own UI text, which this session's direct
            read of both files confirms still holds.
          </li>
          <li>
            A targeted search of every file fetched this session — all 28 <Mono>src/lib</Mono> files, all 24{" "}
            <Mono>src/components</Mono> files, and all ~90 root-level files, roughly 20,000 lines total — for the
            strings <Mono>lifeStage</Mono>, <Mono>computeMaturityProfile</Mono>, <Mono>DIMENSIONS</Mono>, and{" "}
            <Mono>PEOPLE_SYSTEMS</Mono> returned <strong>zero matches</strong>.
          </li>
        </ul>
      </Section>

      <Section title="2. What this means for the pasted 'pt-P / Part 1' brief">
        <p>
          This task's prompt pasted a long JavaScript spec for <Mono>LEADOS.lifeStage</Mono> — a 12-dimension
          organizational maturity model with per-dimension Level 1–5 scoring functions and a{" "}
          <Mono>computeMaturityProfile()</Mono> aggregator. Per the above, that spec is{" "}
          <strong>not present anywhere in the real repository</strong>, in either of its two deliveries, as of this
          session's inspection.
        </p>
        <p>
          It is treated here as what it is: <strong>an unverified specification supplied by the task prompt</strong>
          , describing a plausible-sounding feature, not a claim about repo history. This follows the same
          convention the real repo's own prior sessions used for their own pasted briefs (documented in its{" "}
          <Mono>AI-SESSION-LOG.md</Mono>, also read directly this session).
        </p>
      </Section>

      <Section title="3. What is original in this delivery">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Mono>src/lib/maturity.ts</Mono> — the twelve dimension definitions and their Level 1–5 scoring logic.
            Functionally modeled on the pasted brief's described behavior (same dimension names, same five-level
            idea, same "scored from an event log" architecture) but written from scratch against this app's own{" "}
            <Mono>OrgEvent</Mono> type — none of it is copied from the pasted JavaScript or from any file fetched
            from the real repo.
          </li>
          <li>
            <Mono>src/lib/eventCatalog.ts</Mono>, <Mono>src/lib/presets.ts</Mono>, <Mono>src/lib/store.ts</Mono> —
            original synthetic event catalog, five demonstration presets (one per pattern bucket), and
            localStorage persistence under a new key, <Mono>leados-ptp-maturity:v1</Mono>.
          </li>
          <li>All UI (<Mono>Shell</Mono>, <Mono>RadarChart</Mono>, <Mono>MaturityView</Mono>, <Mono>EventsView</Mono>, this page) — original, hand-built SVG radar chart, no charting library.</li>
        </ul>
      </Section>

      <Section title="4. Disclosed limits">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Scores are a direct function of which synthetic event types exist in the in-browser log. They are not
            calibrated against real organizations, industries, or life stages — the "meta-learning across many
            organizations" framing in the pasted brief's preamble is a narrative framing for a single-tenant demo,
            not a claim that cross-organization learning happens anywhere in this code.
          </li>
          <li>
            This environment's entry point is <Mono>src/App.tsx</Mono> and its build (<Mono>vite-plugin-singlefile</Mono>)
            inlines everything into one <Mono>dist/index.html</Mono> with no runtime network calls — the same
            "open one file" property the real repo's root demo once had, produced here by a build step rather than
            hand authored.
          </li>
          <li>Only "Part 1" of the pasted brief (life-stage / maturity dimensions) was supplied this turn and is implemented here; no other part is in scope.</li>
        </ul>
      </Section>
    </div>
  );
}
