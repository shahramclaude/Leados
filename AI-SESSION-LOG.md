# AI Session Log

## Part 37 — Global Operations (Entity Hierarchy, Multi-Currency, Fiscal & Regulatory Plurality)

**Repository:** https://github.com/shahramclaude/Leados
**Depends on (per brief):** Part 08 (finance model), Part 13, Part 15 (i18n/tenancy), Part 29 (obligations tracker)

### What was actually in the repository before this part

The sandbox snapshot handed to this session contained only the base Next.js + Drizzle +
PostgreSQL starter template:

- `src/db/schema.ts` — empty (`export {}`), `src/db/index.ts` — Drizzle/pg bootstrap
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`
- `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `drizzle.config.json`, `.env`

**None of Part 08's finance model, `format.ts`, `time.ts`, Part 13, Part 15's i18n/tenancy layer,
or Part 29's obligations tracker were present as source files in this repository snapshot.** This
was confirmed by `list_files`/`read_file` before any writing began (standing-order requirement
#1). Rather than inventing behaviour that might silently contradict real code we cannot see, every
new module under `src/lib/global-ops/` opens with a comment stating this and defines the contract
(Money shape, format() surface, obligation-applicability shape) that those parts are expected to
expose, so a future merge can rewire the imports instead of reconciling two divergent designs.
This is the single most important scope caveat for this delivery and is repeated in PHASE 5 below.

### What was built

1. **Schema** (`src/db/schema.ts`): `entity_groups`, `entities` (self-referencing parent, ownership
   %, consolidation method, fiscal calendar type/config, timezone, locale, region), `units`,
   `fx_rates` (base/quote/date/rate/method/source/fiscal period — versioned, never mutated),
   `financial_figures`, `intercompany_eliminations`, `obligations` + `obligation_instances`
   (jurisdiction-tagged), `data_residency_policies`, `board_pack_entity_notes`.
2. **Multi-currency engine** (`src/lib/global-ops/fx.ts`): `methodForStatement` (BS→closing,
   PL→average, EQ→historical), `translate()` which throws `FxRateMissingError` rather than ever
   defaulting to 1.0, and `decomposeFxVariance()` for rate/volume/residual decomposition that
   always sums exactly to the total variance.
3. **Consolidation engine** (`src/lib/global-ops/consolidation.ts`): recursive entity-tree walk
   applying full/proportional/equity consolidation rules, intercompany elimination (visible gross
   + elimination + net on every contribution), minority interest carve-out, equity-method
   single-line pickups, and a drill-down-complete `ConsolidationResult` where every total's
   `contributions[]` sums exactly to it.
4. **Fiscal calendar engine** (`src/lib/global-ops/fiscalCalendar.ts`): calendar / 4-4-5 / 5-4-4 /
   4-5-4 / custom period generation on pure UTC date arithmetic (DST-proof by construction), with
   a leap-week mechanism for 4-4-5 families, plus a period-alignment engine
   (`alignPeriodsToWindow`) used for group reporting across mismatched fiscal calendars.
5. **Residency enforcement** (`src/lib/global-ops/residency.ts` +
   `src/lib/global-ops/repository.ts`): data-class × allowed-region policy, fails closed on
   unknown classes, and `filterByResidency` never silently drops a row — blocked rows are returned
   with a human-readable reason so the UI must disclose what was withheld. All DB reads of
   entity/jurisdiction-scoped data go through `repository.ts`.
6. **Jurisdiction scoping** (`src/lib/global-ops/obligations.ts`): applicability rules
   (jurisdiction, region, consolidation method, min ownership %) evaluated per entity.
7. **i18n/formatting** (`src/lib/global-ops/format.ts`): `Intl`-backed money/number/percent/date
   formatting, FX-method badges, and fiscal-aware period labels (period code + localized date
   range together).
8. **Board pack integration** (`src/lib/global-ops/boardPack.ts`): builds the "entity notes
   section" — every entity's own standalone result is listed next to the group totals, with
   automatic "watch" flagging for loss-making entities even absent a manual note.
9. **UI surfaces**: `/group-consolidation`, `/entity-compare`, `/fiscal-calendar`, `/jurisdiction`,
   `/board-pack`, linked from the home page and a shared nav component.
10. **Seed data** (`src/db/seed.ts`, run via `npm run db:seed`): one group, five entities (US
    parent/full, DE sub 80%/full, GB sub 100%/full but **loss-making this period**, SG JV 35%/
    proportional, JP associate 25%/equity), FX rates with full provenance, intercompany
    eliminations, obligations across 4 jurisdictions, residency policies, and board-pack notes.

### Verification performed this session

- `npx vitest run` — 117/117 tests passing across 5 suites (consolidation fixture with
  hand-computed answers, FX translation + variance decomposition, fiscal calendar property tests
  across 4 calendar types × 10 years incl. explicit DST-boundary proofs, residency cross-border
  attempt matrix, obligation applicability rules).
- `npx next typegen`, `npm exec tsc --noEmit`, `npm run build` — all clean.
- `npm run verify` (added script: `typecheck && vitest run`) — exit 0.
- `build_and_start` — succeeded, `/api/health` green, DB schema pushed via
  `npx drizzle-kit push`, seed data applied via `npx tsx src/db/seed.ts`, and all 5 new pages
  smoke-tested with `curl` returning HTTP 200 with expected content (NCI section, equity pickup
  section, the UK loss warning banner, and a live residency-block notice on `/jurisdiction`).

### Honesty-rule compliance

- Every translated figure in the UI shows a method badge (CLOSE/AVG/HIST/LOCAL) and, on hover /
  in the drill-down table, the exact `rateDate` + `rateSource` it came from (`rateProvenanceLabel`).
- Group Consolidation always expands into its `contributions[]`; nothing is a bare total.
- The Group Consolidation page actively surfaces a red warning banner listing any standalone
  loss-making entity *above* the consolidated figures, specifically so a healthy group number
  cannot visually imply "everything is fine" (see PHASE 5 #1 below for the residual risk this
  does not fully solve).
- Jurisdiction View's residency switch demonstrates a real blocked read with a stated reason,
  not a silently shorter list.

### PHASE 5 — Self-attack

1. **Where can consolidation hide a failing entity?** The *default* `/group-consolidation` view
   is keyed to `?fy=2025&fp=1` and shows account-line totals first; a user who never expands a
   `<details>` row sees only the healthy group number. I mitigated this with an unconditional
   loss-warning banner above the fold and the Board Pack's entity notes section, but a user who
   visits `/group-consolidation` and does not scroll past the headline totals, or who only ever
   looks at the Entity Compare page without sorting by net income, can still miss a small-but-real
   loss. The dangerous default is **"group P&L totals without opening the banner/board pack"** —
   I chose to always render the banner rather than make it dismissible/collapsible, specifically
   to reduce (not eliminate) this risk.
2. **FX-rate manipulation/quality risk.** Rates are hand-entered rows in `fx_rates` with a
   `rateSource` free-text field — nothing in this part validates that the source is a real,
   independent feed, cross-checks it against a second source, or detects an anomalous rate move
   (e.g. a fat-fingered 10.5 instead of 1.05). The system *will* faithfully consolidate a wrong
   rate; it only refuses to consolidate with *no* rate. Surfacing: the rate provenance is always
   visible next to every translated figure (so a reviewer *can* catch it), and
   `decomposeFxVariance` would show an implausible `rateEffect` if period-over-period variance
   analysis were run against it — but no automated anomaly check exists. This is a deliberate
   scope boundary, not an oversight.
3. **Which jurisdictional rule will the model get wrong first?** `obligations.applicabilityRule`
   is a flat AND of four simple clauses (jurisdiction list, region list, consolidation method,
   min ownership %). Real regulatory applicability is frequently OR-of-ANDs (e.g. "applies if
   revenue > threshold OR headcount > threshold OR listed"), has effective-dated rule changes, and
   depends on facts this model doesn't track (revenue size, employee count, listing status,
   permanent-establishment tests). The honest boundary: this model answers "which *jurisdiction
   and ownership-shaped* obligations attach to an entity," not "is this entity actually in scope
   under the real statute." It will first get wrong any obligation whose applicability depends on
   a threshold or OR-condition not representable in the current rule shape.
4. **What was deliberately NOT done** (explicitly out of scope for this part):
   - No real holiday calendar (lunar/moveable holidays are not modelled — see the comment in
     `holidays.ts`).
   - No sub-entity (`units`) level consolidation — figures are booked at Entity granularity only.
   - No multi-level period-alignment wired *into* the consolidation engine itself (the
     fiscal-calendar alignment engine and the consolidation engine are tested independently;
     `consolidateGroup` currently requires contributing entities to already share the same
     `fiscalYear`/`fiscalPeriod` index, which is a simplification documented in
     `consolidation.ts`).
   - No automated FX-rate quality/anomaly detection (see #2 above).
   - No enforcement of data residency at the Postgres row-security level (it is enforced in the
     TypeScript repository layer only, which is a weaker guarantee than DB-level RLS against a
     compromised application tier).
   - Part 08/13/15/29's actual source was not available to integrate against; this part defines
     compatible contracts instead of real integration (see top of this entry).

### Files touched

See the MANIFEST table in the final chat response for the complete list of every file created or
modified in this session, each delivered in full per the delivery contract.
