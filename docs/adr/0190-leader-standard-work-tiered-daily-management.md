# ADR-0190 — Leader Standard Work & Tiered Daily Management (RULE-LSW-01)

**Status:** Accepted — 2026-11-13 (Session 258)
**Schema:** v150 — three append-only ledgers (`standardWorkRoutines`, `standardWorkChecks`, `standardWorkTierActs`) and six declared conventions. `MIGRATIONS[149]` creates the ledgers EMPTY.
**Surface:** `#/standard-work` (Board · Spans & structured time · Method) · CSV #143 `standard-work` · rule `RULE-LSW-01` (spine rule 120) · rights `read-` / `declare-` / `record-standard-work` (rank 1–5), `govern-standard-work` (rank 3–5)
**Altitude / structure:** frontline / mid-manager PRIMARY, every altitude served × single-chain **and** matrix.

## Context

LeadOS records the conversations and decisions of leadership — 1:1s, delegations, reviews, cases — but had no place for the **repeatable part of the job**: the walk, the huddle, the process confirmation that a leader owes every day or week whether or not anything is on fire. Mann (*Creating a Lean Culture*, 2005) calls this leader standard work and makes two claims the app could not express: a missed routine is itself an abnormality the tier above goes to see, and what a routine finds is contained at the lowest tier able to contain it, otherwise carried up one tier at a time with a date on every hop.

The gap was logged in Planned at Session 226 and re-confirmed this session (`gemba|standard work|tiered daily` matched 0 files in `app/`).

A matrix makes the second claim ambiguous. A leader with a home line and a project line has **two** next tiers. Software that silently escalates to the home-line manager sends a project abnormality to the wrong room.

## Decision

### 1. The unit is one calendar slot × one first-person check

A **routine** is declared with an observable standard, a kind, a cadence (daily on named weekdays / ISO-weekly / monthly), minutes per occurrence and — where the owner holds more than one reporting line — the line it is owed under. A routine owes one **slot** per period, and only for periods it was in force for in full: declared on a Wednesday, it owes nothing for that week.

A **check** is recorded by the routine's owner and nobody else, once per slot, as `done`, `abnormal` (done, with a finding) or `missed` (with a reason). It can be recorded during the slot or, marked late, during the very next one. An older slot stays **unrecorded** for good — there is no back-fill. The normalizer enforces the same rules on load, so an imported file cannot contain a proxy tick or a back-dated check.

### 2. Nothing derived is stored

Adherence, the Wilson interval, the routine verdict (`lapsed | gaps | held | new`), the tier state, escalation state, structured time and the yield comparison are recomputed on every read by one reader, `buildStandardWork`. The view, the CSV, the brief, the nav badge and the rule all read that one report.

### 3. Adherence is printed with its interval, or withheld

Adherence = closed slots done (with or without a finding) ÷ all closed slots in the window. It is printed with a 95% Wilson interval and **withheld** — null, a dash on screen, blank in the CSV, with the reason — below the declared slot floor. A stated miss and silence both count against it and are printed apart. Two claims are reported separately: `countsReconcile` (the partitions add up) and `figuresComplete` (nothing printed rests on a withheld or truncated cell).

### 4. The matrix is never guessed

Tier state per routine: `single-line`, `named-line`, `top-tier`, `ambiguous` (several lines, none named), `line-ended`, `off-roster`. Only the first two resolve to a next-tier manager. An ended line is **not** replaced by the home line. Declaring refuses a matrix owner with no line named; a dotted-line manager may declare a routine for someone only under the line they hold. An escalation names one of the escalator's own active line managers, or is refused.

Span roll-up uses the matrix DAG's `descendants` set, so a leader reached through two lines is counted once in a common ancestor's span; the count reached only through a dotted line is printed beside it.

### 5. Tiered escalation is an append-only chain

An `abnormal` check is either contained or escalated to a named manager. That manager records one first-person **tier act**: contained, returned with a reason, or escalated once more (at most five hops). Each act must come from the current holder and continue the chain in order; the normalizer drops anything out of sequence rather than repairing it. A holder who left the roster makes the chain `unattributable`; nobody is substituted.

### 6. RULE-LSW-01 on the shared spine

Registered immediately before `seatRule` and `sealRule`; writes `delegations`, `links`, `matrixMarkers`.

- **Routine lapsed** (trailing closed slots not done ≥ declared run) → one dated go-and-see ask to the resolved next tier.
- **Tier ask** (escalation awaiting its holder) → one dated ask in that holder's queue, due at the end of the tier window.

Asks are `act-inform`, idempotent per identity-free signature (`lsw1:<kind>:<16 hex>`), carry `issues-obligation` and matrix-DAG `rolls-up-to` links, close themselves when the condition clears or the accountable seat moves, are never re-filed once a human has closed or returned them, and are capped at 8 per commit with the remainder counted. Where no roster seat can be asked the rule writes one identity-free `matrixMarkers` observation. `standardWorkAutoPropagate = false` stops every path including an explicit scan, and the switch is a registered pause-permit control.

### 7. Finding yield is a question, not a verdict

A process confirmation that never finds anything may be a healthy process or a tick-box. For a routine with zero findings the exact one-sided 95% bound `1 − 0.05^(1/n)` is printed. Where the routine and at least two peers of the same kind each have ≥ 8 checks, Fisher's exact test compares its finding rate with the pooled peers, Bonferroni-corrected across every routine tested. A significant *lower* yield is shown as a question for the next go-and-see. It changes no verdict and triggers no automation.

### 8. Structured time is a reference band

Declared minutes per week are printed as a share of the declared working week beside a reference band per altitude adapted from Mann's approximate figures (team leader ≈ 80%, supervisor ≈ 50%, value-stream manager ≈ 25%, executive ≈ 10–15%). The mapping from Mann's four roles to LeadOS's five altitudes is this ADR's adaptation. It is never a target and never a trigger.

## Disclosure

A seat sees in detail its own routines, routines that name it as next tier, and unresolved routines of people it holds a line over. Deeper routines in its reach are counted in totals and spans and reported as a `below-tier` refusal. CSV #143 and the workspace brief carry no owner, manager, line, title, standard, note or record id.

## What this does not say

Adherence is not performance. A held routine says the leader looked; it does not say the process is healthy. A lapsed routine says the record stopped; it does not say why. Nothing here rates or ranks a person.

## Competitive benchmark — [BENCHMARK-UNVERIFIED]

The specialised products for this job are daily-management and layered-audit platforms — Tervene, EASE (layered process audits) and SafetyCulture are the names known to the author. Their sites could not be opened from this session's sandbox, so the comparison below rests on general knowledge of the category, not on a feature check made today.

- **Believed to match the category baseline:** recurring routines by role and cadence, completion/adherence reporting, issue escalation through tiers with dated ownership.
- **Believed to exceed it:** matrix-correct next tier (named line, never guessed), intervals and a disclosure floor on every rate, an exact finding-yield test, first-person append-only provenance enforced on load, and escalations landing in the same delegation queue as every other module.
- **Known to be weaker:** no mobile/offline capture with photo evidence, no question bank with randomised card draw for layered audits, no holiday or shift calendar (a daily routine owes every declared weekday), no reminders or notifications, no SQDCP-style tier board. These are logged In Progress in `ROADMAP.md`.

## Consequences

- Schema v150; CSV count 143; spine 120 rules with 120 contracts; standalone 12,330,337 bytes over 803 modules (ceiling raised to 12,450,000).
- Method diagram `app/assets/standard-work-tiers.jpg` (22,377 bytes) was generated with the Arena image tool because the Higgsfield connector reports `unsupported`.
- Verified by `tests/app/standard-work.test.mjs` (25 tests on a hand-computed single-chain + matrix fixture).
