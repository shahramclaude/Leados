# ADR-0228 — Decision-Domain Sensing Register (Cynefin): a cross-line decision's domain is stated only by a multi-line panel on evidence, and the committed mode is read against it, never enforced

- **Status:** accepted for the domain kernel (engine `decision-domain-sensing-2026.11-v1`); **the workspace wiring (declared decisions, panel and act surfaces, `#/` route, CSV scope, schema collections) is In Progress and is not claimed as shipped** (see *Remainder*)
- **Date:** 2026-11-16
- **Deciders:** director / VP (rank 3+) × matrix and single-chain — the owner who commits a mode and the panel members who sense the domain. Frontline and mid-manager panel members are served by the same reader.
- **Schema:** unchanged at v181. No collection, no migration, no stored figure. The reader reads two arrays (`domainDecisions`, `domainSenseActs`) that the schema does not yet declare; until wiring lands it returns an empty register on a real workspace.
- **Surface:** none yet. No route, view, CSV scope, action, seat grant or automation rule in this slice.
- **Code:** `app/core/domain/domainSenseRegistry.js` (closed vocabulary, the five domains, modes, the domain→mode fit map, the domain→evidence map, refusal codes, method note), `app/core/domain/domainSenseSchema.js` (fail-closed normalizers), `app/core/domain/domainSense.js` (pure reader, `buildDomainSense`)
- **Tests:** `tests/app/domain-sense.test.mjs` (21). A mutation that removes the two-line quorum rule fails 2 tests; the rule is restored and all 21 pass.
- **Rule:** `RULE-DSN-01`
- **Builds on:** ADR-0140 (matrix accountability: a cross-line matter is not one line's to sense), ADR-0218 (Just Culture posture: counts describe decisions and readings, never persons), ADR-0227 (the separation-of-duties pattern: the party that acts does not also grade it; refusals printed, never applied)

## Context

Leaders at director and VP altitude, in a matrix, decide matters that sit between lines: a platform change that finance prices differently from the sales team that must sell it, an outage that one line calls a process failure and another calls a people failure. Each line tends to answer the prior question — *how knowable is the cause here?* — with its own habit. Finance reads it as a model question. Platform reads it as an experiment question. Sales reads it as a relationship question. The owner then picks a method (a business case, a pilot, an immediate fix) without the record showing that the people who would carry out that method ever agreed about what kind of problem it is.

Cynefin (Snowden & Boone, "A Leader's Framework for Decision Making", *Harvard Business Review*, 2007) is the framework the cross-domain standard asks for here. It names five domains — clear, complicated, complex, chaotic, disorder — and a decision sequence for each: sense–categorise–respond, sense–analyse–respond, probe–sense–respond, act–sense–respond, and decompose-then-sense. The framework's own position is that the domain is a *sensed* property, not a label, and that a leader who sorts problems into boxes without evidence has missed the point.

The repository has no implementation. A search of `app/` for `cynefin`, `complex`-domain sensing and the five domain names returned none, and ROADMAP lists Cynefin among the frameworks with no trace in `app/` (grep-level evidence only; **[UNVERIFIED beyond the searched files]**). Decision-fit and decision-tempo modules weigh *who* decides and *how* a call is held (`decisionFit.js`, `decisionTempo.js`). **[UNVERIFIED — the epistemic and diligence modules were only grep-scanned, not read]**. As far as the searched files show, none records what kind of cause-and-effect the panel says the matter has, or whether the committed method fits that statement.

## Decision

1. **A domain is sensed by a panel, not declared by an owner.** A decision declares a panel of two to eight members, each on a declared line. Readings are append-only acts. The owner commits a mode, but cannot read the domain of their own decision: a reading from the owner is refused with `owner-self-assessment`, and the owner's seat is shown unread. The party who gains from calling a matter clear or complicated does not grade it.

2. **Every reading carries evidence matched to its domain.** The kernel refuses a reading whose basis does not support its domain (`basis-does-not-support-domain`), and it does not count that reading.

   | Domain | Evidence basis the reading must carry | Why this evidence |
   |---|---|---|
   | clear | `precedent` — at least 3 comparable dated cases with the same outcome | Repeatable cause and effect is visible in the record |
   | complicated | `analysis` — a named analysis reference | Cause and effect are knowable by expert analysis |
   | complex | `probe` — at least 1 dated safe-to-fail probe, with what was observed | Cause and effect are visible only in retrospect; only probing can show them |
   | chaotic | `onset` — a declared onset instant not later than the reading | No cause-and-effect relation can be perceived; the onset is the dated fact |
   | disorder | `unsorted` — a note saying the panel cannot yet name a basis | The honest state of not knowing which domain applies |

   Evidence is **declared, not verified**. The kernel does not check that the cited precedent, analysis or probe exists in the record. That gap is printed (see *Remainder*).

3. **Quorum is two readings from two distinct lines.** A domain cannot be set by one line in a matrix. A panel declared on a single line can never reach quorum, and the reader says so (`panel-single-line`) rather than waiting silently.

4. **Agreement is unanimity, never majority.** A domain is stated only when quorum is met and every counted reading names the same domain. A split is printed as `domain-contested`, with the counts for each domain, and **nobody is picked**. A majority of two against one is not a domain.

5. **Fit is a reading against an agreed domain, never an enforcement.** Each domain maps to exactly one fitting mode: clear → standard practice; complicated → expert analysis; complex → safe-to-fail probe; chaotic → stabilise first; disorder → decompose. The map is one-to-one by construction, and a test proves no mode fits two domains. The owner commits a mode once; a second commitment is refused. The reader reports `fit`, `mismatch` (with the mode that fits), `owed`, or `not-readable`. A mismatch blocks nothing and changes nothing.

6. **Fit is never judged before agreement.** A contested or unquorate decision reads `not-readable` with the reason, never `fit`.

7. **Flags decide nothing.** A sensing window that has passed while the domain is not yet agreed prints `sense-overdue`. A reading older than 30 days prints `reading-stale`. Neither changes a domain, a state or a fit. A stale split is still a split.

8. **Counts reconcile, and completeness is a separate claim.** `stateCountsReconcile` proves the four state counts add to the decision total and that the agreed-domain counts equal the agreed-state count. `fitCountsReconcile` does the same for fit. `figuresComplete` is a separate fact: it is true only when no act was refused and no row was dropped. The two claims are never merged into one reassuring word.

9. **Fail-closed input.** A malformed decision or act is dropped and counted with a warning. Nothing is repaired: no panel, owner, deadline, basis or mode is invented. The synthetic `leader` seat is never a panel member, owner or actor. A basis whose onset is later than its own reading is malformed and dropped.

10. **Pure and deterministic.** The reader is a pure function of the stored decisions and acts plus an injected clock. Acts replay in chronological order with ties broken by id, so input order never changes the output. The input is never mutated. An invalid clock throws; it does not produce a reading.

## Benchmark (Step 3.5)

**The bar.** Cynefin's own practice. Snowden is explicit that the framework is a sense-making practice, not a categorisation scheme, and that a diagnosis precedes the choice of method. The published commercial tools in this space are mostly diagram tools: they draw the five-domain layout and let a team drop items into a box (Creately's guide is one example; a 2×2 "Stacey-style" grid is the common alternative).

**The comparison.** Descriptions of those tools and of the framework were read; no product was run side by side. The kernel matches the framework's *discipline*: evidence before a domain, a panel rather than one voice, a dynamic domain that can be re-read, and a fit reading rather than a prescription. It does not match the *practice* the framework depends on: the facilitated sense-making session, the design of the probes themselves, the narrative capture, and the reading of weak signals. Those are not in the kernel.

**Result: `[BENCHMARK-UNVERIFIED]`.** The kernel clears the bar on the discipline it encodes and does not clear it on facilitation or probe design. No head-to-head test was run. Vendor claims were not used.

## Consequences

- Positive: a director can see, on the record, that the panel split, and which line read what, before a method is chosen. A mode committed against an agreed domain is recorded as fit; one committed against it is recorded as a mismatch, with the expected mode printed.
- Positive: matrix correctness is built in. A single-line reading cannot pass quorum, a second line's disagreement is printed rather than averaged away, and one line cannot read on another's behalf.
- Negative: evidence is declared, not checked. A panel can cite a precedent that is not in the record. The kernel cannot tell, and the register says so in its method note.
- Negative: no UI, no action and no CSV in this slice. The register is a tested kernel, not something a director can use yet.
- Negative: the panel's reading is still a human judgement with a declared basis. The register makes that judgement visible and checkable; it does not make it correct.

## Deliberately absent

- No automatic domain classification from prose, keywords, metrics or model output.
- No majority vote, weighting, or seniority-weighted reading.
- No override, block or automatic change of a committed mode.
- No per-person score, ranking or accuracy rate for any assessor. Counts describe decisions and readings only.
- No automatic re-sensing or domain change on the passage of time.

## Remainder (In Progress — not claimed as shipped)

1. **Schema.** Declare `domainDecisions` and `domainSenseActs` as versioned collections, default empty, with an upgrade migration. Expected v181 → v182.
2. **Verification of cited evidence.** Check that a cited precedent, analysis or probe resolves to a record in the workspace, or print that it does not. Until then every basis is `[UNVERIFIED]`.
3. **Surface and actions.** A `#/` route for the register; actions to declare a decision, read, and commit; a permission model that matches the seat rights; CSV scope.
4. **Benchmark completion.** A facilitated sense-making walkthrough and a probe-design aid, each compared against a practitioner workflow before the Step 3.5 bar is claimed.

## References

- Snowden, D. J. & Boone, M. E. (2007). "A Leader's Framework for Decision Making", *Harvard Business Review*, 85(11). The five domains and their decision sequences.
- Snowden's position that Cynefin is a sense-making framework rather than a categorisation scheme, as summarised in published guides to the framework (read for this ADR; not re-verified against the original paper).
- ADR-0140 (matrix accountability), ADR-0218 (Just Culture posture), ADR-0227 (separation of duties, refusals printed).
