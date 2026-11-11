# ADR-0175 — The Matrix Pattern Repair Register: a recurring pattern gets an owner, a dated remedy and a review date — and the review reads the record or refuses

- **Status:** Accepted and implemented, 2026-11-10 / merged 2026-11-11 (Session 234 / Session 238), first slice
- **Schema:** v139 (one additive collection, `matrixRemedies`, empty on upgrade via `138 → 139`)
- **Decision:** ADR-0146 names the matrix structural signatures that keep recurring across distinct decisions. This ADR lets a span-level leader attach ONE accountable owner, ONE dated remedy and ONE review date to a recurring signature visible in their seat. On or after the review date, the register reads the same decision log before and after the remedy date over equal, disjoint windows and prints a verdict — or a printed refusal with its reason when the record cannot support one. Only the human act is stored; the verdict is re-derived on every read.
- **Altitude:** CEO / C-suite primary (the span above both lines, where a systemic pattern can be owned); the same seat-scoped read is available to every seat that reaches the recurrence.
- **Structure:** matrix. Single-chain workspaces are inert: no line means no pattern, and the panel prints that.
- **Surface:** `#/matrix?panel=remedies`; the access sweep (`tests/app/access-audit.test.mjs`) includes it. CSV scope #129 (`matrix-remedies`), aggregate and identity-free.
- **Scope of this slice:** declare a remedy, read the verdict, export the aggregate. **Not in this slice (In Progress):** supersession of a remedy, automated review-due reminders as a `RULE-RMD-01` post-commit rule, and a per-owner accountability roll-up. Each is named in the roadmap rather than faked.

## Context

Session 198 (ADR-0146) made repeated structural friction visible: the same finding kind, the same line kinds in force and the same affected rights, across distinct decisions. The roadmap then recorded the gap that followed: the workspace could show a recurring pattern but could not attach a human-reviewed owner, a remedy decision, a due date or a post-change check to it. A pattern that nobody owns recurs by default; a remedy that nobody reviews is never known to have worked or failed.

The post-change check is the hard part. A naive before/after comparison is wrong in three ways that this record can actually exhibit:

1. **Regression to the mean.** A pattern is usually recorded at a peak. Its later decline is the expected outcome whether or not the remedy did anything (Galton 1886; Barnett, van der Pols & Dobson 2005). A verdict needs a baseline before it can say anything.
2. **Quiet is not absent.** A window with no matching decision may be a window in which nobody decided anything. Absence is evidence of absence only when the window held enough decisions to have shown the pattern.
3. **Windows must be fixed.** A sliding or unequal window lets the reader choose the answer. Shadish, Cook & Campbell (2002) name this as a threat to any quasi-experimental reading; Campbell & Ross (1968) use fixed comparison windows for an interrupted series.

## Decision

1. **The act is stored, nothing else.** `matrixRemedies` holds: a canonical signature key, an owner id that resolves to a roster person or the workspace leader, a remedy of 20–600 characters, an optional basis, a decision date, a review date, the declaring seat (`null` for the operator) and `status: 'active'`. No verdict, count, rate, window, `cleared` flag or “owner-missing” flag is written.
2. **The signature is the concordance's own.** `buildRightsConcordance` now also exports, identity-free, each signature's distinct decision dates (`recurrence.signatures`) and the audited decision dates in scope (`decisions.auditedDates`). The register reads these; it never re-derives recurrence, so the register and the ADR-0146 lens cannot disagree about which patterns recur. A `concordance` identity asserts the equality on every read.
3. **Windows.** Let L = days between the decision date and the review date (bounded to 14–365 days at declaration). The **baseline** is the L days ending on the decision date, inclusive; the **review window** is the L days after it, inclusive of the review date. The decision day belongs to the baseline. The windows are disjoint and equal in length.
4. **Verdicts, in this order** (the rule is the pure function `remedyVerdict`, tested directly):
   - two or more active remedies for one pattern → `refused` (no verdict is read);
   - review date not yet reached → `pending`, with a running count labelled as such;
   - fewer than two matching decisions in the baseline → `refused` — no baseline;
   - fewer than two **audited** decisions in scope in the review window → `refused` — thin review;
   - no matching decision after the remedy → `cleared` (a statement about one window, not proof of cause);
   - fewer matching decisions after than before → `reduced`;
   - otherwise → `unchanged`.
5. **The write refuses what the record cannot show.** `matrixRemedyDeclare` requires `canAct('declare-matrix-remedy')` (rank 4–5 or full access); the pattern must be a recurring pattern visible in the acting seat right now; a second active remedy for the same pattern is refused; the owner must be someone the seat reaches; the decision date cannot be after today; the review date must fall 14–365 days after the decision date. Each refusal names the field and leaves the record unchanged.
6. **Fail-closed storage.** A row that fails the canonical normaliser — non-canonical signature key, unknown finding kind, missing owner, short remedy, non-ISO or non-increasing dates, a status other than `active`, or a duplicate id — is DROPPED and counted in a printed warning. It is never repaired, because a repaired owner or date is an invented accountability.

## Reliability identities (printed, not assumed)

- `concordance`: this register's recurring-pattern count equals the concordance's own `recurrence.recurringPatternN`.
- `patterns`: remedied + unaddressed = recurring.
- `remedies`: active remedies = matched to a visible pattern + unmatched (named, counted, never read).
- `verdicts`: the sum of the verdict buckets = remedied patterns.

A failed identity replaces the figures with a red reconciliation banner naming the failed check. The CSV is built from the same report the panel renders, and the aggregate row counts are asserted equal to the report's counts in the test suite.

## Refusals that are the product

- A pattern with one decision is not a pattern; a remedy cannot name it.
- A remedy whose pattern this seat cannot see is counted as unmatched and never read — no sideways widening of scope.
- An owner outside the seat's reach is shown as “name withheld”; an owner no longer on the roster is shown as a defect and is never repaired.
- A pending verdict prints a running count and no verdict. A refused verdict prints its reason. Neither is a zero.

## Shared-system boundary

- Reads: `buildRightsConcordance` (ADR-0145/0146) for patterns and dates; `buildSeats` and `matrixLineScopeFor` for the seat and its scope, passed INTO the concordance so the two readings share one scope.
- Writes: one `store.update` on `matrixRemedies`. No second hierarchy, no second event engine, no stored derived state.
- Wiring: `ACTION_RIGHTS` (`declare-matrix-remedy`, rank 4–5), `accessGateway` mapping, the `seatRegistry` collection policy, `actions.js` mounted before `guardApi`, the matrix tab registry and render hook, CSV scope #129 with a `default` export case.
- Explicitly **not** wired in this slice: a post-commit `RULE-RMD-01` (review-due reminders). It is In Progress, not faked.

## Consequences

- Schema v139 adds one empty collection (`matrixRemedies`). The migration `138 → 139` appends nothing and changes no record. Pins of the head version in the test suite were moved to 139 and the CSV scope pins to 129 (`#75` reserved).
- The standalone artifact grew by ~25 KB for three pure modules and the panel. The `standalone.test.mjs` absolute ceiling was raised from 10,760,000 to 10,800,000 with the reason recorded beside it; the 24,000-byte per-module density guard is unchanged.
- An executive can now see, for each recurring pattern, whether anyone owns it and whether the decision log moved after the remedy — and when it cannot tell, the register says why.

## Limits (stated, not hidden)

- **“Cleared” is a window reading.** It says the matching pattern did not recur in one fixed window. It does not establish the cause is gone, and a cleared pattern stays on the record.
- **Audited decisions are the denominator.** Decisions with no provenance link (unscoped) and undecided ones are not in the audited count, so a quiet window of unscoped decisions still refuses rather than clearing.
- **No causal claim.** Maturation, history and selection are not controlled. The panel prints the framework names and never calls a before/after change an effect.
- **Owner is a human declaration.** The register does not verify that the owner did anything. Owner follow-through is outside the record.
- **Disclosure.** The CSV keeps the same small-count exposure as the ADR-0146 pattern export (#108): a pattern with two or three decisions exports its counts. No identity is exported.
- **Verification boundary.** The panel is on the `access-audit` route list, which runs axe-core in JSDOM. Real-browser rendering and screen-reader behaviour are **[UNVERIFIED]**.

## Verification

- `node --test tests/app/matrix-remedy.test.mjs` — **18/18** (recurrence equals the concordance's own; no verdict before review; every verdict path and its refusal; duplicate and unmatched handling; the write's refusals leave the record unchanged; CSV identity-free and equal to the report; panel renders the report's figures in JSDOM; schema migration and fail-closed normalisation).
- End-to-end through the real store and `createApi` with `guardApi`: declare → persist → reload → read back gives the stored owner, the stored review date and a printed refusal; a second declaration is refused.
- **Full suite (`npm test`) compared test-by-test with a clean `HEAD` tree:** this branch 3,679 tests, 3,455 pass, 224 fail; `HEAD` 3,661 tests, 3,436 pass, 225 fail. Zero failures are new. The 224 are pre-existing (migration-history and stale count pins in older suites) and are not fixed here; they are named debt. One `HEAD` failure now passes (`review-stewardship`, CSV pin 122 corrected to 124).
- `access-audit` **14/14** with the new panel added to the axe sweep.
- `npm run verify:standalone` **7/7** (703 source modules, 10,779,644 bytes, v136); `check:boundary` OK (705 modules, 221 suites, 23 documentation checks); `check:links` OK (1,052 links); ESLint clean on every changed file.
- Pre-existing and untouched: `authority-reaffirmation`, `matrix-interface`, `structure-history` and `operating-cadence` (stale pins SCHEMA_VERSION 123, CSV count 109) fail identically on the clean baseline and were not changed.
