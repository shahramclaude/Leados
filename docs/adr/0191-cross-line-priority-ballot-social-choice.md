# ADR-0191 — Cross-Line Priority Ballot & Social-Choice Aggregation (RULE-SOC-01)

**Status:** Accepted — 2026-11-13 (Session 259)
**Schema:** v151 — two append-only ledgers (`priorityRounds`, `priorityBallots`) and four declared conventions. `MIGRATIONS[150]` creates the ledgers EMPTY.
**Surface:** `#/matrix?panel=priority` · CSV #144 `matrix-priority-ballots` · rule `RULE-SOC-01` (spine rule 121) · rights `read-priority-ballots` (1–5), `declare-priority-round` (3–5), `cast-priority-ballot` (1–5), `govern-priority-ballots` (3–5)
**Altitude / structure:** director / VP / CEO PRIMARY, every altitude served × matrix; a single-line workspace is served and the round prints `inert`.

## Context

Every surface that already touches "what comes first" is a **single line's** view. `#/portfolio` holds the owner's own horizon; the Allocation Governor learns an exploratory *funding* share across the plan; the Cross-Line Priority Arbitration (ADR-0143) compares two managers' **dated work items** as an escalation. None of them answers the question the holder of a second line actually faces: *given the same three things this person could do this week, what order do the lines that share them each want — and where is the disagreement genuine rather than rhetorical?*

The gap was logged in ROADMAP Planned (Session 244) and re-confirmed this session: `condorcet|schulze|kemeny|ranked ballot|social choice` matched 0 files under `app/`.

Two rules of the house shape the design. First, a matrix must never invent an owner: the person being ranked does not own the disagreement, and neither does their home-line manager. Second, nothing scored may be invented: a self-declared 1–10 value or a WSJF figure lets whichever line inflates its numbers win, and interpersonal utility comparisons are unavailable to any aggregator (Arrow, 1951).

## Decision

### 1. The unit is one frozen working set × one first-person ballot per frozen line

A **round** is declared by a seat that holds a line over the person (or the person's joint apex). It freezes three things on that day: the person, 2–7 of that person's **live open** portfolio items with the titles they carried that day, and the person's active reporting lines with their holders. A later reorganisation cannot add a voter or change who was asked.

A **ballot** is cast by the frozen holder of exactly one frozen line and by nobody else. It ranks **every** frozen item exactly once, strictly. An incomplete ballot, a duplicated item, a ranking of an item outside the set, or a second ballot from the same line is refused at the door and dropped on load — never repaired into an opinion nobody stated. A holder whose line ended after the round was frozen is refused by name; the line's new holder is never asked on the old holder's behalf.

A **withdrawal** closes the round with a reason of substance. Nothing is deleted; the ballots already cast stay on the record as history and are not aggregated.

### 2. Nothing derived is stored

The pairwise majority matrix, the Condorcet winner or its proof of absence, the Schwartz top cycle, the Schulze beatpath strengths and order, the exact Kemeny–Young ranking, every coverage state, every roll-up and every verdict are recomputed on read by one reader, `buildPriorityRanking`. The panel, the CSV, the brief, the nav badge and the rule all read that one report.

### 3. Each line's silence is counted, and silence is never a ranking

Per frozen line the reader prints one of `answered`, `pending`, `overdue`, `line-ended`, `holder-moved`, `person-off-roster`. Only `answered` is a ballot. Coverage = answered ÷ live frozen lines, printed with a 95% Wilson interval and **withheld** below the declared ballot floor. A withdrawn round owes no coverage: its ballot remains on its own row as history but is never charged to the rate. Two claims are reported apart — `countsReconcile` (the partitions add up) and `figuresComplete` (nothing printed rests on a withheld or truncated cell).

### 4. The aggregate is exact and refuses to overclaim

- **Pairwise counts** cover every ordered pair, so `counts[a][b] + counts[b][a]` equals the ballots cast — the panel prints that identity rather than asserting it.
- **Condorcet:** one item strictly beating every other, or the printed statement that none exists.
- **Schwartz top cycle:** the smallest set nothing outside it beats, computed from the strict-majority graph's strongly connected components.
- **Schulze beatpath:** widest-path strengths by Floyd–Warshall over positive margins. Where every pair ties, no order is claimed (`strict: false`, `order: []`) — a balanced 3-cycle has no leader, and the panel says so.
- **Kemeny–Young:** exact enumeration inside the declared cap (≤ 6 items, 720 orderings). Above the cap the verdict is `capped`; where two rankings tie the verdict is `tied` with the tied optimal count — never broken by a hidden tiebreak.
- Below the declared ballot floor the aggregate is **withheld**: counts stay visible, no winner, no order, `insufficient`.

### 5. A cycle belongs to the lines' joint apex, never to the person

A genuine majority cycle is an ambiguity between lateral parties (Galbraith, 1973). The rule resolves the **joint apex of the line holders** through `matrixJointApex` — the same owner-resolution function every other matrix register uses — and files the ask there. Where the apex is ambiguous or leader-held, one identity-free `matrixMarkers` observation is recorded and nobody is substituted. The person whose work is ranked is never asked to resolve their own ranking, and their `managerId` home line is never silently preferred.

### 6. RULE-SOC-01 on the shared spine

Registered immediately before `seatRule` and `sealRule`; writes `delegations`, `links`, `matrixMarkers`.

- **Overdue ballot** — a frozen holder has not cast by the round's deadline → one dated `act-inform` ask to **that frozen holder only**, naming the round and the item count.
- **Cycle** — the cast ballots hold a majority cycle → one dated ask to the lowest joint apex of the asked lines, naming the Schwartz top cycle and the beatpath completion.

Asks are idempotent per identity-free signature (`soc1:<kind>:<16 hex>`), carry `issues-obligation` and matrix-DAG `rolls-up-to` provenance, close themselves when the condition clears or the accountable seat moves, are never re-filed once a human closed or returned them, and are capped at 6 per commit with the remainder counted. `priorityBallotAutoPropagate = false` stops every path including an explicit `priority.scan`, and the switch is a registered pause-permit control on `PAUSE_PERMIT_MATRIX_REACH_SWITCHES` (it reads the reporting graph, so silencing it can reach a second line). ADR-0143 keeps its own `priorityAutoPropagate`; the two switches are deliberately distinct so one engine's pause cannot silence the other.

### 7. Conventions are declared, clamped on load, refused by the setter

`priorityBallotDueDays` (ballot deadline), `priorityAskDueDays` (follow-up window), `priorityMinBallots` (aggregate floor) and `priorityBallotAutoPropagate`. The loader clamps to declared bounds; the setter **refuses** an out-of-bounds value with a printed reason rather than silently storing a number nobody chose. All four are spread into `normalizeSettings` explicitly — a convention not named there vanishes on every reload and takes its pause switch out of the census with it.

## Disclosure

A seat sees in detail the rounds it declared, rounds that name it as a frozen holder, and rounds of people it holds a line over. Deeper rounds are counted in totals and reported as a `below-scope` refusal. CSV #144 and the workspace brief carry counts, verdicts and coverage only — never a person, a line, a title, a reason or a record id.

## What this does not say

A ballot is a line's stated priority, not a measurement of the person. A cycle says the lines' first choices are incompatible; it does not say which line is right, and nothing in this slice breaks the cycle or forces a decision. A withheld aggregate says the sample is too small; it does not say the lines agree. Nothing here scores a person, ranks a manager, or weighs one line's need above another's.

## Competitive benchmark — [BENCHMARK-UNVERIFIED]

The closest specialised tools are deliberative-polling and ranked-choice products — RankedVote, OpinionX, Pol.is and Condorcet vote-counting libraries (OpenSTV/EL;

their sites could not be opened from this sandbox, so the comparison rests on general knowledge of the category rather than a feature check made today.

- **Believed to match the category baseline:** ranked ballots with strict complete rankings, Condorcet/Schulze/Kemeny tallying, cycle disclosure, tie disclosure, result percentages.
- **Believed to exceed it:** the voters are *not* a self-selected audience but the frozen holders of named reporting lines, with a snapshot that a later reorganisation cannot rewrite; coverage and interval published as a separate claim from the result; a ballot floor below which no result is claimed at all; matrix-correct routing of a cycle to the lines' joint apex rather than a generic "results" page; append-only first-person provenance enforced on load.
- **Known to be weaker:** no live/simultaneous voting UI, no invitation delivery or reminders, no partial (tied-rank) ballots, no weighted or delegated voting, no multi-round elimination/IRV, no public-link participation. These are logged In Progress in `ROADMAP.md`.

## Consequences

- Schema v150 → v151; CSV count 144; spine 121 rules with 121 contracts; two new collections, empty on upgrade.
- Standalone build 12,512,536 bytes over 809 modules (15,466 bytes/module against the unchanged 24,000 density guard); the size ceiling moves to 12,650,000. `verify:standalone` 7/7.
- New setting `priorityBallotAutoPropagate` (and the three conventions) are carried by `normalizeSettings`; the pause census sees them.
- Method diagram `app/assets/cross-line-priority-ballot.jpg` (87,288 bytes) generated with the Arena image tool because the Higgsfield connector reports `unsupported`.
- Verified by `tests/app/priority-ranking.test.mjs` (23 tests on a hand-computed single-line + matrix fixture: a balanced 3-cycle, a unique Condorcet round, an insufficient round, a withdrawn round, a line ended after freezing, and the spine integration).
