# ADR-0060 — Read the whole book: correlated deferral portfolio, joint tail and graded forecasts

**Status:** Accepted · 2026-10-31 · Session 98 · Schema v69 · ADR-0060 · RULE-DPO-01..04 · DPO-01..05 · CSV #59

## Context

ADR-0059 priced one decision's option to wait. A leader, however, does not hold one option — they hold a **book** of them, and the per-call arithmetic is blind to the only thing that makes a book different from a list: **correlation**. Three facts force the issue.

1. **Additivity cuts both ways.** Under independent exercise, the expected total is the sum of the per-call premiums under *any* correlation — so an expected-value tool can never see correlation and has nothing to say about it. What correlation moves is the **distribution**: the joint tail, the concentration of the tail in one call, and how often coupled calls lapse together. Those are precisely the quantities a leader is asked about ("what happens if this goes wrong?") and precisely the ones no LeadOS surface computed.
2. **The workspace already knows what correlates.** Two decisions resting on the same load-bearing premise fail together — the premise graph *is* the correlation structure, with the topology free and only the magnitude missing. Deriving that magnitude would be an invented fact; making the leader declare it, with the graph naming the pairs, is honest and fast.
3. **A tail without attribution is a number, not a decision.** Finance answers "which position owns the tail?" with component contributions (Tasche 1999) that partition the tail exactly. Nothing in the management-tool space asks that question about *decisions*.

## Decision

Ship the **Portfolio panel** of the Deferral Option Terminal (`#/deferral?panel=portfolio`), Schema v69, that reads the whole book per currency and refuses whenever the inputs cannot support the model.

1. **Members.** The priced open calls of one currency, ranked by stake, capped at a convention (default 6, max 8); excluded calls are named as excluded. Fewer than two priced open calls is an explained dead end, not a zero.
2. **Coupling is discovered, ρ is declared.** `sharedPremisePairs` walks the premise graph — `premise.decisionId` plus `rests-on`/`tests` typed links, open decisions only — and canonicalises unordered pairs. A sharing pair with **no** declared ρ refuses the joint tail and names the pair: the graph identifies the coupling, the leader owns the number. Non-sharing pairs take ρ = 0 **by convention, printed** — the graph records no coupling between them, and that is a fact, not an assumption smuggled in. ρ outside [−0.99, 0.99] is dropped, never clamped.
3. **Consistency is enforced, not projected.** The declared matrix is factored by Cholesky; a non-positive-semi-definite matrix is refused outright ("no joint distribution has exactly those pairwise correlations"), never silently projected onto the nearest valid one. A declaration is an assumption with a name on it.
4. **The simulation.** Common-random-numbers Monte Carlo (mulberry32; Box–Muller), **daily grid** (convention `deferralPortfolioGridDays`, clamped 1–7). Each member follows its **own** lattice policy from ADR-0059 — the boundary is tabulated once per member onto the grid — pays its own carry while open, and lapses at its own earlier deadline. Correlated shocks come from the factored matrix. The expected total is never quoted from the simulation: it is the exact lattice sum, and the MC mean is printed **only** as its grid error, with the cause named (checkpoint overshoot under high volatility; the commit *rate* still matches the lattice, tested ≤ 1.5pp).
5. **The tail and its attribution.** Per-currency VaR/CVaR at a convention level (default 90%), Tasche component contributions (conditional means inside the book's own worst tail) that **partition CVaR exactly** — no Euler approximation — plus HHI on premium and on contribution and the top contribution share. The diversification credit is `CVaR(book) − Σ standalone CVaR` in payoff terms: subadditivity says pooling softens the tail; a small negative *measured* credit is simulation noise and the panel says which is which.
6. **Premise stress.** For each premise coupling ≥ 2 members: the members, the premise's share of the book's premium, the joint lapse probability under the declared ρ, the same under independence, and the **excess in percentage points** — the number that says "these calls fail together X pp more often than unrelated calls would." The reading freezes the worst excess.
7. **The forecast discipline is the same as ADR-0059's.** A frozen reading stores ids, aggregates and **one** probability — P(any member commits before the window closes) — no titles, questions, persons or notes. One freeze per currency per day; grading is once, after the window, from recorded `decidedOn` dates; Brier against the frozen claim; skill withheld below five grades. A premise that moves appends a **challenge note** to every reading resting on it and never rewrites a figure.

## Propagation

Four marker-idempotent rules on the existing spine (`deferralPortfolioRule`, registered after `deferralRule`, contract published in `propagationContracts.js`):

- **RULE-DPO-01** (`deferralPortfolio.frozen`) maps the reading to every member call (`aggregates-deferral`) and every shared premise (`stresses-premise`), and — only when the tail concentrates past the convention — opens one owned concentration-watch task.
- **RULE-DPO-02** (`deferralPortfolio.scan`, explicit) reconciles stale edges to deleted readings, opens due-grading tasks (≤3 per scan), and turns a window that expired with member calls still unrecorded into ONE governed decision per ISO week, linked to the reading.
- **RULE-DPO-03** (`deferralPortfolio.graded`) opens one blameless process task after a graded surprise (Brier ≥ 0.25): was the correlation wrong, the boundaries wrong, or the follow-through?
- **RULE-DPO-04** (premise lifecycle events) appends the challenge note above, and on a breach or dated human outcome opens exactly one re-price decision per premise per ISO week, with real options framed, the rule never choosing.

Signals `DPO-01..05` read **frozen records, not live renders**: due grading, concentration past the convention, joint lapse past the convention, expired windows with calls still open, and calibration trailing the base rate. A nav badge must stay cheap, and a signal that cites a reading id and a freeze date is more honest than one that cites a number that changes with every render.

## Defects the build found and fixed

- The correlation matrix initialised with a **zero diagonal** is never PSD — every declared book was refused as inconsistent. Diagonal is 1 by definition.
- Session 97's boundary extraction reported the **lowest** abandoned node as the abandon threshold; the policy abandons up to the *highest* abandoned node. The lattice pricing was unaffected; the reported threshold understated the abandon region, which mattered the moment a simulation tried to follow the policy. Fixed in `deferralOption.js`.
- The diversification credit sign was inverted against the payoff-terms CVaR convention, printing a negative credit for a tail that pooling had *softened*. Fixed and re-pinned.
- `analysePortfolio`'s too-few-members branch set `reason` but not `refusal`, so a freeze masked the true cause behind a generic correlation message.
- `newDecision` hardcoded the premise rule's tag in the rationale for rules it did not fire; the audit trail misattributed scan-driven decisions. The rule id is now passed in and the rationale names the actual trigger.
- The portfolio panel rendered its own page header inside the outer view's — two `h1`s on the tab, caught by the axe test. The panel header is now a toolbar with an `h2`.
- The `reading` query param in the reading's route was a fake affordance the panel ignored; the focused reading is now addressed and labelled.
- The reading schema clamped `steps` at 156 while the daily grid produces up to 366, corrupting a reloaded long-window reading.

## Consequences

- The demo seeds a coupled book: the two top-priced calls `tests`-linked to the load-bearing premise (a relation attention-market does not read as sharing, so no pin ripples) and one declared ρ = 0.45. No forecast is pre-frozen.
- CSV scope #59 exports per-currency aggregates only, BLANK below five readings per bucket — the same k-anonymity contract as every other scope.
- The MC runs only when the Portfolio panel renders, a freeze happens, or the export runs — never on the badge path. On the reference fixture the full report prices in under a second with 4,000 paths on the daily grid.
- The honest limits are printed on screen: the grid error, the ρ = 0 convention, the simulated-vs-exact distinction, and the fact that an option premium is a decision-analysis quantity, not a market price.

### Rejected

- **Projecting** an inconsistent correlation matrix onto the nearest PSD one. The refusal is the feature.
- **Deriving** ρ from co-movement of anything in the workspace. The graph gives the topology; the magnitude is the leader's declared assumption.
- Quoting the MC mean as the expected total. It is the lattice sum, always.
- A live-simulation signals path. Signals cite frozen records; the live book is the panel's job.
