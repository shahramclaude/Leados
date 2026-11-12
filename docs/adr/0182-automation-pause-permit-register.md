# ADR-0182 — Automation Pause Permit Register

**Status:** Accepted — 2026-11-12
**Schema:** v144 → v145 (two additive collections, empty on upgrade)
**Surface:** `#/settings?panel=pause-permits` · CSV #136 `automation-pause-permits` · `RULE-PMP-01`

## Context

LeadOS runs on **85 declared automatic switches**. Setting one to `false` stops that engine's rules on every ordinary write. Until Session 246 the workspace could not even say which were off: `normalizeSettings` rebuilt the settings object field by field and silently discarded 30 keys belonging to six engines, so a paused propagation came back on at the next reload (ADR-0180 fixed that and added the Conventions-in-Force Register).

The Conventions register can now say **which** switches are off. It cannot say **who silenced them**, **why**, **until when**, or **what stands in for the control while it is off**. A pause is a bare boolean. The only trace is a `settings.updated` event naming the keys, inside a log capped at 600 entries and evicted oldest-first — so the record of who silenced a control is gone long before the silence is.

In a matrix this is not housekeeping. Nine of the switches gate post-commit rules that read the reporting graph (`workTurnRules`, `delegationLineRules`, `transferPriceRules`, `oneOnOneLineRules`, `hiringLineRules`, `matrixInterfaceRules`, `doaScheduleRules`, `cadenceRules`, `contradictionRules`). Silencing one stops work that would have reached a shared contributor's **second** manager on an ordinary write. That manager is not told; their roll-up simply stops moving. A bypassed protective function that nobody can see is the classic control failure, and the classic control for it is not a better log — it is a **permit**.

Practice this implements:

- **Bypass / inhibit management in functional safety** (IEC 61511 / ISA-84, IEC 61508): a bypassed protective function carries an authoriser, a written reason, a time limit and a compensating measure. Removing the automatic action without those four is the definition of an unmanaged bypass.
- **Permit-to-work** (process and utilities safety): work that removes a safeguard is authorised in advance, bounded in time, and closed out explicitly — not left standing because nobody remembered it.
- **Temporary-change control in management of change** (ISO 9001:2015 §8.5.6; ISO 45001 §8.1.2): a temporary deviation from a declared control is recorded, time-bounded and reviewed before it becomes permanent by neglect.
- **COSO 2013, principle 10** (control activities): the design and operation of controls is itself subject to control, including the authority to change them.
- **Configuration baselining / IT general controls**: the configuration in force is an inspectable, recorded baseline and a disabled control is never invisible (the principle ADR-0180 already leaned on).

Absence was checked before building: `pausedUntil|pauseReason|pausedBy|pauseExpires|bypass register|bypass permit|inhibit register|permit-to-work` returned 0 hits across `app/` and 0 lines of `ROADMAP.md`.

## Decision

**Store one thing: a dated permit.** `pausePermits` is an append-only ledger. One permit names the switch, the authorising seat, a written reason, a compensating measure, a first and a last day, an optional counterpart manager, an optional span it *matters to*, and — when withdrawn — a dated revocation. `pausePermitMarkers` is `RULE-PMP-01`'s bounded idempotency ledger.

**No state, no reach flag, no expiry mark and no count is stored.** All of them are re-derived on read from the permits, the declared switches and the switch value in force.

**A pause is not blocked. It is stopped from being anonymous.** There are two ways to silence a control and they now differ in exactly one respect:

| Door | What is written | What the register reads |
|---|---|---|
| `updateSettings({ key: false })` | the switch only | `unpermitted` — escalated by `RULE-PMP-01` |
| `updateSettings({ key: false }, permit)` | the switch **and** the permit, in ONE atomic commit | `permitted`, or `expired` when the window passes |

The bare door stays open on purpose. Blocking it would have meant either breaking every existing control in the app or inventing a permit on the leader's behalf — and an authority the system writes for you is not an authority. What the register does instead is print the silence as anonymous and put one dated ask in front of the one seat that can authorise it.

**The four states are derived, first match wins, and each partition reconciles:**

- `on` — the switch is up; nothing is silenced and no permit is claimed.
- `permitted` — the switch is off and a permit naming it is in force (first and last day **inclusive**).
- `expired` — a permit's window passed while the switch stayed off. The authority ran out and the pause outlived it.
- `unpermitted` — the switch is off and no permit in force names it. **A revoked permit that left the switch off reads `unpermitted`, not `expired`**: the authority was withdrawn, so the silence is anonymous again. Two failures, never one word.

**The switch is workspace-wide, and a span scope does not change that.** `matrixSetConventions` already says so ("these are workspace-wide settings, not line-scoped"). A permit may name the span it matters to; the panel prints that the switch is still workspace-wide rather than implying a containment the settings cannot deliver.

**Reach is derived from the source, never guessed.** A switch is on the reach list when a post-commit rule module that reads the matrix model reads that switch. `tests/app/pause-permits.test.mjs` re-derives both directions from `app/` — every claimed pair is real, and every matrix-reading gated rule is claimed — and fails the build when either drifts. The claim is bounded: the rule that would have issued work to a second line does not run on an ordinary write. It is **not** claimed that the record was deleted, or that no other route informs the second manager.

**The grace is withheld where the start is unprovable.** The record does not hold the day a switch was flipped (that is the evicted event this register exists to name). The start is taken only from the latest surviving permit's first day; with no such permit the register prints "start not on the record", withholds the grace verdict and counts the switch apart. It is never dated from today, and never from an expired permit's last day.

## Refusals (the product)

A permit request is refused, with every reason it failed printed, when: the key is not a declared switch (`unknown-switch` / `not-a-switch`); the switch is already on and the caller is not the one switching it off (`already-on`); a permit is already in force for it (`already-permitted`); the reason is below the declared floor (`reason-too-short`); no compensating measure is declared (`no-mitigation`); the window is missing, reversed, already over or longer than the cap (`bad-window`); the named counterpart is not on the roster (`counterpart-not-on-record`); the seat is below director rank, or is not the single seat above every reporting line (`authoriser-too-junior`); the ledger is at its cap (`ledger-full`).

A **new** permit may not be born already expired — `bad-window`. The `expired` state is produced by time passing, which is exactly the case it describes.

**Revocation is all-or-nothing on the flag and the day, and the authorising seat is deliberately nullable.** The full-access operator view has no seat to name. Requiring one silently un-revoked the permit at the next load — found by this session's own suite and fixed before shipping.

## Consequences

- **Easier:** the seat that owns the control environment can answer "who silenced this, why, until when, and what stands in for it" for every switch, and can see the one finding no single line manager can: a control that pulls work to a second line is off with nobody's name on it.
- **Easier:** `RULE-PMP-01` turns that finding into a bounded, dated ask to the one seat that can authorise a workspace-wide pause, in the same commit that silences the control.
- **Harder:** an ordinary pause now leaves a visible `unpermitted` state and generates an ask after the grace. That is deliberate friction, and it is the friction a bypass should have.
- **Debt:** a permit cannot narrow a pause, because the settings cannot. Recorded as a span scope and printed, not enforced.
- **Debt:** the operator view writes permits with no `authoriserId`; the register prints that as `unknown` rather than substituting a seat.
- **Revisit when:** any switch is added that a rule reads *and* that rule can reach a second reporting line on a path the reach test misses; or when settings become scopeable per span, at which point a span-scoped permit should actually narrow the silence.

## Alternatives considered

- **Make the permit mandatory at the `updateSettings` door.** Rejected: it breaks every existing control in the app and any integration that pauses a rule, and it invites the system to authorise on the human's behalf.
- **Store a state on the permit (`expired`, `live`).** Rejected: a stored verdict drifts from the clock that produced it. The `revoked` flag is the only stored verdict, because a withdrawal is a human act and does not depend on when you read it.
- **Infer the pause start from the `settings.updated` event.** Rejected: that log is capped at 600 and evicted oldest-first — relying on it would make the grace depend on how busy the workspace has been, which is the defect, not the fix.
- **Flip the switch back on automatically after the window.** Rejected: a control moved by the system is an unowned decision. The register prints the expiry and asks the authoriser; the human moves the switch.
- **Treat a revoked permit left off as `expired`.** Rejected: it conflates "the authority ran out" with "the authority was taken away". Different facts, different owners.
