# LeadOS pt-11 — Conversation Intelligence Layer

A universal leadership and management operating system. Append-only event log, **97 validated
event types**, **52 pure rules** (R1–R40 individual · R41–R45 correlation · **R46–R52
conversation**), a correlation engine (clusters · confidence-weighted decayed heat · named
patterns · benchmark gating), an insight layer, interactive playbook runners, and now a
**conversation preparation system** — everything derived per read, nothing derived persisted.

**Run it:** open `index.html` in any modern browser. No server, no build step, no framework,
no network, no CDN. One localStorage key.

**Verify it:** open `#/health` — the authority wall. Where this file and `#/health` disagree,
**`#/health` on your machine wins.**

---

## §0 Claim-vs-inspection audit

| Claim | Status |
|---|---|
| Upstream tree @ `a1ed70f`: 22 flat entries, no `css/`/`js/`, npm scaffold + `rules.js` tombstone, unbootable as shipped | **BYTE-VERIFIED** (pt-7 session, git trees API) |
| `store.js` full read (schema ladder, repair counting, single key) | **BYTE-VERIFIED** — ported near-verbatim |
| `engine.js` fold table / buckets / aliases / open-sets / roster; pt-5 handlers; pt-6 pattern library; upstream heat `sev × decay^ageDays` with no CONF_FACTOR; upstream insight shape; promotion-rule string | **BYTE-VERIFIED (those regions)** |
| `events.js` full 92-type registry · `health.js` · `ui.js` · upstream `playbooks.js` · `HOT_SCORE` | **NOT VERIFIED** — beyond fetch truncation; never claimed |
| pt-8/pt-9/pt-10/pt-11 briefs | received in full, implemented literally; every interpretation labeled below |

**Registry:** 97 contracts (85 pt-7 + 2 pt-9 + 10 pt-11). Upstream claims 92 for its own tree;
the sets are not comparable without the unread `events.js` — **stated, not reconciled by guess.**

## Delivery & the file-table question

The brief names `js/conversations.js` as a 12th file and asks for a 12-entry table. **This
delivery has shipped as three files since pt-7** (the delivery clause: `index.html`,
`README.md`, `AI-SESSION-LOG.md`), so the multi-file doctrine is honored **structurally rather
than physically** and the divergence is stated rather than papered over:

| # | Logical module (`LeadOS.*`) | Upstream path analog | Role |
|---|---|---|---|
| 1 | `util` | `js/util.js` | time/number/string helpers, deep-equality |
| 2 | `events` | `js/events.js` | 97-type registry + append-gate validator |
| 3 | `store` | `js/store.js` | persistence wall, **schema v6**, migrations, import gate |
| 4 | `engine` | `js/engine.js` | `project()` fold, named projections, selectors |
| 5 | `rules` | `js/rules.js` | R1–R52, `fin()` contract, the `run()` pipeline |
| 6 | `correlate` | `js/correlate.js` | clusters · heat · patterns · insights · benchmarks |
| 7 | **`conversations`** | **`js/conversations.js`** | **styles · models · ZOPA · `prepareConv()`** |
| 8 | `health` | `js/health.js` | T-suite, G-suite, claims |
| 9 | `playbooks` | `js/playbooks.js` | descriptors + 14 interactive runners |
| 10 | `ui` | `js/ui.js` | rail, hash routes, views, boot gate |
| — | `index.html` · `README.md` · `AI-SESSION-LOG.md` | shipped files | the three physical artifacts |

`LeadOS.EXPECTED_MODULES` is the boot guard's list, **load-ordered exactly as the brief's script
list** (`conversations` after `correlate`, before `playbooks`). A missing module halts rendering
and names it; G10 asserts the list including `conversations`.

---

## Schema v6 — `MIGRATIONS['5>6']`

Backfills three settings as repair events under the identical contract (leader values never
overwritten, every repair counted, idempotent — T1): `negotiationStyleDefault` **'collaborative'**
· `feedbackDeliveryModel` **'SBI'** · `conflictMediationModel` **'DESC'**. These are the ladder's
**first string settings**: the Data view renders enum dropdowns and never coerces them to Number
(a coercion bug here would write `NaN` into your operating doctrine). A v3 store climbs to v6.

## The conversation engine — `LeadOS.conversations`

- **`styleFor(personId, P)`** — latest `influence.mapped` wins (append order), returns the style
  plus its printed guidance. Unmapped returns `known:false` with *"never guessed"* — R50 nudges
  you to observe; it never infers a style.
- **`prepareConv(type, ctx, P)`** — 14 types, each returning `opening_line` (**SCAFFOLD, not a
  script — use the shape, not the words**), `their_likely_response` (**HYPOTHESIS from the log,
  not a prediction**), 2–3 `your_reframes` as if-they-say → you-say pairs, `non_negotiables`,
  `BATNA_check` (negotiation/compensation/performance/termination only; other types print *why*
  they have none), and 3 type-specific `debrief_questions`. The opening adapts to the mapped
  influence style: analytical leads with data **before** conclusions (G43), expressive leads with
  the relationship, driver leads with the outcome.
- **Models** — SBI · **COIN** (C/O/I/N, where **N is the action, not optional** — `validateModel`
  rejects a missing N with that reason printed, G41) · BID · **GROW** (3 options minimum) ·
  DESC · **ICF** (Interests / Common ground / Forward). Which model applies is read from the v6
  settings and the source is printed on the output.
- **`zopaFor(neg)`** — numeric range when both BATNAs are numeric; **null when either is missing**
  (T29); inverted BATNAs print *"recalibrate before entering"* rather than a fake zone; always
  carries the caveat that their BATNA is an estimate you wrote.

## Rules R46–R52

| Rule | Fires | sev / conf |
|---|---|---|
| **R46** | `conv.planned` stakes ≥ 4, no `conv.completed` within 7d (>14d escalates) | 3 → 4 / HIGH |
| **R47** | outcome `escalated` with no follow-up `conv.planned` or `mediation.held` within 5d | 4 / HIGH |
| **R48** | `comp.discussed` "held" + `perf.discussed` "exceeds" in the same period | 3 / HIGH |
| **R49** | rating `disputed`, no `conv.planned` or `hr.pip.started` within 14d | 3 / HIGH |
| **R50** | no `influence.mapped` for a person on file > 60d | **1 / LOW — a nudge, not an alarm** |
| **R51** | `negotiation.logged` with `myBatna` null or absent | 3 / HIGH |
| **R52** | `board.presented` "rejected" with no `exec.aligned` in the 30d prior | 4 / HIGH |

Printed scope decisions: *"same period"* (R48) = `revenueReviewCadenceDays`, because the registry
carries no period field on `perf.discussed`; *"direct report"* (R50) = roster membership, because
this registry has **no `reportsTo` contract** — both gaps printed in the finding basis, never
inferred away.

## New playbooks (7)

`conv-prep` (master router, **live** `prepareConv()` preview as you type) · `conv-debrief`
(prints the 3 type-specific questions carried from the plan, G47) · `negotiation-prep` (**live**
ZOPA) · `compensation-prep` (prints the R48 retention signal when active) · `termination-prep`
(carries the brief's verbatim note and the unconditional BATNA copy, G42) · `mediation-prep`
(**live** ICF frame) · `restructure-announcement-prep` (affected list drives `exec.aligned`
stakeholders exactly, G49). All emit **event specs you review before anything is appended**.

## Views

`#/today` · `#/signals` · `#/insights` · `#/heatmap` · `#/benchmarks` · **`#/conversations`**
(upcoming by stakes desc then oldest prep · last 20 completed with outcome chips · influence map
with unmapped rows dimmed · negotiations with BATNA + ZOPA · open conflict pairs · quick capture)
· **`#/dossier`** (per person: conversation history, influence-style card with behavioral notes,
negotiation history, live findings) · `#/playbooks` · `#/health` · `#/data`.

Conversation findings on Today/Signals carry a **prepare** button that opens `conv-prep` with the
conversation type and subject pre-populated from the finding (R47→mediation, R48→compensation,
R49→performance, R51→negotiation, R52→board-presentation, R46→the planned conversation's own type).

## Health wall

**T1–T32** (pinned fixtures, epoch `2026-02-16T12:00:00.000Z`) · **G1–G10 + G31–G49** (live store
and goldens) · **claims C1–C14**.

> **ID map, printed because ids are the contract:** this part's brief numbered its checks T26–T30,
> but T26/T27 were already assigned in pt-10. They ship as **T28–T32** (brief T26→T28 · T27→T29 ·
> T28→T30 · T29→T31 · T30→T32). G41–G50 keep the brief's ids; **brief G50 is folded into G40**,
> which now asserts all 52 rules fire from the extended seed (the T12b requirement).

## Explicit non-claims

- **The browser is the grader.** No JS runtime at authoring time; correctness is by construction
  and fixture tracing. Every count is executable in `#/health`, none is claimed observed.
- **Labeled interpretations:** CONF_FACTOR values · findings-suppression mechanics · ENG-fault
  embodiment · `playbook.completed` / `plan.checkin` shapes · R48's "same period" window ·
  R50's "direct report" proxy · conflict pairs derived from `mediation.held` alone (no
  `conflict.raised` contract exists — the gap is printed wherever it matters).
- **Every conversation output is a scaffold, never a script**; every counterpart response is a
  hypothesis, never a prediction. The system prepares you; it does not speak for you.
- Heat is a composite signal, not a measurement. The seed is a fixture, not a diagnosis. Nothing
  here is legal, HR, or financial counsel — least of all `termination-prep`.
- No accounts, no sync, no network, permanently. Data leaves only when you export it.

## Ranked next

1. **`conflict.raised` / `conflict.resolved` contracts** — conflict pairs currently derive from
   `mediation.held` alone; R6-style conflict rules deserve a first-class signal.
2. **`reportsTo` / 1:1 cadence events** — would retire R50's roster proxy and LEADERSHIP_VACUUM's
   heritage proxies in one stroke.
3. **`production-stop` interactive brief** (requested in pt-9, still not received).
4. **Byte-verify the unread upstream bodies** and reconcile the registry count honestly.
5. **Executive/board pack** (upstream's own queued #1, still open).
