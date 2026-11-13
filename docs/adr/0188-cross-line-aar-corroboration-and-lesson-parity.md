# ADR-0188 — Cross-Line After-Action Corroboration & Lesson-Adoption Parity

**Status:** Accepted — 2026-11-13 (Session 256)
**Schema:** v148 → v149 — three additive collections (`aarCorroborationRequests`, `aarCorroborationResponses`, `aarCorroborationMarkers`), all empty on upgrade; `MIGRATIONS[148]` creates them and infers nothing
**Surface:** `#/learning?panel=cross-line` · CSV #141 `matrix-aar-corroboration` · safe reads `aarCorroborationReport` · actions `aarCorroborationRequest` / `Respond` / `Scan` / `SetConventions` · rights `request-aar-corroboration`, `respond-aar-corroboration`, `govern-aar-corroboration` · `RULE-AAC-01`
**Altitude / structure:** frontline, mid-manager, director × matrix **and** single-chain (two branches of one tree). The cross-line reading is inert until a second line speaks for the same review. Line holders answer; the joint apex of the answering holders governs the disagreement.

## Context

LeadOS has held an after-action review ledger since Schema v43 (`retros`, `#/learning`). A review is authored and held inside one line: the author, the participants and every lesson owner are named by whoever ran the session. Everything the module measures — coverage, latency, recurrence, the learning index — reads that one line's account of what happened.

The workspace has already closed this exact blind spot four times for other registers. ADR-0147 (reviews), ADR-0166 (merit evidence), ADR-0168 (bench evidence) and ADR-0185 (change impacts) each discovered that a record authored inside one line silently speaks for people on another line, and each fixed it by recording a dated, per-line, first-person corroboration against a frozen snapshot. `learning.js` has **zero** references to `reportingLines`, `buildMatrix` or `matrixJointApex` — it is the last consequential record type without that discipline.

The duty is concrete and ordinary. A migration fails; the review is held by the platform line and concludes "the vendor's interface was under-specified". The follow-up action — change the interface contract — is assigned and lands on a person who also sits on the product line. The product line was never asked whether that is what happened, and never saw the lesson it is now expected to adopt. Two failure modes follow:

1. **Uncorroborated account.** A lesson about a multi-line event states, as the record's only account, a cause that a line carrying half the participants has never confirmed. Silence is currently indistinguishable from agreement.
2. **Adoption asymmetry.** A lesson is "applied" against a named owner, and nothing checks that every line the lesson touches has been asked to adopt it — so the same class of failure recurs on the line that never heard it, and the recurrence measure blames the whole workspace.

## Decision

### 1. Corroboration is a dated first-person act against a frozen snapshot, never a rating

`aarCorroborationRequests` rows freeze the review's material context — the review id, its held date, the outcome date, the four AAR answers, the participant set and **the complete active Matrix line set of every participant** — plus the specific lesson under review. A response is a first-person act by the manager who **holds** one of those lines. Nothing about a person is scored: the outcome is one of four closed states about **the account**, not the human:

- `corroborated` — this line agrees the account and the lesson as recorded are sound.
- `disputed` — this line's evidence does not support the recorded cause or lesson, with a written reason.
- `partly` — this line supports the lesson but not the recorded cause (or the reverse), with a written note naming which.
- `declined` — this line was asked and states a written reason it will not answer.

A **reviewer** may also submit a *first-hand observation* rather than a verdict. That is stored as an observation and never counts as corroboration, because "I saw something different" and "I agree" are different claims and collapsing them is the failure the register exists to stop.

### 2. Silence is never corroboration, and a single line is never a cross-line finding

`unrequested`, `pending`, `overdue` and `expired` are distinct printed states. Coverage counts only `corroborated` and `partly` answers that are current against the frozen snapshot. A review whose participants all sit on one active line is **excluded from the cross-line denominator and counted separately** (`single-line excluded`), and a workspace with no multi-line participant reports the cross-line claim as `inert` — it never restates one line's account as a matrix finding.

Staleness is computed exactly as ADR-0185 computes it: the live snapshot is recomputed from the review, the roster and the current matrix graph, and a byte-different snapshot makes a prior answer `stale` history. A review edited after a line answered does not silently keep the answer.

### 3. Adoption parity is measured per line, and a lesson is not "applied" until every touched line has been asked

For each lesson under a corroborated review, the reader derives the **set of active lines touched** — the union of the lines of the lesson's owner, of every participant, and of any person the lesson's evidence names. `adoptionParity` reports, per touched line:

- `adopted` — a dated adoption act from that line exists with a note;
- `refused` — the line states, with a reason, that it will not adopt;
- `not-asked` — nobody has asked;
- `unattributable` — the lesson names a person whose lines cannot be resolved.

A lesson is **parity-complete** only when every touched line is `adopted`. It is `parity-broken` when any line is `refused`, and `parity-open` otherwise. **The lesson's own `state` is never rewritten** — the AAR ledger's `applied` remains the author's claim; parity is printed beside it, and the register's brief says plainly that a lesson marked applied by one line with a refused adoption on another is a **disagreement**, not an application.

### 4. Escalation goes to the joint apex of the line holders, on the shared spine

`RULE-AAC-01` runs on the existing post-commit spine. When a corroboration request goes `overdue` with no answer, or a lesson's parity is `parity-broken`, the rule files **one** bounded dated ask addressed to the joint apex (`matrixJointApex`) of the managers who hold the lines involved — never to the person who wrote the review alone, who cannot rule on a peer's account. An ambiguous or missing apex is **counted and printed**, never substituted by the home line. Asks close themselves (`Closed by RULE-AAC-01:`) when the condition clears and never re-ask a condition a human has closed. The rule is idempotent per condition signature, inert on an empty roster, and honours the automation pause switch.

### 5. Disclosure is a ladder applied in the read model

`full` for a seat that holds the span; `span` below the register's rank floor, where names, person ids, counterpart managers, answer prose and lesson text are replaced with a printed `withheld at this disclosure level` while the arithmetic stays intact; `none` for a seat with no span (totals and no rows at all). `figuresComplete` is reported apart from `countsReconcile`, so a withheld cell is never read as an arithmetic error.

### 6. Export prints the parts and no identities

CSV #141 carries one workspace row plus one row per state/parity bucket: request and response counts by state, the parity partition, the excluded single-line count, the withheld-row count and the three claims. No person, manager, line, review id, lesson text or answer prose appears. The six-part request partition is printed so a reader can add the parts back to the total — the only claim `counts_reconcile` makes.

## Alternatives considered

- **Make a held review refuse to save while any participant's second line has not answered.** Rejected. A review is a session that already happened; blocking its record destroys the record of the session rather than improving it. Corroboration is a dated follow-on act, not a precondition.
- **Infer corroboration from a line's participants attending the session.** Rejected. Attendance is not agreement, and the register would be printing consent nobody gave.
- **Derive adoption from the lesson owner's delegation closing.** Rejected, consistent with ADR-0044: `learning.js` already refuses to infer that a change was applied because a delegation closed. Parity must be a per-line human statement.
- **Score managers on corroboration coverage.** Rejected. Coverage is a property of the record, and the register prints counts and reasons; it rates nobody.
- **Rewrite the lesson's state from parity.** Rejected explicitly in §3 above: the author's claim and the touched lines' adoption are two facts, and collapsing them would make the register lie in the reassuring direction — the exact failure the Bulletproof Reliability Mandate names.

## Consequences

- Existing workspaces migrate additively to v149 with three empty ledgers. A first read is honestly empty (`empty: true`, all claims `false`) rather than inferred, because a review already on file carries no corroboration and no register may fabricate one.
- `learning.js` is **not modified**. This module reads `retros` and never writes them; the AAR ledger stays the single author of a review.
- A single-chain workspace is fully served: two branches of one tree are two lines, and the apex is the lowest common ancestor. No second line ⇒ `inert`, printed.
- The AAR rule ids (`RULE-AAR-01..04`) are untouched; `RULE-AAC-01` is a separate rule on the same spine.
