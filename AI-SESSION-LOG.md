# LEADOS · AI SESSION LOG

Append-only engineering log. §0 of every entry opens with a claim-vs-inspection audit;
nothing unread is claimed. Measured-at dates follow the standing convention: every
measurement carries when it was taken. Prior sessions (1–6 lineage, upstream parts 1–15)
live in the upstream `wbweve/Leados` repo's 1,037-line log + separate append file; this
file begins the pt-7/pt-8 delivery line and is complete for those parts.

---

## Session 7 — pt-7: authoritative heatmap + insights (single-file delivery)

**Date:** February 2026. **Env:** file-writing tools + HTTP fetch; no JS execution sandbox at
authoring time. Grading authority is `#/health` in the reader's browser; every expected outcome
below is labeled until observed there.

### §0 Opening audit — what was inspected vs claimed (pt-7)

| # | Object | Method | Result |
|---|---|---|---|
| 1 | Repo tree `main @ a1ed70f` | git trees API (recursive) | **MEASURED** — 22 flat entries; no `css/`/`js/`; npm scaffold + `rules.js` tombstone + stale patch docs present; cannot boot as shipped (its own README/pt-15 said the same of `12ad31d`) |
| 2 | `README.md` HEAD (44,590 B) | raw fetch (read, mildly truncated) | pt-15 doc; rule table, doctrine, T/G enumerations, seed description **READ** |
| 3 | `index.html` HEAD (2,119 B) | raw fetch ×2 (text/html extraction) | **TITLE ONLY** — `LeadOS pt-6 — Universal Leadership OS`; full source not extractable → labeled partial |
| 4 | `store.js` (14,941 B) | raw fetch | **FULL READ** → ported near-verbatim (see §2) |
| 5 | `AI-SESSION-LOG.append.md` (8,719 B) | raw fetch | **FULL READ** — Session-6 (mf-2) entry |
| 6 | `engine.js` (105,072 B) | raw fetch | **PARTIAL** — header + complete `MODULE_FOLD`, bucket list, `ALIASES`, `OPEN_SETS`, roster, anchor/evidence helpers, cluster+insight promotion fragments, heat formula fragment (`sev × decay^ageDays`, no CONF_FACTOR observed), benchmarkCompare, and the pt-6 pattern module (near-complete). Rules bodies R1–R40 and T33–T37/G31/HOT_SCORE/CONF_FACTOR definitions were beyond the truncation cut → **UNVERIFIED**, never claimed |
| 7 | `events.js`, `health.js`, `ui.js`, `playbooks.js` | — | **NOT READ** (size/truncation). The 92-type registry claim is recorded unverified; this build registers 85 contracts and discloses the delta |

### §1 What the upstream code actually says (verified excerpts only)

- `store.js`: schema v5; ladder `1>2`–`4>5` with repair counting; `LINEAGE_TAG 'pt-6'`;
  `V5_SETTING_DEFAULTS {correlationWindowDays 90, trendMinPeriods 3, heatmapDecayFactor 0.85}`.
- `engine.js` fold: exact field semantics for `fin.kpi.logged (metric)`, `product.metric.logged (name)`,
  `benchmark.set (metric,value,unit,source,period,type)`, `insight.acknowledged (insightId,note)`,
  `signal.tagged (eventId,…)`, `cadence.review`; pt-5 buckets `insightAcks/benchmarks/reviewLog/signalTags`.
- Correlate fragments: confidence ladder `high/medium/low` with printed `confWhy`; insight shape
  `{id,kind,title,basis,clusterIds,sev,conf,play,suppressible}`; promotion rule string
  *"sev ≥ 4, or ≥ 3 findings, or > 1 domain"*; heat contribution `w = sev × Math.pow(decay, ageDays)`
  with undated/outside-window exclusions; `HOT_SCORE` referenced, value unread.
- pt-6 patterns: 8 defs with requires/sev/conf/windowDays/play/narrative; heritage-label disclosure
  table; window limbs evaluated as printed sub-claims (fresh/stale/undated).

### §2 Divergence decisions (brief vs upstream), one line of WHY each

1. **Heat formula = brief's** (`sev × CONF_FACTOR × decay^(days/7)`, cap 10) over upstream's
   `sev × decay^ageDays` — the pt-7 brief is authoritative; upstream's was self-declared interpretation.
2. **CONF_FACTOR HIGH 1.00 / MEDIUM 0.60 / LOW 0.30** — brief names the table without values; chosen
   so confidence only discounts; printed in UI/code/README as an ASSUMPTION.
3. **Insight shape = brief's 7 fields** over upstream's verified different shape — same authority argument;
   the old shape recorded in the divergence register.
4. **HOT_SCORE dropped** — value never byte-readable; not guessed; the brief's 3-kind insight
   enumeration is closed.
5. **Single-file index.html** — the delivery clause names exactly three files; the 10-file doctrine
   is adapted as nine labeled IIFEs and disclosed (not silently violated).
6. **R1–R10 reconstructed** over cadence.review log + heritage buckets — same status upstream gives
   its own heritage ten; `cadenceStatus` receipts printed per finding.
7. **R26 quieting** — no mitigation-acknowledgment event type exists in the readable contracts; rule
   says so in basis instead of inventing one.

### §3 Self-caught defects during authoring (fixed before delivery)

- D1 `fin.risk.updated` fold lost update history → R11 couldn't honor *update-before-reviewDate
  doesn't count*. Fixed: `updates[]` recorded; T-covered by R11 basis lines.
- D2 R32 first draft had a dead branch + unused var → cleaned to the 30/7/past bands.
- D3 `buildInsights` crashed on projections without `insightAcks` (fixture Ps) → `ackMap||{}` guard.
- D4 T16 depended on live-store content → rewrote with in-pack collision; store-independent.
- D5 Module-9 IIFE left unclosed at EOF → closed; boot now honors the URL hash.
- D6 Data-view payload preview could stringify `undefined` → guarded.

### §4 Expected (NOT yet observed) check outcomes

T1–T18, G1–G9, C1–C10 authored to pass against the shipped code by construction + three self-review
rounds (traced T7 arithmetic, T10 boundary floats, T12/T13 object flows by hand). The authoring
environment cannot execute them; **`#/health` on your machine is the verdict**, and any FAIL row
there is the truth, with this section the record of the miss.

---

## Session 8 — pt-8: correlation rules R41–R45 + the extended run() contract

**Date:** February 2026, same-week continuation. **Env:** as Session 7.

### §0 Opening audit (pt-8)

| # | Claim | Status | Basis |
|---|---|---|---|
| 1 | Brief text for R41–R45 + the run() extension | **received in full** | this session's brief |
| 2 | "Correlation rules run AFTER individual rules; the pass receives the already-computed findings list" | implemented literally | reviewed below |
| 3 | `run(P,today) → {findings, suppressedCount, engErrors, insights, heatmap}` | implemented with EXACTLY five keys | T20 pins the key set |
| 4 | Suppression *mechanism* for findings | **NOT in the brief → labeled INTERPRETATION**: `signal.tagged {eventId: <finding key>, tag: suppress|unsuppress}`, latest-wins | §1.1 |
| 5 | `engErrors` *embodiment* | **NOT in the brief → labeled INTERPRETATION**: ENG findings (sev 5, unsuppressible, undated) + `{rule,message}` entries | §1.2 |
| 6 | Plays `systemic-intervention` etc. | resolvable playbook ids in this build | CURATED registry, `#/playbooks` |

### §1 Non-obvious decisions, one line of WHY each

1. **Suppression = `signal.tagged`, latest-wins** — the registry already owns a verified tagging
   contract (pt-5 fold); inventing a new event type would break the registry discipline for
   something the existing type already expresses. Auditable (append-only) + reversible (unsuppress).
2. **The correlation pass receives the VISIBLE list** (unsuppressed, non-ENG) — otherwise suppression
   couldn't quiet cascades, which is its only legitimate purpose; and every quieted cascade is
   printed in `#/insights` ("quieted by suppression") so silence can't be weaponized invisibly.
3. **ENG findings exist AND `engErrors` entries exist** — lineage doctrine says rule exceptions
   surface as *loud findings*; the brief names the array; both are surfaces of one fault (T20).
4. **CORR findings charge heat under a mechanical domain rule** (most common limb domain, printed) —
   a composite has no honest location; hand-picking per pattern would be editorializing inside data.
5. **CORR evidence = newest constituent evidenceAt** (`maxAt` with identity selector) — the finding
   should decay exactly as fast as its freshest limb, no faster.
6. **Keys are LITERAL `CORR:<PATTERN>`** via a `fin()` key override — the brief pins exact keys;
   the computed `R41:<scope>` form would drift from the contract text.
7. **R44 sev 5 / R45 conf HIGH carried as printed exception lines** — the brief's own language
   ("same class as R28 safety", "your own logs") is quoted in basis so a skeptic sees the warrant.
8. **`run()` is a strict 5-key view over `runFull()`** — one computation path only (no parallel
   pipelines to drift); the view layer (correlate.run) and the contract share runFull's output.
9. **The three unnamed patterns (EXECUTION_BREAKDOWN, INNOVATION_STALL, CASHFLOW_WARNING) get NO
   correlation rule** — the brief names five; inventing three more would be drift.

### §2 Self-caught defects during authoring (this part)

- D7 `corrFindings` read `def.requires.length` off CORR_DEFS (no such field) — the try/catch I'd just
  written would have turned all five into ENG findings; caught on re-read, sourced from `pat.requires`.
- D8 `corrDomain(def, active)` was called with a single pattern object (`active.filter` → TypeError →
  same ENG conversion) — signature fixed to take the pattern.
- D9 newest-constituent-evidence computed with `U.maxAt(numbers)` (expects `.at` objects) → always
  null → CORR findings silently "undated" and heat-exempt. Fixed with identity selector; T19 now
  asserts resolution text + T18 asserts all five keys so a recurrence is loud.

### §3 Files this session

`index.html` rewritten in place (2,853 lines at delivery — `wc -l` to re-verify); `README.md`
re-issued complete; this log created. The upstream working tree was not modified (no write path exists).

### §4 Expected (NOT yet observed) check outcomes — pt-8 additions

- **T19** — 5/5 correlation rules fire in the seed with the brief's exact key/sev/conf/play; pass
  order + resolution clause in basis; R44 exception + R45 cadence-HIGH lines present; dormant
  pattern ⇒ no CORR finding (geometry of existence).
- **T20** — run() returns exactly the five contract keys; suppress(R13:q-1) ⇒ suppressedCount 1,
  cascade quieted + disclosed; unsuppress (latest-wins) restores; injected throwing rule `RTEST`
  ⇒ engErrors[1] + ENG:RTEST sev 5, then clean after pop.
- **G7** — live store: contract keys exact, zero engine faults, shapes valid.
- **C11** — proven iff T19+T20+G7 pass. T1–T18 re-executed unchanged and expected green (T14/T18/G7
  were adapted to the object contract; their assertions strengthened, never weakened).

`#/health` remains the grader for every line above.

### §5 Open items for the next session (ranked)

1. Un-acknowledgement + findings-snooze symmetry review: suppression (findings) and acknowledgment
   (insights) are parallel mechanics on different event types; the brief asks for only these two —
   a unifying `life-cycle` design is a deliberate next-part decision, not a patch.
2. Byte-verify upstream `events.js` (the 7-contract registry delta), `health.js` T33–T37, `ui.js`.
3. Feed the pt-7 heat formula + CORR key contract back upstream so the interpretation converges.
4. Board pack (upstream queued #1 — still open, carried).

---

## Session 9 — pt-9: seven interactive playbook runners

**Date:** February 2026, same-week continuation. **Env:** as Sessions 7–8.

### §0 Opening audit (pt-9)

| # | Claim | Status | Basis |
|---|---|---|---|
| 1 | Brief text for the seven interactive playbooks | **received in full** | this session's brief |
| 2 | `playbook.completed` payload | **NOT in the brief beyond the name** → minimal shape `{playbookId, note?}` chosen, labeled | Session-9 §1.1 |
| 3 | `plan.checkin` payload | **reconstructed** — the pt-3 lineage names `plan.created/.checkin/.closed` (that lineage README was readable); payloads never byte-verified | Session-9 §1.2 |
| 4 | `legal.risk.logged (update owner)` semantics | the brief's exact words; realized as **projection-level supersede** (`payload.supersedes`), never a rewrite of the log | Session-9 §1.3 |
| 5 | `production-stop` (QUALITY_COLLAPSE's play) interactive form | **NOT in this brief** — ships as curated descriptor only; the runner brief for it is recorded missing, not invented | Session-9 §1.4 |

### §1 Non-obvious decisions, one line of WHY each

1. **`playbook.completed {playbookId, note?}`** — the brief names the type only at the
   systemic-intervention submit; a minimal contract keeps the audit trail useful without
   inventing fields nobody reads.
2. **Registry grew 85 → 87** (`playbook.completed`, `plan.checkin`) — submission targets must be
   registry types or the gate rejects the runner's own emits; both contracts are labeled.
3. **Owner update = projection-level supersede** — `legal.risk.logged` is keyed by its event id with
   no update handler in the readable upstream fold; rewriting history is forbidden, so the fold
   retires the superseded record per read and the new record prints what it supersedes (T22).
4. **Runners emit event SPECS only; the UI confirms before append** — carried upstream doctrine
   ("emits event specs only"); the confirm dialog prints every spec INCLUDING pre-validation
   verdicts, so a bad payload is seen before it is rejected, not discovered after.
5. **Submit is gated on the pattern being active** — a runner for a dormant pattern has no live
   subject; it shows its prefill with the dormancy printed instead of writing fiction.
6. **`ops-triage` resolves only OPEN incidents** (seed's inc-1 is already resolved → no event) —
   the brief's own "(if open)" guard; firing resolved events at closed incidents would corrupt R16.
7. **`exec.board.meeting` gets the caveat printed twice** (prefill + confirm) — logging a *scheduled*
   meeting quiets R39 as if it *happened*; any meeting logged must have its invite actually out.
8. **Prefill of `leadership-audit` prints the plan-entity gap** — no `plan.created` exists in this
   registry, so "growth plan status" reads "no plan entity exists — gap printed"; hallucinating a
   plan would be the exact failure this system exists to prevent.
9. **Partial-append honesty** — events append sequentially through the gate; if one fails, the toast
   says exactly how many landed and that the audit tail shows them; no all-or-nothing pretense.

### §2 Self-caught defects during authoring (this part)

- D10 T21 invoked `spec.prefill(P, R, now)` against the module's `(R, P, now)` signature — caught on
  the mandated re-read; would have failed every runner's prefill in the suite.
- D11 `playbook.completed`/`plan.checkin` were registered but initially had no fold handlers or
  buckets — projections would have dropped them silently; both now fold into `playbookRuns` /
  `planCheckins` and T22 pins it.

### §3 Expected (NOT yet observed) check outcomes — pt-9 additions (see also Session 11)

- **T21** — all 7 runners prefill with ≥1 printed line on the seed; every emitted spec validates
  against the registry; systemic-intervention emits `note.added` (+`exec.crisis.logged` iff
  escalation=Y) + `playbook.completed`; escalation=N emits no crisis event.
- **T22** — the two new types fold; the supersede leaves exactly one owned risk; R31's unowned branch
  quiets while the past-due branch persists (Socratic ownership: assigning an owner does not erase
  the overdue).
- **C12** — proven iff T21 + T22 + G3 pass. T1–T20 expected unchanged-green.

`#/health` remains the grader for every line above.

---

## Session 11 — pt-11 (brief "pt-6"): conversation intelligence layer

**Date:** February 2026, same-week continuation. **Env:** as Sessions 7–10 — no JS runtime at
authoring time; `#/health` is the authority wall.

### §0 Opening audit — ALL ELEVEN/TWELVE FILES

The brief requires §0 to audit all 11 files (12 with `js/conversations.js`). This delivery ships
**three physical files**; the brief's file list exists here as the **module registry**
(`LeadOS.EXPECTED_MODULES`), load-ordered exactly as the brief's script list. Audited per module:

| # | Brief's file | This delivery | Status this session |
|---|---|---|---|
| 1 | `index.html` | the shipped shell + all modules | **re-read in full**; rail gained `#/conversations` + `#/dossier`; boot guard now checks the registry before anything else |
| 2 | `css/app.css` | the inline `<style>` block | unchanged except 5 rules (focus ring, clickable pills, sparkline mono) |
| 3 | `js/util.js` | `LeadOS.util` | unchanged |
| 4 | `js/events.js` | `LeadOS.events` | **+10 contracts** (87→97); enums declared for all 6 enumerated fields |
| 5 | `js/store.js` | `LeadOS.store` | **schema v6**, `MIGRATIONS['5>6']`, `SETTING_ENUMS`; first string settings |
| 6 | `js/engine.js` | `LeadOS.engine` | **+16 buckets**, 10 fold handlers, 3 open-sets (`openConvs`, `openNegotiations`, `openConflictPairs`) |
| 7 | `js/rules.js` | `LeadOS.rules` | **+R46–R52** (45→52 rules) |
| 8 | `js/correlate.js` | `LeadOS.correlate` | unchanged this part |
| 9 | **`js/conversations.js`** | **`LeadOS.conversations`** | **NEW** — styles, 6 models, `zopaFor`, `prepareConv` (14 types) |
| 10 | `js/health.js` | `LeadOS.health` | **+T28–T32, +G10, +G41–G49**, G40 extended to 52 rules, seed extended |
| 11 | `js/playbooks.js` | `LeadOS.playbooks` | **+7 runners** with `live()` support |
| 12 | `js/ui.js` | `LeadOS.ui` (the UI IIFE) | **+2 views**, live-preview input loop, select/notes field kinds, string-safe settings editor |

Upstream byte-verification status is **unchanged since pt-7** and restated in README §0: no new
upstream reads this session. `events.js`/`health.js`/`ui.js`/`playbooks.js` upstream bodies remain
unread; nothing about them is claimed.

### §1 Non-obvious decisions, one line of WHY each

1. **v6 settings are strings, so the Data editor had to change** — the existing editor ran
   `Number(cur)` on every field; shipping v6 without that fix would have written `NaN` into
   `feedbackDeliveryModel` the first time anyone touched settings. Enums now render as dropdowns
   and are validated against `SETTING_ENUMS` before the append.
2. **`conv.planned` gains an `id`** — the brief's payload has no id, but `conv.completed` needs a
   `convId` ref; without an id the import gate and the refs contract cannot work. Documented as a
   contract addition, not a silent one.
3. **Conversation history STACKS** — `conv.completed` appends to `completions[]` and a global
   `convCompletions[]`, so a person's history is a list, never an overwrite (brief T26 → T28).
4. **`mediation.held` is the only conflict-pair signal** — the registry has no `conflict.raised`
   contract, so `openConflictPairs` is derived from mediations alone, with the gap printed in the
   UI and in `mediation-prep`'s prefill. `resolved` clears the pair under a **sorted** pair key so
   party order cannot leak a duplicate (G48).
5. **R48's "same period" = `revenueReviewCadenceDays`** — `perf.discussed` carries no period
   field; a window had to be chosen, so it is a named setting and it is printed in the basis.
6. **R50's "direct report" = roster membership** — no `reportsTo` contract exists; the proxy is
   printed in every R50 finding rather than implied by silence.
7. **`prepareConv` returns `BATNA_note` when BATNA_check is null** — "no BATNA here" is itself
   information; an absent field would read as an oversight.
8. **Termination gets a BATNA_check despite not being in the brief's three types** — the brief's
   own G42 demands that exact copy for `termination`; the brief's list and its golden disagreed,
   and the golden (the executable one) wins. Recorded here as a resolved brief-internal conflict.
9. **Live preview re-renders on a 220 ms debounce with focus/caret restoration** — a full re-render
   on every keystroke would eat the cursor; the restoration is explicit, not incidental.
10. **Runners are now `free` (ungated) vs pattern-gated** — pt-9 runners gate on an active pattern;
    conversation runners must be available before anything has gone wrong, which is the entire point.

### §2 Self-caught defects during authoring (this part)

- D12 `G10` referenced `LeadOS.EXPECTED_MODULES` before it existed — caught on the verification
  sweep; the constant is now declared at the top of the shell and drives both G10 and the boot guard.
- D13 `G2` hard-asserted `schemaVersion === 5`; with v6 shipping, a **fresh store would have failed
  the boot gate** and walled every user out of their own data. Now reads `store.SCHEMA_VERSION`.
- D14 The playbooks module used `vals()` (defined in engine, not in scope) inside the new prefills —
  would have thrown on first render of `conv-debrief`; a local helper was added.
- D15 `playbooks.get()` could not resolve the 7 new ids (they exist only in `INTERACTIVE`, not
  `CURATED`), so `playLine` printed raw ids on R46–R52 findings; `get()` now falls through to
  `INTERACTIVE`.

### §3 Expected (NOT yet observed) outcomes — pt-11

- **T1** extended: `5>6` backfills 2 with a leader value present, preserves the string, is
  idempotent, and a v3 store climbs to v6.
- **T28–T32** = brief T26–T30 (ID map printed in README and beside G41).
- **G41–G49** as written in the brief; **brief G50 folded into G40**, now asserting 52/52 rules
  from the extended seed (the T12b requirement) — the seed gained a stakes-4 unheld conversation,
  an escalation with no follow-up, an `exceeds`+`held` comp pair, a disputed rating, an unmapped
  person on file >60d, a BATNA-less negotiation, and a rejected board presentation with no prior
  alignment.
- **C14** proven iff T28–T32 + G10 + G41–G49 + G40 pass.

### §4 Open items (ranked)

1. `conflict.raised`/`conflict.resolved` contracts — would retire the mediation-only derivation.
2. `reportsTo` + 1:1 cadence events — retires R50's proxy and LEADERSHIP_VACUUM's heritage proxies.
3. `production-stop` interactive brief (requested pt-9, still outstanding).
4. Byte-verify the unread upstream bodies; reconcile registry counts honestly.
5. Executive/board pack (upstream queued #1, carried since pt-7).

---

## Session 12 — pt-12 (brief "pt-7"): organizational dynamics

**Date:** February 2026, same-week continuation. **Env:** as Sessions 7–11 — no JS runtime at
authoring time; `#/health` in the reader's browser is the authority wall.

### §0 Opening audit — all modules (the brief's 11/12-file list)

No new upstream reads this session; the upstream status table in README §0 stands unchanged
(`store.js` + `engine.js` regions byte-verified in pt-7; `events.js`/`health.js`/`ui.js`/
upstream `playbooks.js`/`HOT_SCORE` still unread and still unclaimed). Per-module changes:

| Module (`LeadOS.*`) | Brief's path | This session |
|---|---|---|
| `util` | `js/util.js` | unchanged |
| `events` | `js/events.js` | **+10 contracts** (97→107); enums on edge type, culture type/polarity, meeting type/outcome, trust direction |
| `store` | `js/store.js` | **schema v7**, `MIGRATIONS['6>7']`, 3 settings |
| `engine` | `js/engine.js` | **+18 buckets**, 10 fold handlers, `openSilos` open-set |
| `rules` | `js/rules.js` | **+R53–R62** (52→62) |
| `correlate` | **`js/correlate.js`** | **+`analyzeNetwork`, `scoreCulture`, `meetingLoad`** — extended exactly as the brief directs |
| `conversations` | `js/conversations.js` | unchanged |
| `health` | `js/health.js` | **+T33–T37, +G51–G59**, G40 → 62 rules, `FX.net3()` fixture, seed extended |
| `playbooks` | `js/playbooks.js` | **+6 runners** (14→20) |
| `ui` | `js/ui.js` | **+`#/org`**, dossier network-position + trust sections, monospace bar helper |

### §1 Non-obvious decisions, one line of WHY each

1. **Every graph function prints its own exactness class** — the brief asked for labels on
   betweenness and bridges; I labeled Tarjan as *exact* too, because a reader who sees three
   "approximation" notes and one silent function will assume the silent one is also approximate.
2. **Betweenness credits one BFS path per ordered pair** — exact Brandes needs fractional
   credit across all shortest paths; implementing a half-Brandes and calling it Brandes would be
   the exact dishonesty this system exists to prevent, so the simplification is named in the
   function, in the finding basis, and in the README table.
3. **`bridges()` returns articulation NODES, not edges** — the brief itself says "simplified:
   articulation-point detection on undirected projection"; the name `bridges` is kept (it is the
   brief's) and the discrepancy between name and semantics is printed.
4. **Culture score returns `null`, not 0, with no signals** — a zero would read as "culture is
   terrible"; null reads as "you have not observed anything", which is the truth (G58).
5. **R56 compares two scoring windows, not a stored history** — nothing derived persists, so the
   prior window is recomputed by re-scoring at `today − 30d`; both windows' math is printed.
6. **R62 is sev 5 at conf MEDIUM** — the departure is a fact and the graph is an estimate; the
   finding states both halves rather than averaging them into a dishonest single confidence.
7. **R53 requires ALL THREE absences** (no edge of any type, no 1:1 in 30d, no skip-level) — a
   single absence is a logging gap, not an isolation signal; and even then conf is MEDIUM with
   the absence-of-signal doctrine printed.
8. **`silo-break` writes `objective.set`, not `goal.set`** — the brief names `goal.set`, which
   this registry does not have; the shipped equivalent is used and the substitution (plus the
   single-owner field forcing the second owner into the objective text) is printed in code.
9. **Meeting distribution is % of MINUTES, not of meeting count** — a 15-minute standup and a
   two-hour "wasted" review are not one vote each; the denominator is printed with the number.
10. **`#/org` quick capture reuses the registry-driven form** rather than a bespoke one, so new
    org event types can never drift out of the capture surface.

### §2 Self-caught defects during authoring (this part)

- D16 The seed fired R53–R61 but **not R62**: the only non-zero-betweenness node in the seeded
  graph is `lee`, and no attrition existed for them. Traced the BFS by hand (ava→lee→dana gives
  `bet[lee] = 1`, everything else 0), then added `lee`'s departure — which is also the most
  honest illustration of the rule.
- D17 First draft of `R62` used `U.maxAt` on bare timestamps again (the pt-8 D9 failure mode);
  caught before it shipped by re-reading the helper's contract rather than its name.
- D18 `G51`'s isolate fixture originally had no roster anchor, so `px` existed only as a graph
  node and R53 (which iterates the roster) could never see them — fixture corrected to put `px`
  on the roster via `hr.performance.logged`.

### §3 Expected (NOT yet observed) outcomes — pt-12

- **T33–T37** = brief T31–T35 (ID map printed in README and in code beside the checks).
- **G51–G59** as the brief wrote them; **brief G60 folded into G40**, now asserting 62/62 from
  the extended seed: isolate with no edges/1:1 (`kai`, `max`), repeated pipeline block, a
  value-violated signal, a declining culture window, psych safety 2, a 70-day silo, an
  informal-power gap, 45% meeting waste, two trust losses from different sources, and the
  bridge-person departure.
- **C15** proven iff T33–T37 + G51–G59 + G40 pass. T1–T32 and G1–G49 expected unchanged-green;
  G2 now reads `store.SCHEMA_VERSION` (the pt-11 D13 fix), so the v7 bump cannot wall anyone out.

### §4 Open items (ranked)

1. `conflict.raised` / `conflict.resolved` contracts.
2. `reportsTo` + 1:1 cadence contracts — retires the roster proxy in R50/R53 **and**
   LEADERSHIP_VACUUM's heritage proxies.
3. **Exact Brandes betweenness** — would let R62 and `#/org` drop the approximation caveat.
4. `production-stop` interactive brief (requested pt-9, outstanding).
5. Byte-verify the unread upstream bodies; reconcile registry counts.
6. Executive/board pack (upstream queued #1, carried since pt-7).
