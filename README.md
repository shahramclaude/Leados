# LeadOS pt-17 — Financial Intelligence Layer

A universal leadership and management operating system. Append-only event log,
**158 validated event types**, **114 pure rules**, fifteen functional modules, one authority wall.
Everything derived per read; nothing derived is ever persisted; no network call is ever made.

**Run it:** open `index.html` in any modern browser. No server, build step, framework,
network, or CDN. One localStorage key.

**Verify it:** open `#/health`. Where this file and `#/health` disagree, **`#/health` wins.**

---

## §0 Claim-vs-inspection audit

| Claim | Status |
|---|---|
| Upstream tree @ `a1ed70f`: 22 flat entries, no `css/`/`js/`, npm scaffold + `rules.js` tombstone, unbootable as shipped | **BYTE-VERIFIED** (pt-7 session, git trees API) |
| `store.js` full read — schema ladder, repair counting, single key, import gate | **BYTE-VERIFIED**, ported near-verbatim |
| `engine.js` fold table / buckets / aliases / open-sets / roster; pt-5 handlers; pt-6 pattern library; upstream heat formula; insight shape; promotion-rule string | **BYTE-VERIFIED (those regions)** |
| `events.js` full registry · `health.js` · `ui.js` · upstream `playbooks.js` · `HOT_SCORE` | **NOT VERIFIED** — beyond fetch truncation; never claimed |
| pt-8 … pt-17 briefs | received in full, implemented literally; every interpretation and brief-internal conflict labeled |

No new upstream reads this session. **Registry: 158 contracts.**

## Module registry

Three physical files ship (the delivery clause, constant since pt-7). The brief's script list
lives as `LeadOS.EXPECTED_MODULES`, in load order, enforced by the boot guard and asserted by G10:

`util · events · store · engine · rules · correlate · conversations · decisions · execution ·
external · calibration · finIntel · health · playbooks · ui`

## Schema v12 — `MIGRATIONS['11>12']`

Backfills `unitEconomicsRefreshDays` **30** · `burnRateAlertMultiple` **18** ·
`grossMarginFloorPct` **60** · `cacPaybackMonthsCeiling` **18** · `fundraiseLeadTimeDays` **90**
(the last is the brief's labeled lead-time assumption, promoted to a setting so it is
leader-owned rather than hard-coded). A v3 store climbs to v12 through nine rungs.

## Financial intelligence — `LeadOS.finIntel`

Finance here is a **decision language**, not a reporting layer. Every benchmark prints its
source and the business model it assumes, and every figure carries:

> *figures are from YOUR OWN logged statements — LeadOS performs no accounting, reconciles
> nothing, and verifies no number.*

| Function | What it computes, and what it refuses to |
|---|---|
| `plHealth` | gross-margin / EBITDA / opex slopes, revenue growth, and **Rule of 40** — all gated behind **≥3 periods**, returning `insufficient data (n=2, need ≥3)` rather than a number |
| `unitHealth` | LTV:CAC with the division printed, CAC payback against your ceiling, per-segment CAC trend (≥3 points) |
| `runwayStatus` | runway, **days to action** = `(months × 30) − lead time`, and a burn multiple that **skips** when there is no ARR denominator instead of inventing one |
| `allocationReview` | bucket concentration **per single bucket**, allocation stability vs prior period, unreviewed capex count |
| `cohortCurves` | M1/M3/M6/M12 curves, best/worst cohort, and an LTV projection printing its formula verbatim |

**The conventions are labeled as conventions.** Rule of 40 is "a SaaS valuation heuristic
popularised by growth-stage investors — not a universal performance law, and meaningless for a
bootstrapped, services, or pre-revenue business." LTV:CAC ≥ 3 is "a convention, not a law —
a capital-light business can thrive at 2." The burn multiple "has no meaningful denominator for
a bootstrapped or profitable business." Cash is the one number flagged as **a fact**.

## Rules R103–R114

| Rule | Fires | sev / conf |
|---|---|---|
| **R103** | GM declining **and** below floor → 4 · below floor only → 3 · declining only → 2 | 4/3/2 / HIGH |
| **R104** | LTV:CAC < 3; < 1 → "you pay more to acquire than they ever return" | 3 → 5 / HIGH |
| **R105** | CAC payback > ceiling; > 2× ceiling | 3 → 4 / HIGH |
| **R106** | runway < `burnRateAlertMultiple`; < 6 months | 4 → 5 / HIGH |
| **R107** | burn multiple > 2; > 5 — **skips silently with no ARR data** | 3 → 4 / MEDIUM |
| **R108** | capex with stated ROI unreviewed > 90d; `underperforming` + 30d with no decision | 3 → 4 / HIGH |
| **R109** | M6 retention declining across ≥3 cohorts; latest M6 < 50% | 3 / MEDIUM · 4 / HIGH |
| **R110** | no `fin.unit.logged` in > refresh period; > 2× | 2 → 3 |
| **R111** | top bucket > 60% of budget; > 80% | 2 → 3 / HIGH |
| **R112** | Rule of 40 < 0; < −20 — **needs ≥3 P&L periods** | 3 → 4 / MEDIUM |
| **R113** | P&L period with no owner — **keyed per period**, not per event | 2 / HIGH |
| **R114** | scenario-planned decision with no `fin.scenario.modeled` within 14d | 3 / HIGH |

**R114 complements R67, it does not duplicate it** (G107): R67 asks *how this fails*, R114 asks
*what it costs when it does*. Distinct keys, distinct playbooks; clearing one leaves the other firing.

## New playbooks (5)

`pl-review` · `unit-economics-review` · `runway-review` · `capital-allocation` ·
`cohort-analysis` — all with **live** computation as you type (margins and Rule of 40; LTV:CAC
and payback; runway and days-to-action; concentration; LTV projection vs current CAC). Several
refuse to write: a P&L where `revenue − COGS ≠ gross profit`, allocations exceeding the budget,
a bucket with no rationale, a zero CAC, a non-positive burn rate.

## Views

`#/today` · `#/signals` · `#/insights` · `#/heatmap` · `#/benchmarks` · `#/conversations` ·
`#/org` · `#/decisions` · `#/execution` · `#/external` · **`#/finance`** (P&L table with margin
columns · Rule of 40 gauge · unit-economics panel · large runway counter with days-to-action ·
cohort retention grid · allocation %-bars · burn multiple · capex register) · `#/self` ·
`#/dossier` · `#/playbooks` · `#/health` · `#/data`.

## Health wall

**T1–T62** · **G1–G10 · G31–G113** · **claims C1–C21**.

> **ID map:** this brief numbered its checks T56–T60, but T56/T57 were taken in pt-16. They ship
> as **T58–T62** (brief T56→T58 … T60→T62). G103–G113 keep the brief's ids; **brief G114 is
> folded into G40**, which asserts all **114** rules fire from one seed.

## The non-negotiables, unchanged since pt-1

- trends need **≥3 measured points** — now including P&L slopes and cohort curves
- **missing fields skip rather than infer** — R107 skips rather than inventing a denominator
- **a count is never stated as certainty** — the arithmetic and the event type are printed
- **suppression is auditable and reversible** — with exactly one hard override: **R88
  non-compliance can never be suppressed**, and a refused attempt is printed on the finding
- every finding links the playbook that resolves it, **or prints why it has none**
- the README names exactly the files on disk — **no more, no fewer**
- the AI-SESSION-LOG §0 opens with a **claim-vs-inspection audit**
- **no JS runtime in the authoring environment — correctness by construction; the browser is the grader**

## Explicit non-claims

- **The browser is the grader.** Every count here is executable in `#/health`; none is observed.
- **LeadOS is not an accounting system.** It reconciles nothing, audits nothing, and verifies no
  figure. It will tell you your gross margin is falling because that is what your own numbers say.
- **Every financial benchmark is a convention with a context**, printed at the point of use:
  Rule of 40, LTV:CAC ≥ 3, burn multiple < 2, CAC payback ceiling, the margin floor, and the
  fundraise lead time are all settings you own.
- **Labeled interpretations** carried forward: CONF_FACTOR · suppression mechanics · ENG-fault
  embodiment · the contracts the briefs named but never specified (`playbook.completed`,
  `plan.checkin`, `decision.outcome`, `partner.reviewed`, `plan.created`) · R48 "same period" ·
  R50/R53/R97 roster proxy (**no `reportsTo` contract**) · conflict pairs from `mediation.held`
  alone · culture 2× weight · betweenness and bridges as approximations · R67/R114's
  scenario-count proxy for decision severity · R78's retro-completion inference · R90's symmetric
  bottom-quartile estimate · every text-match correlation.
- **Nothing here is clinical, legal, HR, accounting, or investment advice.**
- **Zero network calls, permanently.** Data leaves only when you export it.

## Ranked next

1. **`conflict.raised` / `conflict.resolved`** and **`retro.action.completed`** — the contracts
   whose absence still forces printed inferences (R61/G48, R78).
2. **`reportsTo` + 1:1 cadence contracts** — retires the roster proxy in R50/R53/R97.
3. **A `decision.severity` field** — would retire the scenario-count proxy shared by R67 and R114.
4. **Exact Brandes betweenness** — would retire R62's approximation caveat.
5. **`production-stop` interactive brief** (requested pt-9, never received).
6. **Byte-verify the unread upstream bodies**; reconcile registry counts honestly.
7. **Executive/board pack** — upstream's own queued #1, carried since pt-7 and still open.
