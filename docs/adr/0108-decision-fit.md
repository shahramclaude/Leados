# ADR-0108 — The Decision-Fit Ledger: a declared delegation price, measured against the record

**Status:** Accepted · Session 148 · Schema v110 (additive `109 → 110`)
**Altitude coverage:** all five (frontline → CEO), with the *reading* rendered per altitude
**Related:** ADR-0075 (Command Chain), ADR-0076 (Operating Seat), ADR-0078 (Decision Rights
Exchange), ADR-0081 (Altitude Router), ADR-0085 (Escalation Economy), ADR-0106 (execution proof)

## 1. The question nothing in the category answers

Every product in the category measures a **latency**: how long a decision took, how many
approvals it sat in, how often it was reopened. LeadOS already has two of those — Decision Tempo
(measured latency against an empirical band) and the Escalation Economy (what an escalation costs
in attention and delay).

None of them asks the question a leader is actually judged on:

> **This call cost the company seven days at £4,200 a week. If I had delegated it one rung down,
> what would I have saved — and what would that have risked? And when I look at my own dated
> record, is my judgement of what I must personally decide better than a rule that does not use
> my judgement at all?**

That is not a workflow question. It is an **allocation** question, and it has two halves that no
surveyed product joins:

1. **A declared price on authority.** For a specific open call, what is the cost of it waiting one
   more week at each altitude that could hold it? Delegating saves latency (the lower rung decides
   inside the horizon it actually uses) and costs a possible error (the lower rung may be wrong
   without the seat above).
2. **This leader's own contested-share, and whether it beats a naive rule.** Over a leader's own
   dated decisions, what share did they hold personally *when the record shows both rungs were
   available*? And does the leader's real allocation beat "delegate everything" or "hold
   everything" on the outcomes their own record contains?

## 2. What is deliberately NOT built

- **No person score.** The ledger never rates a leader, a delegate or a colleague. Every figure is
  about a *call* and a *rung*, and the person-level reading is a share of that leader's own open
  work, which is a load statement, not a performance statement. A "delegation score" is refused
  in the strongest terms the codebase can express: there is no field for it.
- **No invented authority.** The rights ladder from ADR-0076/0078 (`ACTION_RIGHTS`,
  `RECORD_CLASSES`, altitude `forbidden` lists) is the only source of "who could hold this". A call
  whose class is not declared for a rung is never offered to that rung.
- **No auto-delegation.** The ledger prices a delegation and opens the ordinary bounded-authority
  contract (ADR-0078). It never moves work, never reassigns an owner and never edits a decision.
- **No cross-person comparison.** The reading is scoped to the operating seat's own subtree. Peer
  spans are not counted, not ranked and not subtracted (the same rule as the Disclosure Compiler).

## 3. The model

### 3.1 The rights classification of one call

A decision carries free text (`title`, `question`, `rationale`) and typed structure
(`reversibility`, currency amounts in options, people in `driver`/`approver`/`contributors`,
premise links, stakeholder links). The classifier is a **declared lexicon + structural cues**
classifier in the mould of `intake.js` — deterministic, on-device, printable evidence, NegEx-style
negation handling, and honest refusals. It produces an **authority class**:

| class | meaning | minimum rung that may hold it | held-by-default rung |
|---|---|---|---|
| `assignment` | who does what, inside the week | frontline (1) | frontline |
| `sequencing` | order of work inside a cycle, resource splits | manager (2) | manager |
| `structural` | org shape, boundaries, standards, cross-team process | director (3) | director |
| `capital` | money, headcount, funding, vendor commitments | executive (4) | executive |
| `enterprise` | disclosure, board, investor, company-wide bet | chief (5) | chief |

`minimumRank` is a **floor declared against the rights registry**, and it is the reason a
frontline lead is never priced on an enterprise disclosure call. Above the floor, **any rung may
hold the call** — that is what delegation is. So the delegation alternatives are the rungs
`≥ minimumRank` that are `≤ the owner's rung`.

### 3.2 The wait ladder (what one more week costs at each rung)

For a call held by an owner at rank `r` with an authority-class floor `m`:

- **horizon(r)** = the Jaques time-span of discretion from `chainRegistry` (7/30/90/180/365).
  This is not an SLA; it is the period over which that rung's work is judged without review.
- **observed latency** = this workspace's own actuarial latency for a decision of that class,
  measured as a **Kaplan–Meier style empirical CDF of decided-vs-logged** ages, censored at the
  observation date. When the record cannot support a class estimate (below the declared floor),
  the ledger **refuses** the class figure and prints the pooled figure with its evidence count —
  never a fabricated per-class number.
- **expected hold days at rung k** = `min(observed class median, horizon(k))`. A rung that must
  decide within a 7-day horizon does not sit on a call for 30.
- **wait cost** = `valueAtStake per day × expected hold days`. The value at stake comes from the
  existing `decisionPortfolio` carrying-cost machinery (currency-aware, refusal-honest). A call
  with no priced value is reported as **unpriced** and priced at zero with the refusal printed —
  never as free.

### 3.3 The error price (what delegation risks)

Delegating down is not free. The ledger prices the **risk** of a rung that does not have the
information the current holder has:

- **decision rights gap**: a rung below the call's `minimumRank` **cannot** hold it — that
  alternative is refused outright with its reason, never priced at infinity and never "available".
- **information deficit**: for each rung `k` below the current holder, the ledger reads the
  **typed evidence the call rests on** (premise links, stakeholder links, linked cases, the
  approver/driver relationship). If the evidence names records whose owning span is `k`'s subtree
  or below, delegation *increases* local information and the deficit falls to the declared floor.
  If the evidence is owned **above** `k`, the deficit rises. The mapping is a declared points
  schedule printed as a convention.
- **reversibility**: an irreversible call delegated below its class floor is refused; a one-way
  door delegated with an information deficit above the declared bar is **flagged**, never blocked.
- **rework expectation**: `probability-of-error × cost-of-error` where `cost-of-error` is a
  declared fraction of the value at stake. Both the fraction and the probability map are
  **declarations printed on the page**, not fitted coefficients, and every number the model emits
  is labelled as an estimate with its inputs visible.

**Net benefit of delegating to rung k** =
`wait saved (current expected hold − expected hold at k) × value/day − expected error cost at k`.

Every alternative is therefore a **priced option**, and the ledger's headline is the
**biggest single weekly saving available** across the open book, with the reason it is not already
taken (a rights gap, a deficit above the bar, an unpriced call, or simply a decision nobody made).

### 3.4 The calibration half: the leader's own contested-share

For a leader at rank `r`, look at every **decided** call whose authority class allows a rung at or
below them, and that they personally held (driver/approver resolves to their span):

- `heldN` — calls this leader held that a rung below them could have held.
- `contestedShare` = heldN / (eligible calls), reported as a **Wilson-scored interval**, refused
  below the declared evidence floor. This is a statement about *work*, not about a person: the
  page says so in the same sentence the number appears.

And the out-of-sample half that makes it a *measurement* rather than a dashboard:

- **naive baselines.** "Delegate everything eligible" and "hold everything eligible" are computed
  over the same eligible set from the leader's own record of outcomes (rework, reopen, decided
  within horizon, outcome = better/no change/worse).
- **the leader's actual allocation** is scored on the same outcomes.
- **Brier skill score vs the naive rule** where the record carries a frozen probability; otherwise
  a **regret comparison** in the call's own currency, and a printed refusal where neither is
  measurable.

The ledger **does not rewrite the leader's allocation** and does not tell them what to do. It
prints the distance between the leader's judgement and a rule with no judgement in it, and the
price of that distance in the record's own units.

## 4. The automation (on the shared spine)

`RULE-FIT-01..04` on the post-commit spine, marker-idempotent, pausable, additive only:

- **FIT-01** — when a decision is opened or its class changes, freeze an **authority snapshot**
  (class, floor, owner rung, alternatives priced) as a governed record with `rests-on` edges to the
  decision and one `rolls-up-to` per ancestor. A snapshot is frozen once and never re-priced
  silently; a re-classification opens a new snapshot and the old one is marked superseded.
- **FIT-02** — when a call's `expected hold at its current rung` exceeds the rung's horizon by the
  declared margin **and** a priced better alternative exists, open exactly **one** governed
  delegation proposal per call per ISO week: a bounded-authority contract (ADR-0078) at the
  recommended rung, with the saving, the risk and the evidence named. Never auto-accept.
- **FIT-03** — when a delegation is verified (`mandate.completed`), grade the **forecast** that
  priced it: did the receiving rung finish inside the predicted hold, and did the predicted error
  cost materialise? One grade per contract, ever; a stale grade is refused rather than guessed.
- **FIT-04** — on the declared cadence, publish a **span reading** (contested share, mean wait cost
  per rung, the number of calls nobody has decided) as `rolls-up-to` per ancestor, identity-free
  above the manager rank, with small cells suppressed.

## 5. Altitude behaviour (what each rung actually sees)

| rung | headline | body | refusal it must show |
|---|---|---|---|
| **frontline** | "What am I holding that a shadow or a deputy could take this week?" | own open calls with a named candidate rung and the week saved | candidates are never named as people unless the leader's own direct report is the rung |
| **manager** | "What is my span holding that its own leads should hold — and what is it costing?" | per-call priced alternatives, per-person load, the span's contested share with its interval | individual detail stays at this rung; nothing about an individual's *judgement* is scored |
| **director** | "Which authority is accumulating at my rung, and what would a boundary change be worth?" | class mix by child span, pooled wait cost, contested share per span with the mean-of-spans warning | no item titles above the detail ceiling (ADR-0086 posture applies), counts only |
| **executive** | "What is this function paying to hold calls that belong a rung down, and what risk is it buying?" | per-class saving available, error price of the recommended move, concentration by class | no individual, no peer-span comparison, no ranking of leaders |
| **chief** | "How much of this enterprise's decision latency is self-inflicted authority, and what would the board see if we changed it?" | the enterprise's own delegation yield, the classes where the floor binds hardest, the printed refusal where the record cannot support a claim | never a leader league table; never a person named above manager rank; a withheld cell carries its reason |

## 6. Verification commitments

- The model is **pure** (no DOM, storage, network, clock globals) and lives in
  `app/core/domain/decisionFit*.js`.
- Every number is printed with its **inputs** and its **refusal**, and the CSV export is
  aggregate-only with BLANK for refused cells and no ids.
- Tests must prove: (a) a call below a class floor is never priced as delegable; (b) a class with
  insufficient history refuses the class estimate and prints the pooled one; (c) the contested
  share refuses below the floor; (d) idempotent rescan; (e) `rolls-up-to` written per ancestor in
  the same transaction; (f) no person is named above manager rank in the rendered screen.

## 7. What building it actually found (four defects, three of them real)

An implementation that has never been run is a proposal, not a module. Running this one against
the demo workspace and the event spine surfaced four defects, each of which had survived review:

**7.1 The empty ladder (the inversion the module exists to prevent).**
`buildFitBook` prices alternatives by walking *down* from the owner's rung. When the owner sits
**below** the class floor there is no rung beneath to walk to, so `alternatives` came back **empty**
— for 3 of the demo's 6 governed calls, including a capital call (floor 4) held by a frontline lead
(rank 1) for 35 days. An empty ladder renders as *"no alternative exists"* when the truth is
*"the holder cannot lawfully grant this at all."* That is the precise failure the ledger was built
to expose, printed by the ledger itself.
*Fix:* a below-floor holder is priced as an **escalation** to the class floor — the same machinery,
the sign of the wait difference reversed, tagged `direction: 'escalate'` and `complianceFix: true`.
An escalation is bought for **correctness, not for time**, so its net is usually negative, and that
negative is printed honestly. A negative net must never read as *"leave it where it is."*

**7.2 Non-idempotent scans (a scan must be a computation, not an append).**
The first snapshot rule keyed its identity on `(decision, class, OWNER RUNG)` and looked for "any
live snapshot for this decision." A rescan therefore never matched its own previous row: two scans
produced **13 → 40** snapshots and 13 → 40 `prices-authority` edges.
*Fix:* identity is `(decision, class)` — a frozen classification is a statement about the *call*,
not about which rung happens to hold it. A changed class or a changed owner **supersedes** the old
snapshot (`status: 'superseded'`, `supersededOn` dated) rather than editing it, so the old price
stays auditable beside the new one. Verified: four scans, byte-identical live counts, readings and
edges.

**7.3 The ledger priced its own audit output (the Session-143 regression, again).**
A scan runs **every** module's work-producing pass, so 54 governed findings — epistemic, diligence,
hindsight, coupling, attention-market — are opened in the *same transaction*. The fit rule froze an
authority classification for each of them and priced a delegation of the engine's own findings, so
the count grew 13 → 40 → 67 across passes. This is the second-order-decision regression Session 143
fixed for the Hindsight Lock, reappearing in a new module because the exclusion is per-module and
the new module had not opted in.
*Fix:* governed findings are excluded from the priced book by three state-only tests — the
universal `[RULE-XXXX-NN]` marker, the append-only event log, and other modules' marker ledgers —
plus the structural test that a call with neither a driver nor an approver has no authority holder
to price. **The governed-id set is rebuilt on every call and never memoised**: the event log *grows*
during a scan, so a cached set freezes the exclusion list at its first, smallest value. (A cached
version of this fix reproduced the leak exactly, 6 → 32.)

**7.4 A cross-module import cycle that failed silently.**
The first fix had `decisionFitRules` import `hindsightFindingIds`/`diligenceFindingIds` while those
modules imported `fitFindingIds`. ES modules resolve the cycle by handing out an uninitialised
binding: **no error, no warning** — the ledger simply returned a converged and completely *empty*
book. A green, quiet, wrong result. Provenance is now read from **state**, never by importing
another rule module. This is recorded because the failure mode is indistinguishable from success.

**Also found:** the module's four read functions were never registered in `SAFE_READS`, so under an
organisation that turned enforcement on, the module's writes would be gated while its reads were
refused — half a feature, silently disappearing at exactly the moment enforcement mattered. Now
registered and asserted in `tests/app/decision-fit.test.mjs`.

## 8. What the ledger does not claim yet

- `scoreAllocationRules` still refuses with `paired: 0`: it joins the **open** book only, so the
  paired comparison (actual allocation vs. hold-all vs. delegate-all) has no settled cohort to
  join. The refusal is honest and printed; the fix — a priced look-up spanning settled decisions —
  is queued, not faked.
- No proposal has been accepted end-to-end in the demo, because the demo's one material move is
  0 days old and the proposal gate requires a call to have outlived its rung's expected hold. The
  **grade** panel therefore renders its empty state. That is the correct print for a workspace
  whose worst call has just been opened; it is not a stub.
