# ADR-0127 — Cover acknowledgement: a declared cover is an ask, not an answer

**Session 173 · Schema v116 (additive: `dutyStandbyAnswers`, `standbyanswer`, `accepts-standby-for`, two clamped conventions) · `#/standby` · Director → VP primary; every altitude through the same ask.**

## The gap, stated in the register's own words

ADR-0121 opens with the citation that is really an accusation:

> Kahn (1990) — *a responsibility nobody was told about is not a responsibility.*

It then recorded the declaration and never recorded the telling. Three consequences followed, and each one is a Monday morning problem rather than a documentation problem:

1. **`covered` cannot distinguish consent from silence.** The register derives "exercised" from dated work, so it can show that a person has worked inside a span. It cannot show that they accepted being answerable. A cover who was named without being asked and a cover who said yes read identically right up until the day the holder is away.
2. **`available` is a non-absence, not a commitment.** ADR-0122/0125 print a cover as "available" for a window when that person has no declared absence overlapping it. "No declared absence" is read as "will be there", which is precisely the assumption a named stand-in breaks.
3. **The stand-in has no surface in the product at all.** A manager naming a director as cover for a leave week produces a row, a `prepares-for` edge and a governed decision — all of which the *holder* sees. The named person learns about it by opening the register of a seat they do not operate, if they think to.

The real duty this serves: **a director approving a leave week across two teams is not asking "is a name in the cell".** They are asking the only question that survives contact with a Monday — *of the people I have named answerable this fortnight, who has said yes, who has said no, and who has not answered at all?* A named-but-unasked cover is an unrecorded responsibility wearing a green badge.

## What is declared, and what is derived

**Declared (one new collection, `dutyStandbyAnswers`)** — the cover's own ANSWER: `accepted` or `declined`, the bounded window it was given for, the answerer's own words (clamped, never summarised), the day and instant, and the governed decision opened when the answer is a refusal. Nothing else.

**Derived on every read** — never stored, here or anywhere else:

| Derived | From |
| --- | --- |
| `askWindow` | the holder's declared absence (ADR-0122), or a bounded `[today, today + dutyStandbyWindowDays]` window when none is declared |
| `awaiting` / `overdue` | no answer, compared against `declaredOn + dutyStandbyResponseDays` |
| `accepted` | a yes whose window **contains** the current ask window |
| `declined` | a no, with the reason the person wrote |
| `lapsed` | a yes that no longer covers the current ask — the window moved, or the ask widened past it |
| the acknowledged percentage | accepted ÷ declared covers, about the REGISTER, never about a person |

A stored `acknowledged: true` would be a second, decaying record of a fact the declaration, the answer and the clock already determine — the exact failure ADR-0121 refused for "exercised" and ADR-0122 refused for "available".

## The two chairs

**For me (`#/standby?panel=for-me`) — the missing surface.** Every ask addressed to the acting seat, with the exact window it is about and two first-person buttons: *I accept — for these dates* and *I cannot — here is why*. A row answers only its own named person: the action refuses any other seat, the answer is bounded to dates inside the ask, and the schema drops an answer whose `answeredBySeatId` is not the cover **on reload as well as in the action** — a hand-edited file cannot record consent nobody gave.

**For my span (`#/standby?panel=asked`) — the director's chair.** Every declared cover in the seat's own duty lines and those below it, worst state first, plus the concrete exposure: **duty lines whose only live declared covers refused**, with the open work behind them. No cover is re-assigned, no reminder is sent, no escalation fires. The register names who has not answered; the human acts stay human.

## `lapsed` is the state that makes this honest about time

A cover who said yes to 5–9 July has **not** said yes to a leave week moved to September. Widening the ask past a narrower yes is the same fact from the other side. The register prints the lapse and says re-asking is the human act — it will not quietly extend someone else's consent, and it will not read a stale yes as readiness.

## What is refused

- an answer given on someone else's behalf (action **and** schema);
- a window **wider** than the one asked about ("accepting a wider window would be consent to something nobody asked you about");
- a second active answer stacked over the first (revoke, then re-answer — the first answer stays in the record);
- a refusal without a reason;
- a `lapsed` or `overdue` read as `0% acknowledged`, or as anything other than its own printed state.

## Wiring (no new rule, no new automation)

- **One atomic transaction** per answer: the row, one `accepts-standby-for` edge to the cover declaration it answers, one `rolls-up-to` edge per leadership ancestor above the answering seat (the climb starts at the cover's manager — a seat is never its own ancestor), and the audit event. Accepting opens **no** decision; declining opens one naming what stops, quoting the person's words verbatim.
- **Upward brief**: counts and states only — no person, no seat id, no duty label, no note. `standbyBriefLines`.
- **Seat digest**: `dutyStandbyAttentionCount` counts **refusals and overdue asks only**. An ask inside its deadline is a normal Monday; a badge that fires on every fresh declaration is a badge people stop reading.
- **CSV scope #104 (`cover-standby`)**: aggregate rows only — ranks, dates, derived states, counts. A non-accepted row's rate column is **BLANK, never 0**.
- **Access gateway**: `answer-duty-standby` with all five commands declared; the three reads (`dutyStandbyForMe`, `dutyStandbyBoard`, `dutyStandbySettings`) are `SAFE_READS`, because a read absent from that list is unreadable under enforcement while its writes are gated — which would hide the ask from exactly the person being asked.
- **Two declared conventions**, printed, clamped, re-declarable only by a rank-4+ full-access seat: `dutyStandbyResponseDays` (default 3) and `dutyStandbyWindowDays` (default 14).

## Altitude coverage

- **Director (rank 3) / VP (rank 4): PRIMARY.** The leave-week decision: which named covers have answered across the branches they are accountable for, which refused, and what open work sits behind an unanswered ask.
- **Mid-manager (rank 2):** the same board for their own leads, with names visible.
- **Frontline (rank 1):** declares cover as before and now *sees the answer* to the ask they made — the register stops calling a silent declaration "covered".
- **CEO / C-suite (rank 5):** the counts-only line in the upward brief, on the same spine; no new executive command.

## Honest limits

- Seats remain **workflow declarations, not authentication**. A local operator can switch seats and answer in someone else's chair; the gateway and schema make that an auditable, refused-on-reload act, not a cryptographic one. This is the standing top roadmap item.
- `accepted` means *the named person answered yes to this window*. It is not a promise they will be present — travel, illness and an unrecorded absence are invisible here exactly as they are in ADR-0121/0123.
- The register does not chase anyone, so an overdue ask stays overdue until a human acts or a new declaration replaces it.
- Schema v116 is additive and convergent: an upgraded workspace opens with an empty answer ledger, so every pre-existing cover reads `awaiting` or `overdue` from its declaration date. That is the truthful state — the ask has been outstanding since the day it was made — but it will look loud on the first read of a large legacy workspace.
