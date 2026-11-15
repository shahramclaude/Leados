# ADR-0220: The Variable-Pay Design & Incentive-Integrity Register — what a person was promised, what was measured, and what cannot be paid twice

- **Status:** accepted (engine `incentive-integrity-2026.11-v1`)
- **Date:** 2026-11-15
- **Deciders:** director / VP altitude (rank 2–5) — rank 2–3 design an envelope and award inside their span and verify a line below them; rank 4–5 record a recovery
- **Schema:** v173 → v174 (six EMPTY-at-upgrade collections: `incentivePlans`, `incentiveMeasures`, `incentiveReadings`, `incentiveAwards`, `incentiveRecoveries`, `incentiveMarkers`)
- **Surface:** `#/incentive` (Plans / Awards / Queries / Method), CSV scope #162 (`incentive-integrity`, aggregate only per currency)
- **Code:** `app/core/domain/incentiveRegistry.js`, `incentiveSchema.js`, `incentiveIntegrity.js` (reader), `incentiveActions.js` (writes), `incentiveRules.js` (`RULE-INC-01`), `app/views/incentive.js`
- **Tests:** `tests/app/incentive-integrity.test.mjs` (19)
- **Spine:** `RULE-INC-01` is rule **136**

## Context

Every money register in the workspace could say whether money **may** be spent and what the enterprise had **declared it was willing to lose**. None said what a person was **promised** and **paid against a measured outcome**, and none could refuse to pay the same result twice.

The failure this exists to prevent is mundane and expensive. A variable-pay scheme lives in a spreadsheet and a board pack; the measures live in systems the scheme's owner does not read; the number that decided the payment is quoted in a meeting and never recorded; and when the number is later restated, the payment stays. Nobody can answer three questions from the record: *what was the envelope*, *what figure decided this payment, and who verified it*, and *was this result already paid by another scheme*.

`comp.js` is pay equity, `measurement.js` is a distortion model, ADR-0208 appraises an investment, ADR-0211 ceilings spend, ADR-0213 divides a variance, ADR-0216 measures promised synergy, ADR-0217 reads earned value, ADR-0219 declares a risk appetite. None of them holds a promised payment against a measured outcome with the authority to refuse.

## Decision

1. **An envelope is declared, dated and bounded.** One live plan per (funding line, window, currency) with an exact integer ceiling in cents, a written basis, and at least one measure. A second live plan on the same line and overlapping window is refused: two ceilings over one period make every ceiling claim ambiguous.
2. **Money is an integer and never re-parsed.** `ceilingCents`, `amountCents`, `targetCents` are integers; a third decimal place is refused rather than rounded; a count and an amount never share a field; a stored cent is read back exactly on reload. No FX and no pooling: another currency is a separate total with its own plan, and no grand total object exists.
3. **The measure's control is declared, never inferred** (awardee / funding line / outside the line) and is printed beside every award, because an outcome the awardee cannot influence is not a measure of the awardee.
4. **A verifier is proved, not named.** A reading is signed by a seat **above** the funding line on the live graph; the funding line itself is refused by its own name, a peer line is refused as a peer, and a seat holding an award priced off that measure is refused as interested. The graph is read at commit time, never a stored role.
5. **Evidence or nothing.** A measured award requires a verified reading in force on its own decision day; a reading dated after the decision does not count. A restatement names the reading it replaces, is dated on or after it, and says why.
6. **One bucket per award.** provable / missed / discretionary / unverified / recovery-due / contested. The provable total contains only provable money; a bucket sum that cannot be computed is `null`, never zero.
7. **An overrun is recorded, not removed.** An award above the envelope's ceiling is stored and printed with its excess; the excess is the rule's ask. Refusing to record it is how schemes lie.
8. **The same outcome paid twice is CONTESTED.** Two plans paying the same measure key over **overlapping** windows hold both amounts out of the provable total, name the pair, and ask the **joint apex above both funding lines** — the register does not decide which scheme owns the result and does not split the money. Successive, non-overlapping windows are consecutive periods and are not a contest.
9. **Recovery is an act, not a correction.** A restatement below target makes the award `recovery-due`; demanded / recovered / waived are recorded with a written reason, never exceed the award, and never silently reverse the payment. A waiver without a reason is refused.
10. **Evidence can weaken after the fact.** If the live graph no longer puts the verifying seat above the funding line, the award reads `unverified`, leaves the verified totals, and is counted in `verifierDriftedN`.
11. **Two claims, kept apart.** `countsReconcile` (per-plan counts add to the visible awards) and `figuresComplete` (every live plan measured, every award's evidence standing, nothing withheld). Scope facts — plans and awards outside the seat's reach — are counted and **excluded** from completeness, so completeness never depends on who is reading. Above the director altitude individual rows are withheld, the control total is printed, and `figuresComplete` is false for that seat.
12. **One opaque ask per condition, idempotent, self-closing, pause-governed.** `RULE-INC-01` files one `act-inform` delegation per (signature, addressee) whose text carries no plan, person, measure or amount — a delegation is readable above the addressee. It closes its own ask when the condition clears, respects a human's own answer, and is silenced on the commit path **and** on an explicit scan by `incentiveAutoPropagate`, which is declared in the settings vocabulary and defaults ON.

## Rejected

- *Storing a derived award state or a provable total.* Both are recomputed from stored integers on every read; a stored verdict is a figure that can disagree with its own inputs.
- *Letting the funding line sign its own measure.* It is the party that benefits from a generous reading; the ordinary matrix tie between a plan's owner and its verifier is exactly why the check is computed on the graph rather than granted by role.
- *Refusing an award above the ceiling.* Refusing at the door would push the real payment off the record; the register records, prints and asks.
- *Choosing which of two overlapping schemes owns a result.* The register names the pair and the money, and sends the decision to the seat above both — inventing an allocation would be the exact failure the register exists to prevent.
- *Auto-reversing a payment after a restatement.* A payment already made is a fact; the register records what is owed back and who decided to collect, waive or defer it.
- *Reusing `comp.js`, `measurement.js`, `bonusPool`-style finance registers or the appraisal registers.* Each measures a different object; none holds a promised payment against a verified outcome.

## Consequences

- A director can answer, from the record, what each envelope was, what figure decided each payment and who signed it, which money is provable, and whether the result was paid twice.
- A CEO reads control totals per currency and is told plainly that rows are withheld and that the record is therefore not certified complete at that altitude.
- A restated number produces an owed-back balance with a named decision, not a silently altered payout.
- The register does not model deferred bonus across periods, malus carried forward, pool funding, or FX conversion under a declared policy; each is printed as a boundary rather than approximated.
