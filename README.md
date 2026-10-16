# LeadOS pt-16 — Calibration Engine

A universal leadership and management operating system. Append-only event log,
**148 validated event types**, **102 pure rules**, fourteen functional modules, and one
authority wall. Everything derived per read; nothing derived is ever persisted; no network
call is ever made.

**Run it:** open `index.html` in any modern browser. No server, build step, framework,
network, or CDN. One localStorage key.

**Verify it:** open `#/health`. Where this file and `#/health` disagree, **`#/health` wins.**

---

## §0 Claim-vs-inspection audit

| Claim | Status |
|---|---|
| Upstream tree @ `a1ed70f`: 22 flat entries, no `css/`/`js/`, npm scaffold + `rules.js` tombstone, unbootable as shipped | **BYTE-VERIFIED** (pt-7 session, git trees API) |
| `store.js` full read — schema ladder, repair counting, single key, import gate | **BYTE-VERIFIED**, ported near-verbatim |
| `engine.js` fold table / buckets / aliases / open-sets / roster; pt-5 handlers; pt-6 pattern library; upstream heat formula; upstream insight shape; promotion-rule string | **BYTE-VERIFIED (those regions)** |
| `events.js` full registry · `health.js` · `ui.js` · upstream `playbooks.js` · `HOT_SCORE` | **NOT VERIFIED** — beyond fetch truncation; never claimed |
| pt-8 … pt-16 briefs | received in full, implemented literally; every interpretation and brief-internal conflict labeled |

No new upstream reads this session. **Registry: 148 contracts.**

## Module registry

Three physical files ship (the delivery clause, constant since pt-7). The brief's script list
lives as `LeadOS.EXPECTED_MODULES`, in load order, enforced by the boot guard and asserted by G10:

`util · events · store · engine · rules · correlate · conversations · decisions · execution ·
external · calibration · health · playbooks · ui`

## Schema v11 — `MIGRATIONS['10>11']`

Backfills `calibrationWindowDays` **180** · `biasSampleMin` **5** · `overconfidenceThreshold`
**0.2**. `biasSampleMin` is the honesty floor: **no bias claim may fire below it**, and the n is
printed on every calibration output. A v3 store climbs to v11 through eight rungs.

## The calibration engine — `LeadOS.calibration`

pt-15 tracks what the world does to your organization. pt-16 tracks **what you do to your
decisions** — computed only from decisions you made and outcomes they produced, never from a
personality instrument. Every output carries its **n**, its **window**, and at least one
**alternative explanation**, and every one is stamped:

> *This is a PATTERN OBSERVATION, not a diagnosis. It is computed from your own logged decisions
> and outcomes, and it can be wrong.*

| Function | What it prints |
|---|---|
| `overconfidenceScore` | mean stated confidence − hit rate = gap, with a per-bucket **calibration curve** (`0–0.4 · 0.4–0.6 · 0.6–0.8 · 0.8–1.0`), an n per bucket, `insufficient data (n=1)` where the bucket is thin, and the verbatim sentence **"When you say 80% confident, you are right X% of the time."** |
| `sunkCostPattern` | initiatives > 60d with ≥2 negative signals **and** a founding decision calibrated `worse`/`much-worse`; cost shown as a labeled **proxy**, never an accounting |
| `anchoringPattern` | the forecast-vs-actual table, period by period, so the pattern is checkable by hand; fires only on a run of **≥3** |
| `confirmationBias` | assumption-confirm rate and ignored high-relevance disruption signals — with the alternative explanation printed **first** |
| `gapAnalysis360` | per-dimension rater mean, self score, gap, std-dev consistency, trend; blind spots (self − raters ≥ 1.5) and hidden strengths (≤ −1.5) |
| `energyPattern` | mean/min/max, ranked drains and sources, low-energy days, and a meeting-load correlation labeled **correlation ≠ causation** |
| `reflectionQuality` | cadence and structure grading, plus heuristic commitment follow-through — labeled a **proxy for cadence, not a measure of depth** |

## Rules R93–R102

| Rule | Fires | sev / conf |
|---|---|---|
| **R93** | overconfidence gap > threshold with n ≥ `biasSampleMin`; gap > 0.3 | 3 → 4 / MEDIUM |
| **R94** | sunk-cost persistence > 60d; > 90d | 3 → 4 / MEDIUM |
| **R95** | anchoring run ≥ 3 periods | 3 / MEDIUM |
| **R96** | ≥1 blind spot with **n ≥ 3 raters**; multiple blind spots | 3 → 4 / MEDIUM |
| **R97** | no `leadership.360` in the calibration window, log older than 90d | 2 / HIGH |
| **R98** | energy mean ≤ 4 over ≥14d with n ≥ `biasSampleMin` | 3 / MEDIUM |
| **R99** | no reflection in > 30d; > 60d | 2 → 3 / HIGH |
| **R100** | assumption-confirm rate > 80% with n ≥ 5 | 3 / **LOW, permanently** |
| **R101** | ≥3 `feedback.received` with `acted=false` in 90d | 3 / HIGH |
| **R102** | `style.shift` with neither reason nor trigger | 1 / HIGH (nudge) |

**R100 is conf LOW by construction and can never be otherwise** (G96): a false positive there is
more damaging than a false negative, because overcorrecting on a confirmation-bias flag degrades
good decision-making. **Hidden strengths never raise a finding** (G101) — they are context, not
an alarm.

## New playbooks (5)

`calibration-review` (live: your stated confidence against your own history) · `360-debrief` ·
`energy-audit` · `bias-acknowledgement` (prints the alternative explanation **before** the flag)
· `weekly-reflection` (live quality grading as you type). Several refuse to write: a recognized
bias with no named change, a rejected bias with no reasoning, a confidence outside 0–1.

## Views

`#/today` · `#/signals` · `#/insights` · `#/heatmap` · `#/benchmarks` · `#/conversations` ·
`#/org` · `#/decisions` · `#/execution` · `#/external` · **`#/self`** (calibration curve ·
sunk-cost tracker · 360 gap table · energy timeline · reflection streak · bias flags) ·
`#/dossier` · `#/playbooks` · `#/health` · `#/data`.

**Privacy, deliberately:** reflections are private. The dossier surfaces a direct's 360 in
aggregate only and never the raw rater breakdown, and never their reflection content.

## Health wall

**T1–T57** · **G1–G10 · G31–G101** · **claims C1–C20**.

> **ID map:** this brief numbered its checks T51–T55, but T51/T52 were taken in pt-15. They ship
> as **T53–T57** (brief T51→T53 … T55→T57). G93–G101 keep the brief's ids; **brief G102 is folded
> into G40**, which asserts all **102** rules fire from one seed.

## The non-negotiables, unchanged since pt-1

- trends need **≥3 measured points**
- **missing fields skip rather than infer**
- **a count is never stated as certainty** — the arithmetic and the event type are printed
- **suppression is auditable and reversible** — with exactly one hard override: **R88
  non-compliance can never be suppressed** (G84/G89), and a refused attempt is printed on the finding
- every finding links the playbook that resolves it, **or prints why it has none**
- the README names exactly the files on disk — **no more, no fewer**
- the AI-SESSION-LOG §0 opens with a **claim-vs-inspection audit**
- **no JS runtime in the authoring environment — correctness by construction; the browser is the grader**

## Explicit non-claims

- **The browser is the grader.** Every count here is executable in `#/health`; none is claimed observed.
- **Labeled interpretations**, each printed at its surface: CONF_FACTOR values · findings
  suppression mechanics · ENG-fault embodiment · `playbook.completed` / `plan.checkin` /
  `decision.outcome` / `partner.reviewed` / `plan.created` shapes (contracts the briefs named
  but never specified) · R48 "same period" · R50/R53 roster proxy (**no `reportsTo` contract**) ·
  conflict pairs from `mediation.held` alone (**no `conflict.raised` contract**) · culture 2×
  weight · betweenness and bridges as approximations · R67's scenario-count proxy · R78's
  retro-completion inference · R90's symmetric bottom-quartile estimate · every text-match
  correlation in pt-15 and pt-16.
- **Nothing here is a clinical, legal, HR, or financial instrument.** `energy.logged` is a
  self-reported scale; the 360 is a sample of observers; the bias detectors are pattern
  observations about logged behavior and can be wrong.
- **Zero network calls, permanently.** All external intelligence is typed in by a human who went
  and looked. Data leaves only when you export it.

## Ranked next

1. **`conflict.raised` / `conflict.resolved`** and **`retro.action.completed`** — the two
   contracts whose absence still forces printed inferences (R61/G48, R78).
2. **`reportsTo` + 1:1 cadence contracts** — retires the roster proxy in R50/R53/R97 and the
   heritage proxies in LEADERSHIP_VACUUM.
3. **Exact Brandes betweenness** — would let R62 and `#/org` drop their approximation caveat.
4. **`production-stop` interactive brief** (requested pt-9, never received).
5. **Byte-verify the unread upstream bodies**; reconcile registry counts honestly.
6. **Executive/board pack** — upstream's own queued #1, carried since pt-7 and still open.
