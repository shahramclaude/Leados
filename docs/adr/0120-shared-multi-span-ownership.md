# ADR-0120 — One ownership meet for every span

- **Status:** accepted
- **Date:** 2026-11-07
- **Session:** 162 · Schema v113 unchanged
- **Deciders:** LeadOS maintainer; mid-manager workflow primary, every altitude on the same spine

## Context

`chain.js#lowestCommonAncestor` stopped at the first pair that shared an ancestor. With two reports under lead A and a third under lead B, it returned lead A instead of the manager who owns both teams. The same helper feeds intake, work harvesting, disclosure, decision fit, epistemic ownership, mandates and value-stream mediation. Capture merge and jurisdiction had separate correct-ish workarounds, so the product could disagree with itself about who owns one constraint.

The real duty is ordinary management: triage a blocker across several team leads, put the mitigation with the lowest accountable manager, and let the director/VP receive the roll-up without re-entry. The framework is the graph-theoretic lowest common ancestor (Tarjan 1979) applied as Jaques-style span-of-consequence / subsidiarity: the smallest span containing every affected branch owns the work.

## Decision

Make the shared `lowestCommonAncestor(chain, ids)` an associative reduction of the binary tree meet over the complete de-duplicated id set. It is order-invariant, grouping-invariant and idempotent; unknown ids keep the existing filter/root-fallback contract; malformed loops terminate at the workspace root; no reporting depth is silently truncated. `multiSpanLowestCommonAncestor` is now the exact same exported function, and `commonAncestorOfAll` delegates to it. No new collection, rule, schema version or one-off module shortcut.

## Targeted caller inventory

Older roadmap notes estimated ~80 callers. The canonical `app/**` inventory on this base found **20 executable invocation sites in 16 files** (definitions/comments excluded); the older estimate was not reproduced and no whole-repository audit is claimed.

| Consumer | Sites | Input cardinality / effect |
|---|---:|---|
| `chain.js` responsibility + work harvest | 2 | variable people sets; corrected shared owner |
| `intake.js`, `altitudeRouter.js` | 2 | variable named people; corrected case/route owner |
| `accessGateway.js`, `disclosure.js`, `missionCaptureBrief.js` | 3 | variable record people; corrected span boundary |
| `decisionFit.js`, `diligenceRules.js`, `epistemic.js`, `epistemicRules.js` | 5 | variable record/signal people; corrected governed-work attribution |
| `execution.js`, `mandates.js`, `comparisonActions.js` | 3 | variable fallback/owner sets; explicit execution owner still takes precedence |
| `jurisdiction.js` | 2 | variable work people and coalition spans; local LCA workaround retired |
| `missionCaptureMerge.js` | 1 | variable capture owners; compatibility export now aliases shared meet |
| `valueStreamActions.js` | 2 | carryover owner set is variable and corrected; peer contract remains a fixed pair |

Thus 19 sites can receive more than two ids; one is intentionally a pair. Existing consumers need no parallel implementation.

## Consequences

- New routing/adoption and derived ownership reads use the corrected meet through the existing `case.created` → `propagateCaseEvent` / `RULE-AR-01` transaction. The manager receives the mitigation; ancestors receive typed roll-up edges and altitude-appropriate disclosure.
- Historical confirmed plans, value-stream receipts and frozen readings are **not rewritten**. Derived reads may change where the old helper understated the span; stored historical receipts remain historical facts. No back-fill invents a new approval.
- Seats remain local workflow declarations, not authentication or tenant isolation.

## Alternatives considered

- Patch only intake/Command Flow — rejected: leaves the shared engine contradictory.
- Keep three LCA implementations — rejected: ordering, depth caps and fallback semantics drift.
- Rewrite historical receipts — rejected: a corrected derivation is not a human re-approval.

## Verification (one focused pass)

The first combined pass ran 68 tests: 60 passed and 8 failed (one compatibility-export wiring mistake, one wrong fixture expectation, five merge failures caused by that export, and two pre-existing stale v112 schema pins). After one consolidated correction, the four failed suites reran **37/37 PASS**; the adjacent altitude-router and value-stream suites had passed **31/31** in the first pass. The new suite proves permutation/grouping parity, deep-line and cycle behavior, and one real manager note → case → `RULE-DEL-01` mitigation → `RULE-AR-01` roll-up → reload with peer access refused. `npm run lint` PASS; `npm run check:boundary` PASS (563 modules / 165 suites / 23 doc checks); standalone rebuilt (9,226,680 bytes / 562 modules / schema v113) and standalone suite **7/7 PASS**. Full canonical suite and real-browser AT walkthrough **[UNVERIFIED]**.

Revisit if the reporting model stops being a rooted tree (for example, explicit matrix authority); that requires a new authority model, not silently changing this meet.
