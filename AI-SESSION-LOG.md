# AI-SESSION-LOG.md — Part 8 ("pt-I") delivery

## §0 — Claim-vs-inspection audit (read this first)

The task said: *"Read https://github.com/wbweve/Leados first. Inspect the
actual code before claiming anything about it; label anything unverified."*
This section is the ledger of what was actually fetched this session, what
it showed, and where it contradicts other claims (including claims already
sitting inside the repo from earlier sessions).

### What was fetched, raw, this session

| # | URL | What it showed |
|---|---|---|
| 1 | `github.com/wbweve/Leados` (rendered README) | The root `README.md` describes a *previous* session's own delivery: "LEADOS — Visual Keyboard Guide Overlay," a disclosed vanilla-JS re-implementation, storage key `leados-keyboard:data`. |
| 2 | `api.github.com/.../git/trees/main?recursive=1` + `contents/` | Root of `main` holds ~30 flat `.tsx` files (`App.tsx`, `AboutView.tsx`, `BulletGraph.tsx`, `FinanceDashboard.tsx`, `IntelligenceView.tsx`, `Network.tsx`, `RosterView.tsx`, `ScoreMath.tsx`, …) **plus** `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`, `README.md`, `index.html`. |
| 3 | `contents/src` | A **second**, separate tree: `src/App.tsx`, `src/index.css`, `src/main.tsx`, `src/components/`, `src/lib/`, `src/utils/`. |
| 4 | `raw…/src/App.tsx` | Imports `TodayView, IntelligenceView, DataView, HealthView, AboutView` from `./components/...` and its `routeFromHash()` whitelist is **exactly** `["today","intelligence","data","health","about"]` — 5 routes. |
| 5 | `contents/src/components` | Only 4 files actually exist there: `CommandPalette.tsx`, `Shell.tsx`, `SynthesisView.tsx`, `Views.tsx`. There is **no** `TodayView.tsx`, `IntelligenceView.tsx`, `DataView.tsx`, `HealthView.tsx`, or `AboutView.tsx` as separate files — so `src/App.tsx`'s imports of those names are either re-exports from `Views.tsx`/`SynthesisView.tsx` (not confirmed — **unverified**, not fetched this session) or the file is inconsistent with what's on disk. |
| 6 | `contents/src/lib` | 6 files: `core.ts`, `intelligence.ts`, `physics.ts`, `seed.ts`, `synthesis.ts`, `types.ts`. No `local_api.ts`, no `data_model.ts`, no `decision_surface.ts`, no `temporal_field.ts`. |
| 7 | `raw…/src/lib/physics.ts` | Real, fetched in full. Implements `domainMath`, `heatmap`, `measureVelocity`, `measureOrgEntropy`, `computeLeadershipEnergyBudget`, `measureResonance`. Its **own header comment** discloses: *"measureOrgEntropy, computeLeadershipEnergyBudget, and measureResonance below are ported with only mechanical adaptation … from orgPhysics.ts, which was raw-fetched in full … and is itself labeled there as 'implemented from the pasted brief' — i.e. a prior session's disclosed, non-real-repo construction."* `DECAY` constant is imported from `./core` and used as `severity * Math.pow(DECAY, ageDays)`. |
| 8 | `raw…/src/lib/types.ts` | Real, fetched in full. Defines `Domain = "people"\|"finance"\|"ops"\|"strategy"\|"legal"\|"product"`, `Finding{key,domain,sev,conf,score,ts,title,rule,play}`, `Projection{...}`. Its own header discloses: *"That repo's verified store.js uses a decisions/KRs/risk schema under window.LeadOS / key 'leados:data' / schemaVersion 5 — fetched and read directly this session … It has no 'finding/domain score' concept to port."* Also discloses the 0.85/day decay, 90-day correlation window, and 21-day decision-staleness constants as independently re-verified against the real `engine.js`/`store.js` by a prior session. |
| 9 | `raw…/src/lib/synthesis.ts` | Real, fetched in full. Implements `generateOrganizationalMoment`, `computeFiveThingsThatMatter`, `generateHardestQuestion`, with a `MOMENT_TEMPLATES` lookup keyed by temporal-mode × energy-assessment, a leverage formula `(domainImprovement × patternMultiplier × prefireMultiplier) / energyCost`, and a 7-condition-plus-fallback hardest-question list — structurally identical in shape to what this task's "Part 8" brief asked for. Its header discloses two named gaps it filled itself (the missing Moment templates, and `fillTemplate`/`selectMomentTemplate`). |
| 10 | `contents/index.html` (root, base64) | 54,935 bytes. Decoding the head shows it is **already** a complete vanilla single-file build titled *"LEADOS — Intelligence Synthesis × Keyboard Experience"*, with design-token comments explicitly labeled `⚠️ FABRICATED this session` and a provenance block matching README item #1. |

### The discrepancy this session found (disclosed, not resolved)

The comment block already embedded in that committed root `index.html`
(written by an earlier session) asserts:

> *"Root-level App.tsx (no src/ prefix) → routeFromHash() whitelist is
> exactly `["today","intelligence","data","health","about"]`. … src/App.tsx
> → a DIFFERENT file with VALID_ROUTES = `["today","domains","synthesis",
> "lab","health","about","log"]`."*

This session's own direct fetch of `raw.githubusercontent.com/.../src/App.tsx`
(row 4 above) shows the **5-route** whitelist living in `src/App.tsx` itself —
not in a separate root `App.tsx` as that earlier comment claims. Root-level
`App.tsx` was *listed* in the tree (row 2) but **not fetched for its raw
text this session** — so which file actually carries which route list is,
as of this session, an **open, disclosed discrepancy**, not something
papered over by picking whichever claim sounded more authoritative.

### Bottom line for this delivery

1. `github.com/wbweve/Leados` does not contain one coherent app; it contains
   at least two parallel lineages (flat root `.tsx` files vs. `src/`-based),
   several appended session logs, and at least one already-complete vanilla
   single-file `index.html` on `main` from a prior session.
2. The **numeric substance** of this task's "Part 8" brief (org entropy,
   leadership energy budget, resonance, the Moment/Five-Things/Hardest-Question
   synthesis engine) already exists, disclosed as fabricated-from-a-brief,
   in `src/lib/physics.ts` and `src/lib/synthesis.ts`. This session reused
   the verified constants and field shapes from those files rather than
   inventing a fourth schema.
3. The "41 files / pt-A…pt-I slice history / `js/temporal_field.js` etc."
   framing in this task's prompt does **not** match anything on disk in the
   real repo — no `js/` directory exists there at all. That framing is
   treated here as the brief to implement, not as a verified fact about the
   repository, and this tool can only ship one `index.html` regardless.
4. **New, not found anywhere in the repo**: `local_api` (BroadcastChannel)
   and `data_model` (invariants/validators as a named module) have no
   counterpart under any name in `src/lib`. The Decision Surface quadrant
   model, the causal-plausibility curve, and the organizational-inertia
   model are likewise this session's own constructions — each labeled
   `FABRICATED` at its definition in `index.html`.

## §1 — What this delivery actually is

One static `index.html`: vanilla HTML/CSS/JS, Tailwind via CDN, no build
step. localStorage key `leados-pt-i:data` (distinct from every other key
seen in the repo or in prior sessions' README text). Event-sourced: all
mutation goes through `appendEvent()`; `project()` recomputes everything
from the raw array on every call; nothing derived is cached in the store.

Implements, per this task's brief, reusing verified constants where they
exist (DECAY=0.85, 90-day correlation window, 21-day decision staleness):

- **Data model**: `DATA_INVARIANTS` (checked on load) and `EVENT_VALIDATORS`
  (checked pre-append) exactly matching the shapes given in the brief,
  plus a few extra validators for completeness (`signal.raised`,
  `decision.logged`, `commitment.made`).
- **Temporal field**: `classifyAge` / `buildTemporalProfile` — 3 horizons
  (REACTIVE <30d, STRATEGIC 30–180d, STRUCTURAL >180d) and a `mode`
  diagnosis, feeding the synthesis templates the same way the brief
  describes (verified structurally against `synthesis.ts`'s own
  `mode.split("_")[0]` template-key logic).
- **Org physics**: `domainMath`/`heatmap`/`measureVelocity`,
  `measureOrgEntropy`, `computeLeadershipEnergyBudget`, `measureResonance` —
  formulas and field names cross-checked against the real `physics.ts`.
  `changePhysics` (organizational inertia) is new, disclosed as fabricated.
- **Decision surface**: `classifyDecision` quadrant model and
  `causalPlausibility` curve — both new, disclosed as fabricated; the
  causal curve's two constants were back-solved so that a 42-day gap
  produces plausibility 0.80, matching the brief's one worked example,
  because the brief gives no formula, only that example.
- **Synthesis**: `generateOrganizationalMoment`, `computeFiveThingsThatMatter`,
  `generateHardestQuestion` — structure verified against `synthesis.ts`;
  prose templates and the simplified correlation-cluster rule are this
  session's own writing.
- **Local API**: `BroadcastChannel`-based, read-only (`ping`, `summary`),
  rate-limited to 10 requests/second. New; no counterpart found in the repo.
- **Health wall**: all 10 `T_*` and 10 `G_*` checks named in the brief,
  implemented as live, in-browser self-tests on `#/health`, each showing
  pass/fail and the concrete numbers it computed.

## §2 — Deliberate deviations from the brief, and why

| Deviation | Why |
|---|---|
| One `index.html`, not 41 files under `js/` | This tool can only create/edit a single HTML deliverable. A 41-file module tree is not representable here; disclosed rather than faked with inline comments pretending to be separate files. |
| `T_PHYSICS` checks the *formula* (`balance = source − drain`), not the literal `-5.5` example | The brief's "wins=3, drains=5 → balance=-5.5" example doesn't specify which drain types make up the 5, and the weighted formula (×2 / ×1.5 / ×1) can't be reverse-engineered to a unique answer. Asserting the algebra is honest; hard-coding a number we can't derive would not be. |
| `compositeEntropy` is stored 0–100, not 0–1 | Matches the verified real `physics.ts` (`Math.round(compositeEntropy * 100)`), which the brief's "bounded 0-1" language doesn't quite match. Picked the verified behavior over the brief's unverified phrasing, and said so in `G_ENTROPY`'s label. |
| `causalPlausibility` constants (30-day optimal lag, 60-day range) | Invented, because the brief states only one input/output pair (42d → 0.80). Back-solved to reproduce it exactly; disclosed as back-solved, not discovered. |
| `decision.logged` gained `risk` / `reversible` / `urgent` fields | The verified `types.ts` `Decision` interface has only `confidence`/`outcome`. The Decision Surface feature is meaningless without these axes, so they were added and flagged as a disclosed extension, not presented as verified real-repo fields. |
| Financial form auto-computes `gross_profit`/`ebitda` from `revenue`/`cogs`/`opex_total` instead of asking the user to type them | Removes an entire class of accidental invariant violations at the UI layer, while the validator itself is still exercised directly by `T_VALIDATORS`/`G_VALIDATOR` so the check isn't vacuous. |
| Suppression/avoidance tracked via a new `finding.snoozed` event | The brief's `suppressedFindingKeys`/`avoidancePatterns` presuppose a snooze mechanism that doesn't otherwise exist in this data model; added minimally (counts only) rather than building a full snooze-expiry system not asked for. |

## §3 — Changelog

See `README.md` for the user-facing short version. Full list:

1. Inspected `github.com/wbweve/Leados` directly (10 raw/API fetches this
   session) before writing any code — per the task's explicit instruction.
2. Found and disclosed an unresolved route-list discrepancy between an
   earlier session's own embedded comment and this session's direct fetch
   of `src/App.tsx` (§0).
3. Built one `index.html` implementing the data-model invariants/validators
   section of the brief verbatim, plus the temporal/physics/decision/
   synthesis/local-API features, reusing verified constants and field
   shapes from `src/lib/{physics,types,synthesis}.ts` instead of inventing
   a fourth schema.
4. Implemented all 20 named `T_*`/`G_*` health checks as live, in-browser
   self-tests rather than descriptions — `#/health` shows real pass/fail
   against real computed numbers on every load.
5. Labeled every fabricated formula (decision quadrants, causal curve,
   inertia model, NLG linter, local API) at its point of definition in the
   source, and again in the in-app `#/about` view, so the disclosure
   travels with the running app, not just this file.
