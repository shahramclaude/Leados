import type { ReactNode } from "react";
import { Card, Badge } from "./Card";

export function AboutView() {
  return (
    <div className="space-y-6">
      <Card title="Provenance — github.com/wbweve/Leados">
        <p className="mb-3 text-sm text-slate-600">
          This session fetched the live repository (rendered README, repo metadata API, and a recursive Git Trees
          API call) before writing any code. Full ledger also lives in <code>AI-SESSION-LOG.md</code>. Nothing below
          is assumed from training data about this specific repo — only from what was fetched this session.
        </p>

        <div className="space-y-3 text-sm">
          <Row kind="verified">
            <code>wbweve/Leados</code> is a real, public repo (id 1413944295, created 2026‑10‑11, last pushed
            2026‑10‑17T13:10:48Z), confirmed via the GitHub REST repo-metadata API.
          </Row>
          <Row kind="verified">
            A recursive Git Trees API call against <code>main</code> returned <strong>117 entries</strong> at query
            time, including a root <code>index.html</code> (66,718 bytes, sha <code>22850d1b…</code>) that decodes
            (Contents API, base64) to a real, self-contained vanilla‑JS/Tailwind‑CDN app titled "LeadOS —
            Accessibility Intelligence &amp; Worker Architecture · Parts 7–8", with an embedded "PROVENANCE" comment
            block.
          </Row>
          <Row kind="verified">
            The same tree <em>also</em> contains a full, separate Vite+React+TypeScript project at the repo root
            (<code>package.json</code>, <code>vite.config.ts</code>, <code>tsconfig.json</code>,
            <code> src/main.tsx</code>, <code>src/App.tsx</code>, <code>src/components/*</code>,{" "}
            <code>src/lib/*</code>) <em>plus</em> ~45 loose, duplicate-looking <code>.ts</code>/<code>.tsx</code>/
            <code>.js</code> files directly at the repo root (e.g. both a root <code>App.tsx</code> and a separate{" "}
            <code>src/App.tsx</code>; both <code>health.ts</code> <em>and</em> a 175KB <code>health.js</code>{" "}
            <em>and</em> <code>src/lib/health.ts</code>).
          </Row>
          <Row kind="contradicted">
            That structure does not match a single coherent "one index.html, vanilla JS" project — it looks like at
            least two incompatible lineages (an earlier React/Vite build, referenced in-repo as a renamed
            "LeadCore application", and a later standalone-HTML build) committed on top of each other without
            cleanup. This was <strong>not fully reconciled</strong> — not every commit was diffed — so treat this as
            an observed inconsistency, not a resolved history.
          </Row>
          <Row kind="contradicted">
            No file named anything like <code>js/circadian.js</code>, <code>js/fatigue.js</code>,{" "}
            <code>js/sensory.js</code>, <code>js/memory_arch.js</code>, <code>js/genome.js</code>,{" "}
            <code>js/monte_carlo.js</code>, <code>js/a11y_intel.js</code>, <code>js/worker-engine.js</code>, or{" "}
            <code>js/workers.js</code> — nor any <code>js/</code> directory at all — exists anywhere in the 117
            fetched tree entries. The "pt‑K" module list supplied in this task's prompt describes a file layout this
            session could not find in the real repository at query time. It is treated here as an{" "}
            <strong>unverified specification</strong>, not a description of existing code.
          </Row>
          <Row kind="disclosure">
            GitHub's repo-metadata <code>size</code> field (7,442 KB) is a cached, approximate figure for the whole
            repo and was not reconciled byte-for-byte against the sum of individual blob sizes — stated here as a
            platform-reported number, not an independently re-derived one.
          </Row>
        </div>
      </Card>

      <Card title="What this build actually is">
        <div className="space-y-3 text-sm">
          <Row kind="disclosure">
            This task's execution environment requires a React + Vite + Tailwind app with{" "}
            <code>src/App.tsx</code> as the entry point, built with <code>npm run build</code>. That directly
            conflicts with the pasted brief's "vanilla JS, no framework, no build step, open index.html" framing —
            this build cannot and does not claim to satisfy that framing literally. One real point of convergence:
            this project's Vite config includes <code>vite-plugin-singlefile</code>, so <code>npm run build</code>{" "}
            still produces one self-contained <code>dist/index.html</code> with JS/CSS inlined — closer in spirit,
            though a build step is still required.
          </Row>
          <Row kind="original">
            Every module under <code>src/lib/</code> (circadian, fatigue, sensory, memory, genome, monteCarlo,
            workers, a11y) and every view under <code>src/components/</code> is an original implementation written
            this session, reconstructed only from the short description in the pasted brief (trait names, threshold
            numbers, event-type names) — not copied from <code>wbweve/Leados</code>, since no matching source for
            any of those modules was found there.
          </Row>
          <Row kind="disclosure">
            Biological/psychological framing (circadian phases, decision fatigue) is explicitly labeled as{" "}
            <strong>heuristic guidance</strong> based on commonly-cited, non-personalized generalizations — not a
            specific cited study, not a diagnosis, and not a validated psychometric instrument. The "organizational
            genome" is a two-counter behavioral ratio over self-logged data in this browser only.
          </Row>
          <Row kind="original">
            The Monte Carlo engine uses a seeded <code>mulberry32</code> PRNG specifically so identical seeds
            reproduce identical results, run inside a real Web Worker built from a Blob URL (not a separate file,
            to stay compatible with the single-file build), with a timeout-based fallback to the main thread if the
            worker fails or doesn't respond — exercised live via the "simulate worker failure" button on the
            Decisions tab.
          </Row>
        </div>
      </Card>
    </div>
  );
}

function Row({ kind, children }: { kind: "verified" | "contradicted" | "original" | "disclosure"; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-0.5">
        <Badge kind={kind}>{kind}</Badge>
      </div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}
