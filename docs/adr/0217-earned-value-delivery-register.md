# ADR-0217: The Earned-Value Delivery & Estimate-at-Completion Register — where the money actually went, and whether the work is arriving with it

- **Status:** accepted
- **Date:** 2026-11-15
- **Deciders:** Director and VP altitude — the programme and portfolio reader (the altitude whose delivery this register measures)
- **Schema:** v170 → v171 (five additive, EMPTY-at-upgrade collections; three conventions)
- **Surface:** `#/finance?panel=earned-value` (Cases / Line attribution / Method), CSV scope #159 (`earned-value-delivery`)
- **Code:** `app/core/domain/earnedValueRegistry.js`, `earnedValueSchema.js`, `earnedValueMath.js`, `earnedValue.js`, `earnedValueRules.js`, `earnedValueActions.js`, `app/views/earnedValuePanel.js`

## Context

The workspace could answer what may be spent (ADR-0103 budget envelopes), what spending is promised to return (ADR-0208 investment cases), which cases fit a ceiling (ADR-0211), why cost differs from budget (ADR-0213), what the owners' claim did between readings (ADR-0214) and what a deal promised and whether it was verified (ADR-0216). It could **not** answer the question a programme board asks every steering day, at the altitude where programme delivery is actually run:

> **Is this programme arriving against the curve its budget implies — and if not, is that a fact about progress, or a fact about efficiency?**

That is earned value: PV, EV, AC — then CV, SV, CPI, SPI, TCPI, and estimates at completion. It is the one instrument that refuses to let spend masquerade as progress, at the altitude (director/VP) whose programmes this measures.

## Decision

### 1. The register holds plans and evidence — nothing is inferred from them

Five ledgers: `earnedValueCases` (one accountable owner, one currency, one declared measure — 0/100, halves, or declared whole-percent), `earnedValuePackages` (budget in whole cents; dated increments of planned value that must **re-add to the budget to the cent**; optional line shares summing to **exactly 100**), `earnedValueReadings` (dated cut-off; one share per live package; **refused whole** when any live package is unnamed, naming the missing packages), `earnedValueActuals` (dated; unallocated carried as its own printed bucket, never dropped), `earnedValueMarkers` (identity-free observations).

It **does not** infer progress from spend, book an invoice as a completion, convert or pool a currency, value benefits (that is the investment case), re-baseline silently, or rate a person.

### 2. The two facts are never collapsed

`reconciles` — the printed identities re-add: Σ package EVs = case EV; allocated + unallocated = AC; line rows re-add to the case to the cent (largest-remainder apportionment). `figuresComplete` — every open case reads complete against the **current** baseline: a live baseline, a live reading, every live package named, signature matching. Money totals for a currency are printed **only** when every open case in that currency is complete; otherwise the cell is withheld with the reason, never zero.

### 3. Baselines are controlled artefacts

Changing a baseline is a dated, reasoned, append-only act: a package is superseded, never edited in place. A reading freezes the signature of the baseline it was cut against; a re-baseline turns that reading into `baseline-moved` (the root cause) — figures re-derive against the CURRENT plan and say so, never silently re-phase. Line attribution prints **only** when every live package declares a split summing to exactly 100; anything else prints NOTHING per line and is counted.

### 4. Three EACs, each refused separately — none is "the" answer

EAC at plan (AC + remaining at the budgeted rate), EAC at CPI (BAC ÷ CPI), EAC at CPI×SPI (AC + remaining·AC·PV/EV²). Each is refused with its own reason at zero denominators (EV = 0, PV = 0). TCPI is withheld once the budget is spent (BAC − AC ≤ 0).

### 5. RULE-EVL-01 files the ask, the panel prints the state — never a verdict

`reading-owed` (newest reading, or declaration when none, older than the staleness window) and `cost-overrun` (complete reading under the declared CPI floor) each file ONE opaque `act-inform` delegation to the case's OWNER — never a manager, never a verifier, naming no case, no amount, no date — idempotent per `ev1:` signature, self-closing when the condition clears, bounded at 4 per commit with the remainder counted as `deferred`, pause-governed by `earnedValueAutoPropagate` on every path including scans. A case whose owner has left the roster writes one identity-free `earnedValueMarkers` observation and asks nobody. The navigation badge counts exactly what the rule would ask.

### 6. Display = computation, and the export carries no identity

Every money cell prints the reader's exact integer in `data-cents`; the panel computes nothing. CSV scope #159 exports one summary row per currency — counts, totals, the two identities — with no case name, no package code, no person id, no evidence note; a refused figure exports BLANK with its reason, never a zero.

## Consequences

- Schema **v171** (`earnedValueCases/Packages/Readings/Actuals/Markers`), CSV **#159**, rule **RULE-EVL-01** (134th on the shared spine), `SCHEMA_VERSION` 170→171. Migration adds EMPTY ledgers and infers nothing.
- Seat floor: `read-earned-value`/`declare-earned-value`/`record-earned-value` at rank 3 (director), `govern-earned-value` at rank 4; the record class is portfolio (`detailCeiling` 4). Per-line reporting never attributes the unallocated bucket.
- The matrix is honoured structurally: line shares name declared lines; attribution is published only when fully declared; the unattributed remainder is printed, never spread.

## Provenance

- Method foundations: PMI *PMBOK Guide* 7th ed. / *Practice Standard for EVM* (PV/EV/AC/CPI/SPI); Fleming & Koppelman (indices); Lipke (2003) and PMI (EAC assumptions); COSO 2013 control activities + ISO 21502 (controlled baselines); Galbraith (1971) / Bartlett & Ghoshal (1990) (matrix second lines); Kahneman & Tversky / Flyvbjerg (planning fallacy — the original baseline stays visible); Sweeney (2002) cell suppression (withheld ≠ zero).
- Benchmark: the category leaders (Procore, Primavera P6 EVM, EVMS-lite in Planview, Wrike) compute these figures but either accept free interpolated curves at write time, or pool them without refusal semantics. This register is deliberately stricter: exact integer re-addition, named-share refusals, per-currency withholding, and no stored derived figure anywhere. Seats are workflow declarations, not an authentication boundary.
- Figure produced for the Method tab: `app/assets/earned-value-method.jpg` — generated for this register (built-in image generator; Higgsfield unsupported — see delivery notes). Diagram of the method, not of data.

## Alternatives rejected

- **Default S-curve at write time** — a smooth curve would manufacture PV for packages with no declared increments. Refused.
- **Estimating an un-split line's share** — a fabricated allocation wearing a chart. Refused; line money prints only when fully declared.
- **Pooled multi-currency totals** — requires an exchange rate nobody declared. Refused; per-currency printing only.
- **Storing CPI/SPI/EAC as columns** — a hand-edited file could carry a delivery position its own rows do not imply. Every figure is re-derived on read.
