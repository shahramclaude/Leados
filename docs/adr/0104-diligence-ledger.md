# ADR-0104 — The Diligence Ledger: before you decided, what was knowable, and did the organisation actually look?

- **Status:** Accepted
- **Date:** 2026-11-06
- **Session:** 144
- **Schema:** v106 (additive `105 → 106`)
- **Route:** `#/diligence`
- **CSV scope:** #100 `diligence` — aggregate only
- **Engine:** `diligence-ledger-2026.11-v1` (`app/core/domain/diligence.js`, `diligenceRules.js`)

## The question this module answers

Session 142 (the Hindsight Lock) froze what a decision *consulted*, by reading the
links that already existed on the decision date. Session 143 (the Epistemic
Ledger) harvested what the *record* knows and nobody read. Both left the same
hole, named in both roadmaps as the largest gap: **`missed` is only visible if a
later link was made.** A leader who looked at a fact, judged it irrelevant and
never linked it is indistinguishable from a leader who never looked. A fact that
nobody logged is invisible to both. The coverage number therefore measures link
hygiene as much as deliberation.

This module closes that hole at the *decision*, not at the audit. It freezes the
**knowable set** — the dated fact pointers from five evidence classes other
modules own — in the same atomic transaction that records the decision, and it
makes "we looked at X" a first-class, dated, append-only act with three honest
dispositions. It is not a checklist app: a checklist asks a human to type what
they remember; this ledger derives what the record already held and asks only for
the judgement.

## The five readings

**1. The frozen frontier (RULE-DLG-01).** For each decision, `knowableFacts`
reads five classes: `risk` → cases, `assumption` → premises, `commitment` →
delegations, `objective` → goals, `precedent` → **strictly earlier settled
decisions**. A fact is a POINTER (`sourceType`, `sourceId`, `evidenceClass`,
`evidencesOn`, `severity`) — never a title, a note, a person or an amount. A
record with no established date is excluded, because it cannot be shown to have
existed at decision time. The frontier id is `dlg-<FNV1a(decisionId)>`, so a
rescan cannot duplicate it. **The date lists are field fallbacks, first present
wins**: `normalizeState` stores premises and goals with an ISO `createdAt` and no
`createdOn`, so a vocabulary naming only the ideal field would silently harvest
three of five classes as zero facts. That defect was found by reading the
normalised record in a test, not from the docs.

**2. Consultation is diligence, including dismissal.** `used`, `deferred`, and
`ruled-out` **with a required written reason** all count as consulted. A
`ruled-out` row without a reason is dropped by the normalizer rather than
repaired into a claim nobody made. Only an unconsulted knowable fact is a gap.
A duplicate `(checklist, fact)` is refused at write time.

**3. Wilson + Jeffreys, with declared refusals.** Coverage is a Wilson (1927)
score interval on the consulted share, **REFUSED** below the declared knowable
floor (BLANK, never zero). Class-level inattention is an **exact**
Jeffreys Beta(½,½) equal-tailed 90% credible interval computed by bisection on
the regularised incomplete beta (Lanczos log-gamma + Numerical Recipes continued
fraction), not a normal approximation. A class whose whole upper bound sits
below the declared ceiling is **DARK** — the evidence class this organisation
systematically walks past. The unit is the class and the span, never a person.
Cell keys are `(frontier, fact)`, so a consultation recorded against one
decision cannot silently credit the same record inside another frontier.

**4. A pre-declared PROCESS forecast, graded once.** A leader freezes, before
settlement, the classes they expect to consult plus one probability.
RULE-DLG-04 grades it exactly **ONCE**, out of sample, after the decision
settles, by Brier (1950) skill against a strictly-prior maximum-entropy `0.5`
base rate. A negative skill (overconfidence) is printed, never clamped. A
forecast declared after the outcome is refused at write time: hindsight is not
foresight. Its claim floor is a **separate declared convention** — a forecast can
declare at most five classes plus one coverage claim, so reusing the knowable
floor here would make every grade permanently refused, a dead end rather than a
conservative bound.

**5. Settlement is derived, not cached.** A frontier is frozen while the
decision's outcome is still `pending`. `settlePass` re-reads the decision record
on every commit and updates the frozen row's `status`/`outcome` idempotently.
Without it, a forecast legitimately declared before settlement could never be
graded and a settled gap could never be found. It writes no event and opens no
work.

## Cross-module propagation and cross-altitude roll-up — the same transaction

`diligenceRule` is registered on the shared post-commit spine immediately before
`attentionMarketRule`, with a declared `PROPAGATION_CONTRACTS` entry
(`85` rules / `85` contracts). On the **single commit** that records a decision,
RULE-DLG-01 writes:

- one `diligence-for` edge to the decision;
- one `deliberates-on` edge per knowable fact, across `case`, `premise`,
  `delegation`, `goal` and `decision` endpoints (five modules owned by other
  code, one generalised `ensureEntityLink` call — no per-module glue);
- one `rolls-up-to` edge per leadership ancestor of the owning span, so a
  frontline decision reaches manager → director → VP/executive → the workspace
  leader's aggregate with **zero re-entry**.

`tests/app/diligence-ledger.test.mjs` proves all of the above on a real store
loaded from storage: the links carry the same `createdAt`, a rescan duplicates
nothing, a director's scoped report contains the frontline frontier, and a peer
frontline seat cannot see it. The typed graph node projects structural counts
and dates only.

RULE-DLG-02 opens exactly ONE governed deliberation-gap decision per span per
ISO week for a settled frontier below the floor. RULE-DLG-03 opens ONE governed
redesign decision per dark class per ISO week. Both are marker-idempotent,
bounded by `DILIGENCE_LIMITS`, pausable by `diligenceAutoPropagate`, and an
explicit `diligence.scan` always runs. `diligenceFindingIds` exports the
`gap`/`dark` decision ids so the Hindsight Lock refuses to lock this module's
own audit output — the exact second-order-decision regression the Epistemic
Ledger's merge exposed — and only those decisions, never the ordinary human
decisions a `freeze` marker points at.

**Event scope (regression hardening).** The shared spine runs on EVERY commit, so
a ledger that re-read the whole workspace on an unrelated premise or case write
would open governed work and flood the bounded derived-event queue. This rule
wakes only for ROOT `decision.created|updated|made|decided|reviewed|withdrawn`
events, settlement events, its own `diligence.*` events, or an explicit
`diligence.scan`; derived `decision.created` events emitted by other rules are
audit output, not new human commitments. `settlePass` derives frontier status on
every commit but writes no event and opens no work. Findings run only on
explicit, own or settlement passes, with a whole-ledger budget so two identical
scans converge. An explicit whole-workspace replay (the assurance rehearsal or
`retryWatchPromotion`) uses `MAX_REPLAY_EVENT_BUDGET = 256`; ordinary production
writes keep the 64-event cap. This is the generalized spine with a declared
activation contract, not a per-module subscription shortcut.

## Governing conventions (declared, clamped and printed, never fitted)

`diligenceKnowableFloor` (8), `diligenceCoverageFloorPct` (70),
`diligenceClassFloor` (6), `diligenceDarkCeilingPct` (30),
`diligenceGradeClaimFloor` (3), `diligenceForecastHorizonDays` (45),
`diligenceReviewDays` (14), `diligenceStaleDays` (90),
`diligenceAutoPropagate`. `record-diligence-consult` (rank 1–5) records a
consultation, freezes a forecast or runs a scan at the acting seat;
`govern-diligence` (rank 4–5 **and** `seat.fullAccess`) re-declares the
conventions. All reads are `SAFE_READS`; the view receives the scoped report.

## Disclosure, schema and honest limits

`MODULE_MANIFESTS.diligence` declares `unit` class, an adapter-scoped report,
and **`detailCeiling: 0`** — raw fact pointers and written consultation reasons
never enter a declared-seat projection. CSV #100 is aggregate-only: one summary,
one row per evidence class, one per altitude, one per once-only grade; a refused
or suppressed figure is BLANK, never zero; no frontier id, decision id, person,
note or forecast question is emitted. The upward brief is identity-free.

Schema v106 is additive: four collections, eight clamped conventions, fail-closed
normalizers, **no back-fill**. An upgraded workspace opens with empty ledgers —
"no knowable set has been frozen here yet", a different claim from "every
decision was fully diligent".

**Honest limits.** Coverage is bounded by what this workspace recorded; work
nobody logged is invisible. The conventions are declared, never fitted. A local
seat is a workflow declaration, not authentication. A real-browser assistive
technology walkthrough of the six panels is `[UNVERIFIED]` (jsdom + axe-core is
what ran). No per-person diligence score, no sentiment survey, no composite
index, no LLM-invented risk, no automatic closing of a human decision.

## Competitive position (2026 hunt, public snippets only)

Decision-provenance literature demands an immutable log linking each decision to
the *inputs that generated it* [1](https://www.labarna.ai/blog/the-audit-trail-an-autonomous-system-must-produce),
and legal-AI logging explicitly records **"alternatives rejected"** so a reader
can distinguish a blind spot from a deliberate choice [4](https://law.co/blog/forensic-logs-legal-ai-decisions).
Commercial decision tracking (Cloverpop, Loomio, Notion/Confluence decision
logs, Otter, Fellow) records *what was decided, why, and which options were
rejected* — as a human-typed register [2](https://otter.ai/blog/best-decision-tracking-software)
[3](https://www.guideflow.com/blog/best-decision-making-tools)
[5](https://www.getlockstep.dev/blog/best-decision-log-tools-product-engineering).
Prediction journals (Brier, Hindsight, decision-log) pre-register a probability
and score it with Brier/Murphy decomposition and Wilson intervals, with
"refuse to show a number it cannot support" floors
[1](https://github.com/Warlockobama/decision-log)
[2](https://brier.ink/)
[3](https://github.com/imSuvro/hindsight).
**None of the surveyed products** freezes a *derived* knowable set from five
other modules at decision time, treats "ruled out with a reason" as diligence,
detects dark evidence classes with an exact Jeffreys interval, grades the
leader's own *process* forecast out of sample, and rolls the whole frontier up
the reporting tree in the same atomic write under disclosure governance. This
is a **gap claim, not a market-first claim**: vendor capability was not audited,
only public descriptions were read.
