# ADR-0209: Cross-Line Work/Rest Recovery Ledger — How Long Was This Person Actually Off?

Date: 2026-11-15 · Session 278 · Schema v163 (additive: `workRestShifts`, `workRestActs`, `workRestCoverage`, `workRestPolicies`, `workRestMarkers`) · Status: Accepted

## Context

A shift lead rosters Sam 06:00–14:00 on Tuesday. It is an ordinary shift. What
the lead cannot see is that the project line Sam also reports to kept him on a
commissioning run until 22:50 on Monday. Each manager looked at their own roster
and saw nothing wrong. Sam had seven hours and ten minutes between two jobs, and
nobody was accountable for the gap, because nobody could see both ends of it.

The workspace could already prove who is qualified for a task (ADR-0192) and
whether a set of stations can be manned at once (ADR-0201, ADR-0204). It held no
interval of work at all, so it could not say how long a person had been off
between one line's work and another's. The capability was logged in Session 250
and stayed Planned; frontline / mid-manager had not been a primary altitude
since Session 272.

## Decision

A sixth panel on Leader standard work — `#/standard-work?panel=rest` — backed by
six domain modules (`workRestRegistry`, `workRestTime`, `workRestMath`,
`workRestSchema`, `workRest`, `workRestActions`), one rule (`workRestRules`,
`RULE-WRR-01`, spine rule 128) and CSV scope #151 `work-rest-recovery`.

**What is recorded — four dated human statements, nothing derived.**

- A **shift**: one person × one reporting line × a start and an end as
  wall-clock times in a named IANA zone, with the UTC offset each end resolved
  to. Immutable once declared.
- An **amendment**: the times actually worked, or a cancellation with its
  reason. The rostered row is never edited.
- A **coverage attestation**: a line's holder states that the record of one
  person's work for that line is complete for a range of UTC days (≤ 92).
- A **policy**: which thresholds apply, to the workspace or to named people,
  with a written source.

**Time.** A wall time is resolved against the zone's rules once, at the door. A
time the clocks skipped is refused; a time that occurs twice must say which.
Every duration is elapsed time between two instants in whole minutes. Later
readings are integer arithmetic on the stored offsets, so they print the same
minute on every device; a stored offset the device's rules no longer give is
flagged as drifted, not silently re-timed.

**The kernel.** Shifts are merged per person across every line. Shifts that
touch or overlap are one spell; overlapping minutes count once. Four threshold
shapes can be declared — minimum rest, longest spell, a long rest that must
begin within a fixed time of the previous one ending, and a total inside any
rolling window. The rolling total is tested at every spell's end (where its
maximum over all windows must lie) and the first minute past the cap is printed.

**Line authority.** A shift, its amendment and a coverage attestation are acts
on ONE line. They belong to that line's manager, to a seat with that manager in
its own tree, or to the workspace leader — the route (`line-holder`,
`above-line`, `operator`) is stored on the act. A manager who can see a person
through another line cannot roster, amend or attest for a line they do not hold.
Nobody rosters or attests their own record.

### The refusals are the design

- **No limit is built in.** Which limits bind a person depends on country,
  contract, opt-out and derogation. A threshold nobody declared prints "not
  tested". With no policy, only a double-booking can be proved.
- **Silence is not rest.** A person reads `clear` only when no declared
  threshold is breached AND every one of their current lines attested the whole
  horizon. Otherwise the reading is `unproven`, with the reason.
- **A conflict does not wait for coverage.** Work another line has not recorded
  can only shorten a rest or remove it, lengthen a spell, or raise a total — it
  never gives rest back.
- **Two live policies claiming one person test nothing** until one is retired.
- **A preventable conflict is admitted only with the reason in writing.** The
  door does not refuse the shift — refusing to record it would hide it. A
  conflict that already happened is admitted as it is.
- **No fatigue score.** Nothing here measures alertness or fitness for work, and
  nothing rates a person.

### One ask, to the seat that can see both ends

`RULE-WRR-01` acts on one condition: a provable conflict whose decisive minute is
still ahead. A conflict inside one line is asked of that line's holder; one made
by two lines is asked of the lowest seat above both (`matrixJointApex`). Where
that is the workspace leader, where no single seat exists, or where the person
left the roster, one identity-free `workRestMarkers` observation is recorded and
nobody is asked. Asks are idempotent per conflict signature, self-closing when
the conflict is removed or passes, capped at four per commit, and governed by
`workRestAutoPropagate` on every path including an explicit scan.

## Benchmark

Compared with rota tools from their published descriptions only — not run
hands-on, so parity is **[BENCHMARK-UNVERIFIED]**. Deputy and Planday describe
rest alerts on rules the customer defines; RosterElf describes built-in UK
working-time checks that warn without blocking; RotaPulse describes working-time
checks plus an HSE fatigue-risk index and a smallest-change suggestion. None of
the descriptions read mentions merging one person's intervals across several
reporting lines, or withholding a clearance where a line has not attested.
RotaPulse's fatigue-risk index is a layer this ledger does not have.

Arithmetic was checked hands-on: 400 randomised interval sets against an
independent minute-grid implementation in Python (totals, longest spell, short
rests, long spells, rolling-cap first minute): 0 mismatches. 54 wall-time
resolutions in six zones against CPython `zoneinfo`: 0 mismatches.

## Consequences

- A lead sees, before saving, that a shift leaves a person short of rest across
  a line they do not manage, with the exact start time that would fix it.
- The reading seat's reach follows the existing convention (reporting tree plus
  lines the seat itself holds). A seat above a dotted-line manager does not read
  that manager's dotted-line people; they are counted as "not read" in the span.
- Not built: in-shift breaks, night-work limits, standby / on-call
  classification, a fatigue-risk index, roster import, the worker's own
  confirmation of their record, and compensatory-rest tracking for derogations.
- Legal figures named in the method text (Directive 2003/88/EC, Regulation (EC)
  561/2006) describe the shapes of limits and were read from secondary sources:
  **[UNVERIFIED]** against the primary text. None is applied as law.
