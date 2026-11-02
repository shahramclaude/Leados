# ADR-0075: The Command Chain — one hierarchy, five altitudes, one clock

Date: 2026-11-02 · Status: implemented · Schema: v82 · Surface: `#/chain`

## Context

This workspace has modelled **one leader reading one roster** since Session 1. Every
instrument built in the 115 sessions since — the delegation queue, the 1:1 cadence, the
capacity model, the promise book, the supply chain, the cross-examination terminal — is
honest about its own evidence, and all of them quietly assume the person reading is the
person the work belongs to. That assumption is false in every real organisation above
about eight people, and it fails in a specific, expensive way:

- Work sits at the wrong altitude. A director coaches a single shift; a team lead makes
  an enterprise bet on a supplier relationship. Nobody has *decided* that — it accreted,
  because the person with the least expensive hour was nearest the problem.
- Escalation happens by surprise. The level above learns about the ageing decision in a
  corridor, at the worst moment, from the person least willing to say it plainly.
- Vertical reporting is re-typed by hand. Every roll-up in the category is a status
  update someone types into a deck, which means the number the top sees is a copy of a
  copy, and the copy's provenance is a person with an incentive.

The audit that preceded this session (Section 1 of the standing brief) found that the
canonical app had **zero** occurrences of the word "altitude", 262 `page.tsx` routes of
quarantined history, and a single hierarchy primitive: `person.managerId`, read only to
group people in a list. `orgDesign.js` computed span of control and decision rights on
*one* level. There was no role-tiered behaviour anywhere: every screen was the same
screen, whichever rung the reader stood on.

The competitive picture, surveyed 2026-11-02 (RESEARCH §98): the category sells
per-altitude *experiences* — Lattice for managers, Workday for HR, Betterworks for
OKRs — and every one of them makes the hierarchy a **filter** (`WHERE manager_id = me`)
rather than a **model**. None of them (a) derives responsibility for cross-unit work
from the tree instead of asking someone to assign it, (b) defines a level by the period
its work may run without review, (c) prints a pooled rate and the mean of the unit rates
side by side when a roll-up is composition-sensitive, or (d) refuses to show a rate at
all below an evidence floor. That is a gap only visible from inside a workspace that
holds dated records rather than a feed of status updates.

## Decision

Build `#/chain`: a sixth-generation structural terminal that reads the reporting tree
the workspace already holds, assigns every node an altitude, attributes every open item
to the span that owns the people it concerns, and measures the two failure modes above
from the record rather than from a declaration.

### 1. Altitude is a time span, not a rank

Five altitudes, each defined by Jaques' *time-span of discretion* — the longest period
its work may run before it must be reviewed by the level above:

| rank | altitude | horizon | unit of discretion | decision form |
|---|---|---|---|---|
| 1 | Frontline lead | 7 d | the individual and the week | assignment & coaching |
| 2 | Manager | 30 d | the team and the cycle | resource & sequencing |
| 3 | Director | 90 d | multiple teams and the quarter | structure & strategy fit |
| 4 | VP / executive | 180 d | the function and the half | investment & risk appetite |
| 5 | CEO / C-suite | 365 d | the enterprise and the year | enterprise bet & disclosure |

Each altitude carries named duties **with the routes that serve them**, what it owes
the level above (`handUp`), what it must not be handed (`forbidden`), and a disclosure
contract. The duties are the product's map: a frontline lead is routed to coaching and
cover, a chief to board synthesis and bench risk. This is what "role-tiered" means here
— not a permission flag on a dashboard, but a different set of questions and a different
set of screens for the same event.

Altitude is assigned from `person.level` where a level exists, and **escalated to
frontline with a printed reason** when a person has direct reports but no leadership
title. A person with reports is doing a lead's work whatever the record calls them.
An IC with no reports has **no** altitude (`null`) and is never given one.

### 2. Responsibility is a property of the tree, not a field

An open item names the people it concerns (`ownerId`, `involvedPersonIds`, `personId`,
`ownerId` on goals, …). Its owner is `responsibleNodeId(chain, people)`:

- one person → their manager;
- several → the **lowest common ancestor** of their managers (Tarjan offline LCA);
- nobody → the workspace leader.

There is no assignment step and no judgement call. Cross-unit work rises to the smallest
span that contains everyone it touches, which is why the escalate rule can open a task at
the right altitude without anyone clicking "escalate". An item that names its own owner
is owned by the level above them: you cannot own the record you are the subject of.

### 3. The clock is per-altitude, and the crossing date is printed

`requiredAltitude = max(altitude by consequence, altitude by age)`. An item owned at the
frontline altitude (7 d) that is 12 days old demands the manager altitude (30 d); one
that is 45 days old demands the director altitude (90 d). Every row in the escalation
queue prints the date it crossed: `openedOn + ownerHorizon`. Nothing is re-typed to
escalate — the clock moved, and the page says so.

When the requirement is above the highest altitude the chain actually contains,
`aboveTop` is set and the item is reported as demanding a level the workspace does not
have. **The page refuses to invent a director, a VP or a CEO to escalate to.** An empty
rung is drawn empty, with its duties visible and no incumbent.

### 4. The roll-up is printed twice, on purpose

Counts are exact sums: each item has exactly one owner, so an altitude's count is the sum
of the spans at that altitude, and the leader's rolled-up count is the item count itself
(no double counting, nothing lost on the way up).

Rates are **pooled** (Σ numerator / Σ denominator) with the naive **mean of unit rates**
printed beside them. When they differ by more than the declared materiality bar the
reading is marked `compositionSensitive`, and a crude comparison is shown next to a
**directly standardised** one (age-standardisation, in the epidemiological sense). A
roll-up that silently averages averages reports a number nobody experienced; that is
Simpson's paradox wearing a dashboard.

Below the evidence floor (default 4 observations, clamped by the schema so it can never
be 1) a cell is **withheld with its reason printed**, never rendered as a proportion of
one. A cell of one identifies a person.

### 5. What it never does

- It never rates, ranks or scores a person. Every reading is about a span — the work a
  leader carries — and its members are counts.
- It never reads `conflicts` or `pulses`. Both are forbidden endpoints in the shared link
  contract (`FORBIDDEN_LINK_TYPES`); widening it to compute an org chart is exactly the
  leak the contract exists to prevent.
- It never repairs a reporting line. A cycle, an orphan pointer, a self-manager or a
  senior title under a junior one is **reported** with its consequence; the roster is the
  leader's to fix. Silent repair would be inventing an organisation.
- It never asserts access control. One operator, one keyboard, no authentication: the
  disclosure ladder is a **rendering contract** (names at the frontline, leaders-only
  above it, counts at the top) and the page says so rather than implying a permission
  system it cannot enforce.

### 6. Five post-commit rules, one engine

`chainRule` registers with the existing post-commit chain (ADR-0026/ADR-0008 pattern):

| rule | does | never does |
|---|---|---|
| RULE-CHN-01 ESCALATE | one task per item that outlived its owner's horizon, at the nearest ancestor whose altitude can decide it, with `escalates-to` and `rolls-up-to` edges | edits, closes or re-types the item; opens a second task for the same item ever |
| RULE-CHN-02 ROLL UP | one hand-up task per span per ISO week to its parent | reports on an individual |
| RULE-CHN-03 STRUCTURE | one governed DACI decision per week for a hard reporting defect, with three structural options | moves a reporting line, re-titles anyone, names a person to move |
| RULE-CHN-04 DRIFT | one governed decision per week when the leader's own work is below their altitude beyond the bar | delegates anything on the leader's behalf |
| RULE-CHN-05 GRADE | one grading task for a reading past its review date; reconciles stale edges | rewrites a grade |

All are marker-idempotent, pausable via `chainAutoPropagate` (an explicit scan always
runs), and write inside the caller's transaction.

### 7. Frozen readings, graded once

`chainReadings` freezes one span's counts, its defensible rates, and **exactly one**
prospective probability: the assumption-free Fréchet floor ("at least one member crosses
the next horizon"), with the independence value beside it so the assumption has a price.
A reading is gradable once, after its review date, against the record's own closure dates.
A probability the record cannot support is refused by name rather than filled with 50%.
Skill (Brier vs base rate) is withheld below five graded readings.

## Alternatives rejected

- **A per-level dashboard set (five routes, five layouts, `#/lead`, `#/manager` …).**
  Rejected: it duplicates every module five times and makes the hierarchy a theme rather
  than a model. One surface, six panels, altitude as a parameter.
- **Asking the leader to assign responsibility for each item.** Rejected: assignment is
  the status-update tax this ADR exists to remove, and it produces a number that measures
  the assigner's diligence rather than the organisation's shape.
- **A single universal SLA instead of per-altitude horizons.** Rejected: it makes a
  seven-day question answered in ten days "late", which is a fact about the SLA, not the
  decision. The horizon *is* the altitude.
- **Inventing the missing rungs so the ladder always looks complete.** Rejected outright:
  an empty altitude is the single most useful thing this page can tell a reader.
- **Pooling without printing the mean of rates.** Rejected: it hides the one disagreement
  a leader needs to see before comparing units.

## Consequences

- **Positive.** Escalation debt becomes measurable from records the workspace already
  holds, with no new data entry. Cross-unit ownership is derived. Roll-ups are honest by
  construction, and the two failure modes of a hierarchy (work at the wrong altitude,
  escalation by surprise) each have a number and a dated queue.
- **Positive.** Every other module gains an altitude dimension without changing: an item's
  required altitude is computed from its own dates and its people, so a new rule or a new
  record type inherits the whole model by adding one `SIGNAL_SOURCES` entry.
- **Trade-off.** The horizon table is a declaration. A leader who disagrees with Jaques
  can change it, and the page will faithfully report against their declaration — while
  telling them that the bar is a declaration and cannot detect its own wrongness.
- **Trade-off.** A two-level roster makes four of the five rungs empty. That is not a
  demo defect; it is the product telling the truth about the roster.

## Verification

`tests/app/command-chain.test.mjs` (17 numbered claims) covers the migration, the tree
and its defects, altitude assignment, LCA responsibility, the clock, floor withholding,
pooled-vs-mean disagreement with a real 47.1% / 60% / −12.9 pp case, survival refusal and
the Fréchet ≤ independence bound, the disclosure ladder per altitude, freeze-and-grade
(including the `Number(null) === 0` bug that let a probability-free reading be scored as
0%), rule idempotency across repeated scans, signals, link/CSV registration, CSV scope
#72's aggregate-only contract, every panel rendering over the demo and over an empty
workspace, and the multi-altitude roll-up as an exact sum with no double counting.
