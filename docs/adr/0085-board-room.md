# ADR-0085 — The Board Room: the disclosure memo as a pre-registered terminal

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 125
- **Schema:** v91 (additive `90 → 91`)
- **Route:** `#/board` (aliases: `board-room`, `board-pack`, `board-line`, `board-memo`, `disclosure`, `disclosure-memo`, `chair`)
- **Rules:** `RULE-BRD-01` (governed decision per failing claim), `RULE-BRD-02` (typed span roll-up), `RULE-BRD-03` (advisory maturity)
- **New collections:** `boardMemos`, `boardMarkers` — no new graph node; the memo links to spans through `rolls-up-to` edges
- **CSV:** scope #80 `board-claims` (aggregate-only; a refused figure is blank, never zero)

## The problem

Every leadership product surveyed in `RESEARCH.md` §105 produces a "board pack" the same way: an
analyst assembles last quarter's dashboards, an average is computed, and a colour is chosen. The
claim is never stated in a form that could fail. Two things follow, and both are visible in the
2026 category:

1. **The threshold moves after the number is seen.** A metric that comes in at 61% is reported
   against a "target" of 60% that nobody wrote down before the quarter closed. This is
   HARKing (Kerr 1998) and it is the single most common way an executive deck becomes unfalsifiable.
2. **The composite hides the disagreement.** A single "organisational health" index averages
   figures produced by six modules with six different instruments. Averaging makes the deck
   readable and makes the disagreement invisible — which is exactly the information a board is
   convened to see.

The workspace already had the ingredients and no terminal for them: `successionRegistry.js:396`
declared a chief-altitude `board` duty and `successionRegistry.js:157` a `board-line` relationship,
`chainRegistry.js` modelled the five altitudes, `propagationContracts.js` had 63 rules, and the
disclosure ladder (ADR-0075/0080) had been enforced for a dozen modules — but `#/board` existed only
as a dead alias. A promised surface with no implementation is worse than an absent one: it tells a
reader the evidence exists.

## Decision

`#/board` is a **pre-registration terminal**, not a reporting page. Seven enterprise claims are
declared with a comparator, a unit and a threshold **before the first look**. A look is recorded
with a fingerprint of exactly what was visible. Verdicts are decided by the **conservative end of a
Wilson (1927) interval**, never by the point estimate, and the four non-verdicts — `withheld`,
`refused`, `inconclusive`, and `stale` — are printed with their reasons instead of being folded into
a number.

**Seven claims, each with a refutation condition.** Bench coverage (share of spans with a quotable
bench), bench concentration (share of spans whose bench is a single holder), promise reliability
(share of open promises kept), delegated authority holds (share of completed trials that stood),
expectation alignment (share of assessed pairs above their agreement floor), culture signal (the
health index, read as a disclosed instrument, never as an opinion poll), and record integrity (the
seal's own verdict). Each is refused when the source module produced nothing: an empty workspace
reads **0 computed figures and 7 refusals**, never seven zeroes.

**The interval decides, and the point estimate is decoration.** A claim holds only when the
conservative end clears the floor. `boardWilson` is written out and tested against analytic values:
0 of 5 has an upper bound of 43.4%, so a bench-coverage floor of 60% **fails outright**; 4 of 5 gives
37.6–96.4% and is `inconclusive`; 50 of 100 gives ≈40–60% and straddles. This is the module's most
important behaviour and it is deliberately annoying: at small n the honest answer is usually "the
record cannot say", and the panel prints what sample would settle it
(`boardRequiredSample(50, 60) = 97`; a claim exactly on its threshold returns `null`, because no
sample size decides a coin that is exactly fair).

**Post-hoc movement is permanent, not discouraged.** `revisedAfterLook` is set the first time a
threshold moves after a recorded look, is never cleared, and is printed on the claim, in the memo
text and in the CSV. A leader may revise a threshold with a written reason — the app's answer to
that is not a warning dialog but a permanent mark.

**Disagreement is surfaced, never composited.** The module reads six other terminals and prints
three cross-checks: coverage-count-versus-flow (a snapshot can pass while the flow says a gap is
likely), promise-rate-versus-book (a rate can clear while the book holds overdue promises), and
integrity-versus-examination (the seal proves non-alteration and says nothing about truth). When a
check fires, the memo says so in a sentence with both numbers and a route to the module that owns
the other half. No composite confidence score exists anywhere in the module, by construction.

**Every figure carries its provenance.** Each row is tagged `recomputed`, `attested`, `asserted`,
`withheld` or `refused`. A recomputed figure came from a module this app can re-run; an attested one
came from a sealed record; an asserted one is the operator's own declaration and is never presented
as measurement.

**The roll-up is reconciled or it is not drawn.** Any claim with span attribution is partitioned
over the reporting tree and the parts are checked against the claim's own denominator. A partition
that does not add up is reported as broken with the delta printed; a claim the source module did not
attribute to spans is drawn as "nothing attributed" rather than as a single aggregate bar, because a
decomposition the app cannot check is not evidence.

## Altitudes

One read model, five genuinely different jobs:

- **frontline lead** — which line of mine is failing and what does it cost; no memo may be committed.
- **manager** — the span partition for the claim, with the arithmetic shown.
- **director** — span rows are named; the roll-up is the unit of work; a failing span receives a
  delegation, not a scolding.
- **VP / executive** — cross-module discrepancies, the settling-sample arithmetic, and the fact
  that three of seven claims were refused.
- **CEO / chief** — the identity-free memorandum text (deterministic, no clock, no identifier), the
  attestation state and the aggregate CSV. Ranks below chief may read the pack; only the chief
  altitude may commit it (`commit-board-memo`, rank window 5–5).

## What this may never do

- **Never print a composite.** There is no single number on the screen and no column in the export.
- **Never zero-fill a refusal.** A refused or withheld figure is blank in CSV and `—` on screen,
  with the reason in words.
- **Never name a person.** The enterprise altitude's unit of analysis is the enterprise; the memo
  text is generated from aggregates and contains no person, no note and no 1:1 content.
- **Never claim the seal proves truth.** Integrity is printed with its own limits beside it.
- **Never let the report change the record.** `RULE-BRD-01` opens a DACI decision, `RULE-BRD-02`
  writes typed edges, `RULE-BRD-03` writes an advisory marker. No rule edits a claim, a verdict, a
  module's data or a person's record.

## Consequences

- `SCHEMA_VERSION` → **91**, one additive step (`90 → 91`: `boardMemos: []`, `boardMarkers: []`), five clamped
  settings (`boardCellFloor`, `boardEvidenceFloor`, `boardMaterialityPct`, `boardRecheckDays`,
  `boardAutoPropagate`), and a fail-closed normalizer that drops a memo with no claims, clamps
  thresholds to 0–100, and refuses a duplicate claim key while allowing a later valid declaration to
  repair an earlier unreadable one.
- 64 → **65 rules / 65 contracts**, one new CSV scope (#79 → **#80**), one new API right group
  (`declare-board-line`, `freeze-board-summary`), six safe reads, one nav entry with a badge that
  counts stored facts only (committed memos with a failing claim or a stale fingerprint).
- `RULE-BRD-01` is idempotent through `boardMarkers`, pausable through `boardAutoPropagate`, and an
  explicit `boardScan()` always runs. The delegation (when the worst partition row is a span) is
  capped at `min(60, boardRecheckDays)` days so a board item cannot become a quarterly orphan.
- Exports: **aggregate-only**, header `scope,claim,verdict,…`, blank for refusals, with the
  attestation state and the memo fingerprint. No memo id, operator, note or span name.

## Honest limits

- The seal proves the record was not altered **after it was written**; it proves nothing about
  whether the claim was examined. That is why the third cross-check exists, and it is not a
  substitute for the cross-examination module that owns the other half.
- Wilson intervals assume independent observations. The spans of a reporting tree are not
  independent, so the interval is a **lower bound on uncertainty**, printed as such.
- A local seat is an auditable **declaration**, not authentication. The chief-only commit rule is
  enforced by the ADR-0080 gateway against the declared seat; a reader with the backup file can read
  everything, as every recent ADR says.
- Seven claims are a **chosen instrument**, not a validated one. The thresholds are defaults, not
  empirical norms, and the module says so on the method panel.

## Alternatives rejected

- **A composite "board readiness score"** — the readable option, and the one that hides exactly the
  disagreement the board is convened to see.
- **Reporting the point estimate with a confidence note** — invites the reader to use the point
  estimate, which is how a 61% quarter becomes a green box.
- **Letting the memo pull from a live dashboard at render time** — the pack would change after it was
  read. A committed memo is frozen, fingerprinted and revisable only by opening a new revision.
- **Auto-correcting a failing claim** — the module opens a governed decision and a delegation; it
  never edits the number to make the memo pass.
- **Building a new graph node** — the memo is an enterprise-altitude record; its relationships are
  the existing `rolls-up-to` edges over spans, so adding a node would have invented a second way to
  describe the same hierarchy.
