# ADR-0218: The Just Culture Decision Record — who decides a conduct review, what the answers point to, and where the decision departs from them

- **Status:** accepted (engine `just-culture-2026.11-v1`)
- **Date:** 2026-11-15
- **Deciders:** Frontline and mid-manager altitude (rank 1–2) — the line that decides a person's conduct review
- **Schema:** v171 → v172 (two EMPTY-at-upgrade collections: `justCultureReviews`, `justCultureActs`)
- **Surface:** `#/just-culture` (Reviews / Lines / Method), CSV scope #160 (`just-culture-reviews`, aggregate only)
- **Code:** `app/core/domain/justCultureRegistry.js`, `justCultureSchema.js`, `justCulture.js` (reader), `justCultureActions.js` (writes), `app/views/justCulture.js`, `app/assets/just-culture-method.jpg`
- **Tests:** `tests/app/just-culture.test.mjs`

## Context

Just Culture (Marx, 2001) separates human error, at-risk behaviour and reckless behaviour, and matches each to a response: console, coach or formal review. The register had been Planned since Session 247. Speak-up (ADR-0215) answers whether a voice was heard. This answers whether a finding about a person was fair. They are kept apart on purpose.

## Decision

1. **Five questions, asked in order.** Deviation (none / departure / unknown). If a departure: slip or choice. If a choice: risk judged justified or disregarded. If a departure: the substitution test (Dekker, 2007) — would a peer with the same training have done the same. Always: a system condition (Reason, 1997).
2. **The response the answers point to is computed by one pure function** (`justCultureExpectation`). An unanswered question is named as pending. No default response is ever returned.
3. **A response that departs from the answers is accepted only with a written reason**, and is stored and printed as a departure. The register never corrects it.
4. **Ownership is proved against the live matrix on every write.** A person with several lines must have a deciding line named; the record never chooses one. Nobody opens a review of their own conduct. The deciding line decides; every other line the person holds must concur or dissent.
5. **A dissent contests the decision. A revision resets concurrence.** A line that ends while holding a review leaves it orphaned, not silently re-owned.
6. **Withdrawal is possible only before a decision, and keeps the record.** A withdrawn review refuses every later act.
7. **Disclosure.** Reviews name conduct, so they are individual material (`classKey: individual`). Above the manager altitude a seat reads counts only. Line counts below a floor of 3 are withheld, and the withholding is counted. CSV #160 carries no identity.
8. **The register does not discipline.** A formal review is a recorded referral. This register does not run it.

## Rejected

- *Inferring reviews at upgrade from incidents, feedback, 1:1s or speak-up concerns.* Each is a different instrument. A conduct review invented at migration attributes a culpability finding to a person nobody reviewed.
- *Choosing a deciding line for multi-line people.* That is the silent ownership the matrix mandate forbids.
- *Letting the page show a computed response as the decision.* The response chosen and the response the answers point to are both printed.

## Consequences

- Schema v172. Migration 171 → 172 adds two empty collections. Existing workspaces upgrade in place.
- Every `SCHEMA_VERSION` pin in `tests/app` moves to 172. The migration-chain assertions gain the `171 → 172` step.
- `CSV_EXPORTS` count moves 159 → 160.
- `#/just-culture` is a route in `main.js`, with a nav item and an attention badge that reads the same count the panel prints.

## Known limits, recorded honestly

- The full `node --test` suite was not confirmed green at the time of writing. The migration-chain fix was applied after the last complete run, and it has not been re-run.
- `RULE-*` spine registration (postCommit / propagationContracts) is not built. The register writes through the store's normal commit path only.
- The Marx (2001), Reason (1997) and Dekker (2007) citation details are [UNVERIFIED].
- `LeadOS-standalone.html` has not been rebuilt.
