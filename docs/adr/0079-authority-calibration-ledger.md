# ADR-0079: Authority Calibration Ledger — which spans hold which rights, graded by outcomes

**Date:** 2026-11-03 · **Status:** implemented · **Schema:** v85 · **Surface:** `#/authority-calibration` · **Session:** 119 · **Built on:** [0078](./0078-decision-rights-exchange.md) (mandate lifecycle, terminal statuses, action rights), [0076](./0076-operating-seat.md) (acting seat, disclosure ladder, vertical roll-up), [0075](./0075-command-chain.md) (reporting tree, five altitudes), [0008](./0008-post-commit-rules-hook.md) / [0026](./0026-propagation-ledger.md) (shared transactional spine)

---

## 1. Context — the gap the audit found

Session 118 shipped the Decision Rights Exchange: bounded authority contracts with explicit acceptance, delivery, verification, return and revocation. A contract that reaches a terminal state (`completed`, `returned`, `expired`, `revoked`) is one observed answer to the question *did this authority hold?* But nothing graded those answers over time, by kind of right or by level of the organisation. The workspace could not say:

- How often does spending authority at frontline actually land, vs at director?
- Is the workspace's expectation of authority calibrated to its results — or does it systematically over-estimate what a span can hold?
- Which cells (action class × altitude) are below the reliability floor and need a governed decision above?

Vendor benchmarks (RESEARCH §101: Workday, ServiceNow, Copilot Studio, Aera, Cloverpop, Visier, Lattice, Culture Amp) rate *people* or track *decision flows*; none grades whether the authority a span was given actually held, by kind of right and altitude, without rating persons. That gap is what this ADR fills.

---

## 2. Decision

Add one engine module (`authorityCalibration.js`), two rule modules (`authorityCalibrationRules.js`, `authorityCalibrationRegistry.js`), one schema module (`authorityCalibrationSchema.js`), one view (`views/authorityCalibration.js`), one CSV scope (#74), one API action (`calibrationScan`), and wiring across `schema.js`, `postCommit.js`, `csv.js`, `main.js` and `actions.js`.

### 2.1 The statistical model (engine)

Every terminal mandate is one Bernoulli trial:

| Status | Held? | Meaning |
|--------|-------|---------|
| `completed` | yes | Receiver delivered; sender verified against the original outcome |
| `returned` | no | Receiver handed authority back |
| `expired` | no | Expiry passed without a verified outcome |
| `revoked` | no | Sender withdrew authority before delivery |

Trials group by **(action class × receiver altitude key)**, never by person. Each trial is graded against the cell's hold rate from **strictly-prior terminals** — an out-of-sample sequential forecast, never a declared probability. Figures are re-derived on read from terminal mandates; nothing is stored as a frozen claim, nothing is back-filled.

Per cell: hold rate, Wilson (1927) 95% interval, Brier score vs the cell's own hold rate as reference, Brier skill vs always-forecasting the base rate, counts and refused-below-floor verdict (n<5). Per altitude: pooled reading, Fréchet lower bound (assumption-free) beside the independence reference `1 − Π(1 − pᵢ)` (printed, never substituted). Per workspace: overall hold rate and pooled Brier.

### 2.2 Rules (shared post-commit spine)

**RULE-ACL-01 (floor breach):** When a cell holds below the reliability floor and has reached the evidence floor, open ONE governed DACI decision per cell per ISO week — marker-idempotent, never auto-applied — asking the leadership span what to do about rights it is not reliably holding. The rule writes `rolls-up-to` edges from each breaching mandate to **every** leadership ancestor of the receiver seat, so a frontline return reaches the manager, director, VP and chief spans in the SAME transaction in which the mandate closed — cross-altitude roll-up integrated with cross-module propagation as one architecture, no re-entry, no second system.

**RULE-ACL-02 (advisory maturity):** When a cell reaches the evidence floor for the first time, write ONE audit marker per cell. Calibration is advisory: no setting is touched, no contract is changed, nothing is decided on anyone's behalf.

Both rules are pausable via `authorityCalibrationAutoPropagate`; an explicit `calibration.scan` always runs. They register after `mandateRule` so terminal mandates are final before grading.

### 2.3 Surface

`#/authority-calibration` (nav **Authority calibration**; icon ⚖; aliases `authority-calibration`, `calibration`) with five panels:

- **Overview** — stat grid (terminal contracts, authority held, overall hold rate, pooled Brier, cells below floor, cells refused) + cells table (click a cell to see its terminal contracts).
- **By altitude** — pooled hold rate per receiver altitude, with Fréchet lower bound and independence reference.
- **Signals** — finding cards: cells below floor, cells maturing toward the floor, cells where the forecast under-performs the base rate, no terminal contracts yet.
- **Settings** — trials-per-cell floor, hold-rate floor %, automatic propagation toggle.
- **Brief** — identity-free brief (safe to paste upward or into a board pack) + download.

---

## 3. Conventions honoured

- **No person rated or ranked.** Every figure is a span and an action class. The subject of every finding is a cell, never an individual.
- **Advisory, never auto-applied.** Rules open decisions and markers; they never change a contract, a setting, or a seat.
- **Counts-only below floor.** Below n=5 trials, counts are shown and the rate is refused — never a decimal invented from a cell of one.
- **Re-derived on read.** No stored calibration figure can drift from the record it describes.
- **One transaction.** Breach decisions, `rolls-up-to` edges and markers are written inside the same store transaction as the triggering mandate transition.

---

## 4. Honest limits

- Local seat selection remains a **workflow declaration, not authentication**. No tenant isolation, cryptographic identity, server-side authorization, external notification or autonomous spending.
- Capacity evidence depends on the existing measured load model; spans with no quantified baseline are `unknown`.
- The full app was not semantically audited line by line; untested surfaces are `[UNVERIFIED]`.
