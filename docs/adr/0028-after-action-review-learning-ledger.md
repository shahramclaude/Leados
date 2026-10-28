# ADR-0028 — The After-Action Review & Learning Ledger (Schema v43)

- **Status:** Accepted
- **Date:** 2026-10-28 (Session 63)
- **Supersedes:** nothing
- **Related:** ADR-0008 (post-commit rules hook), ADR-0015 (Impact Ledger), ADR-0019 (Premise Sentinel), ADR-0023 (Structural Capital Allocation), ADR-0026 (Propagation Ledger), ADR-0027 (Strategy Coherence Terminal)

## Context

After 62 sessions LeadOS can price a decision, allocate a structural budget,
sense saturation, test assumptions, measure whether the strategy is funded as
declared, and price its own automation. Every one of those engines answers a
question about **the work**.

None of them answers the question that separates a team that compounds from a
team that repeats:

> When something ended, did we find out why — and did anything change?

The existing learning machinery is real but narrow. The Impact Ledger
(ADR-0015) grades whether a *pre-registered intervention* moved a *metric*,
with an interrupted time series, placebo tests and an honest refusal to call
noise an effect. Calibration grades whether forecasts were well calibrated.
Premise Sentinel grades whether a stated assumption survived.

All three are statistical instruments applied to predictions. None of them
records what a room of people concluded after an event, and none of them can
say the sentence that matters most to a leader:

> You have diagnosed this same class of failure three times. The change you
> committed after the second one was never made.

No incumbent product prints that sentence, because printing it requires
(a) a dated record of the event's close, (b) the intention as it was frozen
*before* the outcome was known, (c) a classification of the lesson that is
stable enough to count, and (d) the willingness to store a committed change as
open until a human says it was made.

LeadOS already holds (a) and (b) — case forecast snapshots frozen at opening,
settled actuals, decision probabilities recorded before the call, delegation
due dates. It held none of (c) or (d).

## Decision

### 1. One collection, one review per closed event

`retros` holds one record per review: the subject (a case, change, decision,
delegation, or an event outside the workspace), the date the event ended, the
four AAR answers plus a sustainment answer, who was in the room, and the dated
lessons it produced. One review per subject is enforced at normalisation; a
second draft for the same closed record is a duplicate prompt, not a second
review.

### 2. The intention is read from the record, not from memory

`subjectEvidence` pre-fills "what was supposed to happen" from the frozen
forecast snapshot and "what actually happened" from the settled actuals where
those exist. The closing date is read from the record and cannot be typed over;
a review cannot be held before the outcome it reviews. This is the mechanism
that stops a review from becoming a hindsight story, and it is the reason the
feature is only possible in a workspace that already kept receipts.

### 3. The cause is never inferred

The two pre-filled questions are evidence. The "why" is a human sentence with a
12-character floor, or the review is not held. There is no model, no keyword
rule and no template that writes a cause.

### 4. A lesson must be classified, and must say what changes

The class list is deliberately short and each entry names a **system** failure
mode, not a person: estimation, scope, dependency & handoff, decision quality,
escalation, quality & rework, staffing & capacity, communication, process &
ritual, assumption, other. Classes make recurrence countable; a lesson filed as
`other` can never show a pattern. `changeType: 'none'` is a first-class answer:
it is stored as an **observation**, displayed beside committed changes, and
excluded from the applied rate. Single-loop learning (fix the error) and
double-loop learning (change the policy that produced it) are therefore
distinguishable in the record rather than conflated in a "lessons learned"
document.

### 5. Applied means a dated human note

A committed change moves from `open` to `applied` only with a date and a
sentence about what is now different; `dropped` requires the same, and is the
honest alternative to a loop that rots as "open" forever. Closing the related
delegation is explicitly **not** evidence: the delegation closing is a record
that a task ended, not that a practice changed.

### 6. Recurrence is measured across distinct events

A class counts as recurring when it appears in two or more held reviews of
different events. Two lessons in the same review are one event that taught two
things. A class is an **unclosed recurrence** when the earliest review that
committed a change for it is still `open` and a later, distinct event produced a
lesson of the same class. That is the finding that justifies the terminal.

### 7. Three rules on the existing spine

| Rule | Trigger | Effect |
|---|---|---|
| `RULE-AAR-01` | a case resolves / a change anchors or is abandoned / a decision is reviewed / a delegation completes | writes one empty review with the two evidence questions pre-filled from the record. No cause, no lesson, no decision |
| `RULE-AAR-02` | a lesson is recorded on a held review | a `delegation`-type change opens one owned delegation; a `decision`-type change opens one DACI decision; any owned lesson queues one blameless follow-up talking point. Markers are stable and replay is a no-op |
| `RULE-AAR-03` | the same commit path | one close-or-drop decision per recurring class with a still-open earlier change — at most two per transaction, idempotent per class and first-open lesson |

The cheap path (`RULE-AAR-01`) is an id lookup on the record that just closed,
so no other module's write pays for a scan. The expensive path runs only on
`learning.*` events.

### 8. Coverage, latency and rates carry their denominators

Coverage = dated closures in the window that carry a held review or a dated
skip, over all dated closures in the window. Undated closures and closures
outside the window are excluded **and counted**, with the reason printed.
Below three dated closures there is no percentage, only counts. A skipped
review counts as accounted for and is reported separately from a held one. The
composite learning index uses only measurable components, renormalises their
weights, names the missing ones, and is withheld entirely below two components.

### 9. No CSV scope, and no rating of a person

The free text here (what went wrong, what we will change) is the most sensitive
prose in the workspace, so the ledger is deliberately absent from the CSV export
scopes rather than redacted. Nothing in the engine scores, ranks or infers
anything about a person; lessons name systems, decisions and practices, and the
UI states this on every tab.

## Alternatives considered

- **Extend the Impact Ledger instead of adding a ledger.** Rejected: an impact
  study is a pre-registered hypothesis with a metric and a window. A review is
  a qualitative conclusion about a completed event. Forcing one into the other
  would have made both dishonest.
- **Free-text lessons with a tag field.** Rejected: recurrence is the only
  outcome measure learning has, and it is uncountable without a fixed class
  taxonomy.
- **Auto-mark a change applied when its delegation closes.** Rejected: it would
  fabricate the central claim of the module. A delegation closing is evidence a
  task ended, not that a practice changed.
- **Score each review ("learning quality 0–100").** Rejected: no defensible
  rubric exists, and a score would invite people to write reviews for the score.
  The index is over *coverage, applied changes and unclosed recurrences* —
  facts about records, not judgements of people.
- **Draft a review for every historical closure on migration.** Rejected: a
  review written today about an event last quarter is a story. Migration adds an
  empty collection; the terminal offers each closure with its age instead.
- **Back-fill lessons from case RCA text automatically.** Rejected: the RCA
  already exists where it belongs, and inferring a class from prose is exactly
  the kind of invented judgement this codebase keeps removing.

## Consequences

- A leader can now close the loop from event → review → dated change → evidence
  that the practice changed, and can see when the loop was skipped.
- Case, change, decision and delegation endings gain one derived record each
  (the draft). The write path stays cheap; the review queue becomes real work
  rather than a suggestion.
- The `retros` collection is free text and grows with the number of closures a
  leader chooses to review. It is bounded per record (20 lessons, 1200
  characters per answer) but not capped in aggregate; the demo workspace is
  small enough that this has not been profiled at scale **[UNVERIFIED]**.
- `buildForm` gained the `setErrors` alias it always implied, which fixes a
  pre-existing defect in three dialog modules (strategy, capital, dynamics)
  where a rejected submission threw instead of showing the field error.
- Revisit trigger: if the recurrence measure produces a "repeating, unchanged"
  finding more than twice a quarter on a real workspace without the leader
  acting, the mechanism is generating noise and the taxonomy or the threshold is
  wrong — that is a reason to change the measurement, not to hide it.
