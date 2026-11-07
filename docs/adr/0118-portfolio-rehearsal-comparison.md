# ADR-0118 — The Portfolio Rehearsal Comparison: two reviewed responses replayed from ONE frozen revision, a declared-commitment vector, and a Pareto verdict or an explicit refusal to rank

- **Status:** Accepted — 2026-11-07 (Session 160, Schema v113)
- **Deciders:** LeadOS product architecture
- **Surface:** `#/compare` (new route), `recordPortfolioComparison` (`compare-responses`, rank 4–5), `RULE-CMP-01` on the shared post-commit spine
- **Extends:** ADR-0116 (cross-span LCA arbitration), ADR-0105/ADR-0114 (reviewed command bundles), ADR-0086 (the Disclosure Compiler)

## Context

The workspace could already rehearse ONE coordinated response: the Response
Studio replays three policies, and an action bundle replays its exact commands
and rule effects in a disposable store before adoption. It could not answer the
question its most senior seat actually asks: **two reviewed responses are on the
table; what does each commit us to, and where do they collide?**

The gap was not cosmetic. Two saved previews are only comparable when they were
taken from the SAME workspace revision on the same day — otherwise the "comparison"
places two different workspaces side by side and calls the difference an effect of
the plans. Nothing in the product enforced that, and nothing printed the declared
commitments (spend per currency, owned work, briefs, promises, review dates) that
actually differ between two responses.

The roadmap carried the item since Session 145 as `[VP → CEO] portfolio rehearsal
comparison — rehearse two reviewed responses side by side with software footprints
and declared assumptions, never a causal benefit score`. The Session-159 coverage
map showed the CEO/C-suite altitude without a primary ship since Session 156, so
this session was assigned to that altitude.

## Decision

1. **One frozen revision, or no comparison.** Both bundles are replayed in ONE
   worker pass, from one snapshot, at one clock, through the SAME production
   transaction code (`transactBundle`) that adoption will use. The receipt stores
   `baseRevision`, `evaluatedOn`, and both bundles' input and source fingerprints.
   `recordPortfolioComparison` refuses a receipt whose revision, day or either
   fingerprint no longer matches — a **stale receipt is re-run, never repaired**.
   A rehearsal with any rule failure is refused outright: an incomplete footprint
   is not a basis for an arbitration.

2. **A declared-commitment vector, never a benefit score.** Each side carries
   spend per currency (summed **within** a currency only), owned work, unsent
   briefs, coaching prompts, tested assumptions, the review date, the actual
   record and typed-relationship deltas production rules produced, and the rule
   IDs that made effects. Nothing estimates a probability of success, an expected
   value, a morale effect or a ranking.

3. **Pareto dominance, or a printed refusal.** `comparisonDominance` compares the
   declared criteria pairwise (Pareto 1906). If one side is no heavier on every
   comparable criterion and lighter on one, it "dominates on declared resources" —
   and the module prints that **this is a resource relation, not a case for what
   will work**. If neither dominates, both stay in the undominated set and the
   module states that it refuses to rank them (Keeney & Raiffa 1976: the weights
   are the decision-maker's judgement; Arrow 1951: incommensurable criteria are
   not collapsed into one number). When the two responses commit money in
   different currency sets the verdict is `incomparable` — pooling currencies to
   produce a ranking would fabricate the very number the screen refuses to invent.

4. **The arbitration is one atomic, human, reasoned act.** A rank-4/5 seat chooses
   A, B, or an explicit hold, and must write a rationale (minimum 20 characters)
   and confirm it read the assumptions. In ONE transaction the action writes the
   comparison receipt and a governed decision (options = both responses + hold,
   `chosen` = the human's choice, rationale attached, review date +14 days);
   RULE-CMP-01 then writes, in the SAME transaction, one `rehearses` edge to each
   candidate, one `informs` edge to the decision, and one `rolls-up-to` edge per
   leadership rung above the recording seat. **Recording an arbitration adopts
   nothing**: the chosen response still goes through its own reviewed
   `commitActionBundle` path.

5. **The arbitration boundary is the LCA pair rule.** A seat may record a choice
   between two responses when the people those responses would put to work MEET AT
   THAT SEAT (the lowest common ancestor of both owner sets is the seat), or when
   both source cases sit inside its full-detail boundary. That is ADR-0116's
   subsidiarity principle applied to a pair instead of a capture: two branches that
   only meet at this rung can be arbitrated here and nowhere below it, and the
   rule is derived from the record — never declared. A peer VP's branch is never
   handed sideways.

6. **The screen is adapter-scoped, not projection-scoped.** Above the director
   rung the generic seat projection returns no unit records at all, so a screen
   reading it would be empty at exactly the altitude it serves. `#/compare` reads
   through `comparisonCandidates` / `comparisonRead` / `comparisonBrief`, which
   apply the LCA pair rule, withhold the source case's title above director with a
   printed reason, and scope the ledger vertically (own records and the spans
   beneath them; the rung above is never readable from below). Division of unit
   task titles inside a bundle is still never projected — only counts and ledger
   names.

7. **Additive schema, empty ledger, no back-fill.** Schema v113 adds
   `portfolioComparisons` and nothing else. An upgraded workspace opens with an
   EMPTY ledger — "no portfolio response has been compared here yet", which is a
   different claim from "every choice between alternatives was justified". A
   comparison is valid only for the revision and day it was rehearsed on, so a
   back-filled receipt would be fabricated evidence.

## Consequences

- The CEO/C-suite altitude gets a screen whose subject is a **commitment and a
  collision**, not a dashboard of someone else's tasks, and the VP gets the same
  surface for cross-division arbitration.
- Two identical-looking previews can no longer be compared across revisions or
  days; the screen says so instead of silently implying an effect.
- `PROPAGATION_CONTRACTS` and `DEFAULT_POST_COMMIT_RULES` remain 1:1 (90/90);
  `actionBundles` fingerprinting, `transactBundle` and the receipt validation are
  shared with adoption rather than re-implemented.
- **Deliberately rejected:** a composite "response score" (rejected permanently —
  the unit is a declared criterion, and any weighting is the leader's); expected
  value or probability of success on either side; automatic adoption of the
  dominant response; comparing across revisions or currencies; a second hierarchy
  engine for the roll-up (altitude stays a dimension of the same spine).

## Verification

`tests/app/portfolio-comparison.test.mjs` **9/9** — same-revision binding and
fingerprints, declared spend never pooled across currencies, dominance and the
refusal to rank a non-dominated pair, the atomic arbitration (receipt + one
decision + two `rehearses` + `informs` + per-rung `rolls-up-to`, with nothing
adopted), stale-receipt refusal, the rank/reasoning/confirmation boundary, the
v112 → v113 additive migration with a loudly dropped malformed receipt, the
identity-free brief, and a jsdom render of the screen at the VP altitude.

Adjacent suites re-run: `action-bundles`, `command-flow-brief`,
`disclosure-compiler` — **55/55**. `npm run lint` PASS; `npm run check:boundary`
PASS (562 app modules / 163 suites / 23 documentation checks, 0 leaks);
standalone rebuilt (9,212,478 bytes / 561 modules / schema v113). The full
canonical suite and a real-browser AT walkthrough remain **[UNVERIFIED]**.
Seats remain workflow declarations, not authentication.
