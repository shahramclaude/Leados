# ADR-0131 — Exact-record focus for the coverage family: an edge lands on the row it names

- **Session:** 177 (2026-11-08)
- **Schema:** v118 unchanged — no new collection, node, relation, rule, event or stored field
- **Status:** Implemented
- **Altitudes:** director (rank 3) / VP (rank 4) PRIMARY — the review-and-audit duty; every altitude follows the same rails
- **Supersedes (in part):** [ADR-0130](./0130-typed-graph-resolution-and-roundtrip.md)'s deliberate panel-only routing for the six coverage-family types

## Context

ADR-0130 gave every registered link type a resolver case, and refused — correctly, at the time — to invent a focus the destination terminal could not honour: the duty register, the absence plan, the acknowledgement board and the branch-reading panel accepted a `panel` query but no record id. Its own flagged limitation: *a leader reaches the owning panel and cannot jump to the exact row.*

The altitude that pays that cost daily is the reviewer. A director approving a leave week works from governed decisions and propagation rows: the refusal answer, the cover declaration it names, the absence window behind it, the rehearsal that found gaps. Every one of those edges landed at the top of a table with up to 40+ rows and no highlight. The frontline holder usually knows where their own row is; the director following an edge from three spans down does not. The Session-176 coverage map put director/VP last primary in 173 (frontline/mid 174, CEO 175), so the Universal Hierarchy Mandate rotated to them, and this was the roadmap's own next slice.

## Decision

**One focus parameter per record kind, declared once** in `app/ui/recordFocus.js` (`RECORD_FOCUS_PARAMS`) and matched by the resolver:

| Graph type | Route | Focus |
|---|---|---|
| `dutycover` | `#/duty-cover?panel=register` | `?cover=<id>` |
| `absenceplan` | `#/duty-cover?panel=plan` | `?plan=<id>` |
| `standbyanswer` | `#/standby?panel=asked` | `?answer=<id>` |
| `rehearsal` | `#/duty-cover?panel=plan` | `?rehearsal=<id>` |
| `branchask` | `#/duty-cover?panel=readings` | `?ask=<id>` |
| `branchreading` | `#/duty-cover?panel=readings` | `?reading=<id>` |

**The views honour the id against the rows the seat may already read.** The shared helper resolves a request to exactly three states: `focused` (mark that row with the house `lineage-selected` class, a `data-*` anchor and `aria-current`), `absent` (print a banner saying the link did not resolve HERE — out of scope, revoked, deferred by a row cap, or gone — and highlight nothing), `none` (render as before). Focus never widens scope, never re-queries, never mutates: the rows it is given are already seat-scoped and redacted by the engine.

**Privacy rules carried through unchanged.**
- The cover-row id survives the above-rank-2 redaction because it addresses the *declaration*, never the person: a director's focused row still prints no cover name.
- The branch ask/reading focus is the record's own id — still **no seat id and no table position** on the URL or the row (ADR-0129). Both chairs are resolved against the acting seat by the engine, so a peer holding the link gets the absent note, never the sibling's ask.
- The absence-plan rollup row gains `id: plan.id` (additive, engine-side) — the same record id the graph already projects; reason text stays withheld above rank 2.

**Two homes, one honest pointer.** A standby answer lives in the holder's board AND the cover's "For me" chair. The resolver routes to the board; when the record is in the cover's own chair instead, the board prints a pointer carrying the same id rather than fabricating a highlight. When the board's 40-row cap defers rows, the absent note says so instead of implying the record is out of scope.

**A capped ledger brings the linked row into view.** The rehearsal card prints the 40 most recent records; a focused record older than the slice is prepended with a printed explanation, so the link lands on the exact row instead of silently missing.

**Fixed at the source while here:** the `branchreading` resolver read `rec.publishedOn`, but the ledger stores `answeredOn` — every label printed `published undefined`. It now prints the day, and a declined reading (band null by construction) prints its answer word instead of the string "null".

## What did NOT change

- The analytics family (`fitsnapshot`, `fitproposal`, `fitreading`, `jurfinding`, `jurreading`, `spanreading`) stays panel-only: those terminals are aggregate readings of a whole span, not record viewers. The sweep still pins that honestly.
- The 14 registered types outside the sweep fixture remain outside it (pinned literal, unchanged). Moving them in is the explicitly-carried remainder of Session 176's next item.
- No schema bump; both route families remain additive query parameters that old views ignore.

## Verification

`coverage-record-focus` **5/5** (resolver routes + disclosure wall + URL encoding; exactly-one-row selection at manager AND director altitudes across all six types, both branch chairs and both standby chairs; absent-note honesty + zero mutation; the capped-ledger bring-in; axe-clean focused renders at the director seat). `typed-links-lineage` **8/8** with the six types moved from the panel-only pin to exact-focus assertions. Adjacent coverage-family + navigation + CSV suites **106/106**. `lint`, `check:boundary` (584 modules / 177 suites / 23 doc checks), `check:links` (927 links) all PASS; standalone rebuilt and **7/7**. Full canonical suite and real-browser AT walkthrough **[UNVERIFIED]**.

## Limits

Seats remain workflow declarations, not authentication. Focus is a view contract over engine-scoped rows — it inherits every existing disclosure limit (structural inference on small branches, deferred row caps) and adds no new one. The absent note deliberately does not distinguish "revoked" from "never in your scope" beyond what the row caps explain: distinguishing them for an out-of-scope reader would itself disclose that the record exists.
