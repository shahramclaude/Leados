# ADR-0213: Flexible-Budget Variance Statement — more work, a different price, or different usage

Date: 2026-11-15 · Session 286 · Schema v167 (additive: `flexBudgetPlans`, `flexBudgetActuals`, plus one convention) · Status: Accepted

## Context

The finance surface answers three questions. The envelope ledger (ADR-0056,
`finance.js`) answers *"will this envelope breach?"* before the fact, by
commitment accounting. The investment-case register (ADR-0208) answers *"did the
promise we funded come true?"*. Capital rationing (ADR-0211) answers *"which
combination do we fund?"*.

None of them answers the question a director is actually asked on the fourth
working day of every month: **"Cost is 134,000 over budget — why, and whose is
it?"** That one number is three different facts. More work was done than
planned. The price of an input moved. More input was used per unit of work than
the standard allows. They have three different owners: the seat that set the
volume, the line that sets the rate, and the manager who directs the work. In a
matrix the last two are routinely different people in different reporting lines —
a function lends its senior engineers at its rate, and a delivery manager decides
how many of their hours a ticket consumes.

A targeted search of `app/` and `ROADMAP.md` for `flexible budget`, `price
variance`, `volume variance`, `mix variance`, `yield variance` and `budget
variance` found no implementation and no logged gap. Absence in every tool this
workspace might sit beside is **[UNVERIFIED]**.

### The stance this ADR has to answer

`finance.js` says in its own header that post-period variance analysis is
"archaeology, not control", and that an underspend is never scored as a failure.
Both remain true and this ADR does not reverse either:

- **Control stays where it is.** The envelope ledger still raises a forecast
  breach before the money is spent. This statement moves no money, edits no
  envelope, posts no charge and opens no trade-off. It is not a second control
  loop racing the first.
- **A variance is not a verdict.** Nothing here calls a favourable variance good
  or an unfavourable one bad, and nothing rates a person. A favourable
  efficiency variance can be skipped work; an unfavourable price variance can be
  a deliberate trade.
- **What archaeology is for.** The objection to variance reporting is that a
  static budget compared with actual cost confounds how much work was done with
  how well it was done, and then hands the confusion to one name. The remedy is
  not to stop asking why; it is to ask it correctly — restate the standard for
  the work actually done, divide the remainder by cause, and put each part in
  front of the person who was *declared* to answer for it, or say that nobody
  was. That is what the next standard is negotiated from.

## Decision

A **flexible-budget variance statement** is derived, on every read, from two
declared ledgers and nothing else.

1. **A declared standard** (`flexBudgetPlans`): one cost object, one period, one
   currency, one activity driver with its planned volume; per variable input a
   budgeted quantity and a standard price; per fixed input a lump; a materiality
   threshold (an absolute floor *and* a share, both of which must be reached);
   a written basis. It is declared by a seat **above** the budget holder — the
   holder sits in the seat's reporting tree or on a reporting line declared to
   it — and never by the holder: a standard set by the person it measures is a
   target they chose (Merchant 1985; Jensen 2003).
2. **Dated actuals** (`flexBudgetActuals`): the cut-off day, the activity
   actually done, and for **every** plan line the quantity consumed and the cost
   recorded, with the source in writing. A partial recording is refused — a line
   nobody entered would print as a favourable variance nobody earned. A cut-off
   after today is refused. A later recording supersedes an earlier one; a
   withdrawn recording stays on the ledger.

From those, an exact kernel (`flexBudgetMath.js`, rationals over `BigInt`)
computes:

| Step | Formula |
| --- | --- |
| Flexible budget | budgeted quantity × actual volume ÷ planned volume × standard price; lumps do not flex |
| Activity variance | flexible budget − static budget |
| Price (pure) | (actual price − standard price) × standard quantity allowed |
| Joint | (actual price − standard price) × (actual quantity − standard quantity allowed) |
| Efficiency | (actual quantity − standard quantity allowed) × standard price |
| Mix / yield | for substitutable inputs declared as one pool in one unit: efficiency = mix + yield |
| Fixed spending | actual − lump |
| Unplanned | cost recorded with no plan line, whole |

**Static budget + activity = flexible budget; flexible budget + price + joint +
efficiency + fixed spending + unplanned = actual.** Both identities are re-added
from the printed whole cents on every read.

### Five decisions that are the point

- **The joint term is printed apart.** The conventional price variance is taken
  on the *actual* quantity, which bills the rate-setter for units somebody else
  consumed. Here price is taken on the standard quantity allowed, and the cross
  term ΔP × ΔQ is its own line. Conventional price = pure price + joint, checked.
- **Ownership is declared, never inferred.** The standard may name who agreed
  the prices, who directs the usage and who set the volume, per plan and per
  line. A role nobody named is printed as **undeclared**. Nothing is read from
  the reporting graph to guess an owner and nothing defaults to the budget
  holder (who answers only for unplanned cost).
- **In a matrix the joint term is shared.** Where the rate and the usage of a
  line answer to two different people, the joint term goes to a row shared
  between the two by name and is added to neither. A declaring seat may name as
  an owner only a person it itself holds (tree or declared line) or itself — one
  line never attributes a variance to a peer line's manager; that rate stays
  undeclared until the seat above both declares it. A cost object is counted
  once however many reporting lines reach its budget holder, and a person named
  as an owner may read the statement that names them.
- **An interim reading withholds what it cannot support.** A cut-off before the
  period ends prints the flexible-budget variances of the variable lines, which
  are valid at any cut-off because the standard is restated for the work done.
  It withholds the activity variance, the static-budget variance and every
  fixed-cost variance: those compare with full-period figures and no phasing was
  declared. Only final statements enter a currency roll-up.
- **Two integrity claims, never merged.** *The printed figures add up* is
  established by re-adding the printed integers. *The printed figures are the
  computed figures* is a count: how many derived cells are exact whole cents and
  how many are exact rationals shown to the cent. A flexible budget is a ratio
  of two volumes and is generally not a whole cent. Printed cents are apportioned
  by largest remainder (Hamilton) inside each identity so that every row adds and
  no printed cell is a whole cent from its exact value. Materiality is tested on
  the exact figure, so a rounded cent cannot flip a verdict.

### What it never does

It never infers a standard from an envelope, a rate from the transfer-price
ledger or an actual from a posted period — each is a different instrument with a
different signatory, and the 166 → 167 migration adds two EMPTY ledgers. It never
pools currencies and converts nothing. It never prints a variance for a standard
with no recording (blank in the export, never zero). It never stores a derived
figure. It never rates a person.

## Surfaces

- `#/finance?panel=variance` — fifth panel of Finance: Statements (summary
  counts, per-statement bridge, a diverging cause chart with a text alternative
  and a data table, commentary quoted from the printed cents, line table, pools,
  declared ownership, the two integrity claims), Who answers for what (per
  currency roll-up of final statements), Method.
- Commands: `flexBudgetReport`, `flexBudgetBriefText`, `flexBudgetCsvRows`,
  `flexBudgetAttentionCount`, `flexBudgetCandidates` (reads);
  `flexBudgetDeclarePlan`, `flexBudgetRetirePlan`, `flexBudgetRecordActuals`,
  `flexBudgetWithdrawActuals`, `flexBudgetSetConventions`.
- Rights: `read-flex-budget` (1–5), `declare-flex-budget-plan` (3–5, and the
  action refuses the holder and any seat that does not hold them),
  `record-flex-budget-actuals` (1–5, and the action admits only the holder or a
  seat that holds them), `govern-flex-budget` (4–5).
- CSV scope #155 `flex-budget-variance-statements`: identity-free; statements
  and lines under positional codes; ownership only as declared / undeclared /
  shared; withheld figures BLANK with a reason key.
- Finance navigation badge: statements a seat may record against whose FINAL
  actuals are past the declared due window (default 15 days, bounds 1–90).
- Generated method illustration `app/assets/flex-budget-variance-bridge.jpg`.

## Consequences

- No rule was added to the shared spine (it stays at 131). Overdue final actuals
  are a count on the Finance badge, not a signed ask routed to a person. A
  pause-governed ask rule is the declared remainder of this slice.
- A standard is typed in a small line grammar. There is no import from a ledger
  system and no phased (monthly) static budget; an interim activity variance
  therefore stays withheld by design until phasing can be declared.
- Sales-side variances (sales price, sales volume, sales mix, market size and
  share) are out of scope: this is a cost statement.
- One currency per statement and no FX, like every other finance instrument here.

## Verification

`tests/app/flex-budget.test.mjs`: the kernel against an independent oracle
written from the textbook definitions (a hand-worked case to the cent, and 250
randomised problems with every identity re-added and every printed cell within a
cent of exact); refusals; typed-versus-stored values and reload identity;
governance and matrix reach through the guarded API; attribution re-adding;
interim withholding; the badge; every printed cell equal to the reader's integer
and the CSV equal to the same integer; registration and migration.

## Benchmark

Specialised AI FP&A tools (Datarails FinanceOS / FP&A Genius, Pigment Analyst
Agent, Planful) set the bar for variance work at: automated budget-versus-actual
decomposition, drafted commentary, exception-first review and a drill to the
source record. This statement matches the decomposition and exception-first
review deterministically, drafts its commentary from the printed cents only, and
adds three things those descriptions do not claim: the joint term kept apart,
ownership by declaration with matrix sharing, and the two integrity claims. It
does **not** drill to a transaction — actuals are typed with a written source,
not ingested. None of those tools was run hands-on this session:
**[BENCHMARK-UNVERIFIED]**.
