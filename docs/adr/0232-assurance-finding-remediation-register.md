# ADR-0232 — Assurance Finding & Remediation Closure Register: did the fix hold, or is this the third time?

- **Status:** accepted and **shipped** — domain kernel, actions, seat rights, `#/findings` route, CSV scope #175, schema v187 and the `RULE-AFR-01` spine rule are all wired on this branch.
- **Date:** 2026-11-16
- **Deciders:** Any seat at rank 1–5 may declare a finding (rank 1–5) and scan it. The **holder of an accountable line** names that line's remediation owner and target day (`assign`, rank 1–5, reachable only through a declared Matrix line). The **named owner** asserts the fix (`assert`, rank 1–5). **Verification** is open to any seat that sits *strictly above the owner* on the reporting graph and is refused to the owner, to the owner's subordinates and to unrelated branches (`verify`, rank 1–5). **Acceptance** of a residual risk is executive-only (rank 4–5) and is refused to anyone who remediates that finding. Read is rank 1–5, narrowed to the seat's grant.
- **Schema:** **v187** (v186 → v187). Three new collections, all empty at upgrade: `assuranceFindings`, `assuranceFindingActs`, `assuranceFindingMarkers`. No derived state, severity, recurrence flag, overdue flag or rate is **stored** — every one is re-derived on read by `assuranceFinding.js`, so a hand-edited file cannot carry a closure its own acts do not imply.
- **Surface:** route `#/findings`, view `app/views/assurance-findings.js` (five tabs: findings, by accountable line, counts/aging/rates, refused acts, method), CSV scope `assurance-findings` (#175), actions `assuranceFindingDeclare`, `assuranceFindingAssign`, `assuranceFindingAssert`, `assuranceFindingVerify`, `assuranceFindingAccept`, `assuranceFindingScan`, plus `assuranceFindingReport`, `assuranceFindingAttentionCount`, `assuranceFindingCandidates`.
- **Code:** `app/core/domain/assuranceRegistry.js` (closed vocabulary: sources, severities, finding states, per-line states, flags, act kinds, refusal keys, events, rights, limits, method, CSV descriptor), `assuranceSchema.js` (fail-closed normalizers), `assuranceFindingMath.js` (floor basis points, deterministic signatures, age buckets), `assuranceFinding.js` (pure reader `buildAssuranceFindings`), `assuranceFindingReport.js` (seat-scoped report, grant, verifier reach, attention count, CSV rows), `assuranceFindingActions.js` (five human acts and a scan), `assuranceFindingRules.js` (`RULE-AFR-01`).
- **Tests:** `tests/app/assurance-findings.test.mjs` (13, all passing) and `tests/app/assurance-finding-wiring.test.mjs` (11, all passing) — see §Verification.
- **Rule:** `RULE-AFR-01` (post-commit spine rule **148 of 148**, pause switch `assuranceAutoPropagate`, marker-idempotent per `afr1:<kind>:<findingId>` signature, ≤ 4 asks per commit with the remainder counted).
- **Builds on:** ADR-0008 (post-commit rules hook), ADR-0076 (operating seat), ADR-0140/ADR-0141 (matrix accountability and line scope), ADR-0170 (segregation of duties), ADR-0182 (automation pause permit register), ADR-0227 (`RULE-KZT-01`'s joint-apex ask shape), NORTH_STAR (bulletproof reliability, matrix mandate, competitive benchmark).

## Context

Somebody finds that a control did not work — an audit, a regulator, an incident review, or the person doing the work. Somebody is named to fix it. A date is set. Then two things happen in most organisations and **neither is visible anywhere in the workspace**:

1. the fix is **asserted and never tested** — the owner's own word is the whole record of closure; and
2. the same finding **comes back next year with a new number**, with nothing on the record saying that it came back.

An executive signing a statement about the state of internal control is signing over exactly that gap.

The repository had **no trace of the duty**. A grep over `app/` returned zero hits for `undertaking`, `board directive`, `critical control`, `control test`, `control owner`, `assurance map`, `combined assurance`, `audit plan`, `audit finding`, `issue register`, `repeat finding`, `control deficiency`, `material weakness`, `nonconformance`, `sub-certification`, `letter of representation`, `annual operating plan`, `board reporting`, `tone at the top`, `intercompany`, `license to operate` and the word `weakness`. Present-only terms confirmed the shape of the hole: `remediation` (15–17 hits, all prose in other modules), `attestation` (65), `recurrence` (16), `verification` (78), `effectiveness` (13), `internal control` (3), `deficiency` (3), `audit` (223, all in unrelated contexts).

What existed was adjacent and **not** the same duty:

- `after-action` and `recurrence` count a **learning** recurrence, and carry no control, no criteria, no severity, no owner with a target day and no independent test.
- `mitigationRobustness` gates a mitigation on evidence, but a mitigation is a **forward** judgement about a risk, not a recorded control failure.
- `dutyWithoutMeans` (ADR-0221) records whether somebody has the means to carry a duty — it never records that the duty was **failed**.
- No module anywhere records *who owns fixing a control failure, by when, and who independently tested that it was fixed*.

The duty is also irreducibly **matrix**. A control failure usually crosses functions: the process owner, the system owner and the policy owner sit on different reporting lines, and no single manager is accountable for the whole fix. A register that let one line close the finding on behalf of another would reproduce precisely the failure the discipline exists to prevent.

## Decision

1. **One separation the register exists to enforce: the person who owns the fix never verifies it.** The IIA Three Lines Model (2020) puts ownership of risk with management and independent testing with assurance. A remediation that closes on its owner's word is not a remediation; it is a **claim**, and the register prints it as one — a finding whose lines are all asserted but not verified reads `asserted-awaiting-verification`, never closed.

2. **A finding is declared against a control, a scope and the criteria it departed from.** `controlRef`, `scopeRef` and `criteriaRef` are all required (3–80 characters). A finding with no criteria is an opinion, and ISO 19011 requires a finding to be stated against criteria. The **source** is a closed vocabulary — internal audit, external audit, regulator, second line, incident review, management review, self-identified — because who found it changes who may be asked to grade the fix.

3. **Severity is declared by a named human and derived from nothing.** Four grades: `observation`, `deficiency`, `significant-deficiency`, `material-weakness` (COSO 2013 / PCAOB AS 2201). No count, figure, keyword or date produces a severity here. A material weakness is a judgement about magnitude and likelihood; software that infers it from prose is guessing at a board-level conclusion.

4. **Every accountable line carries its own owner and its own target day.** A finding names 1–4 accountable `(person, line)` pairs. Each line's **holder** names one remediation owner and one due day, once. A second assignment on the same line is **refused at the door and never overwrites the first** — the governing owner is the one the line first named, and the reader agrees with the writer, so a hand-edited file cannot quietly re-point accountability at somebody else. A line may not promise later than the finding does.

5. **Verification is a structural predicate, not a permission.** `assuranceVerifierReach` requires the verifier to sit **strictly above the remediation owner** on the reporting DAG: never the owner, never a subordinate of the owner, never an unrelated branch. The badge uses the same predicate the action enforces, so the register never promises a seat a verification it would then refuse. A `reject` is also an independent act and is held to exactly the same reach. A rejection returns the line to remediation owed and closes nothing.

6. **A finding closes two ways and only two.** (a) Every accountable line independently **verified**. (b) The residual risk **accepted** by a named authority at rank 4 or above, with a written reason and a review date, who does not remediate that finding — segregation of duties (ADR-0170): the party who failed to fix it does not decide that the enterprise can live with it. Nothing closes by the passage of time; overdue is a printed flag and decides nothing.

7. **Recurrence is counted two ways and never added together.** A finding is `recurrent` only where a prior finding on the **same control AND scope** was closed as **verified** inside the recurrence window — a tested fix that did not hold. Where the prior was closed by **acceptance**, the finding is `reobserved`, which is a different fact: a risk somebody agreed to carry and then saw again. Two failed fixes and one carried risk are not three of anything.

8. **Two integrity claims, reported apart.** `partitionReconciles` is a claim about arithmetic (the printed state counts add to the finding total). `figuresComplete` is a claim about completeness (no act was refused by the loader, no stored row was dropped). Neither is allowed to stand in for the other, and a hand-edited malformed row is **dropped and counted, never repaired**.

9. **The accountable-line roll-up is non-additive and says so.** A finding naming two lines is counted under both, so the line rows do not sum to the finding total; the panel prints that as a sentence rather than leaving a reader to reconcile a table that cannot be reconciled.

10. **Counts are aggregate and floor-governed.** Per-line cells are suppressed below the disclosure floor of three with complementary suppression, and where a published total would recover a withheld cell by subtraction the total is withheld instead. Rates are exact **floor basis points**, never a float percentage. Recurrence follows the fate of the finding total: where the total is withheld, a recurrence count with no published denominator would be the only finding figure on the record, so it is withheld too (§Defect 3).

11. **`RULE-AFR-01` asks, it never closes.** Three conditions, each filed at most once per deterministic `afr1:<kind>:<findingId>` signature and addressee, bounded at 4 per commit with the remainder counted: `remediation-overdue` (asked of the accountable holder where the line has no owner, and of the named owner where it has); `verification-overdue` (asked of the **joint apex above the owner's own lines** — the lowest seat independence actually permits, so the owner is never asked to grade their own fix); and `recurrence` (asked once of the joint apex above **every** accountable line, because a tested fix that did not hold is a structural question). Where the graph names nobody who can be asked, one identity-free `assuranceFindingMarkers` observation is written and **nothing is substituted**. The ask text is deliberately opaque — no control, no scope, no criteria, no statement, no name — because a delegation is readable above the addressee. Pause-governed on every path, including the explicit scan.

## Defects found by the focused verification pass, all fixed at the source

1. **The five write commands were not line-scoped at the gate.** `accessGateway.js` refused `assuranceFindingDeclare` with `scope-refusal` for a director whose accountable holders were reachable only through declared Matrix lines. The five commands were added to `MATRIX_LINE_SCOPED`; the actions still re-prove reach, the line and the independence rule themselves before writing.
2. **An act with no declared timestamp was refused.** `actInstant` required `assignedAt` / `assertedAt` / `verifiedAt` / `acceptedAt` on input, so an ordinary act written "now" was refused as `unreadable`. The declared value is used where one is given (how a back-dated paper record is entered honestly) and the acting clock otherwise; a value that is present but unparseable is still refused — never silently replaced by "now".
3. **A rejection dated at the same instant as a later assertion was read as a test of it.** `readLine` compared acts by timestamp string alone, so on a fixture clock a re-assertion appended after a rejection did not clear the rejection and the finding stayed `rejected-remediation-owed` forever. Two acts carrying the same timestamp are now ordered by their **position in the ledger** — an act written later is later — which is the order the record itself carries.
4. **The attention count did not count the largest group it exists for.** A named owner whose fix is owed (`remediating`) and an owner whose fix was rejected (`rejected`) owed nothing according to the badge: only unassigned holders and verifiers were counted. The named owner now owes the assertion in both states — in the rejected case, because an independent test refused the last one.
5. **The reader and the writer disagreed about which assignment governs.** The reader took the *last* assignment and the writer refuses a *second*, so a hand-edited file could re-point the accountability. Both now take the **first** (`governingAssign`), and the row carries `assignCount`.

## Verification

One focused pass, as the driver requires:

- `node --test tests/app/assurance-findings.test.mjs` — **13/13 PASS** (kernel suite: state machine, rejection → re-assert → confirm, governing assignment, cross-line closure, overdue flags, recurrence vs re-observation, acceptance, non-additive line roll-up, unresolved line, dropped-row counting, purity, normalizer idempotence).
- `node --test tests/app/assurance-finding-wiring.test.mjs` — **11/11 PASS** (schema v187 collections, `RULE-AFR-01` on the spine and in the propagation contracts, the full matrixed lifecycle with the two fake-closure paths refused, governing assignment, rejection → re-assertion, **stored == computed** byte-for-byte through the kernel, dropped-row behaviour, seat-scoped attention counts, CSV #175 identity-free with below-floor blanking, and the jsdom DOM render printing the reader's own figures).
- Adjacent suites re-run and compared against the branch point in a clean `git worktree`: `domain-sense-wiring` and `domain-sense` were green at base and are green now (one stale version pin updated honestly — the ADR-0228 migration step is still asserted at 186); `csv`, `operating-seat` and `action-bundles` fail **identically** at base and now, all three being pre-existing stale pins, not regressions.
- `npm run lint` (changed files) PASS. `npm run check:boundary` PASS (1,032 app ES modules, 287 test suites, 23 documentation checks, 0 leaks). `npm run check:links` PASS (1,304 links / 351 files). `npm run check:a11y` PASS (135 routes).
- `LeadOS-standalone.html` rebuilt and re-verified: **18,999,920 bytes · 1,027 source modules · schema v187**; `standalone.test.mjs` **7/7** after the ceiling was moved to the measured size per that file's own documented convention (18,500 bytes per module against the unchanged 24,000 density guard).
- The full 287-suite `npm test` was **not** run **[UNVERIFIED]**. Real-browser and assistive-technology walkthrough of `#/findings` remains **[UNVERIFIED]**.

## Benchmark

**`[BENCHMARK-UNVERIFIED]`** — no GRC platform was run side by side. Judged from published vendor documentation and category descriptions (AuditBoard, Workiva, MetricStream, ServiceNow IRM, Diligent, LogicGate, Resolver) plus the practitioner literature named in `AFR_METHOD.frameworks`.

- **Matches** the category's governance layer on the checkable dimensions: a finding with an owner and a target date, a severity vocabulary, an append-only status history, reminder and escalation workflows, and an issues/audit-findings register with reporting roll-ups.
- **Exceeds** every published description on four points: (1) independence is a **structural predicate computed from the reporting graph**, not a permission or a workflow state, so the owner of a fix cannot verify it even if an administrator would let them; (2) **matrix closure** — a finding with two accountable lines cannot close until both have carried their own owner, assertion and independent test, and no line is dropped for being inconvenient; (3) **recurrence split** — a repeat after a verified closure and a repeat after an acceptance are two counts that are never added, which is the distinction audit-committee recurrence tracking draws and issue trackers collapse; (4) **the register refuses to close anything by time** — overdue is a flag beside the state and decides nothing.
- **Does not match**, and does not claim to: control libraries and frameworks with mapped risks; automated control testing and continuous monitoring; SOX / financial-reporting certification workflows; evidence collection and workpaper management; entity-level and process-level control mapping; RCM import/export and auditor workpaper exchange; integration with ERP, ticketing or GRC data feeds.

## Consequences

- A finding whose fix is asserted and never tested stays visibly open. This will look like a lower closure rate than a tracker that lets the owner close their own item. That difference is the point.
- A repeat finding is now *printed* as a repeat. Organisations that report issues by count will find that a control with three repeat findings no longer looks like three separate small problems.
- Acceptance of residual risk is an executive act with a name and a review date on the record, which makes it auditable and therefore, deliberately, less comfortable.
- The register verifies nothing external: a cited control, criteria reference or evidence record is **declared, not checked**, and the method note says so in plain words.
