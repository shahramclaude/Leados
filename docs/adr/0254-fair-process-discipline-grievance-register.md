# ADR-0254 — Fair-Process Discipline & Grievance Register: a procedure that can be proved fair from its own dated acts, a standard of proof fixed at opening, an independent senior investigator, and a ladder that is computed rather than promised

**Date:** 2026-11-18 · **Status:** Accepted for the canonical source app · **Surface:** Fair process & discipline (`#/fair-process`) · **Storage:** v206 → v207, ten ledgers, CSV scope #193, `RULE-DGI-01`.

## Context

This workspace holds registers for authority, claims, permits, provisions and — as of ADR-0253 — product nonconformance. Every one of them governs a **thing**: a power, an amount, a lot. Not one of them holds the single most consequential procedure a leader runs on **a person**: a disciplinary or grievance case.

What exists nearby is deliberately adjacent and deliberately insufficient. `assurance` records a handed-over verdict; `speak-up` records a concern and its triage; `provisions` records a reorganisation. None of them can answer the questions a case must answer *from its own record*:

- what standard of proof was declared, and was every finding tested on that same standard?
- was the person who investigated actually independent of **both** parties — in both directions — and senior to the subject?
- did the hand that decided the cost differ from the hand that decided the facts, and was it senior to it?
- what sanction does this person's own live record imply, and did the decision depart from it — by how many rungs, and with what written reason?
- was the appeal heard by a different, senior hand, and does the appeal outcome silently overwrite the decision it reviewed?

Those are not reporting questions. They are the four ways a real disciplinary process fails: a moving standard, a captured investigator, a judge in its own cause, and an outcome that cannot be explained against the person's own history. An HR system of record stores the outcome of these questions; it does not *derive* them, and it cannot tell a leader that their case has a defect.

**The neglected structure is what makes this the right next item.** Almost every register in this app is a **single chain** — one duty, one owner, one signature. Discipline is irreducibly **matrix**: a case has two parties on two different lines, an investigator who must sit on neither line's chain of command, a decider above the investigator, and an appeal decider above the decider. The independence claim is a *graph* claim, and the seniority claim is a *direction*. That is a different arithmetic from the rest of the app, and it is the arithmetic this ADR adds.

## Decision

### Ten ledgers of declarations and dated acts, no stored state

All ten are empty on upgrade. Nothing is inferred from a speak-up concern, a just-culture review, an absence, a claim or a performance note.

| Ledger | What it holds |
| --- | --- |
| `dgiCases` | case reference, case kind (`conduct` \| `capability` \| `grievance`), the **declared standard of proof**, subject, raiser, a **written procedural basis** (reference and text), opening day, declarer, capture instant |
| `dgiAllegations` | sequence, allegation class, the written statement, the **written standard** it is tested against (reference and text), an evidence reference, raised day |
| `dgiInvestigators` | terms of reference (reference and text), assigned day, assigning hand |
| `dgiDirections` | the investigation direction given, to whom, and its day |
| `dgiFindings` | allegation, outcome (`upheld` \| `not-upheld`), **the standard it was tested on**, the written reason, an evidence reference, day, hand |
| `dgiDecisions` | sanction rung, written reason, decided day, deciding hand, expiry day (warning rungs), effective day (dismissal) |
| `dgiAppeals` | ground of appeal in writing, lodged day, lodging hand |
| `dgiAppealOutcomes` | outcome (`allowed` \| `refused` \| `varied`), the substituted sanction (**`varied` only**), written reason, day, hand |
| `dgiWithdrawals` | reason kind, written basis, day, withdrawing hand; `superseded` additionally requires a successor reference |
| `dgiMarkers` | `RULE-DGI-01`'s identity-free observations |

No state, verdict, sanction consequence, appeal status or clearance flag is stored. Every one is derived on read from those acts plus the **live** reporting graph.

### The standard of proof is declared at opening and is immutable

A case names exactly one of `balance-of-probabilities`, `clear-and-convincing` or `reasonable-suspicion`, at opening. That value is what makes every later finding decidable, and it is not editable afterwards: `dgiOpenCase` writes it and no action can rewrite it, because a standard that can be changed after the evidence is seen is not a standard.

`dgiRecordFinding` **refuses** a finding that names any other standard, and the reader independently marks a mismatched finding `standardMismatch` and counts it as **not reliable** — it does not satisfy the allegation, it does not feed the state chain, and it cannot ground a decision. The refusal on the write path and the disqualification on the read path are the same rule stated twice, because an imported row never passes through the door.

### Independence is a graph property, tested in both directions

`dgiIndependence(matrix, handId, partyIds)` walks the **live** reporting graph — home line and every declared matrix line — and refuses a hand that:

- **is** either party;
- **holds** either party on an active line (power over a party);
- **is held by** either party on an active line (owes its own position to a party);
- is not on the graph at all (an unresolvable hand cannot be proved independent).

Both directions matter and they are not symmetric in code. "Holds" is read from the **party's** active manager set; "is held by" is read from the **hand's own ancestor set**. Reading the second from the party's ancestors inverts the test and silently passes exactly the hand it should refuse — that inversion was written, caught by the demo seed, and fixed in this session, and the suite now asserts both directions separately.

`dgiStrictlySeniorTo` is the one seniority predicate, used three times: the investigator must be strictly senior to the subject (nobody concludes above a person they report to); the decider must be strictly senior to the investigator (the hand that decides what happened does not also decide what it costs); the appeal decider must be strictly senior to the decider. Peers are never "independent enough".

The graph is read at **review time as well as write time**. An investigator who was independent when assigned and whose line changed afterwards is **kept, printed and counted** — `investigatorInvalid` with the reason — and their findings stop counting. Deleting the assignment would hide the failure the register exists to surface.

### The ladder: consistency computed, never imposed

For each upheld allegation the reader takes the subject's **own** most recent **live** sanction of the **same** allegation class, and computes the **lowest declared rung above it**. It prints that computed rung beside the rung the decider chose, with the exact integer rank departure and the decider's written reason.

The register **never imposes** the computed rung, and it never writes one. A departure is a visible, counted fact (`ladderDeparture`), not a blocked write: consistency is a judgment a named senior hand is entitled to make, and the honest thing a check can do is make the departure impossible to overlook. An expired sanction is not live and cannot escalate a new case; a sanction of a different class is not the subject's history for this purpose.

### Decision and appeal are separate ledgers, and the decision is immutable

`dgiAppealOutcomes` is its own ledger with its own hand and day. The decision row is **never rewritten** by an appeal. A `varied` outcome carries its own substituted sanction, and the reader derives `effectiveSanction` from the outcome where one exists. An `allowed` outcome is not a clearance: it does not delete the findings, and the case reads `appeal-decided` with the outcome stated. Both rungs are printed, so a reader can see what was decided and what stands.

### Withdrawal is not clearance

A withdrawal requires a declared reason kind and a written basis. `superseded` additionally requires a successor case reference — a case cannot be closed as replaced without naming what replaced it. A withdrawn case never reads as a clearance: `caseUpheld` stays false, the allegations stay on the record, and the state is `withdrawn`, which is its own key and never a synonym for "nothing happened". A case that already carries a decision **cannot** be withdrawn at all: a decision is ended by an appeal, not erased.

### Fair order is derived, and a conflict is never repaired

The reader checks the dated acts for an order a fair procedure cannot have — a finding before the case opened, a decision before every finding, two decisions, an appeal before a decision, a finding recorded by a hand that is not the assigned investigator — and derives `record-conflict` with the specific conflict named in `conflicts[]`. Nothing is rewritten into a lawful order. A record that has been silently re-sequenced cannot be audited, so the defect is printed and counted (`recordConflict`) instead.

### Eleven derived states

`open`, `investigator-assigned`, `findings-owed`, `decision-owed`, `decided`, `appeal-window-closed`, `appeal-lodged`, `appeal-decided`, `withdrawn`, `investigator-invalid`, `record-conflict` — plus the refusal-only `nothing-to-sanction` and `no-case-to-answer` paths. Every case lands in exactly one, and `balances.stateCountsReconcile` asserts it.

### Rights, disclosure and reach

| Right | Rank | Why |
| --- | --- | --- |
| `read-fair-process` | 1–5 | the register is read where the case is worked; above rank 3 the reader prints counts only with a privacy floor |
| `open-fair-process` | 1–5 | a concern must be recordable by the hand that receives it |
| `assign-fair-process-investigator` | 2–5 | the *action* re-proves independence and seniority; rank alone never appoints |
| `record-fair-process-finding` | 2–5 | a finding is a leadership act |
| `decide-fair-process-sanction` | 3–5 | and the action re-proves strict seniority over the investigator |
| `lodge-fair-process-appeal` | 1–5 | a party lodges their own appeal; the action re-proves the relationship to the case |
| `decide-fair-process-appeal` | 2–5 | and the action refuses the same hand and any peer of the decider |
| `withdraw-fair-process-case` | 2–5 | |
| `govern-fair-process` | 4–5 | conventions and explicit scan |

The route is open (floor 1) because the reader scopes by span and line and withholds detail above rank 3 on its own; a disclosure manifest is declared so the console can audit the module rather than treat it as unknown.

**Confidentiality is a rendering contract, not a security boundary, and the panel says so in as many words.** Seats are workflow declarations; a determined reader with the file can see everything. Claiming otherwise would be the more dangerous lie.

### Exports

CSV scope **#193** (`fair-process-discipline`) is identity-free: one summary row, one row per derived state and one row per allegation class, counts only. No case reference, person, manager, allegation, written standard, finding, sanction reason, appeal ground or day crosses the boundary. A non-zero count below the declared privacy floor is **blank with a reason**, never a small number, and never zero — a withheld count that reads `0` is a lie about the record.

### The rule

`RULE-DGI-01` derives six conditions from the same reader and files at most one ask per (condition, case, addressee): `assignment-owed`, `finding-owed`, `decision-owed`, `appeal-decision-owed`, `appeal-window-open`, `record-conflict`.

- Asks go to the **joint apex** above the lines holding both parties — except `finding-owed`, which goes to the assigned investigator, the only hand that can record it (and carries the owed count in its signature, so a second allegation falling due is a second obligation).
- Ask text is deliberately **content-free**: no case reference, person, allegation, standard, finding, sanction or ground. A delegation is readable above the addressee and this register is individual material about named people, so the opaque `dgi1:<kind>:<caseId>[:<owedN>]` signature lives only in the typed `issues-obligation` link.
- Where nobody can be asked — a party off the graph, an unresolvable or ambiguous apex, a disconnected graph — the rule writes **one identity-free observation** into `dgiMarkers` and substitutes nobody.
- Asks close themselves when the condition clears or the addressee moves, and a human answer is never re-filed.
- Bounded at four per commit with the remainder counted as deferred, and pause-governed on every path including the explicit scan (`dgiAutoPropagate`, registered in the pause-permit reach census).

## Alternatives considered

- **A stored case status per case.** Rejected: a status column is a second source of truth that drifts from the acts, and the whole point of this register is that the state is *derived* from what actually happened.
- **Enforcing the computed ladder rung.** Rejected: a machine that sets a sanction on a person is not a register, it is a sentencing engine. Counting the departure and naming the reason is the strongest honest claim.
- **One combined decision-and-appeal record.** Rejected: rewriting the decision on appeal destroys the record of what the first hand decided — which is exactly the fact an appeal exists to expose.
- **Merging this into `speak-up` or `performance`.** Rejected on the evidence: those surfaces are about a concern's triage and a person's growth. Neither holds a written standard of proof, and neither can express independence as a graph property.
- **A per-jurisdiction statutory procedure table.** Rejected: a workspace default implying a statutory period would be a legal claim nobody declared. Every window is a declared convention; every procedural basis is written on the case.

## Consequences

- The register describes a **procedure and a case**, never a person's worth: no score, rating, ranking or inferred misconduct anywhere, and no text is ever parsed to decide an allegation.
- A defective case is **visible rather than blocked** on the read path (imported rows) and **blocked** at the door (new writes). That asymmetry is deliberate and documented in the panel.
- Two real defects were found and fixed while seeding the demo workspace: the inverted "is held by" independence test, and a decision resting on unreliable findings reading as `decided`. A third was found by the test suite: `dgiAutoPropagate` was in `DEFAULT_SETTINGS` and in the migration but absent from `normalizeSettings`, so every save silently dropped the switch and the one write that can pause the rule was discarded.
- Debt this creates: the ladder's rung scale is declared in this register and does not yet consult any sector convention; a jurisdiction-specific procedure pack would be a separate ADR.
- **Revisit when** a real user needs a case kind this register cannot express (for example a collective grievance or an appeal to an external body), or when the ladder must reference a sanction scale declared elsewhere.
