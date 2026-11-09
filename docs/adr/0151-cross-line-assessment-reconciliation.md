# ADR-0151 — Cross-line assessment substance reconciliation and calibration parity

**Status:** Accepted (Session 209, Schema v126)
**Date:** 2026-11-09
**Altitude:** director / VP PRIMARY × matrix (every altitude reads the same ledger)
**Surface:** `#/reviews?panel=stewardship` Reconciliation · CSV scope #113 · no new rule

## The duty

A director runs quarterly calibration with two managers who both had Sam on their team
for nine months. Both were asked. Both answered. The packet shows the answers side by
side. Nothing in the workspace says whether those answers **agree** about what Sam did
well, whether one line's input is worryingly thin — a sentence against a paragraph —
or whether the comparison the director is about to make is even valid. The director
re-reads every answer pair by eye, and a thin "looks good" is silently treated as
agreement with a detailed assessment. When a review is the one durable claim the
product makes about a person, that silence is how a biased or partial view survives
calibration.

Session 203 (ADR-0147) closed whether every line **spoke** and who was entitled to
assess. This closes the next step: what the lines **said**, and whether a calibration
conversation can trust it.

## The decision

Add one bounded read model over the **existing** stewardship data, plus one optional
human declaration, and change nothing about how a single-chain review behaves.

### What is stored

One optional field on `stewardship.answers[]`:

```
{ …, signal: 'needs-support' | 'as-expected' | 'strong' | 'exceptional' | null }
```

`signal` is the line holder's coarse, declared assessment on the shared scale. It
is **not** a rating — the assessor's `manager.rating` is the rating — and it does
not change whether the answer counts as answered. A paragraph with no signal still
reads `answered` and still makes the packet settled. The reconciliation instead reads
`unrated-pair` when too few signals are present, rather than inventing one from the
prose.

**A signal is first-person.** Only the manager who holds the line may declare it,
and only inside their own answer. No peer, no home manager and no algorithm may set
another line's signal.

### What is derived, never stored

Every thin flag, every divergence verdict, every total and every refusal. A stored
state would be a verdict waiting to disagree with the answers that produced it.

### The signals (four, printed with four different words)

| signal | rank | meaning |
| --- | --- | --- |
| `needs-support` | 0 | in this period the person needs active support on the work this line saw |
| `as-expected` | 1 | delivered as expected for the period on what this line observed |
| `strong` | 2 | consistently strong delivery in the period on what this line observed |
| `exceptional` | 3 | set the standard peers are held to for what this line observed |

### The verdicts (seven, with declared precedence)

`incomplete` → `single-answer` → `unrated-pair` → `thin-input` → `divergent` →
`aligned` → `single-chain`.

Precedence is declared in the registry so the report, the panel and the CSV cannot
disagree. `divergent` outranks `thin-input` because disagreement is harder to resolve
than brevity, but `thin-input` is still emitted as a refusal beside `divergent` so no
fact is lost.

### The refusals that are the product

1. **No inference from prose.** Two paragraphs are never auto-compared for sentiment
   or tone. Divergence is ONLY computed from declared signals on the shared scale.
   Two answers with no signals read `unrated-pair` and the panel prints which lines
   left the signal blank — because guessing what a paragraph meant would be the exact
   failure this product refuses to commit.
2. **No zero for silence.** An `unasked` or `overdue` line makes the whole
   reconciliation `incomplete`, never silently excluded. A comparison that excludes
   a live question would read as unanimous while an ask is still outstanding.
3. **No score and no ranking.** A `divergent` packet is a prompt for the calibration
   conversation, never a rating of the person and never a ranking of the lines.
4. **A decline is not evidence.** A line that declined with a reason is never given
   a zero signal and never counted as agreement. It is excluded and printed separately.
5. **Thin is not wrong.** `thin-input` flags that one line wrote a sentence while
   another wrote well above the declared character floor. That is a prompt to check
   whether the short account is thin or merely undocumented, not a verdict about the
   person or about the line holder.
6. **The assessor does not count twice.** The line that IS the assessor writes the
   packet's assessment; it is not "another input" and is excluded from the
   reconciliation.
7. **Inert on a single line.** A person on one line has no second account to
   reconcile. No row, no ask, no verdict is added.

## Conventions (declared, clamped, printed, never fitted)

| key | bounds | default | meaning |
| --- | --- | --- | --- |
| `assessmentReconciliationThinChars` | 20–500 | 120 | an answer shorter than this while another on the same packet is material is `thin` |
| `assessmentReconciliationThinRatio` | 2–20 | 3 | the longest answer must be ≥ this multiple of a thin one to flag it (so two short answers do not flag each other) |
| `assessmentReconciliationDivergentSteps` | 1–3 | 2 | declared signals must differ by ≥ this many steps to read `divergent` (a 1-step difference — \"as expected\" vs \"strong\" — is calibration noise, not a finding) |

Declared in `app/core/domain/assessmentReconciliationRegistry.js`, clamped in
`...Schema.js`, printed on `#/reviews?panel=stewardship` Method, on the Packet
reconciliation card, and in the packet's own `conventions` object. A hand-edited
file with a non-clamped figure is clamped on load with no warning that would
change the workspace's own history.

## What this screen refuses to compute, and why

A free-text answer is words the line chose. Turning "led the migration well" and
"needs support on stakeholder communication" into a divergence score would require
natural-language inference of intent from prose whose author never declared a
scale. That inference would inherit every bias in the text — length, rhetoric,
fluency — and launder it as a measurement. The workspace refuses to do it; the
Method panel and the `unrated-pair` verdict say so with the reason.

The alternative is honest: ask the line holder to place one coarse mark on the
shared scale when they answer, compare those declared marks with exact integer
arithmetic (a range over ranks 0–3, no float, no heuristic), and name thin
accounts by length rather than by guessed meaning. A blank mark is not a zero
mark.

## Consequences

- A workspace with one line behaves exactly as before: no reconciliation, no row,
  no ask. The single-chain packet is untouched.
- Upgrading to v126 adds no collection and no signal. Every existing answer
  without one reads `unrated-pair` when its packet has two or more answered lines,
  which is exactly true: the packet was signed before any coarse scale existed
  and there is nothing to compare. No signal is invented at upgrade time — that
  would be a judgement the holder never made — and no packet is re-rated.
- CSV scope #113 is per-line, like #109, and carries the stored text and the
  optional signal only — no name other than what #109 already carries, no span
  id. A derived verdict (`reconciliation_verdict`) is printed per packet but not
  per line counted twice: one packet whose lines diverge is one divergent packet
  on the board, even though its lines are rendered as two rows.
- The answer dialog gains one optional select. An answer without it still passes.
  An answer with an unregistered signal is **refused** with a printed reason.
- Seats remain workflow declarations, not authentication.

## Known limits

- A packet whose lines wrote well but declared conflicting signals is flagged
  where a packet whose lines wrote contradictory prose with aligned signals is
  not. The trade is explicit: prose similarity is not computed, so a polite
  disagreement in words with the same declared mark is by construction not
  flagged as divergent — and the panel says so.
- The thin threshold is character length, not substance. A verbose answer can be
  thin; a short one can be precise. The module flags thin as "check this", never
  as "this is worse".
- No new rule is added. `RULE-SRV-01` already fans the outstanding asks; this read
  has nothing to fan and nothing to close. A governed calibration decision for a
  `divergent` packet remains a human declaration, not an automatic one.
