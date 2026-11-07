# ADR-0128 — Explicit cover rehearsal: inferred work is not proof a stand-in practised the duty

**Session 174 · Schema v117 (additive: `dutyRehearsals`, the `rehearsal` node, the `attests-rehearsal-of` relation) · `#/duty-cover?panel=plan` · Frontline → mid-manager primary; every altitude inherits the counts through the same wall.**

## The gap, stated in the register's own words

ADR-0125 made the exercise grade window-specific, and it made it duty-specific: evidence counts only when a record of the duty's declared sources touches the holder's span inside the preparation window. But the evidence it grades is still **inferred dated work**. That inference has a hole shaped exactly like a rehearsal:

1. **Work beside the holder is not work in the holder's chair.** A cover who touched a case the week before the absence proves contact with the duty's sources — not that they practised *being answerable*. The register prints `evidence 2027-07-01` and the reader is invited to conclude readiness nobody observed.
2. **A rehearsal that happened leaves no artefact at all.** When a shift lead walks a stand-in through the escalation path on the live board — the single most informative event in the whole preparation window — the ledger records nothing. The drill is invisible; only its incidental paperwork survives.
3. **A drill that found problems is indistinguishable from a drill that went well.** Practice exists to surface the gap before the absence, not after. Without a record of the outcome, a rehearsal that stalled at the handoff and a rehearsal that ran clean both read as… nothing.

The real duty this serves: **a frontline seat preparing a handover, and the manager who reads it, are not asking "did anyone touch this duty recently".** They are asking — *did this named stand-in actually practise this duty, on a dated day, with somebody who was there to see it, and what did that practice find?*

## What is declared, and what is derived

**Declared (one new collection, `dutyRehearsals`)** — the dated human act and nothing else: which cover row it rehearsed, the day it was run (`rehearsedOn`, bounded to `[today − 60 days, today]`), the day and instant it was recorded, which seat recorded it, the practice **mode** (a declared vocabulary: `walkthrough`, `shadow`, `supervised`, `handover`), the **outcome** (`ready` or `gaps`), the recorder's own words (clamped 300 chars, required and governed when the outcome is gaps), the governed decision a gaps finding opens, and append-only revocation. The migration to v117 adds an **empty** ledger — no rehearsal is ever back-filled, because an attestation nobody made cannot be reconstructed from adjacent data.

**Derived on every read** — never stored:

| Derived | From |
| --- | --- |
| the evidence entry `{kind: 'rehearsal', mode, outcome, attestation}` | active rows matching the duty line, the cover and the preparation window |
| **attestation strength** — `holder` / `supervisor` / `self` | `recordedBySeatId` against the duty holder, the roster ancestor chain (`managerId` walk), and the cover seat |
| the `rehearsed` grade (exercised **TRUE**) | at least one `ready` rehearsal inside the window; attested evidence is preferred over self-reported, and strength beats recency |
| the `gaps` grade (exercised **FALSE**, line reads thin) | only rehearsals that found gaps inside the window |
| `rehearsedAvailableN` / `gapsAvailableN` per duty line, and `rehearsedCoversN` / `attestedRehearsalsN` / `selfReportedRehearsalsN` / `gapsCoversN` per plan | the same per-cover grades, counted |
| what the upward brief and the CSV carry | those counts only |

ADR-0125 is **not replaced**: with no rehearsal record, inferred duty-specific work still grades `valid` and still covers the line. The explicit record *outranks* the inference — a ready rehearsal grades `rehearsed` above any amount of adjacent work — and a rehearsal is tied to its duty line: it never leaks onto a sibling duty with the same cover.

## The attestation is enforced twice, like consent in ADR-0127

Only **a seat that was there** records: the duty holder, the named cover themselves, or a leadership span above the holder (the `managerId` ancestor walk, guard-bounded). The action refuses everyone else with the printed refusal, and the schema's fail-closed normalizer **drops on reload** any row whose recorder is none of those three, any row whose `dutyId` disagrees with its own `seatId`/`dutyKey`, any row whose cover row is a different duty line or a different person, any row recorded *before* the rehearsal it attests (an attestation cannot precede its own observation), and anything malformed or past the 600-row cap — each drop printed with its reason. A hand-edited file cannot invent an observer.

Self-reporting is **allowed and marked**: a cover attesting their own readiness grades `rehearsed` but prints `self-reported`, counts separately (`selfReportedRehearsalsN`), and never displaces a holder or supervisor attestation when both exist in the window. The undeclared operator view observed nothing, so it records nothing — refused with its own line, exactly as in the standby chair.

## What is refused

- a recorder who is neither the duty, nor the cover, nor a leadership span over it (action **and** schema);
- the operator view, future dates ("a plan, not an attestation — record it on the day it was run"), and memory older than the declared 60-day lag;
- a mode or outcome outside the declared vocabulary;
- a rehearsal of a revoked cover row ("nothing left to rehearse");
- a `gaps` outcome without the recorder naming what stalled (≥ 8 characters — a gaps finding without words leaves the governed decision empty);
- a revocation without a reason, or by anybody except the recorder (full access may, and the act is audited);
- a gaps drill read as readiness — it holds the line **thin** and prints `FOUND GAPS` with the date;
- the recorder's note text inside any derived evidence or reason string above the ledger itself — the note is the recorder's words for the humans in scope, not a field the aggregates launder upward.

## Wiring (no new rule, no new automation)

- **One atomic transaction** per record: the row, one `attests-rehearsal-of` edge to the cover row rehearsed, one `rolls-up-to` edge per leadership ancestor **above the duty holder** (a rehearsal of a lead's duty rolls up that lead's chain, guard 16, never the synthetic leader), and the audit event. A `ready` record opens **no** decision; a `gaps` record opens one **in the same `store.update`** — titled *what changes before this duty is relied on, now that its rehearsal found gaps*, quoting the recorder's words verbatim, with four governed options (re-rehearse before the window; name a different cover; let an ancestor cover it; accept and record what waits), `reviewOn` pulled to the holder's active absence start when one is declared (else `today + 7`), and marked reversible.
- **Revocation is append-only**: status flips, reason and day are stored, the row never disappears, and the revoked attestation immediately stops grading any window.
- **The scan re-derives**: `dutyRehearsalScan` reports ledger counts and writes one audit event with an empty update, matching the absence/standby scans.
- **Everything ADR-0125 touches, widened**: `absenceWindowPlan` rows carry `rehearsedAvailableN` / `gapsAvailableN` and the widened band reasons; the plan summary carries the four rehearsal counts; the concurrency `coverExercise`, the rollup reducer and `buildAbsenceSection` reuse the same derivation; `dutyAbsenceDeclare` puts the rehearsal counts on the governed decision and event in the same transaction; `dutyAbsenceScan` re-derives them; the upward brief prints counts only (`1 holder/supervisor-attested, 0 self-reported`); the CSV `absence` rows gain `absence_rehearsed_n` / `absence_rehearsal_gaps_n` — riding the existing row kind, so no row-kind pin moves.
- **The identity wall is unchanged and applies at construction**: above rank 2 the evidence `sourceId` (the record id) is stripped from evidence, last-evidence and gaps-rehearsal exactly as ADR-0125 strips the case id; mode, outcome, attestation strength, dates and counts survive because they are not identity. The ledger read withholds names and notes on the same gate.
- **Access gateway**: `attest-duty-rehearsal` (rank 1–5) with `dutyRehearsalRecord` / `dutyRehearsalRevoke` / `dutyRehearsalScan` declared; `dutyRehearsalList` is a `SAFE_READ` — under enforcement the ledger must stay readable by the seats that wrote it, or the attestation becomes a write-only hole.
- **Governed collection**: `dutyRehearsals`, class `unit`, routed to `#/duty-cover?panel=plan`.
- **The seat attention badge deliberately does NOT change.** An unrehearsed cover with inferred valid evidence is ADR-0125's `valid` state and is not a finding; a badge that fires on every absence without a drill is a badge people stop reading. Surfacing "covers exercised only by inference" in the digest is a separate, tagged roadmap slice.

## The view

The plan panel gains an **Explicit rehearsal records** card between the window plan and the concurrency reading: Ready / Found gaps / Revoked counts, the ledger table (day, duty line, cover, mode with its declared label, outcome, attestation badge — holder-attested / supervisor-attested / self-reported, the recorder's words where in scope, revoke where the reader is the recorder), and the scan button. Every cover row in the window plan and in the desk's declared-cover table gains a **Rehearse** act that opens the record dialog (day, mode select, outcome select, note). The exercise badge prints `rehearsed <day>` as good and `rehearsal found gaps <day>` as bad, next to ADR-0125's `evidence <day>`. The Method panel names the ADR-0128 rule: the explicit record outranks the inference, and the inference still stands where no drill was recorded.

## Altitude coverage

- **Frontline (rank 1): PRIMARY.** The holder prepares the handover: they run the drill, record it on the day, and the register stops asking them to prove readiness from adjacent paperwork. A gaps finding opens a decision reviewed before their absence starts, not after.
- **Mid-manager (rank 2): PRIMARY.** The named cover answers in their own chair (self-reported, marked as such); the manager above the holder attests from the span; the same ledger reads with names and notes visible.
- **Director (rank 3) / VP (rank 4):** the counts roll up through the same absence report — rehearsed vs inferred-valid vs gaps — behind the unchanged identity wall; source ids and notes withheld at construction.
- **CEO / C-suite (rank 5):** the counts-only line in the upward brief, on the same spine; no new executive command.

## Honest limits

- Seats remain **workflow declarations, not authentication**. A local operator can switch into the holder's chair and attest; the act is audited, the schema makes a third-party forgery impossible on reload, and the standing top roadmap item is unchanged.
- A rehearsal record is a **human attestation**. The product can enforce who was positioned to observe, when it was recorded and what it found; it cannot verify the practice physically happened. That is exactly the difference between this record and inferred work, and it is declared rather than hidden.
- The 60-day recording lag is a clamp on memory, not a licence: a record filed 59 days after the drill is accepted because the alternative — refusing to record at all — leaves the inference in charge.
- Nothing schedules a rehearsal, reminds anybody, or re-asks after a gaps decision resolves; the drill stays a human act.
- Schema v117 is additive and convergent: an upgraded workspace opens with an empty ledger, so every pre-existing cover grades on inferred work exactly as it did at v116 — the truthful state, since no drill was ever recorded — until the first rehearsal is attested.
