# ADR-0148: Matrix line consent — a declared share is an ask until two people answer it

- **Status:** Accepted
- **Date:** 2026-11-09
- **Schema:** v123
- **Surface:** `#/matrix?panel=consent` (Board / Register / Method), `RULE-LCN-01`, CSV scope #110
- **Altitude:** frontline / mid-manager primary (the line holder and the person); the same board is the
  director's and the VP's roll-up of what has actually been agreed
- **Structure:** matrix; single-chain workspaces remain byte-for-byte inert

## Context

ADR-0140 lets one manager **declare** that another holds 40% of a person. ADR-0141 lets that
manager then read the work. Neither act asks the people the number is about. The ledger therefore
prints, as though it were agreed:

- a project manager nominally owning 40% of an engineer she has never agreed a delivery with;
- an engineer who was never told she is on the hook to two people for the same hours;
- a home manager still planning her at 100%;
- and a roll-up that adds all of it up.

That failure has a name in practice — **shadow accountability**: responsibility that exists on a chart
and nowhere in the relationship. It is how a matrix rots: not one bad decision, but a register of
commitments no human ever answered.

## Decision

LeadOS adds the consent protocol the register was missing, in the same shape ADR-0127 gave declared
duty covers (`declared → asked → accepted / declined / lapsed`). Two humans answer, each for
themselves and each on their own date:

- **manager side** — the manager the line was *given to* accepts the share and its decision rights, for
  a declared window, optionally stating what the line is on the hook to deliver; or declines it with a
  stated reason.
- **person side** — the person the share is taken from acknowledges that it is taken from her hours.

The register is a **derived read model** over the dated acts plus the live matrix. It prints five line
states (`unanswered`, `declined`, `changed`, `lapsed`, `awaiting-person`, `accepted`) and seven
person verdicts, with declared precedence, so the rule, the panel and the CSV cannot disagree about a
word.

### The refusals that are the product

1. **No inferred consent.** A declaration is not an acceptance. A line nobody answered is
   `unanswered`, and the share total is printed as *declared* and *accepted* separately, because "the
   roll-up adds up" and "somebody agreed to it" are different facts.
2. **A refusal is an answer, not a deletion.** A declined line stays charged, because the declaration
   stands until the manager who made it — or the span above both — ends it. The register prints the
   charged share beside the decline and counts it.
3. **A retuned share is not a consented share.** The acceptance stores the share that was accepted on
   that date. If the declaration now carries a different number, the line reads `changed` and the
   accepted total excludes it: consent to 40% is not consent to 90%.
4. **No consent past one whole person.** An acceptance that would commit more than 100% of a person is
   refused with the arithmetic printed (`40% + 70% = 110%`). When any line's share is undeclared the
   capacity check is *refused*, not guessed, and the acceptance says so.
5. **No total over a part.** If any line in scope has no allocation, both share totals are refused
   with the reason. A partial sum understates the claim while looking complete.
6. **No answering for somebody.** Only the line's manager may accept or decline; only the person may
   acknowledge. Where the person has no leadership seat, the operator view may capture their statement,
   and the row is marked `operator` — a scribed statement is never printed as an authenticated one.

### Storage

One new collection, `lineConsents`, holding **only** dated human acts: side, outcome, day, seat, the
window an acceptance runs to, the share that was accepted (a dated fact), an optional basis, and a
mandatory reason on a decline. `lineConsentMarkers` is `RULE-LCN-01`'s idempotency ledger. Nothing
derived is stored — no state, no lapse, no day count, no verdict, no total.

### Automation

`RULE-LCN-01` fires on `matrix.line.declared`, `matrix.line.retuned` and an explicit scan (never on an
acceptance). It issues at most one owned, dated delegation per unaccepted line, addressed to the
manager the line was given to — and one to the **person** when an acceptance has stood past its window
unacknowledged. Typed provenance only (`concerns`, `issues-obligation`, `rolls-up-to` per leadership
ancestor in the matrix DAG). Bounded per transaction; the remainder is counted and retried by a scan.

## Consequences

- Every matrix report can now distinguish *declared*, *accepted* and *acknowledged* capacity, and the
  difference is a named finding rather than a silent assumption.
- A single-chain workspace gains no collection row, no marker, no delegation and no change.
- The register cannot certify that hours were worked, only that somebody answered. That limit is
  printed on the panel rather than inferred from an acceptance.
- Historical roster membership is still not reconstructed: the home line is read as in-force for the
  whole record, and the register says so.
