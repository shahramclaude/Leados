# ADR-0077: The Succession Terminal — the bench as a certified flow-feasibility claim

**Date:** 2026-11-02 · **Status:** implemented · **Schema:** v83 · **Surface:** `#/succession` · **Session:** 117 · **Built on:** [0075](./0075-command-chain.md) (the reporting tree and five altitudes), [0076](./0076-operating-seat.md) (the acting position), [0008](./0008-post-commit-rules-hook.md) / [0026](./0026-propagation-ledger.md) (the shared post-commit spine), [0006](./0006-canonical-zero-build-app.md) / [0007](./0007-legacy-next-tree-disposition.md) (the canonical boundary)

---

## 1. Context — what the audit actually found

Sessions 115 and 116 closed the two structural gaps that blocked §0.3. ADR-0075 shipped the
reporting tree (`person.managerId` → `buildChain` → five Jaques altitudes, LCA ownership,
escalation clocks). ADR-0076 shipped the enforced acting position (`settings.activeSeatId`,
`canSee`/`canAct`, a printable refusal ledger, `RULE-SEAT-01..03`). §0.3's "connected hierarchy"
and "vertical roll-up" are, in their computational sense, present and tested.

What remained absent is the thing every chief actually asks for and the thing none of the
existing 55 modules answers: **is the leadership bench real?** The workspace had a
`readiness` ledger since Schema v9 — a manager's self-assessed rating per successor seat
(`ready-now` / `ready-later` / `not-ready`) — and `readiness.js` already does the honest thing
of refusing to display a `ready-now` rating whose supporting evidence is thin. But that is a
check on a *claim*. The claim itself is still a rating a human typed, and the terminal's own
2026-11-02 audit (ROADMAP) lists the consequence plainly:

> `#/readiness`'s evidence check is real, but a seat with no nominated successor at all is
> invisible to it. `successionGaps()` only iterates seats that have at least one readiness
> row, so the most dangerous bench in the organisation — the one nobody ever rated — is
> missing from the report rather than flagged in it.

That is the audit's blunt finding, and it is worse than a rendering bug. Every succession
product in the category is built on the same premise: a manager names a successor, rates their
readiness, and a board sees a colour. The premise fails in exactly the situation succession
planning exists for — an unexpected departure — because a rating describes a *person's* state
and the question is about a *span's* work.

### The competitive picture (fetched 2026-11-02; RESEARCH §100)

- **Bench-strength reporting is the category's ceiling.** Teammeter, Workday, SAP SuccessFactors
  (which added a *Succession Planning Agent* in H1 2026 that "flags critical positions with no
  successors or weak bench strength"), Oracle Fusion HCM ("visual succession organization charts
  with readiness tracking and risk assessment"), PeopleFluent, TalentGuard (an "ESTRI Readiness
  Engine" producing "a continuous, auditable readiness score"), ChartHop ("color-coded org
  modeling to expose bench and coverage gaps") and Darwinbox all sell the same object: a
  readiness rating, aggregated into bench strength, rendered as a colour on an org chart.
- **The measurement is a nomination.** Every one of them asks a human to assert a successor and
  a readiness level. None computes whether the successor could *actually absorb the work*, and
  none publishes what a never-rated seat is worth.
- **Key-person risk is treated as a documentation problem.** The clearest vendor framing found
  (firsthr.app, 2026-10-05) separates "leadership succession" from "key person risk" and solves
  the second with "documentation of what one person knows, holds, and accesses… an afternoon per
  person". That is correct advice with no instrument behind it.
- **Cost of vacancy is sold as a number, never derived.** Salary-benchmark sites quote 1.5–2×
  annual salary; no platform prices a *blocked obligation* against the record that holds it.

**The gap none of them close.** No platform asks the question that has a proof: *if this holder
left on their next obligation date, does the set of remaining people admit an assignment of the
work?* That is a bipartite flow-feasibility problem, it has a maximum matching, and when it fails
it has a **minimum cut** — a certificate naming the exact obligations nobody can take. The
terminal is built on that, and on the second thing no vendor publishes: the probability that a
bench which has never been tested is worth anything, stated as a number rather than a colour.

---

## 2. Decision

Build `#/succession` (nav *Leadership bench*): a seventh-generation structural terminal whose
subject is a **span**, never a person, and whose central claim is a frozen, gradable
flow-feasibility statement with a printed certificate.

### 2.1 The unit of analysis is the bench, not the seat

A **span** is one leader and their **direct reports**. That choice is load-bearing:

- Direct reports **partition** the roster. Every person is on exactly one bench, so counts roll
  up by exact addition and no obligation is ever tested twice. (The first draft used the whole
  subtree and tested the same item at the team, the directorate and the function — which
  tripled the enterprise probability and produced a 100% certification on a workspace with one
  small team. The suite pins the non-overlap.)
- The **survivor set is the holder's peers**, never the span lead. "My manager would pick it
  up" is the comforting fiction the category sells; a lead who absorbs their report's work has
  not replaced a holder, they have deferred the vacancy. Whether the *lead* has capacity is a
  different question, and the Command Chain already answers it.
- A leader with **no** direct reports is an `empty-span`; a leader with exactly **one** is a
  `span-of-one`. Both are drawn, neither is `covered`, and each carries its own printed reason,
  because "the org has no bench here" and "the record has no evidence here" need different fixes.

### 2.2 What a span holds: the collective blanket

Coverage is the union of dated commitments the span collectively holds, not the longest
individual horizon (the **blanket model**, Haehling von Lanzenauer & Wright 1991). Two readings
are printed together:

- `blanketDays` — the furthest future-dated obligation any member holds.
- `threadCount` — how many *independent* obligations sit behind it.

A blanket of 300 days carried by one thread is the single most dangerous shape a bench can
have, and no bench-strength colour can see it. Sources are restricted to records a *person*
holds — a case, a delegation, a goal, a feedback follow-up, a premise. A **recurring** commitment
(a 1:1 cadence) never sets the blanket, because a weekly rhythm would otherwise inflate a
coverage number. A span with no future-dated obligation is **refused**, not reported as
infinitely covered.

### 2.3 Who holds the work: concentration, never a person's value

**Herfindahl–Hirschman** over each member's share of the span's dated work, with the
inverse-HHI **effective number of holders** and Shannon entropy beside it. HHI is reported on the
0–10,000 scale a leader can look up. Members who hold nothing stay in the denominator as zeros:
that is the difference between "the work is spread over six people" and "two of our six people
hold it". The share is of *work*, never of a person's worth, and the surface says so.

### 2.4 The flow test, and the certificate when it fails

If a holder left on their next obligation date, can every one of their open items be held by
someone who remains? A real **Dinic maximum flow** on

```
source ──1──▶ item ──1──▶ survivor ──headroom──▶ sink
```

with the assignment read from the residual graph (an arc at capacity zero carries the flow).
Eligibility is **evidence, never a name**:

| Source | The record that earns the edge |
|---|---|
| `covered-before` (strongest) | a handover this module already recorded from that holder |
| `delegated-together` | both received delegations in the same team |
| `shared-goal` | both appear on the same goal (owner or contributor) |
| `shared-review` | co-interviewers on a requisition, or parties to the same recorded review |
| `same-team` (weakest) | shared a team — counted, never hidden |

The **overload rule** is one declared number, printed on the surface:

```
capacity_i = ⌊ factor × median(load) − load_i ⌋ + 1,  floored at 0
```

The `+ 1` is the departing item itself; the rule is measured from the **median** so a balanced
team can absorb work and a member already at double the median correctly has no room. (The first
draft measured room *above* the median with no allowance for the incoming item, which gave every
member of a balanced team zero capacity and certified a gap in a perfectly covered span. The
suite pins both directions.)

When the flow is infeasible, the terminal does not print a shortfall. It prints the **minimum
cut**: the smallest set of obligations no survivor can hold, with each item's due date and its
eligible-survivor count. That is a proof on the current record, and it is what the task text and
the governed decision repeat.

### 2.5 What an untested bench is worth

For a span that has never run a handover, **Lindley–Smith single-sample acceptance** (Lindley
1965; Smith 1961; Laplace's rule of succession) gives the probability that the next critical
event is the first one the span cannot cover: `(k + 1) / (k + 2)` for `k` settled handovers
below the floor. It reads **50%** at zero, and that is the point — a never-tested bench is worth
a coin flip, and saying so is more useful than a green box. Above the declared floor the
measured record takes over with a Jeffreys posterior. The figure is never a statement about a
person's competence, and the surface says so on the same line.

### 2.6 The enterprise number is a PAIR

The chief's headline is the probability that at least one certified gap opens before the review
date. It is printed as a pair, never alone:

- `∏(1 − pᵢ)` — the independence reference, an **upper** bound;
- `maxᵢ pᵢ` — the assumption-free **union-bound lower** bound.

A span already infeasible has a gap *now*, so `pᵢ = 1`. A span inside the cap contributes a 5%
floor, because "we have not measured a problem here" is not "there is no problem here". The true
joint probability lies between the two figures and the terminal prints both — the same discipline
the Promise Solvency Terminal applies to its copula and its Fréchet bounds.

### 2.7 The diffusion index, and its floor

Across the chain, the share of **measured** spans that are not covered (Burns & Mitchell 1946;
the NBER diffusion index). It is a breadth signal — "structural, not one team's bad luck" — and
it explicitly does not forecast or identify which span binds first. Below the span floor it
refuses: a diffusion index over four spans is a coin toss with a decimal point.

### 2.8 Money: declared only, per currency, with coherent shortfall

Deprivation cost (Carley & Lin 1997) enters only as a **daily cost the leader typed, with a
currency**. Unpriced work is counted and never valued; currencies are never summed; no salary is
inferred and no band applied. Expected loss is `p × daily × days`, and the 90% shortfall is the
exact tail average of the binomial count — with the equal-marginal simplification printed as an
**upper bound**, because its tail is fatter than the heterogeneous Poisson-binomial with the same
mean.

### 2.9 Freeze, grade, and refuse

A frozen reading stores the exact blocking set, the span verdicts, the blanket and the
concentration index — plus **one** prospective probability and its lower bound. Freezing is
refused when no span can be measured (a reading that prices nothing is decoration) and when a
claim was already frozen that day. Grading is **once, later**, and re-runs the same structural
test: a member is a gap only when its holder left the roster with the obligation still open, or
when it was frozen as non-reabsorbable and still has no eligible survivor. A deleted member is
**unmeasurable**, never a gap; a completed obligation is the span *succeeding*; an unscoreable
probability is refused rather than graded as 0%. Skill is withheld below five graded readings.

### 2.10 Five altitudes, five different questions (§0.3)

One engine, five genuinely different operating pictures — not five dashboards and not one
filtered screen:

| Altitude | The question it is handed | Disclosure |
|---|---|---|
| Frontline lead | *If someone on this team is out on Monday, does the week still happen?* | names |
| Manager | *Which seat stops working if its holder leaves, and who could hold it?* | names |
| Director | *Where is coverage concentrated behind one person, and what does that cost?* | unit leaders |
| VP / executive | *What is the enterprise exposed to if the bench is thinner than the plan assumes?* | counts |
| CEO / C-suite | *Does the bench survive an adverse year, and can I say so to a board without over-claiming?* | counts |

Each stance carries its own **duties with routes**, its own **forbidden** list, and a disclosure
ladder that withholds names above the director rank. `successionView` resolves it from the seat
ADR-0076 already declares; there is no second org model and no second permission system.

### 2.11 Automation on the SAME spine (§3)

`successionRule` is registered **before** `seatRule` and after `solvencyRule` in
`DEFAULT_POST_COMMIT_RULES` (56 rules), so its certificate edges are provenance the seat's
boundary must then be able to explain, and a bench decision opened here reaches the levels above
through `RULE-SEAT-01` in the **same atomic transaction**:

- **RULE-SUC-01** — one leader-owned notice task per span per 30-day bucket when the blanket is
  inside the notice window.
- **RULE-SUC-02** — one governed DACI decision per span per 30-day bucket when the flow test is
  infeasible (develop a second holder / reshape the span / accept the exposure in writing), plus
  at most `successionMaxTasks` owned tasks carrying the min-cut certificate, with
  `certifies-gap` edges from the obligations, `understudies-for` edges to the seat, and a
  `hedges-departure` edge from the span to the decision.
- **RULE-SUC-03** — one development commitment per span per 90-day bucket when concentration is
  above the cap while the flow passes. The response to concentration is a second holder, never a
  warning.
- **RULE-SUC-04** — grading work for a frozen reading whose review date passed ungraded.
- **RULE-SUC-05** — dead certificate edges are revoked after a deletion or reorganisation, with
  the removal counted and logged, and other rules' edges untouched.

Pausable by `successionAutoPropagate`; a deliberate freeze and an explicit scan always run.

### 2.12 What it may never do

- Rate, rank, score or name a person as the subject of a judgement. `readiness` ratings and
  nominations are read as **claims** and never enter the flow test.
- Infer a departure from behaviour, tenure or sentiment. The test assumes a holder is absent; it
  does not predict who or when.
- Read `conflicts`, `pulses` or message text — forbidden endpoints, never a bench input.
- Move a reporting line, re-title anyone, or reassign work on the leader's behalf
  (`RULE-CHN-03` owns structural decisions).
- Report a rate, probability or money figure below its floor. A refusal is printed; it is never
  rendered as zero, and a span nobody rated is **unmeasured**, not healthy.

---

## 3. Frameworks named (§0.2)

| Discipline | Named method used |
|---|---|
| Operations research / HR economics | Blanket model of key-person coverage (Haehling von Lanzenauer & Wright 1991); cost-of-vacancy / deprivation cost (Carley & Lin 1997; Becker 1964) |
| Mathematics / graph theory | Ford–Fulkerson 1956, Dinic 1970 maximum flow; Hall 1935 / König 1931 minimum vertex cover; König's theorem for the certificate |
| Statistics | Lindley 1965 / Smith 1961 single-sample acceptance; Laplace 1814 rule of succession; Jeffreys 1946 posterior; Brier 1950 and Murphy 1973 skill, withheld below a floor |
| Industrial economics | Herfindahl 1950 / Hirschman 1945 concentration with the inverse-HHI effective count; Shannon 1948 entropy |
| Business-cycle measurement | Diffusion index (Burns & Mitchell 1946; NBER practice) |
| Risk management | Coherent tail risk (Artzner et al. 1999; Rockafellar & Uryasev 2000), per currency, never summed |
| Operations management | Critical chain / theory of constraints (Goldratt 1997) — the span with the least float binds first; Little 1961 |
| Organisational theory | Jaques' time-span of discretion, inherited from ADR-0075 and re-used rather than re-invented |
| Epistemics | Popper's falsifiability applied to the terminal's own claim — every frozen reading names the observation that would refute it, and is graded on it later |

---

## 4. Consequences

**Easier.** A chief can state a bench position to a board with a lower bound, a denominator and
the refusals intact. A manager gets a named set of obligations to fix rather than a colour. A
frontline lead gets a question about Monday. The certificate makes the finding arguable: a
reviewer can check the item, the due date and the eligibility edge.

**Harder / debt created.**

- **Eligibility is only as good as the record of who has worked with whom.** A workspace that
  never logs shared goals or delegations will over-report gaps. The terminal's answer is to print
  the blind spot (`unlinkedPairs`) on every span and the surface, not to soften the reading. A
  future session should propose eligibility from observed co-occurrence with an explicit
  false-positive bound rather than assuming absence is evidence of nothing.
- **The overload rule is a declared convention, not a measurement.** It is one number a leader
  can set, printed everywhere it is used. It is not a capacity model; real capacity belongs to
  ADR-0018 and the two are not yet joined.
- **The per-span `pᵢ` is a structural index, not a calibrated probability of departure.** The
  frozen reading grades the *joint* claim, and skill is withheld until five readings exist. Until
  then the terminal is an instrument with no measured skill, and it says so.
- **Schema v83** adds `successionReadings` and `successionMarkers` and moved 192 assertions in 79
  test files. The cost was accepted because a frozen quote is a record with a life of its own: a
  derived claim cannot be graded a year later.

**Revisit when** (concrete triggers): a graded reading shows Brier skill below zero after five
readings (the pᵢ construction is wrong and must be rebuilt); `unlinkedPairs` exceeds half of all
survivor pairs on a live workspace (eligibility is too thin to support a verdict); or a span this
terminal certified `covered` loses a holder and drops more than one dated obligation in the
following quarter (the claim itself is refuted).

---

## 5. Verification (actual results)

- `tests/app/succession-bench.test.mjs` — 16 tests: schema additive + fail-closed, the max-flow
  cross-checked against brute-force enumeration on every small instance of a fixed shape,
  the overload rule in both directions, the collective blanket and cadence exclusion, HHI +
  inverse-HHI, every refusal, the end-to-end certified gap, one committed delegation running the
  full 56-rule spine (certificate edges typed and registered, decision options surviving
  normalization, idempotent on rescan), a declared seat rolling the work up in the same
  transaction, freeze/grade/lapse/deletion, the action-layer refusals, five-altitude tiering with
  names withheld, six axe-clean panels, signals/badge/brief/CSV, and the inertness contract.
- **Four defects the suite caught in this session's own code**, all fixed: `Number(null) === 0`
  turning an omitted review horizon into the 14-day floor; a probability-free reading graded as a
  0% forecast (`Number(null)` again); `successionreading` used as an edge **source** before it
  was a registered graph entity type, so `ensureEntityLink` silently refused and the rule reported
  provenance it had not written (the link helper now logs its own refusals); and decision
  `options` written as bare strings, which the normalizer filters out, producing a decision with
  no options after a reload.
- Full canonical suite, `lint`, boundary check and standalone rebuild: results recorded in
  `AI-SESSION-LOG.md`.
