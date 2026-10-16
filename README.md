# LeadOS pt-9 — Interactive Playbooks over the Intelligence Layer

A universal leadership and management operating system: append-only event log, **87 validated
event types**, **45 pure rules** (R1–R40 individual + R41–R45 correlation rules) with printed
arithmetic, a correlation engine (clusters · decayed-and-confidence-weighted domain heat · named
patterns · benchmark gating), an insight layer in the pt-7 spec shape, and **seven interactive
playbook runners** that prefill from the live log and emit reviewable event specs — everything
derived per read, nothing derived ever persisted.

**Run it:** open `index.html` in any modern browser. No server, no build step, no framework,
no network, no CDN — system fonts only. Everything runs locally against one localStorage key.

**Verify it:** open `#/health` — the authoritative grader. Where any document (this file
included) and `#/health` disagree, **`#/health` on your machine wins.**

---

## §0 Claim-vs-inspection audit (opens every delivery, per doctrine)

Unchanged in status since pt-7 — no new upstream reads were performed in the pt-8/pt-9 sessions;
those briefs were implemented against this build. The record:

| Claim | Status |
|---|---|
| Upstream tree @ `a1ed70f`: 22 flat entries, no `css/`/`js/`, npm scaffold + `rules.js` tombstone, cannot boot as shipped | **BYTE-VERIFIED** (pt-7) |
| `store.js` (schema v5 ladder, v5 settings) | **BYTE-VERIFIED, full read** — ported near-verbatim |
| `engine.js`: complete fold table / buckets / aliases / open-sets / roster; pt-5 handlers (`benchmark.set`, `insight.acknowledged`, `signal.tagged` shapes); pt-6 pattern library (near-complete); upstream interpreted heat `sev × decay^ageDays`, no CONF_FACTOR in readable text; insight shape `{id,kind,title,basis[],clusterIds,sev,conf,play,suppressible}`; promotion rule string | **BYTE-VERIFIED (those regions)** |
| `HOT_SCORE` value; upstream `CONF_FACTOR` (if any); T33–T37/G31 bodies; `events.js` full 92-type registry; `health.js`; `ui.js`; `playbooks.js` bodies; `plan.checkin` payload | **NOT VERIFIED** — beyond fetch truncation or never in-tree; never claimed |
| pt-9 playbook prefill/field/submit triplets; `playbook.completed` type name | **received in the pt-9 brief, implemented literally** |

**Registry honesty:** this build registers **87 event types**. Upstream claims 92; the delta is
contracts not byte-verifiable so far — **not registered rather than guessed.** The two pt-9
additions (`playbook.completed`, `plan.checkin`) are labeled minimal/reconstructed contracts.

## Delivery: exactly three files

`index.html` (the whole app — 3,229 lines at delivery, `wc -l` to re-verify) · `README.md`
(this file) · `AI-SESSION-LOG.md` (Sessions 7–9; §0 audits, decisions, self-caught defects).
The upstream 10-file doctrine is adapted as nine labeled IIFEs in doctrinal load order,
disclosed rather than silently violated.

---

## THE PT-7 BRIEF (carried, verbatim)

**Heatmap** — domain score = `min(10, Σ sev × CONF_FACTOR[conf] × heatmapDecayFactor^(days/7))`
over active findings; term-by-term math printed; cap disclosed; undated excluded / outside-window
dropped with names and reasons; labeled **"composite signal, not a measurement"** on every render.
`CONF_FACTOR = HIGH 1.00 · MEDIUM 0.60 · LOW 0.30` is a printed interpretation.

**Insights** — `{id, kind, title, body, findingKeys[], severity, play, suppressedBy}`,
kind ∈ `pattern | cluster | benchmark-gap`. Cluster promotion (sev≥4 / ≥3 members / >1 domain)
printed; benchmark-gap at ≤80% of a `benchmark.set` value with gap arithmetic, conf MEDIUM,
**source printed, not verified by LeadOS**; `insight.acknowledged` suppresses per read and stays
audited (orphaned acks never deleted).

## THE PT-8 BRIEF (carried, verbatim)

**R41–R45 correlation rules** run after the individual rules, receiving the already-computed
list: DEATH_SPIRAL→`CORR:DEATH_SPIRAL` sev5 MEDIUM · REVENUE_AT_RISK→sev4 MEDIUM ·
GOVERNANCE_GAP→sev4 MEDIUM · QUALITY_COLLAPSE→sev5 HIGH (exception, same class as R28) ·
LEADERSHIP_VACUUM→sev4 HIGH (cadence data). Keys literal. Resolution = pattern dormancy, derived
per read. `run(P, today)` returns exactly `{findings, suppressedCount, engErrors, insights,
heatmap}`. Interpretations printed inline: findings suppression via `signal.tagged`
(latest-wins, audited, reversible; quieted cascades disclosed); engine faults embodied as
unsuppressible ENG findings + `engErrors` entries.

---

## THE PT-9 BRIEF — interactive playbooks (implemented verbatim)

Seven runners behind `playbook:`/`interactive:` ids, each gated on its pattern being active,
each with **prefill (printed from the log) → fields → submit (event specs, reviewed, then
appended through the validated gate)**:

| Playbook | Gating pattern | Prefill prints | Submit appends |
|---|---|---|---|
| `systemic-intervention` | DEATH_SPIRAL | all 4 constituent findings · people named by anchors · charged-domain heat math | `note.added` + `exec.crisis.logged` **iff escalation=Y** + `playbook.completed` |
| `ops-triage` | EXECUTION_BREAKDOWN | R16 MTTR actuals · SLA breach names · milestone states | `ops.incident.resolved` (open only) + `ops.milestone.updated` + `note.added` |
| `revenue-war-room` | REVENUE_AT_RISK | Σ open pipeline value · quota ratio math · churn MRR impact | `note.added` + `exec.kpi.reviewed` |
| `governance-sprint` | GOVERNANCE_GAP | the 4 limbs with days-overdue · unowned-risk inventory · the R39 caveat | `legal.risk.logged` (superseding, owner set) + `exec.board.meeting` + `note.added` |
| `finance-reforecast` | CASHFLOW_WARNING | variance math · KPI latest÷target · reconciled forecast history | 2× `fin.forecast.logged` (revenue+cost) + `exec.kpi.reviewed` |
| `innovation-reset` | INNOVATION_STALL | open experiments with reviewDate ages · Σ sev×effort debt mass · silent OKRs | `rd.experiment.result` per selected experiment + `note.added` |
| `leadership-audit` | LEADERSHIP_VACUUM | the 4 cadence limbs with last dates · growth-plan status (gap printed) | `plan.checkin` **iff a plan exists** + `note.added` |

Doctrines enforced by construction and pinned by T21/T22:

- **Specs only until you confirm.** `spec.submit()` never touches storage; the UI pre-validates
  every emitted spec, prints them, and appends sequentially on confirm — with partial-completion
  honesty in the toast and the audit tail. `production-stop` ships as a curated descriptor only;
  **its interactive brief was not received** (recorded, not invented).
- **Supersede, never rewrite.** Owner assignment on a legal risk logs a new
  `legal.risk.logged {supersedes: <event id>}`; the fold retires the old record per read (the log
  is untouched), R31's unowned branch quiets, the past-due branch persists (T22).
- **The board-meeting caveat is printed twice.** Logging `exec.board.meeting` quiets R39 as if
  the meeting happened — the prefill and the confirm dialog both say the invite must be out.
- **No plan, no check-in.** `plan.checkin` fires only when plan evidence exists; otherwise the
  runner skips it and prints why (no invented entities).

## Views

| Route | What it shows |
|---|---|
| `#/today` | Operating rhythm, registry-driven quick capture, ranked signals with domain chips |
| `#/signals` | All findings (individual + CORR + any ENG), printed basis; suppressed section with unsuppress |
| `#/insights` | Active / acknowledged / orphaned insights; below-line clusters; quieted cascades; dormant patterns |
| `#/heatmap` | 0–10 grid, formula + factors in effect, term math per domain, named exclusions, the label |
| `#/benchmarks` | Source printed-unverified, latest internal, 0.8× threshold math, trend gate whys, fire/quiet/silent |
| `#/playbooks` | The runner (prefill/fields/review-and-append) + 33 curated and 15 generated descriptors |
| `#/health` | **T1–T22 (pinned fixtures) · G1–G9 (live store) · claims C1–C12 with proven/unproven per claim** |
| `#/data` | Export/import with dry-run report, settings as events, demo seed, purge, audit tail |

## Explicit non-claims

- **The browser is the grader.** Authored without a JS runtime; every T/G count is *executable*
  in `#/health` and traced by hand in self-review (defects D1–D11 in the log were caught exactly
  this way). Nothing here claims observed execution.
- **Labeled interpretations** (each printed at its surface): CONF_FACTOR values; findings
  suppression mechanics; ENG-fault embodiment; `playbook.completed` shape; `plan.checkin` shape;
  heat-domain charging of correlation findings.
- Partial upstream reads stay labeled (§0): `events.js` full registry, `health.js`, `ui.js`,
  upstream `playbooks.js`, `HOT_SCORE` — unverified, unquoted.
- Heat is a composite signal, not a measurement; the seed is a fixture, not a diagnosis; nothing
  here is legal, HR, or financial counsel.
- No accounts, no sync, no network, permanently. Data leaves only when you export it yourself.

## Ranked next (carried + updated)

1. **`production-stop` interactive brief** (QUALITY_COLLAPSE's play) — requested, not received; the
   descriptor exists and the runner waits on a spec, printed.
2. **Byte-verify unread upstream bodies** (`events.js` full registry → the remaining registry delta;
   `health.js` T33–T37/G31; `ui.js`; upstream `playbooks.js`).
3. **Suppression/acknowledgment lifecycle review** (two parallel mechanics, one deliberate design
   decision — not a patch).
4. **Executive/board pack** (upstream queued #1; still open).
5. **1:1 / skip-level cadence events + plan.* lineage** (would retire LEADERSHIP_VACUUM's heritage
   proxies and give `plan.checkin` something to hang check-ins on).
6. **Feed the pt-7/pt-8/pt-9 contracts back upstream** so interpretation and authoritative briefs
   converge.
