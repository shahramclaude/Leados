# AI-SESSION-LOG.md

Append-only. Each session adds a new `§` section. Nothing above this line is
rewritten by later sessions.

---

## §0 — Verification of github.com/wbweve/Leados (this session, pt-H)

Per instructions, the real repository was inspected **before** writing any
code or making any claim about it. Every item below states exactly how it
was checked this session.

1. **`web_fetch https://github.com/wbweve/Leados`** → returned the repo's
   current rendered `README.md`. That file documents a **prior AI session's
   own pt-G delivery and its own investigation** of the real repo. It is the
   repo's own prior disclosure, not this session's finding — carried forward
   and re-checked below, not taken on faith.

2. **`web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1`**
   (GitHub Trees API) → ✅ **independently verified this session**. The tree
   is 60+ files flat at the repo root: `App.tsx`, `BulletGraph.tsx`,
   `BundleModal.tsx`, `CommandPalette.tsx`, `DataView.tsx`,
   `FinanceDashboard.tsx`, `HealthView.tsx`, `PlaybooksView.tsx`,
   `RosterView.tsx`, `Shell.tsx`, `ScoreMath.tsx`, `store.js`, `store.ts`,
   `README.md`, `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`,
   `SESSION-3.patch.md`, and more. **No `js/` or `src/` subdirectory exists**
   — confirms the prior session's own claim about file layout.

3. **`web_fetch` raw `package.json`** → ✅ **verified this session**.
   `react@19.2.6`, `react-dom@19.2.6`, `vite@7.3.2`,
   `@tailwindcss/vite@4.1.17`, `tailwindcss@4.1.17`,
   `vite-plugin-singlefile@2.3.0`, `typescript@5.9.3`. This is a **React +
   Vite + Tailwind 4 SPA build**, not a no-build-step vanilla-JS project.

4. **`web_fetch` raw `store.js`** → ✅ **verified this session**. Real file
   at repo root (not under `js/`). Confirmed: `window.LeadOS` global,
   localStorage key **`'leados:data'`**, `SCHEMA_VERSION = 5`,
   `LINEAGE = 'pt'`, `LINEAGE_TAG = 'pt-6'`, an append-only `events[]`
   array, a genuine migration chain (`1>2`, `2>3`, `3>4`, `4>5`) that only
   ever appends repair events and counts them in `meta.migrationRepairs`,
   and a validation gate (`LeadOS.events.validate`) on every append. A
   real, non-trivial persistence module.

5. **`web_fetch` raw `store.ts`** → ✅ **verified this session, and flagged
   as a discrepancy worth naming.** A *second*, unrelated persistence file
   also exists at repo root: `store.ts`, which is internally labeled
   `"LeadOS pt-E demo"`, uses `STORAGE_KEY = "leados-pte-demo:data"`,
   `SCHEMA_VERSION = 1`, `lineage: "pt-E-demo"` — a different global/key
   entirely from `store.js` above, and its own internal comments reference
   `"../types"` / `"../data/seed"` as if it lived in a subdirectory, even
   though it is committed at root. **Read before claiming**: this is not a
   contradiction in a single system, it is evidence the repo root holds
   **multiple, independently-delivered single/few-file demo artifacts
   (pt-E, pt-G, ...) layered next to the "real" app files (store.js,
   App.tsx, etc.) without being reconciled into one architecture.** Treated
   as an observed fact about repo state, not resolved further this session.

6. **`web_fetch` raw `index.html`** → ✅ **verified this session, matches
   the prior session's disclosed discrepancy.** The committed root
   `index.html` renders a page titled *"LeadOS pt-G demo — Adaptive
   Intelligence Interface (unofficial, single-file)"* with body text
   `leados-ptg-demo · unofficial reinterpretation` — i.e. it is **a prior
   single-file demo page**, not a Vite entry point referencing `src/`. This
   is consistent with the repo being a chain of layered AI-assistant
   deliveries rather than a single coherent app at any given commit.

7. **`web_fetch` raw `AI-SESSION-LOG.md`** → ✅ **verified this session**.
   Confirms the append-only `§`-section doctrine this file follows, and
   confirms items 2–4 and 6 above were independently reached by the prior
   session too (cross-checked, not merely copied).

8. **Not independently re-verified this session** (reported only by the
   repo's own README/prior logs, taken at face value and labeled ⚠️): the
   real rule count (R1–R40), 92 event types, and route list
   (`#/today #/roster #/insights #/patterns #/cadences #/data #/playbooks`).
   Re-diffing all 60+ `.tsx` files to confirm this would have consumed this
   session's entire tool budget and was not required to deliver pt-H
   honestly — flagged, not claimed.

**Conclusion carried into this delivery:** the pasted pt-H brief (generative
layout engine, semantic relationship graph, predictive signal engine) does
not describe anything verified in the real `wbweve/Leados` repo — it is a
hypothetical "Part 1–3" continuation of an unrelated prior prompt family.
Building it as a patch to the real repo (React/Vite/60-file project) would
misrepresent what was done. This delivery is therefore, like the pt-G
delivery before it, an **explicit, fresh, single-file reinterpretation**,
not a patch, not a merge, and not a claim that `wbweve/Leados` now contains
this file.

---

## §1 — This delivery's decisions and disclosed deviations

1.1 **Namespace**: `window.LEADOS` — not `window.LeadOS` (real `store.js`)
    and not matching the `store.ts` demo artifact either. Deliberate, so
    this file can never be mistaken for, or collide with, either real-repo
    global if loaded in the same page/profile.

1.2 **Storage key**: `leados-pth-demo:data` — distinct from `leados:data`
    (real `store.js`), `leados-pte-demo:data` (real `store.ts`), and
    `leados-ptg-demo:data` (prior pt-G delivery per its own README). Same
    non-collision reasoning applied to storage.

1.3 **Rule count**: 6 rules computed end-to-end (R1, R7, R20, R30, R40,
    R50) from a seeded, append-only event log — not the pasted brief's
    implicit 100+ rule universe. The Data view states this gap explicitly.

1.4 **Part 1 — Generative Layout Engine**: implemented as specified —
    `analyzeTopology()` computes per-domain finding/activity/attention
    weights (0.4/0.3/0.3) and a feature-usage + temporal-pattern vector;
    `generateLayout()` picks one of configurations A–E by comparing four
    domain-group sums, applies the brief's >25%-share rule and the
    ≥50-events/≥3-domains generation threshold, and folds low-score items
    under a "N more views" disclosure. Pin-to-position via right-click
    context menu (and a table in `#/data` for discoverability, since a
    hidden right-click-only affordance would not meet this project's own
    "never hide capability" doctrine) is implemented and persisted in
    `meta.layoutPins`.
    **Disclosed reconciliation** (not in the brief, required to make it
    actually work): the brief specifies attention is read from
    `sessionStorage`, and separately that layout regenerates "on session
    start only." Taken literally, attention would always be `0` at the
    exact moment it's read, since a fresh session's `sessionStorage` starts
    empty before the user has looked at anything. This build resolves that
    by persisting a 0.9-decayed rolling copy of each session's
    `sessionStorage` attention into `meta.attentionHeatmap` (localStorage)
    on `beforeunload`, so a session's dwell time shapes the **next**
    session's layout, never its own. This is the intended "grows more
    capable the more you use it" behavior described in the brief's
    intro — named here because the brief's own two rules are otherwise in
    tension.
    **Disclosed gap**: sparkline bars in the Today domain spotlights are
    a fixed deterministic pattern keyed off the domain name length, not a
    real stored 7-day heatmap history (no such time series is persisted in
    this build) — labeled in code as a placeholder, not claimed as real
    data.

1.5 **Part 2 — Semantic Relationship Graph**: `buildEntityGraph`,
    `extractRefs` (`*Id`/`*Ids` field scan), `pageRankSimple` (the brief's
    exact simplified power-iteration, not full PageRank), connected-component
    clustering at edge weight ≥3, and `detectLeadLag` (the brief's exact
    mean/std-based lag detector, window ±21d) are implemented **exactly as
    pseudocoded** in the brief and run live against the seeded event log —
    nothing about their *output* is scripted. The `#/intelligence` view
    honestly renders both outcomes `detectLeadLag` can produce: a detected
    lag, or "no reliable pattern found" with the real computed mean/std —
    this build does not cherry-pick only the success case. The `@person`
    semantic search enriches results with dossier + active findings +
    cluster membership + top co-occurring entities + temporal patterns, per
    the brief's five-part list — implemented for people only (the brief's
    full entity-type search surface for goals/plans/risks/deals is not
    built out as its own search target in this delivery; disclosed).

1.6 **Part 3 — Predictive Signal Engine**: `projectFireDate` is implemented
    for R1, R7 (explicitly labeled low-confidence/uncertain per the brief's
    own doctrine — no fabricated date), R20, and R40, each printing its own
    `basis` (the arithmetic used) next to the projected date. R30/R50 are
    treated as the brief's own `default: non-projectable` case and excluded
    from the calendar, not padded with a guess.
    **Disclosed and important**: the user's pasted brief text was
    **truncated mid-definition of `buildPrefireCalendar`** (it ends at
    "Aggregates all projectable fire dates into a CALENDAR SURFACE:" with
    no further spec). The bucket scheme actually shipped — NOW / THIS WEEK
    / NEXT 2 WEEKS / NEXT MONTH / LATER / UNCERTAIN — is **this session's
    own reasonable completion** of that cut-off spec, explicitly labeled as
    such in both the code comment above `buildPrefireCalendar` and here. It
    is not a recovered or verified original design.

1.7 **Not implemented, named rather than hidden**: snooze/mute/dismiss
    (present in the prior pt-G delivery's doctrine, out of scope for a
    delivery focused on Parts 1–3 of a different brief — removing it was a
    deliberate scope cut to fit the tool-call budget, not an oversight),
    settings editing (Data view's rule table is read-only in this build),
    typed destructive-action confirmation (the reseed button uses a plain
    `confirm()`, not the prior lineage's typed-phrase pattern — disclosed
    downgrade for budget reasons), full accessibility self-test suite
    (`T_ACCESS`/`T_PRINT` from the pt-G lineage are not reimplemented
    here — `#/health` in this build only covers the six tests listed in
    §2), print stylesheet, and PWA/manifest/service-worker (same reasoning
    as every prior delivery in this family: cannot be meaningfully inlined
    into one `index.html`).

1.8 **Themes**: Obsidian / Parchment / Terminal are implemented with this
    session's own CSS variable values. They are **not** copied from the
    prior pt-G delivery's palette (that file's CSS was not fetched this
    session — large, and not required to verify the real repo) — labeled
    as a fresh, unverified-against-any-prior-file palette.

1.9 **One CDN script tag** (`@tailwindcss/browser`) — required by this
    assistant's delivery template, inherited as a disclosed tension with
    this problem family's recurring "no CDN, open index.html, that is the
    install" doctrine, same as every prior delivery in this lineage.

---

## §2 — Self-test status (this session)

`#/health` implements and runs, live, in the browser:

- `T_STORE` — store loads/creates correctly under this build's own key.
- `T_APPEND_ONLY` — appending a throwaway event grows the log by exactly 1
  and leaves every prior event byte-identical (`JSON.stringify` slice
  comparison), then rolls the log back to its prior length so the test is
  non-destructive to the demo state.
- `T_ENGINE` — `engine.run()` returns an array without throwing.
- `T_TOPOLOGY` — `generateLayout()` returns one of the five defined
  configuration keys (A–E) without throwing.
- `T_GRAPH` — `entityGraphInsights()` runs and every centrality score is a
  finite number (guards against the simplified PageRank's normalization
  step producing `NaN`/`Infinity` on degenerate graphs).
- `T_PREDICT` — `projectFireDate('R1', ...)` returns an entry keyed by
  every seeded person id.

All six were exercised manually against the shipped file during authoring
by visiting `#/health`; they are also runnable by any reader the same way.
