# LeadOS pt-15 — Personal Leadership Architecture

A leadership operating system. Append-only event log, **41 event contracts** (13 specified in the pt-15 brief · 2 core · 26 reconstructed dependency surface, labeled), **13 pure rules** (R135–R144 verified against the brief · R19/R61/R102 reconstructed, labeled), nine logical modules, one authority wall. Everything derived per read; nothing derived is ever persisted; no network call is ever made.

**Run it:** open `index.html` in any modern browser. No server, build step, framework, network, or CDN. One localStorage key.

**Verify it:** open `#/health`. Where this file and `#/health` disagree, **`#/health` wins.** It always has.

---

## §0 Claim-vs-inspection audit

| Claim | Status |
| --- | --- |
| Upstream `github.com/wbweve/Leados` @ HEAD (`e02be53`) hosts **pt-18**, not pt-14: 24 flat entries; `index.html` = **963,415 bytes**; plus a *stale* pt-5-era npm/loose-file scaffold (`store.js` carries `LINEAGE_TAG='pt-6'`, `SCHEMA_VERSION=5`; `rules.js` = 761-byte tombstone) | **BYTE-VERIFIED this session** (git trees API, tree `e02be53`; `store.js` blob `596773e`, 14,941 bytes) |
| Upstream pt-18 went a **different direction** than this brief line (their newest rules are R115–R124 narrative/board; 124 pure rules, 166 event types, 16 modules — **no `leaderSelf` module**) | **VERIFIED** — pt-18 README read in full |
| Upstream pt-14 bytes ("134 rules, 21 files", the base this brief says to continue from) | **NOT OBTAINED** — exists only inside a ~800 KB+ historical `index.html`, unfetchable via available tools (response truncation). No commit is labeled by part (all messages: "Add files via upload"). |
| `store.js` persistence core (genesis, append gate, migration ladder shape, repair counting, import gate with id-rewiring and dangling-reference dropping) | **BYTE-VERIFIED, ported near-verbatim** with changes listed in §Schema |
| Upstream R1–R134 rule bodies, pt-1..14 event contracts, `scoreCulture()`, `gapAnalysis360()`, `commitmentLedger()`, D-spine semantics, R19/R61/R102 bodies | **NOT VERIFIED** — reconstructed from pt-15 brief cross-references only; every reconstruction is labeled at the point it constrains a rule. Never claimed otherwise. |
| pt-15 brief contracts, settings, rules R135–R144, playbooks, health T71–T75 + G135–G144 | **VERIFIED against the brief text itself**, implemented literally; brief-internal conflicts labeled (§Conflicts) |

## Divergence disclosure (read first)

The pt-15 brief says "continuing from pt-14 (134 rules, 21 files)… G144: all 144 rules fire from buildSeed()." **R1–R134's semantics were never obtained** (see audit). This delivery therefore ships the complete **pt-15 layer on a faithful reconstructed kernel**, and `#/health` asserts what ships: T12b-A proves every rule **present in this file** fires from `buildSeed()` (13 rules incl. reconstructed R19/R61/R102); the wall prints the reduction rather than pretending the 144. This is the project's own doctrine applied to itself: *the wall reports the code that exists, not the code that was asked for.*

## Physical files in this delivery

`index.html` · `README.md` · `AI-SESSION-LOG.md` — **exactly these three, no more, no fewer.**

The brief names `js/leadership_self.js` the "22nd file — final module". The delivery clause (constant since pt-7 upstream, whose own README says *"three physical files ship"*) wins over the script-list fiction: nine **logical** modules live as IIFEs inside `index.html`, listed in `LeadOS.EXPECTED_MODULES` in load order and asserted by health claim C8:

`util · events · store · engine · leaderSelf · rules · playbooks · health · ui`

## Schema v15 — `MIGRATIONS['14>15']`

Backfills **exactly the four brief-specified settings** (VERIFIED): `successionReadinessCadenceDays` **90** · `legacyReviewCadenceDays` **180** · `avoidancePatternWindowDays` **90** · `careerHorizonMonths` **18**. A v1 store climbs to v15 through fourteen rungs; rungs `1>2`–`4>5` are ports of byte-verified upstream bodies; rungs `5>6`–`13>14` are **reconstructed** (upstream contents unfetched — labeled): each is an idempotent pass that appends zero repairs. Every rung is idempotent and repair-counted (C4).

## Personal Architecture Engine — `LeadOS.leaderSelf`

| Function | What it does |
| --- | --- |
| `successionDashboard(P)` | role coverage, bench depth by readiness tier, readiness gaps (developing + past reviewDate), **your own role's** coverage, at-risk candidates (cross-ref attrition/trust feeds) |
| `avoidancePatterns(P)` | five detectors — feedback (>60d, strict) · difficult-conversation (stakes ≥4, completion <50%) · decision (draft severity ≥4, >14d) · people-problem (below + no PIP + no discussion 30d) · financial (runway <12m, no allocation in period/window). **Every** pattern prints evidence, an alternative explanation, and the load-bearing label: *"hypotheses, not diagnoses…"* (C7). Named-matching is kind-aware **and** subject-aware (regression at G136 in the session log). |
| `brandGap(P)` | stated vs lived values · want-to-be-known-for ↔ 360 dimensions (substring first, small synonym lexicon second — **labeled heuristic**, printed per row) · headline consistency note (rough signal, feeds no rule) |
| `careerArc(P)` | text timeline · velocity (trailing 12m vs prior 12m) · horizon projection · **regret minimization — labeled by name and source: Jeff Bezos' framework (1994 D.E. Shaw decision account)** |
| `legacyScore(P)` | five dimensions, each with source and label; n=0 → **null, never 0** (G143 — 0 means bad, null means no data); the composite is **refused in the return value itself** (C9): a reflection tool, not a performance rating |

## Rules R135–R144 (verified against the brief)

| Rule | Fires | sev / conf | Playbook |
| --- | --- | --- | --- |
| **R135** | critical role: no candidate, or deepest = developing/not-on-path + no review in cadence · own role: best worse than ready-12m (**developing still fires**, G135) | 3 / MEDIUM | succession-review |
| **R136** | detected pattern unnamed → "possible avoidance" per pattern · named + unaddressed >30d | 2 / LOW · 3 / MEDIUM | avoidance-naming |
| **R137** | legacy defined but unreviewed past cadence · no legacy.defined after 180d in role | **2 always** (G137: reflection prompts never escalate) | legacy-review |
| **R138** | ready-now candidate AND attrition-risk or trust-lost active (G138: only ready-now — actual bench-depth loss) | 4 / HIGH | succession-review |
| **R139** | no active mentor.relationship after 90d in role | **1 / nudge** | mentor-activation |
| **R140** | ≥2 own-behavior value violations in 90d (G139: violations about others don't count) | 3 / MEDIUM | leadership-brand-definition |
| **R141** | want-term ↔ 360 dimension < **3.5 strict** AND n ≥ 3 raters | 3 / MEDIUM | leadership-brand-definition |
| **R142** | exit/transition milestone inside careerHorizonMonths×30d with no written exit plan | 3 / HIGH | exit-plan |
| **R143** | avoidance named, deadline **strictly past**, unaddressed (addressed on deadline day quiets, T74) | 4 / HIGH | avoidance-naming |
| **R144** | exit plan lists ≥3 only-you-know items AND zero knowledge-transfer plans (G140: any **one** satisfies all) | 3 / HIGH | exit-plan |

Reconstructed dependency rules (labeled `recon` in UI): **R19** (attrition-risk feed with no follow-up, sev 3) · **R61** (trust-lost feed with no repair move, sev 4) · **R102** (sev-1 nudge class is the only verified fact about it; body = no reflection in 60d).

## Playbooks (7, all pt-15)

`succession-review` · `legacy-review` · `avoidance-naming` · `career-arc-review` · `leadership-brand-definition` (live known-vs-wanted rendering, per brief) · `exit-plan` · `mentor-activation`. Each prints a prefill of evidence before you write; **refusals are printed, never silent** — e.g. an acknowledged avoidance without cost/commitment/deadline refuses ("a named avoidance without a date is a wish, and R143 will hold you to it"); a TBD successor with an empty knowledge-transfer list refuses ("…the only continuity you have").

## Views

`#/today` (findings; sev-1 nudges dimmed + collapsed — *"N nudges hidden — expand"*) · `#/self` (legacy scorecard · succession bench grid · career timeline · avoidance tracker · brand gap · mentors · board contributions) · `#/playbooks` · `#/log` (validated manual append + contract provenance table) · `#/data` (export incl. **#/self section labeled as self-assessment data, not operational data** · import gate · confirm-gated reset) · `#/health`.

## Health wall

**T71–T75** · **G135–G144** · **T12b-A/B** · **claims C1–C10** — 26 checks, all expected PASS (executed headlessly during authoring; re-executes in your browser on every `#/health` load). T12b-A and T12b-B are separate seeds because R142 (no exit plan) and R144 (exit plan with ≥3 only-you-known items) cannot fire from one log state — a **brief-internal conflict**, resolved by splitting and printed in the test names.

## Brief-internal conflicts found and labeled

1. `leader.exit.plan` field spelled `what_only_you_know` (schema header) vs `what_you_only_know` (R144/playbook) → both accepted; rules read the union.
2. `succession.reviewed.candidateId`, `legacy.reviewed.legacyId`, `avoidance.addressed.avoidanceId` reference ids the brief's own contract bodies don't declare → `id` REQUIRED on the creating contracts.
3. G144 asks one seed to fire rules that are mutually exclusive (R142 vs R144) → T12b-A/B split.
4. R136/R143 vs kind-ambiguous named matching → kind- and subject-aware matcher (see session log).

## The non-negotiables, unchanged

- append-only log; one localStorage key (`leados:data`)
- everything derived is recomputed per read; **nothing derived is persisted** (C2, C5)
- **missing fields skip rather than infer**
- a count is never stated as certainty — arithmetic and event types are printed
- every finding links its playbook or **prints why it has none** (C10)
- n=0 renders **null**, never 0; hypotheses print alternative explanations
- zero network calls, permanently (C6); data leaves only when you export it

## Explicit non-claims

- **R1–R134 do not ship in this file** and nothing about their bodies is claimed (unverified upstream bytes). The "144" in the brief is a target the wall honestly reduces, not a count this file pretends to.
- All R19/R61/R102 bodies, `scoreCulture`, `gap360`, `commitmentLedger`, D-spines, leader-resolution precedence, tenure-from-log, and every reconstructed event contract are **labeled interpretations**, not upstream truth.
- Readiness tiers, 360 scores, legacy dimensions and brand gaps are **self-assessment data** — reflections, not ratings; nothing here is clinical, legal, HR, accounting, or investment advice.
