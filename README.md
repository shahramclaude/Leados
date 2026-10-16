# LeadOS pt-18 — Narrative Intelligence

A universal leadership and management operating system. Append-only event log,
**166 validated event types**, **124 pure rules**, sixteen functional modules, one authority wall.
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
| pt-8 … pt-18 briefs | received in full, implemented literally; every interpretation and brief-internal conflict labeled |

No new upstream reads this session. **Registry: 166 contracts.**

## Module registry

Three physical files ship (the delivery clause, constant since pt-7). The brief's script list
lives as `LeadOS.EXPECTED_MODULES`, in load order, enforced by the boot guard and asserted by G10:

`util · events · store · engine · rules · correlate · conversations · decisions · execution ·
external · calibration · finIntel · narrative · health · playbooks · ui`

## Schema v13 — `MIGRATIONS['12>13']`

Backfills `boardNarrativeReviewDays` **14** · `allHandsCadenceDays` **30** ·
`investorUpdateCadenceDays` **30** · `communicationHitRateWindow` **180**. A v3 store climbs to
v13 through ten rungs, every one idempotent and repair-counted.

## Narrative intelligence — `LeadOS.narrative`

Numbers without a narrative get ignored; a narrative without numbers gets dismissed. Every
builder returns a **preparation scaffold** in which each datum is tagged with the event it came
from — `revenue 900 [from fin.pl.logged, period 2026-Q1]` — so you can verify every line before
the room does.

| Function | What it does |
|---|---|
| `commHitRate` | hit rate (`aligned`/`engaged` ÷ total) overall, **by type**, and **by audience-size bucket** (`<10 / 10-50 / 50-200 / 200+`); unexpected-question mean as a preparation-gap proxy; consecutive same-topic runs |
| `narrativeQuality` | per-dimension means and a composite `clarity×0.35 + credibility×0.35 + persuasiveness×0.2 + resonance×0.1`, with **every weighted term printed** and the weights labeled an assumption; `{score: null, note: "no feedback logged (n=0)"}` at n=0 |
| `buildBoardNarrative` | OPENING · NUMBERS · WINS · **RISKS** · ASK — each line source-tagged; **every sev-5 finding is included regardless of count** |
| `testMessage` | predicted response from *your own* influence maps (never market research), plus analytical / driver / expressive re-framings and a misreading risk |
| `buildInvestorUpdate` | METRICS · WINS · CHALLENGES · TEAM · ASK in the common VC convention, labeled as a convention |

**The honesty rails are load-bearing.** Outcomes are *self-reported from your own delivery log* —
so R116, R119 and R120 are conf MEDIUM while R115 (a calendar fact) and R121 (your own
acknowledgement flag) are HIGH. The board scaffold carries: *"RISKS ARE THE REAL ONES, not the
sanitized version — a board that learns a material risk from someone else stops trusting the
whole report."*

## Rules R115–R124

| Rule | Fires | sev / conf |
|---|---|---|
| **R115** | board due inside `boardNarrativeReviewDays` with no board draft; < 3d out | 3 → 4 / HIGH |
| **R116** | hit rate < 60% with **n ≥ 5**; < 40% | 3 → 4 / MEDIUM |
| **R117** | no all-hands in > cadence; > 2× | 2 → 3 / HIGH |
| **R118** | no investor update in > cadence; > 2× | 2 → 3 / HIGH |
| **R119** | clarity mean < 3 across ≥3 narratives of one type | 3 / MEDIUM |
| **R120** | mean unexpected questions > 3 over ≥5 deliveries; **same topic ×3 consecutive** | 3 → 4 / MEDIUM |
| **R121** | urgency ≥ 4 unacknowledged after 24h; urgency 5 after 4h | 3 → 4 / HIGH |
| **R122** | negative press with no press draft in 48h; **≥2 negatives in 14d → 4 regardless** | 3 → 4 / HIGH |
| **R123** | board `skeptical` with no `exec.aligned` in 7d; `hostile` in 3d | 4 / HIGH |
| **R124** | board/investor narrative with no `message.tested` — **one test satisfies it** | 2 / HIGH |

R115 derives "upcoming board" from the latest `exec.board.meeting` plus `boardCadenceDays`,
**because this registry carries no calendar** — printed in every finding rather than implied.

## New playbooks (5)

`board-narrative` · `investor-update` · `all-hands-prep` · `message-test` (live re-framings) ·
`narrative-debrief`. Several refuse to write: a board narrative whose risks section is a
placeholder **while material risks are active**, an investor update with no challenges listed,
an all-hands prep with a placeholder hard-truth, a message test with zero testers.

## Views

`#/today` · `#/signals` · `#/insights` · `#/heatmap` · `#/benchmarks` · `#/conversations` ·
`#/org` · `#/decisions` · `#/execution` · `#/external` · `#/finance` · **`#/narrative`**
(hit rate by type and audience size · awaiting-delivery queue · press log · all-hands history ·
investor updates with MRR sparkline · message-test log) · `#/self` · `#/dossier` · `#/playbooks`
· `#/health` · `#/data`.

## Health wall

**T1–T67** · **G1–G10 · G31–G123** · **claims C1–C22**.

> **ID map:** this brief numbered its checks T61–T65, but T61/T62 were taken in pt-17. They ship
> as **T63–T67** (brief T61→T63 … T65→T67). G115–G123 keep the brief's ids; **brief G124 is
> folded into G40**, which asserts all **124** rules fire from one seed.

## The non-negotiables, unchanged since pt-1

- trends need **≥3 measured points**
- **missing fields skip rather than infer**
- **a count is never stated as certainty** — the arithmetic and the event type are printed
- **suppression is auditable and reversible** — with exactly one hard override: **R88
  non-compliance can never be suppressed**, and a refused attempt is printed on the finding
- every finding links the playbook that resolves it, **or prints why it has none**
- the README names exactly the files on disk — **no more, no fewer**
- the AI-SESSION-LOG §0 opens with a **claim-vs-inspection audit**
- **no JS runtime in the authoring environment — correctness by construction; the browser is the grader**

## Explicit non-claims

- **The browser is the grader.** Every count here is executable in `#/health`; none is observed.
- **Communication outcomes are your reading of the room**, not the room's. Hit rate, clarity
  means and question counts all inherit that, and the rules that read them say so.
- **Labeled interpretations** carried forward: CONF_FACTOR · suppression mechanics · ENG-fault
  embodiment · contracts the briefs named but never specified (`playbook.completed`,
  `plan.checkin`, `decision.outcome`, `partner.reviewed`, `plan.created`) · R48 "same period" ·
  R50/R53/R97 roster proxy · conflict pairs from `mediation.held` alone · culture 2× weight ·
  betweenness and bridges as approximations · R67/R114's scenario-count proxy · R78's
  retro-completion inference · R90's bottom-quartile estimate · R115's cadence-derived board
  date · narrative composite weights · every text-match correlation.
- **Nothing here is clinical, legal, HR, accounting, investment, or PR advice.**
- **Zero network calls, permanently.** Data leaves only when you export it.

## Ranked next

1. **A calendar contract** (`meeting.scheduled` with a future date) — would retire R115's
   cadence-derived "upcoming board" proxy, the newest inference in the system.
2. **`conflict.raised` / `conflict.resolved`** and **`retro.action.completed`** — the contracts
   whose absence still forces printed inferences (R61/G48, R78).
3. **`reportsTo` + 1:1 cadence contracts** — retires the roster proxy in R50/R53/R97.
4. **A `decision.severity` field** — retires the scenario-count proxy shared by R67 and R114.
5. **Exact Brandes betweenness** — retires R62's approximation caveat.
6. **`production-stop` interactive brief** (pt-9) and **`fin-scenario-model`** (named by G107) —
   both requested, neither ever specified.
7. **Byte-verify the unread upstream bodies**; reconcile registry counts honestly.
8. **Executive/board pack** — upstream's queued #1, carried since pt-7; pt-18's
   `buildBoardNarrative` is the closest this line has come to closing it.
