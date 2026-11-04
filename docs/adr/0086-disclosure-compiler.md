# ADR-0086: The Disclosure Compiler — every screen declares its posture, the aggregate replaces the refusal, and detail is released only by a consented, expiring contract

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 126
- **Schema:** v92 (additive `91 → 92`)
- **Surfaces:** `#/disclosure` (Disclosure Console), the aggregate posture on every module above its detail ceiling
- **Rules:** `RULE-DSC-01` (open), `RULE-DSC-02` (sweep) — 66 rules at Session 126; 67 after integration with ADR-0087, with rule/contract parity retained
- **Related:** ADR-0075 (Command Chain), ADR-0076 (Operating Seat), ADR-0078 (Decision Rights), ADR-0080 (Mission Control), ADR-0081 (Altitude Router), ADR-0082 (Sealed Spine)

## 1. The problem

ADR-0076 shipped a real, enforced boundary. It also refused **84 of 89 routes** under a
declared seat, with the same sentence: *"this legacy module has not yet completed its
seat-scoped read audit."* That sentence was true, and it was the largest product gap in
the workspace. A director could declare their seat and then lose the eight screens they
actually work in. Sessions 116–123 each listed "reviewed adapters for legacy modules, one
module at a time" as the follow-up; each session ran out of road before the catalogue was
covered, because the approach was a hand audit per screen.

Two things were wrong with the approach, not the enforcement:

1. **It scaled with the catalogue, not with the problem.** 90 screens × a written audit is
   not a plan; it is a queue that grows faster than it drains.
2. **Above a ceiling it produced a dead end.** Even a correct refusal is a bad answer to a
   VP asking "how much operational risk is open in my organisation?" — that question has an
   answer that is not item-level detail.

## 2. The decision

Replace the per-module audit with **a declaration, a compile and a proof**.

### 2.1 The declaration (`disclosureManifests.js`)

Every route the shell can render declares, exactly once: the governed collections it reads,
its record class (borrowed from `seatRegistry.RECORD_POLICIES` — never duplicated), the
fields an aggregate can be counted from, and its **mode**:

- `adaptive` — the legacy screen may render under a seat *inside* its own rank window.
- `aggregate` — the screen is a modelling surface whose own report reads span the whole
  workspace (Earned Schedule, cross-examination, calibration, pay parity…). Under a seat it
  publishes an aggregate and says so, rather than pretending to be audited.

A route with no manifest is **withheld with a printed reason**. Adding a module is one row.

### 2.2 The compile (`disclosure.js`)

`postureFor()` is a pure function of (manifest, seat, live grants) returning one of:

| posture | meaning |
| --- | --- |
| `detail` | the legacy screen renders, inside the class window, against a projected state |
| `aggregate` | the same records, read at the altitude that is operating: counts, open, overdue, severity load, oldest age, money **per currency**, per-child-span rows |
| `withheld` | below a class floor, an unresolved seat, or undeclared — with the reason |

Three properties are load-bearing and each is asserted:

- **Fail closed.** No manifest → withheld. Unreadable field → *unknown*, never zero.
- **No accidental coverage.** The aggregate reads only the seat's subtree. A peer span's
  records are not counted, not bucketed and not subtracted; the count of what was excluded
  is printed.
- **It prints its own refusals.** Every withheld cell carries the reason; every
  complementary suppression says it happened.

**Small cells.** Any span bucket below `disclosureCellFloor` (default 5) is withheld.
Then, if at least two buckets survive, the smallest surviving bucket is withheld **as well**
— classic complementary suppression — so a reader cannot recover the hidden cell by
subtracting the printed ones from the total. If the total itself is below the floor, the
total is withheld and the screen says so: *an empty-looking screen is not the same claim as
"nothing happened".*

### 2.3 The proof (the leak oracle)

`tests/app/disclosure-compiler.test.mjs` paints sentinel strings into every private field
(1:1 notes, SBI feedback, talking points, peer-span record titles), then navigates **every
route at four altitudes** through the real `createApp` against a real DOM. It fails if:

- a person outside the seat's subtree is named,
- a private note is printed above the individual-class ceiling, even about an in-span
  person,
- any screen falls through to the error panel.

That is the evidence that replaces a hand audit, and it is the reason the catalogue could be
opened in one session instead of ninety.

Reporting lines are treated as **structure, not disclosure**: the workspace may print the
name of a leadership *position* and the chain you report into. What it may never print is an
out-of-span *person*.

## 3. Release contracts — disclosure that is negotiable, bounded and expiring

Detail above a ceiling is released only by a contract, never by a setting:

- **Requested** by the altitude that needs the detail, for one `(screen, span)` pair, with a
  written purpose of at least 12 characters and a horizon of 1–30 days.
- **Consented only by the span that owns the records.** The requester cannot consent to
  their own request; the API refuses it and the consent task is addressed to the span.
- **Bounded**: one class ceiling, one span, one screen. Records outside the named span stay
  aggregated. A release is addressed to *one seat*, not to everyone above the span.
- **Never a floor.** A frontline lead cannot request pay data; `enterprise`-class
  collections (pay, parity, workforce transition) can never be released by anyone, because a
  manager cannot consent on behalf of a workforce to disclose it upward.
- **Expiring and graded**: `RULE-DSC-02` sweeps the ledger; a lapsed window stops authorising
  reads the moment the compiler compiles, and owes exactly one review task — did the detail
  change the decision? — forever one per release.

The propagation is the same spine as every other module, in one transaction:
`RULE-DSC-01` writes ONE governed DACI decision (release / refuse-and-share-the-aggregate /
narrow), ONE consent task, and the typed edges `authorizes`, `discloses-to`,
`tracks-followup`. Nothing anywhere auto-grants.

## 4. What this changes about the product

- A declared seat is **usable**: 61 of 96 screens are in detail at a director seat and 96 of
  96 are open (detail or aggregate) at every leadership altitude; only class floors withhold.
- A CEO opening "1:1s" no longer gets a refusal — they get the span-level read the level
  above is actually owed, and one honest route to more.
- The nav marks aggregate screens with `◌` and a title, so a leader knows before they click.
- The console compiles coverage (detail / aggregate / withheld, with reasons), the aggregate
  read for the seat, the release ledger, and an identity-free brief.

## 5. Consequences and honest limits

- Seats remain **auditable declarations, not authentication** (ADR-0076's limit stands). The
  browser owner can still read `localStorage`; this is a disclosure contract, not a
  multi-tenant security boundary.
- Suppression is **small-cell withholding**, not differential privacy; it is not robust to
  differencing across time, reorganisation or external auxiliary data.
- ~45 analytic terminals are `aggregate` mode by declaration, not by audit. The console says
  so screen by screen. Making their report reads seat-scoped remains on the roadmap.
- The oracle proves **DOM text** at four seats on a sentinel fixture. It does not prove the
  absence of a leak through a URL, an export, or a shape of data the fixture does not
  contain.

## 6. Alternatives rejected

- **Audit modules one per session** — the queue grows faster than it drains; 7 sessions of
  precedent.
- **Open everything and rely on the record-level projection** — the projection stops record
  leakage but hands a CEO an empty-looking screen at the ceiling, which is a lie by omission.
- **Let the requester's own seat consent to a release** — that is a self-service disclosure
  permission, which is the thing the boundary exists to prevent.
- **Make releases a workspace setting** — a setting has no owner, no purpose, no expiry and
  no grade.

## Export boundary

`disclosure-posture` is CSV scope **#80**, registered in `CSV_EXPORTS` beside every other export and compiled at the *exporting* seat, not the operator's: one row per declared module carrying the posture, the record class, the floor and ceiling ranks, the aggregate counts, the withheld-cell count, money separated by currency, and the boundary's own reason. A larger file is not a safer file — a file that carries the same aggregate a screen would have shown is the only kind that can leave the workspace without inventing a second, weaker boundary.
