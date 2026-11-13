# ADR-0186 — Cross-Line Change Saturation & Absorptive-Capacity Ledger

**Status:** Accepted — 2026-11-13 (Session 254)
**Schema:** v147 → v148 — three additive collections (`changeSaturationActs`, `changeSaturationCeilings`, `changeSaturationMarkers`), all empty on upgrade; `MIGRATIONS[147]` creates them and infers nothing
**Surface:** `#/matrix?panel=change-saturation` (33rd matrix panel) · CSV #140 `matrix-change-saturation` (one workspace row plus one row per person/pool verdict) · safe reads `changeSaturationReport` · actions `changeSaturationDeclareDemand` / `WithdrawDemand` / `DeclareCeiling` / `RetireCeiling` / `SetConventions` / `Scan` · rights `declare-change-demand`, `govern-change-saturation` · `RULE-CSA-01`
**Altitude / structure:** frontline, mid-manager, director, VP and CEO × matrix (single-chain fully served; the cross-line reading is inert until a second line declares on the same person). Lines declare, the joint apex of the line HOLDERS governs.

## Context

Three change programmes can each be individually reasonable and collectively land on the same person in the same fortnight, because in a matrix each line approves its own changes and no one sums them. The workspace already had a per-change impact record (`changes.impactRows`) and, since ADR-0185, a per-line review of each impact — but nothing that answers the question a manager actually asks: **who is over, on whose say-so, and over what declared limit?** Without a declared limit, "saturation" is a mood; without a dated declaration of *which line* said it, it is a rumour.

The obvious build — a load meter computed from the org chart — was rejected on doctrine grounds: a meter derived from hierarchy ratings would rate people, and the register would print as fact what only a line holder can state. The unit therefore had to be a declared ordinal weight, summed in day-units by a stated author, compared only against a stated ceiling.

## Decision

### 1. The unit is a declared weight-day, never a capability measure

`changeSaturationActs` rows carry `band ∈ 1…5` (one of five named bands, each with a written definition and an explicit `notSaid`), an inclusive `fromOn…toOn` day window, and the `lineKey` of the line that declared it. A person's load on a day is `max(band)` over that day's active demands, in **change-weight unit-days**: one change contributes one weight per day **no matter how many lines declared it**, because two lines describing the same impact are two accounts of one burden, not two burdens. Band values are ordinals used additively by convention; the register prints `peakPermille` and headroom in unit-days and never converts them into hours, ratings, or a throughput claim. A demand is authored by a line, is append-only, and is withdrawn by a dated counter-declaration — never edited or deleted, so the retraction is as auditable as the claim.

### 2. Lines declare; only the joint apex of the line HOLDERS is asked to govern

When a verdict comes out over a declared ceiling, `RULE-CSA-01` writes a marker and an ask. The ask is addressed to the **joint apex of the lines that declared the competing demands** — never to the affected person, who cannot rule on their own overload, and never to a single line holder, who cannot rule on a peer's demand. Ceilings follow the same split: a `person` ceiling is declared by a line that holds the person; a `pool` ceiling for a manager's span may be declared by that manager, including one who runs only declared matrix lines (`poolHasMembers`), because the burden of a project pool belongs to nobody else.

### 3. No comparison against undeclared capacity — and no averaging when lines disagree

A person with no live ceiling gets counts and `state: 'no-ceiling'`; every ceiling-relative cell is `null`, and `withheldReason` names the missing declaration. Two live ceilings that disagree produce `state: 'contested'`, and neither the min nor the max is chosen for the operator; both `ceilingIds` are printed so the conflict can be settled. When lines declare **different bands for the same change and person**, the register does not split the difference: the row is `contested`, `intensity-divergence` is the withheld reason, and the pair is listed as a candidate for the apex. An expired ceiling is history, not a licence — `allowPassedWindow` keeps it readable on load while the door refuses a ceiling born already expired.

### 4. A clearance is a statement about the record, never an approval

For every `change × person` pair the reader subtracts that change's demands and re-runs the arithmetic: `verdict ∈ clearable | refused | unavailable | notOpen`, with `peakWithUnits`, `peakWithoutUnits`, `excessUnits`, `firstOverDay` and `tipping` (this demand is the one that crossed). `clearable` means only "absorbable on the record": it does not permit the change, close it, or gate its implementation, and the brief prints that sentence. `RULE-CSA-01` never blocks anything; it files asks with `authority: 'act-inform'`.

### 5. Disclosure is a ladder applied in the read model, not in the view

The seat's `detailLevel` decides what the board returns: `full` above the register's rank floor, `span` below it (figures and counts with every identity — name, person id, counterpart manager, ceiling subject — replaced by a printed `withheld at this disclosure level`), `none` when the seat holds no span (totals only, and **no rows at all**, because a withheld row must not masquerade as an empty workspace). `detailReason` is returned with the board. Pool rows lose their membership list at `span`. A percentage over a handful of people is withheld below the declared `changeSaturationMinPoolN` floor (`saturatedPctWithheld` + reason), and `figuresComplete` is reported apart from `countsReconcile` so a withheld cell is never mistaken for an arithmetic error.

### 6. Reads are the same numbers the CSV prints, and the CSV carries the parts

`changeSaturationCsvRows` prints one workspace row (39 columns: every total, every state and verdict count, peak, over-days, longest run, withheld rows, the three claims and the engine version) plus one row per person/pool verdict. The sixth act partition, `acts_before_window_n`, is in the export on purpose: without it a reader cannot add the parts back to `acts_total_n`, which is the only claim `counts_reconcile` makes.

## Alternatives considered

- **Derive load from `changes` impact rows alone:** rejected. An impact row says a person was named; it does not say which line said so, when the burden starts and stops, or how heavy the author thinks it is. The ledger records the *declaration*, and the derivation only aggregates declarations.
- **Compute an intensity score from the person's level, ratings or delivery history:** rejected as a person rating. Bands are declared by the line that owns the change and are auditable as an opinion.
- **Auto-defer, auto-rebalance or refuse the change when someone is saturated:** rejected. Automation files asks and marks; it does not cancel anybody's change. A rule that halts work would need a consent model this slice does not have.
- **Sum all lines' bands for the same change:** rejected — it would double-count one burden and reward a second line for describing it. The max-per-change rule and the divergence state are the fix.
- **Silently drop rows the seat may not read:** rejected. A deleted row reads as "no load", which is the opposite of the truth; a redacted row says it was redacted.

## Consequences

- Existing workspaces migrate additively to v148 with three empty ledgers; nothing is back-filled, so a workspace's first read is honestly empty (`empty: true`, all claims `false`) rather than inferred.
- The ledgers are bounded — 4,000 acts, 400 ceilings, 600 markers, a 730-day cap on a single demand's window, `scanDays: 400`, and 120/60/120 report rows — with overflow counted and printed as truncation rather than hidden.
- Every figure is computed on integer epoch-days and integer bands, so a reload, a CSV and a re-run of the same state agree byte for byte; no float, no timezone-local date appears in the output.
- The engine version (`change-saturation-2026.11-v1`) is printed on the board and in the export, so a register change is visible in an old CSV rather than silently reinterpretating it.
- `app/core/demo.js` seeds nothing for this module and no settings card was added: the six conventions are declared through `changeSaturationSetConventions` and validated by the same door the settings would have used. Deliberate, not unfinished.
- A follow-up that wants enforcement (deferral, re-sequencing, a release gate) must define its own authority and may not reinterpret `clearable` as permission.

## Verification

`node --test tests/app/change-saturation.test.mjs` — **34/34 PASS** (one focused pass; results, not snapshots: the fixture arithmetic is hand-computed in the test and asserted). Coverage as the test titles read: registration (v148 · 33rd matrix panel · CSV #140 · `RULE-CSA-01` · exactly one safe read); the reader may only raise a reason the registry declares; one impact charged once however many lines declared it, two changes summed; disagreeing lines → `contested`, never an average; an expired ceiling is history, not compliance; a pool ceiling never borrowed as an individual limit; pools measured on their own declarations; a pool below the disclosure floor prints counts and no concurrency figure; absorbed / halted / before-window / unattributable counted apart; a demand whose line has ended is unattributable — history kept, day uncharged, nobody substituted; a single-chain workspace reads the person ledger in full and claims nothing cross-line.

Both doors are tested on their real refusal keys — demands: `unknown-band`, `missing-person`, `impact-not-recorded`, `unknown-line`, `line-not-active`, `duplicate-line-demand`, `window-too-long`, `reversed-window`, `missing-change`, `ledger-full`; ceilings: `band-not-whole`, `band-out-of-range`, `unknown-scope`, `missing-subject`, `overlapping-ceiling`, `window-passed` (with `allowPassedWindow` keeping an aged ceiling readable on load) — plus the read-side `window-outside-read` and the unresolved-seat refusal, and the convention setter refusing an out-of-bounds value instead of clamping it.

The remaining tests pin what a reader can be burned by: displayed == stored field-for-field after a real action through the store; a withdrawal marking the row and moving only what it should; the CSV carrying exactly the reader's figures (39 columns, no identity) and the export being the panel's own rows from one reader; `RULE-CSA-01` raising one dated ask per finding at the apex of the line HOLDERS and never the affected person, idempotent per finding, self-closing (`Closed by RULE-CSA-01:`), inert on an empty roster, honouring the automation switch, silent on unrelated events, and reaching the seat end to end; an ambiguous apex observed and counted rather than substituted; a manager able to declare down a line they hold and refused for a counterpart's; the rank-2 disclosure ladder; the 147 → 148 migration adding three EMPTY collections; settings surviving a reload; and the panel printing the read model's own figures with the real diagram, plus refusing to render a board the seat cannot read.

Full-suite, `check:boundary`, `lint`, `check:links`, `typecheck` and `verify:standalone` outcomes are recorded in the Session 254 entry of `AI-SESSION-LOG.md`.

## Asset

`app/assets/change-saturation.jpg` (68,418 bytes, 1856×576) is a generated conceptual method diagram — three lines converging on one person, weight chips, a day bar against a dashed ceiling line, one day marked `over ceiling` and one hatched `no ceiling declared`. It is labelled in-panel as conceptual and carries no workspace data. Its bytes are embedded in the standalone artifact, whose diagram list is now **derived from `app/assets/`** instead of hardcoded: the old list had silently dropped `workforce-stock-flow.jpg` (ADR-0184), shipping a broken image in every offline file since.
