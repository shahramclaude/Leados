# Part 49 — Spatial Analytics Engine

**Repository:** https://github.com/shahramclaude/Leados
**Role:** Spatial-analytics engineer
**Depends on:** Part 02 (dataviz grammar), Part 06 (digital twin outputs), Part 31 (ecosystem graph)

## Provenance note (read first — honesty rule)

The working tree checked out for this task was a **greenfield Vite + React + TypeScript + Tailwind
scaffold** — it did not contain `src/components/charts/*`, `Network.tsx`, `Heatmap.tsx`, or any Part
02/06/31 artifacts. Per the standing order's "read before write," those paths were searched for and
confirmed absent (see VERIFICATION LOG / file list). Rather than inventing a fictional diff against files
that don't exist in this repo state, this part:

1. Declares the **exact data/encoding contracts** Parts 02/06/31 are documented to expose
   (`SpatialEncoding`, `SceneNode`/`SceneEdge`, twin outcome fields, Cleveland–McGill ranking).
2. Implements **shape-compatible, clearly-labeled stub data sources** (`src/data/ecosystemGraph.ts`,
   `src/data/scenarioEnsemble.ts`) that generate deterministic synthetic instances of that shape, so the
   spatial layer has real, non-trivial, testable structure today.
3. Documents, in each stub file's header comment, exactly what to swap in once the real Part 02/06/31
   modules land — no component downstream of the stubs needs to change, because everything consumes only
   `SceneNode[]` / `SceneEdge[]`.

This is the only honest way to deliver "Part 49" against a repository state that does not yet contain its
declared dependencies.

## Phase 0 — Discover

| Structure | 2D current state | Spatial hypothesis | Verdict |
|---|---|---|---|
| Service dependency graph (64 nodes / ~110 edges) | Flat force-directed layout; edges overlap heavily around hub nodes, crossings ambiguous | Orbiting in 3D separates overlapping edges into distinguishable depth shells around hubs | **3D primary**, 2D network kept as exact-reading fallback |
| Scenario ensemble landscape (48 scenarios × 2 drivers × 1 twin outcome) | A 2D scatter must drop one of three genuinely quantitative axes into color/size | 3D position keeps all three axes on strong position channels simultaneously | **3D primary**, parallel-coordinates kept as mandatory fallback |
| Org hierarchy (4 divisions, ~500 leaf contributors, 4 levels) | 2D icicle already encodes depth via position and sibling-share via length — both top-rank channels | 3D extrusion looks more "impressive" but adds no new readable quantity | **2D primary**; 3D extrusion opt-in, labeled decorative |
| Risk heatmap / blast-radius matrices | Already well-served by 2D heatmap (color = magnitude, position = category pair) | 3D bar-extrusion is the classic occlusion-hurts case (back rows hidden) | **Not built in 3D** — explicitly out of scope (see Phase 5 Q4) |

## Phase 1 — Model

### Spatial data contract

```ts
type SpatialEncoding = {
  dimension: "position3d" | "size" | "depth" | "color" | "motion";
  dataField: string;
  scaleType: "linear" | "log" | "ordinal" | "categorical" | "sqrt";
  fieldKind: "magnitude" | "categorical" | "ordinal" | "identity";
  perceptualRanking: number; // Cleveland–McGill extended, depth = weakest (rank 9)
  decorative?: boolean;      // true => carries no data, must be labeled in the legend
  note?: string;
};
```

Perceptual ranking (0 = most accurate): position (common scale) → position (non-aligned) → length →
direction → angle → area → volume/curvature → color (sequential) → color (categorical) → **depth**.
Depth is permitted only for `fieldKind: "categorical" | "ordinal"`; the validator
(`src/lib/spatial/encodingValidator.ts`) hard-fails any encoding that puts `fieldKind: "magnitude"` on
`dimension: "depth"`.

### Scene types

- **Ecosystem/dependency space** (`src/components/spatial/scenes/EcosystemScene.tsx`) — 3D helps
  edge-crossing clarity at this node/edge density (Part 31 shape). 2D network fallback included.
- **Scenario comparison space** (`ScenarioLandscapeScene.tsx`) — Part 24-shaped scenario ensemble
  rendered as an explorable landscape (x/z = drivers, height = twin outcome), with a 2D
  parallel-coordinates fallback for exact reading.
- **Org-structure space** (`OrgStructureScene.tsx`) — 2D icicle preferred; 3D only offered as an
  explicitly-decorative opt-in, per the Phase 0 verdict (no measured or plausible benefit here).

### Interaction model

- Navigation: pointer-drag orbit, wheel zoom, click-to-select, pinned selection synced across views.
- Selection sync: `src/lib/spatial/urlState.ts` encodes `{scene, selected, view}` into the URL query
  string (Part 03 discipline) via `history.replaceState`.
- Explorable explanations: `src/lib/spatial/tourEngine.ts` + `TourControls.tsx` — a step sequence with
  narration text and camera targets; reduced-motion users get instant camera cuts (no tweening).

### Accessibility architecture

- Every scene renders through `SceneShell.tsx`, which always offers 4 views via `ViewSwitcher`: 3D, 2D
  chart, table, description — switching is one click/tap, no scene is 3D-only.
- Keyboard navigation: `computeTraversalOrder()` produces a total, duplicate-free order over every node;
  the UI renders this as **real, focusable, in-DOM `role="option"` elements** (not `aria-hidden` canvas
  pixels), with arrow-key stepping wired to the same order a screen reader would encounter.
- Reduced-motion (`usePrefersReducedMotion`) and low-GPU (`useGpuProfile` + `lodLimit`) fallbacks cap
  rendered element count and disable animated camera moves.

## Phase 2 — Design

- Color/category semantics are shared between the 3D canvas renderer and the 2D SVG fallbacks (same
  `colorFor()` function passed to both), so re-reading a value across views never changes its color
  meaning.
- Scene loading UX: the entire spatial layer is one `React.lazy()` boundary (`SpatialRoutes.tsx`); while
  it loads, a skeleton placeholder is shown. Progressive LOD: once loaded, scenes cap rendered elements
  by magnitude-ranked importance under low-GPU/mobile conditions, with a visible "showing N of M" notice
  and the Table view always holding full detail.
- Mobile: `SceneShell` defaults `view` to `"2d"` for `threeDPrimary` scenes when `window.innerWidth < 640`
  (touch-first 2D by default, 3D remains reachable via the tab).
- Table view affordance is structurally mandatory: `ViewSwitcher` always renders all 4 tabs; this is
  asserted in `scripts/verify.ts` §2 (semantic equivalence coverage).

## Phase 3 — Build

- **(a) Spatial rendering layer:** a hand-rolled ~2KB perspective-projection module
  (`src/lib/spatial/projection.ts`) rendered on a single `<canvas>` 2D context
  (`src/components/spatial/SceneCanvas.tsx`), **not** three.js/@react-three/fiber. Justification: a
  WebGL scene-graph library costs ~140–180KB gzip before any application code — on its own it would
  likely exceed the 150KB budget for the *entire* spatial layer. Our scenes only need points, lines, and
  simple extrusions; Canvas2D covers all three scene types at a fraction of the cost and gives us full
  control over hit-testing/focus order (required for the accessibility architecture above). Measured
  cost: **12.4KB gzip** for the whole spatial module tree (react/react-dom externalized) — see
  VERIFICATION LOG.
- **(b) Encoding validator:** `src/lib/spatial/encodingValidator.ts`, 5 rules, seeded-bad-input tests in
  `scripts/verify.ts` §1.
- **(c) Semantic-equivalent generator:** `src/lib/spatial/semanticEquivalent.ts` — scene → `{chart2d,
  table, description}`, coverage asserted in `scripts/verify.ts` §2.
- **(d) Keyboard traversal:** `src/lib/spatial/keyboardTraversal.ts` (pure order function) +
  `SceneCanvas.tsx` (real DOM roving list), asserted in `scripts/verify.ts` §3.
- **(e) Guided-tour engine:** `src/lib/spatial/tourEngine.ts` + `TourControls.tsx`, used on the Ecosystem
  scene.

## Phase 4 — Measure (gates)

All 6 gates are exercised by `npm run verify` — see VERIFICATION LOG for the real, current run output.

1. Encoding-validator tests green (seeded bad encodings caught) — **PASS**
2. Semantic equivalence coverage (2D + table + description, all 3 scenes) — **PASS**
3. Keyboard traversal covers every node, no duplicates — **PASS** (disclosed as a DOM-shape proxy, not a
   full WCAG browser audit — no automation harness available in this sandbox)
4. Bundle budget: spatial layer ≤150KB gzip, lazy-loaded — **PASS**, measured 12.4KB gzip
5. 10k-element scene throughput proxy ≥30fps-equivalent — **PASS**, measured ~235fps-equivalent JS-compute
   proxy on this host (Node v20, single-threaded) — explicitly **not** a GPU-rasterization measurement
6. `npm run verify` exits 0 — **PASS**

## Phase 5 — Attack

See `src/components/MethodologyPage.tsx` for the in-app version of this section (rendered to end users),
reproduced here:

1. **Where 3D actively misleads:** occlusion (a node can hide fully behind a larger one at some orbit
   angles) — mitigated by the keyboard list/table being the authoritative complete enumeration, never the
   3D view alone. Perspective distortion (far objects shrink) could be misread as low magnitude — mitigated
   by keeping magnitude on size/position and bounding the perspective-scale visual falloff to a narrow
   0.4–1.6 multiplier that cannot plausibly stand in for the real encoded value.
2. **Better than a good 2D treemap?** Not claimed universally. For the org hierarchy: no — hence 2D
   primary. For the ecosystem graph and scenario landscape: the claim is narrow (helps a specific reading
   task) and paired with a fallback for the task it doesn't help (exact value reading).
3. **Strongest accessibility test run:** `scripts/verify.ts` §3 computes the real traversal order from the
   same registry data the app renders and asserts full, duplicate-free coverage; in the UI, the traversal
   list is real focusable DOM (`role="option"`), not `aria-hidden` canvas pixels.
4. **Deliberately not done:** no 3D heatmap/blast-radius extrusion (decoration-that-hurts, stays 2D, out
   of scope); no three.js/WebGL dependency (bundle budget); no GPU fingerprinting (privacy/reliability — a
   disclosed `hardwareConcurrency` heuristic is used instead); no real browser-automation a11y audit (no
   harness in this sandbox — called out rather than faked).
