import { Card, SectionHeading, Pill } from './ui';

export function AboutView() {
  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Provenance ledger"
        title="What was checked, what was found, what is unverified"
        desc="Per the task instruction to inspect actual code before claiming anything about it. Full detail lives in AI-SESSION-LOG.md."
      />

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">1. github.com/wbweve/Leados — verified facts, this session</h3>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-600">
          <li>The repo contains two structurally different deliveries: loose root-level files (incl. a hand-authored single-file <code>index.html</code>) and a separate live <code>src/</code> Vite+React+TypeScript app. Confirmed via GitHub's recursive tree API and the repo's own prior <code>AI-SESSION-LOG.md</code> (fetched and read this session).</li>
          <li><code>src/lib/genome.ts</code> and <code>src/lib/memory.ts</code> exist and were fetched/read in full this session. Both are small, explicitly disclosed, original reinterpretations of an earlier pasted brief's ideas (ratio heuristic; two-layer session/localStorage split) — <strong>not</strong> matches for the pt-N brief's imagined <code>LEADOS.genome.identify(P, today)</code> or <code>LEADOS.memory.longTerm._computeDomainActivity(P)</code> call shapes.</li>
          <li>No file or export named <code>docs.ts</code>, <code>institutionalMemory.ts</code>, <code>selfImprove.ts</code>, <code>onboarding.ts</code>, <code>calibrateRules.ts</code>, or <code>knowledge.ts</code> appears anywhere in the <code>src/lib</code> directory listing (23 files enumerated via the GitHub contents API this session).</li>
          <li>The repo's own prior session log additionally documents: a live, wired Shannon-entropy/mutual-information module (<code>infoTheory.ts</code> → <code>Thermodynamics.tsx</code>); a broken import chain in <code>intelligence.ts</code> (imports <code>engine</code>/<code>run</code> from <code>core.ts</code>, which does not export them); and no CAS engine or risk register anywhere in the tree. These are carried forward here as <strong>repo history, re-confirmed by that log's own first-hand call list</strong>, not re-verified byte-for-byte by this session.</li>
        </ul>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">2. The pasted "pt-N" brief — treated as unverified specification</h3>
        <p className="text-sm text-slate-600">
          The brief describes <code>LEADOS.docs</code>, <code>LEADOS.institutionalMemory</code>, <code>LEADOS.selfImprove</code>, and <code>LEADOS.onboarding</code> as if they
          already exist inside a large pre-existing <code>LEADOS</code> object with an <code>engine.run(P, today)</code>, a rules catalog, playbooks, decisions, and
          a genome/memory/knowledge layer with specific call shapes. None of those exact shapes were found in <code>wbweve/Leados</code> during this session's inspection.
          This delivery therefore treats the brief the same way this lineage's prior sessions treated their own pasted briefs: as a <strong>description of behavior to build
          toward</strong>, implemented here as fresh, original TypeScript against this sandbox's own small data model — not as a port of verified code.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">3. This sandbox's own starting point</h3>
        <p className="text-sm text-slate-600">
          This tool environment began from the default Vite + React + Tailwind scaffold (<code>src/App.tsx</code> rendering a placeholder "Ready to build" card) —
          confirmed by reading the file directly before writing anything. It has no relationship, shared storage key, or shared code with
          <code>wbweve/Leados</code> or any other session's sandbox. Storage key used here: <code>leados-ptn:v1</code>.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">4. Disclosed gaps in this delivery</h3>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-600">
          <li><Pill tone="amber">Gap</Pill> Playbook effectiveness (Self-Improve tab) uses a crude proxy — completions vs. currently-active findings citing that playbook — not a true longitudinal before/after resolution-rate measurement, since this build does not retain historical finding snapshots.</li>
          <li><Pill tone="amber">Gap</Pill> R2 (overdue skip-level) has no playbook wired, mirroring the "no playbook" pattern the pt-N brief itself describes for its own R9 — resolve it by logging a skip-level directly.</li>
          <li><Pill tone="amber">Gap</Pill> The demo seed data uses <code>Math.random()</code>, not a seeded PRNG, so sample data differs between loads — a disclosed simplification versus the deterministic pattern the real repo uses elsewhere.</li>
        </ul>
      </Card>
    </div>
  );
}
