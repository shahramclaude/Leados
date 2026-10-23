# AI-SESSION-LOG.md

## Part 54 — Org Design Lab, M&A Deal Room, Human-Impact Ledger, Post-Mortem Bridge

**Repository:** https://github.com/shahramclaude/Leados
**Scope:** Parts 06 (org dynamics twin), 09 (people scoping), 31 (ecosystem graph), 37 (multi-entity model),
53 (obligation cascade) dependencies declared by the brief.

### Read-before-write

The sandbox snapshot of this repository contains only the Next.js + Drizzle starter
(`src/app`, `src/db/index.ts`, `src/db/schema.ts` with an empty `export {}` contract, config files).
It does **not** contain the Part 06 / 09 / 31 / 37 / 53 source files described in the brief — there is no
existing twin, ecosystem graph, people-scoping module, multi-entity model, or obligation-cascade engine to
extend in this codebase. Files actually read before writing:

- `src/db/schema.ts` (starter — empty, additive contract documented in its header comment)
- `src/db/index.ts` (Drizzle/pg pool wiring)
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`
- `package.json`, `tsconfig.json`, `drizzle.config.json`, `.env`

Because the named prior-part modules are not present to extend, Part 54 is built as a **self-contained
implementation that honors the lineage contract**: every engine module in `src/lib/org-design/` documents,
in its header comment, which prior part's concept it stands in for (twin, ecosystem graph, people-scoping
signals, multi-entity deal counterparties, obligation cascade), and the twin's model card
(`src/lib/org-design/modelCard.ts`) declares this lineage explicitly so a future integration with the real
Part 06/09/31/37/53 modules has a clear seam to plug into (same `Explain<T>` shape, same table names prefixed
`od_`, same function signatures).

### What was built

- **Org twin extension** (`src/lib/org-design/twinEngine.ts`, `network.ts`): structural moves (merge, split,
  reporting-line change, centralize, decentralize) modeled as graph transforms over a declared org-unit /
  collaboration-edge graph. Outputs delivery impact (capacity %, cycle-time days) and network impact
  (cohesion, choke points, bus factor) as `Explain<T>` — value + interval + confidence + assumptions +
  method, never a bare number.
- **Human-Impact Ledger** (`humanImpact.ts`, `privacy.ts`): mandatory, per-person accounting of every
  structural move — role-change type × disruption class × support-plan link. `assertHumanImpactComplete`
  throws (simulation rejected) if the ledger is empty for a move touching people, or if any high/severe
  disruption lacks a linked support plan. Self-visibility is enforced by `canViewEntryDetail`: the subject
  always sees their own entry; other employees only after `announcedOrgWideAt` is set; admins see immediately
  via an audited, distinct access path.
- **M&A Deal Room** (`obligationCascade.ts`, `synergy.ts`, `integrationScore.ts`, `readinessChecklist.ts`):
  deal phases (diligence → announce → integrate → complete), change-of-control obligation cascades that fire
  at "announce", synergy estimates as `Explain<T>` intervals with deliberately conservative confidence on
  revenue/capability synergy, an integration-difficulty composite (culture distance + systems overlap +
  talent-flight risk) returned as an interval, and a Day-1 readiness checklist template.
- **Scenario comparison** (`scenarioCompare.ts`): side-by-side table across delivery/network/human dimensions.
  Deliberately has **no** function that reduces the comparison to a single ranked score.
- **Post-change tracking + recalibration** (`recalibration.ts`): records realized vs. predicted outcomes,
  computes variance against the declared error band, and nudges twin coefficients with a damping factor
  (30% per reorg) so a single data point cannot swing the model.
- **UI**: `/org-design` (overview + model card + seed), `/org-design/lab` (drag-and-drop structural-move
  builder with live delivery/network/human panels), `/org-design/ledger` (self-first view, org-wide
  aggregate-then-detail view, privacy attempt-matrix self-check), `/org-design/scenarios` (comparison table),
  `/org-design/deals` + `/org-design/deals/[id]` (Deal Room), `/org-design/postmortem` (Post-Mortem Bridge).
- **`scripts/verify.ts`** (`npm run verify`): seeds demo data and a synthetic-but-declared-as-such historical
  move set, then runs the five PHASE 4 gates against the real database and prints a calibration table, the
  human-impact ledger output, the privacy attempt matrix, the obligation-cascade fixture result, and the
  before/after recalibration numbers. Exits 0 only if every gate passes.

### Honesty rules applied

- The twin model card (`modelCard.ts`) lists known limits (undeclared informal networks are invisible,
  small/partly-synthetic calibration set, no access to tacit knowledge/morale/trust, placeholder flight-risk
  and culture-distance inputs) and declared error margins, embedded in every simulation run record.
- `historicalMoves` seed data is explicitly commented and documented (schema, seed module, session log) as
  **synthetic ground truth** generated from the twin's own formulas plus a bounded perturbation — it exists
  to exercise the calibration pipeline end-to-end, and is never represented as real historical validation.
- The human-impact ledger cannot be bypassed (`assertHumanImpactComplete` is called on every simulation path)
  and is never collapsed into a single "efficiency" or "impact score" number — it is always shown as counts
  by disruption class and role-change type, with support-plan links, per PHASE 4 gate 2.
- `scenarioCompare.ts` exports `NO_SINGLE_SCORE_POLICY` and intentionally has no ranking function.

### PHASE 5 — Attack (self-review)

1. **How do you prevent scenario theater (the model becoming a weapon for a predetermined outcome)?**
   Structurally: (a) every simulation always renders all three dimensions — delivery, network, human — side
   by side; there is no code path that hides one of them. (b) The comparison table
   (`compareScenarios`) never emits a single ranked score, so nobody can point at "the model said 83 vs. 61"
   to end a debate. (c) Every number carries an interval and a confidence, and the model card's known limits
   are attached to every run — a wide interval is visible evidence against treating any single simulation as
   a verdict. (d) The human-impact ledger is mandatory and cannot be aggregated away, so a scenario that looks
   good on capacity/cycle-time still has to show its named, countable people cost next to it. This raises the
   cost of cherry-picking a scenario to justify a predetermined outcome — it doesn't make it impossible; no
   software control stops a human from only running the scenario they wanted a good trail for. The
   post-mortem bridge is the real check: predicted-vs-realized tracking creates an audit trail that a
   "selectively run" simulation will eventually contradict.
2. **Which human-impact dimension is hardest to quantify honestly, and why show it anyway?** Psychological
   safety / trust erosion among people who are *not* directly affected but watch a reorg happen to their
   peers ("survivor" disruption). The current model only classifies people inside the affected units — it has
   no signal for second-order morale effects on adjacent teams. This is listed as a known limit rather than
   quietly assigning it a fake number, because a false precision here (e.g., "trust impact: 6.2/10") would be
   worse than admitting the twin cannot see it — someone would optimize against the fake number instead of
   asking a human.
3. **What does the product refuse to optimize, and where is it enforced?** It refuses to produce a single
   "efficiency" or "best scenario" score that nets human cost against delivery gain. Enforcement points:
   `assertHumanImpactComplete` (throws, not a warning, not a config flag) in `humanImpact.ts`, called from
   `runStructuralSimulation` on every move; `scenarioCompare.ts` has no ranking function at all (not merely a
   UI choice — the function doesn't exist); the UI always renders the human-impact panel with the same visual
   weight as delivery/network, never collapsed or hidden by default.
4. **What was deliberately NOT done?** (a) No authentication/role system — "self", "employee", "admin" are
   passed as plain identifiers for demonstration; a real deployment needs this wired to the platform's actual
   auth/identity system before the privacy guarantees are real rather than illustrative. (b) No real
   historical-reorg dataset — the calibration set is synthetic and declared as such; real calibration needs
   real HRIS/delivery-metrics history. (c) No drag-and-drop org chart canvas (e.g. a full tree-diagram editor)
   — the Lab uses native HTML5 drag-and-drop onto a "move basket," which satisfies the interaction model
   without a new charting dependency. (d) No automatic second-order (multi-hop) cascade modeling — the model
   card explicitly flags this as a limit rather than silently guessing. (e) No integration with a real
   Part 06/09/31/37/53 module, because those modules are not present in this repository snapshot; the lineage
   comments and shared `Explain<T>` / `od_` table-naming convention are the deliberate integration seam for
   whenever those modules exist in the same codebase.

### Commands run this session

- `npx drizzle-kit push --force` — applied new `od_*` tables.
- `npx tsc --noEmit` — clean.
- `npx tsx scripts/verify.ts` / `npm run verify` — all 5 gates pass (see VERIFICATION LOG in the delivery
  message for full output).
- `npx next typegen`, `npm exec tsc -- --noEmit`, `npm run build` — all clean.
- `build_and_start` — healthcheck passed.
