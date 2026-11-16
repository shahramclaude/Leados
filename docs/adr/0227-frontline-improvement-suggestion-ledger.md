# ADR-0227 — Frontline Improvement-Suggestion Ledger (kaizen *teian*): a suggestion is answered, owned and confirmed by people other than its author, and nothing closes it by the passage of time

- **Status:** accepted for the domain kernel (engine `kaizen-teian-2026.11-v1`); **the workspace wiring is In Progress and is not claimed as shipped** (see *Remainder*)
- **Date:** 2026-11-16
- **Deciders:** frontline / mid-manager altitude (rank 1–2) — the people who submit, and the route members who must answer; director / VP (rank 3+) read the route they are granted once the read is wired
- **Schema:** unchanged at v181. No collection, no migration, no stored figure. The kernel reads two arrays it does not yet declare in the schema; until wiring lands the reader returns an empty ledger on a real workspace.
- **Surface:** none yet. No route, no view, no CSV scope, no action, no seat grant, no automation rule in this slice.
- **Code:** `app/core/domain/suggestionRegistry.js` (closed vocabulary, limits, states, refusal codes, method note), `app/core/domain/suggestionSchema.js` (fail-closed normalizers), `app/core/domain/suggestionLedger.js` (pure reader, `buildSuggestionLedger`)
- **Tests:** `tests/app/suggestion-ledger.test.mjs` (22)
- **Rule:** `RULE-KZT-01`
- **Builds on:** ADR-0140 (matrix accountability, joint apex), ADR-0218 (Just Culture posture: counts describe states, never people), ADR-0224 (two-key control pattern and fail-closed normalizers)

## Context

A frontline person who sees a small waste — a label reprinted at every changeover, a tool fetched from the wrong cabinet — usually has the fix in mind and no sanctioned route to it. The record has incident and after-action entries (ADR-0223 family, ADR-0181 work-turn ledger) and a stop-work ledger (ADR-0224), but nothing for the ordinary improvement suggestion. The Toyota practice behind *kaizen teian* treats the suggestion as something that must be answered, not merely collected.

The gap is specific. `standardWork.js` tracks recurring leader routines; no reader records what happened to a proposed change after it was made: who was asked, whether they answered in time, who owns it, whether anyone other than the owner observed the effect. The `suggestion` uses in `app/` are the engine's own suggestions to a leader, not a frontline improvement register. A repository-wide search for `kaizen`, `teian` and `improvement suggestion` returns no implementation **[UNVERIFIED beyond the searched files]**.

In a matrix the question is sharper. A suggestion from a person with two managers has two candidate deciders. A register that silently routes it to one of them, or that lets one of two disagreeing deciders win, misreports ownership in exactly the way the matrix mandate forbids.

## Decision

1. **Three keys, in order, none inferred.** Triage by the declared route; the named owner's effect claim after acceptance; independent confirmation by the submitter or a route member, never the owner. Each is an append-only act with its own instant. Nothing closes by elapsed time.

2. **Shared routes need agreement, not a winner.** A route is the set of declared decision-makers, supplied by the caller from the matrix joint-apex computation (ADR-0140). With one member, that member's decision settles the suggestion. With several, every member must record the same decision, and an accept must name the same owner and target day. Any disagreement is printed as `triage-split`. Nobody decides after a split. A split is terminal in this kernel; a governed re-route is not built.

3. **Every refusal is counted and printed, never applied.** Refusals are `not-in-route`, `route-settled`, `route-split`, `already-decided-by-actor`, `not-accepted`, `not-owner`, `already-claimed`, `not-yet-claimed`, `self-confirmation`, `not-confirmer`, `already-confirmed`, `before-submission`, `unknown-suggestion`. A second triage, claim or confirmation never overwrites the first.

4. **Chronological replay, deterministic.** Acts are replayed in instant order with act id as the tie-break, so the derived state does not depend on the order the records were stored or synced.

5. **Fail closed at the door.** A suggestion with the synthetic `leader` seat as submitter, owner, route member or actor is dropped. A route that contains its own submitter, a duplicated route member, an out-of-window response deadline (1–30 days), an accept without an owner or target, a decline that names an owner, or a target more than 180 days from the decision is dropped. Dropped rows are counted and printed; nothing is repaired.

6. **Overdue is a flag beside the state.** `response-overdue` prints when a suggestion is still unanswered past its declared deadline. `target-overdue` prints when an accepted suggestion has no claim after its target day. Neither changes the state, and neither triages, declines or closes anything.

7. **Two claims, reported apart.** `partitionReconciles` proves the printed state counts add to the ledger total. `figuresComplete` is a separate integrity claim: no refused act and no dropped row. The reader never folds the two into one reassuring word.

8. **Withheld, not rated.** No benefit, savings or productivity figure is inferred from a count. No vote, popularity or idea-quality score is computed from prose. No person-level volume, ranking or recognition output is produced by the kernel.

## Framework basis

- **Kaizen *teian* (Toyota creative-idea suggestion system).** Frontline improvement proposals are answered by the people responsible for the process, and the proposer's ideas are visibly acted upon. `[citation details from memory, UNVERIFIED]` — the Imai, *Kaizen* (1986) reference recorded in ROADMAP.md is itself `[UNVERIFIED]` in this session.
- **Deming PDCA.** Plan (proposal), do (owner claims an effect), check (an independent party confirms it), act (the record closes or stays open). The check is a separate key by design.
- **Matrix accountability (ADR-0140).** The joint apex set above every active line; a diamond tie is a set of duties, never a winner.
- **Just Culture (ADR-0218 posture).** Describes states and counts, not people.
- **Response-time governance.** A declared response window is a commitment the record can break visibly; elapsed time is never a decision.

## Benchmark — [BENCHMARK-UNVERIFIED]

The market bar for this task is set by continuous-improvement platforms, not by suggestion boxes. Public product descriptions (not hands-on tests) describe: idea intake, configurable stages, owner assignment with deadlines, tracked tasks, a persistent audit trail and reporting by owner and category. Sources consulted in this session: `https://www.kainexus.com/suggestion-box` (KaiNexus product page), `https://axiobench.com/best/continuous-improvement-software/` (IdeaScale, Brightidea comparison), `https://worldmetrics.org/best/improvement-software/` (aggregator review). Their implementation-rate figures are vendor claims and are **not** used here.

**Result, stated plainly.** The kernel matches the **governance** layer those products describe — named owner, declared deadline, separate confirmation, append-only trail, refused acts visible. It does **not** match their **execution** layer: no mobile or kiosk submission, no voting, no workflow automation rules, no dashboards, no notifications, no attachment of work items. Those are the bar for the wired slice and are logged as In Progress. No product was used side by side with LeadOS, so the parity claim on governance rests on the published descriptions alone and is `[BENCHMARK-UNVERIFIED]`.

## Consequences

- **Positive.** A suggestion has one owner or a named, disclosed split. A closed suggestion always has an independent confirmation. A late answer is visible, not silent.
- **Negative.** Until wiring lands, the kernel is reachable only from tests and from a future caller; the `#/…` surface does not exist.
- **Matrix limit.** The kernel trusts the route it is given. Computing the route from the matrix (the joint-apex set over the submitter's lines) is the wiring's job and is not yet built.
- **Confirmation has no declared window.** A claimed effect can stay awaiting confirmation indefinitely, and this is printed as a state, not an overdue flag. Whether a confirmation deadline should exist is an open design question.

## Remainder (In Progress — not shipped)

1. Schema v181 → v182: two EMPTY-at-upgrade collections (`suggestions`, `suggestionActs`), with the existing fail-closed normalizers wired into `schema.js`.
2. Actions, rights and seat grants: READ / DECLARE / TRIAGE / CLAIM / CONFIRM through `accessGateway.js` and `seatRegistry.js`; route computed from the matrix joint-apex set.
3. Read-side visibility: any route the seat cannot see withholds the reading with a printed reason, as ADR-0226 does.
4. Aggregate rates per unit (answered within window; implemented), each withheld below the privacy floor of three, plus complementary suppression — not built.
5. A `merged` outcome (folded into another suggestion) — not built, deliberately excluded until identity of "the same idea" is defined.
6. CSV scope (aggregate, identity-free) and the `#/suggestions` view with its method figure.
7. Real-browser and assistive-technology walkthrough — not run.

## Verification

- `tests/app/suggestion-ledger.test.mjs` 22/22, including: each state reached by its own fixture; the shared-route agree / disagree / owner-mismatch cases; every refusal code exercised; order independence and non-mutation; fail-closed drops with exact counts; an independent recomputation of the printed state counts from hand-built fixtures; a mutation check (removing the owner self-confirmation guard fails one test, restoring it passes all).
- `eslint` clean on the four new files. `npm run check:boundary` passed.
- Not run: the full suite; the adjacent suites are untouched because nothing imports the new modules yet.

## Provenance

No visual asset is used. The kernel produces no UI and no generated image; the figure for the future view is listed under *Remainder* item 6.
