# ADR-0027 — The Strategy Coherence Terminal (Schema v42)

- **Status:** Accepted
- **Date:** 2026-10-28 (Session 62)
- **Supersedes:** nothing
- **Related:** ADR-0008 (post-commit rules hook), ADR-0017 (Allocation Governor), ADR-0018 (Cognitive Load Governor), ADR-0019 (Premise Sentinel), ADR-0023 (Structural Capital Allocation), ADR-0026 (Propagation Ledger)

## Context

After 61 sessions LeadOS can price a decision (Tempo), allocate a structural
effort budget (Capital), learn explore/exploit from settled evidence
(Allocation), sense saturation (Load) and test assumptions (Premise Sentinel).
Every one of those terminals answers a question *inside* a declared frame.

None of them could answer the question a management team is actually judged on:
**is the frame itself the one we are funding?** Strategy decks are the
best-dressed fiction in business, and every incumbent tool measures strategy
execution by asking teams to self-report a percentage. Two consequences follow:

1. A leader who writes five priorities and funds three of them (plus two
   accidents) sees a dashboard of green while the organisation executes a
   different strategy than the one written down.
2. A leader cannot be corrected, because no artifact in the workspace says what
   was declared as a *share*, and no artifact says what was *funded*. Without
   both, "alignment" is an opinion.

LeadOS already holds (b) — the leader's own records of cases, goals,
delegations, plan items, decisions and changes. It lacked (a) a declared set of
bets with explicit shares and stop rules. This ADR adds (a), computes (c) the
distance between them, and defines exactly what that number may and may not
claim.

## Decision

### 1. A bet is a structured strategic choice, not a note

`strategyBets` records: a Rumelt kernel (diagnosis → guiding policy),
`notDoing` refusals, an `advantage` type, a declared `weightPct`, an accountable
owner, a horizon and a dated `killCriterion`. A bet in `draft` is not measured.
A bet in `active` requires an `adoptedOn` date, and the normaliser **demotes an
active bet with no adoption date to draft** with a warning. The adoption date is
the vintage, and inventing it would let the gap be manufactured.

### 2. `strategyTags` is a link table, not a mutation of other modules

A tag says "this open record is funded by this bet", with an optional
`effortWeeks`. Deliberately, no other collection gains a field: cases, goals,
delegations, plan items, decisions and changes stay exactly as they were, so the
feature is additive and every existing suite is untouched by the schema change.

### 3. The gap is a total variation distance, with exact bounds

Declared weights and measured shares are two distributions over the same
support. The reported divergence is half the L1 distance in percentage points:
0 = identical, 100 = every measured resource sits on something not declared.
There is no invented "alignment score", no weighted composite of unrelated
units, and the per-bet signed gap is printed beside the aggregate.

Measured shares use **effort-weeks only when at least half the funding tags
carry an estimate**; otherwise they count records and the report says
`Counts only`. An unestimated tag is one record — never zero effort.

### 4. Vintage, and the two exclusions that make the number honest

- **Pre-strategy work is excluded** from the denominator: records created before
  the earliest adopted bet were funded before the choice existed, so counting
  them as "blind" would punish history. They are still taggable as *context*,
  but a pre-strategy tag is not counted as current funding.
- **The terminal's own governance records are excluded.** Commitment decisions,
  tagging delegations, stop-rule delegations and retire-or-renew decisions carry
  `[RULE-SCO-…]` markers and are skipped in the denominator; otherwise opening
  one rebalancing decision would worsen the very gap it was opened to close.
- Records with no start date have unknown vintage and are excluded, with the
  count printed.

### 5. Falsifiability is graded on six named checks

Owner, diagnosis, guiding policy, refusal, dated stop rule, funded work. The
grade is a count of checks passed, with the missing ones printed by name. This
is the anti-9-box discipline: no confident label without the evidence that
would earn it.

### 6. Rules on the shared spine (ADR-0008), with a narrow trigger

| Rule | Trigger | Effect |
|---|---|---|
| RULE-SCO-01 | `strategy.bet.adopted` | one DACI commitment decision + one owned tagging delegation + one blameless 1:1 talking point + typed links, in the same transaction |
| RULE-SCO-02 | strategy events or an explicit audit | one rebalancing decision when the say–do gap exceeds the workspace convention, keyed to the diverging bet set |
| RULE-SCO-03 | strategy events or an explicit audit | one owned delegation per active bet with no dated stop rule |
| RULE-SCO-04 | strategy events or an explicit audit | one retire-or-renew decision per overdue stop rule, plus a talking point |

**Trigger discipline is a decision, not an oversight.** The rule deliberately
does *not* run on `case.created` and friends. A terminal that opens governance
decisions while the leader types a case note is noise, not automation. The
explicit "Run coherence audit" button is the trigger, and the cascade it causes
is atomic. `strategyAutoPropagate: false` pauses it; an explicit adoption always
fans out, because adoption is a commitment the leader just made.

### 7. No CSV export scope

The gap is only meaningful beside the declarations that produced it. A CSV of
shares without the bets would be a number with its evidence stripped off, so
this terminal exports a deterministic plain-text brief and nothing else.

## Consequences

**Good.** The product can now say, from records, that a declared 60/40 split is
funding 30/70 — and can name which bet is over- and under-funded. Stop rules
become state that the app watches, so a strategy is allowed to be wrong instead
of quietly failing. Nothing ranks a person.

**Costs and limits, stated plainly.**

- The measured share is only as honest as the tagging. A leader who tags
  generously to make the gap look small defeats the metric; the terminal says so
  in the dialog and in the brief. It is not a surveillance product and cannot
  verify effort from outside the workspace.
- Effort-weeks are leader-entered conventions, not measurements. Below 50%
  coverage the report falls back to record counts, which weight a two-hour task
  the same as a month-long programme.
- The 20pp gap, 40% blind-work and 28-day drift window are workspace conventions,
  not validated constants. They are editable and labelled.
- The composite coherence percentage is a weighted mean of three measured
  components and is not evidence that the strategy is right. It exists to be
  argued with.
- No browser/AT validation was performed in this session beyond jsdom + axe.

## Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Read effort from an external tracker (git, Jira, calendar) | Breaks the local-first, zero-network invariant and would put unfalsifiable inference (a commit is not effort) behind the most persuasive number on screen. |
| Add a `strategyBetId` field to every other collection | Mutates six working modules and their normalisers for a feature that can be a link table. Higher regression risk for no added capability. |
| Score strategic "alignment" 0–100 from self-reported progress | That is the incumbent failure mode: a confident label with no measured denominator. |
| Auto-retire a bet whose stop rule passed | Removes a human judgement from a decision about what the team is for. The app opens the decision and records it; the person decides. |
| Let history be re-tagged into bets | Would let the gap be improved by relabelling the past instead of changing the work. |
| Trigger the audit on every write | Adds a full portfolio scan to every keystroke-committed action and opens governance decisions at unrelated moments. |

## Verification

`tests/app/strategy-coherence.test.mjs` (36 tests) covers the share math and its
bounds, both measurement bases, vintage and scaffolding exclusions, the
normalisers and their repairs, the v41→v42 migration, the adoption cascade and
its idempotency, the rebalancing / stop-rule / verdict rules, the pause switch,
signals, the brief, the demo seed, and jsdom+axe across all four tabs, including the
adoption dialog grading the draft bet it is about to adopt. Full-suite,
lint, boundary and standalone results are recorded in `AI-SESSION-LOG.md`.
