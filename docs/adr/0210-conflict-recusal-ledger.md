# ADR-0210: Decision-Maker Conflict-of-Interest & Recusal Ledger — Did the Hand That Signed Actually Stand Back?

Date: 2026-11-15 · Session 279 · Schema v164 (additive: `conflictInterests`, `conflictNoneDeclarations`, `conflictStandings`, `conflictRules`, `conflictRecusalMarkers`) · Status: Accepted

## Context

A director signs off a supplier award. He owns fifteen per cent of the supplier.
He declares it. He says he will stand back. The declaration is filed, the
recusal is minuted, and the file reads handled.

It is not handled. The record still carries his name on the approver line. He
declared a conflict and then signed anyway, and every screen in the workspace
showed that decision as an ordinary decision, because a decision record stores a
title, a day and a free-text signer — and says nothing at all about who held a
stake in the outcome.

This is the oldest gap in the whole workspace and the one with the most
paperwork pretending to close it. The capability was logged at ROADMAP.md:2927
and never built. A repo-wide grep for a conflict register returned nothing but
prose: `sodRegisterRegistry.js:405` printed the absence in its own words —
separations of duty were checked, interests were not.

And the gap is not "we need a place to file conflicts." Filing is the easy half
and the half that produces false comfort. The gap is the one sentence every
conflict policy in the world writes and almost no system proves:

> **A recusal is only real if it moves the hand off the record.**

## Decision

A seventh Governance panel — `#/recusal` — backed by five domain modules
(`conflictRecusalRegistry`, `conflictRecusalSchema`, `conflictRecusal`,
`conflictRecusalActions`, `conflictRecusalRules`), one spine rule
(`RULE-CIR-01`, 129/129) and CSV scope #152 `conflict-recusal`.

### What is recorded — human statements, nothing derived

- An **interest**: one person × one subject (a logged decision, an investment
  case, a hiring requisition, a budget envelope) × one relationship kind × a
  direction, with the day it became known. Declared first-person.
- A **declaration of no interest**: one person × one subject × the exact kinds
  they are declaring clear of. First person only — and only about a position the
  person actually holds.
- A **rule**: which relationship kinds are reportable, from what rank up, on
  what written authority. Closed vocabulary; no rule, nothing is reportable.
- A **standing**: dated, reasoned act by an authorised seat above — `recuse`,
  `mitigate`, or a recorded finding of no conflict — with the intervening control
  named where mitigation is claimed. Append-only; superseding preserves the prior.

### The coverage universe — the defect that mattered most

The first draft scored only positions that already had an interest declared on
them. That design has one fatal property: **"clean" is reachable while nobody
has been asked anything.** A record whose signer was never asked about their
stakes read exactly like a record whose signer had declared themselves clear.

So coverage is computed over the **universe**, not the declared set: every
in-horizon record × every position a person holds on it (`approver`, `owner`,
`interviewer`, `ratifier`). Each position reads one of seven verdicts:

| Verdict | Meaning |
| --- | --- |
| `withdrawn` | the interest was declared and then withdrawn, dated |
| `unsearched` | nobody was asked — or was asked about fewer kinds than the rule requires |
| `undisclosed` | positions exist and a live interest has no dated response |
| `ineffective` | recused, and **still the hand that signs** |
| `mitigated` | a control is claimed — printed as a claim, never as independence |
| `determined` | the interest does not reach the record, or was answered |
| `clean` | a first-person declaration covers **every** reportable kind |

`clean` is therefore structurally unreachable without a declaration, and
`unsearched` names the exact kinds nobody asked about.

### The second defect — positional exclusion

Coverage keys were identity-based (`subjectType:subjectId|personId`). That meant
one declared interest on a record suppressed *every* coverage row for that
person on that record — hiding the fact that they held a second, unasked
position. Keys are now **positional**
(`subjectType:subjectId|personId|position`), and a position with a live interest
is excluded from coverage only for that position.

### Authority

- The holder may declare an interest about themselves; nobody may declare
  another person's.
- The holder may **not** record their own standing — proven refusal: "You hold
  this interest." A manager may not record a standing for a report's interest
  unless that manager is strictly above the holder's line; below-line attempts
  are refused.
- `recuse` requires an authoriser and a reason and **no control** — its control
  is the absence of the hand. `mitigate` requires a written control of at least
  eight characters.
- A withdrawal requires a reason; the row is never deleted.
- The operator view holds no person and cannot make a first-person declaration.

### The rule

`RULE-CIR-01` sits before `seatRule` on the post-commit spine, with exactly one
contract (`delegations`, `links`, `conflictRecusalMarkers`). It files one dated
ask per unhandled interest to the **lowest seat above every line the holder is
on** — in a single-line case that line's own manager, in a matrix case the joint
apex (`matrixJointApex`). Where that seat does not exist the rule records one
identity-free marker rather than inventing an owner. The ask is fingerprinted
`cir1:<16 hex>`, is idempotent per signature, and self-closes with the actual
reason. It files nothing for a past-dated condition and runs under
`conflictRecusalAutoPropagate`, which is on the matrix-reach switch list.

### Display == stored

One read builds the register; brief, CSV, panel and attention badge all consume
it. `allRows` is the union of interest rows and coverage rows; every count in
`allCounts` is a tally over `allRows`, and `balances` is computed, not asserted.
CSV scope #152 carries **39 columns**, is identity-free — no person, manager,
record id, title, note or control text — and prints
`verdicts_reconcile = YES|NO`.

## Consequences

- A board paper asking "were our signers conflicted?" can now be answered with a
  number that includes everyone nobody asked, and names the kinds still unasked.
- `invalid`-shaped readings are impossible: there is no stored verdict, so the
  register cannot drift from the records it scores.
- The register deliberately does **not** model gifts, hospitality, outside
  directorships or family trees as first-class records; it records the
  relationship kind a person declares and the day they knew. It also does not
  integrate with external disclosure systems, and it makes no claim about
  undisclosed conflicts that nobody has declared — it names that silence.

## Verification

`tests/app/conflict-recusal.test.mjs` — 27 tests: the coverage universe and its
three modes, seven verdicts, positional exclusion, joint-apex ownership, the
authority doors and every refusal, spine/contract/pause registration, the
identity-free CSV, DOM parity (counts equal the printed rows, one `h1`, no
skipped heading levels), and read-purity. `npm run verify:canonical` green;
`npm run check:a11y` green across 120 routes; `check:links` green across 1,226
links.

Generated method illustration: `app/assets/conflict-recusal.jpg` (1,672×941,
91,058 bytes, SHA-256 `079ecf04bc4fdf0a95c9d2fd0105ab1e226ef60b6d1e3872f34beca0f7f176ed`),
showing the teal case where the signature travels away with the withdrawing hand
and the amber-red case where it stays behind.

Benchmark `[BENCHMARK-UNVERIFIED]` — argued from category knowledge of Diligent,
NAVEX (formerly Ethico), Convercent/OneTrust, and SAP GRC Access Control: exceeds
the category bar on proving recusal effectiveness against the live record,
universe-based coverage with named unasked kinds, and matrix-correct apex
governance. Deliberately does not claim integration with external disclosure
systems, gift registries, or entity-resolution of undeclared relationships.
Framework grounding: OECD Principles of Corporate Governance (2003) §§4, 8–12;
COSO 2013 principle 3 and the segregation-of-duties principle; Bernheim &
Whinston (1986) on common agency and the divergence of delegated decisions from
the principal's interest.
