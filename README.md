# LeadOS pt-7 — Authoritative Heatmap & Insights

A universal leadership and management operating system: append-only event log, 85 validated
event types, 40 pure rules (R1–R40) with printed arithmetic, a correlation engine (clusters ·
decayed domain heat · named patterns · benchmark gating), and an insight layer in the pt-7
spec shape — everything derived per read, nothing derived ever persisted.

**Run it:** open `index.html` in any modern browser. No server, no build step, no framework,
no network, no CDN — system fonts only. Everything runs locally against one localStorage key.

**Verify it:** open `#/health` in the browser — the authoritative grader. Where any document
(this file included) and `#/health` disagree, **`#/health` on your machine wins.**

---

## §0 Claim-vs-inspection audit (opens every delivery, per doctrine)

The brief for this part demanded: *inspect the actual code before claiming anything about it;
label anything unverified.* This section is that audit.

| Claim | Status | Basis |
|---|---|---|
| Upstream tree at inspection: 22 flat entries — no `css/`/`js/` dirs; npm scaffold (`App.tsx`, `cn.ts`, `index.css`, `main.tsx`, `vite.config.ts`, `package.json` 653 B, lockfile 104 KB, `tsconfig.json`) + `rules.js` 761 B tombstone + `SESSION-3.patch.md` + `AI-SESSION-LOG.append.md` present | **BYTE-VERIFIED** | git trees API, `main @ a1ed70f` |
| Upstream `index.html` (2,119 B) references a pt-6 lineage and cannot boot as shipped (flat tree vs `css/`+`js/` loader paths) | **VERIFIED (title only)** | raw fetch returned title `LeadOS pt-6 — Universal Leadership OS`; full source not text-extractable this session → labeled partial |
| `store.js`: schema v5, migrations `1>2`–`4>5` with repair counting, single key, `V5_SETTING_DEFAULTS = {correlationWindowDays 90, trendMinPeriods 3, heatmapDecayFactor 0.85}` | **BYTE-VERIFIED (full read)** | raw fetch; ported near-verbatim (LINEAGE_TAG → `pt-7`) |
| `engine.js` fold table (`MODULE_FOLD`), bucket list, `ALIASES`, `OPEN_SETS`, roster builder; pt-5 fold handlers incl. `insight.acknowledged {insightId, note}` and `benchmark.set {metric, value, unit, source, period, type}` | **BYTE-VERIFIED (full read of that region)** | raw fetch; ported with two documented deltas (fixture `at` support; `fin.risk.updated` keeps an updates array so R11 can honor *update-before-reviewDate-does-not-count*) |
| `engine.js` rules bodies R1–R40 | **PARTIALLY VERIFIED** | fetch truncated mid-file; thresholds re-derived from the upstream README's own public rule table (which enumerates all forty at golden density) and cross-checked against the readable fragments |
| Upstream pt-5 **heat formula**: contribution `w = sev × decay^(ageDays)` — per-day exponent, **no CONF_FACTOR anywhere in the readable text**, exclusion of undated (>window) findings | **BYTE-VERIFIED in the readable region** | raw fetch of the correlate IIFE (truncated) |
| Upstream insight shape `{id, kind, title, basis[], clusterIds, sev, conf, play, suppressible}` and the promotion rule string *"sev ≥ 4, or ≥ 3 findings, or > 1 domain"* | **BYTE-VERIFIED** | same truncated read |
| Upstream `HOT_SCORE` threshold value; `CONF_FACTOR` definition (if any); G31/T33–T37 bodies; `events.js` full registry (92 types claimed); `health.js`; `ui.js`; `playbooks.js`; pt-6 full README | **NOT VERIFIED** | not byte-readable this session (truncation/size). Nothing about them is claimed anywhere in this delivery |
| pt-6 pattern library: 8 named patterns, triggers, herit­age-label disclosure machinery | **BYTE-VERIFIED (near-complete read)** | raw fetch reached the module end; ported with scope functions simplified but limb logic intact |

**Registry honesty:** this build registers **85 event types**. Upstream claims 92 under contract;
the 7-type delta is contracts not byte-verified this session (`events.js` unread). They are
**not registered rather than guessed** — appending an unregistered type fails loudly at the gate.

---

## On the record, upstream divergence found by inspection

- The pt-15 README describes a corrected 10-file `css/`+`js/` tree and says `js/rules.js` "is gone,
  and stays forbidden." The tree at `a1ed70f` is **still flat**, **still carries `rules.js`**, and the
  README at HEAD still describes pt-15 while `index.html`/`store.js` carry pt-6 tags. Upstream's own
  documents already flag most of this; this delivery records the current measurement, not a discovery.
- The pt-5 brief arrived upstream truncated at the cluster shape; heat/insight semantics there were
  **interpreted** (their log says so). The pt-7 brief in this delivery is **authoritative** and
  supersedes the interpretation wherever they differ — see *Divergence register* below.

## Delivery: exactly three files (and why)

The pt-7 brief's delivery clause asks for `index.html`, `README.md`, `AI-SESSION-LOG.md` — no
more. The upstream 10-file doctrine is therefore **adapted, not violated silently**: all nine
modules (util · events · store · engine · rules · correlate · health · playbooks · ui) ship as
labeled IIFEs inside the single `index.html`, in doctrinal load order. The shipped-manifest check
upstream ran as T31 is replaced by G1–G3 + the module-registration discipline (every module
assigns exactly one `LeadOS.*` namespace; the UI halts if integrity fails).

| File | Lines | Role |
|---|---|---|
| `index.html` | 2,599 | The entire application: design system + 9 modules + boot gate (measured at delivery; `wc -l index.html` to re-verify) |
| `README.md` | this file | Doctrine, audit, divergence register, verification contract |
| `AI-SESSION-LOG.md` | the append-only engineering log, §0 audit onward | Session 7 entry; prior sessions' 1,037-line log lives upstream and was not editable from here |

Anything else in a working checkout of `wbweve/Leados` is **not this delivery** (the npm scaffold,
the flat upstream modules, the stale patch docs — see §0).

---

## Architecture doctrine (carried, non-negotiable)

| Doctrine | Enforcement here |
|---|---|
| Vanilla JS only — no framework, build step, network, CDN | one classic `<script>`; zero external references |
| Exactly one localStorage key: `leados:data` | G1 inspects all keys |
| Lineage `pt`; schema v5 | store constants; G2 verifies |
| Append-only event store | seq/id chain checked by G3; no update/delete API exists |
| Nothing derived is ever persisted — `project()` runs per read | root/meta whitelists (G2); determinism (G6, T3) |
| `#/health` is the authority wall | boot gate runs G1–G5; failure halts rendering with a named failure; data untouched |
| Every claim maps to executed checks | claims C1–C10 list their authorizing checks; a failing check marks the claim **unproven** |

## Schema v5 (carried)

Migration ladder `1>2`, `2>3`, `3>4`, `4>5` — pure replay-repair passes that may only APPEND
`settings.changed` repair events and count every repair in `meta.migrationRepairs`; leader-set
values are never overwritten; every migration is idempotent (T1). v5 defaults:
`correlationWindowDays` **90** · `trendMinPeriods` **3** · `heatmapDecayFactor` **0.85** (a
**labeled assumption** that prices recency in the heat formula; every rendered heat value prints
the factor in effect, and a leader can change it in `#/data` — the heatmap then prints the new one).

---

## THE PT-7 BRIEF — implemented verbatim

### Heatmap

A map of **domain → score (0–10)**. For each domain:

```
score = min(10,  Σ  finding.sev × CONF_FACTOR[finding.conf] × decay(days_since_finding) )
decay(days) = heatmapDecayFactor ^ (days / 7)        — weekly compounding
```

over that domain's **active** findings (the ones the rules engine produces at read time).
`days_since_finding` = whole days since the finding's newest underlying evidence, which every
finding carries as `evidenceAt` and prints in its own basis.

Honesty rail, all printed on the `#/heatmap` view:

- The **math is printed per domain, term by term**:
  `sev 4 × conf HIGH (1.00) × 0.85^(14/7) = 0.723 → 2.890`, then the raw Σ, then the
  `min(10, …)` cap with a disclosure flag when it binds (T7 pins the arithmetic to the double; T8 pins the cap).
- **Undated findings are excluded** ("stated, never re-dated") and findings older than
  `correlationWindowDays` are dropped ("decays out of the picture") — both listed by name and reason (T9).
- Every heat value is labeled, in the UI and in code:
  **"COMPOSITE SIGNAL, NOT A MEASUREMENT."**
- Domains with no active findings show *absence of signal*, not a zero measurement.
- Future-dated evidence (e.g. a contract's `expiryDate` ahead of today) is clamped to age 0
  and the clamp is printed next to the term.

**CONF_FACTOR = HIGH 1.00 · MEDIUM 0.60 · LOW 0.30 — a labeled interpretation.** The brief names
`CONF_FACTOR[conf]` without pinning values; the readable upstream code never defines one. Chosen
so confidence *discounts but never amplifies* a measured severity, and printed everywhere heat is
rendered (also in code as `CONF_FACTOR_WHY`). This is the one unpinned constant in the formula.

### Insights

Every firing cluster or pattern produces exactly:

```js
{ id: string, kind: 'pattern'|'cluster'|'benchmark-gap', title: string,
  body: string,            /* the diagnosis text, including the printed verification */
  findingKeys: [], severity: number, play: string|null,
  suppressedBy: 'insight.acknowledged' event id | null }
```

- **kind `cluster`** — a correlation cluster is *promoted* to an insight under the byte-verified
  upstream rule: **sev ≥ 4, or ≥ 3 members, or spans > 1 domain**. The rule is printed in every
  cluster insight's body, and clusters below the line are rendered (with their shortfall) rather
  than hidden. Cluster ids key on membership (keys joined with `+`); **they re-key when membership
  changes — carried doctrine, printed**.
- **kind `pattern`** — the 8-pattern named library (DEATH_SPIRAL · EXECUTION_BREAKDOWN ·
  REVENUE_AT_RISK · GOVERNANCE_GAP · INNOVATION_STALL · QUALITY_COLLAPSE · LEADERSHIP_VACUUM ·
  CASHFLOW_WARNING) fires iff every required rule id has ≥1 active finding; window clauses are
  evaluated as **printed sub-claims** (fresh/stale/undated), never silently satisfied (T14).
  Heritage-label divergences (spec's R1/R3/R4/R8/R10 names vs shipped meanings) are printed, never remapped.
- **kind `benchmark-gap`** — the brief's trigger, verbatim: `benchmark.set` exists for a metric
  **and** the latest `fin.kpi.logged` *or* `product.metric.logged` of the same name is **≤ 80% of
  the benchmark value** → fires with the gap in the body
  (`latest … ≤ 80% of benchmark … (0.8 × b = t)`, the delta, and the %).
  **conf MEDIUM**, printed; **benchmark source printed, not verified by LeadOS**, printed;
  `findingKeys: []` (it is computed from events, not from member findings).
  `severity: 3` — the brief pins trigger and confidence, not severity; labeled in code.
  Boundary is executable: **80 fires, 80.01 is quiet**; only the two named event types feed the
  rule — a same-named NPS/KPI of another family cannot leak in (T10). The comparison reads the
  benchmark as a target to reach; for lower-is-better metrics that reading is inverted — printed
  as an assumption, not inferred away.
- **Suppression**: acknowledging an insight appends `insight.acknowledged {insightId, note}`.
  Suppression happens **per read** (the log is never rewritten), `suppressedBy` carries the
  **ack event's id** (T12), and both the suppressed insight (with note + date) and any **orphaned
  acks** (whose insight id no longer fires) stay visible forever. No un-acknowledgement event type
  exists — stated as an accepted gap, not silently patched.

### Divergence register (upstream implementation vs this brief)

| Topic | Upstream pt-5 (byte-verified where noted) | This delivery (pt-7 brief) | Why |
|---|---|---|---|
| Heat contribution | `sev × decay^(ageDays)` — verified | `sev × CONF_FACTOR[conf] × decay^(days/7)` | the brief is authoritative; per-week compounding makes the factor leader-legible (0.85/week) |
| Confidence in heat | none observed in the readable code | `CONF_FACTOR` weighting, values labeled | the brief names it; upstream interpretation predates it |
| Heat label | "priced assumption" language | verbatim **"composite signal, not a measurement"** on every render | the brief's exact words |
| Insight shape | `{id,kind,title,basis[],clusterIds,sev,conf,play,suppressible}` — verified | `{id,kind,title,body,findingKeys,severity,play,suppressedBy}` | the brief's literal contract; UI prints the 7 fields per card |
| Insight kinds | cluster / heat-domain (HOT_SCORE-referenced, value unread) / person-anchor | exactly `pattern`, `cluster`, `benchmark-gap` | the brief's closed enumeration; upstream's `HOT_SCORE` unverifiable → dropped, not guessed |
| Benchmark-gap | a `benchmarkCompare` exists (verified); insight promotion for gaps not observed | gap insight fires at ≤ 80% with basis gap, MEDIUM, source unverified | the brief specifies it end-to-end |

---

## Rules engine — R1–R40

Every rule is a pure function `(P, today) → findings[]`; `P` comes from `engine.project()`;
`today` is injected. Findings are never persisted. The finding contract (`fin()`, T2): `{rule,
sev 1–5, conf HIGH|MEDIUM|LOW, title, basis[], refs[], play|playNone, domain, evidenceAt}` —
violations **throw**, never ship silently. Discipline: ≥ 3 measured points before a trend claim
(named exceptions printed); missing fields skip, never infer (T6); **sev-3 ceiling on
trend-derived findings with the clamp disclosed in basis** (T5); the math is printed, term by
term, alongside the event type it read. R1–R10 are **reconstructions in the pt-1 lineage**
(same status upstream assigns its own R1–R10) pinned to the stored cadence settings.

Implemented thresholds follow the upstream README's public rule table (source-inspected at golden
density): cadences R1–R4 · open decisions R5 (per-domain) · sales-cycle decisions R6 · register
risk R7 (prints L×I) · KR silence R8 · tasks R9 · KR-less objectives R10 · fin risk past review
R11 (clears only via update on/after reviewDate) · stale deals R12 · quota ratio R13 (70%/50%,
exactly-70% quiet) · OKR silence R14 (21/42) · OKR scores R15 (+consecutive pattern, clamped) ·
incident MTTR R16 (4/24/72h, open-past-threshold included) · SLA R17 (+streak) · milestones R18 ·
attrition window R19 (60d, MEDIUM) · engagement R20 (6.5/5, slope exception, median-cadence) ·
PIP R21 · budget variance R22 (15%/30%, direction printed) · KPI R23 (85%/70%, slope→MEDIUM) ·
forecast R24 (20%, systematic streak) · vendor R25 (risk ≥ 4) · disruption R26 (sev ≥ 4, 7d) ·
yield R27 (90%/80%) · safety R28 (sev-5 immediate — never capped) · equipment R29 (4h/24h) ·
compliance R30 (fail → 5, finding+30d → 4, cadence → 2) · legal risk R31 (explicit-null owner is
data) · contracts R32 (30/7d bands, expired+active → 5) · NPS R33 (<0 → 4; slope<30 → 3 MEDIUM;
90d stale) · churn R34 (5%/10%; MRR >15% → 4; missing `mrr_total` named-not-inferred) ·
escalations R35 (sev-5 4h → 5) · campaign CPA R36 (2× mean of three prior, MEDIUM) · experiments
R37 · tech-debt mass R38 (Σ sev×effort, 30/60, MEDIUM, terms printed) · board R39 · exec KPI R40.

**T18 executes the proof**: one deterministic seed fires all forty rules and all three insight
kinds; a silent rule fails the suite loudly in `#/health`.

## Views

| Route | What it shows |
|---|---|
| `#/today` | Operating rhythm (four cadences w/ due math), quick capture (registry-driven generated forms), ranked signals with domain chips |
| `#/signals` | All findings, printed basis, evidence dates, plays |
| `#/insights` | Active / acknowledged / orphaned-ack sections; the promotion rule; below-the-line clusters; dormant patterns with missing limbs |
| `#/heatmap` | The 0–10 domain grid, formula + factor + CONF_FACTOR printout, per-domain term-by-term math, named exclusions, the label |
| `#/benchmarks` | Every benchmark metric: source printed-unverified, latest internal, 80% threshold math, trend gate (≥ trendMinPeriods) with its why, fire/quiet/silent state; a set-benchmark form |
| `#/playbooks` | 33 curated + 15 generated domain descriptors |
| `#/health` | T-suite (18 checks, pinned fixtures) · G-suite (9 checks, live store) · claims C1–C10 with per-claim proven/unproven |
| `#/data` | Export/import (dry-run report first), settings as appended events, demo seed, purge, audit tail |

## Fixture epoch

All date-pinned checks use `FIXED = 2026-02-16T12:00:00.000Z` (1,771,243,200,000 ms), declared in
the health module. G-checks read the real clock and the real store — they are live inspections by design.

## Explicit non-claims

- **The browser is the grader.** This file was authored without a JS runtime; every T/G count is
  *executable* in `#/health` and expected green by construction + three rounds of self-review, but
  **not here claimed as observed**. §5 of the log lists what each check is expected to prove and why.
- **Partial upstream reads are labeled** (§0). Nothing is claimed about `events.js`, `health.js`,
  `ui.js`, `playbooks.js` bodies, `HOT_SCORE`, or upstream's full 92-type registry.
- **R1–R10 are reconstructions** (as upstream's own are), pinned to cadence settings.
- **Single-file divergence** from the 10-file doctrine is deliberate (delivery clause) and recorded.
- **Heat is a composite signal, not a measurement.** The 0.85 decay factor and the CONF_FACTOR
  table are printed assumptions; the benchmark-gap comparison reads benchmarks as targets and says so.
- **The seed is a fixture, not a diagnosis.** Nothing here is legal, HR, or financial counsel.
- **No accounts, sync, or other humans: permanently out of scope.** Data leaves the browser only
  when you export it yourself; there are no network calls to carry it anywhere.
- Paint, layout, focus order, and real event timing are constructed and source-inspected, **not
  observed**, this session.

## Ranked next (carried + updated)

1. **Byte-verify the unread upstream bodies** (`events.js` full registry; `health.js` T33–T37/G31;
   `ui.js`; `playbooks.js`) and reconcile the 7-type registry delta — register or formally retire each.
2. **Executive/board pack** (upstream's own queued #1, still open): one-click board narrative from
   the log; R39/R40 already guard the rhythm.
3. **1:1 / skip-level cadence events** (upstream gap #2) — the mentor-lineage limbs in
   LEADERSHIP_VACUUM would stop reading proxies.
4. **Un-acknowledgement event** (`insight.acknowledged` is currently one-way; reversed only by a
   changed log). Needs a registry contract, so it is a deliberate next-part decision, not a patch.
5. **Feed this heat formula back upstream** so their pt-5 interpretation and the authoritative
   brief converge (their log invites exactly this correction).
