export function AboutView() {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">About this build</h1>
        <p className="text-slate-500">
          Verified / unverified / fabricated ledger for this specific delivery. See{" "}
          <code className="text-indigo-300">AI-SESSION-LOG.md</code> for the full research trail.
        </p>
      </div>

      <section className="rounded-lg border border-emerald-900 bg-emerald-950/20 p-4">
        <h2 className="font-semibold text-emerald-300 mb-2">Verified this session (by direct inspection)</h2>
        <ul className="list-disc list-inside space-y-1 text-slate-300">
          <li>
            <code>github.com/wbweve/Leados</code> is a real, public repo (confirmed via the GitHub REST
            API: id 1413944295, default branch <code>main</code>, 106 files in the tree at HEAD).
          </li>
          <li>
            Its root <code>index.html</code> (86,898 bytes) is a hand-authored, single-file vanilla
            HTML/CSS/JS document loading Tailwind from a CDN <code>&lt;script&gt;</code>, confirmed by
            downloading the raw file directly with <code>curl</code> and grepping it &mdash; not by trusting
            the repo's own README description of itself.
          </li>
          <li>
            Constants <code>DOMAINS</code>, <code>DECAY=0.85</code>, <code>CORRELATION_WINDOW_DAYS=90</code>,{" "}
            <code>DECISION_MAX_OPEN_DAYS=21</code>, and the storage keys{" "}
            <code>leados-pt-j:data</code> / <code>leados-pt-j:familiarity</code> /{" "}
            <code>leados-pt-j:familiarity-notified</code> were found verbatim in that downloaded file.
          </li>
          <li>
            The repo also contains a <em>separate, parallel</em> Vite + React + TypeScript project at
            its root (<code>src/</code>, <code>package.json</code>, <code>vite.config.ts</code>, and ~70
            additional root-level <code>.tsx</code>/<code>.ts</code>/<code>.js</code> files such as{" "}
            <code>FinanceDashboard.tsx</code>, <code>engine.js</code>, <code>health.js</code>,{" "}
            <code>ui.js</code>). This is directly visible in the repo's git tree and is even disclosed in
            the root <code>index.html</code>'s own header comment.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-amber-900 bg-amber-950/20 p-4">
        <h2 className="font-semibold text-amber-300 mb-2">Contradicted / unverifiable claims found in the repo's own files</h2>
        <ul className="list-disc list-inside space-y-1 text-slate-300">
          <li>
            The repo's <code>README.md</code> states "Files on disk: Exactly three files: index.html,
            README.md, AI-SESSION-LOG.md." The actual repository tree has 106 entries, including an
            entire second application. The "three files" claim is only true if read narrowly as "files
            belonging to this one delivery," which the README does not say &mdash; this is flagged as
            misleading, not corrected silently.
          </li>
          <li>
            The README and the <code>index.html</code> header comment both narrate an elaborate story
            about fetching three independent raw mirrors, a "~5,700-token truncation," a second
            fetch-tool corruption that "stripped every &lt; / &gt; character," and functions marked{" "}
            <code>RECONSTRUCTED</code> as a result. This session fetched the same file once, directly,
            via <code>curl</code>, and received the complete 86,898-byte file with no truncation and no
            corruption. The mirror/corruption narrative is therefore <strong>unverified</strong> by this
            session &mdash; it may describe something that happened in a different tool/session, or it may
            be in-universe narrative framing. Either way, it is not independently confirmed here.
          </li>
          <li>
            Commit metadata shows GitHub-signed ("verified": true) commits from user <code>wbweve</code>,
            all titled "Add files via upload," roughly every 10&ndash;30 minutes across Oct 16&ndash;17,
            2026. This confirms <em>how</em> the repo was built (repeated manual uploads, consistent with
            an iterative AI-assisted workflow) but is not evidence about the correctness of any claim
            made inside the uploaded files.
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="font-semibold text-slate-200 mb-2">What this rebuild actually is</h2>
        <p className="text-slate-400">
          This app is an original React + TypeScript + Tailwind implementation built for this sandbox.
          It reuses the small set of constants verified above, and re-implements &mdash; from the
          user-supplied feature summary, not from reading the upstream project's internal algorithms
          line-by-line &mdash; the ideas of an append-only event log with pure projection, a golden-ratio
          spacing scale, a density/Miller's-Law heuristic, time-of-day chromatic adaptation, a
          four-tier familiarity system backed by <code>sessionStorage</code>, a small bounded layout
          solver, and a live, computed health-check wall. The upstream repo's 8-module/49-file/
          vanilla-JS/no-build-step architecture described in the pasted implementation summary was{" "}
          <strong>not</strong> reproduced file-for-file here: this sandbox is contractually a
          React/Vite/Tailwind project (see <code>AI-SESSION-LOG.md</code> for why), and <code>vite-plugin-singlefile</code>{" "}
          is used so that <code>npm run build</code> still produces one self-contained{" "}
          <code>dist/index.html</code>, in the spirit of "open index.html, that is the install."
        </p>
      </section>

      <section className="rounded-lg border border-rose-900 bg-rose-950/20 p-4">
        <h2 className="font-semibold text-rose-300 mb-2">Fabricated, disclosed at point of use</h2>
        <ul className="list-disc list-inside space-y-1 text-slate-300">
          <li>The "257 bits per finding" constant and the resulting bits-per-pixel figure.</li>
          <li>Per-card "confidence" percentages shown on NOVEL-tier finding cards.</li>
          <li>The decision quadrant classification rule (impact &times; reversibility thresholds).</li>
          <li>All seed/demo finding and decision content.</li>
        </ul>
      </section>
    </div>
  );
}
