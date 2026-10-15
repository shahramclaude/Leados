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

## Strict doctrines (pt-4 part 9)

| Doctrine | How it is enforced structurally | Proof |
|---|---|---|
| Projections: last-writer-wins by append order; derived values re-computed per read, never persisted | entity maps keyed by id, `open*` rebuilt in `finalize()`, named projections are *aliases* of the folded objects | T25, G10, G4, G7 |
| Findings: stable keys (`R11:<riskId>`, `R12:<dealId>`) — second-run safe | `fin()` computes `key = <rule>:<scope‖refs[0]>`; ref-less findings declare an explicit `scope` (`R17:uptime:streak`, `R39:board`) so keys never depend on wording or dates | T28, G13 |
| Import gate rewires `*Id` fields automatically | `store.mergeInto()` plans an id map from `events.CREATES`, then **recursively walks every payload** — any data value matching a known incoming id is rewired, including inside arrays and nested objects the gate has no schema for | T30 |
| Dangling refs: skip + `_skipped.dangling*` | each event's declared `refs`/`refArrays` must resolve in (this store ∪ already-accepted imports), else the event is dropped and `_skipped.danglingDeals` / `danglingFinBudgets` / `danglingMilestones` … is incremented | T30 |
| Missing fields skip rather than infer | every rule returns early on an absent key date/value | T22, G16, G25, G29 |
| A count is never stated as certainty | every computed finding prints its arithmetic **and** names the event type it read | T29/G13 (empty `basis` fails), G18, G20, G24, G26 |
| Sev 3 ceiling for trend-based findings | `fin()` clamps any finding marked `trend: true` to 3 **and prints that it did**. Marked: R15 pattern, R17 streak, R19 window, R24 streak, R33 slope, R36 CPA. Exceptions named by the doctrine — safety (R28) and legal `fail` (R30) — read direct data and are never marked | T29, G13, G19, G28 |

> **Behaviour change recorded:** this ceiling supersedes part 7's G28 (*3 consecutive
> OKRs <0.4 → sev 4*) and part 3's R19 (*≥3 departures → sev 4*). Both now cap at
> sev 3 with the clamp disclosed in the basis line. Single-OKR scores stay sev 3/4
> because an explicit score is direct data, not a pattern. See `AI-SESSION-LOG.md` §35.

## Views (pt-4 part 6)

Left **rail nav** with hash routes — deep-linkable, no router library:

| Route | What it shows |
|---|---|
| `#/today` | Signal summary + domain **filter chips** (ALL · PEOPLE · FINANCE · SALES · OPS · STRATEGY · MFG · LEGAL · CS · EXEC) with per-domain counts in the subline, plus the operating rhythm |
| `#/signals` | All findings from R1–R40 with printed basis |
| `#/playbooks` | The 14 interactive playbooks |
| `#/finance` | Budget vs actuals (variance math) · KPI sparklines · forecast vs actuals · financial risk register sorted severity × likelihood |
| `#/sales` | Pipeline by stage (count + value) · quota attainment per person · cycle time from closed deals · open deal list |
| `#/ops` | Incident log with MTTR · SLA dashboard by metric · **text Gantt** milestone tracker |
| `#/strategy` | OKR tree (monospace progress bars) · roadmap by quarter · decision log |
| `#/domains` | Tabbed index — HR · Marketing · Mfg · Supply · Design · R&D · Legal · CS · Exec — each with that domain's active findings, metric sparklines, and capture |
| `#/roster` | People derived from the log + dossier: quota attainment history, performance ratings, PIP status, compensation history, open deals (sales roles) |
| `#/cadences` `#/decisions` `#/risks` | Governance surfaces |
| `#/data` | All settings incl. the five v4 cadences · **domain-filtered export** · storage inspector · projection inspector · event log with domain column |
| `#/health` | T/G suites + claim coverage |

**Quick capture is generated from the registry.** Each function view renders a
collapsible form per event type in its namespace, built directly from
`REGISTRY[type]` (required/optional, enums → select, booleans → checkbox,
arrays → one-per-line, numeric date-ish names → date picker, ranges shown
inline). A form therefore cannot drift from the contract: change the registry
and the form changes with it. Two object-array payloads (`strategy.okr.set`,
`exec.kpi.reviewed`) use a documented pipe protocol (`name | value | target |
trend`). T20 drives every generated form with synthetic input and fails if any
produced payload is rejected by the append gate.

**View state is sessionStorage only.** Route, domain filter, open domain tab,
selected person and export filter live under `leados:ui` in **sessionStorage** —
never in `leados:data`, never as events. G12 fails if a `leados:*` key other
than the store appears in localStorage, or if any `ui.*` event reaches the log.

**Roster is derived, never declared.** A person exists because events mention
them (`sales.quota.set`, `sales.deal.logged.ownerId`, `hr.*.personId`).
`rosterById` lists its own sources per person; nobody is invented.

**Export** filters events by domain (`engine.eventDomain`: explicit `domain`
field → namespace prefix → parent-entity lookup → honest `system` for
`store.initialized` / `settings.changed`) and downloads a local Blob. No network.

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

**T-suite — fixtures (29)**

| ID | Proves |
|---|---|
| T1–T5 | migration `3>4`: backfill set, exact defaults, idempotence, user values preserved, repair accounting |
| T6–T9 | cadence boundaries · fold purity · registry rejection · sales-cycle flag |
| T10–T11 | part-2 family folds · all 72 contracts |
| T12b · T13 | finding shape (`fin()` contract) · rules determinism |
| **T14** | **v3 store climbs to v4, all five settings backfilled** |
| **T15** | **`fin.risk.*` projection: open vs closed counts across every status** |
| **T16** | **`sales.deal.*` projection: pipeline math (open value after update, won/lost, actual)** |
| **T17** | **`strategy.okr.*` projection: KR latest-wins + closing score math** |
| **T18** | **`ops.incident.*` projection: MTTR computed = (2h + 6h) / 2** |
| **T19** | **`hr.attrition.logged` projection: counts by reason and by 60d window** |
| **T20** | **`supply.vendor.*` projection: review gap from reviewDate to last review** |
| **T20b** | **extended seed fires all 40 rules *and* reaches both severity bands of R13/R22/R30 plus the open-incident branch of R16** |
| T21–T24 | ≥3-point trend discipline · skip-not-infer · severity escalations · all 40 rules fire |
| T25–T27 | named projections · playbook contract · UI contract |
| **T28–T30** | **stable finding keys · sev-3 trend ceiling with named exceptions · import gate (recursive rewire, dangling counters)** |

**G-suite — live store (G1–G12) + goldens (G14–G30)**

G1 single key · G2 schema/lineage · G3 append-only + registry-valid · G4
whitelist · G5 v4 settings live · G6 repair accounting · G7 deterministic reads ·
G8 referential integrity · G9 live rules run · G10 live projections · G11 live
playbooks · G12 live UI state · **G13 live doctrines** (finding keys unique +
stable, trend ceiling held, every finding shows its math).

| Golden | Boundary pinned |
|---|---|
| **G14** R11 | past due fires sev5 HIGH · resolved quiets · **update before reviewDate does not count** |
| **G15** R12 | closeDate+1 → sev3 · update after close quiets · 31d past → sev4 |
| **G16** R13 | <70% sev3 · <50% sev4 · exactly 70% and 100% quiet · missing actuals skip |
| **G17** R14 | exactly 21d quiet · 22d sev2 · 43d sev3 · closed OKR quiet regardless |
| **G18** R16 | sev4 resolved 3h quiet · 10h sev4 with MTTR math printed · unresolved 5h fires |
| **G19** R19 | 1 quiet · 2 sev3 · 3 sev4 · voluntary/involuntary breakdown printed |
| **G20** R22 | 14% quiet · 16% sev3 · 31% sev4 · underspend fires with direction printed |
| **G21** R28 | single quiet · 2 in 30d sev4 · any sev5 immediate · **sev4 alone not immediate** |
| **G22** R30 | pass quiet · finding+31d sev4 · fail sev5 immediately · cadence miss sev2 |
| **G23** R32 | 31d quiet · 29d sev3 · 6d sev4 · expired + still active sev5 |
| **G24** R34 | 4.9% quiet · 5.1% sev3 · 10.1% sev4 · **MRR >15% sev4 regardless of count** |
| **G25** R37 | reviewDate+1 fires · result before or exactly on reviewDate quiet |
| **G26** R38 | 29 quiet · 31 sev3 · 62 sev4 · resolved items leave the total · math printed |
| **G27** R39 | exactly `boardCadenceDays` quiet · +1d fires · never + aged log sev2 |
| **G28** R15 | 0.41 quiet · 0.39 sev3 · score 0 sev4 · **3 consecutive <0.4 → sev4** |
| **G29** R25 | risk 3 skipped · risk 4 past due sev3 · risk 5 sev4 · reviewed after due quiets |
| **G30** | `buildSeed()` fires all 40 rules, every finding shape-valid |

The **boot gate runs G1–G13 only**. Goldens run in the full suite so a rule-logic
regression is loud in Health without walling a leader off from their own data.

### The seed

`health.buildSeed()` is one deterministic fixture log pinned to `T0`, read at
`today = T0 + 100d`. It drives T12b, T13, T20b, T23, T24 and G30 — coverage and
shape can therefore never drift apart. It exercises **all 40 rules**, and after
part 8 it reaches both severity bands of R13 (60% → sev 3, 40% → sev 4), R22
(18% overspend → sev 3, 40% underspend → sev 4) and R30 (`finding`+35d → sev 4,
`fail` → sev 5), plus R16's *open-past-threshold* branch alongside its resolved
MTTR branch, and R34 at the exact 5.1% boundary.

- **Claims C1–C29** in the Health tab: each shows the checks that authorize it;
  a failing check marks the claim *unproven*.

## Files

| File | Role |
|---|---|
| `index.html` | Shell: rail nav + view host; seven scripts in doctrinal order; authority-wall overlay |
| `css/app.css` | Hand-rolled design system incl. severity/confidence language |
| `js/events.js` | Event registry (88 types) + append-gate validator with refs/refArrays |
| `js/store.js` | Persistence wall: single key, schema v4, migrations with repair counting, `mergeInto()` import gate |
| `js/engine.js` | `project()` fold, named projections incl. `rosterById`, `eventDomain()`, pure selectors |
| `js/playbooks.js` | 15 domain playbooks + 14 interactive playbooks; emits event specs only |
| `js/rules.js` | R1–R40: pure `(P, today) → findings[]` rules engine |
| `js/health.js` | Authority wall: T1–T30 (+T12b, T20b), G1–G13 + goldens G14–G30, claims C1–C29 |
| `js/ui.js` | Rail nav, hash routes, 14 views, registry-driven quick capture; every action is an event append |
| `README.md` | This file |
| `AI-SESSION-LOG.md` | Session log; §0 is the claim-vs-inspection audit |

## Roadmap (pt-4 remaining parts)

- **Part 4 — Executive/board pack:** one-click board narrative compiled from the
  log (feeds R39/R40 discipline), plus module surfaces for finance and people.
