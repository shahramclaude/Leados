# ADR-0203: Posted-Period Drift Attribution — Candidate Acts, Never Causes

Date: 2026-11-14 · Session 271 · Schema v158 unchanged · Status: Accepted

## Context

ADR-0202 made a restated chargeback period a leader's dated duty: its audit
prints the frozen and re-derived cents, fingerprints the difference, and asks
the posting's joint apex to acknowledge or reverse it. The reader could prove
**that** a figure moved, but not put the dated record acts beside the decision.
A retroactive reporting-line change, a two-key price changed after close, and a
roster repair all leave different evidence. Asking a leader to choose from a
delta alone invited an unsupported causal story.

The obvious but unsafe alternative was an empty search over the ordinary event
log: that log is deliberately bounded and evicts oldest events first. An empty
list after the posting may mean “nothing happened,” or may mean the beginning
of the window has been evicted. Those claims cannot be collapsed.

## Decision

`attributePostingDrift` is a pure derived reader. It stores no attribution,
changes no posting, adds no schema, files no ask, ranks no person and does not
amend ADR-0202's acknowledgement authority. It runs only for an audited
`drifted` posting and joins the posting instant through the reader's `now`
against the workspace event ledger.

### Coverage is proved or the join is refused

Ordinary event survivors are a suffix because `capEvents` evicts oldest-first.
The window is **covered** only when the oldest surviving event is at or before
the posting instant. An empty log, an unreadable/future window, or an oldest
survivor after the posting makes the result `refused` (`empty`, `no-window`, or
`truncated`); the card, brief, board and CSV say so. `no-candidates` is
therefore a covered result only — never a claim made from a missing history.
An event at the same instant is retained but printed `unordered`: this record
cannot say whether it happened before or after the posting.

### The bounded candidate join

For each covered in-window event, the reader recognises only acts that can
change the derivation:

- `transfer.price.confirmed` and `transfer.price.retired`, resolved through
  the two-key agreement's borrower charge side and lender credit side;
- `matrix.line.declared`, `matrix.line.retuned` and `matrix.line.ended`,
  resolved through the line's charged manager account and its person's
  home-line account as the record reads today;
- `person.updated`, `person.archived` and `person.restored`, resolved through
  that person's overlapping lines and home-line account.

The relevant account set is the posting's frozen rows **plus** every account
named by its drift, so an act that put money on a newly appearing account is
not falsely dismissed. An act is linked only where that record-supported set
intersects the relevant accounts. Linked acts are printed newest-first, bounded
by the existing candidate limit, with the date, event id, exact link basis and
posted/current/delta cents beside any moved account. A seat outside an account
sees a counted withheld line, never its name.

The reader counts but does not list four exclusions: a day outside the posted
period; an act that cannot move a figure (including a price withdrawn before it
was ever agreed); an event without a record id; and a type outside the three
families. In-family acts whose record is gone are `unresolved`; acts tied to
no relevant account are `unlinked`. Neither is dressed up as a candidate. The
identities are printed and asserted:

```
outside-family + unattributable + out-of-period + not-figure-moving + candidates = window-events
candidates = linked + unlinked + unresolved
```

This is attribution in the narrow, honest sense: a linked act was in the
covered window and touches a moved/frozen account. It is **not** proof that the
act caused the drift, a confidence score, an ordering, or a judgement about a
person.

### Surface and export

`#/matrix?panel=postings` adds a `Drift attribution` board stat and an
attribution block directly below a drift audit. It labels the table “CANDIDATES,
not causes,” prints coverage and count reconciliation, withholds names outside
the reader's seat, and offers the existing acknowledge-or-reverse decision only
as a human next step. The brief uses the same reader. CSV #146 gains aggregate
`drift_attributed`, `drift_no_candidates`, `drift_attribution_refused`,
`drift_candidates`, `drift_candidates_linked`; a posting row gains
`drift_attribution`, candidate counts, window days and coverage. It remains
aggregate/identity-free: no candidate id, person, name or reason is exported.

The regenerated method diagram adds the bounded event-window and neutral
price/line/person act cards beneath the drift flow. It is labelled conceptual,
not workspace data.

## Consequences

- A director or VP can now read the dated record acts that the workspace cannot
  exclude before accepting or reversing a drift, including both sides of a
  matrix line, without turning proximity into causation.
- Bounded history remains bounded; a stale retention horizon now produces an
  explicit refusal instead of a reassuring empty list. A durable governed event
  archive is deliberately not implied by this slice.
- The category comparator is financial-close variance drill-down (BlackLine
  Account Analysis/Transaction Matching, SAP CO line-item analysis, Trintech
  Cadency). The category commonly drills from a balance into posted journal
  lines; LeadOS has derived share-days × two-key prices rather than journal
  lines, so it prints dated record acts and a per-act provable link instead.
  This is category research rather than hands-on product parity:
  **[BENCHMARK-UNVERIFIED]**. LeadOS does not claim automated root-cause
  ranking; it intentionally prefers a covered candidate list and a visible
  refusal to a fabricated cause.
