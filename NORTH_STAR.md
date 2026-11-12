## 2026-11-06 — Session 144: measure the act of looking, not just the outcome

The workspace already recorded decisions, outcomes, links, unread signals and forecast error. It could not record the most ordinary act of judgement: *I read this fact and deliberately ruled it out.* The Diligence Ledger closes that gap by freezing what was knowable at decision time and making looking-and-dismissing a dated, append-only act. This is not a score on a person; it is an instrument that can refuse its own rate when the evidence is too thin. One decision commit now makes the frontier visible from frontline to C-suite through the same event spine. Competitive benchmark: decision-provenance audit trails, "alternatives rejected" forensic logs, manual decision registers and prediction journals — none shown to derive and grade a leader's own *process* against a frozen knowable set at every altitude. Gap claim, not market-first claim. `[UNVERIFIED]`: full repository audit and real-browser AT walkthrough.

# LeadOS North Star (do not dilute — this is binding project doctrine)

> **Session 145 (2026-11-06, Schema v107):** Mission Command Flow (`#/mission?panel=capture`, ADR-0105) ships the note → case → coordinated actions → hierarchy receipt as one reviewed, rehearsed, atomic transaction. Raw notes stay with the preparing seat; ancestors receive governed work. Full-suite result is recorded in AI-SESSION-LOG.md; seats remain workflow declarations, not authentication.


## Mission
LeadOS is a leadership/management operating system usable at EVERY altitude of an organization — frontline supervisors, mid-level managers, directors, VPs, and the CEO — as one connected system, not separate apps bolted together.

## Standard of ambition
No feature ships if it's just a generic form. Every feature must reflect real expertise, not surface-level checklists. Favor ideas that are genuinely ahead of existing market tools (predictive scoring, auto-classification/auto-routing, scenario simulation, confidence-weighted recommendations) over safe, static ones.

## Cross-domain expertise required
Every module should draw on real frameworks from: engineering (root-cause analysis), economics (incentives/tradeoffs), business strategy, finance/investment (ROI, risk-adjusted decisions), political science (stakeholder/negotiation dynamics), statistics (forecasting, confidence intervals), and operations (process optimization). Name the framework being applied; don't paraphrase vaguely.

## Organizational hierarchy mandate
Every module must eventually support role-appropriate views across the full chain of command (frontline → mid-manager → director → VP → CEO), with data/insights automatically rolling up in a form suited to each level — no manual re-entry, no one-size-fits-all dashboard.

## Matrix leadership mandate (binding — added 2026-11-08)
LeadOS must natively model and support **matrix organisational structures**: an
employee with several reporting lines at once — a functional manager, a project
or product manager, and cross-functional leads — not only a single chain of
command. This is not a variation to be accommodated; it is the normal shape of
any organisation above a few hundred people, and a product that only understands
trees silently misreports every one of them.

Every duty, dashboard and roll-up must therefore be correct when a user has more
than one manager and belongs to more than one team. Specifically: a roll-up must
never count the same person twice, never drop a person because their second line
was invisible to it, never invent an allocation that no human agreed to, and
never silently pick one of several managers as the owner of a piece of work —
where ownership is genuinely ambiguous the system names the ambiguity and
reports it. `person.managerId` remains the home line and the source of truth;
the matrix layer is built OVER the existing hierarchy engine, never as a second
one, and a workspace that declares no additional line must behave exactly as it
did before. Evidence: `app/core/domain/matrix*.js`,
`docs/adr/0140-matrix-accountability-ledger.md`, `#/matrix`.

## Bulletproof reliability mandate (binding — added 2026-11-08)
The application must be **100% trustworthy for real leadership decisions**: no
silent failures, no data loss, no corrupted roll-ups, and **no deviation between
what is displayed and what is actually stored or computed — ever**. "Good
enough", "mostly working" and "it rounds to the right answer" are explicitly
rejected as standards.

Where a figure cannot be supported by the record it is **refused with a printed
reason**, never rendered as a zero, a blank that reads as reassurance, or a
plausible default. Where a total is printed, the system must be able to prove
that the total is the sum of the rows it printed — and must say when it cannot.
Two distinct claims must never be collapsed into one reassuring word: *the
figures add up* and *the printed figures are the computed figures* are different
facts and are reported separately. Refusals, caps and withheld cells are always
counted and explained, never dropped. Evidence: the reconciliation contract in
`app/core/domain/matrix.js` (`balances` vs `auditClean`), the fail-closed
normalizers in `app/core/schema.js`, `npm run check:boundary`.

## Visual / content integrity mandate (binding — added 2026-11-12)
Any user-facing visual, onboarding asset or communication piece must be the real
produced asset, not a placeholder, a grey box or generic stock filler. A
placeholder visual layer is a stub and fails the technical baseline below for the
same reason a code stub does. Where a specialised generation tool sets a better
bar than hand-written markup can reach, that tool is the path; where the asset is
generated, its provenance is recorded.

## Competitive benchmark mandate (binding — added 2026-11-12)
For any capability LeadOS implements that overlaps what a specialised external AI
tool, model or platform already does well — visual generation, forecasting,
natural-language analysis, recommendation or scoring engines, summarisation, and
the rest — LeadOS's own implementation, whether built natively or assembled by
integrating an external tool, must **match or exceed the quality of the best known
tool capable of that task**. "Adequate", "passable" and "good enough" are rejected
as standards whenever a visibly better bar exists in the market. Where the better
path is integration, integrate properly. Where it is native, engineer it up to
that bar. Saying plainly that the bar is NOT cleared — marked
`[BENCHMARK-UNVERIFIED]` — is always permitted and is never a substitute for
trying. This applies to substance and intelligence, not only to visuals.

## Cross-module automation mandate
A unified case/event/decision data model should trigger automatic, parallel updates across all relevant modules (coaching, risk, finance, stakeholder, decision log, etc.) via a generalized event-driven engine — not one-off hardcoded links.

## Non-negotiable technical baseline
No stubs, no fake data, no silent failures. No regressions. Safe-write, versioned data schema. Traceable action history. Decoupled business logic / data / UI layers.

## How this document is used
This file is the permanent doctrine. Session-by-session work is scoped and tracked separately in [ROADMAP.md](ROADMAP.md) and [AI-SESSION-LOG.md](AI-SESSION-LOG.md). Individual sessions should reference this file, not restate it.
