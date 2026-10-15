# LeadOS pt-4 — Universal Leadership OS

A universal leadership and management operating system covering every domain where
leadership and management decisions are made: engineering, finance, sales, product
strategy, operations, people/HR, marketing, manufacturing/production, design, R&D,
legal/compliance, customer success, supply chain, executive/board, and business
development — 15 domains, **88 event types under contract, 40 pure rules,
15 domain playbooks + 14 interactive playbooks**, one operating rhythm.

**Run it:** open `index.html` in any modern browser. No server, no build step, no
framework, no network, no CDN. Everything runs locally against one localStorage key.

**Verify it:** open `#/health` in the browser — the authoritative grader. A headless
run of the same modules and the same suites is also possible since part 13:
`node scripts/headless-verify.mjs` (the harness is a verification aid, not an 11th
shipped file; the application never loads it).

> **Part 13 (README accuracy) re-issue.** The file table below names exactly the
> 10 files delivered; the rules section enumerates all forty rules at the density
> R1–R10 were always described at; the gap list and the non-claims are current.
> Every check count this file states was **runtime-executed, not merely declared** —
> headless under Node + jsdom, recorded in `AI-SESSION-LOG.md` §52 with the two
> defects the execution exposed. Where this file and `#/health` ever disagree,
> `#/health` in your browser wins.

> **Part 14 (delivery integrity) re-issue.** The 10 files named below were
> re-issued from upstream `main @ 12ad31d` — where they sat flat, scattered
> among a growing npm scaffold, unbootable as shipped — into the `css/`+`js/`
> structure the docs and `index.html` have always named. Every file was read in
> full this session; the battery was **runtime-executed again**, against both
> the source tree and a fresh `dist/` build — identical green lines — recorded
> in `AI-SESSION-LOG.md` §55–§61. No rule, check, golden or playbook body was
> touched in this part.

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

Finding shape (`fin()` contract, enforced by T12b/G9): `{ rule, sev 1–5,
conf HIGH|MEDIUM|LOW, title, basis[], refs[], play | playNone }`. Every finding
carries a playbook id in `.play`, or `.playNone` prints why it has none. `fin()`
**throws** on a finding missing identity fields — a shape violation fails loudly,
never silently (§52 records the defect this produce once exposed, and its fix).

Discipline (tested by T21/T22/T23, goldens G14–G29):
- **≥ 3 measured points** before any trend claim (explicit spec exceptions: R20
  and R33 slopes, marked in code).
- **Missing fields skip, never infer** (e.g. quota without actuals, contract
  without expiryDate, KPI without target → silent).
- **sev 3 ceiling for trend-derived findings** unless the spec escalates with
  printed basis; the clamp is disclosed in the finding's own `basis` line. The
  named exceptions — safety (R28) and legal `fail` (R30) — read direct data and
  are never marked.
- **The math is printed.** Every finding that computes shows the computation in
  `basis` so a skeptical leader can check it by hand.

Lineage note: R1–R10 predated the attached codebase and were not inspectable;
they are reconstructed and pinned to the settings the pt-1 selectors already
prove — full disclosure in `AI-SESSION-LOG.md` §10.

## The forty rules

Each rule below is stated the way the heritage ten were always stated: trigger
with exact thresholds, severity behavior, and the boundary or skip that keeps it
honest. `set.*` = the v4 settings (`revenueReviewCadenceDays` 30 ·
`opsReviewCadenceDays` 14 · `boardCadenceDays` 90 · `complianceAuditCadenceDays`
180 · `salesCycleDays` 90 · `riskReviewCadenceDays` · `krCheckInCadenceDays` ·
`decisionMaxOpenDays`).

**Heritage cluster (reconstructed; §10).** **R1** revenue review cadence —
strictly overdue → sev 3 with interval/last/due printed; never run and the log
older than the interval → sev 2 · **R2** ops rhythm, same shape (14d) · **R3**
board cadence (90d) · **R4** compliance audit cadence (180d) · **R5** decision
open past `decisionMaxOpenDays` → sev 3, owner and domain printed, per-domain
playbook · **R6** sales-domain decision open past one full `salesCycleDays` →
sev 3; past 1.5× a cycle → sev 4 · **R7** register risk unreviewed past
`riskReviewCadenceDays` → sev 2; past 3× the cycle → sev 3; prints
score = L×I · **R8** KR of an active objective silent past
`krCheckInCadenceDays` (since its latest progress log, else the objective's
creation) → sev 2 · **R9** task past due → sev 2; >14d late → sev 3
· **R10** active objective older than 14d with zero key results → sev 2,
"unmeasurable".

**Finance.** **R11** `fin.risk` past its `reviewDate` →
sev = clamp(severity + (likelihood ≥ 4 ? 1 : 0), 3, 5) with the math printed;
cleared only by a `fin.risk.updated` on/after the reviewDate with status
mitigated/accepted/closed — an update *before* the date does not count (G14)
· **R12** open deal with `closeDate` past and untouched since `closeDate` →
sev 3; >30d past → sev 4; a later update quiets it (G15) · **R13** latest
quota actuals ÷ target <70% → sev 3, <50% → sev 4; exactly 70% (and 100%) quiet;
no actuals or no target → skip (G16) · **R22** budget
|actual − amount| ÷ amount >15% → sev 3, >30% → sev 4, scoped per budget ×
period; underspend fires on the same thresholds with the direction printed
(G20) · **R23** finance KPI latest value ÷ target <85% → sev 3, <70% → sev 4;
when ≥3 measured points show a declining slope the slope is printed and conf
drops to MEDIUM; KPI without target → skip · **R24** forecast for a period with
reconciled actuals deviating >20% → sev 3 with direction named
(over-optimistic / over-conservative); ≥3 consecutive over-forecasts in the
same direction → a *systematic over-optimism* trend finding, capped at sev 3
with the clamp printed; periods without actuals → skip.

**Strategy.** **R14** OKR with zero progress events >21d after being set →
sev 2; >42d → sev 3; exactly 21d quiet; closed OKR quiet regardless (G17)
· **R15** closed OKR scored <0.4 → sev 3; score 0 → sev 4 (explicit score is
direct data, not a pattern); ≥3 consecutive OKRs <0.4 adds a *pattern* finding
scoped `R15:pattern` — capped at sev 3 by the trend ceiling, clamp disclosed
(G28) · **R18** milestone `at-risk`/`blocked` → sev 3; past its `dueDate` →
sev 4; `done` quiet; dependencies printed.

**Operations.** **R16** incident resolved slower than its threshold (sev ≥ 4:
4h · sev 3: 24h · else 72h) → finding at sev = clamp(incident severity, 3, 5)
with MTTR math printed; an incident still *open* past threshold fires too
(G18) · **R17** SLA missed (`met=false`) → sev 3 per metric × period with the
gap math; ≥3 consecutive misses on one metric adds a streak finding, trend-capped
at sev 3, streak printed · **R29** equipment `down` >4h → sev 4; `degraded`
>24h → sev 3; age measured from the latest status entry, note printed.

**People.** **R19** ≥2 departures inside a rolling 60d window → sev 3 MEDIUM
with the voluntary/involuntary/restructure breakdown; ≥3 suggests sev 4 but the
trend ceiling clamps to 3 and says so (G19) · **R20** latest engagement score
<6.5/10 → sev 3, <5 → sev 4; a declining 2-point slope is a named spec
exception — printed, and drops conf to MEDIUM; with ≥3 surveys, silence beyond
2× the median interval → a separate sev 2 cadence finding · **R21** PIP past
its declared `duration_days` with no result → sev 4; "a PIP is a commitment,
not a filing".

**Supply chain.** **R25** vendor with `risk_level` ≥ 4 past its `reviewDate`
with no review on/after that date → sev 3; risk 5 → sev 4; risk < 4 skipped
(G29) · **R26** supply disruption with severity ≥ 4 sitting >7d with neither a
vendor review nor a mitigation acknowledgement since → sev 4.

**Manufacturing.** **R27** yield <90% on a line → sev 3; <80% → sev 4; ≥3
measured points with a declining slope printed, conf drops to MEDIUM · **R28**
any sev-5 safety incident → sev 5 immediately — direct data, never capped;
≥2 safety incidents in 30d → sev 4; safety is the named exception to the trend
ceiling (G21).

**Legal & compliance.** **R30** latest check for a framework `fail` → sev 5
immediately (direct data, exempt from the ceiling); latest `finding` unpassed
for >30d → sev 4; no check for longer than `complianceAuditCadenceDays` (or
none ever and the log older) → sev 2 cadence finding (G22) · **R31** legal risk
past its `dueDate` → sev 4; explicitly unowned (`ownerId` null — an explicit
null is data) → sev 3 · **R32** contract expiring ≤30d → sev 3; ≤7d → sev 4;
past expiry with status still `active` → sev 5; `renewed`/`terminated` quiet;
no `expiryDate` → skip (G23).

**Customer success.** **R33** latest NPS < 0 → sev 4 (direct measurement);
declining slope landing below 30 → sev 3 MEDIUM (spec slope exception); latest
NPS beyond 90d → sev 2; never-logged silent · **R34** period churn >5% → sev 3, >10%
→ sev 4 with the division printed; MRR loss >15% → sev 4 *regardless of account
count*; `mrr_lost` without `mrr_total` → the escalation is named as **not
inferred** (G24) · **R35** sev-5 escalation unresolved >4h → sev 5; any open
escalation past its `dueDate` → inherited severity clamped 3–5.

**Marketing.** **R36** campaign CPA >2× the mean of its three prior measured
campaigns → sev 3 MEDIUM, the arithmetic and its basis campaigns printed
(trend); campaign live >14d with zero results → sev 2.

**R&D.** **R37** experiment past `reviewDate` with no result → sev 3; a result
logged on or before the date quiets it (G25) · **R38** tech-debt mass —
Σ severity × effort over unresolved items inside 90d — >30 → sev 3, >60 →
sev 4, MEDIUM, the sum printed term by term; resolved items leave the total
(G26).

**Executive.** **R39** board meeting gap >`boardCadenceDays` → sev 3; none ever
and the log older than the cadence → sev 2; exactly the cadence quiet, quorum
state printed (G27) · **R40** executive KPI review gap >`revenueReviewCadenceDays`
→ sev 2; >2× → sev 3; silence only fires once a review exists (no invented
expectation on an empty log).

Non-negotiables (carried): trends need ≥3 measured points · missing fields skip
rather than infer · a count is never stated as certainty — the arithmetic and
the event type it read are printed · suppression is auditable and reversible ·
every finding links the playbook that resolves it, or prints why it has none.

## Strict doctrines (pt-4 part 9)

| Doctrine | How it is enforced structurally | Proof |
|---|---|---|
| Projections: last-writer-wins by append order; derived values re-computed per read, never persisted | entity maps keyed by id, `open*` rebuilt in `finalize()`, named projections are *aliases* of the folded objects | T25, G10, G4, G7 |
| Findings: stable keys (`R11:<riskId>`, `R12:<dealId>`) — second-run safe | `fin()` computes `key = <rule>:<scope‖refs[0]>`; ref-less findings declare an explicit `scope` (`R17:uptime:streak`, `R39:board`) so keys never depend on wording or dates | T28, G13 |
| Import gate rewires `*Id` fields automatically | `store.mergeInto()` plans an id map from `events.CREATES`, then **recursively walks every payload** — any data value matching a known incoming id is rewired, including inside arrays and nested objects the gate has no schema for | T30 |
| Dangling refs: skip + `_skipped.dangling*` | each event's declared `refs`/`refArrays` must resolve in (this store ∪ already-accepted imports), else the event is dropped and `_skipped.danglingDeals` / `danglingFinBudgets` / `danglingMilestones` … is incremented | T30 |
| Missing fields skip rather than infer | every rule returns early on an absent key date/value | T22, G16, G25, G29 |
| A count is never stated as certainty | every computed finding prints its arithmetic **and** names the event type it read | T29/G13 (empty `basis` fails), G18, G20, G24, G26 |
| Sev 3 ceiling for trend-based findings | `fin()` clamps any finding marked `trend: true` to 3 **and prints that it did**. Marked: R15 pattern, R17 streak, R19 window, R24 streak, R33 slope, R36 CPA. Exceptions named by the doctrine — safety (R28) and legal fail (R30) — read direct data and are never marked | T29, G13, G19, G28 |

> **Behaviour change recorded:** this ceiling supersedes part 7's G28 (*3 consecutive
> OKRs <0.4 → sev 4*) and part 3's R19 (*≥3 departures → sev 4*). Both now cap at
> sev 3 with the clamp disclosed in the basis line — and the goldens themselves
> assert the capped values (G19, G28). Single-OKR scores stay sev 3/4 because an
> explicit score is direct data, not a pattern. See `AI-SESSION-LOG.md` §35.

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
trend`). **T27** drives every generated form with synthetic input and fails if
any produced payload is rejected by the append gate — including the one
cross-field contract in the registry (`strategy.decision`: `chosen` must be one
of `alternatives`), which the synthetic driver now honors explicitly (§52).

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
listed under a **not in the log** banner and left blank — T26 and G11 fail the
build if a recommended field ships without a source. Running a playbook also
appends `playbook.applied` so the intervention itself is on the record.

`note.added` (`{id, domain, text, refId?, context?}`) was added to the registry
in part 5 — the spec required it and it did not exist. That brings the registry
to **88 types** (15 core + 72 part-2 families + 1), counted at runtime in part 13.

## Named projections (pt-4 part 4)

`engine.project(events)` returns **50 named projections** (counted at runtime in
part 13): the 40 required by the pt-4 part-4 list, the 6 documented symmetry
siblings (`quotaById`, `roadmapById`, `escalationById`, `crisisById`,
`openCrises`, `openContracts`), the three added with `note.added` in part 5
(`noteById`, `noteLog`, `notesByRef`), and `rosterById` from part 6. The
**Event log** tab renders a live inspector of every one with its current size.

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

88 types under append-gate contract; the validator enforces required fields,
whitelists, enums, ranges, booleans, arrays, non-empty arrays, and per-type
custom rules. Family table and field-level notes: see `AI-SESSION-LOG.md` §7 and
the registry source. References (`refs`/`refArrays`) are inspected by **G8**.

## Health — the authority wall

### Verification status

**Part 13 executed the battery headlessly.** Every check count in this section
is a runtime measurement, not a declaration: Node v20 + jsdom, six modules
loaded in the doctrinal `<script>` order, the full T-suite, live G-suite,
goldens, claims, boot gate, and a real-DOM UI boot — all recorded with output
in `AI-SESSION-LOG.md` §52. Result: **T 32/32 · G 30/30 · claims 31/31 proven ·
boot gate green · shipped-seed battery produces 57 findings with all 40 rules
firing.** The execution exposed two latent defects (a blank rule id crashing
R1–R4 through `fin()`, a 90-day boundary fixture in T19) plus one driver gap
(T27); all three are fixed and their fixes are re-proven by the same suites.

**Part 14 re-executed the same battery twice**: once against the re-issued
source tree and once against a fresh `dist/` assembled by `vite build` (T31's
inline-stylesheet fingerprint branch engaged, as designed in part 13). Both
runs: **T 32/32 · G 30/30 · claims 31/31 proven · boot gate green · exit 0** —
output recorded in `AI-SESSION-LOG.md` §58.

The authority hierarchy is unchanged: **`#/health` in your browser supersedes
this record.** jsdom is not a browser — layout, paint, focus and real event
timing were not observed. Parts 1–12 authored under the *no runtime
available* doctrine (log, Part 12); their claims should be read with that
status. This section replaces that doctrine for the delivered tree.

**T-suite — fixtures (32 checks)**

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
| **T19** | **`hr.attrition.logged` projection: counts by reason and by 60d/90d windows (boundary fixed in part 13 — the day-90 edge is now strictly outside)** |
| **T20** | **`supply.vendor.*` projection: review gap from reviewDate to last review** |
| **T20b** | **extended seed fires all 40 rules *and* reaches both severity bands of R13/R22/R30 plus the open-incident branch of R16** |
| T21–T24 | ≥3-point trend discipline · skip-not-infer · severity escalations · all 40 rules fire |
| T25–T27 | named projections · playbook contract · UI contract (routes ↔ views, generated-form payloads, roster derivation) |
| **T28–T30** | **stable finding keys · sev-3 trend ceiling with named exceptions · import gate (recursive rewire, dangling counters)** |
| **T31** | **shipped manifest: README's file table == the assets `index.html` actually loads; all local; every module registers** |

**G-suite — live store (G1–G13) + goldens (G14–G30) — 30 checks**

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
| **G19** R19 | 1 quiet · 2 in 60d sev3 MEDIUM · **3 in 60d stays sev3 — the part-9 trend ceiling clamps from 4 and the clamp is disclosed** · voluntary/involuntary breakdown printed |
| **G20** R22 | 14% quiet · 16% sev3 · 31% sev4 · underspend fires with direction printed |
| **G21** R28 | single quiet · 2 in 30d sev4 · any sev5 immediate · **sev4 alone not immediate** |
| **G22** R30 | pass quiet · finding+31d sev4 · fail sev5 immediately · cadence miss sev2 |
| **G23** R32 | 31d quiet · 29d sev3 · 6d sev4 · expired + still active sev5 |
| **G24** R34 | 4.9% quiet · 5.1% sev3 · 10.1% sev4 · **MRR >15% sev4 regardless of count** |
| **G25** R37 | reviewDate+1 fires · result before or exactly on reviewDate quiet |
| **G26** R38 | 29 quiet · 31 sev3 · 62 sev4 · resolved items leave the total · math printed |
| **G27** R39 | exactly `boardCadenceDays` quiet · +1d fires · never + aged log sev2 |
| **G28** R15 | 0.41 quiet · 0.39 sev3 · score 0 sev4 (direct data) · **3 consecutive <0.4 → pattern finding capped at sev3 by the part-9 ceiling, disclosed** |
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
MTTR branch, and R34 at the exact 5.1% boundary. Part 13 ran it: 57 findings,
all 40 rule ids present (§52).

- **Claims C1–C31** in the Health tab: each shows the checks that authorize it;
  a failing check marks the claim *unproven*. In the part-13 headless run all
  31 were proven.

## Files

Exactly these **10 files** ship — no more, no fewer. The structure below is the
delivery: `index.html` at the root, the stylesheet under `css/`, the six
modules under `js/`, the two documents at the root. **T31 enforces this table
against the live DOM**: `index.html` must load exactly the 7 web assets listed
here, in this order, all local. Line counts were measured by reading each file
at part-13 close and the two doc rows re-measured at part-14 close (§59.4);
byte counts are deliberately **not** stated — see §0.3 for why, and run
`wc -l index.html css/app.css js/*.js *.md` to verify independently.

| File | Lines | Role |
|---|---|---|
| `index.html` | 53 | Shell: rail nav + view host; six scripts in doctrinal order; authority-wall overlay |
| `css/app.css` | 361 | Hand-rolled design system incl. severity/confidence language; `/*! sentinel */` provenance line for raw serves |
| `js/events.js` | 231 | Event registry (88 types), `CREATES` map, append-gate validator with refs/refArrays |
| `js/store.js` | 338 | Persistence wall: single key, schema v4, migrations with repair counting, `mergeInto()` import gate |
| `js/engine.js` | 914 | `project()` fold (50 named projections), `eventDomain()`, selectors — **and the R1–R40 rules engine** (second IIFE, `LeadOS.rules`) |
| `js/playbooks.js` | 475 | 15 domain playbooks + 14 interactive playbooks; emits event specs only |
| `js/health.js` | 1571 | Authority wall: T1–T31 (+T12b, T20b), G1–G13 + goldens G14–G30, claims C1–C31, `MANIFEST`, `FIXED` |
| `js/ui.js` | 947 | Rail nav, hash routes, 14 views, registry-driven quick capture; every action is an event append |
| `README.md` | 556 | This file |
| `AI-SESSION-LOG.md` | 902 | Session log; §0 is the opening audit; §55–§61 the part-14 delivery entry |

Totals: **6348 lines** across 10 files. The two doc rows are exact post-patch
figures, digit-patched in place at part-14 close so the counts survive their own
statement (§59.4); the eight code rows are unchanged since part 13.

Anything else in a working checkout is **not LeadOS**: `scripts/` (the part-13
headless verification harness), `package.json` / `vite.config.ts` and friends
(delivery tooling), the `public/` symlink mirror that lets `vite build`
assemble `dist/` as exactly this 10-file bundle (re-verified headlessly against
`dist/` itself: T 32/32 · G 30/30 · claims 31/31 · boot gate green), and any
historical debris in the upstream repo (an npm scaffold, `rules.js`' former
tombstone, stale patch docs — §50 inventoried them). The app loads exactly the
7 web assets above; T31 fails on anything more or less.

> **`js/rules.js` is gone, and stays forbidden.** The rules engine was merged
> into `js/engine.js` in part 11; part 13 finally deleted the 16-line tombstone
> the part-11 tooling could not (§46 had prescribed `rm js/rules.js`; this
> delivery simply omits the file). `health.UNLOADED` keeps the guard: T31
> **fails** if any script tag references the path again.

### Fixture epoch

All date-pinned fixtures — the entire T-suite, `buildSeed()`, and every golden
G14–G30 — use one constant, declared at the top of `health.js` and labeled
plainly:

```
FIXED = 2026-02-16T12:00:00.000Z   (1771243200000 ms)
```

Goldens express day offsets relative to `FIXED`, so they are reproducible
forever and never call `Date.now()`. G1–G13 are the exception by design: they
are live-store inspections and must read the real clock and the real
`localStorage`.

## What a new multi-team leader still needs (updated, part 13)

Delivered in pt-4 to date: 15 domains under one contract, 40 rules with printed
arithmetic, 14 finding-to-append playbooks, the import gate, goldens on every
fire/quiet boundary, and — in this part — a README that verifies, plus a
headless way to execute the whole battery outside a browser. Ranked next:

1. **Executive/board pack** (queued): a one-click board narrative compiled from
   the log — R39/R40 guard the rhythm and `board-prep` appends the meeting, but
   no document is produced yet. This closes pt-4.
2. **1:1 and skip-level cadences with verified reporting lines.** The people
   domain covers headcount, offers, attrition, performance, PIPs, engagement
   and compensation — but no recurring 1:1 / skip-level event type exists, so
   no rule can guard the cadences a multi-team leader lives by (the mentor
   lineage's R1/R8 lineage). Highest-value missing *events*.
3. **Boss-expectations capture + listening-tour coverage** (carried from the
   pt-1/pt-3 ranked lists; still no `exec.expectations` type).
4. **Entity-level dedupe on import.** `mergeInto()` rewires ids and counts
   duplicate-id / dangling skips; two same-named people across a merge stay two
   people — flagged as an accepted gap since pt-3, still open.
5. **Meeting-load pricing** from declared recurring minutes (carried; no
   capacity events exist for it yet).
6. **Temporal weighting for the windowed rules** — R19/R24/R28 windows are
   flat; recency is printed, not priced.
7. **Continuous execution of the battery.** `scripts/headless-verify.mjs` makes
   the suites runnable anywhere Node runs, but nothing *schedules* it; a
   regression between sessions is silent until someone opens `#/health` or runs
   the harness. (The T19 boundary defect sat green-looking for five parts this
   way.)

## Explicit non-claims (updated, part 13)

- **Authoring-runtime honesty.** Parts 1–12 had no JavaScript runtime;
  their "verified" language meant *source-inspected* and *fixture-traced*
  (Part 12 is the controlling statement). Part 13's counts **are executed
  results** — under Node + jsdom, not a branded browser. Paint, layout, focus
  order and real event timing remain **unobserved, labeled**.
- **The browser is still the grader.** Any disagreement between this file and
  `#/health` on your machine is resolved in `#/health`'s favor.
- **R1–R10 are reconstructions.** Upstream bodies were never byte-readable in
  any session; they are pinned to the settings the pt-1 selectors prove (§10).
- **The upstream repo drifted and this delivery corrects it without pretending
  otherwise.** At inspection (`main @ c9fcb6d`, measured via the git trees API
  this session): 16 files flat, including an npm scaffold, an 87 KB lockfile, a
  tsconfig, the `rules.js` tombstone and two stale patch documents — while
  `index.html` referenced `css/`+`js/` paths that did not exist in the tree,
  which means upstream HEAD could not boot as shipped. This delivery is the
  corrected 10-file set. Repo-side cleanup is the owner's delete key (§50).
  **Part-14 re-inspection** (`main @ 12ad31d`, same method): now **22 flat
  entries** — the scaffold grew (`App.tsx`, `cn.ts`, `index.css`, `main.tsx`,
  `vite.config.ts` appeared; `package.json` now 653 B) — the 10 canonical files
  are byte-identical to the part-13 readings, and upstream still cannot boot as
  shipped. The two stale documents are predecessor-lineage debris (mf-era),
  verified by reading them this session (§55).
- **The battery grades logic, not pixels.** T27 drives real generated forms in
  a DOM and asserts payloads; visual rendering at any viewport is constructed
  and source-inspected, not graded.
- **The seed is a fixture, not a diagnosis.** Thresholds are defaults a leader
  can change; every finding prints its basis and arithmetic; nothing here is
  legal, HR, or financial counsel.
- **No accounts, sync, or other real humans: permanently out of scope.** Data
  leaves the browser only when you export a file yourself; there are no
  network calls to carry it anywhere.
- **Byte counts are not stated** for any file (log §0.3; the tooling records
  content and lines, not bytes — claiming figures you cannot measure is how
  drift starts). Line counts are measured by reading.

## Roadmap (pt-4 close-out)

- **Executive/board pack** (queued, next): one-click board narrative compiled
  from the log (feeds R39/R40 discipline), plus module surfaces for finance and
  people. After it lands, pt-4 is feature-complete against its brief.
