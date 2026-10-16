# LeadOS pt-8 — Correlation Rules, over the Authoritative Heatmap & Insights

A universal leadership and management operating system: append-only event log, 85 validated
event types, **45 pure rules** (R1–R40 individual + **R41–R45 correlation rules**) with printed
arithmetic, a correlation engine (clusters · decayed domain heat · named patterns · benchmark
gating), and an insight layer in the pt-7 spec shape — everything derived per read, nothing
derived ever persisted.

**Run it:** open `index.html` in any modern browser. No server, no build step, no framework,
no network, no CDN — system fonts only. Everything runs locally against one localStorage key.

**Verify it:** open `#/health` — the authoritative grader. Where any document (this file
included) and `#/health` disagree, **`#/health` on your machine wins.**

---

## §0 Claim-vs-inspection audit (opens every delivery, per doctrine)

The pt-7 brief demanded: *inspect the actual code before claiming anything about it; label
anything unverified.* The audit below is unchanged in status since pt-7 (no new upstream reads
were performed in the pt-8 session; the pt-8 brief was implemented against this build).

| Claim | Status | Basis |
|---|---|---|
| Upstream tree at inspection: 22 flat entries — no `css/`/`js/` dirs; npm scaffold + `rules.js` 761 B tombstone + stale patch docs; cannot boot as shipped | **BYTE-VERIFIED** | git trees API, `main @ a1ed70f` (pt-7 session) |
| `store.js`: schema v5, migration ladder with repair counting, v5 settings `{correlationWindowDays 90, trendMinPeriods 3, heatmapDecayFactor 0.85}` | **BYTE-VERIFIED (full read)** | raw fetch; ported near-verbatim |
| `engine.js`: complete fold table, buckets, aliases, open-sets, roster; pt-5 handlers incl. `benchmark.set` / `insight.acknowledged` / `signal.tagged` shapes; pt-6 pattern library (near-complete) | **BYTE-VERIFIED (those regions)** | raw fetch (file partially readable) |
| Upstream pt-5 **heat formula** `sev × decay^(ageDays)`, no CONF_FACTOR in readable text; insight shape `{id,kind,title,basis[],clusterIds,sev,conf,play,suppressible}`; promotion rule *"sev ≥ 4, or ≥ 3 findings, or > 1 domain"* | **BYTE-VERIFIED** | same truncated read |
| `HOT_SCORE` value; `CONF_FACTOR` (if upstream defines one); T33–T37/G31 bodies; `events.js` full 92-type registry; `health.js`; `ui.js`; `playbooks.js` bodies | **NOT VERIFIED** | beyond fetch truncation; never claimed anywhere in this delivery |
| R1–R45 rule behavior **in this build** | implemented + fixture-pinned | `#/health` T1–T20 executes it in your browser |

**Registry honesty:** this build registers **85 event types**. Upstream claims 92; the 7-type
delta is contracts not byte-verifiable so far — **not registered rather than guessed** (an
unregistered type fails loudly at the append gate, by design).

## Delivery: exactly three files (and why)

The delivery clause names `index.html`, `README.md`, `AI-SESSION-LOG.md`. The upstream 10-file
doctrine is **adapted, not silently violated**: all nine modules (util · events · store · engine ·
rules · correlate · health · playbooks · ui) ship as labeled IIFEs inside one `index.html` in
doctrinal load order; every module registers exactly one `LeadOS.*` namespace; the boot gate
halts rendering on integrity failure.

| File | Lines | Role |
|---|---|---|
| `index.html` | 2,853 | The entire application: design system + 9 modules + boot gate (`wc -l index.html` to re-verify) |
| `README.md` | this file | Doctrine, audit, divergence register, verification contract |
| `AI-SESSION-LOG.md` | Session 7 + Session 8 entries | §0 audits, decision log, defect log |

---

## THE PT-7 BRIEF — heatmap & insights (implemented verbatim, carried)

### Heatmap

Domain → score (0–10), over that domain's **active** findings:

```
score = min(10,  Σ  finding.sev × CONF_FACTOR[finding.conf] × heatmapDecayFactor^(days/7) )
```

with the math printed **per domain, term by term**; the `min(10,…)` cap disclosed when it binds
(T8); undated findings excluded and outside-window findings dropped — both named with reasons
(T9); future-dated evidence clamped to age 0 and disclosed. Every render is labeled
**"COMPOSITE SIGNAL, NOT A MEASUREMENT."** (T7/G9). `CONF_FACTOR = HIGH 1.00 · MEDIUM 0.60 ·
LOW 0.30` is a **labeled interpretation** (the brief names the table, not its values; upstream
never defines one in the readable code) — confidence discounts, never amplifies.

### Insights

Every firing cluster or pattern produces exactly `{id, kind, title, body, findingKeys[], severity,
play, suppressedBy}` with kind ∈ `pattern | cluster | benchmark-gap`. Clusters promote under the
byte-verified rule (*sev ≥ 4, or ≥ 3 members, or > 1 domain* — printed in every cluster insight);
below-the-line clusters are shown with their shortfall. **Benchmark-gap**: `benchmark.set` exists
for a metric AND latest `fin.kpi.logged`/`product.metric.logged` of the same name ≤ 80% of the
benchmark → fires with the gap arithmetic in the body; **conf MEDIUM; source printed, not
verified by LeadOS**; boundary executed (80 fires, 80.01 quiet — T10); only the two named event
types feed the rule; `findingKeys: []`. Suppression: `insight.acknowledged` appends suppress
**per read**; `suppressedBy` carries the ack event's id (T12); suppressed insights and orphaned
acks stay visible forever.

---

## THE PT-8 BRIEF — correlation rules (implemented verbatim)

Five rules that run **after** the individual rules, receiving the already-computed findings list:

| Rule | Fires when | sev | conf | Key | Play |
|---|---|---|---|---|---|
| **R41** | `DEATH_SPIRAL` pattern active | 5 | MEDIUM | `CORR:DEATH_SPIRAL` | `systemic-intervention` |
| **R42** | `REVENUE_AT_RISK` pattern active | 4 | MEDIUM | `CORR:REVENUE_AT_RISK` | `revenue-war-room` |
| **R43** | `GOVERNANCE_GAP` pattern active | 4 | MEDIUM | `CORR:GOVERNANCE_GAP` | `governance-sprint` |
| **R44** | `QUALITY_COLLAPSE` pattern active | 5 | **HIGH** | `CORR:QUALITY_COLLAPSE` | `production-stop` |
| **R45** | `LEADERSHIP_VACUUM` pattern active | 4 | **HIGH** | `CORR:LEADERSHIP_VACUUM` | `leadership-audit` |

- **Keys are literal** `CORR:<PATTERN>` (a `fin()` override; the computed `R41:…` form would
  drift from the contract). T19 asserts all five exact tuples (key, sev, conf, play).
- **Resolution is derivation**: a correlation finding disappears the read its pattern goes
  dormant — *"resolved when all N constituent findings are resolved"* — printed in every
  CORR basis. There is no state to clear; nothing is ever persisted.
- **R44's sev 5** carries its warrant in basis: *sev 5 by exception — all inputs are measured
  production data; same class as R28 safety*. **R45's conf HIGH**: *all inputs are cadence data —
  your own logs*. Both quotes are the brief's, printed so a skeptic sees the warrant.
- The **correlation pass prints its input**: every CORR basis records *"correlation rules run
  AFTER the individual rules — this pass received N already-computed, unsuppressed individual
  finding(s)"* plus the verified limb list.
- The three patterns the brief does **not** name (EXECUTION_BREAKDOWN, INNOVATION_STALL,
  CASHFLOW_WARNING) produce **no** correlation rule — pattern insights only. Not invented.

### The extended contract — `run(P, today)`

```js
LeadOS.rules.run(P, today) → {
  findings,         /* R1–R40 visible findings + fired R41–R45 + any ENG faults, severity-sorted */
  suppressedCount,  /* findings suppressed out of `findings` by the leader */
  engErrors,        /* [{rule, message}] — every throwing rule, also embodied as an ENG finding */
  insights,         /* the insight collection (all / active / suppressed / orphanAcks) */
  heatmap           /* the labeled heat object (formula, cells, exclusions, label) */
}
```

Exactly five keys (T20 pins the set). `LeadOS.rules.runFull()` is the single computation both the
contract and the views use — one pipeline, no parallel paths to drift.

### Two mechanics the brief names but doesn't pin (labeled INTERPRETATIONS)

1. **`suppressedCount` — findings suppression.** Via `signal.tagged {eventId: <finding key>,
   tag: 'suppress'|'unsuppress'}`; **latest append wins**. Auditable (the tag event is in the
   log forever), reversible (unsuppress), and cascade-aware: suppressing a pattern limb makes
   the pattern go dormant, so R41–R45 stop firing — and every cascade silenced this way is
   **printed** in `#/insights → Quieted by suppression`, never hidden (T20).
2. **`engErrors` — engine faults embodied.** A throwing rule is caught, recorded as
   `{rule, message}`, **and** emitted as an ENG finding: sev 5, unsuppressible, undated (so it
   never charges the heatmap), `playNone: "engine fault — fix the rule, not the data."` Carried
   lineage doctrine: a silent engine is worse than a loud failure (T20 injects a real throwing
   rule and asserts both surfaces, then asserts recovery).

### Divergence register (upstream vs this line), updated

| Topic | Upstream (byte-verified where noted) | This delivery | Why |
|---|---|---|---|
| Heat contribution | `sev × decay^(ageDays)` — verified | `sev × CONF_FACTOR × decay^(days/7)`, cap 10 | pt-7 brief is authoritative |
| Insight shape | `{…,basis[],clusterIds,sev,conf,play,suppressible}` — verified | `{id,kind,title,body,findingKeys,severity,play,suppressedBy}` | pt-7 brief's literal contract |
| Insight kinds | cluster / heat / person fragments; `HOT_SCORE` unread | exactly pattern · cluster · benchmark-gap | closed enumeration; unread value not guessed |
| Rules surface | rules.run → findings array (Signals tab, per pt-15 README) | **object contract** `{findings, suppressedCount, engErrors, insights, heatmap}` | pt-8 brief's extended signature |
| Correlation rules | not present in readable upstream code | R41–R45 with literal CORR keys | pt-8 brief |
| Findings suppression | mentor-lineage snoozes (older lineage docs); pt-5 ack events cover insights only | `signal.tagged` latest-wins, disclosed | interpretation, since brief pins the count not the mechanism |

---

## Rules engine — R1–R40 (carried)

Pure functions `(P, today) → findings[]`; `fin()` enforces the shape and **throws** on violation.
Discipline: ≥ 3 measured points for trend claims; missing fields skip, never infer; sev-3 trend
ceiling with disclosed clamp; the arithmetic and the event type it read are printed. R1–R10 are
pt-1 lineage reconstructions, labeled. Thresholds follow the upstream README's public rule table
(cadences R1–R4 · decisions R5–R6 · register risk R7 · KR silence R8 · tasks R9 · KR-less
objectives R10 · fin risk R11 · stale deals R12 · quota R13 · OKR silence R14 · OKR scores R15 ·
MTTR R16 · SLA R17 · milestones R18 · attrition R19 · engagement R20 · PIP R21 · budget R22 ·
KPI R23 · forecast R24 · vendor R25 · disruption R26 · yield R27 · safety R28 · equipment R29 ·
compliance R30 · legal risk R31 · contracts R32 · NPS R33 · churn R34 · escalations R35 · CPA
R36 · experiments R37 · tech-debt mass R38 · board R39 · exec KPI R40). **T18 executes the
proof**: one deterministic seed fires all forty individual rules **and** all five correlation
rules, across all three insight kinds.

## Views

| Route | What it shows |
|---|---|
| `#/today` | Operating rhythm (four cadences), quick capture (registry-driven forms), ranked signals with domain chips |
| `#/signals` | All findings (incl. CORR + any ENG) with printed basis; **Suppressed** section with unsuppress affordance |
| `#/insights` | Active / acknowledged / orphaned-ack insights; below-the-line clusters; **quieted-by-suppression** cascades; dormant patterns with missing limbs |
| `#/heatmap` | The 0–10 grid, formula + factor + CONF_FACTOR printout, per-domain term math, named exclusions, the label |
| `#/benchmarks` | Per-metric: source printed-unverified, latest internal, 0.8× threshold math, trend gate with its why, fire/quiet/silent; set-benchmark form |
| `#/playbooks` | 33 curated + 15 generated domain descriptors (incl. the five correlation-rule plays) |
| `#/health` | **T-suite (20 checks, pinned fixtures) · G-suite (9 checks, live) · claims C1–C11** with proven/unproven per claim |
| `#/data` | Export/import (dry-run report first), settings as appended events, demo seed, purge, audit tail |

## Fixture epoch

`FIXED = 2026-02-16T12:00:00.000Z` (1,771,243,200,000 ms). All T-checks pin to it; G-checks read
the real clock and store by design.

## Explicit non-claims

- **The browser is the grader.** Authored without a JS runtime; every T/G count is *executable*
  in `#/health` and traced by hand during self-review (three defects caught that way in pt-8
  alone — log §2). Nothing here claims observed execution.
- **Partial upstream reads are labeled** (§0). `events.js` (full registry), `health.js`, `ui.js`,
  `playbooks.js` bodies, `HOT_SCORE`: unverified, unquoted.
- **Suppression mechanics and ENG-fault embodiment are interpretations** of the brief's named-
  but-unpinned fields — printed in the UI at the exact surfaces they affect.
- **Heat is a composite signal, not a measurement**; CONF_FACTOR and the 0.85 decay factor are
  leader-changeable printed assumptions; benchmark-gap reads benchmarks as targets and says so.
- **The seed is a fixture, not a diagnosis**; nothing is legal, HR, or financial counsel.
- **No accounts, no sync, no network, permanently.** Data leaves only when you export it yourself.
- Paint, layout, focus order, and real event timing are constructed and source-inspected,
  **not observed**, this session.

## Ranked next (carried + updated)

1. **Byte-verify the unread upstream bodies** (`events.js` full registry → the 7-type delta;
   `health.js` T33–T37/G31; `ui.js`; `playbooks.js`) and reconcile or formally retire each.
2. **Suppression/acknowledgment lifecycle review** — findings suppression (`signal.tagged`) and
   insight acknowledgment (`insight.acknowledged`) are parallel mechanics on two event types;
   unifying them is a deliberate next-part decision, not a patch.
3. **Executive/board pack** (upstream queued #1; still open).
4. **1:1 / skip-level cadence events** (upstream gap #2; would retire LEADERSHIP_VACUUM's
   heritage proxies).
5. **Feed the pt-7/pt-8 contracts back upstream** (heat formula, 7-field insight shape, CORR
   keys) so the upstream pt-5 interpretation converges with the authoritative briefs.
