# ADR-0050: The Signal Path terminal (cascade reach, latency and deafness)

## Status

Accepted — 2026-10-30. Implements Schema v59, RULE-SIG-01..04, CSV scope #51.

## Context

Every terminal in LeadOS grades a decision the leader made. None of them grades
the channel the decision's *inputs* travelled through. A leader can run a
disciplined decision engine on facts that a three-level reporting line had
already filtered, delayed and softened — and the engine will happily score the
choice as if the facts arrived intact. That is the mum effect with a dashboard
on top: bad news is suppressed, not because anyone lies, but because each relay
pays a private cost for forwarding it and the chain compounds that cost
multiplicatively.

The arithmetic is old and unfashionable, which is why it is worth writing down:
if each relay forwards a material fact with probability `t`, a chain of `n`
relays delivers it with probability `t^n`. Three relays at 78% is 47% — an even
bet against silence — while the same workspace will report that channel as
"working" because nobody has ever counted the times it failed. Ops research
long ago separated the *information* a channel carries (Shannon) from the
*sensitivity* with which two people discriminate signal from noise (d′), and
both are computable from records a leader already has. The missing ingredient
is not a model; it is a small, honest ledger of probes.

The temptation in this space is to infer org health from one-on-one mood scores
or message volume and call it "psychological safety analytics". LeadOS already
refuses that (see the doctrine in `ARCHITECTURE.md`): no sentiment scoring, no
inference about people from proxies. So the design constraint was sharp — the
module must be able to say *"this path is 47% reliable"* while never asserting
anything about a person that the leader did not record.

## Decision

**Signal Path (`#/signal`) prices a declared escalation channel as a series of
relays, then grades its own declaration against a probe ledger the leader
fills in.** The components:

- **Engine (`signalPath.js`).** Reach is
  `1 − (1 − Π t_hop)(1 − q_direct)`; the false-alarm rate compounds in the
  opposite direction, `1 − (1 − Π (1 − a_hop))(1 − a_direct)`, so depth costs
  twice. Latency is arrival-conditional (weighted by which branch produced the
  arrival), not a naive sum. Expected loss is
  `θ × exposure × (1 − reach × (1 − min(1, lag/horizon)))`: a channel absorbs
  part of a loss, it never abolishes it. Information is Shannon mutual
  information in bits (`carriedBits` against `sourceBits`), and sensitivity is
  d′ with a log-linear correction so a perfect record is discriminable rather
  than infinite. Depth is derived from the roster through a reporting index;
  a management cycle is detected and refused instead of being given an
  arbitrary depth.
- **Contract (`signalPathSchema.js`, Schema v59).** Additive collections
  `signalClasses`, `signalProbes` and `signalLevers`, all normalised on load
  and fail-closed: an unreadable class is dropped, a dangling origin pointer is
  cleared, a settled probe with no observation reopens, and a `committed` class
  that cannot produce a frozen reading demotes to `declared`.
- **Frozen declarations.** Committing stores the reading with four decimal
  places and refuses to rewrite the exposure afterwards. The number a probe is
  graded against is the number that was declared — otherwise every settlement
  would grade a moving target, and the Brier score would be a compliment.
- **Probe ledger, not surveillance.** A probe records a fact that *already
  existed* and asks how the leader came to know it (`escalation`, `skip-level`,
  `monitoring`, `accident`, `never`). Delivery is derived from that answer, and
  the lag from two dates the leader typed. Below six settled probes the page
  prints counts and explicitly withholds a verdict.
- **Priced levers (`priceLevers`).** Five interventions (`skip-level`,
  `cadence`, `escalation`, `review`, `monitoring`). Each one mutates a declared
  parameter and is re-scored by the *same* `evaluateChannel`, so a
  recommendation cannot contradict the baseline it came from; no lever is ever
  allowed to lower reach or raise the wait. The hurdle is the leader's own price
  of an hour — taken from the Attention Market when that terminal has a
  measured price, otherwise declared. A lever below the hurdle is still priced
  and labelled as not clearing; the page refuses to hide a bad deal.
- **Four rules on the shared spine.** `RULE-SIG-01` writes one `reaches` edge
  per relay plus `involves` to the owner. `RULE-SIG-02` opens exactly one DACI
  decision and one owned dated task when the ledger contradicts the declaration
  (marker-idempotent on `[RULE-SIG-02:contradicted]` / `[RULE-SIG-02:task]`).
  `RULE-SIG-03` links any case that lands on a path below the blind floor to
  the class that prices it, on a real `case.created` event. `RULE-SIG-04` turns
  an adopted lever into owned, dated work carrying its hours.
- **Reporting.** `SIG-01..07` roll into the Insights centre under `Signal
  path`; the `#/signal` nav badge counts them; CSV scope #51 exports class
  codes, ratios and counts only — no label, no name, no absolute amount.

## Consequences

**Benefits**

- A leader can finally see the *input* side of their decision record: which
  facts never arrived, and what the arrival rate is on each route.
- Every figure is either a count from a record the leader typed or an
  explicitly named model assumption; the page prints which is which.
- The declaration is falsifiable. Because the reading is frozen at commit and
  graded later, a leader who is overconfident about their team's candour finds
  out with a Brier score rather than a surprise.
- It composes: typed edges make the path navigable from a person or a case,
  savepoints roll the whole thing back, and the redacted export stays redacted.

**Accepted costs / limits**

- Reach is a *declared* per-hop transmit probability, not a measured one. The
  probe ledger grades the product, not the individual hops: it can tell a
  leader the channel delivers 33% when they declared 61%, and cannot tell them
  which relay swallowed the message.
- Parallel branches are assumed independent. A skip-level that also leaks
  context can be worth less than the arithmetic says, and the page says so.
- Latency is in whole days from typed dates; a chain that moves in hours will
  look slower than it is.
- The roster is the one input that cannot be guessed: a management cycle
  produces no reading at all rather than a plausible-looking one.
- Probe honesty is unenforceable. The ledger is only as good as the leader's
  willingness to record `never`.

## Alternatives considered

| Alternative | Disposition |
|---|---|
| Score org health from 1:1 mood and message volume | Rejected. Infers facts about people from proxies, which the product doctrine forbids. |
| Measure per-hop transmit directly by instrumenting communication | Rejected. Requires surveillance of individuals; the probe ledger gets the same signal from questions the leader already knows the answers to. |
| Rank levers by expected value and show only the best | Rejected. Hiding a priced bad deal is the failure mode this app exists to avoid; all five are shown with their hurdle verdict. |
| Report a single "channel health" index | Rejected. Reach, false-alarm rate, latency and bits carried disagree with each other by construction; collapsing them hides exactly the trade-off being decided. |
| Emit a verdict at any sample size | Rejected. Below six settled probes the page refuses a verdict; a label on three observations is noise wearing a suit. |
| Treat a committed reading as editable | Rejected. Editing the exposure after probes exist turns the Brier score into a self-assessment. |
