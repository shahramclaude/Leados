# ADR-0184 — Workforce Stock-Flow (Markov Manpower) Plan

**Status:** Accepted — 2026-11-12 (Session 252)
**Schema:** v145 → v146 — two EMPTY collections (`workforceFlowActs`, `workforceFlowTargets`), no migration of existing rows, no switch changed
**Surface:** `#/matrix?panel=stock-flow` · CSV #138 `matrix-workforce-stock-flow` (aggregate, identity-free) · safe read `workforceFlowReport` · `RULE-WFS-01`
**Altitude / structure:** CEO / C-suite PRIMARY × matrix; a single-chain workspace is fully served and the per-line reading goes inert rather than restating the pyramid

## Context

LeadOS reads **who sits in which seat today**. It prices a reduction, reads retention risk, reads
succession depth. Nothing modelled the workforce as a **system of stocks and flows**: how many people
stand at each level, at what rates they are promoted, hired and lost, how long they wait in grade, and
what the pyramid therefore looks like in four or eight quarters against the shape the leader intends.
So a hiring freeze, a promotion round or an attrition spike is judged one decision at a time, and the
structural consequences — a hollowed-out middle, a promotion queue that cannot clear — arrive
unannounced.

A targeted search for `markov`, `manpower`, `stock-flow`, `stockFlow`, `transition matrix`,
`promotion rate`, `time in grade` returned **0 files**. The roster stores a level; it stores no level
history (`levelHistory`, `gradeHistory`, `promotedOn`: 0 files). **No rate may therefore be estimated
from snapshots that were never taken** — which is the whole design problem.

## Decision

### 1. The history is a ledger of dated human acts, never an inference

`workforceFlowActs` is append-only. Seven kinds, each with a **declared direction**:
`hire` (outside → level), `promotion`, `demotion`, `lateral`, `attrition-voluntary`,
`attrition-involuntary`, `retirement` (level → outside). `validateWorkforceMove` is one function used
by **both** the action and the loader, so an act the action accepts can never be dropped by the next
reload. It refuses `same-level-promotion`, `direction-mismatch`, `unknown-level`, `unknown-kind`,
`missing-person`, `future-day`, `before-start` and `outside-window`, and reports **every** clause that
failed rather than the first.

A withdrawn act is **kept and marked**, never deleted: the record of a correction is part of the
history. It is excluded from every count and every cell, and the count of withdrawn acts is printed.

### 2. Exposure is reconstructed backwards, because today's roster is not the window's stock

This is the decision that makes the numbers honest. A rate is `flows ÷ exposure`, and the exposure
denominator must be the **person-months actually stood at that level inside the window** — not today's
headcount multiplied by twelve.

Each person's dated moves are walked **backwards** from the reading day:

- an **exit** ends the walk for that day and proves the person held that rung *before* it, so the
  pre-exit period is counted and the post-exit period is not;
- a **hire** proves nothing earlier exists here, so the segment from the hire day is real and
  everything behind it is dropped;
- a **promotion/demotion** moves the cursor back to the origin rung and opens a segment at the
  destination rung;
- the oldest open segment runs from the window's first day, floored at the person's own start day.

An **archived** person holds no stock *today*, but the time they stood at a rung inside the window is
real exposure — dropping them would delete exactly the exits this model exists to measure. So the
population is printed as **two** figures, never collapsed: `rosterN` / `headcountTotal` (active stock,
the pyramid's own sum) and the exposure population (active **and** departed).

A history that does not connect — a move whose origin is not the rung the walk expects, a hire that
does not join, an exit behind a person the roster still lists as active — is a **`roster-contradiction`**:
counted, printed, and that person claims **no exposure at all**. The model refuses to guess which of
the two records is right. `exposureContradictionsN` is printed on the board.

### 3. A rate under a declared floor is withheld, never smoothed

`minExposureMonths` is a declared setting (default 12). A cell below it is **blank with its reason**,
in the read model, the panel and the CSV alike — never zero, never an average, never a prior. A cell
that clears the floor with zero events prints a **measured zero**, which is a different statement and
is printed as one. `rates.printedN + rates.withheldN === rates.cellsN` is a claim.

### 4. Four claims are printed apart and never collapse

`observed` (was anything recorded at all), `estimated` (do any rates clear the floor), `projected`
(did the projection run), `compared` (is there a declared intent to compare against). A workspace with
no acts is `window-empty`: the levels still print today's headcount — a fact about today — and every
rate is blank with `no-acts` on the row.

### 5. Integer projection, carried remainder, printed difference

The projection is a quarterly path: for each rung `promotedOut`, `attritionOut` and `hired-in` are
applied to the current stock, with the fractional part **carried** across steps rather than rounded
away. Every printed total is a whole number of people and `projectedTotal` is the sum of the printed
rows, with `roundingDifference` printed beside it (0 when the carry is exact). The path is a
consequence of the measured rates, never a recommendation.

### 6. The gap exists only where a human declared an intent

`workforceFlowTargets` holds declared shapes with a horizon. A target whose horizon has passed is
dropped with a warning rather than treated as a plan. `gap = target − projected` is printed **only on
declared levels**; an undeclared level has a `null` gap, never a zero. The gap is a **question**, and
the panel prints it as one. Nothing here scores, ranks or forecasts a named person, and no person, id,
name, manager or line appears in the CSV or the brief.

### 7. The matrix join — per declared line, by share, without double-counting

A person on two lines is **one** person in the pyramid. The per-line column is **share-weighted
headcount in integer hundredths**, read through the matrix engine's own `personAllocation` — the
resolution lives on the person's allocation, not on the line, and a split that was never fully
declared is attributed to **nobody** rather than filled in evenly.

A workspace where no person holds more than one line is **not** a matrix: the per-line reading is
`inert` and prints no rows, because home lines exist in every workspace and counting them would
restate the pyramid. `splitPeopleN` names the reason.

### 8. The rule, on the shared spine

`RULE-WFS-01` runs on the shared post-commit cross-module automation engine and raises at most three
bounded findings — `history-missing`, `target-missing`, `exposure-thin` — to the **single apex** above
every line, closing the ask it opened when the finding clears. It writes `workforceFlowMarkers` and
real delegations; it never issues work to a manager who is not named by the reporting graph.

## Consequences

- Schema v146 with two empty collections; a workspace that never records a move reads `window-empty`
  and loses nothing.
- The demo seeds 5 hires, 3 promotions and 3 exits **derived from each person's own start day and
  departure record**, so the ledger reconciles with the roster by construction and the reader reports
  0 contradictions. A throw guarantees the demo cannot ship a ledger that disagrees with the roster.
- Rates are estimable on the demo at four of six rungs; `lead` and `manager` are withheld on exposure.
- The remainder — declared-level correlation, demand-driven hiring from the forecast engine, per-level
  hire routing, cost per flow, promotion-queue back-pressure and a within-level seniority split — is
  **In Progress**, and is not claimed anywhere on the panel.
