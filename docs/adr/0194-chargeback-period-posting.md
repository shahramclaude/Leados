# ADR-0194 — Chargeback period posting & budget-envelope binding

Date: 2026-11-13 · Session 262 · Schema v154 · Status: accepted, shipped end to end

## Duty and scope

CEO / C-suite primary (the joint apex of the statement's lines is the one seat
accountable for both sides of every internal charge), director / VP as the
posting seats, matrix-first; a single-chain workspace reads `inert` with the
reason printed. ADR-0177 built the Cross-Line Labour Chargeback & Internal
Transfer-Price Ledger: a whole-workspace statement for the last completed
quarter, exact integer cents, zero-sum per currency, refused — not estimated —
while any share-day lacks a two-key price. But the statement was only ever a
**reading**: a voided price, a retro retune or a roster repair silently
restated last quarter's figures, and nothing in the record said which figures
leadership actually accepted, when, or against whose budget authority. The
"Posting" step ADR-0177 explicitly deferred is this ADR.

Frameworks: SAP CO period-end discipline (a closed period is corrected by a
dated reversal posted later, never by editing the closed posting; period locks;
allocations re-runnable but auditable), responsibility accounting (a line's
charge stands against ITS OWN budget authority, never a neighbour's), and the
repo's standing refusal doctrine (an incomplete figure is refused whole, never
substituted at plan rates). LeadOS exceeds the SAP bar on three points, natively:
the posting is a HUMAN act only (no automatic allocation run exists to misfire),
an incomplete statement is refused outright rather than posted provisionally,
and nothing is ever currency-converted or averaged.

## Record and authority

- `chargebackPostings`: append-only dated acts, two kinds. `post` freezes one
  (period, currency) slice of the whole-workspace statement — per-line-account
  integer `chargedCents`/`creditedCents` rows, workspace totals, the claims that
  held at posting time, the statement engine version, and one envelope binding
  per row: either a budget the line account OWNS in the SAME currency with
  `active` status, or an explicit `noEnvelopeReason` (an absence is recorded,
  never implied). `reverse` names a posting and a written reason; the reversed
  posting stays on the record forever.
- `chargebackPostingMarkers`: RULE-CBP-01's bounded identity-free ledger
  (`ask|…` / `obs|…` keys), capped oldest-first.
- Settings `chargebackPostingAskDueDays` (10, bounds 1–30, refused never
  clamped) and `chargebackPostingAutoPropagate` (true), carried by their own
  normalizer in both `DEFAULT_SETTINGS` and `normalizeSettings`.
- Authority: `post-chargeback` (rank 4–5 — director and above, plus the
  operator view) posts and reverses; `govern-transfer-prices` (rank 3+) scans
  and sets conventions; `chargebackPostingReport` is a SAFE_READ. Both new
  collections are unit-class records with `detailCeiling` 0.

## Refusals (the heart of it)

A `post` is refused whole — with the exact failing claim printed — unless the
operator-view statement for that period holds EVERY claim: complete, zero-sum,
share-day partition reconciles, period-ledger identity, exact-integer
arithmetic. A currency with no charged cent is refused. A second live posting
for the same (period, currency) is refused: a closed period is corrected by a
dated reversal, never posted over. Every line account on the statement must be
bound — to its own active same-currency envelope or to a written no-envelope
reason — and the rows must reproduce the workspace totals as integer equality
or nothing is written. No budget figure is ever written: the posted position is
printed BESIDE the envelope, labelled.

## Read model and audit

`buildChargebackPostingLedger` re-derives every live posting's period statement
TODAY and prints the verdict: `faithful` (the record still reproduces every
posted cent), `drifted` (exact per-account, per-field cent deltas, bounded),
`statement-regressed` (the period no longer reads complete — the missing prices
are RULE-TPL-01's asks), or `window-unreadable`. Bindings are re-checked
against the live budget record and decay is REPORTED, never re-pointed:
`envelope-missing`, `owner-changed`, `currency-changed`, `envelope-inactive`.
Seat scope withholds rows outside the seat; counts stay whole-workspace.

## RULE-CBP-01 (spine #123, after RULE-TPL-01)

Triggers: transfer-price confirm/retire, posting post/reverse, explicit
`chargeback.posting.scan`. O(1) inert with no price act. For each currency of
the last completed quarter whose claims ALL hold, that carries a charged cent
and has no live posting, it keeps ONE open dated ask per (quarter, currency)
per posting generation (a reversal opens a new generation) with the LOWEST
JOINT APEX of the statement's line accounts; an ambiguous apex, the workspace
leader or an off-roster apex is an identity-free observation. Asks close
themselves with the actual reason (posted / statement regressed / no charge /
apex moved); older quarters are re-read against their own window, bounded at 4
per commit; 4 asks per commit with the remainder counted. Pausable via
`chargebackPostingAutoPropagate` (registered in the pause-permit reach map); an
explicit scan still runs. It never posts, reverses, binds, signs or blocks.

## Surfaces

`#/matrix?panel=postings` (panel #37): quarter standing with per-currency
post buttons, posting cards with audit drift tables and binding states, the
reverse dialog, scan/pause/brief/CSV, and the method card with the ADR's
diagram (`app/assets/chargeback-posting.jpg`). CSV scope #146
`chargeback-postings`. Registered in `MATRIX_PANELS`, `PROPAGATION_CONTRACTS`,
the access gateway, seat registry and the pause-permit registry.

## Alternatives refused

- Auto-posting when the statement completes: a period fact nobody signed is
  the exact failure this ADR exists to prevent.
- Posting at plan/standard rates while prices are missing: refused whole;
  SAP-style provisional allocation imports the restatement problem.
- Editing or deleting a posting: append-only; reversal is the only correction.
- Writing the posted charge into the budget envelope's figures: the envelope
  is an authority, not a ledger line; the position is printed beside it.
