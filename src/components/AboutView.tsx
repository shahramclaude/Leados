import { Card, SectionTitle, Badge, DisclosureNote } from "./ui";

export function AboutView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">About / Provenance</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          What was actually checked against <code>github.com/wbweve/Leados</code> this session, what this app is, and
          what is and isn't implemented from the pasted "pt-O" wargaming spec. Full detail also lives in{" "}
          <code>AI-SESSION-LOG.md</code> in the project root.
        </p>
      </div>

      <Card>
        <SectionTitle>1. What this app is</SectionTitle>
        <p className="text-sm leading-relaxed text-zinc-300">
          This is a fresh React + Vite + Tailwind build, in this task's own sandbox (a scaffold with an empty{" "}
          <code>src/App.tsx</code> and no prior Leados history), implementing the <em>functional ideas</em> in the
          task's pasted "pt-O: Organizational Wargaming Engine" brief — a competitive wargaming simulator (blue/red/
          green/white/yellow teams), plus logging and registers for the new event types the brief specifies
          (stakeholders, ecosystem, M&A, regulatory, org design, tech disruption, intel signals). It does not fork,
          copy, or continue <code>github.com/wbweve/Leados</code>'s code, nor any prior "pt-" session's code.
        </p>
      </Card>

      <Card>
        <SectionTitle>2. What was verified about github.com/wbweve/Leados this session</SectionTitle>
        <p className="mb-3 text-sm text-zinc-400">
          Checked via GitHub's REST API (recursive tree), raw-file fetches, and the rendered README — no cloning, no
          code execution, no authenticated GitHub code search (that endpoint returned <code>401 Requires
          authentication</code> when tried).
        </p>
        <ul className="space-y-2 text-sm text-zinc-300">
          <Fact>
            The repo currently holds <strong>two structurally different deliveries at once</strong>: ~90 loose
            root-level files (older <code>.tsx</code>/<code>.js</code> artifacts, including large bundled-looking
            files like <code>engine.js</code> ~105KB, <code>health.js</code> ~175KB, <code>ui.js</code> ~97KB, and a
            root <code>AI-SESSION-LOG.append.md</code>), alongside a separate, structured <code>src/</code> Vite+React+
            TypeScript app. Confirmed directly from the recursive tree listing (148 entries, not truncated).
          </Fact>
          <Fact>
            The live <code>src/App.tsx</code> (fetched raw, read directly) imports and routes{" "}
            <code>TodayView</code>, <code>SignalBoardView</code>, <code>ThermodynamicsView</code>, <code>CasView</code>,{" "}
            <code>RiskView</code>, and <code>AboutView</code> — matching the current README's "Pages" table. This is
            the repo's most recent delivery as of this session's read.
          </Fact>
          <Fact>
            That same README documents its own predecessor finding (from the repo's own{" "}
            <code>AI-SESSION-LOG.md</code>, fetched and read directly this session): an earlier session verified a
            live <code>src/lib/infoTheory.ts</code> → <code>Thermodynamics.tsx</code> chain, found{" "}
            <code>src/lib/core.ts</code>/<code>intelligence.ts</code>/<code>physics.ts</code> present but orphaned
            (and one broken import — <code>intelligence.ts</code> imports <code>{"{ engine, run }"}</code> from{" "}
            <code>./core</code>, which does not export them), and found{" "}
            <strong>no CAS engine, no risk register file, and no "wargame" module anywhere</strong> in the files it
            read.
          </Fact>
          <Fact>
            Root <code>index.html</code> and <code>package.json</code> were fetched directly this session: the repo
            now builds as a standard Vite scaffold (React 19, Tailwind 4, <code>vite-plugin-singlefile</code>) with
            the title "LEADOS Sandbox — CAS Engine, Risk Intelligence & Thermodynamics" — consistent with, not
            contradicting, the README's own account.
          </Fact>
          <Fact tone="amber">
            <strong>Not found, by filename, anywhere in the 148-entry tree:</strong> any file named{" "}
            <code>wargame*</code>, <code>competitiveLandscape*</code>, <code>stakeholder*</code>,{" "}
            <code>ecosystem*</code>, <code>ma-target*</code>, or similar. This is a filename-level check, not a
            byte-for-byte read of all 148 files — disclosed as a scope limit, not asserted as exhaustive proof of
            absence.
          </Fact>
        </ul>
      </Card>

      <Card>
        <SectionTitle>3. The pasted "pt-O" brief itself</SectionTitle>
        <p className="text-sm leading-relaxed text-zinc-300">
          Per the same inspect-before-claiming standard, the pasted brief is treated as{" "}
          <strong>an unverified specification supplied by the task prompt</strong>, not as a description of
          <code> github.com/wbweve/Leados</code>. Unlike the earlier "pt-L"-style briefs referenced in that repo's own
          session logs (which asserted behavior without code), this brief supplied runnable JavaScript for the
          wargaming engine itself. <code>src/lib/wargame.ts</code> in this app is a mechanical TypeScript
          transcription of that pasted code against this app's own event/store model — not a reimplementation from
          some other verified source, and not a claim that the pasted code previously existed anywhere real.
        </p>
      </Card>

      <Card>
        <SectionTitle>4. Disclosed gaps</SectionTitle>
        <ul className="list-inside list-disc space-y-1 text-sm text-zinc-300">
          <li>
            The brief ends with a bare section heading, <code>Rules R145–R160 (Wargaming Domain)</code>, and supplies
            no rule text underneath it. No rules were invented to fill that gap — the same convention used by the
            real repo's own prior sessions for their own undefined dependencies.
          </li>
          <li>
            The findings engine (<code>src/lib/engine.ts</code>) is original, disclosed-fabricated heuristics (~12
            rules) written for this build. It is not a port of the real repo's own, separate 6-rule{" "}
            <code>engine.ts</code>, and not the "144-rule catalog" referenced in other unverified pasted briefs.
          </li>
          <li>Real options valuation, M&A target-scoring math, and regulatory-interpretation legal analysis described narratively in the brief are represented here only as structured logging/registers, not as computed models — the brief did not supply algorithms for these, only event shapes.</li>
        </ul>
      </Card>

      <Card>
        <SectionTitle>5. Data policy</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Badge tone="emerald">Zero external data</Badge>
          <Badge tone="sky">localStorage only</Badge>
          <Badge tone="violet">Demo data is synthetic &amp; labeled</Badge>
        </div>
        <p className="mt-3 text-sm text-zinc-300">
          All figures in this app are computed from the local event log (<code>localStorage</code> key{" "}
          <code>leados-pt-o:v1</code>) seeded with an original, deterministic synthetic dataset on first load. Use
          "Reset demo data" or "Wipe all" on the Event log page at any time.
        </p>
      </Card>

      <DisclosureNote>
        This page itself is original writing for this build, produced from the live tool calls made this session
        (GitHub REST API tree listing, raw-file fetches of README.md, AI-SESSION-LOG.md, src/App.tsx, index.html, and
        package.json). No other files in the real repo were fetched this session; conclusions about files not fetched
        are explicitly scoped above.
      </DisclosureNote>
    </div>
  );
}

function Fact({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "amber" }) {
  return (
    <li className={`rounded-lg border p-3 ${tone === "amber" ? "border-amber-900/50 bg-amber-950/10" : "border-zinc-800 bg-zinc-950/40"}`}>
      {children}
    </li>
  );
}
