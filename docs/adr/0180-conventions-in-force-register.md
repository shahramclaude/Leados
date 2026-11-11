# ADR-0180 — Declared conventions survive a reload; the Conventions-in-Force Register

**Status:** Accepted — 2026-11-11 (Session 246). Wired: the settings loader, the load path's warning channel, and a card on Settings & data.  
**Schema:** v143, unchanged (no new collection, no migration)  
**Surface:** `#/settings` → "Conventions in force" · load warning prefix `Settings:`

## Context

Every engine runs on declared conventions held in one `settings` object: floors, windows, tolerances, and one off-switch per automatic rule family. `normalizeSettings` rebuilds that object **field by field** on every load, import and restore. A key an engine declares but the loader does not name is discarded, and the load says nothing. Eight comments in `schema.js` described this hazard; nothing enforced it.

ADR-0179 logged one instance (the three matrix conventions). Measured on `9f2fe50`, the hole was six engines and **30 keys**:

| Engine | Keys | Reachable setter |
|---|---|---|
| Matrix accountability ledger | 3 (`matrixBalanceHundredths`, `matrixExpiringDays`, `matrixAutoPropagate`) | `matrixSetConventions` |
| Disclosure differencing | 5 (`differencesCellFloor`, …, `differencesAutoProtect`, `differencesAutoPropagate`) | `differencesSetConventions` |
| Decision fit | 13 (`fit*`) | `fitSetConventions` |
| Delegation lines | 3 (`delegationLine*`) | none |
| Structure history | 1 (`structureHistoryReviewDays`) | none |
| Leader calibration | 5 (`lcal*`) | none |

Consequence for a leader: a paused matrix fan-out came back **on** after a reload, and a disclosure cell floor raised to 7 fell back to 3 — while the page had shown the declared value until the reload. This is a control failure, not a display glitch.

## Decision

1. **Carry them, using each engine's own normalizer.** The six normalizers are spread into `normalizeSettings`. Bounds stay declared once, in the owning module; the loaded value is exactly the value the engine reads. Leader calibration had no stored-shape normalizer, so `normalizeLeaderCalibrationSettings` re-keys its existing reader (`lcalConventionsFromSettings`) and adds no second set of bounds.
2. **A guard, so the hole cannot reopen.** `tests/app/convention-persistence.test.mjs` imports every exported `normalize*Settings` under `app/core/domain` and fails if any key it returns is not carried by the loader.
3. **A load receipt instead of silence.** `normalizeState` sorts every stored settings key into one of three piles that add to the stored count: *carried*, *retired*, *not loaded*. A key that is not loaded is **named** in a load warning (sanitised, at most 12 names, then "and N more"). The warning travels the store's existing `warnings` channel, so Today's "Saved data needed repair" banner shows it. A stored settings block that is not an object is also announced.
4. **Retired keys.** The v93 → v94 migration writes `omLabourRatePerHour`, `omCurrency` and `escalationSaturationPct`; no version has carried them. Stored at exactly the migration default they are counted and not announced, so an upgrade produces no warning. Stored at any other value they are named.
5. **The register** (`buildConventionRegister`, pure, stores nothing). For every carried convention: its kind, the value a new workspace starts with, and the value in force. It prints the count that differ, the automation switches that are off, and a reload check split into its two separate claims — *no key would be dropped* and *no value would be changed*.
   - "Default" is the loader applied to a new workspace's settings. It is computed, not a second table.
   - A switch is a yes/no convention whose key ends in `Auto<Word>`; the census is derived from the settings, so a new engine's switch appears without an edit here.
   - Numbers and yes/no values are printed as their stored JSON text. A **text value and the inside of a structured value are never printed** (they can hold a name, a seat id or a cost); only the kind, whether it is set and whether it differs.
6. **Known limits are printed beside the census**, each pinned to the source by test: one switch that is carried but read by nothing (`portfolioAutoPropagate`), two that a rule reads but the loader cannot store (`fidelityAutoPropagate`, `priorityAutoPropagate` — those rules cannot be paused), and two conventions with two different defaults (`epistemicBlindFloor`, `solvencyAlarmPct`).

## Matrix and roll-up

Conventions are workspace-wide; there is no per-seat copy to fan out, and none was invented. The matrix consequence is direct: `matrixAutoPropagate` gates RULE-MTX-01, which rolls a shared person's work up to **every** manager in their reporting set. The suite proves, under the real store, that a write in an un-paused workspace reaches both the home and the project manager, and that after a pause and a reload the same write reaches neither — the pause held.

## Verification

`node --test tests/app/convention-persistence.test.mjs` — 9 tests. With the six spreads removed (the defect restored) 8 of the 9 fail. The stored bytes, a fresh store over the same storage, the register and the rendered Settings card are compared value for value.

## Limits

- The register reads a switch; it does not prove what the switch gates.
- It does not say who changed a value or when. The event log holds a `settings.updated` line naming the keys, and is capped at 600 events.
- A workspace that paused one of the three reachable switches, reloaded, and has not saved since, will find the pause **restored** by this change: the stored file still holds it. That is the last declared act being honoured; the register lists it under "switched off".
- Not fixed here, logged in `ROADMAP.md`: the three switch defects above; the two-default conventions; conventions an upgraded workspace holds at a migration's value rather than a new workspace's (`escalationWindowDays`, `escalationYieldFloorPct`, `epistemicBlindFloor`, `solvencyAlarmPct`); `updateSettings` accepting a key the loader does not carry.
- No CSV scope and no owner, reason or expiry on a paused switch — see the Planned "automation pause permit".
