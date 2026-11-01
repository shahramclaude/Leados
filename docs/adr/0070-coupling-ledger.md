# ADR-0070: The Coupling Ledger — read a declared ρ back against realised joint timing

Date: 2026-11-01 · Status: implemented · Schema: v78 · Surface: `#/deferral?panel=coupling`

## Context

Session 98 (v69) built the Deferral Portfolio: the leader declares a pairwise
correlation ρ for every pair of calls the typed graph shows sharing a premise,
and the module prices a correlated joint tail on those numbers. Session 99
(v70) built the Signal Integrity Board to grade the detectors. Both closed by
naming the same open item as their top or third priority, and it was the same
item both times:

> **ρ calibration from graded readings** — the Brier ledger already stores what
> a recalibration needs, and the same machinery disciplines the
> declared-correlation step that is currently pure judgement.

That item was not actually achievable as written. A Brier ledger grades a
*probability about an outcome*; ρ is a *correlation between two processes*, and
no number of graded book readings identifies it: each reading supplies one
binary outcome about the book as a whole. The carried item was a good instinct
attached to the wrong estimator.

The right estimator was already sitting in the workspace, unread. Every decision
carries `date` (or `createdAt`) and, once made, a frozen `decidedOn`. So every
call has an **at-risk calendar window** and a **resolution block**. Two coupled
calls either resolved inside the same block or they did not. A rate of that,
across a band of declarations, is ground truth the workspace already contains —
no new data entry, no simulation of the past, and no volatility invented for a
call that has already been made.

The competitive picture, surveyed 2026-11-01: correlation calibration exists in
finance (RiskMetrics, the Gaussian copula literature from Li 2000 onward) and in
macro forecasting (the Survey of Professional Forecasters' density
calibration). No people or decision product does it. Culture Amp, Lattice,
15Five, Leapsome, Visier and the 2026 AI-native entrants all stop at
*descriptive* analytics on decisions; none of them asks a leader to declare a
structural dependence between two of their own open calls, and therefore none of
them can audit that declaration. LeadOS is in the unusual position of having
already sold the leader the number — which means it owes them the audit.

## Decision

Add a fifth panel to the Deferral Option Terminal: `#/deferral?panel=coupling`.

### 1. The estimand is conditional co-resolution, and it is labelled as such

Among declared pairs where **both** calls carry a decision date, how often did
the two resolutions land in the same calendar block? That is co-resolution given
that both resolved — not co-movement of value, and not a probability that either
resolves at all. A pair with an open member is **refused with a printed reason**
and never counted as a non-coincidence. A pair whose whole common window fits
inside one block is also refused: a coincidence there is arithmetically certain
and carries no evidence either way.

### 2. The null is a structure-preserving rotation, and it is conservative

Under "no coupling", a call's resolution block is exchangeable within its own
at-risk window. The test cyclically rotates each call's resolution block inside
its own window, using `s = (rotation + 31·callIndex) mod window`:

- every call keeps its marginal exposure;
- a call that belongs to several pairs keeps **one** placement across all of
  them, so the test never pretends the coupling graph is independent;
- the family is deterministic, so the p-value never moves with a random seed.

Because the rotation window is at least as wide as the pair's common window, the
null makes coincidence no **more** likely than a uniform-over-overlap null would.
The reported p-values therefore overstate, never understate, the evidence for
coupling. The analytic expectation `|A ∩ B| / (|A| · |B|)` is printed beside
every count so the lift has a denominator that does not depend on the rotation
family at all.

Both tails are tested. A leader who declared a strong positive ρ and whose
record shows **no** coincidence at all has a finding, and a one-sided upper test
could never report it.

### 3. The declared-ρ reference is a stated copula convention, in two mappings

A declared ρ is a Pearson correlation of value innovations; a coincidence is a
rank correlation of times. They are not the same object and there is no unit
conversion between them. The module maps one onto the other through a
bivariate-normal copula on the block index and prints **both** defensible
mappings: τ = ρ, and the exact normal-theory Spearman transform
τ = 2·sin(πρ/6) (Kruskal 1958). At ρ = 0 the curve reproduces the printed
independence rate 1/k exactly; at ρ → 1 it reaches 1. Where the two mappings
disagree about a magnitude finding, the finding is marked mapping-dependent and
**no work is opened** on it. It is an ordinal reference: higher declared ρ
should show higher coincidence.

### 4. Verdicts distinguish "no verdict" from "no coupling"

Six verdicts: `coupled`, `hedged`, `independent`, `inconclusive`,
`insufficient` (below the pair floor), `unidentifiable` (too few expected
coincidences). A band that is too thin prints **no assessment at all**. Six
assessments turn that into meaning: `confirmed`, `over-declared`,
`under-declared`, `overstated`, `understated`, `unresolved`. The magnitude
readings only run when the direction is settled, against a printed materiality
band of 20% of the model figure or five points, whichever is larger.

### 5. Nothing is ever written back

The module has **no write path** to `correlationDeclarations`. It never clamps,
defaults or derives a declaration. A freezing review stores an aggregate-only
record (band counts, the rotation summary, the model reference, one prospective
probability) plus decision ids — no title, no question, no person, no note. A new
declaration landing in a contradicted band appends a challenge note to the frozen
review and opens one advisory task; the frozen figures are never rewritten.

### 6. Three rules on the existing post-commit spine

- **RULE-CPL-01** (`couplingLedger.frozen`) writes `calibrates-coupling` edges to
  every member call and `measures-coupling` edges to every premise that
  nominated a pair, and opens exactly one owned reconciliation task when a band's
  declaration is contradicted and the finding is not mapping-dependent.
- **RULE-CPL-02** (`couplingLedger.scan`) opens due grading work and turns a
  contradicted frozen review into exactly one governed re-declaration decision
  per ISO week, with three printed options.
- **RULE-CPL-03** (`deferralPortfolio.declared`) appends a challenge note to the
  standing review when a new declaration lands in a contradicted band, and opens
  one advisory task per band per ISO week. The declaration is accepted exactly as
  declared.

Five signals (CPL-01…05), a board-ready brief, CSV scope #68 (band aggregates
only, no decision id and no title) and the terminal's own attention badge ride
the existing surfaces.

## Defects found by building it

- **The bivariate normal was computing ρ².** The conditioned integral was
  written as `Φ((h − ρt)/√(1−ρ²))`, the tempting shortcut, which is the CDF for
  a correlation of ρ². At ρ = 0.5 it returned 0.290 against a true 0.333 — a 13
  point error in the middle of the range this module reads. Replaced with the
  one-factor representation `X = √ρ·T + √(1−ρ)·U`, and asserted in the suite
  against the closed-form identity `Φ₂(0,0;ρ) = ¼ + arcsin(ρ)/2π`.
- **A fixed quadrature grid was wrong where it mattered.** The conditioned
  integrand has feature width √(1−ρ), so a 240-panel grid that is accurate at
  ρ = 0.3 is badly wrong at ρ = 0.95. The panel count now scales with 1/√(1−ρ),
  capped and printed; Φ₂ now matches the closed form to six decimals across
  −0.5 … 0.99.
- **The verdict read its floors off the wrong object.** `verdictFor` was reading
  `band.minPairs`, `band.alpha` and `band.liftTolerance` off the *band
  descriptor*, where they are `undefined` — every floor silently disabled, and a
  two-pair band printed `coupled`. This is precisely the "measurement switched
  off by a typo" failure the settings clamps exist to prevent, reproduced one
  layer up. The floors now come from the conventions object that was actually
  passed in, and a test pins a two-pair band to `insufficient`.
- **RULE-CPL-02 returned before reaching its own contradiction branch.** An
  early `return` on "no expired reviews" meant the re-declaration decision could
  never be opened by a scan. Found by the rule test, not by reading.
- **A frozen claim was re-based onto the wrong window.** The Laplace-smoothed
  hazard was measured over the convention horizon (90 days) and then applied
  directly to a 30-day review window, overstating a forecast by a factor of
  three. The hazard is now re-based to the actual window and the basis string
  states both numbers.
- **A review could be read back with a band missing.** The normalizer dropped an
  unreadable band and kept the review, leaving a table that no longer matched
  what the leader was shown when they froze it. The whole review is now dropped
  with a warning instead.
- **The deferral terminal had never been through axe.** It was not in the
  accessibility suite's route list, so every panel it grew since v69 shipped
  unexamined. A new test walks all six panels — one `h1` each, no axe violations,
  every control named, every table captioned.

## Alternatives rejected

- **Estimating ρ by inverting the coincidence rate as a headline.** A
  single-observation inversion is a one-moment estimate from a flat curve; it is
  printed as an advisory with an explicit `identified` flag and is never applied.
- **A likelihood over log-value co-movement.** Would need historical value paths
  the workspace does not store, and would invent volatility for calls that have
  already resolved.
- **Fisher's method over per-pair p-values.** Requires independent tests; pairs
  that share a decision are not independent, and the rotation null already
  handles that correctly.
- **Resampling the block assignment with a seeded RNG.** Reproducibility across
  machines matters more than the marginal improvement over a deterministic
  equidistributed rotation.
- **Treating a thin band as independence.** The single most damaging possible
  reading of this screen; explicitly refused and pinned by test.
- **Writing a suggested ρ into `correlationDeclarations`.** The declaration is
  the leader's judgement. "Declare from your record" pre-fills the dialog and
  states where the number came from; the leader still has to confirm it.
- **Per-person anything.** This module never reads a person field.

## Consequences

- The Deferral Portfolio's declared correlations are now auditable from the
  leader's own record, and the Portfolio panel's refusal ("the graph identified
  the pairs; the number is yours to declare") now has a companion that can say
  whether the number held up.
- Two new typed relations and one entity type join the link graph, so a frozen
  review is navigable from every call it audited and every premise that nominated
  a pair.
- `LeadOS-standalone.html` grows by four modules and ~79 KB minified over the
  v77 artefact (5,814,537 → 5,893,679 bytes, 298 → 302 modules), i.e. 19,516
  bytes per module against an unchanged 24,000 density bound.

## Not claimed

- That a coincidence rate identifies a Pearson correlation of value
  innovations. It does not, and the mapping is a printed convention.
- That 30-day blocks are the right grain. They are a declared convention; a
  different block length changes which pairs are testable at all, and the page
  says so.
- That the rotation family is an exact combinatorial test. It is a
  quasi-enumeration with a printed resolution floor of 1/(R+1).
- That a refused pair means the calls were uncoupled. It means the record cannot
  see them resolve.
- That this survives contact with a real leader's record. It has not been run
  against one.
