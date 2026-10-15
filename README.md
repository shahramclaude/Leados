# LeadOS pt-4 — Universal Leadership OS

A universal leadership and management operating system covering every domain where
leadership and management decisions are made: engineering, finance, sales, product
strategy, operations, people/HR, marketing, manufacturing/production, design, R&D,
legal/compliance, customer success, supply chain, executive/board, and business
development — 15 domains, **88 event types under contract, 40 pure rules,
15 domain playbooks + 14 interactive playbooks**, one operating rhythm.

**Run it:** open `index.html` in any modern browser. No server, no build step, no
framework, no network, no CDN. Everything runs locally against one localStorage key.

---

## Architecture doctrine (non-negotiable)

| Doctrine | Enforcement |
|---|---|
| Vanilla JS only — no framework, no build step, no network, no CDN | classic `<script>` tags; registry validation; no external references anywhere |
| Exactly one localStorage key: `leados:data` | G1 inspects `localStorage` keys |
| Lineage `pt`; schema v4 | `store.js` constants; G2 verifies |
| Append-only event store | seq/id/time integrity checked by G3; no update/delete API exists |
| Nothing derived is ever persisted — `project()` runs per read | root/meta whitelists (G4); projection purity (G7, T7, T13) |
| `health.js` is the authority wall | boot gate runs G-suite; failure halts rendering; every claim maps to T/G checks |
| AI-SESSION-LOG §0 opens with a claim-vs-inspection audit | see `AI-SESSION-LOG.md` |

## Schema v4 — `MIGRATIONS['3>4']`

Backfills five settings as repair events (leader values never overwritten):
`salesCycleDays` 90, `revenueReviewCadenceDays` 30, `opsReviewCadenceDays` 14,
`boardCadenceDays` 90, `complianceAuditCadenceDays` 180. A **repair** is any write
a migration performs beyond bumping `schemaVersion`; repairs accumulate per
migration id in `meta.migrationRepairs` and are reconstructible from the log
(T5/G6). `3>4` is idempotent (T3).

## Rules engine (pt-4 part 3) — R1–R40

Every rule is a pure function `(P, today) → findings[]`. `P` is a projection from
`engine.project()`; `today` is injected — no rule reads the clock or the disk.
The **Signals** tab renders `rules.run(P, now)` per read; findings are never
persisted.

Finding shape (`fin()` contract, enforced by T12/G9): `{ rule, sev 1–5,
conf HIGH|MEDIUM|LOW, title, basis[], refs[], play | playNone }`. Every finding
carries a playbook id in `.play`, or `.playNone` prints why it has none.

Discipline (tested by T14/T15/T16):
- **≥ 3 measured points** before any trend claim (explicit spec exceptions: R20
  and R33 slopes, marked in code).
- **Missing fields skip, never infer** (e.g. quota without actuals, contract
  without expiryDate, KPI without target → silent).
- **sev 3 ceiling for trend-derived findings** unless the spec escalates with
  printed basis (R15 pattern → 5; R24 systematic over-optimism → 4).
- **The math is printed.** Every finding that computes shows the computation in
  `basis` so a skeptical leader can check it by hand.

Rule map: R1–R4 cadence misses · R5–R6 decision staleness (+ sales cycle) ·
R7–R10 heritage risk/KR/task/objective aging · R11 fin risk review · R12–R13
pipeline & quota · R14–R15 OKRs · R16–R18 MTTR/SLA/milestones · R19–R21 people
signals · R22–R24 budget/KPI/forecast · R25–R26 supply exposure · R27–R29
production · R30–R32 legal & contracts · R33–R35 customer health · R36 marketing
efficiency · R37–R38 R&D discipline · R39–R40 executive rhythm.

Lineage note: R1–R10 predated the attached codebase and were not inspectable;
they are reconstructed and pinned to the settings the pt-1 selectors already
prove — full disclosure in `AI-SESSION-LOG.md` §10.

## Interactive playbooks (pt-4 part 5)

Fourteen playbooks turn a finding into an append. Each declares:

```
candidates(P)       -> eligible targets drawn from the log
prefill(ctx, P)     -> { ok, title, facts[], suggest{}, missing[] }   (pure)
fields(pre)         -> [{ name, label, type, value?, recommended?, source?, hint? }]
submit(v, ctx, pre) -> [{ type, payload }]   event specs only — never writes
```

| Playbook | Rules | Appends |
|---|---|---|
| `risk-review` | R11 R31 R32 | `fin.risk.updated` / `legal.contract.updated` / `note.added` + dated `task.created` |
| `deal-review` | R12 | `sales.deal.updated` (+ `sales.deal.closed`) |
| `quota-review` | R13 | `fin.kpi.logged` + `note.added` |
| `okr-checkin` | R14 R15 | `strategy.okr.progress` per KR (+ `strategy.okr.closed`) |
| `incident-review` | R16 R17 | `ops.incident.resolved` |
| `attrition-review` | R19 | `note.added` (+ `hr.engagement.logged`) |
| `budget-review` | R22 R23 R24 | `fin.kpi.logged` + `note.added` |
| `vendor-review` | R25 R26 | `supply.vendor.reviewed` |
| `safety-review` | R28 | `mfg.safety.incident` with mandatory `corrective_actions[]` |
| `compliance-review` | R30 | `legal.compliance.check` + `note.added` |
| `churn-review` | R33 R34 R35 | `cs.churn.logged` + `note.added` |
| `tech-debt-sprint` | R38 | `rd.tech.debt.resolved` per selected item + `note.added` |
| `board-prep` | R39 R40 | `exec.board.meeting` + `exec.kpi.reviewed` |
| `experiment-debrief` | R37 | `rd.experiment.result` |

**No playbook fakes certainty.** Every prefilled value is rendered with a
`recommended` chip and a `source` line naming where it came from ("last logged
value", "computed from actual ÷ target"). Everything the log does not know is
listed under a **not in the log** banner and left blank — T19 and G11 fail the
build if a recommended field ships without a source. Running a playbook also
appends `playbook.applied` so the intervention itself is on the record.

`note.added` (`{id, domain, text, refId?, context?}`) was added to the registry
in this part — the spec required it and it did not exist. That brings the
registry to 88 types.

## Named projections (pt-4 part 4)

`engine.project(events)` returns **46 named projections** — the 40 required by
the pt-4 part-4 list plus 6 siblings for symmetry (`quotaById`, `roadmapById`,
`escalationById`, `crisisById`, `openCrises`, `openContracts`). The **Event log**
tab renders a live inspector of every one with its current size.

Three guarantees, each mechanically inspected:

| Guarantee | How it is structural (not merely tested) |
|---|---|
| **append-order wins** | entity maps are keyed by id and every handler writes last-value-wins; index maps (`kpiByMetric`, `slaByMetric`, `complianceByFramework`, `dealsByPerson`, `quotaByPerson`) append in log order |
| **nothing derived persists** | projections exist only in the returned object; G10 asserts none of their keys appear in the stored payload, G4 whitelists the payload shape |
| **stale state impossible by construction** | `*ById` projections are **aliases — the same object references the fold mutates**, not copies, and every `open*` set is recomputed in `finalize()` at the end of each fold. There is no path that updates an entity without the projection seeing it, because there is only one object. T18/G10 assert reference identity directly. |

`open*` means *the log has not recorded the closing event* — never "overdue"
(aging is a rule's job, not a projection's). Two definitions worth stating:
`openBudgets` = budgets with no actuals logged (unreconciled); `openVendors` =
vendors never reviewed. `legal.risk.logged` carries no `id` in the spec, so
`legalRiskById` is keyed by the originating event id — unique and append-ordered
by construction (G3).

## Event registry (pt-4 part 2)

87 types under append-gate contract; the validator enforces required fields,
whitelists, enums, ranges, booleans, arrays, non-empty arrays, and per-type
custom rules. Family table and field-level notes: see `AI-SESSION-LOG.md` §7 and
the registry source. References (`refs`/`refArrays`) are inspected by **G8**.

## Health — the authority wall

- **T-suite (fixtures):** T1–T5 migration `3>4` · T6 cadences · T7 fold purity ·
  T8–T9 core contracts · T10–T11 part-2 families · T12 finding shape ·
  T13 rules determinism · T14 ≥3-point trend discipline · T15 skip-not-infer ·
  T16 severity escalations · T17 all 40 rules fired · T18 named projections
  (presence, alias identity, open-set exclusion, append-order wins) · **T19**
  playbook contract (14 present, prefill pure, submit registry-valid).
- **G-suite (live store):** G1 single key · G2 schema/lineage · G3 append-only +
  registry-valid · G4 whitelist · G5 v4 settings live · G6 repair accounting ·
  G7 deterministic reads · G8 referential integrity · G9 live rules run ·
  G10 live projections (present, alias-identical, zero leaked to storage) ·
  **G11** live playbooks (rule coverage, labeled recommendations, no mutation).
- **Claims C1–C20** in the Health tab: each shows the checks that authorize it;
  a failing check marks the claim *unproven*.

## Files

| File | Role |
|---|---|
| `index.html` | Shell; seven scripts in doctrinal order; authority-wall overlay |
| `css/app.css` | Hand-rolled design system incl. severity/confidence language |
| `js/events.js` | Event registry (88 types) + append-gate validator with refs/refArrays |
| `js/store.js` | Persistence wall: single key, schema v4, migrations with repair counting |
| `js/engine.js` | `project()` fold, 46 named projections, pure selectors, `knownIds()` |
| `js/playbooks.js` | 15 domain playbooks + 14 interactive playbooks; emits event specs only |
| `js/rules.js` | R1–R40: pure `(P, today) → findings[]` rules engine |
| `js/health.js` | Authority wall: T1–T19, G1–G11, claim coverage C1–C20 |
| `js/ui.js` | Vanilla renderer incl. Signals + projection inspector; every action is an event append |
| `README.md` | This file |
| `AI-SESSION-LOG.md` | Session log; §0 is the claim-vs-inspection audit |

## Roadmap (pt-4 remaining parts)

- **Part 4 — Executive/board pack:** one-click board narrative compiled from the
  log (feeds R39/R40 discipline), plus module surfaces for finance and people.
