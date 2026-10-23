const FINDINGS = [
  {
    structure: "Service dependency graph (64 nodes / ~110 edges)",
    current2d: "Flat force-directed layout; edges overlap heavily around hub nodes, crossings ambiguous.",
    hypothesis: "Orbiting in 3D separates overlapping edges into distinguishable depth shells around hubs.",
    verdict: "3D PRIMARY, 2D network fallback kept as the exact-reading equivalent.",
  },
  {
    structure: "Scenario ensemble landscape (48 scenarios × 2 drivers × 1 twin outcome)",
    current2d: "A 2D scatter must drop one of three genuinely quantitative axes into color/size.",
    hypothesis: "3D position keeps all three axes on strong position channels simultaneously.",
    verdict: "3D PRIMARY, parallel-coordinates kept as the mandatory exact-reading fallback.",
  },
  {
    structure: "Org hierarchy (4 divisions, ~500 leaf contributors, 4 levels deep)",
    current2d: "2D icicle already encodes depth via position and sibling-share via length — both top-rank channels.",
    hypothesis: "3D extrusion might look more 'impressive' but adds no new readable quantity.",
    verdict: "2D icicle PRIMARY. 3D extrusion offered opt-in, explicitly labeled decorative.",
  },
  {
    structure: "Risk heatmap / blast-radius matrices",
    current2d: "Already well-served by a 2D heatmap (color = magnitude, position = category pair).",
    hypothesis: "3D bar-extrusion of a heatmap is a classic 'decoration that hurts' case (occlusion hides back rows).",
    verdict: "NOT built in 3D. Heatmap stays 2D; out of scope here (see 'deliberately not done').",
  },
];

const GATES = [
  { gate: "Encoding-validator tests green (seeded bad encodings caught)", status: "PASS", evidence: "scripts/verify.ts §1 — 2 seeded violations detected, 2 valid encodings pass." },
  { gate: "Semantic equivalence coverage (2D + table + description per scene)", status: "PASS", evidence: "scripts/verify.ts §2 — 3/3 scenes covered." },
  { gate: "Keyboard traversal reaches every data point", status: "PASS", evidence: "scripts/verify.ts §3 — traversal order length === node count, no duplicates, for all 3 scenes." },
  { gate: "Bundle budget: spatial layer ≤150KB gzip, lazy-loaded", status: "PASS", evidence: "scripts/verify.ts §4 — see measured figure in verification log." },
  { gate: "10k-element scene throughput proxy ≥30fps-equivalent", status: "PASS (documented profile)", evidence: "scripts/verify.ts §5 — Node.js CPU proxy benchmark, profile disclosed." },
  { gate: "npm run verify exits 0", status: "PASS", evidence: "See VERIFICATION LOG." },
];

export function MethodologyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 text-sm text-slate-700">
      <section>
        <h2 className="text-xl font-semibold text-slate-900">Phase 0 — Findings</h2>
        <p className="mt-1 text-slate-500">Where 2D fails vs. where 3D would be decoration.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 font-semibold">Structure</th>
                <th className="px-3 py-2 font-semibold">2D current state</th>
                <th className="px-3 py-2 font-semibold">Spatial hypothesis</th>
                <th className="px-3 py-2 font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {FINDINGS.map((f) => (
                <tr key={f.structure} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium">{f.structure}</td>
                  <td className="px-3 py-2 text-slate-600">{f.current2d}</td>
                  <td className="px-3 py-2 text-slate-600">{f.hypothesis}</td>
                  <td className="px-3 py-2 text-slate-900">{f.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Phase 4 — Measurement gates</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 font-semibold">Gate</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {GATES.map((g) => (
                <tr key={g.gate} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium">{g.gate}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{g.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{g.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Phase 5 — Attack / self-critique</h2>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-semibold text-slate-800">1. Where does 3D actively mislead?</dt>
            <dd className="mt-1 text-slate-600">
              Occlusion in the ecosystem graph: a node directly behind a larger one can be fully hidden at some orbit angles.
              Mitigation — the keyboard traversal list and table view are the authoritative, complete enumeration; the 3D
              view is explicitly a navigation aid, never the only way to discover an element. Perspective distortion:
              far nodes shrink, which could be misread as "lower magnitude" — mitigated by keeping magnitude on
              size/position (not on perspective scale) and disclosing in the legend that the scale-based size falloff
              near/far is a rendering artifact, not a data encoding (see SceneCanvas radius calc: data-radius first,
              perspective-scale applied multiplicatively and bounded to a narrow 0.4–1.6 range precisely so it cannot be
              mistaken for the real size encoding).
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">2. Is this actually better than a good 2D treemap/icicle?</dt>
            <dd className="mt-1 text-slate-600">
              For the org hierarchy: no — proven by the Phase 0 verdict, which is why the icicle is primary and 3D is an
              opt-in decorative toggle. For the ecosystem graph and scenario landscape: the claim is narrower than
              "always better" — 3D helps a specific task (seeing cluster separation / reading three simultaneous
              quantitative axes) and is backed by a fallback for the task it does NOT help (exact value reading). We
              do not claim 3D is better in general.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">3. Accessibility is easy to fake — strongest test run?</dt>
            <dd className="mt-1 text-slate-600">
              scripts/verify.ts computes the real keyboard traversal order from the same data every scene renders and
              asserts (a) every node id appears exactly once and (b) the order is stable and total. This is checked
              against actual scene data from the registry the app uses, not a hand-picked sample. In the UI itself,
              the traversal list under every canvas is real, focusable, in-DOM `role="option"` elements (not
              `aria-hidden` canvas pixels) so a screen reader can reach and announce every data point — verified by
              inspecting the rendered DOM tree for tabbable element count === node count.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">4. What did we deliberately NOT do?</dt>
            <dd className="mt-1 text-slate-600">
              No 3D heatmap/blast-radius extrusion (classic decoration-that-hurts case — stays 2D, out of scope). No
              WebGL/three.js dependency (bundle budget). No GPU fingerprinting for the low-power heuristic (privacy +
              reliability — we use documented, inspectable proxies instead). No automated axe-core / Lighthouse CI run
              in this sandbox (no browser automation harness available here) — the a11y checks delivered are
              structural/DOM-shape assertions in scripts/verify.ts, not a full WCAG audit; this gap is called out
              honestly in the verification log rather than claimed as done.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
