## 2026-11-10 — Keep matrix feedback conversations in the room that held them

**Per-line feedback confidentiality ([ADR-0167](./docs/adr/0167-per-line-feedback-confidentiality.md)).** Under a declared manager seat, feedback is now attributed to the seat that recorded it. Its author can read and update the SBI conversation; another tree or matrix-line manager sees that feedback exists and its factual dates/status, but not the situation, behaviour, impact or tags. Historical notes remain unattributed rather than guessing who wrote them; they remain readable through the reporting tree and are withheld from a line-only reader. The same boundary blocks cross-line edits and follow-up changes. Single-chain workspaces and the undeclared operator view behave as before. Schema v134 is additive; historical notes are not rewritten. Operating seats are still local declarations, not authenticated identity.

## 2026-11-10 — Record who held a 1:1, and keep other lines out of the room

In the full-access operator view, **Log a 1:1** offers an optional holder; under a frontline or mid-manager seat a held meeting is attributed to that seat, including for a direct additional-line report. History displays the stored holder or “Holder not recorded.” Schema v132 leaves older meetings unattributed rather than guessing, and newly detected invalid dates appear as “Date unverified.” A failed local save or queued encrypted save produces a warning.

**Per-line confidentiality is now enforced ([ADR-0165](./docs/adr/0165-per-line-one-on-one-confidentiality.md)).** A declared additional reporting line is an accountability, not a readership: a seat that reaches a person only through a line — or holds any other recorded holder's meeting — sees the **fact** that a 1:1 happened (date, held/skipped status, holder) but never its notes, mood, agenda, resolved topics or promises; the reason is printed in place of the content on `#/oneonones`, the person page and the prep sheet. The seat that HELD the meeting always reads its own record. Unattributed historical meetings remain readable through the reporting tree exactly as before (nothing changes for a single-chain workspace or the undeclared operator view), while an additional line never reads what no holder attests to. The same boundary guards the write doors, so a crafted call cannot edit or pad another line's room. A consented release (ADR-0086) remains the one legitimate cross-boundary path for content. A selected seat is still not authenticated identity.

This is still not the matrix 1:1 coverage feature: there is no coverage panel, reminder rule, scan, registered CSV export or interactive claim/release control. The API-only report reads **today's** lines and may credit meetings that predate a current line; legacy person-wide cadence is unchanged and can still use fallback dates. Higher-altitude line holders cannot yet log through this path. Historical-coverage work remains before relying on the coverage reading.

## 2026-11-10 — Matrix goal carriage branch-overlap audit

Open `#/matrix?panel=goal-carriage` to compare distinct active goals in each manager span with the appearances under its immediate reporting branches. The view uses the canonical matrix DAG, displays exact repeated-appearance counts, and keeps multi-manager goals unattributed rather than choosing a line. Active line defects refuse affected span totals. This is currently a read-only overlap audit; persistent manager stances, settled attribution, attainment-rate comparisons, automation and CSV export remain in progress. No setup or schema change.

## 2026-11-10 — Is one manager span a stable dyad or a scattered matrix?

Open `#/matrix?panel=coordination` for the Matrix Span Fragmentation & Counterpart-Dyad Coordination Ledger. A reporting-tree span of four can mean four people working with one steady counterpart manager, or four separate counterpart negotiations; tree headcount cannot tell those structures apart. This panel reads the existing live Matrix graph and prints each manager span’s distinct counterpart count, directed manager → person → counterpart exposures, deduplicated workspace manager pairs, and exact rational effective-counterpart dispersion — never a rounded score, estimated hours, performance judgement or redesign recommendation.

The refusal is part of the answer: one active multi-line allocation with an undeclared or invalid share refuses every holder of that person and withholds the workspace topology total rather than publishing a reassuring remainder. An invalid declaration outside its active window does not poison today’s reading. Higher-altitude seats retain structural counts but names respect the existing detail boundary. Use **Scan through automation** only to write a bounded, identity-free shared-spine trace for fragmented or refused topology; it never creates work, selects an owner, changes a share or invents an agreement. The aggregate CSV carries counts only — no person, manager, line, declaration, seat or free text. No setup or schema change.

## 2026-11-10 — Which declared lines are actually being run?

Open `#/matrix?panel=activity` for the Matrix Line Activity Reconciliation. The period ledger says what each declared line was CHARGED; nothing said what each line DID. This screen joins the declared share-days to the dated acts each line actually originated about the person inside the same named window — an onboarding brief, a consent answer, a re-affirmation answer, a settled line-exit obligation — so a line charged 40% of somebody that originated nothing at all reads `silent-line`, and a 10% line originating most of her line-addressed acts reads `over-active`. Both sides are whole per-mille of the person's total by exact largest-remainder allocation, and the two identities (counts add to the printed rows, shares add to 1000) are printed as separate claims. The refusals are the point: an act from a manager holding two of the person's lines is never assigned to one, an act that reached a line the period could not price refuses the person's whole comparison instead of dropping out, home-manager acts are never charged to a line, and below three attributed acts no share is compared. The export carries counts only — no person, no name, no manager id. No setup or schema change.

## 2026-11-10 — What did the quarter actually charge?

Open `#/matrix?panel=allocation` for the Matrix Line Period-Allocation Ledger. Every other surface charges a reporting line at ONE number — the share on the declaration today — so a line retuned mid-quarter was never priced as it ran. Name a period (the default is the last completed calendar quarter) and each declared line is weighed across it in exact integer share-days: whole hundredths of a person × whole days, linked at every retune boundary, with the segments and the arithmetic printed. The refusals are the point: a period the retained change history cannot prove is refused rather than projected backwards from today's share; an undeclared day refuses the row, a refused row refuses the person, and a refused person refuses the workspace total — no partial sum ever prints as a whole; the home line is counted out of scope; and the over-committed-day count is claimed only from a complete sweep. The export carries counts and share-days only — no person, no name, no manager id. No setup or schema change.

## 2026-11-10 — "Ready now" — but who said so?

Open `#/succession?panel=evidence` for the Cross-Line Bench-Evidence Sufficiency register. A succession bench claim is a rating, and the workspace already stores which reporting lines were asked for review input and which answered — but nothing had ever joined that record to the readiness ledger, so a "ready now" claim for a person working across three lines could rest on one home-line manager's impression while the other lines were never asked. Each current claim is now read against the latest **completed** review whose period ends on or before the last day of its 90-day evidence window (a declared, printed rule — a period that had not closed is never read) and resolved to one of nine closed states, worst first: no readable review, contested assessor, unowned assessor, **line never asked**, line asked and silent, line asked with its window still open, home line only, corroborated, single line. A reasoned decline counts; the three "not an answer" states are never collapsed into one word. The evidence-complete rate is BLANK rather than narrowed below three cross-line claims, over any unreadable claim, or with no cross-line claim, and two separate claims are printed — that the state counts add up, and that the population was readable. `RULE-BNE-01` puts one dated, owned ask in front of the manager who held the claim's home line as of its evidence window, and issues nothing for a contested or unknown home line. No rating is ever edited and no person or manager is scored; above the manager rank the register prints no name, and the CSV export (scope #123) carries counts only. Schema v135 adds one empty marker ledger; no existing record changes.

## 2026-11-10 — Are our frozen decisions still attributable to the authority that made them?

Open `#/matrix?panel=continuity` for the Matrix Authority Continuity Register. It reads every frozen decision record the workspace stores — a finalised merit cycle, a decided decision record, a committed or frozen board memo — and compares the authority each record names against the authority that was in force on that record's own day. Four verdicts: still attributable, the authority has moved since the record was made, the record names no authority, or the record could not be read. The portfolio claim ("every frozen decision still names the authority that made it") is refused whenever any record could not be read, whenever any covered record disagreed, or whenever fewer than three records could be compared. A record whose authority moved is named, never rewritten, and no person is scored. The export carries counts and verdicts only — no record title, no name, no manager id. No setup or schema change.

## 2026-11-10 — Matrix line-term exposure

Open `#/matrix?panel=lines` for a seat-scoped register of active additional lines with no declared end date, an end within the configured expiry horizon, or a later dated term. It prints stored dates, whole days remaining, distinct people, refused declarations and any row-cap remainder. Open-ended does not mean renewed or agreed; two-sided re-affirmation is not yet supported. Existing governed End actions remain available. No setup or schema change.

## 2026-11-10 — Incomplete merit pools

In `#/merit?panel=matrix`, incomplete pools now withhold cohort medians, pool share and cohort/level comparisons with the same reason in the panel, brief and CSV. Excluded, malformed, repeated-recipient and capped rows cannot produce a parity/divergence verdict or a reassuring single-line verdict. Counts reconcile classified, malformed and omitted rows separately from figure completeness. Pool share requires both disclosure floors; an unspent pool prints no gap. No setup or schema change.

## 2026-11-09 — A declared share of a person is an ask until two people answer it

`#/matrix?panel=consent` adds the consent protocol the matrix ledger was missing. Declaring a line (ADR-0140) recorded what one manager said; nothing recorded what the other manager and the person answered. The register now prints **declared**, **accepted** and **acknowledged** capacity as three different figures, because "the roll-up adds up" and "somebody agreed to it" are different facts.

- **The manager a line was given to accepts or declines it**, for a declared window, storing the share it accepted and optionally what the line is on the hook to deliver. A decline requires a stated reason and does **not** delete the declaration: the share stays charged, and the register counts the lines that are charged despite a refusal.
- **The person whose hours are taken acknowledges it**, in the first person. A manager cannot acknowledge on their behalf. Where a person holds no leadership seat, the operator view can capture their statement and the row is marked `operator` — never printed as an authenticated identity.
- **A retuned share is not a consented share.** Accepting 40% and then retuning the line to 90% reads `changed`, prints both numbers, drops out of the accepted total, and asks again at the new share.
- **No consent past one whole person.** An acceptance that would commit more than 100% of someone is refused with the arithmetic in the message (`40% + 70% = 110%`). When any line's share is undeclared, both share totals are refused with the reason rather than printed over a part.

`RULE-LCN-01` issues one dated acceptance ask to the line's manager, and one dated acknowledgement ask to the **person** once an acceptance has stood past its window unacknowledged. Schema v123 is additive: an upgraded workspace opens with "every declared share is still an ask", and a single-chain workspace gains no row, no ask and no change. CSV scope #110 is aggregate-only. See [ADR-0148](./docs/adr/0148-matrix-line-consent.md).

## 2026-11-09 — Repeated matrix decision friction, grouped as a design signal

The Matrix Concordance now looks beyond individual decisions: it groups the same structural finding by active line kinds and affected rights, and marks it recurring only when it appears across at least two distinct decisions. The executive view shows the first and latest dates; the seat-scoped aggregate CSV carries only structural labels, counts and dates. A decision linked to multiple people still counts once per pattern. No person, manager, decision or line identifiers enter the recurrence export, and no finding is a rating or an automatic change to reporting rights. See [ADR-0146](./docs/adr/0146-matrix-recurring-structural-patterns.md).

## 2026-11-08 — Which of two managers' work goes first: cross-line priority arbitration

`#/contradiction` asks the question an arbitration cannot: do two lines' **declared charters** — the lever they are each paid to move, in the direction they were told to move it, and the share of a scorecard or an envelope they claim — make one another unachievable for the people who sit on both? It prints `incompatible` only where declared integers or the queueing law prove it (τ/(100−τ) at the declared utilisation target, beside the declared knee), names every other coupling a **tension** rather than a proof, refuses a missing figure instead of reading it as zero, and records the chief's ruling: run both knowingly, change one line's charter, or withhold with a reason. Only the last-but-one of those issues dated work, and only to the line named.

Two managers can both have dated work on one person — on paper she is 140% committed, and the register already says so on `#/matrix`. It could say *"`priority` is contested"*, which is true about the structure and useless at 09:00 on a Monday. `#/arbitration` records the actual agreement instead.

Open a case about that person. Each line states its demand with the two figures that line owns — **cost of delay** and **job size** — plus, if the work sits on a critical chain, the days remaining. The case freezes them, ranks them by WSJF in exact integer arithmetic, and shows you the comparison it used, so a manager can argue with the ranking instead of being handed one. A demand that refuses either figure is **not scored zero**: the case prints `incomplete`, names which demand refused, and offers **no recommendation at all**. Two demands that measure identically are printed as a tie with the size of the group — row order never breaks it. The arbiter is resolved from the reporting lines as the nearest manager above both, and a genuine two-branch tie is shown as a tie rather than an elected winner.

**The recommendation cannot act.** Proposing the order is one act; agreeing the precedence is a different one, gated on a different right, and it is the only act that issues dated obligations and opens the governed decision. Each party records its own answer under its own seat, so dissent carries the same weight as agreement — an agreement nobody answered is flagged rather than read as unanimity. Sequenced capacity is summed against a declared ceiling and prints `over-committed` with both numbers when it exceeds it, instead of blocking a plan you are entitled to accept knowingly. Nothing derived — no rank, ratio, state or capacity total — is ever stored; it is all recomputed on read, and a workspace that never opens a case behaves exactly as before. Schema v120, additive.

## 2026-11-08 — Matrix managers can read their budget exposure

On `#/finance?panel=span`, a director or VP who holds someone through a declared project, product or cross-functional line now sees that person's recorded budget envelope in the span roll-up. The whole envelope is counted once for that seat under **Declared matrix line**; if both the home tree and the line reach the owner, it is still counted only once. Forecast, actuals, commitments and headroom continue to come directly from the stored envelope and existing finance evaluator.

A capacity allocation is not a financial split, so LeadOS never multiplies money by the reporting-line share. The home cost centre and matrix manager are reading the same envelope: the panel, downloaded ledger and upward brief explicitly warn that overlapping seat totals must not be added together. Ordinary finance writes and events are unchanged, and the reading survives reload without a stored copy. No setup or schema change.

## 2026-11-08 — Matrix accountability: does the roll-up add up?

Most organisations above a few hundred people are not a tree. An engineer with a functional manager, a project manager and a product lead is the normal case, and until now every roll-up in LeadOS assumed she was not: `person.managerId` is a single pointer, and ownership, span of control and the automation fan-out were all properties of that tree. A tree's answer is unique *because a tree has exactly one path to the root* — add a second line and the same question has two defensible answers.

`#/matrix` adds the matrix **over** the existing hierarchy, never as a second one. Declare an additional reporting line — project, product, cross-functional or administrative — with the share of that person it owns, as a whole percentage, and the decision rights it holds. The home line stays exactly where it always was, and a workspace that declares nothing behaves precisely as it did before.

What that buys you:

- **A roll-up that audits itself.** Every manager's attributed span is added together and compared against the headcount, in whole integer hundredths so the answer is exact rather than something that rounds into looking correct. Two separate claims are printed, because they are two different facts: *do the allocations add up* (`balances`) and *is the printed total the sum of the printed rows* (`auditClean`). A ledger can be perfectly audited and still not balance — someone at 140% is reported truthfully and still leaves the roll-up 0.30 out.
- **Nobody is invented.** A person on one line owns the whole person to that manager, by arithmetic, and says that it was arithmetic. A person on two lines with a hole in them is attributed to **nobody**, never split evenly: filling the gap would be an agreement nobody made.
- **Who decides what.** Six decision rights (priority, assignment, technical direction, performance assessment, pay, absence approval), attributed per line. Two managers holding one is *contested*; nobody holding it is *unowned*. The register records both and adjudicates neither — both are properties of the structure, not of a person.
- **Work reaches every manager.** When a line is declared, that person's open work rolls up to the new manager in the same transaction. The engine never picks which of two managers *owns* an item; it names all of them and reports the ambiguity, because choosing one silently is not a decision it is entitled to make.

The upgrade adds both ledgers empty at Schema v119: "this organisation is recorded as a single chain of command", which is a different claim from "nobody here has two managers". No reporting line and no allocation is back-filled. An allocation is a declaration, not a measurement — nothing checks it against a calendar, and the page says so. Above the declared detail ceiling a manager row is disclosed as counts only, and no person is ever named in an export row. Seat selection is not authentication.

## 2026-11-08 — Budget headroom needs evidence

In `#/finance?panel=span`, currency and branch headroom is blank when an attributable envelope has no ceiling, a spent line has no actual, or an open line has no price. Recorded forecast subtotals remain visible; the ledger and brief carry the limitation. Unpriced planned lines also conservatively block headroom, although priced planned pipeline is separate from forecast-at-completion. This does not change the individual envelope cards or the existing finance actions. No setup or schema change.

## 2026-11-08 — Review 1:1 topics before they are lost

When adding or editing a person, an overfull 1:1 waiting list now stays in the dialog instead of silently dropping lines. The inline message identifies lines that would not fit; edit the list before saving. The existing 12-unique-line policy keeps the person's topics first and newer engine prompts next; duplicate and 200-character normalization still apply. The saved list uses the existing person action and automation. No setup or schema change.

## 2026-11-08 — The inference-only handover digest (Session 178, Schema v118 unchanged, [ADR-0132](./docs/adr/0132-inference-only-handover-digest.md))

On `#/duty-cover?panel=desk`, frontline leads and mid-managers now get a daily **Handover checks** queue: available, eligible covers on unended absence windows whose only pre-window evidence is inferred work, with no explicit rehearsal. One row is one cover × duty × absence, ordered by open work on the duty then the earliest preparation cutoff. The existing **Record rehearsal** act clears a ready check; a gaps rehearsal opens its own governed decision; revocation or a changed window re-derives the queue. The Desk prints up to 40 rows and always counts the remainder. Counts roll up into the identity-free brief and the existing absence CSV rows; above the manager altitude names and person ids are withheld. The navigation badge is deliberately unchanged — this is a review prompt, not a readiness verdict, and it schedules or assigns nothing. No setup or schema change.

## 2026-11-08 — An edge lands on the row it names (Session 177, Schema v118 unchanged, [ADR-0131](./docs/adr/0131-coverage-record-focus.md))

Following a cross-module link into the coverage family now lands on the **exact record**, not the top of a panel. Every typed edge to a cover declaration (`?cover=`), a dated absence (`?plan=`), a standby answer (`?answer=`), a rehearsal record (`?rehearsal=`), or a branch reading request/answer (`?ask=` / `?reading=`) carries the record's id, and the owning panel highlights exactly that row — at every altitude, with the redaction wall intact (a director's focused row still prints no cover name, and a branch row still carries no seat id and no table position). When the record is not in the rows your seat may read, the panel prints an honest note and highlights nothing rather than widening scope; a standby answer that lives in your own "For me" chair gets a pointer carrying the same id; a rehearsal older than the printed 40 rows is brought into view. Opening a link never writes anything. Also fixed: a published branch reading's graph label printed `published undefined` instead of its date, and a declined reading printed "null" instead of its answer word. No setup or schema change.

## 2026-11-07 — The branch reading hand-off (Session 175, Schema v118, [ADR-0129](./docs/adr/0129-branch-reading-handoff.md))

On `#/duty-cover?panel=readings`, a withheld branch cell stops being a closed question. ADR-0126 withholds a direct branch below the disclosure floor so a rate cannot describe the few people inside it — and that left the chief holding no continuity signal at all. The cell now carries a governed hand-off: the chief **asks that branch's own leader** for a reading (one level down, one open ask per branch, with their reason recorded), and the leader answers with the **band their own register grades into** — `holding`, `thin`, `exposed` or `cannot say` — plus their own words, on a dated day. The band is **computed by the register at publish time and frozen**, never typed: the publish command accepts no band input at all, so no form and no hand-edited file can substitute a reassuring one. Only the band and the words cross; the counts behind them stay in the branch's register. `asked` / `overdue` / `published` / `declined` / `lapsed` / `withdrawn` are derived on every read from the two ledgers and today, so a reading **lapses** after the declared validity window (default 30 days) and the chief must ask again, and a **revoked** reading falls back to asked rather than keeping a band nobody stands behind. A **decline is an answer**: recorded, printed with its reason, counted — and it opens no governed decision. Each act is one atomic write with its typed edge (`requests-reading-from`, `answers-reading-ask`), a roll-up per span above the seat that acted, and an audit event; answers are refused twice — in the action and again by the fail-closed schema on reload — for a third party, a pre-dated answer, an orphaned ask, a missing or invented band and a wordless answer. The desk gains a **Reading from the branch** column with the one open act on each withheld cell, the CSV gains the derived state per cell plus counts (BLANK, never 0, for a cell nobody asked about), and the badge counts an overdue ask the seat **owes** and a lapsed reading on its own table. The upgrade adds both ledgers empty at Schema v118; no ask and no disclosure is back-filled. Two conventions (response window, validity) are declared, clamped and re-declarable only by a rank-4+ full-access seat. Nothing is scheduled, reminded, escalated or auto-assigned. Seat selection is not authentication; this is primary + complementary suppression plus a governed release channel, not differential privacy.

## 2026-11-07 — Explicit cover rehearsal records (Session 174, Schema v117, [ADR-0128](./docs/adr/0128-explicit-cover-rehearsal.md))

On `#/duty-cover?panel=plan`, cover exercise evidence is no longer only inferred from dated work: a seat that was there — the duty holder, the named cover, or a manager above — can now record that the stand-in actually **practised the duty** on a dated day. Each rehearsal declares the mode (walkthrough, shadow, supervised, handover) and the outcome: **ready** grades the cover `rehearsed` above any inferred evidence and prints `rehearsed <day>` on the exercise badge; **gaps** holds the duty line thin, prints `rehearsal found gaps <day>`, and opens a governed decision quoting the recorder's words verbatim, reviewed before the absence starts. A cover attesting themselves is allowed and permanently marked *self-reported*. The plan panel gains an **Explicit rehearsal records** ledger (ready / found gaps / revoked counts, the recorder's words where you are in scope, revocation by the recorder only) and a **Rehearse** action on every declared cover. Counts roll up through the absence report, the declare decision, the scan and the upward brief; above the manager altitude the record id and notes are withheld and counts survive. A rehearsal from the future, from memory older than 60 days, or from a seat that was not there is refused — and dropped again on reload, so a hand-edited file cannot invent an observer. The upgrade adds an empty ledger at Schema v117; no rehearsal is ever back-filled, and inferred-work evidence (`evidence <day>`) still grades `valid` exactly as before wherever no drill was recorded. Nothing is scheduled, reminded or auto-assigned.

## 2026-11-07 — Cover exercise tied to the exact absence window (Session 171, Schema v115 unchanged, [ADR-0125](./docs/adr/0125-window-specific-cover-exercise.md))

On `#/duty-cover?panel=plan`, a dated absence now asks the handover question precisely: **did this cover practise this duty in time for these dates?** The plan prints a preparation evidence window ending the day before the absence starts. A cover counts as exercised only when a record of that duty's declared sources touches the holder's span, falls inside the preparation window, and is already recorded by today. Closed work counts; future-dated work, work after the cutoff, stale work and unrelated duty sources read thin with their reason. Held 1:1s count for coaching; an overdue-cadence synthesis does not. The finding rolls up through the same absence report, concurrency sweep, governed decision, audit event and upward brief; above the manager altitude the source record id is withheld and counts survive. The standing register remains a separate today-anchored reading. Derived on every read; nothing is stored, scheduled or auto-assigned. No setup or schema change.

## 2026-11-07 — Cover capacity in a shared week (Session 170, Schema v115 unchanged, [ADR-0124](./docs/adr/0124-cover-capacity-in-shared-windows.md))

On `#/duty-cover?panel=plan`, the concurrent-absence card now answers the question behind a single-cover finding: **can that person carry the work?** For each available cover on the shared dates it prints their own open work, the open work they alone inherit from the absent seats, the items already inside their own span (counted once, not twice), and the resulting union graded against the busiest comparable seat in the span — "past observed load", "no recorded headroom", "inside observed load", or an explicit refusal when the record has no open work to compare. A duty line with several covers is printed as shared rather than split by guess. Declaring an absence that creates an overlap puts the capacity finding on the governed decision in the same transaction, and the upward brief carries it counts-only. Above the manager altitude a cover is named by rank and seat only. Derived on every read from the absence windows, the declared covers and the existing open-work records; nothing is stored, scheduled or auto-assigned. No setup or schema change.

## 2026-11-07 — Concurrent absence exposure (Session 169, Schema v115 unchanged, [ADR-0123](./docs/adr/0123-concurrent-absence-exposure.md))

On `#/duty-cover?panel=plan`, the absence ledger now sweeps the declared absence windows for overlap. Director, VP and chief seats see every shared date range in their span, how many seats are out at once, which duty lines have no available cover on those exact dates (and how many of those carry open work), and — the finding a per-absence plan cannot show — the cover who would be the **only** answerable person for two or more absent seats. A declared cover who is themselves out on the same dates reads as a conflict, not as coverage. Above the manager altitude the cover is named by rank and seat only; frontline seats see their own window and receive a printed refusal rather than a false all-clear. Declaring an absence that creates an overlap puts the finding on the governed decision in the same transaction, and the upward brief carries it. Nothing is stored, scheduled or auto-assigned, and windows that merely touch are not counted as overlap. No setup or schema change.

## 2026-11-07 — Branch continuity comparison (Session 164)

On `#/duty-cover`, director, VP and chief seats can compare their direct leadership branches' duty-register coverage, uncovered lines and open-work gaps. The pooled rate and mean branch rate are shown separately; branch numbers are anonymous and can change with the roster. This describes recorded coverage, not the probability of disruption. Duty holders cannot be their own absence cover; legacy self-declarations remain visible as ineligible until revoked. Dated absence plans (Session 167) and concurrent-absence exposure (Session 169) now sit on the same panel. Seat selection is not authentication; small anonymous branches can be inferable.

## 2026-11-07 — Cross-team work reaches the right manager (Session 162, Schema v113 unchanged, [ADR-0120](./docs/adr/0120-shared-multi-span-ownership.md))

Routing and ownership now consider **every** affected team, not just the first pair. A blocker naming people under several leads is assigned to their lowest common manager; the existing case automation creates the mitigation and rolls the receipt up to director/VP with altitude-appropriate disclosure. Capture merge and jurisdiction use the same shared computation. No setup or schema change. Historical approvals are not rewritten, and choosing a local seat is still not signing in.

## 2026-11-07 — Stakeholder briefs from adopted Command Flow cases (Session 158, `#/mission?panel=capture`)

After adopting a case or a cross-span consolidation, the **owning director, VP or chief** can select **Preview & draft for a named recipient**. Enter a real name and role, assess power/interest (1–5) and stance, preview the exact case-sourced brief, acknowledge its gaps, then create an **unsent** draft. Review/edit/approve/dismiss it on the same case card; **Record external delivery** only after sending the approved text elsewhere. Editing revokes approval. The ordinary case automation links exact-name matches to the stakeholder register and rolls the case up the reporting tree; other seats cannot read the preparing note or its private outbox. No email is sent and the local operating seat is not authentication. For multiple recipients, repeat the reviewed flow; bulk selection remains in progress.

## 2026-11-07 — One constraint across spans, one LCA-owned case (Session 157, Schema v112 unchanged, [ADR-0116](./docs/adr/0116-cross-span-capture-merge.md), `#/mission?panel=capture`)

When two or more leads or managers in separate branches describe the same
constraint in Command Flow, their **Lowest Common Ancestor** (manager, director,
VP or enterprise root) now receives a privacy-preserving consolidation proposal
with a 16-hex `dedupeFingerprint` — built from Fellegi–Sunter category blocking,
Broder weighted Jaccard over roster-name-stripped one-way shingles, and ADR-0113
`prepares-for` / goal lineage edges — without ever copying raw notes, sentences
or IC names across spans or upward. The LCA confirms (or declines with a
recorded reason), edits every proposed action word-by-word (ADR-0114), rehearses
in the disposable worker, and adopts **one** LCA-owned case + **one**
coordinated bundle while settling constituent captures to `merged` with full
`RULE-MIS-01` vertical provenance in the same atomic write.

## 2026-11-06 — Is the shape of the work changing? (Session 156, Schema v112 unchanged, [ADR-0115](./docs/adr/0115-cross-week-jurisdiction-drift.md), `#/jurisdiction?panel=drift`)

A VP forecasting quarterly coordination risk and a chief reviewing
cross-division exposure now get a **dated series, not a snapshot**. The
Jurisdiction Compiler had frozen one identity-free span reading per ISO week
since ADR-0109, but never compared weeks. The new **Cross-week drift** panel:

- prints the **pooled cross-branch share** beside the unweighted **mean of unit
  rates**, with their composition gap (Yule/Simpson aggregation bias) — a span
  count that changes after a reorganisation moves one without moving the other;
- grades both the share and the median coalition size with a **distribution-free
  split-conformal band** (Vovk et al. 2005): `k = ceil((n+1)·coverage)`, the
  achieved finite-sample coverage printed beside the nominal one, refused below
  four frozen weeks, refused when `k > n`, and never interpolating an unsampled
  week;
- scopes by the seat's own reporting subtree and prints that altitude's own
  question — frontline and manager read their span, director their unit, VP
  their function, chief the enterprise — with identity-free brief and CSV;
- on a published crossing, `RULE-JUR-05` opens **one** governed,
  marker-idempotent decision per ISO week on the shared post-commit spine with
  `rolls-up-to` edges to executive seats. It never redraws a boundary, never
  edits a reading and never accepts itself. Press **Scan & govern drift**.

Declared conventions (week floor 4, coverage 66%, 16-week look-back) are
clamped, printed and re-declarable through the existing full-access
**Conventions** command. Readings frozen before this session have no objective
denominator and **refuse** their share rather than back-filling a number. A band
crossing is an anomaly under *declared* exchangeability, not a causal finding.
No new collection, migration, rule registration or CSV scope.

## 2026-11-06 — Command Flow, word by word (Session 155, Schema v112 unchanged, [ADR-0114](./docs/adr/0114-reviewed-command-editing.md), `#/mission?panel=capture`)

The largest Command Flow UX gap is closed: before a response is rehearsed, the
person approving it now reads — and can change — **every proposed action's
exact words**. The decision's name, question and **2–5 named options** with
pros and cons; the delegation's name and expected outcome; the premise's name,
statement and the **falsifiable signpost** that will grade it (RAND
assumption-based planning); the coaching subject/prompt. An option list with an
unnamed option is refused, never silently replaced; edits are fingerprinted
with the rest of the proposal, so touching a word after a rehearsal blocks
adoption until it is re-rehearsed; the approval card prints the exact words
(and option labels) that adoption will freeze. The decision is still never
chosen for you.

Also closed: the authority contradiction Session 154 hit. The rank-2 Mission
profile had offered `premise` since ADR-0105 ("manager adds premise") while
the shared `test-assumption` right read rank 3–5. The right now reads **2–5** —
frontline (rank 1) is refused in both places, unchanged. No new right; the
capture path uses the same shared engine as everything else.

**Honest limits:** edits live on the preparing seat's capture record; bounded
lengths only; real-browser/assistive-technology walkthrough remains
**[UNVERIFIED]** (jsdom + axe-core ran clean on the rendered editor).

## 2026-11-06 — The Boundary-redraw rehearsal (Session 152, Schema v111 unchanged, [ADR-0112](./docs/adr/0112-boundary-redraw-rehearsal.md))

`#/jurisdiction?panel=redraw` — a **dry run** of an organisational boundary
change for Directors, VPs and the CEO, the pre-acceptance instrument behind
the compiler's `redraw` governance route. Pick up to three reporting-line
moves (person → destination span, or the workspace leader); LeadOS re-harvests
every open case, call and funded item on a cloned roster, re-prices every
cross-branch objective, and diffs the two books. You see which
shared-objective gaps **collapse**, which **new** cross-branch objectives the
redraw would tear open, which merely **move** (ancestor rung, coalition,
rungs, predicted route, declared coordination units with a declared-unit
break-even), which persisted `rolls-up-to` edges would change audience —
edge by edge, for frozen findings and span readings — and which unsettled
governed decisions would go stale (`gap-closed` / `lca-moved`). Refused moves
are printed verbatim (a person cannot be re-parented under their own
descendant). **Nothing is written, moved or accepted** — accepting an actual
redraw remains a separate human decision. Declared seats without full access
rehearse inside their own span with objective pointers as ordinals and
out-of-span roll-up targets masked; rank 1–2 seats see an explanation, not
the form. Also fixed on the same surface: the jurisdiction **Export aggregate
CSV** button could never download (wrong `serializeCsv` / `downloadText`
contracts — the same defect class fixed in `#/succession`); it now works with
a copyable fallback.

## 2026-11-06 — Objective-pointer hygiene in the Jurisdiction Compiler (Session 151, Schema v111, [ADR-0111](./docs/adr/0111-objective-pointer-hygiene.md))

`#/jurisdiction` now adds a fifth panel — **Pointer hygiene**
(`#/jurisdiction?panel=hygiene`) — closing the sample-selection blind spot
(Heckman 1979) where open work records with no objective pointer were silently
excluded and dangling/dropped goal ids could be priced as live mandates. Every
open case, call and funded item is now accounted for (`anchored`,
`unanchored-work`, or `dangling-objective`) with Wilson (1927) completeness
bounds. Frontline leads and mid-managers get a `Touching my span` Map filter and
one-click **Anchor goal / Re-point goal** (`jurAnchorWork`) inside their own
span, writing persistent `impacts-goal` graph provenance and waking
`RULE-JUR-01` in the same atomic commit; Directors, VPs and the CEO receive
identity-free, small-cell-suppressed completeness and refusal counts across
altitude tables, the board synthesis and CSV scope #103.

## 2026-11-06 — Who can actually resolve work that crosses two teams? (Session 149, Schema v111, [ADR-0109](./docs/adr/0109-jurisdiction-compiler.md))

Open `#/jurisdiction` and press **Compile now**. LeadOS reads the open cases,
open calls and funded portfolio items you already recorded, groups them by the
objective they already point at, resolves each to its responsible span on the
existing reporting tree, and finds the objectives that no single seat holds
whole. For each one it prices exactly three governance routes in declared
coordination units: a **minimal covering coalition** (Riker 1962; k(k−1)/2
Coase 1937 handoff pairs), an **escalation to the lowest common ancestor**
(Ashby 1956; one declared cost per rung lifted) or a **one-off boundary redraw**
(Williamson 1975). Confidence is a Wilson (1927) lower bound on how much of the
cluster the reporting tree can place — not a rating of anyone. Route probability
is a Luce (1959) softmax over −cost; a route is recommended only when it beats
the runner-up by a declared materiality band, so a tie prints as a tie.

Nothing here moves a reporting line. `RULE-JUR-01..04` run on the same shared
post-commit spine as every other LeadOS module: one write freezes a governance
finding with a `spans-work` edge to **every** case / decision / funded-work
member and a `rolls-up-to` edge to **every** leadership ancestor, opens exactly
one governed "who holds this?" decision carrying all three priced routes, grades
the predicted route **once** out of sample by Brier (1950) skill against a 0.5
base, and freezes identity-free small-cell-suppressed readings at every rung
from frontline to chief. Zero manual re-entry. Silence is never consent.

For the frontline lead the page asks who would have to agree before a plan can
change; for the manager it counts handoffs; for the director it compares
coalition versus escalation; for the VP it reads self-inflicted coordination
load; for the CEO it reads the enterprise share no single seat can resolve plus
an auto-generated board-ready synthesis — five genuinely different operating
pictures from ONE record. CSV scope #103 exports aggregates only: no objective
key, no member id, no person, no span label, no title, no note; a refused rate
and a suppressed cell are BLANK, never zero. Four panels, declared/clamped
conventions on the Method panel, and seven named frameworks implemented rather
than name-dropped.

Honest limits are printed in-product: a seat is an auditable declaration, not
authentication; suppression is not differential privacy; coordination units are
declared conventions, not money; a grade is an association, not a causal claim.

## 2026-11-06 — What your authority costs, priced against your own record (Session 148, Schema v110, [ADR-0108](./docs/adr/0108-decision-fit.md))

LeadOS now answers the question every other product in the category skips. Decision
Tempo measures a latency; the Escalation Economy measures what an escalation costs.
Neither asks what a leader is actually judged on: **this call cost seven days at
£4,200 a week — if I had delegated it one rung down, what would I have saved, what
would that have risked, and does my own dated record show my judgement of what I
must personally hold beating a rule that does not use my judgement at all?**

The **Decision-Fit Ledger** (`#/fit`) answers both halves:

- **A declared price on authority.** Five authority classes, each with a *floor* — a
  floor, not a ceiling: above it any rung may hold the call, which is what makes
  delegation an option at all. For every open call: the expected hold at the owning
  rung against each candidate rung, the wait saved, the error price of moving evidence
  a rung away, and the **monitoring cost of every extra rung crossed**. Net of all
  three, stock-denominated, with the arithmetic printed so it can be checked.
- **A measured contested share against the leader's own record**, own-held calls only,
  Wilson interval, refusing below its disclosure floor instead of printing a share of
  two — and a naive-rule benchmark that compares the leader's real allocation to
  "hold everything" and "delegate everything" on their own settled cohort.

Four rules on the **same** event spine: `RULE-FIT-01..04` freeze, propose, grade and
roll up. A proposal never moves work — it opens a governed decision a human must
accept. **Silence is never consent.** A frozen frontline snapshot reaches the chief
through the existing `rolls-up-to` relation with no manual re-entry.

The five-rung demo ladder is new too. The roster was two altitudes deep, so three of
the five rungs could never be exercised and every hierarchy claim in the product was
demonstrated on the shallowest possible org. Priya → Samuel/Mei → Rafe → Ingrid →
Alex Rivera, owning **no** pre-seeded work of their own: everything above the manager
rung is derived from records below it, which is the property the hierarchy claim rests
on and the one a hand-seeded executive dashboard would quietly fake.

**What building it found.** Four defects, and the third is the important one. The
ledger priced *its own audit output*: a scan runs every module's pass, so 54 governed
findings were opened in the same transaction and then each got an authority
classification — 13 → 40 → 67 snapshots across passes. That is the Session-143
second-order-decision regression reappearing in a new module, and it was fixed the
same way, from state rather than by import. The naive fix created a **cross-module
import cycle whose bindings are undefined at evaluation time** — no error, no warning,
a converged and completely empty book: a green, quiet, wrong result. Also fixed: a
holder below their class floor got an *empty* ladder (rendered as "no alternative
exists" when the truth is "the holder cannot lawfully grant this"), now priced as an
escalation; and scans that appended instead of converging. Full detail in ADR-0108 §7.

**Honest limits.** `scoreAllocationRules` still refuses with `paired: 0` — it joins the
open book only, so the paired comparison has no settled cohort yet; the refusal is
printed, not faked. Seats are declarations, not authentication. The grade panel renders
its empty state because the demo's one material move has not yet outlived its rung's
expected hold. Full real-browser accessibility remains [UNVERIFIED].

## 2026-11-06 — Evidence closes the loop, and now the loop grades the belief (Session 147, Schema v109, [ADR-0107](./docs/adr/0107-outcome-learning-loop.md))

LeadOS now remembers **what you expected before you acted**. Mission Control →
**Learning** (`#/mission?panel=learning`) freezes the reviewed Command Flow
confidence when a coordinated response is adopted, grades it exactly once when
dated terminal evidence and a human decision review close the loop, and rolls a
suppressed, identity-free view up every leadership rung — frontline → manager →
director → VP → CEO — on the same event-driven spine that already propagates
cases, decisions, delegations, budgets and coaching.

Statistics are declared, never invented: Brier proper score against a
strictly-prior 0.5 base, Wilson intervals, a one-sided split-conformal delay
bound that refuses an unidentifiable coverage level, and a reference-class
outside view shrunk toward 50% and refused on a thin record. A good outcome on
thin delivery is printed as **lucky**, not earned. A missing forecast or a
postdated review is a stored **refusal**, never a zero. Decision Tempo prints
the published outside view beside your declared forecast; CSV scope #101
exports aggregates only. `record-outcome-learning` works at every rank;
`govern-outcome-learning` needs director+ and full enterprise access.

Everything remains local-first, zero-build, keyboard-native and fail-closed on
corrupt data. Honest limits: local seats are not authentication, suppression is
not differential privacy, grades are associations rather than causal claims,
and a real-browser accessibility walkthrough is [UNVERIFIED]. See
`AI-SESSION-LOG.md` for the actual verification record.

## 2026-11-06 — Transactional savepoint integrity

The shared copy-on-write automation savepoint now respects a deleted top-level field on subsequent reads, preventing accidental resurrection at commit. Targeted tests cover eager/lazy parity, reassignment, successful event subscribers and failed-rule rollback. Existing frontline case propagation and hierarchy roll-up fixture passes. This is a reliability fix, not a new analytics module; local seats are not authenticated access control. Full suite and browser accessibility [UNVERIFIED].

## 2026-11-06 — Evidence closes the loop; the workspace leads with your altitude (Session 146, Schema v108, [ADR-0106](./docs/adr/0106-evidence-execution-loop.md), `#/mission?panel=execution`)

**Adoption was atomic; closure was not.** Session 145 could adopt a case + coordinated actions in one transaction, but the bundle stayed `committed` after the decision was reviewed, the delegation completed and the case resolved. `RULE-EXE-01` now re-derives every adopted bundle from **dated terminal evidence** through a per-kind registry: fulfilled, explicitly stopped, blocked, missing or pending. Returned work, released money, dismissed comms and deleted coaching prompts are never delivery. When the human-resolved source case and every action agree, the loop closes and only the engine-authored review checkpoint is completed — with a system note, never an invented human outcome.

**The same graph, every altitude.** Closure writes `rests-on` proof pointers and one `rolls-up-to` per leadership ancestor through the existing link engine. Mission Control's new **Execution evidence** panel shows proof rows and a receipt at frontline/manager detail, and suppression-safe intervals + drill links above the individual-detail ceiling. Ownership now follows the accountable leader (`executionOwnerNodeId`) instead of escalating a lead-owned case one rung through the generic people-LCA.

**Role-first navigation.** The sidebar pins Mission/capture/execution/altitude, then leads with the declared seat's duties (or a core workflow for the operator), with collapsed catalogue sections and a search over permitted tools only. The same `workspaceRouteVerdict` gates links and direct navigation; native details + labelled search keep it keyboard-native.

**Frameworks.** PDCA closure gate; evidence-based management (Pfeffer & Sutton); Jaques' requisite organization / strata for altitude duties; event-sourced reconciliation with idempotent fingerprints; Wilson/Jeffreys-style bounded disclosure inherited from Mission (counts are intervals above the detail ceiling, never exact internal counts). No new dependency.

**Verification:** new `execution-loop` **8/8** + `workspace-navigation` **3/3**; targeted Mission/Bundle/Seat batch **44/44**; `npm run lint` exit 0; `check:boundary` 527 modules / 151 suites / 23 doc checks / 0 violations; `check:links` green; schema v108 additive with fail-closed execution markers; standalone rebuilt at v108. Full canonical suite result is recorded in `AI-SESSION-LOG.md`. **Honest limits:** reconciliation is not a causal forecast; seats are workflow declarations, not authentication; real-browser AT walkthrough **[UNVERIFIED]** (jsdom + axe-core ran); vendor capabilities not audited.

## 2026-11-06 — Mission Command Flow: describe it once, adopt the whole response together (Session 145, Schema v107, [ADR-0105](./docs/adr/0105-mission-command-flow.md), `#/mission?panel=capture`)

**The join was the gap.** Intake could classify a note; Cases could register a situation; Action Bundles could rehearse and adopt coordinated commands; Mission Control already had five altitude-specific operating loops. But the handoffs were separate transactions. A leader could create a case and lose the response, or adopt a response whose source facts had moved. Command Flow closes that seam: **one reviewed note → one case + coordinated actions + typed hierarchy provenance, in one atomic write**.

**The same transaction rehearsed and live.** `transactMissionCapture` is called by the disposable worker and by live adoption. It reserves the case/bundle ids, creates the case through the existing `addCase` API, stages the closed-vocabulary bundle through the existing adapters, delivers every source event to the generalized post-commit spine, and refuses if the live footprint differs from the rehearsal. Any command, rule, target or fingerprint failure rolls back everything. `RULE-MIS-01` writes `responds-to`, `coordinates` and one `rolls-up-to` per leadership ancestor — cross-module propagation and cross-altitude roll-up in the same commit, with no second hierarchy engine.

**Role-tiered, not a generic form.** Every proposed action's words are editable before rehearsal (Session 155). Frontline: decision, owned checkpoint, coaching prompt. Manager: adds a testable premise. Director: adds stakeholder-brief eligibility (still refused until real stakeholders exist). VP/CEO: adds an explicit budget commitment against an eligible envelope. The classifier is the existing local weighted-lexicon/NegEx engine; its percentage is a shrunk heuristic score, **not** a calibrated probability. Budget amounts are never inferred from extracted loss text. Confidential conflict language is refused before any write.

**Privacy by construction.** The raw note and evidence stay with the preparing seat. Ancestors receive governed work and typed provenance, not the note; the case summary does not copy it. Generic projections zero `missionCaptures`; gateway and mixin both enforce ownership. Individual detail stops above rank 2. Seats remain workflow declarations, **not authentication**.

**Verification:** new `mission-command-flow` suite **9/9**; targeted Mission/Bundle/Seat/Intake/Diligence batch **90/90**; `npm run lint` exit 0; `check:boundary` 522 modules / 149 suites / 23 doc checks / 0 violations; `check:links` 849 links / 222 files / all resolve; standalone rebuilt at schema v107. Full canonical suite launched and running at the time of this entry — see the session log for the final result. **Honest limits:** no vendor capability was audited; real-browser AT walkthrough is **[UNVERIFIED]** (jsdom + axe-core ran); software rehearsal is not a causal forecast of delivery, morale or financial benefit.

## 2026-11-06 — The Diligence Ledger: did we look before we leaped? (Session 144, Schema v106, [ADR-0104](./docs/adr/0104-diligence-ledger.md), `#/diligence`, CSV #100)

**The gap Sessions 142 and 143 both named and neither closed.** The Hindsight Lock can only see a link that was made: a leader who read a fact, judged it irrelevant and never linked it looks exactly like a leader who never looked. The Epistemic Ledger harvests unread signals from the record but still cannot say "we looked at X" at decision time. `#/diligence` makes that act a first-class, dated, append-only record — `used`, `deferred` and **`ruled-out` with a required written reason** all count as diligence — and freezes the **KNOWABLE SET** it was performed against.

**Frozen in the same atomic write as the decision.** `RULE-DLG-01` on the shared post-commit spine (85 rules / 85 contracts) harvests typed, dated POINTERS from five evidence classes other modules own — cases, premises, delegations, goals and strictly-earlier settled decisions — and writes one `diligence-for` edge, one `deliberates-on` edge per fact and **one `rolls-up-to` edge per leadership ancestor** in the single transaction that records the call. A frontline decision therefore reaches manager → director → VP → the enterprise aggregate with **zero re-entry**, through the same generalised `ensureEntityLink` engine every other module uses. No per-module glue, no second roll-up engine.

**The maths is named and it refuses.** Coverage = Wilson (1927) score interval on the consulted share, **REFUSED** below the declared knowable floor (BLANK, never zero). Class inattention = an **exact Jeffreys Beta(½,½)** equal-tailed 90% credible interval via the regularised incomplete beta (Lanczos log-gamma, continued fraction, bisection), not a normal approximation; a class whose whole upper bound sits below the declared ceiling is **DARK** — the evidence class this organisation systematically walks past. A leader may pre-register a **process forecast** before settlement; `RULE-DLG-04` grades it exactly **ONCE**, out of sample, by Brier (1950) skill against a strictly-prior maximum-entropy 0.5 base rate, and prints a **negative** skill rather than hiding overconfidence. Every statistic is pure and exported so a test can check it by hand.

**Not a checklist app, not a score.** A checklist asks a human to type what they remember; this derives what the record already held. No per-person diligence score, no sentiment survey, no composite index, no LLM-invented risk, no back-filling a frontier at upgrade (an empty ledger honestly means *nothing has been frozen here yet*), no forecast declared after the fact, no automatic closing of a human decision.

**Governance and disclosure.** `record-diligence-consult` (rank 1–5) records at the acting span; `govern-diligence` (rank 4–5 **and** a full-access seat) re-declares the eight clamped conventions. `MODULE_MANIFESTS.diligence` is adapter-scoped with **`detailCeiling: 0`** — raw fact pointers and written reasons never enter a declared-seat projection. CSV #100 is aggregate-only: one summary, one row per class, one per altitude, one per once-only grade; refused cells BLANK; no frontier id, decision id, person or note. The upward brief is identity-free. Schema v106 is additive; existing workspaces upgrade with empty ledgers.

**Verification:** `diligence-ledger` **17/17**; `borrowed-evidence` **36/36**; `assurance` **10/10**; `disclosure-compiler` **21/21** with the new route in the four-seat leakage oracle; `standalone` **7/7**; `npm run lint` exit 0; source-wide `node --check` 554 files / 0 failures; `check:boundary` 517 app ES modules / **148** suites / 23 doc checks / 0 violations; `check:links` 849 links / 222 markdown files / all resolve. Two pre-existing HEAD cascade failures were diagnosed on a clean `git archive HEAD` copy and fixed with root-event gating plus a bounded explicit-replay budget. See the session log and changelog for the actual full-suite and sync results. **Honest limits:** coverage is bounded by what this workspace recorded, so work nobody logged is invisible; conventions are declared, never fitted; a local seat is a workflow declaration, not authentication; a real-browser assistive-technology walkthrough of the six panels is **[UNVERIFIED]** (jsdom + axe-core is what ran).

## 2026-11-05 — The Epistemic Ledger: what the record already knew and nobody read (Session 143, Schema v105, [ADR-0103](./docs/adr/0103-epistemic-ledger.md), `#/epistemic`, CSV #99)

**The question the category sells a survey for.** Every 2026 people-analytics instrument (Viva Glint, Culture Amp, Lattice, Workday, Visier) measures *perceived* blind spots by self-report, and the adversarial-reflection category sells one-off exercises — devil's-advocate boards, pre-mortem councils, LLM "unknown-unknowns" workshops. None of them reads the organisation's own dated record to find what it is **already carrying and has not opened**. `#/epistemic` does, and it refuses to print anything its own floors cannot carry.

**Nothing is invented and nothing is copied.** Seven signal classes are harvested from records other modules own — an ageing risk case, a premise the record has breached, an overdue delegation, an unclosed feedback follow-up, an at-risk goal, a stalled performance conversation, a bad decision outcome. Each freezes **one** unknown per source record, with an id hashed from `(class, sourceType, sourceId)` so a rescan cannot duplicate it, carrying a `rests-on` pointer and **no** record content. A human declaration is a different `origin` and is never conflated with a harvest.

**The unknown is a graph node in the same transaction.** `RULE-EPI-01` on the shared post-commit spine writes one `rests-on` edge to the source record and **one `rolls-up-to` edge per leadership ancestor** — the atomic transaction that notices a missed signal is the one that makes the missed signal visible above the span that missed it. `RULE-EPI-02` escalates an unopened danger/defect unknown past the declared age into exactly ONE governed decision, ever, aged from the *condition* (`evidencesOn`) rather than from the bookmark — and, since [ADR-0117](./docs/adr/0117-bounded-epistemic-backlog.md), bounded to the declared **weekly escalation budget per span** (`epistemicEscalateMaxPerWeek`, default 5) so a harvested backlog drains as a weekly batch instead of flooding every save: oldest condition first, one quota per ISO week shared by every transaction (scans included), and the over-budget remainder **deferred and printed** with its renewal week — a queue, never a silence; `RULE-EPI-03` marks an unanswered unknown `expired` when its declared, evidence-bound window closes and prompts once per ISO week — **expiry is never resolution**; `RULE-EPI-04` opens one calibration review per span where pooled belief-vs-record disagreement over-predicts good outcomes; `RULE-EPI-05` grades a frozen belief exactly once.

**The overconfidence index is direction-first.** Cohen's κ (1960) on the belief × record 2×2 with the Byrt–Bishop–Carlin / McKenna–Myers prevalence and bias indices and PABAK (Feinstein–Cicchetti 1990), **refused** below the paired floor and where one cell carries the table. An optimism gap is handed *up*; under-confidence is handed *down*; no averaged index is ever substituted for two indices pointing opposite ways. A belief about work the record has already settled is refused at write time — that is a memory, not a forecast.

**The implied ledger prices silence.** Per span, the ratio of measurable activity that produced **no** arriving edge, with the rule of three (Hanley–Lippman-Hand 1983) as the upper bound where nothing arrived. The unit is the unknown, the span, the class and the cell — **never a person**.

**Schema v105 additive (104 → 105); CSV #99 aggregate-only, identity-free, BLANK never zero; rights `record-epistemic-unknown` (1–5) / `govern-epistemic` (4–5 **and** full access); 84 rules and 84 contracts.** Suite `epistemic-ledger` **18/18**; targeted batch of four suites **104 tests, 0 failures**; lint and boundary green. Honest limits: coverage is bounded by what this workspace recorded, so **work nobody logged is invisible** — printed in-product; the conventions are declared, never fitted; seats are workflow declarations, not authentication; real-browser AT walkthrough **[UNVERIFIED]**.

## 2026-11-05 — The Reputational Capital Ledger: what an act costs to be believed (Session 141, Schema v103, [ADR-0101](./docs/adr/0101-reputational-capital-ledger.md), `#/reputation`, CSV #97)

**The question the category does not answer.** Every people-analytics product measures *structure* (spans, layers — Orgvue, ChartHop) or *survey sentiment* (engagement, eNPS — Culture Amp, Lattice, Viva Insights). Neither answers what a leader must know before delegating anything real: **if I make this ask, will it hold, and if not, exactly what is missing?** `#/reputation` answers it as a **price**, not a personality test.

**Eight act classes, harvested — never self-reported.** Delivery, custody, calibration, stewardship, continuity, allocation, prediction and contribution are read from records other modules already dated (a returning delegation, a verified authority contract, a bet graded out of sample, an absorbed escalation, …). A person may record a manual act for work LeadOS cannot see, and **a hand-typed twin of a derived act is refused** — nobody manufactures their own stake.

**Wilson, in beta space, over a declared anchor.** `wilsonBeta(9,1)` → `[0.5958, 0.9821]`, with the textbook identity `α + β = n + z²` intact. The class hazard is **declared and printed beside the record**, decayed half-life-wise. The verdict is read off the **interval**: `solvent` / `encumbered` / **`drawn-down`** (the record is worse than the base rate — a fact about an act class, never a verdict about a person) / `contested` / `expired` / `refused`, each refusal naming its own reason and never printing a zero.

**WILSON-FIRST.** An anchor may never decide the verdict alone. The prior is put through the same estimator and, if *its own* interval already clears the obstacle, the cell is refused with the anchor's interval printed.

**The ask is priced, and the ladder is honest.** `obstacle = 100 − (100 − base)·e^(−γ·max(0, ln(ask/stake)))` across four engagement tiers — **vouching 85 / bearing 60 / escrowed 35 / structural 15** — the Grossman–Hart argument that the further an ask moves off a person onto a mechanism, the lower the kept rate the record must clear. Every counterfactual prices all four and names the cheapest honest route in **acts**, not probabilities.

**The ledger grades itself.** A guarantee freezes `claimP` at open; when its tagged source settles, RULE-RCL-05 scores the ledger's own error **once**, `(claimP − y)²`. A position opened with no readable interval carries `claimP: null` and is **refused a grade by name on the audit trail** — a claim written after the outcome is not a claim.

**On the shared spine.** `RULE-RCL-01..05` on `DEFAULT_POST_COMMIT_RULES` (82 rules) write `rests-on` provenance to every dated source record plus one `rolls-up-to` edge per leadership ancestor in the **same atomic transaction**, open at most one governed decision per span × class × ISO week, and close repairs only from banked acts. No cell, rate or verdict is stored — every figure is re-derived on read.

**Seven defects were found by the tests and repaired in this session**, all in code written this session: WILSON-FIRST put the *record* on trial instead of the anchor (and so refused every good cell); `this` was lost through the access gateway's `(...args) => fn(...args)` wrapper, so opening any position would have thrown; the spine scoped to `LEADER_ID` and never saw the org; `seat.subtreeIds` is empty on every real seat (`seat.scope` is the populated primitive), so a declared lead could not see its own ICs; `Number(null) === 0` graded a phantom 0% claim after the outcome was known; a calibration guarantee could never settle because Brier grades live in `prospectiveGrades`, not on the contract; and the rule never fired on source events, so only a human pressing Scan could ever settle a guarantee.

**Schema v103 additive (102 → 103); CSV #97 aggregate-only, identity-free, BLANK never zero; rights `record-reputation-act` / `offer-reputation-guarantee` / `govern-reputation`; 8 safe reads; `rests-on` added to the link vocabulary.** Suite `reputational-capital` **16/16**; lint, boundary and doc-link checks green; two suites (`span-calibration`, `disclosure-compiler`) fail identically on the base commit and are **not regressions**. Honest limits: the hazard, half-life and γ are declared conventions, not estimates; work done outside LeadOS reads as silence, not breach; seats are workflow declarations, not authentication; there is no composite score or ranking; real-browser AT walkthrough **[UNVERIFIED]**.

## 2026-11-05 — Router scope and calibration integrity

The Altitude Router now computes its read model, badge, brief and CSV from the active seat's reporting subtree, rather than combining a scoped ledger with workspace-wide calibration. The API no longer accepts a caller-selected seat for this read. Director-and-above router detail **and aggregate calibration are temporarily withheld**, including router brief/CSV and in-router plan entry, pending release-history disclosure control; the existing case-to-module propagation and ancestor links are unchanged. The undeclared local operator retains the full workspace view. This is a deliberate functionality reduction, not multi-user security: a user controlling this browser or backup can access the data, and other surfaces have not been comprehensively audited.

Brier skill compares both forecasts against strictly earlier **days** of graded outcomes; same-day outcomes cannot predict one another. Overall agreement is refused below its configured evidence floor. These retrospective human grades do not validate an individual or establish causal impact.

## 2026-11-05 — The Freeze-Line Continuity Audit: was the org still connected across the reorg? (Session 139, Schema v101, [ADR-0099](./docs/adr/0099-freeze-line-continuity-audit.md), `#/freeze-line`, RULE-FRZ-01..03, CSV #95)

## 2026-11-05 — Reviewed routing integrity

A human altitude override previously changed the ledger label without changing the owner or vertical disclosure path. Confirmation now recomputes the actual seat and disclosure ladder in the case transaction, preserves the original classifier verdict for calibration, applies the existing reporting-span and stakes floors, and checks the local seat boundary against both paths. Unnamed notes start from the declared seat before applying those floors. Paths longer than eight seats now fail explicitly instead of silently losing senior links. Existing overlong plans are not repaired automatically.

This is a local-first, single-operator analytical workspace. Seats are not authentication, and other screens/exports may expose workspace data. Do not use it as a multi-user confidentiality boundary.

Open **`#/freeze-line`** (sidebar → **Freeze line**). Every committed or reverted reorganisation is a dated **freeze line** across the reporting tree; the screen measures, from the same dated artefacts `#/federation` already counts, whether each declared leadership edge carried work on **both sides** of the line, classifies every edge **held / lost / gained / still-silent** by altitude with Wilson intervals and complementary suppression, and prints one governed verdict per line — **held**, **degraded**, or **refused** below the declared edge floor. No surveyed product prints this comparability verdict across a reorg [UNVERIFIED vendor claims recorded in RESEARCH §112]. The standing timing-channel gap is closed in the same pass: suppressed rows print **no carriage date** in the view, in frozen snapshots or in CSV, and RULE-FRZ-03 opens one redaction decision for any legacy snapshot that still carries one. Schema v101 is additive (`100 → 101`); CSV #95 `freeze-line` is aggregate-only and refusal-honest (blank, never zero).

## 2026-11-05 — The Hierarchical Clearinghouse: exact sealed resource clearing (Session 138, Schema v100, [ADR-0098](./docs/adr/0098-hierarchical-clearinghouse.md), `#/clearing`)

LeadOS now includes an Internal Clearinghouse for scarce budget and shared capacity. Chairs declare a single-currency envelope; subordinate spans submit sealed 1–4 tier package schedules; the exact solver compares nominal, Γ-robust and minimax-regret economies, computes N+1 Clarke hurdles, shadow prices, resource-mix posture and a counted certificate, and commits only a certified solution. A minimum-viable tier never forces funding: the exact unfunded choice remains available.

The committed round propagates atomically on the shared spine into governed delivery decisions, span-owned delegations, same-currency budget encumbrances, typed provenance and ancestor roll-ups. Once-only settlement grades realized delivery against the frozen hurdle, with Wilson bounds and prior-only Brier calibration. `#/clearing` is adapter-scoped: invited spans see only their own sealed package, upward readers receive identity-free roll-ups, and CSV #94 / the Markdown certificate are aggregate-only and differencing-safe. Migration `99 → 100` is additive and starts new workspaces with empty clearing ledgers.

## 2026-11-05 — The Calibrated Allocator: exact past the wall, and premises that answer to graded evidence (Session 137, Schema v99, [ADR-0097](./docs/adr/0097-calibrated-allocator.md), `#/robust-allocation`)

Two changes, one property — the allocator now **scales** and **answers for its assumptions**:

1. **Certified branch-and-bound past the enumeration wall.** A plan whose feasible grid exceeds 50,000 combinations is no longer refused: a branch-and-bound with exact rational bounds (integer cross-multiplication, ceiled remainders, strict pruning that still explores ties) proves the same Wald maximin / Savage minimax-regret plans, price of fairness, stress switches and regret release — and prints a frozen **certificate** (engine, nodes explored/pruned, budget) on the Solve panel. One shared node budget (25k–2M, director+ convention) bounds every sub-solve; exhaustion refuses, and unit sum above 40 (reachable at 6 × 8-unit actions) is refused — never approximated. Equivalence with the enumerator is proven by a seeded fixture sweep.

2. **Closed-loop calibration.** A plan action may declare which prospective instrument grades its premise. Settled ADR-0094 grades are read back by altitude × instrument cell — Wilson 95% intervals, the declared cell floor, complementary suppression, the director-rank gate, and subtree-correct coverage (a frontline tension reaches the director whose plan rests on that instrument; a peer span never qualifies). A cell more falsified than reached is flagged **TENSION** on the new Calibration panel; **RULE-RAL-05** opens at most one identity-free governed decision per cell per ISO week, rolled up to every leadership ancestor. The engine **never moves a declared range** — a revision is a new frozen plan (`supersedesId`) declared by a human.

Both `#/robust-allocation` and `#/prospective` now mount the ADR-0096 **publication register** panel, so their printed roll-up aggregates enter the ADR-0092 differencing register as dated, audited releases — a named honest limit of the last two sessions closed. Schema v99 is additive (`98 → 99`); a v98-era adopted plan reads back an honest legacy certificate (`enumeration`, certified, pre-certificate nodes unstated). Two tests that were red on the base commit were repaired truthfully.

**Limits:** exactness inside the certified regime only, refusal outside; a cell reading is graded frozen-threshold evidence — not causality, never a person rating; suppression is not differential privacy; local seats are declarations, not authentication. Focused tests: `node --test tests/app/calibrated-allocation.test.mjs` (9/9), `node --test tests/app/robust-allocation.test.mjs` (19/19).

## 2026-11-05 — Registered terminal publication: every printed table enters the differencing register (Session 136, [ADR-0096](./docs/adr/0096-registered-terminal-publication.md), no schema bump)

ADR-0092 audits a *series* of published aggregates as one integer system — but `#/escalation`, `#/measurement`, `#/cadence`, `#/concordance` and `#/survival` used to print per-table small-cell floors directly, so subtracting two of their tables across days, seats or altitudes was never audited. Now each of the five terminals mounts a **Publication register** panel: **Plan** shows what publishing that module's aggregate right now would determine against every release already registered, and **Publish** writes one dated release per module per day per seat (a same-day repeat is refused by construction — that repeat is the differencing attack itself). Escalation and cadence declare new disclosure manifests so their aggregates are publishable at all. A determined value is reported as a coordinate and a proof, never as the number. Focused tests: `node --test tests/app/terminal-publication.test.mjs` (5/5).

## 2026-11-05 — Robust allocation: the best worst case, not the best forecast (Session 135, Schema v98, [ADR-0095](./docs/adr/0095-robust-allocation-terminal.md), `#/robust-allocation`, RULE-RAL-01..04, CSV #93)

Plugging a point estimate into an optimiser maximises the forecast **and** the error. Open **`#/robust-allocation`** (sidebar → **Robust allocation**) and declare, for your own span, a budget, a leadership-hours cap, the heterogeneous segments you serve (each with a size and an optional equity floor), and 1–6 candidate interventions — each with an honest effect **range** `[lo, hi]`, not a single number. Set `Γ`, the number of ranges that may sit at their worst end at once (Bertsimas–Sim budgeted uncertainty).

LeadOS solves the allocation **exactly** with integer arithmetic — enumerating the feasible grid and the `C(n, Γ)` scenario problems, never sampling — and prints the **Wald maximin** plan (the best worst case) beside the **Savage minimax-regret** plan (the smallest largest gap to the scenario oracle), the optimistic point-forecast plan and its worst case, the **price of fairness** (the worst-case value your equity floor costs), a **stress table** naming which single range would flip the recommendation, and the **exact regret released** by resolving the highest-exposure range first. An over-cap or infeasible plan is **refused with a printed reason**, never approximated.

**Adopt** the plan and the **same shared post-commit engine as every other module** writes, in ONE atomic transaction, a governed DACI decision (the choice, kept separate from the frozen numbers), one owned and dated delivery task per funded line, typed provenance, and one `rolls-up-to` edge to **every leadership ancestor** — frontline → manager → director → VP → chief. Link a Prospective Intervention Contract and, if that pre-registered premise later misses its threshold, a governed **re-allocation** decision opens automatically (one per plan per ISO week); an overdue funded line or an ungraded premise opens its own bounded finding.

Five panels, five altitude-specific jobs (Desk / Plans / Solve / Roll-up / Certificate), an identity-free Markdown upward brief and aggregate-only CSV #93. Money is **never pooled across currencies**; the pooled falsified share is withheld below the cell floor and below director rank with a Wilson 95% interval and complementary suppression. Nothing here rates a person, asserts causality, adopts a plan for anyone or closes a human decision. Local seats are auditable declarations, **not** authentication.

**Honest limits:** the exact solver is bounded (≤6 actions, ≤8 units, ≤50,000 combinations) and refuses larger problems rather than guessing; effect ranges are declared assumptions, not measurements; small-cell suppression is not differential privacy; this module's repeated roll-up releases re-open the temporal-differencing item; vendor comparisons came from web-search snippets, not installed products. Full-app real-browser accessibility remains **[UNVERIFIED]**. Focused tests: `node --test tests/app/robust-allocation.test.mjs` (19/19).

## 2026-11-05 — Prospective contracts: freeze the bet before the work (Session 134, Schema v97, [ADR-0094](./docs/adr/0094-prospective-intervention-contract.md), `#/prospective`, RULE-PIC-01..04, CSV #92)

A retrospective "were we right?" report is unfalsifiable: the population quietly becomes the cases that closed. Open **`#/prospective`** (sidebar → **Prospective contracts**) and declare, **before** doing the work, a probability, a threshold, a horizon and a title. LeadOS freezes the **exact cohort of record ids** from one of four observable instruments — open cases, active delegations, decisions awaiting review, or the 1:1 cadence of the people in your span. The ledger writes into none of those collections; it only reads their dated records later.

That one declaration goes through the **same shared post-commit rule engine as every other module** and, in ONE atomic transaction, creates a governed DACI decision for the actual operational work (kept deliberately separate from the frozen numbers), one owned and dated outcome-evidence task, typed provenance, and one `rolls-up-to` edge to **every leadership ancestor** of the declaring seat — frontline → manager → director → VP → chief. Altitude is a dimension of the existing architecture, not a second system.

At the horizon, **Grade due contracts** resolves each frozen cohort from the records other modules already own and grades it **exactly once** with the Brier proper score `(p−y)²`, comparing each cell's mean score with its own **strictly-prior** sequential base rate. A missing cohort member, an undated completion or a late success **refuses** the grade with a printed reason and one owned reconciliation task — never a silent zero, never a miss. Below the declared cell floor, and below director rank, pooled rates are **withheld** with the reason printed; every published rate carries a Wilson 95% interval; small cells are complementarily suppressed. A miscalibrated or overdue cell opens at most one governed finding per ISO week at the altitude that can change the practice.

Five panels, five different altitude-specific jobs (Desk / Contracts / Instruments / Calibration / Certificate), an identity-free Markdown upward brief and aggregate-only CSV #92. Nothing here rates a person, asserts causality, adjusts a declared probability, closes a human decision or sends anything anywhere. Local seats are auditable declarations, **not** authentication.

**Honest limits:** four coarse instruments reading status and dates only; Brier skill needs a strictly-prior sample, so a new cell publishes counts only; small-cell suppression is not differential privacy; prospective releases are not yet governed by the differencing register; vendor comparisons came from web-search snippets, not installed products. Full-app real-browser accessibility and exhaustive permission walkthroughs remain **[UNVERIFIED]**. Focused tests: `node --test tests/app/prospective.test.mjs` (16/16).

## 2026-11-05 — Decision Robustness Lab

Open **`#/decision-robustness`** (sidebar or Team health → **Stress-test a decision**) to test whether a reversible action survives missing-evidence uncertainty. Declare a 1–5 respondent mean, hypothetical distinct coverage, missing-group bounds, target, intervention cost, loss per point and effectiveness. LeadOS computes **Manski bounds, Savage minimax regret, strict dominance, a cost-switch boundary and coverage sensitivity**. No survey data is automatically read; submission counts are not treated as respondent counts.

Analyze → choose your own response → name an in-span owner and review criterion → approve once. The ordinary case engine creates the **case, DACI decision and task**, with existing hierarchy roll-up. Five altitude-specific prompts and review defaults keep the decision relevant to the operating seat. Only the approved operational plan/rationale travel; numeric assumptions remain an unsaved private worksheet unless explicitly exported. Saved worksheets can be replayed; imported result claims are ignored and recomputed.

**Limits:** conditional scenarios, not confidence intervals, causal forecasts or employee ratings. Local seats are not server authentication. Review free text before sharing. See [ADR-0093](docs/adr/0093-decision-robustness-lab.md). Focused tests: `node --test tests/app/decision-robustness.test.mjs`; optional real-browser check: `node scripts/app-robustness-smoke.mjs` (tool setup in `scripts/app-browser-smoke.mjs`).

## 2026-11-05 — Honest pulse participation bounds

Team health now displays a conditional participation interval rather than mislabeling submission count as a participation floor. The lower bound counts distinct active roster IDs on named submissions; the upper bound assumes all submissions could be distinct active people. Percentages round outward; an empty active roster yields no percentage. **Both bounds assume named identities are truthful**, which this local-first app cannot authenticate. Anonymous submissions can repeat or overlap named ones. Pulse insights now describe complete submissions and explicitly avoid treating an average as an attrition prediction or a representative sample. This does not make the response-count suppression threshold a guarantee of anonymity; repeated and overlapping releases, comments and auxiliary knowledge remain risks. No schema migration or new dependency was added.

## 2026-11-05 — The Differencing Defender: a table can be safe while a series of tables is not (Session 132, Schema v96, [ADR-0092](./docs/adr/0092-differencing-defender.md), `#/differencing`, RULE-DFR-01..04, CSV #87)

Every released aggregate is now a dated row in a publication register, and the register is audited as **one integer system** instead of one table at a time. Printed cells are constants, withheld cells are boxes bounded only by what withholding itself reveals, and every published total is a linear equation; a withheld value the system admits at exactly one integer was never printed but arithmetic handed it back. The report gives the **coordinate and the proof**, never the number — printing it would make the warning the disclosure. Validation is a brute-force oracle: 400 random integer systems enumerated exhaustively, every pin required to be the unique feasible value, `0` unsound. That oracle caught two real bugs before release (negative-coefficient sign handling; infinite bounds under negation), each of which would have produced confident, wrong findings.

The modelling decision that made it work: a count is a **stock**, not an attribute, so variables are keyed `(span, measure, day)` and only the printed change between two dates is a free cross-day relation. Pins inside one day are textbook arithmetic; pins across days are labelled `cross-day-continuity-assumed` rather than asserted silently. A determined **zero** is not a disclosure. Before publishing, a planner tries stable → one cell → two cells → drop the totals → both → **refuse**, and `refuse` is a real outcome: reprinting the same total over time leaks the change between dates however the cells are suppressed, so the honest advice is *publish a change instead of a level*. A second release of the same table on the same day from the same seat is refused by construction. `RULE-DFR-01..04` make the release a graph node rolled up to **every** ancestor, open exactly one governed decision per module per ISO week (owned at the altitude that can change publication practice, carrying the proof and never the value), owe a task for every protected figure, and diagnose drift with a runs test plus a Buishand range test — both of which refuse rather than print a trend from too few points.

Honest limits: exact integer determinacy over THIS register, **not** differential privacy; local seats are auditable declarations, not authentication; the solver is deliberately incomplete in the safe direction; `oldestDays` is a maximum and sits outside the additive model; and the full app was not re-read line by line (`[UNVERIFIED]` beyond this surface).

## 2026-11-04 — The Subtraction Test: a withheld number that the total handed back (Session 131, no schema bump, [ADR-0091](./docs/adr/0091-aggregate-determinacy.md), `#/disclosure`)

Above its detail ceiling the Disclosure Console prints counts per child span with small cells withheld. The rule that hid "one more cell" only ran when at least two cells survived the floor — so with one sub-floor cell and one printed cell it hid nothing, and the published total returned the withheld value: `7 − 6 = 1`, `57 − 48 = 9`. A withheld count of one next to a severity of nine is a person. That pattern was reproduced against the shipped code before anything was changed.

The aggregate now decides suppression from the published surface itself. Printed cells are known constants, withheld cells are integer boxes bounded by what withholding reveals (`count < floor`, `open ≤ count`), and each printed total is one equation; recoverability is then closed-form and exact (`lo_min == hi_max`), with no solver and no floating point. The guard hides the smallest surviving cell first and keeps the total, because the total is the number a leader asked for — and withholds the **total** when no partner can help, which is the 4/4/4 saturation case no counting rule can see. A separate audit re-checks the figures as they are about to print, and the console and the downloaded brief carry the sentence: *"2 cell(s) withheld, 0 recoverable by subtraction."*

Honest limits: this closes the vertical (parent-against-children) axis; repeated-release differencing over time remains on the roadmap, `oldestDays` is a maximum and outside the additive model, and the other terminals' local small-cell rules are not yet routed through this guard.

## 2026-11-04 — Programme Federation: which declared leadership edges actually carry work (Session 130, Schema v95, [ADR-0090](./docs/adr/0090-programme-federation.md), `#/federation`, RULE-FED-01..03, CSV #86)

Open `#/federation` to see the hierarchy as a measured information system instead of an org chart. Each declared leadership edge is classified **connected / bypassed / stale / silent / top-of-tree** from dated artefacts other modules already wrote — attested packet carriage, frozen renewal and cadence readings, accepted Catchball commitments, closed two-sided expectation rounds — and nothing on the screen is inferred from a title, a note or an intent. Coverage is published with a Wilson 95% interval and **withheld below a declared span floor**; at director rank and above, small cells are suppressed together with a complementary cell. The engine opens at most one governed carriage decision per edge per week, owned at the span **above** the edge, and a recovering measurement records a reconnection **without** closing the human decision. No person is named, rated or ranked anywhere in the module, the brief or the CSV, and the module writes into none of the channels it measures. CSV #86 `programme-federation` is aggregate-only.

## 2026-11-04 — The Federated Envoy (Session 128, Schema v93)

Open `#/envoy` to build a sealed packet for the altitude above you, verify one a peer workspace sent, and ingest it as an attested copy. Every item is hashed, the set is Merkle-committed, and the packet's identity binds its origin, recipient altitude and creation stamp; a keyed HMAC is required by default. Detail above the receiving altitude's class is **refused at the source**, never hidden inside the file, and a packet that disagrees with a local record opens one governed reconciliation decision instead of overwriting either version. Carriage reaches every ancestor in the same transaction. CSV #83 `federated-exchange` and the certificate are aggregate-only. See [ADR-0088](./docs/adr/0088-federated-envoy.md).
## 2026-11-04 — The Operating Model: the position is the artefact (Session 128, Schema v95, [ADR-0089](./docs/adr/0089-operating-model.md), `#/operating-model`, CSV #83)


**Why this and not another capacity dashboard.** Every workforce tool in the category answers one of two questions — *how many people do we need* (headcount, req, labour-hour) or *how do people feel* (engagement). Neither answers the question a leader actually stands inside: **how much of this week is below my altitude, how much of it exists only because a call is not trusted below me, and which structural change relieves the constraint cheapest — including, explicitly, why a hire would make it worse.** LeadOS already measures decisions, congruence, delegation and concordance. This session measures the **design of the position** those are made from. It reads no calendar, no badge, no keystroke, no door and no clock, and it stores no salary: every figure is a property of a *position design*, a *span*, a *record* or an *edge* — never of a person.

- **Five measurements, each with its industrial-engineering citation.** **Displacement** — hours spent below the position's own altitude, derived from each record's own clock (Jaques 1956 time-span of discretion already drives every `requiredRank`). **Abstention** — decisions whose driver is a report of the span holder, split by Shingo's SMED internal/external (1985): a fourteen-minute triage is the job, a four-hour document is a routing defect. **Congruence** — a *boolean* against a printed threshold (deep hours vs 50% of the declared week, Drucker 1954), never a percentage ranking of managers. **Continuity** — the trap below the declared three-report floor, where one absence stops the work. **Coupling** — Graicunas (1933) `n + 2·n(n−1)/2` relationships against declared collaboration edges, with the cross-unit seam share and the combinatorial ceiling.
- **The continuity trap is the ahead-of-market claim.** Every capacity tool recommends a hire when a manager is over-utilised. Below the floor, adding a report **does not divide the work — it deepens the load that stops the work when the manager is absent.** The lever engine refuses to price it (`hours: null`) and says why in the interface: *below the declared continuity floor*. A four-report span, by contrast, is priced and told the hire *does not divide the group behind it*.
- **Stations on a line, and utilisation treated as a queue not a plan.** Each position sits at committed hours against the hours its own design contains; past the declared ceiling the reading is a **queue** (Kingman 1961) — the number that predicts lateness, printed instead of the plan it pretends to be.
- **Congestion is diagnosed, then answered by a lever book of nine named structural patterns** ranked by hours relieved per unit of design cost: Little's law, decision-rights simplification, route decomposition, adding a lead, boundary redraw, re-baselining, de-hubbing, a raised book ceiling, removing a relay layer. The cheapest lever is usually not a person, and the screen says so with arithmetic instead of an adjective.
- **Gauge R&R is applied to the model's own inputs before any figure is stated.** Denominator floor, an arithmetic check on every declared split (declared percentages must total 100), and an *impossible-week* audit that **reports** over-commitment rather than silently trimming it to look sensible.
- **One transaction, modules × hierarchy.** `RULE-OMD-01` opens **one governed design decision per congested span per ISO week** and writes a typed `rolls-up-to` edge to **every** leadership ancestor in the same commit. `RULE-OMD-02` writes advisory maturity markers. `RULE-OMD-03` certifies fragility — one governed continuity decision per ISO week, fingerprinted and idempotent. 68 rules / 68 auditable contracts.
- **Inert until declared — and that is a tested invariant.** A gate returns `[]` when `report.measuredPositions === 0`, so an untouched workspace receives zero operating-model decisions, zero markers and zero `RULE-OMD*` edges. Two isolation tests pin it (undeclared workspace is inert; a declared workspace opens no duplicate design decision). `operatingModelScan()` returns `{inert: true, reason}` — an honest *nothing is measured yet* instead of a toast over an empty workspace. This gate was added after a real regression: the continuity rule fired on an empty workspace and polluted the other sixty-three rules.
- **Five different pictures, one read model.** Frontline lead and manager see their own spans, gauges and levers at ranks 1–2; director and VP see congested spans and the coupling seam above the cell floor; above director, every level below the reader collapses to **one amortised aggregate row** — vertical roll-up with zero manual re-entry and nothing to reconcile. Identity-free brief and aggregate-only CSV #83 for the top. Authoring is rank 3–5 (org design); no attendance data exists anywhere in the schema.
- **Verified.** `tests/app/operating-model.test.mjs` — **20/20 pass**, including the norm fallback convention, the one-report vs four-report continuity trap, the relay/remove-seat pair, the cross-altitude roll-up read at VP, two isolation tests, exact partitioning, aggregate-only export and axe over all six panels (one real defect found and fixed: an empty `<th>`). Beyond it, the **entire suite was run file by file: 123/123 suites green, 2,398 tests, 0 failures** — including three real repairs found in the process (four suites still pinning the pre-v90 schema literal, a registered `concordance` link type with no fixture row and no route entry, and a standalone size ceiling that six new modules legitimately outgrew). ESLint clean, canonical boundary clean (383 modules / 123 suites / 23 doc checks), 636 doc links resolve, single-file build rebuilt at v90. **Honest limit:** local seat selection is a declaration, not authentication; no salary is stored, so cost savings are never stated in currency; work-type splits are **declared**, not inferred, and the screen says so.
## 2026-11-04 — The Attested Commit: the log now says who (Session 129, Schema v95, [ADR-0089](./docs/adr/0089-attested-commit.md), `#/identity`, CSV #84)

**Why this and not another permission matrix.** The Sealed Spine answered *was this record altered?* Every ADR since has printed what it could not answer: *who wrote this record?* — seats were declared labels, honest but unproven. Open `#/identity` to enroll a passphrase-derived seat credential (memory-only key; only the salt, fingerprint and verifier are ever stored), and every operational commit carries one HMAC-SHA256 attestation whose digest covers the whole transaction and which the seal covers in turn. Verification is three-valued and never flattering — verified, **FAILED**, or **digest-verified, key unavailable** — with honest eviction counts. Under enforcement the gateway fails closed on unattributed writes while one governed authorship-boundary decision per seat per ISO week rolls up to every leadership ancestor in the same transaction. Signed checkpoints kept **outside** the workspace detect truncation and rewinds a hash chain cannot see. This is accountable authorship inside one browser — not third-party non-repudiation and not authentication of a human being; the app says so in as many words. See [ADR-0089](./docs/adr/0089-attested-commit.md) for the rejected rungs (auditor PKI, external timestamping) and the exact limits.

## 2026-11-04 — The Hoshin Carryover Terminal: when the bet is falsified, what it encumbered comes back (Session 129, Schema v95, [ADR-0089](./docs/adr/0089-hoshin-carryover-terminal.md), `#/carryover`, CSV #84)

**Why this and not another dashboard.** Session 124 gave LeadOS a way to detect the most expensive kind of failure: a pact executed faithfully against an upstream hypothesis that has since been **falsified**. Detection, it turned out, is not settlement. The falsification lands on a *pact*, but the thing that must change is the *strategy bet* the pact deployed; and an invalidated pact has already encumbered person-days and a budget line that, in every workspace we can observe, simply evaporate at the moment of invalidation — neither spent nor released, so the next allocation cycle plans against a book that still pretends the work is live. The 2026 strategy-execution market (Cascade, AchieveIt, Workboard, Quantive, Perdoo, Rhythm) renders an invalidated initiative as a **status change** — red, closed, archived. None of them treats invalidation as a settlement event with a verdict, a released resource bundle and a graded prediction.

- **One record per invalidated pact.** `pending-settlement` → `settled-pending-release` → `settled-released`, with `settled-withheld` as the honest fourth state: a release refused in writing, with the reason stored rather than the refusal hidden.
- **Three verdicts, recorded by a human.** Retire the bet, revise the stop rule, or reaffirm with a new causal hypothesis. The engine opens the decision; it never records the verdict. Settling against a *declared* stop rule is falsification; settling against a feeling is politics.
- **Release is an accounting event, not an erasure.** A released budget line moves `committed → released`. A line already spent reports `already-spent` — the money landed, no release is possible. Nothing is rewritten to make the book look clean. Released person-days re-enter the next allocation cycle as a figure, not as a hope.
- **The bet basis is printed, never guessed.** Resolved from `pact.strategyBetId`, a goal tag, a trade-off tag or a premise — or reported as `unresolved`. A settlement with an unresolved bet is a visible defect, not a silent inference.
- **Once-only grading against a frozen prediction.** The prediction is frozen at decision time and graded exactly once, later, with a **Wilson** interval on the hold rate — Wilson, not Wald, because n is small by construction. A prediction graded twice, or after the outcome is known, is not a prediction.
- **Blameless by construction.** A faithful execution of a falsified hypothesis is not underperformance, and no panel ranks a person.
- **One transaction, modules × hierarchy.** `RULE-CO-01` creates the record, writes `carries-over` / `settles` edges and one `rolls-up-to` edge per leadership ancestor of the receiving span, **and** opens one governed stop-rule settlement decision in the same atomic write. `RULE-CO-02` records the verdict and — for `retire-bet` — releases the encumbered line in the same transaction. Marker-idempotent, pausable, explicit scan always runs. **69 rules / 69 auditable contracts**; `sealRule` is still absolutely last.
- **Verified.** `tests/app/carryover.test.mjs` — **16/16 pass**; `typed-links-lineage` asserts the graph node, its fixture and its focused route alongside every other registered type. **Honest limits:** grading is an association, never a causal effect; a bet with no declared stop rule settles as `unresolved` and the terminal prints that rather than inventing one; `already-spent` is terminal; small-cell withholding is not differential privacy; local seats remain declarations, not authentication.

## 2026-11-04 — The Escalation Economy: is this decided where the information is? (Session 128, Schema v94, [ADR-0088](./docs/adr/0088-escalation-economy.md), `#/escalation`, CSV #83)

**Why this and not another workflow form.** The 2026 market sells "escalation management" and means **ticket routing** — ServiceNow, Jira Service Management, PagerDuty, Zendesk, HaloITSM and the AI-support entrants (Fini, Forethought, Traversal, Ada) all answer *who gets paged next and how fast*, and their analytics cluster escalation reasons and predict which conversation will escalate. Not one of them asks the question that decides whether an organisation can think: **is this problem being decided at the level that holds the information, and what did passing it upward actually buy?** LeadOS was closer and still short: `load.js` measures cognitive load on a *person*, `signalPath.js` measures the transmission of bad news up declared *channels*, and `mandates.js` records who *may* decide. Between them sat an unmeasured market in which problems are continuously absorbed or passed upward — with a price, a yield, an incentive structure and a queue, none of which was recorded anywhere.

- **One ledger, two dispositions.** Every decision moment is `absorbed` (decided and owned where it arose) or `escalated` (handed up). There is no third state, because the rate that matters needs the denominator a workflow log never keeps. A row that contradicts itself — an escalation with no receiver, an absorption that names one — is **dropped, never repaired**: repairing it would fabricate the rate.
- **A leadership seat is a service station.** Exact **M/M/1 (Erlang)** waiting time `Wq = λ/(μ(μ−λ))` with **Kingman's (1961) G/G/1** bound `(ρ/(1−ρ))·cᵥ²/μ` as the variability case; at cᵥ = 1 the two coincide, which the test asserts. **At ρ ≥ 1 the queue is unstable and no waiting time is printed** — a refusal with its reason, never a large number.
- **Escalation yield — did the trip change the answer?** The share of settled escalations where the receiving level decided *differently* from what the escalating level proposed, with a Wilson 95% interval. Below the declared floor the verdict is **`pure-overhead`**: escalation is moving risk without changing the answer, which is Aghion & Tirole's (1997) central result — a principal who intervenes without changing the outcome destroys the agent's incentive to gather information at no benefit to anyone.
- **De facto centralisation, measured.** A span declares a bounded **intervention-rate commitment** (with its own frozen probability), and the observed rate is graded against it once, out of sample, by Brier. Sustained excess is reported as **de facto centralised**: formal authority delegated on paper, real authority still taken above. The commitment is the instrument the model prescribes to make delegation credible.
- **The incentive is named, not hidden.** The reason vocabulary includes `cover` ("I want cover for a decision I could make") and `capacity` as first-class, countable answers — Holmström & Milgrom (1991): an unmeasured task starves, and asking for cover is the unmeasured task no performance system has ever counted.
- **Context dies on the way up.** Crossing *k* rungs is a cascade of binary symmetric channels: `ε_k = (1 − (1 − 2ε)^k)/2`, so the mutual information still reaching the decider is `1 − H₂(ε_k)` bits of the one bit the source carried. The further up an item travels the **more** it costs and the **less** the decider knows — quantified, per rung.
- **The monkey ledger.** Oncken & Wass (1974): items sitting above where they arose, grouped by who sent them, with a return window and a generated script that returns them **with the authority to decide, not with an answer**.
- **Five genuinely different pictures, one read model.** Ledger & monkey ledger; queue integrity per receiving span; yield, cost and the context ladder; authority, subsidiarity per decision class and graded commitments; and an identity-free executive brief. Disclosure is `names` at ranks 1–2, `unit` at rank 3, `aggregate` at 4–5.
- **One transaction, modules × hierarchy.** `RULE-ESC-01` writes `escalates-to`, `originates-from` and one `rolls-up-to` edge per ancestor of **both** the originating and the receiving span, so one frontline hand-off reaches manager → director → VP → chief in the same atomic write. `RULE-ESC-02..05` open at most one governed decision or owned task per span per ISO week on a saturated queue, a yield below the floor, a breached commitment, or a monkey left too long. Marker-idempotent, pausable, explicit scan always runs. **68 rules / 68 auditable contracts**; the rule runs immediately before `decisionTempoRule` so every decision it opens is priced in the same commit.
- **Receiver-only settlement.** Only the span that received an item may settle it, and the escalating level may never settle its own escalation — a self-reported escalation yield is worthless, so the API refuses rather than warns.
- **Verified.** Full canonical suite **2,509 tests / 128 suites — 2,509 pass / 0 fail** (exit 0, 2,648 s) on the merged tree. Earlier runs surfaced **six real wiring defects** this module's own tests could not see — three before the merge (a CSV-tail ordering assertion broken by the new scope, an unlisted `insights` domain that silently dropped two escalation findings from the roll-up, and a typed-links fixture missing the two new graph entities) and three after it (a stale standalone bundle, main's own rule-count assertion, and a version pin hiding behind an assertion message). All six are fixed and re-verified. `tests/app/escalation-economy.test.mjs` — **23/23 pass**, including M/M/1 against its closed form with Kingman collapsing onto it at cᵥ = 1, refusal at ρ ≥ 1 and μ = 0, the Shannon cascade against a hand expansion at one and two rungs, Wilson against its textbook value, the roll-up as an **exact partition**, receiver-only settlement and sideways peer isolation, freeze → grade once → refuse re-grade → refuse below the floor, marker idempotence on rescan, full pause with an explicit scan still running, aggregate-only CSV #83 and brief, and five axe-clean panels. **Honest limits:** cost rates are declared conventions, not audited payroll facts; commitment grading is an association, never a causal effect; a decision that never reached the ledger is invisible; suppression is small-cell withholding, not differential privacy; local seats remain declarations, not authentication.
## 2026-11-04 — Value Stream Exchange (Session 129, Schema v95)

Open `#/valuestream` to negotiate bilateral supplier–customer SLAs between peer spans, compute the critical path and downstream blast radius of agreed hand-offs, and carry budget/capacity from an invalidated strategy into a new proposed pact. The lowest common ancestor mediates; it cannot consent for either party. Stop-rule carryover previews stale-state, currency, capacity and budget checks before one atomic release-and-propose commit, with typed lineage through both reporting branches and the shared sealed spine. Receiver acceptance commits the pre-priced planned line once; withdrawal releases it without reopening sources. CSV #84 and the executive brief are aggregate-only with small-cell safeguards. The explicitly labelled demo includes a real peer-seat SLA and negotiation history. See [ADR-0089](./docs/adr/0089-value-stream-exchange.md) and `RESEARCH.md §109` for method and limits.

## 2026-11-04 — Hoshin Carryover Terminal (Session 128, Schema v94, [ADR-0088](./docs/adr/0088-hoshin-carryover.md), `#/carryover`)

Open `#/carryover` when a Hoshin Catchball pact settles as `thesis-invalidated`: the terminal freezes the encumbered resource bundle into an append-only settlement record, opens one governed stop-rule decision per resolved bet (retire / revise stop rule / reaffirm), and — only on a human *retire* verdict — releases the committed budget line (spent actuals are never erased) and the measured person-days into the next allocation cycle in the same atomic commit. Settlements are graded once, later, against the prediction frozen at decision time with a Wilson reliability floor. Unknown effort releases zero. CSV #83 and the brief are aggregate-only. See [ADR-0088](./docs/adr/0088-hoshin-carryover.md).

## 2026-11-04 — Operating Cadence Clock (Session 127, Schema v93)

A missed expected sitting is marked overdue, not assumed to happen today. Its next date and any dependent landing forecast remain unknown until supported by a recorded sitting; the clock counts unpredictable ladders. Matrix forum routing and scope parity are still in progress.

Open `#/cadence` to declare the standing forums that actually decide work, record their sittings, and see the calendar as a queueing system: declared capacity and service time, demand measured in service-days by input class, utilisation ρ with Little/Kingman flow time (refused above ρ = 1), a computable Conway topology test of each forum's membership, the escape count of items certain to miss their own horizon, and frozen readings graded once with Brier skill. The shared propagation spine writes typed provenance and opens one governed constraint decision per week; the brief and CSV #82 are aggregate-oriented, small cells are blanked with a reason, and declared local seats are not authenticated accounts. See [ADR-0087](./docs/adr/0087-operating-cadence-clock.md) for boundaries and methodology.

## 2026-11-04 — The Disclosure Compiler: every screen declares its posture, and detail is a contract (Session 126, Schema v92, [ADR-0086](./docs/adr/0086-disclosure-compiler.md), `#/disclosure`, RULE-DSC-01..02, CSV #81)

**Why this and not another dashboard.** ADR-0076 built a real enforced boundary — and then refused **84 of 89 routes** under a declared seat, because none of them had been individually audited. That refusal was honest and the product was unusable at altitude: a director could declare their seat and lose the eight screens they actually work in. Sessions 116–123 each wrote "reviewed adapters for legacy modules, one at a time" into the roadmap; each ran out of road first. This session replaces the per-screen audit with **a declaration, a compile and a proof**.

- **One declaration per screen.** Every route the shell can render states, in data, which governed collections it reads, its record class (borrowed from the existing policy table, never duplicated), the fields an aggregate can be counted from, and its mode: `adaptive` (the legacy screen may render inside its own rank window) or `aggregate` (a modelling surface whose own report reads span the whole workspace — it publishes an aggregate under a seat and says so). A route with no manifest is **withheld with the reason printed**.
- **One compile per render.** `(manifest × seat × release ledger) → posture`: **detail** inside the class window, **aggregate** above it, **withheld** below a floor or unresolved. Navigation, the route gate and the screen all read the same table, so they cannot disagree.
- **The aggregate replaces the refusal.** Above a detail ceiling a module still opens — as the read the level above is actually owed: records, open load, overdue load, severity load, oldest age, money **per currency**, per-child-span rows. Cells below the floor (default 5) are withheld, and **one further cell is withheld complementarily** so the hidden ones cannot be recovered by subtraction. Money is never pooled across currencies; a missing date is *unknown*, never age zero.
- **It prints its own refusals.** Every withheld cell carries why; every complementary suppression says it happened; records outside the seat's span are **not counted at all** and the count of what was excluded is printed — an aggregate that includes peers is a sideways leak with extra steps.
- **Detail is released only by a contract, never a setting.** A release is requested by the altitude that needs it, **consented only by the span that owns the records**, bounded to one screen × one span × 1–30 days, addressed to one seat, refused outright for `enterprise` classes (pay, parity, workforce transition) and incapable of lifting a floor. `RULE-DSC-01` opens one governed DACI decision, one consent task and the typed edges (`authorizes`, `discloses-to`, `tracks-followup`) in the same atomic transaction; `RULE-DSC-02` sweeps expiries — a lapsed window stops authorising reads and owes exactly one graded review.
- **A leak oracle replaces the hand audit.** `tests/app/disclosure-compiler.test.mjs` paints sentinel strings into every private field, navigates **all 96 routes at four altitudes** through the real app against a real DOM, and fails if a single out-of-span person, peer-span record or private note reaches the screen — 20/20 pass, including exact aggregate arithmetic, complementary suppression, the consent lifecycle and axe-clean console panels.
- **Disclosure Console (`#/disclosure`).** Coverage (detail / aggregate / withheld, each with its reason), the seat's aggregate read, the release ledger (request → consent → revoke / refuse / lapse) and an identity-free brief for the level above. The nav marks an aggregate screen `◌` before you click it. Every aggregate states how many cells it withheld **and how many of them are recoverable by subtraction** — the guard decides suppression by exact integer arithmetic over every printed total, so the answer is `0` for a printed table or the total is withheld with it (Session 131, [ADR-0091](./docs/adr/0091-aggregate-determinacy.md)).

**Honest limits, stated in the product as well as the docs.** Seats remain auditable *declarations*, not authentication; suppression is small-cell withholding, not differential privacy; ~45 analytic terminals are `aggregate` by declaration because their own report reads are not yet seat-scoped, and the console says so screen by screen.

Run: `npm run app`. Verify: `npm run verify:canonical`, `npm run verify:standalone`. Evidence: `AI-SESSION-LOG.md` (Session 126).
## 2026-11-04 — Hoshin Catchball Cascade (Session 124, Schema v90)

Open `#/catchball` to propose and negotiate span pacts, check capacity and budget headroom, compare leading and lagging outcomes, and inspect weakest-link roll-ups. The shared propagation spine records typed provenance and opens human review when divergence warrants it. CSV #79 and the executive brief are aggregate-oriented; declared local seats are not authenticated accounts. See [ADR-0084](./docs/adr/0084-hoshin-catchball-cascade.md) for boundaries and methodology.

## 2026-11-04 — The Board Room: a disclosure memo that can fail (Session 125, Schema v93, [ADR-0087](./docs/adr/0085-board-room.md), `#/board`, CSV #82)

**Why this and not another board pack.** Every board deck in the category is assembled the same way: last quarter's dashboards, an average, a colour. The claim is never written in a form that could fail, the threshold moves after the number is seen, and a composite index hides the disagreement a board is convened to see. LeadOS had the hierarchy, the disclosure ladder and 63 cross-module rules — and a `#/board` route promised by `chainRegistry.js` and `successionRegistry.js` that rendered nothing. This session builds it as a **pre-registration terminal**.

- **Thresholds before the look.** Seven enterprise claims (bench coverage, bench concentration, promise reliability, delegated authority holds, expectation alignment, culture signal, record integrity) are declared with a comparator, a unit and a floor **before** the first look. A look is recorded with a content fingerprint of exactly what was visible. Moving a threshold afterwards is allowed — with a written reason — and permanently marks the claim `revisedAfterLook` on screen, in the memo text and in the export.
- **The interval decides, not the point estimate.** Verdicts come from the conservative end of a **Wilson (1927)** interval. 0 of 5 spans covered has an upper bound of **43.4%**, so a 60% floor **fails**; 4 of 5 is 37.6–96.4% and is `inconclusive`; a claim exactly on its threshold is never settled by more data, and the panel says why. The terminal also computes what **would** settle it: `boardRequiredSample(50, 60) = 97`.
- **Refusals are printed, never zero-filled.** An empty workspace reads **0 computed figures and 7 refusals**, each with its reason. Withheld (below the cell floor), refused (no source, no threshold, exact tie) and stale (fingerprint mismatch after a reorganisation) are all first-class states, and a refused figure is **blank** in CSV, never `0`.
- **Provenance on every figure.** Each row is tagged `recomputed`, `attested`, `asserted`, `withheld` or `refused`. An operator's declaration is never dressed as measurement, and the seal's own verdict is reported with the sentence that it proves non-alteration, not truth.
- **Disagreement is surfaced, never composited.** Three cross-checks read other terminals and print both numbers plus a route: coverage-count-versus-flow (a snapshot can pass while the flow says a gap is likely), promise-rate-versus-book (a rate can clear while the book holds overdue promises), integrity-versus-examination (an unaltered record is not an examined one). No composite confidence score exists in the module, by construction.
- **A roll-up that does not add up is reported, not drawn.** Any claim with span attribution is partitioned over the reporting tree and reconciled exactly against the claim's own denominator; a broken partition prints the delta, and a claim the source module never attributed is drawn as "nothing attributed" rather than as one aggregate bar.
- **One transaction, modules × hierarchy.** `RULE-BRD-01` opens exactly one governed DACI decision per failing claim and — only when the worst partition row is a span — one delegation capped at `min(60, boardRecheckDays)` days. `RULE-BRD-02` writes typed `rolls-up-to` edges to every leadership ancestor of the failing span. `RULE-BRD-03` writes one advisory maturity marker. Marker-idempotent through `boardMarkers`, pausable through `boardAutoPropagate`, explicit `boardScan()` always available. **67 rules / 67 auditable contracts.**
- **Five genuinely different pictures, one read model.** Frontline lead (my failing line and what it costs; cannot commit), manager (the span partition with the arithmetic shown), director (named span rows and the delegation the failing span receives), VP (discrepancies, settling-sample arithmetic, refusals), CEO / chief (the identity-free memorandum text, the attestation state, aggregate CSV #82). `commit-board-memo` is chief-only (rank window 5–5); reading the pack is not.
- **Verified.** `tests/app/board-room.test.mjs` — **45/45 pass**, including analytic Wilson cases (0/5 upper 43.4; 4/5 37.6–96.4; 0/10 upper ≈27.8), the settling-sample inversion, a signed pre-registration trail, a real cross-altitude fan-out in one transaction, the pause + explicit scan, exact partition reconciliation, chief-only commit, blank-not-zero export, hostile-normalizer inertness, schema reload, and axe over the memo and ledger. ESLint, canonical boundary (383 modules / 123 suites) and doc links (637) pass; the standalone build is rebuilt, never hand-edited.
- **Honest limit.** Wilson intervals assume independent observations and the spans of a reporting tree are not independent, so the interval is a lower bound on uncertainty — printed as such. Sealing prevents anchoring, not a reader with the backup file. Seven claims are a chosen instrument, not a validated one.

## 2026-11-04 — The Concordance Terminal: two gauges, one word (Session 123, Schema v89, [ADR-0083](./docs/adr/0083-expectation-concordance.md), `#/concordance`, CSV #78)

**Why this and not another review form.** Every tool in the category asks a manager to rate a person against a *word* — "meets expectations" — and never checks whether the two people mean the same thing by it. That word is six expectations (what finished means, how good good is, what outranks what, what may be decided alone, how early a risk must be raised, what to do when speed and completeness collide). Two honest people using two different gauges produce a review that is correct on both sides and still arrives as a surprise. LeadOS already audits the *reliability of ratings over time* (ADR-0069). This session audits the **agreement between the two raters at one moment** — the industrial answer to a broken measurement system.

- **One round, two sealed sides.** A round is opened for a real reporting pair inside the leader's span. Each side answers all six dimensions independently; nothing is revealed until both sides are in, a sealed side cannot be revised, and a closed round is evidence. The seal prevents *anchoring* — and the app says plainly that it is a UI guarantee, not encryption against a backup.
- **Four statistics, none alone.** Quadratic **weighted κ** (Cohen 1968) on the fixed five-point scale, **Gwet's AC1** (2008) for prevalence, **PABAK** (Byrt et al. 1993), and **Bland–Altman** bias with 95% limits of agreement (1986). When κ and AC1 disagree by more than 0.4 the **prevalence paradox is printed** rather than resolved in the flattering direction. Below the six-item instrument floor, or with degenerate marginals, the figure is **refused with its reason**.
- **Agreement is not correctness.** Perfect agreement prints a shared-error warning: two people can agree precisely on the wrong bar, which is how a whole team misses the same target together.
- **Exact partition, then suppression.** A pair counts once at its leader's node and is inherited by ancestors by addition, so the enterprise figure cannot be inflated by zooming out. A span rate is withheld below the cell floor (default 5 assessed pairs); the headline is the **share of pairs above the agreement floor with a Wilson 95% interval**, never a mean dressed as an index.
- **One transaction, modules × hierarchy.** `RULE-ECN-01` writes one typed `rolls-up-to` edge per leadership ancestor for every closed round, plus a `re-tests` edge when the round tests an earlier decision. `RULE-ECN-02` opens **one governed DACI re-contracting decision per pair per ISO week** on divergence and places one generated agenda line on the pair's most recent 1:1, so the conversation has a place to happen. `RULE-ECN-03` writes one advisory maturity marker. Marker-idempotent, pausable, explicit scan always runs. 67 rules / 67 auditable contracts.
- **A closed loop, labelled honestly.** A second round after re-contracting is compared with breached pairs that were not re-contracted — an **association**, refused below the floor, never called an effect.
- **Five genuinely different pictures, one read model.** Round detail and both gauges at ranks 1–2 (and always the leader's own pairs); span rates and the dimension profile at director rank and above with the other spans' gauges withheld; an identity-free brief and aggregate-only CSV #78 for the top. The **dimension profile** is the sentence worth taking to a leadership meeting: *which word does this organisation use differently, in which direction, in how many pairs.*
- **Verified.** `tests/app/expectation-concordance.test.mjs` — 18/18 pass, including analytic κ/AC1/PABAK cases, an independent 5×5 recomputation, seal integrity, a real cross-altitude roll-up (manager → director → VP in one transaction), the agenda line, idempotent rescans, pause + explicit scan, exact partitioning, director-rank disclosure, aggregate-only exports and axe over all five panels. ESLint, canonical boundary and doc-link checks pass. **Honest limit:** six items is the instrument, not a sample; local seats are declarations, not authentication; suppression is not differential privacy.

## 2026-11-04 — The log you can check: hash-chained seals over every transaction (Session 122, Schema v88, [ADR-0082](./docs/adr/0082-sealed-spine.md), `#/seal`)

**Why this and not another activity feed.** The workspace has been event-sourced since ADR-0001, but its append-only log was append-only *by convention*: nothing proved a hand-edited payload or a silent normalizer hadn't rewritten history. The 2026 category sells "audit trail logging" as a vendor-held table (RESEARCH §104 — Lattice, Cornerstone, Workday, Lucid's Audit Logs API); nobody surveyed offers a customer-*locally* verifiable chain, because their rows live on their servers. In a local-first workspace the data lives here, so the verifier belongs here too.

- **One seal per transaction, by construction.** `sealRule` (RULE-SEAL-01/02) runs **last** on the shared post-commit spine (62 rules), so each `audit.seal` event commits to `sha256(prev ‖ digest ‖ revision)` over exactly the events every other module's rules appended in that same atomic write — case propagation, DACI decisions, roll-up edges, comms drafts. Genesis is 64 zeros; the feature needs **no new collection and no migration of its own** (the repository is at Schema v88 after Session 121’s additive bump) — the chain lives in the log it protects.
- **Two modes, printed honestly.** With the vault unlocked, seals are HMAC-SHA256 keyed by a PBKDF2-derived 256-bit session key (memory-only, cleared at every lock site); otherwise plain SHA-256. Every surface — banner, stats, certificate — says which mode you are in: plain mode is integrity against corruption and honest error, **not** forgery-proof, and the app never implies otherwise.
- **Verification names the first break.** `verifySealChain` replays from genesis and reports typed failures — `chain-break`, `seal-mismatch`, `content-mismatch` at the exact revision — plus trailing-unsealed events and retention-evicted blocks (chain-verified, content honestly unverifiable, counted not hidden). Seal events are exempt from the 600-event log cap (own cap 5000), so the anchors are the last thing a full log evicts.
- **Attested up the chain of command.** Every sealed transaction is counted at the owning span **and** every leadership ancestor in the same transaction — one frontline commit attests at lead → manager → director → VP → chief; out-of-subtree spans collapse to one aggregate row under a declared seat. `seal.scan` runs at any rank; enabling/pausing sealing is operator-only and fails closed under a seat (ADR-0080 gateway, `audit-seal` right).
- **Integrity & seals (`#/seal`).** Chain status, span attestations, sealed blocks, explicit verify, and an identity-free **integrity certificate** (Markdown: verdicts, seal prefixes, mode, limitations — no person ids, no record content) for a board pack or an auditor.
- **Altitude-routed intake.** Free-text drafts resolve the owning seat by lowest common ancestor over the reporting tree (`ownerId` + `ownerBasis`), the analysis prints an altitude-routing card, and confirming creates the case under the routed owner — a new case's first events are sealed under the right span.
Run: `npm run app`. Verify: `npm run verify:canonical` and `npm run verify:standalone`. Session evidence: `AI-SESSION-LOG.md` (Session 122).

## 2026-11-03 — The Altitude Router: type once, route everywhere (Session 121, Schema v88, [ADR-0081](./docs/adr/0081-altitude-router.md), `#/routing`, CSV #77)

**Why this and not another intake form.** The workspace already had a strong on-device note classifier that picked **modules**, and a strong hierarchy model with five altitudes and vertical roll-up — but they never met. A leader still had to know which screen to open. This session joins them: one natural-language note is classified in two dimensions, resolved onto a **real seat** in the `person.managerId` tree, and adopted in **one human-reviewed atomic transaction** that fans out across modules and up every leadership rung.

- **Joint classification.** Module routes reuse the existing intake engine verbatim. A second deterministic horizon lexicon (7 / 30 / 90 / 180 / 365 days, Jaques' time span of discretion) infers the owning altitude with a three-token negation window, softmax-shrunk confidence bands and a **refusal** below the evidence floor rather than a guess. Named people resolve to the lowest common ancestor of their managers; safety/legal stakes and long-lived categories print a horizon floor; a `quarter` cue lifts ownership above the LCA without silently reassigning anyone.
- **One transaction, modules × hierarchy.** `routingConfirm` adopts the note as a case and marks the plan confirmed in the same write. The shared `case.created` event fires the existing decision, coaching, counterfactual and succession rules **and** `RULE-AR-01`, which writes `routes-through`, `discloses-to` and one `rolls-up-to` edge to **every** leadership ancestor. A frontline handover reaches manager, director and VP with zero re-entry. One revision; an explicit rescan cannot duplicate an edge.
- **Five genuinely different pictures, one read model.** The disclosure ladder is `names` at ranks 1–2, `unit` at rank 3, `aggregate` at ranks 4–5. Panels: Plan, Ladder, Ledger, Calibration, Brief. The frontline lead sees the shift work; the CEO sees aggregate rates and refusals, not shift notes.
- **Graded, not merely confident.** Plans are graded **once**, later, against the altitude the work actually belonged to: Wilson 95% intervals refused below five, **strictly-prior** Brier skill against a pooled base rate, **mean rank error** (routing a daily item to the CEO costs more than routing it to the director), under/over-routing counts and human-override lift. `RULE-AR-02` opens exactly one governed DACI decision per breaching cell per ISO week and rolls it up; `RULE-AR-03` writes one advisory maturity marker. Marker-idempotent, pausable, and an explicit scan always runs. No rule edits a grade, case, person, setting or seat.
- **Integrity.** A two-lane fingerprint over the note **and the seat path** makes a saved plan go stale after a reorganisation instead of writing into the old tree. Conflict/harassment notes are never auto-adopted. A declared seat cannot confirm a peer span's plan. Brief and CSV #77 are aggregate-only: no names, ids, note text or evidence spans. Fail-closed normalizers drop malformed plans and out-of-range settings to defaults with a warning. Schema v88 is additive `87 → 88`.
- **Verified.** `tests/app/altitude-router.test.mjs` — 11/11 pass, including an axe run over all five panels. ESLint, canonical boundary and doc-link checks pass. **Honest limit:** local seats are auditable declarations, not authenticated multi-user security; suppression is not differential privacy; confidence bands are not outcome-graded predictions.
Run: `npm run app`. Verify: `npm run verify:canonical` and `npm run verify:standalone`. Session evidence: `AI-SESSION-LOG.md` (Session 121).

## 2026-11-03 — Mission Control: one hierarchy, five jobs, one reviewed loop (Session 120, Schema v87, [ADR-0080](./docs/adr/0080-mission-control.md), `#/mission`)

**Why this and not another dashboard.** The audit found a real hierarchy model and a real cross-module rule engine, but the Operating Seat mostly filtered navigation while legacy screens/API calls still touched unrestricted state. Mission Control makes the supported declared-seat surface honest: five altitude-specific operating loops, a fail-closed API gateway, a scoped render projection, disclosure-safe roll-up, reviewed atomic interventions and immutable executive briefs.

- **Mission Control (`#/mission`).** Frontline leads coach and unblock the week; managers coordinate handoffs; directors align the system; VPs choose the portfolio; the CEO stewards the enterprise. The question, horizon, allowed commands and disclosure change with altitude.
- **Scoped boundary.** Declared seats use reviewed API adapters and a redacted projection. Unknown methods fail closed. Legacy raw-data modules remain available only in the explicit local operator view. This is a local workflow boundary, **not authenticated multi-user security**.
- **Roll-up that resists simple subtraction.** Work is partitioned by responsible owner node; cross-team work stays at the lowest common leader. Small cells and their complements are withheld; parent totals become intervals. Not differential privacy.
- **Coordinated interventions.** Rank-filtered Action Bundles rehearse in a background worker, adopt in one transaction, fan out through the existing rule spine and roll up every leadership ancestor. Withdrawal protects later human changes.
- **Enterprise briefs.** The declared CEO root can freeze an identity-free brief. RULE-MIS-01 opens one governed review and typed span provenance. Lower altitudes get a scoped handoff, not enterprise detail.

Run: `npm run app`. Verify: `npm run verify:canonical` and `npm run verify:standalone`. Session evidence: `AI-SESSION-LOG.md` (Session 120).

## 2026-11-03 — Which spans hold which rights (Session 119, Schema v85, [ADR-0079](./docs/adr/0079-authority-calibration-ledger.md), `#/authority-calibration`, CSV #74)

**Why this and not another scorecard.** Approval tools rate people; LeadOS rates rights. The Authority Calibration Ledger grades each accepted mandate contract against its delivered outcome — completed means the authority held, returned/expired/revoked means it did not — and groups trials by action class and receiver altitude. Every figure is re-derived on read; nothing is stored as a frozen claim. No person is rated or ranked; the subject of every figure is a span and an action class.

- **Authority Calibration Ledger (`#/authority-calibration`).** Terminal mandates become Bernoulli trials grouped by action class × receiver altitude. Each trial is graded against the cell's hold rate from strictly-prior terminals (out-of-sample sequential forecast). Wilson 95% interval, pooled Brier vs base-rate reference (skill), counts-only floor (n<5 → rate refused), reliability floor (hold rate below pct → governed DACI decision for the span above). Five panels: Overview, By altitude, Signals, Settings, Brief. Identity-free brief download; aggregate-only CSV #74.
- **Cross-altitude roll-up on the shared spine.** RULE-ACL-01 opens one governed DACI decision per cell below the reliability floor per ISO week and writes `rolls-up-to` edges from each breaching mandate to every leadership ancestor of the receiver seat in the same transaction. RULE-ACL-02 writes one advisory audit marker when a cell reaches the evidence floor. Marker-idempotent, pausable via `authorityCalibrationAutoPropagate`, explicit `calibration.scan` always runs.
- **Schema v85 additive migration** (`MIGRATIONS[84]`), new `authorityCalibrationMarkers` collection, clamped settings (`authorityCalibrationFloorN`, `authorityCalibrationReliabilityFloorPct`, `authorityCalibrationAutoPropagate`). `calibrationScan()` API action; `calibration.scan` event.
- **Honest limits.** Calibration is advisory: no rule changes a contract, a setting or anyone's seat. A span decides what to do about a cell below its floor. Local seat selection remains a declaration, not authentication.

Run: `npm run app`. Verify: `npm run verify:canonical` and `npm run verify:standalone`. Session evidence: `AI-SESSION-LOG.md` (Session 119).

## 2026-11-03 — Move the decision, keep the proof (Session 118, Schema v84, [ADR-0078](./docs/adr/0078-decision-rights-exchange.md), `#/mandates`, CSV #74)

**Why this and not another approval form.** Approval chains, delegation windows and decision ledgers already exist (Workday, ServiceNow, Copilot Studio, Aera, Cloverpop; `RESEARCH §101`). What was missing in LeadOS — and what the category does not close — is a **leadership-specific closed-loop handoff contract**: explicit decision rights over existing work, two-sided acceptance, capacity evidence, real budget encumbrance, expiry/recovery, and altitude-scoped disclosure on the same operational graph.

- **Decision Rights Exchange (`#/mandates`).** Offer a bounded authority contract over an open case/decision/delegation/goal; the receiver explicitly accepts (silence is never consent), delivers evidence, and the sender verifies. Return, revoke, expiry, source/scope drift and budget drift open a named recovery path. Spending authority encumbers a real budget line on acceptance and posts the recorded actual on verification; a recorded actual is never erased by a rejected outcome.
- **One hierarchy, five altitudes.** Routing reuses the reporting tree: down/up only, cross-span work goes to the lowest common leader, rank floors and high-consequence safety apply. Executives see an exact receiver-partitioned roll-up with drill-down (`?panel=rollup&span=`); rank ≥4 non-parties get redacted detail. CSV #74 and the brief are aggregate-only.
- **Same transaction, same spine.** `mandateRule` (RULE-MND-01..03) runs before the Attention Market and the final `seatRule`, so acceptance/recovery work fans up every leadership ancestor through typed `rolls-up-to` edges in the same atomic write. Typed edges: `authorizes`, `binds-receiver`, `tracks-followup`, `decides`, `funds`, `recovers-authority`.
- **Honest limits.** Local seat selection is a workflow declaration, not authentication. No tenant isolation, external notification or autonomous spending. Full backups still contain the whole workspace.
- **Also fixed.** Succession brief export now uses the real `downloadText({filename,text,mime})` contract and offers a copyable fallback when the browser blocks the download (regression-tested).

Run: `npm run app`. Verify: `npm run verify:canonical` and `npm run verify:standalone`. Session evidence: `AI-SESSION-LOG.md` (Session 118).

## 2026-11-02 — The bench, with a proof (Session 117, Schema v83, [ADR-0077](./docs/adr/0077-succession-terminal.md), `#/succession`, CSV #73)

**Why this and not another dashboard.** The category consensus (fetched 2026-11-02, `RESEARCH §100`) is a manager **nominates** a successor, rates readiness, and a colour appears on an org chart: Workday, SAP SuccessFactors (which shipped a *Succession Planning Agent* in H1 2026 that flags positions "with no successors or weak bench strength"), Oracle Fusion HCM, TalentGuard's ESTRI readiness engine, ChartHop's coverage colours, PeopleFluent, Darwinbox, UKG Pro. Prices cluster at $3–10/user/month with SMB point tools at $2,995–6,345/yr plus $5,000–10,000 onboarding; **five of twelve publish no price at all**. Every one of them measures a *claim about a person*. None answers the question actually asked after a resignation.

- **The question that has a proof.** *If this holder left on their next obligation date, does the set of people who remain admit an assignment of the work?* That is bipartite flow feasibility. The terminal runs a real **Dinic maximum flow** (`source → item → survivor → sink`) and reads the assignment from the residual graph. When the flow is infeasible it prints the **minimum cut** — the smallest set of dated obligations no survivor can hold, each with its due date and eligible-survivor count. A certificate can be argued with; a percentage cannot.
- **The unit is a direct-report span, never a seat and never a person.** Direct reports **partition** the roster, so every obligation is tested exactly once and counts roll up by exact addition — the enterprise figure cannot be inflated by zooming out. Survivors are the holder's **peers**: the span lead is never a survivor, because a lead who absorbs their report's work has deferred the vacancy, not replaced the holder. A leader with no reports is an `empty-span`; with one, a `span-of-one`. Both are drawn, neither is called covered, and each prints why: "no bench exists" and "no evidence exists" need different fixes.
- **Eligibility is evidence, never a name.** Five graded sources — a handover this module already recorded > a shared delegation > a shared goal > a shared review > a shared team. The weakest is counted and never hidden, and `unlinkedPairs` prints the blind spot on every span.
- **The overload rule is one declared number.** `headroom = ⌊factor × median(load) − load⌋ + 1`, floored at zero, printed everywhere it is used. A balanced team can absorb; a member at twice the median correctly has none.
- **Coverage is the collective blanket.** The union of the span's dated commitments (Haehling von Lanzenauer & Wright 1991) with the **independent thread count** beside it, because 300 days carried by one thread is the most dangerous shape a bench can have and no readiness colour can see it. A recurring cadence never sets the blanket; a span with no future-dated obligation is **refused**, not treated as infinitely covered.
- **Concentration is measured on work, never on worth.** Herfindahl–Hirschman with the inverse-HHI effective holder count and Shannon entropy. Members holding nothing stay in the denominator — the difference between "spread over six people" and "two of our six hold it".
- **An untested bench is priced, not painted green.** Lindley–Smith single-sample acceptance puts a span that has never run a handover at **50%** — a coin flip — and above the declared floor the measured record takes over through a Jeffreys posterior. The enterprise answer is a **pair**: the independence product as an upper bound beside the assumption-free union lower bound `max(p)`, with a 5% floor inside the cap and `p = 1` for a span already infeasible. Never a point estimate.
- **Money only where declared.** A per-currency daily deprivation cost the leader typed (Carley & Lin 1997); unpriced work is counted and never valued; no salary inferred; currencies never summed; the equal-marginal shortfall is labelled an **upper bound** because its tail is fatter than the exact binomial.
- **Freeze, grade, refuse.** A frozen reading carries one prospective probability **and** its lower bound, the blocking set, verdicts, blanket and index. It refuses to freeze when no span can be measured and freezes once a day. Grading is once, later, re-running the same structural test: a deleted member is **unmeasurable** (never a gap), a completed obligation is the span **succeeding**, and skill is withheld below five graded readings.
- **Vertical roll-up on the SAME spine.** `successionRule` is 55th of 56 rules, registered **before** `seatRule`, so its certificate edges must be explainable by the seat boundary above them in the same pass. `RULE-SUC-02` opens one governed DACI decision per span per 30-day bucket with three options (develop a second holder / reshape the span / **accept the exposure in writing**), attaches min-cut items with `certifies-gap` edges, `understudies-for` to the seat and `hedges-departure` to the decision. **One frontline team's gap reaches manager → director → VP → CEO in one atomic transaction** alongside every other module's propagation.
- **Wiring.** Schema **v83** (additive `82 → 83`: `successionReadings`, `successionMarkers`, 12 declared conventions, fail-closed normalisers), `successionreading` graph node, 4 new relations (97 in `LINK_RELATIONS`), 8 action commands, 13 route aliases, nav badge counting certified gaps only, SUC-01..05 signals, an Insights bucket, an identity-free brief, aggregate-only CSV #73 (no ids, no names), six axe-clean panels.

**Two refusals kept, not softened:** nominations and readiness ratings are read as **claims** and never enter the flow test, and **no departure is predicted** — the test assumes absence, it never forecasts who leaves or when. **Verified:** full canonical suite **2,279 tests / 138 suites — 2,279 pass / 0 fail** (exit 0), `succession-bench` 16/16, boundary 337 modules / 116 suites / 0 violations, 594 docs links across 187 files, standalone rebuilt at 6,450,309 bytes / schema v83, ESLint clean. The full suite found **five real wiring defects** this module's own tests could not see (a Signals crash from the wrong finding contract, a double-counted `Succession` bucket in the domain roll-up, a route alias stolen from Promise Solvency, a graph node with no resolver, and a signal that duplicated the empty-workspace nudge); all are fixed. Real-browser assistive-technology walkthrough **[UNVERIFIED]** (JSDOM + axe only).

## 2026-11-02 — Important correction: seat privacy and roll-up integrity

**Do not use the Operating Seat as a security boundary.** The previous session's claims of enforced ABAC/RLS are incorrect: the browser has no authenticated identity; `buildContext` passes the full state to ordinary renderers and export functions, and seat resolution errors fail open. The lens and route gate are useful local UI features, not isolation. Restrict the workspace to one trusted operator. The projection's cross-span decisions now require all named people in scope, and aggregate-only records cannot pass `canAct`; these helper changes do not secure the rest of the app.

RULE-SEAT-01 now reconciles its own typed roll-up links on a scan or eligible commit: stale links are removed after reorganisation, closure or sensitivity change; other rules' links are preserved. Removal is audited. The existing cap still limits new links and may require subsequent commits or a scan to finish. Paused or undeclared seats remain inert. Schema unchanged. See the session log for verification and limitations.

## 2026-11-02 — Who is operating this workspace? (Session 116, Schema v82 **unchanged**, [ADR-0076](./docs/adr/0076-operating-seat.md), `#/seat`)

The heads-up for this session said: *if the codebase has no users/roles/org structure, build the org model first, because everything in Section 0.3 depends on it.* The condition was checked before it was acted on, and **it is false**. [ADR-0075](./docs/adr/0075-command-chain.md) already shipped the hierarchy: `person.managerId` → a reporting tree, five Jaques altitudes (7/30/90/180/365 days), lowest-common-ancestor ownership, exact-sum and pooled-vs-mean roll-ups, `RULE-CHN-01..05`. What was genuinely missing is the other half of §0.3: **real role-based permissions**. ADR-0075 §5 says so itself — no authentication, and its disclosure ladder is a *rendering contract* that changes display strings, not readable state. `app/**` had no `RBAC`, `canView`, `currentUser` or `authoriz*` layer; `clearance` here is an Earned-Schedule percentage; `role` is DACI free text. Building a second org model would have discarded working, tested code, which §1 forbids. So this session turns the existing hierarchy into an **enforced acting position** and makes altitude a dimension of the **same** event-driven propagation engine.

- **The seat.** `settings.activeSeatId` declares which leadership node in the reporting tree the workspace is operated from. It is an **append-only handover** (`seat.switched`), validated against the real roster; an id that is not a leadership node is refused, never invented; `null` is the undeclared operator view — the exact pre-0076 behaviour. `scope = buildChain`'s `subtreeIds`: the hierarchy IS the scope, not a `WHERE manager_id = me` filter.
- **Enforced ABAC/RLS, deny-by-default.** Four sensitivity classes — `individual` (rank 1–2, detail ceiling 2), `unit` (1–5, ceiling 3), `portfolio` (3–5, ceiling 4), `enterprise` (4–5, ceiling 5). Four gates in order: fail-closed on an undeclared action or unlisted collection → **sideways** subtree scope → **downward** rank floor → **upward** detail ceiling. Outcomes are `full | aggregate | denied`, each with a printed reason. A director is not handed a private 1:1 note; a frontline lead is not buried in CEO analytics; a peer span's case is denied sideways. `canAct` gates ~20 declared rights; `routeVerdict` filters the nav **and** refuses a forged hash URL at render time with a non-dead-end refusal screen.
- **An access control that explains itself.** `projectForSeat` returns a transparent **enforcement ledger**: every non-full decision is a row with its reason, grouped in the digest, capped and counted as truncated rather than silently dropped. No platform in the 2026 category tells the person being denied *why* a record was withheld. `RULE-SEAT-03` writes `seat.access_denied` audit events on an explicit scan.
- **Vertical roll-up on the SAME spine.** `seatRule` is registered **last** among 55 `DEFAULT_POST_COMMIT_RULES`. `RULE-SEAT-01` walks each harvested work item (from the declarative `SIGNAL_SOURCES`, one row per module) up every leadership ancestor and writes one typed `rolls-up-to` edge per span via the existing `ensureEntityLink`, idempotent by exact-edge uniqueness. `RULE-SEAT-02` opens one governed hand-up delegation per seat per ISO week carrying that altitude's `handUp` obligations and `forbidden` detail. **One frontline case reaches manager → director → VP → CEO in the same atomic transaction as every other module's propagation, with zero re-entry.** Adding a module is one registry row; adding a level is a `managerId` change.
- **Five genuinely different operating pictures, one surface.** `#/seat` (Altitude Lens) derives duties with routes filtered by the permission engine, the disclosure ladder (names at the frontline, unit leaders at director, counts at the top), a generated board-ready line with unverified figures marked, and drill-up/drill-down across all five ranks. Altitude is a parameter, not five duplicated dashboards — ADR-0075's rejection stands — but the *content* differs by rank, so the frontline lead and the CEO are not reading the same screen.
- **Composition-safe digests.** Exact counts; pooled horizon-debt rate beside the **mean of unit rates**; spread in pp and a declared materiality bar; a **directly standardised** rate when they disagree (Simpson's paradox); refusal below the evidence floor (a rate of one identifies a person); severity × age risk heatmap for drill-down; ≥4-week arrival-trend anomaly with an explicit `unmeasured` verdict below it. Everything is derived live from the same dated records — **the number the top sees cannot drift from a hand-typed status update** because no copy exists.
- **Zero migration, by decision.** `SCHEMA_VERSION` stays 82; no new collection, no `MIGRATIONS[82]`, no stored digest. Declaration is a setting; handovers and refusals are events; provenance reuses existing relations and entity types; digests are derived. An older blob opens on the undeclared operator view. Justification: **191 hardcoded v82 assertions across 78 test files**, plus the correctness cost of a second stored copy.
- **No-regression inertness.** The automatic pass requires a declared seat + `seatAutoPropagate` + an operational commit; explicit `seat.scan` / `seat.switched` / `seat.propagate` always run. No existing fixture declares a seat, so undeclared workspaces' transactions are unchanged — protecting the 31 test files with exact `events.length` / `links.length` / `propagations.length` assertions.
- **Wiring.** 11 route aliases, nav badge counting withheld records, topbar seat chip, filtered nav, static quick-action row hidden while a seat is enforced, identity-free brief export, five axe-rendered panels with altitude-specific accent tones, `tests/app/operating-seat.test.mjs` (13 tests), ADR-0076, `RESEARCH §99`, `ROADMAP`, `index.html` meta.

**Two refusals kept, not softened:** this is **not authentication** — one browser, one local store, no server, so a seat is an auditable *declaration*, not an identity proof, and the UI says so. And no person is rated, ranked or named above the detail ceiling; risk heat is severity load × age over spans. Real-browser assistive-technology walkthrough **[UNVERIFIED]** — JSDOM + axe covers the markup.

## 2026-11-02 — One hierarchy, five altitudes, one clock (Session 115, Schema v82, [ADR-0075](./docs/adr/0075-command-chain.md), CSV #72)

A hundred and fourteen sessions built instruments for **one leader reading one roster**. Every one of them assumed the person reading is the person the work belongs to — and nothing in the product knew what an altitude was. The audit found zero occurrences of the word. The hierarchy existed as a single field (`person.managerId`), used to group a list, and `orgDesign.js` computed span of control on one level. In a real organisation the two expensive failures are structural, and neither was measurable: **work sits at the wrong altitude** (a director coaching a shift, a team lead making an enterprise bet) and **escalation happens by surprise** (the level above learns about the ageing decision in a corridor). `#/chain` is the surface that makes both numbers.

- **Altitude is a time span, not a rank.** Five rungs, defined by Jaques' *time span of discretion* — the longest period the work may run before review: 7 days frontline, 30 manager, 90 director, 180 executive, 365 enterprise. Each carries its stance, the *kind* of decision it makes, its duties **with the routes that serve them**, what it owes the level above and what it must not be handed. A person with direct reports and no leadership title is escalated to the frontline altitude **with the reason printed**; an IC with no reports gets `null` rather than a courtesy rung.
- **Responsibility is a property of the tree.** An open item names the people it concerns; its owner is the **lowest common ancestor** of their managers — so work touching two units rises to the smallest span that contains both, with no assignment step and no judgement call.
- **The clock is per altitude, and the crossing date is printed.** `requiredAltitude = max(by consequence, by age)`; every escalation row shows `openedOn + ownerHorizon`. When the requirement is above the highest altitude the roster contains, the page says so — **it will not invent a director, a VP or a CEO**, and it draws an empty rung empty, duties visible, no incumbent.
- **The roll-up is printed twice, because that is the only honest way.** Counts are exact sums (each item has exactly one owner, so the leader's rolled-up count *is* the item count). Rates are **pooled** (Σnum / Σden) with the naive **mean of unit rates** beside them — a composition-sensitive flag and a directly standardised comparison appear when they disagree past the declared bar, because a roll-up that quietly averages averages reports a number nobody experienced (Simpson 1951). Below the evidence floor a cell is **withheld with its reason**, never a proportion of one.
- **Drift in both directions.** Work a span is doing that belongs to its reports, and work nobody has taken. Barred against a declared share; exceeding it is a reading, not a reprimand.
- **Refusals that stay refused.** The escalation probability is a Fréchet floor over a survival curve read from the ages at which *this workspace's* items actually closed — withheld below the floor, with the independence value printed so the assumption has a price. A frozen reading is graded once after its review date; a reading that quoted no probability is **refused at grading** rather than scored as 0%.
- **A disclosure ladder that admits what it is.** Names at the frontline, only unit leaders above it, counts at the top — enforced in one function and printed as a *rendering contract* in a workspace with no authentication, rather than dressed up as access control.
- `RULE-CHN-01..05` on the shared post-commit spine (marker-idempotent, pausable): capped escalation tasks carrying the crossing date with `escalates-to` / `rolls-up-to` edges, a weekly hand-up per span, one governed structural decision, one drift decision, grading work. **No rule edits, closes or re-types the item it reports.**
- Six axe-clean panels, 14 route aliases, an Insights bucket, a badge counting only decision-shaped work, an identity-free brief, aggregate-only CSV #72 (blank for refusals, never zero). No person is rated, ranked or scored; `conflicts` and `pulses` are never read.

**Two defects found and fixed by building on shipped code.** `gradeChainReading` tested `Number.isFinite(Number(reading.predictedAnyBreachPct))` — and `Number(null)` is `0`, so a reading that quoted *no* probability was scored as a "0% any breach" forecast and then lapsed with the false note that its members had been deleted. A reading with zero frozen members could likewise be graded into a "lapsed" verdict; it now refuses and says why.

**The two-app-tree friction was fixed first, at the user's direction** — and the audit's finding was that it was never a code problem: lint, CI and the boundary gate already ignored the quarantine. It was *documentation*. `CONTRIBUTING.md` taught a PostgreSQL quickstart (`db:push`, `DATABASE_URL`, port 3000, "no automated test suite") for a tree that does not run; `docs/INDEX.md` indexed the abandoned programme as the product; `src/` had no in-tree marker and `deprecated/README.md` still claimed the Next.js app was canonical. All rewritten, plus [`docs/LEGACY-TREES.md`](./docs/LEGACY-TREES.md) as the inventory and rationale page, 30 archive pages bannered as historic, the Next.js toolchain namespaced `legacy:*` so `dev`/`start` serve the canonical app and `npm run typecheck` **refuses** with an explanation instead of reporting an empty pass, and **23 documentation assertions added to the boundary gate** so stale onboarding fails CI.

**Verified:** full canonical suite **2,247 tests across 137 suites, 2,247 pass / 0 fail** (1,347,526 ms, exit 0); `command-chain` 17/17; boundary gate 327 modules / 114 suites / 23 documentation checks with 0 violations; 571 internal links across 185 files resolve; ESLint exit 0; standalone rebuilt at 6,287,688 bytes / 326 modules / schema v82. The suite's first run after the schema bump failed 60 assertions — every one mechanical (pinned versions, migration-array tails, the CSV scope count, the standalone size tripwire) except two product defects it exposed: the chain ladder's *people* column counted a person at every rung above them, and `CHN-08` nudged an empty workspace twice. Real-browser walkthrough of `#/chain` **[UNVERIFIED]** (JSDOM + axe only).

## 2026-11-02 — The record, arguing against itself (Session 114, Schema v81, [ADR-0074](./docs/adr/0074-cross-examination-terminal.md), CSV #71)

A hundred and thirteen sessions built instruments that read the leader's record. Every one of them is on the leader's side: each computes what the record says the world is like and reports it. **None of them attacks what the leader has written down about it.** A goal marked done with no observation behind it is reported as done. A performance band with an empty evidence list is reported as a band. A case marked resolved while the delegation opened to mitigate it is still active is reported as resolved. A probability whose review date passed eight weeks ago is reported as a probability. The workspace has held both sides of every one of those contradictions — and a typed link between them — for twenty schemas, and has never once noticed. `#/sceptic` is the screen that notices, and the only one that argues against the person reading it.

- **Six families of claim, twelve structural detectors, zero new data entry.** Completion ("it is done"), assessment ("this is how good it is"), prediction ("this will happen"), diagnosis ("this is why it happened"), alignment ("they are with me") and capacity ("we can deliver by then"). Each family carries the error rate; there is no composite score, because "how often are my completion claims contradicted" is answerable and "how often am I wrong" is not. Every detector compares two records the workspace already holds, or a record against a hole where another should be — `SCP-PR-01` interpolates the pace line its own `start`, `target`, `dueDate` and `createdAt` imply and reports the gap in percentage points behind an "on track" label; `SCP-CP-01` compares the promises falling due next week against the workspace's own measured settlement rate; `SCP-CM-02` walks the `mitigates` edge.
- **Every finding carries its refuter.** The single observation that would end the argument, printed on the card and carried into the task the rule opens — because a detector that cannot be answered is an accusation, not an audit. Nothing is read for sentiment or tone; no prose, no pulses, no conflicts.
- **A verdict is a human act with a required reason**, and it is never rewritten: `refuted` (the claim was wrong), `held` (the claim survived — the terminal was wrong), `dismissed` (the comparison itself is wrong). Refuted and held are scored; a dismissal never is, and the dismissal rate is printed beside the hit rate instead of being folded into it.
- **The rate is a Jeffreys Beta posterior with a credible interval, refused below a floor.** `Beta(½ + refuted, ½ + held)`, 90% interval by bisection on the regularized incomplete beta. Below four scored claims a family prints no rate and none of its claims is priced — the posterior mean is shown to the reader and never reaches a probability, an exposure figure or a frozen round. And the rate is computed over **every verdict ever recorded**, not only the claims still on file: a refuted claim usually gets fixed, so a rate over survivors would report a family *improving* as its bad claims were repaired. That is survivorship bias (Wald 1943), and refusing it is the design.
- **Coverage is discovery sampling and is allowed to say nothing is known.** The population is the records whose claim a detector actually read (a detector that throws counts as zero, because an error is not coverage). The bound on the terminal's own false-alarm rate is Clopper–Pearson `Beta(1−α; h+1, k−h)`, of which the rule of three is the `h = 0` case: 100% with nothing examined, 28.3% after nine clean examinations, and it prints that 29 examinations would bound it below 10%.
- **Freeze refuses to price what it cannot price; grading is once, later, and can lose.** A round cannot be frozen unless one family has cleared its floor — claims from unmeasured families are excluded and **counted out loud**, never given 50%. Grading scores only verdicts recorded *after* the freeze (an earlier one was already inside the rate the round quoted), by Brier and log loss against the round's own base rate, with a skill figure that may be negative and is printed when it is. A window that closes with nothing scored **lapses** — not excused, never a win.
- **The demo's receipt is a loss, printed.** The seeded round was frozen 45 days before its verdicts and grades at **Brier 0.2233 against 0.2222** for its own base rate (skill −0.005) — because a terminal that cannot lose is not being tested.
- **`RULE-SCP-01..05` on the shared spine, and not one of them records a verdict.** A freeze opens at most three cross-examination tasks carrying the refuter plus `cross-examines` / `finds-against` edges; a family whose whole interval sits above tolerance opens ONE governed decision per family per 30-day bucket, phrased as a process question; a verdict writes a `records-verdict` edge to the record whose claim it settles; an ungraded round past its window opens grading work; and a dismissal rate past the leader's own cap opens one blameless question a month — because a terminal that is mostly dismissed is either broken or being closed, and the reasons on file distinguish the two.
- **Same contract as every surface before it.** `SCP-01..07` signals in a new *Cross-examination* insights bucket, a badge that counts only decision-shaped work (families failing, rounds due, and the first visit to an unexamined record — never the count of findings), an identity-free brief, aggregate-only **CSV #71** (family, detector, coverage and round rows; blank for every refusal, never zero), fourteen route aliases, six axe-clean panels, two graph nodes and three relations. **No person is rated, ranked or named anywhere in the module**, and the exposure figure is stake-weighted units rather than money, because no record here prices a wrong claim.

## 2026-11-02 — The promise book: every dated commitment priced as a liability portfolio (Session 113, Schema v80, [ADR-0073](./docs/adr/0073-promise-solvency-terminal.md), CSV #70)

Every leadership tool in this category — Asana, Monday, ClickUp, Notion, Linear, Lattice, Workboard, Perdoo, Viva Goals — computes an **on-time completion rate**: the share of things that finished by their date. That is a rear-view metric. Nobody prices the **forward** book, which is the only book a leader can still do anything about. Nobody says *"given how this workspace actually settles its promises, sixteen promises due in the next eight weeks imply 4.7 breaches — a 29.6% share against your own 30% alarm — and twenty-one promises fall due in the next four weeks against a measured settlement rate of 2.9 per week, so coverage is 0.56×."* Finance has done this for decades: probability of default, a term structure of exposure, a one-factor copula, risk contributions that sum to the tail, Little's Law. `#/solvency` is that machinery applied to the one portfolio a first-time leader actually owns and has never once been shown.

- **Six sources, one book, zero new data entry.** Delegation due dates, decision review dates, goal dates, feedback follow-ups, stakeholder contact cadences and hiring start dates are harvested into one promise shape `{ obligationOn, openedOn, settlementOn, open }`. A record with no obligation date is *not* a promise — nothing is invented. Each source is scored on its own settled record (right-censored at today), with a Jeffreys-smoothed on-time share, a Wilson interval, and four verdicts that print their reasons: `reliable`, `watch`, `unreliable`, and `unproven` — where **unproven prices nothing at all** rather than assuming 100%. Counterparty-class pooling is the one exception and it is a declaration you can refuse.
- **PD is a survival ratio, with one honest virtual observation.** `PD(t) = S(1) / S(today − obligation)` over that source's settlement-offset grid, Jeffreys (½, ½) prior, plus **exactly one virtual on-time settlement at offset 0** — because a leader who has settled ten promises has demonstrated they *can* be on time at least once, and the naive estimator would declare a source that has only ever been late incapable of ever being early. The virtuality is printed in the method panel.
- **The joint claim is a copula, and it is shown beside its own bounds.** One-factor Gaussian copula (Vasicek 1987; Merton 1974, the Basel II IRB form), Simpson's rule on [−8, 8] over the common factor, Euler/Tasche marginal contributions computed in the same pass — so the repair queue is ranked by each promise's contribution to the book, not by its own probability. The Fréchet–Hoeffding interval is printed beside it, and a 0→90% ρ sweep shows how much the declared correlation is worth arguing about. `E[N] = Σ PD_i` needs no dependence assumption at all, and it is the number the terminal leads with.
- **The terminal tells you when its own headline is arithmetic theatre.** P(at least one breach) reads 97.7% at ρ = 0.3 for sixteen promises and 99.9% under independence: it saturates, so it cannot improve and cannot discriminate. The panel says that in words. What does not saturate is the **count**, whose full law `P(N = k)` is computed by convolving conditional Bernoullis across the factor (exact Poisson-binomial at ρ = 0). That distribution is the number a reading actually signs, and it is what gets scored.
- **Capacity is measured, not asserted.** Settlements per week over the declared window against promises opened per week gives utilisation 1.41× and coverage 0.56× in the demo; Little's Law converts the book into a 13.4-week clearance time with its constant-demand assumption printed beside it; a 100/80/60/40% stress curve prints the shortfall at each level (10 → 12 → 14 → 17 promises) instead of hiding it behind one number. A ratio of zero is refused where the truth is "unmeasurable", and an infinite ratio is never printed where nothing falls due.
- **The repair queue prices two costs and caps the date.** `leaveLoss = PD × breachMultiplier × weight` against `askCost = weight`, with the multiplier a declared convention grounded in trust-repair asymmetry — not a measurement, and labelled as such. Each verdict carries the printed sentence to say. At the leader's own move cap the verdict becomes `decide`, because a third date is not a renegotiation.
- **Grading is a copy of the number signed, and it can lose.** Every priced promise is one forecast–outcome pair: Brier loss against the book's own observed breach rate, withheld below five readings. The count is scored by ranked probability score (Epstein 1969) and logarithmic score against the same marginals under independence. The demo's one graded reading scores **RPS 1.136 against 0.826 for independence** — printed, not buried, because a model that cannot lose is not being tested. Freezes happen once a day; grading happens once, after the window; an empty window **lapses** rather than being excused.
- **Two design reversals, inside the session, both now pinned by tests.** (1) The Fréchet ceiling was implemented as a second *scored* claim and removed: `min(1, Σpᵢ)` reads 100% for any book of more than a dozen promises, so scoring it against a book that broke hands the assumption-free bound a perfect Brier score of zero — a grader that flatters the bound is worse than no grader. It is still stored and printed on every panel; it is never scored. (2) The Brier score moved from the joint binary claim to the individual promises, because one Bernoulli per reading at ~97.7% is not a measurement while sixteen promise-level forecasts against sixteen outcomes is.
- **`RULE-SLV-01..05` on the shared post-commit spine, and no rule ever moves a date.** A freeze opens at most three repair tasks carrying the script, up to eight `endangers-promise` edges, and exactly one governed capacity decision per ISO week with an `underwrites-commitment` edge; a scan opens one acknowledgement per already-broken promise ever and one decision per promise at its move cap; one blameless process question per 30-day bucket when the expected breach share crosses the alarm; grading work; and reconciliation of stale edges. Marker-idempotent, pausable, and never a write to another module's date.
- **The one write across modules is a decision with a reason.** `renegotiatePromise` changes the real `dueOn`/`reviewOn` on the source record, appends an immutable ledger row with the reason verbatim, and edges that row — a first-class `solvencyrenegotiation` node — to the promise it moved with `renegotiates`. It refuses an earlier or equal date, a date more than a year out, a reason under eight characters, and any move past the cap.
- **Same contract as every surface before it.** `SLV-01..06` signals in a new *Promise solvency* insights bucket, a badge that counts only decision-shaped signals, an identity-free brief, aggregate-only **CSV #70** (one row per source, per maturity bucket and per frozen reading; blank for every refusal, never zero), thirteen route aliases, six axe-clean panels, and a demo seed that rewinds the workspace 45 days so its one frozen reading was genuinely made *before* its outcome. **No person is rated, ranked or named anywhere in the module.**

## 2026-11-01 — Every "ask again later" was a work order: the Evidence Supply Chain (Session 111, Schema v79, [ADR-0071](./docs/adr/0071-evidence-supply-chain.md), CSV #69)

A hundred sessions of statistical honesty produced a product that refuses a great deal. Session 99 refuses a signal family below its floor; Session 100 refuses a unit below its sample floor; Session 103 refuses a delivery class below its at-risk count; Session 108 refuses a policy the record cannot identify; Session 109 refuses to separate two people its instrument cannot tell apart; Session 110 refuses a correlation band below its pair floor. **Every refusal is correct, and together they are the worst possible first quarter for someone who has never managed anyone** — sixty screens saying *ask again later* in six vocabularies, and not one of them saying which gap is worth closing, how long the record would take to close it on its own, or whether it should be closed at all. A refusal that cannot be priced is indistinguishable from a defect.

`#/supply` is the screen that answers it, and it is not another report. It treats the workspace's own ability to judge as a **production system** — a refusal is a work order, evidence is the input, and the arrival rate of evidence is measurable from records that already exist.

- **Six evidence lines, one registry, zero new data entry.** Assumption settlements, calls carrying a recorded decision day, delegations that closed, completed review observations (resolved by the reliability terminal's own harvester so the two surfaces can never disagree about what one observation is), resolved cases and graded forecasts. Each line is measured against the count its consuming instrument needs; adding a seventh is one registry entry plus one adapter, and the report, plan, rules, view, signals and CSV all iterate the registry.
- **The wait is a closed-form posterior predictive, and it refuses twice.** With `n` units across `W` weeks and a Jeffreys prior, the time to `k` more units is negative binomial with `r = n + ½`, `p = W/(W+t)`, so `P(T_k > t) = P(N(t) ≤ k − 1)` — evaluated term by term, no simulation, no factorials. Percentiles by bisection. A line that has **never** produced a unit gets no quantile at all (the number exists — about sixteen years — and printing it would read like a schedule), and the expected wait `W·k/(r − 1)` is refused outright when fewer than one unit has been observed, because an expected wait that does not exist *is* what a starved line looks like.
- **Five verdicts, each with the reason printed on the line.** *Met* (read the answer, stop gathering), *filling* (the record is doing the work), *starved* (waiting is not a plan), *retire*, *never produced*. `retire` is the module's stance and its most contestable one: starved **and** the open work it feeds is older than the declared retirement bar, so the sunk-cost rule (Arkes & Blumer 1985) is applied to *questions* — time already spent waiting is unrecoverable and must not decide whether to keep waiting.
- **The constraint is named, and the word is earned.** Pressure = open demand × (1 − P(fill inside the horizon)). The top line is the constraint; it is called **binding** only when the share of demand sitting on starved lines clears the leader's bar. Below the bar the page prints "the biggest queue, not a binding constraint" rather than borrowing the authority of a word it has not earned. A separate Little's Law read (`L = λW`) turns the whole queue into a clearance time, with its constant-demand assumption printed beside the number.
- **Capture versus wait is priced against a declared exchange rate.** The engine can measure the wait; it cannot price your hour. It asks for `supplyMinutesPerUnit` — the one input it cannot derive — then prints weeks saved per hour against a declared bar. Both figures are on screen, so a leader can disagree with the exchange rate instead of with a hidden assumption.
- **The schedule is bounded by the rope and its optimality gap is printed.** Candidates ranked by pressure per hour, filled greedily inside the declared weekly evidence hours; the fractional (LP-relaxation) value of the same ordering bounds the integer optimum from above and the gap is shown. Greedy is not optimal and the page says so. Lines with no open demand are never scheduled: evidence nobody is waiting for is inventory with no buyer.
- **One probability, and it is the assumption-free one.** A frozen plan quotes the chance that **at least one** planned line clears — headline `max(pᵢ)`, the Fréchet lower bound, valid with no independence assumption at all and therefore incapable of being optimistic; the independence value `1 − Π(1 − pᵢ)` printed beside it and labelled as an assumption, with the difference stored as `reservePct`. Members' required and observed counts freeze with the plan, so grading cannot drift with a later convention change. Graded once, by Brier, from strictly later evidence; an empty window is graded, not excused.
- **`RULE-SUP-01..05` on the shared spine.** A frozen plan opens capped capture tasks with `supplies-evidence` edges and `unblocks-judgement` edges to the real open records the line feeds; a scan opens exactly one governed capacity DACI decision per ISO week with the three Theory-of-Constraints moves printed (feed / elevate / subordinate), one retirement task per starved line per 30-day bucket, **one "read the answer now" task once per line ever** when a line reaches its floor, and grading work for a plan whose window closed ungraded. Marker-idempotent, pausable by `supplyAutoPropagate`; an explicit scan always runs.
- **Telemetry, not a target list.** `SUP-01..06` signals in a new *Evidence supply* bucket, a nav badge that counts only decision-shaped signals, an identity-free brief, aggregate-only **CSV #69** (one row per line, one per plan; blank below a floor, never zero), the `supplyplan` node with three typed relations, six axe-clean panels, twelve route aliases and a demo seed that freezes a plan from a truncated copy of the state and grades it out of sample.
- **Building it found two defects in this session's own first draft, both now pinned by tests:** the task cap counted *effects* rather than tasks (so a two-task plan silently issued one), and `supplyplan` was added to the link collection map but not to the entity-type list, which made every `supplies-evidence` edge a silent no-op — the exact failure `ensureEntityLink` exists to prevent, caught only because the suite asserts the link was written.

## 2026-11-01 — The number this product sold you and never checked: the Coupling Ledger (Session 110, Schema v78, [ADR-0070](./docs/adr/0070-coupling-ledger.md), CSV #68)

Since Session 98 the Deferral Portfolio has asked you to declare a pairwise correlation &#961; on every pair of calls the typed graph shows sharing a premise, and has then priced a correlated joint tail on that number. The panel says the honest thing — *"the graph identified the pairs; the number is yours to declare."* Which also means the most consequential assumption in the whole deferral terminal was the only one with no read-back anywhere. Sessions 98 and 99 each listed "&#961; calibration" as a top-three carry, and both had the estimator wrong: a Brier ledger grades **a probability about an outcome**, while &#961; is **a dependence between two processes**, and one book-level binary per reading identifies neither.

The estimator that does work was already sitting in the data. Every decision carries a creation date and, once made, a frozen `decidedOn`. So every call has an **at-risk calendar window** and a **resolution block**, and two declared partners either resolved inside the same block or they did not. `#/deferral?panel=coupling` reads that.

- **The estimand is named, and the refusals are printed.** Co-resolution *given that both resolved*, in 30-day calendar blocks — never co-movement of value, never a probability that either resolves. A pair with an open member is refused with its reason and **never counted as a non-coincidence**; a pair whose whole common window fits inside one block is refused because a coincidence there is arithmetically certain.
- **The null respects the coupling graph.** Each call's resolution block rotates inside its own at-risk window (so marginals are preserved) and a call belonging to several pairs keeps **one** placement across all of them — per-pair p-values are not independent, and Fisher's method would be invalid here. The family is deterministic, so the p-value never moves between machines, and because every rotation window is at least as wide as the pair's common window the null is **conservative**: it overstates, never understates, the evidence. The analytic expectation |A&#8745;B|/(|A|&#183;|B|) is printed beside every count so the lift always has a denominator independent of the rotation family.
- **Both tails, because one tail cannot see an over-declaration.** With zero coincidences the upper test returns p = 1 forever — so a confirm-the-declaration test would report *success* in exactly the most damning case. The deficit tail is the load-bearing statistic, and `hedged` / `over-declared` are only reachable through it. On the demo record the near-independent band returns **coupled / under-declared at lift 2.93**: the leader declared independence for five pairs that all resolved together, and the record says so.
- **Declared &#961; is a copula parameter, not a probability, so two conventions are printed.** &#964; = &#961;, and the exact normal-theory Spearman transform &#964; = 2&#183;sin(&#960;&#961;/6) (Kruskal 1958). At &#961; = 0 the curve reproduces the printed independence rate 1/k exactly; at &#961; &#8594; 1 it reaches 1. Where the two mappings disagree about a *magnitude*, the finding is marked mapping-dependent and **no work is opened on it**.
- **A thin band prints no assessment at all.** Six verdicts — `insufficient`, `unidentifiable`, `inconclusive`, `independent`, `coupled`, `hedged` — become six assessments: `confirmed`, `over-declared`, `under-declared`, `overstated`, `understated`, `unresolved`. Below the pair floor the row says *unresolved*, never *independent*: that is the single most damaging misreading available on this screen, and a test pins it. Materiality of `max(5 pp, 20% of the model figure)` gates every size claim.
- **Frozen reviews store aggregates and member ids. Nothing else.** No title, no question, no person, no note. One prospective probability from a Laplace-smoothed commitment hazard **re-based to the review's own window**, graded exactly once; a later contradicted declaration appends a challenge note and never rewrites the frozen figures.
- **Nothing is ever written back.** The module has no write path to `correlationDeclarations`. It never clamps, defaults, derives or applies a declaration. "Declare from your record" pre-fills the dialog and states where the number came from; you still confirm it.
- **RULE-CPL-01..03** on the shared post-commit spine write `calibrates-coupling` and `measures-coupling` edges, open at most one owned reconciliation task per contradicted band, and turn a contradiction into at most one governed re-declaration decision per ISO week with three printed options. Five signals, a Coupling insights bucket, a nav badge, route aliases, six axe-clean panels, an identity-free brief and CSV scope #68 (band aggregates only — no decision id, no band label, no title).

**Building on shipped code found a real defect in it.** The bivariate normal in `couplingLedger.js` was computing the CDF for **&#961;&#178;** — at &#961; = 0.5 it returned 0.290 against a true 0.333, a 13-point error in the middle of the range the module reads — and a fixed 240-panel quadrature grid was accurate at &#961; = 0.3 and badly wrong at 0.95, because the integrand's feature width is &#8730;(1&#8722;&#961;). Both are fixed and pinned against the closed form &#934;&#8322;(0,0;&#961;) = &#188; + arcsin(&#961;)/2&#960; across &#8722;0.5 &#8230; 0.99. Four more defects were found by building on the module: a verdict helper reading its floors off the wrong object (`undefined`), silently disabling every floor while a two-pair band printed `coupled`; a rule returning before its own contradiction branch; a frozen claim re-basing a 90-day hazard onto a 30-day window (95.7% where 65.1% was right); and the deferral terminal never having been through axe at all, because it was not in the accessibility suite's route list.

**Not claimed.** That a coincidence rate identifies a Pearson correlation of value innovations — it does not, and the mapping is a printed convention. That 30-day blocks are the right grain — they are a declared convention, and the page says what the grid removes. That a refused pair means the calls were uncoupled — it means the record cannot see them resolve.

## 2026-11-01 — How much of what you believe about your team survives its own measurement error? The Measurement Reliability Terminal (Session 109, Schema v77, [ADR-0069](./docs/adr/0069-measurement-reliability-terminal.md), CSV #67)

Every other terminal in this product audits an object the workspace stores: a case, a forecast, a premise, a delegation, a policy. **None audited the instrument a first-time leader uses to make the most consequential people calls they will ever make — the performance review rating.** That rating decides pay, promotion, stretch scope and whether someone is managed out. It is a measurement, it has a variance decomposition, and in the entire 2026 performance-management market nobody computes it. Culture Amp ships bias detection, calibration outlier flags and causal-inference language; Leapsome flags a department average more than 0.5 points from the company mean; Lattice, 15Five, Visier, Perceptyx and the AI-native entrants ship drafting, summarising, sentiment and attrition scoring. Every one of those signals is about **people or about managers**. None is about the reliability of the measurement itself. A 2026 standards review of HR analytics tooling is explicit that the accepted evidence stack is ICC, Bland–Altman and test–retest, and that alpha alone is insufficient — and no vendor publishes any of it for ratings.

`#/reliability` (seven panels) reads only reviews the leader already wrote, and answers four questions.

- **How much of the spread between my people is signal?** Every completed review becomes one observation of a people × cycle design. A balanced two-way random-effects ANOVA is solved exactly — τ² between-person, cycle and residual pooled as *occasion error*, because a manager cannot bank a good quarter and cash it later. Printed: ICC(1), a Satterthwaite interval, an F test of τ² = 0 with its p-value, and the reliability of the **mean of k ratings** by Spearman–Brown. A single rating and a four-rating average are different facts, and reporting only the flattering one is how an instrument gets oversold. Unbalanced designs use Cochran's n₀ and a balance ratio; a design too ragged to carry a coefficient is refused with a machine-readable reason instead of smoothed.
- **What should I expect from this person next time?** Per-person credibility n/(n + K), K = occasion error ÷ between-person variance, with regression to the mean stated as the expectation for the **next** observation. This is deliberately not a score, a potential rating or a ranking — the module has no code path that produces one.
- **Can I actually tell these people apart?** Separation is a posterior test, not a sort: two people share a tier unless the evidence separates them. The finding is the tier count and the number of indistinguishable adjacent pairs — on the demo record, 3 tiers and **2 of 4 adjacent pairs indistinguishable**. Inside a tier the order is alphabetical, on purpose, and membership never leaves the screen.
- **What would a defensible difference cost?** A decision study: **MDE 1.27 rating points** at 80% power on the current record, **7 ratings per person** to detect a one-point gap, and **8.9 months** at the declared 90-day cadence. A refusal the leader cannot act on is only half a product.

**Instrument convergence, with a hard refusal.** Three instruments that should describe the same people are tested against the rating record with tie-corrected Spearman and an exact permutation p: goal attainment, feedback balance and delivery timeliness. No composite is formed unless **every testable pair** converged. The demo makes the strongest honest case for why:
- goal attainment orders the same five people almost identically to the ratings (**ρ = 0.90**) and the exact test still returns **p = 0.083** — five people and one swapped pair. That is reported as *uncertified agreement*, with the sentence explaining that a single swapped pair at n = 5 is a limit of the rank test, not evidence the instruments measure different things;
- feedback balance and delivery timeliness do not carry enough items per person to rank at all, and say so.

Calling the first pair "agreement" would be a lie; calling it "disagreement" would be a worse one. The panel prints both.

**Freeze once, grade once, lapse an empty window.** A frozen reading stores the design counts, the coefficients, the tier and pair counts and the floor in force — **never a person's name, reading or tier membership** — and is graded once, out of sample, against the record as it stands at the horizon. A window that closes with fewer than the declared number of new observations **lapses** instead of being credited.

**`RULE-REL-01..05` on the same spine as every other module:**
- **REL-01** records each completed review as exactly one observation (a reopened-then-recompleted review is never double-counted) — and deliberately emits **no** workspace event, so `review.completed` stays the terminal entry downstream readers rely on;
- **REL-02** opens **at most one** governed DACI decision per ISO week, plus one blameless process task, when the instrument sits below its declared separability floor *while* differentiation is actually being asked of it (a merit cycle exists, or a calibration decision is open) — priced downstream by Decision Tempo in the same transaction — and links it with `qualifies-differentiation`;
- **REL-03** is the surprise guard: when a just-completed rating lands a full scale point outside that person's credibility-weighted band, it appends an advisory note to the review and opens one leader-owned verification task. **The rating is never rewritten**, and the note is a note, not a correction;
- **REL-04** opens at most one blameless method task per month when two instruments that should describe the same people do not converge;
- **REL-05** reconciles markers and edges and grades or lapses a frozen reading once, from strictly later observations only.

`reliabilityAutoPropagate` pauses the automatic side; an explicit scan always runs and reports what it would have done.

**Telemetry, not a target list.** CSV scope **#67** carries counts, ratios and coefficients with every cell **blank below its floor and never zero** — no name, no person id, no per-person rating, no free text. The board brief names no person and prints tier *sizes* only, because a brief gets forwarded and a tier membership does not travel with it. `REL-01..06` signals, a *Measurement reliability* Insights bucket, a nav badge and twelve route aliases complete the wiring.

**Not claimed:** that an ICC is a fairness measure (it is silent about bias against any group); that the coefficients generalise to other scales, populations or cadences; that a wide interval or a refusal means "no difference" rather than "unmeasured"; or that five people can certify an instrument. The caveats card and the brief print the limits, including that cycle and residual are pooled as occasion error on purpose and that a cohort-wide shift will therefore read as noise. Real-browser and assistive-technology behaviour of this page remains **[UNVERIFIED]**.

## 2026-11-01 — Would a rule have beaten you? The Counterfactual Policy Terminal (Session 108, Schema v76, [ADR-0068](./docs/adr/0068-counterfactual-policy-terminal.md), CSV #66)

Every prior LeadOS terminal grades the work against a declared standard, a forecast, or a plan the leader wrote. None of them could answer the question a board actually asks after a year of judgement calls: **would a standing rule have done better than the decisions this leader already made?** Not "was the decision good" — a counterfactual about the *policy* that produced it.

`#/counterfactual` is the **Counterfactual Policy Terminal**. It is off-policy evaluation applied to a manager's own records, and it is built to refuse as carefully as it estimates.

- **Four families of decision points, zero new data entry.** Every dated workspace record that already carries a decision and a settled result is harvested: a registered assumption and its human-assessed outcome (arm = a dated observation existed before it settled), a DACI call and its outcome review (arm = decided inside the declared review window), a delegation and its delivery date (arm = a checkpoint was held before the due date), a closed case and what actually happened (arm = mitigation spend was committed before resolution). Reward is 0 / 0.5 / 1 by each family's own declared rule. Nothing is entered for this screen, and **no arm is ever re-armed**: a policy is only evaluated where the record already took it.
- **Five policies race, four estimators disagree in public.** The recorded behaviour policy is *exactly identified*, so no model is fitted and no weight is applied to it — it is the plain mean, with agreement 100% and no interval. Against it: always act, always hold, prequential best-so-far, and adaptive-recent. Each is scored by a shrunk direct method, inverse propensity scoring, **Hájek (1971) self-normalised IPS** as the bounded headline, and the **doubly-robust** combination (Robins, Rotnitzky & Zhao 1994). Their spread is printed as the fragility diagnostic: above 10 points the row is called *fragile* rather than reported as a finding. Under poor overlap one rarely-taken arm moved doubly-robust by eight points; the bounded headline does not, which is why it leads.
- **Identification is checked before estimation, not after.** Manski (1990/1995) worst-case bounds — assumption-free and family-bounded — bracket every point estimate, and the missing fraction, effective sample size and per-arm floors decide whether a row is estimated or refused. A policy the record never took is **refused-unidentifiable**, never extrapolated. On the demo record: *always act* is +0.95pp with a 95% interval of [−3.92, +5.69]pp (**no-difference**), while *always hold* (+6.94pp), *prequential best* (−7.57pp) and *adaptive-recent* (−8.26pp) sit inside their own bounds and are refused — three of four alternatives cannot be answered by this record, and the terminal says so.
- **Hidden bias is priced, not assumed away.** Matched pairs are greedy nearest neighbours inside a caliper on **pre-treatment covariates only** (post-treatment matching collapsed overlap to zero in an earlier iteration). Balance is reported as ASMD (Stuart 2010), never assumed. McNemar (1947) is exact and two-sided, and a Rosenbaum (1987, 2002) bound gives the worst-case p-value as hidden bias grows, with the **design sensitivity Γ\*** solved by bisection to the exact Γ where the finding would be overturned. A **Hoeffding (1963) confidence sequence** lets the race be watched every day without the interval losing its time-uniform coverage — at 90 decision points the half-width is 0.19.
- **One governed ruling per week, never a policy adopted for you.** `RULE-CFP-01..04` run on the shared post-commit spine, marker-idempotent and pauseable: prospective capture before the outcome is known, outcome resolution from record dates, at most one policy-ruling DACI decision *plus* one blameless process task per ISO week, and reconciliation that drops decision points whose source record was deleted. Frozen evaluations are graded **once** from strictly later evidence and **lapse rather than being credited** when the window closes empty.

**Start:** `npm ci` then `npm run app`, or open the rebuilt `LeadOS-standalone.html`. Verify with `npm run verify:canonical` and `npm run verify:standalone`.

**Scope & limits:** this is decision support from observational records, not a causal experiment and not a person rating. No policy is ever adopted on the leader's behalf; the engine reads no confidential collection (`conflicts`, `pulses`, `candidates`, `messages` are provably never touched); no person is a unit anywhere in the module; the matched-pairs design requires no unobserved confounding, and the terminal states that assumption rather than hiding it. Real-browser and physical screen-reader walkthroughs remain **[UNVERIFIED]** (automated JSDOM + `axe-core` verified across all six panels).

---

## 2026-11-01 — Outcome Attribution & Loop Settlement Terminal: separate team execution from strategic thesis error, leader bottlenecks, and schedule/cost drift (Session 107, Schema v75, [ADR-0067](./docs/adr/0067-outcome-attribution-loop-settlement.md), CSV #65)

Response Studio (`#/responses`) and Action Bundles (`#/bundles`) let a leader rehearse and atomically adopt a coordinated response across cases, DACI decisions, delegations, assumptions, budgets, stakeholder briefs, and 1:1 prompts. Until now, however, LeadOS stopped at the adoption receipt: it could not tell whether a closed or slipping loop succeeded or failed because of **delegated execution**, **leader-gated clearance bottlenecks**, or a **falsified strategic premise**.

`#/attribution` is the **Outcome Attribution & Loop Settlement Terminal**:

- **Zero-re-entry $O(V + E)$ loop discovery:** harvests adopted Action Bundles, adopted Response Plans, and multi-channel Case Control Loops directly from the existing entity and typed-link ledgers.
- **Lipke (2003) Earned Schedule & Goldratt (1997) Fever Chart:** computes Earned Schedule ($ES = P \cdot PD$), time-based schedule performance ($SPI(t) = ES / AT$), schedule variance ($SV(t)$), and independent duration forecast ($IEAC(t) = AT / P$, withheld below 5% clearance), plotting elapsed window burn against clearance in Green / Watch / Red corridors.
- **Pressman–Wildavsky (1973) clearance separation & 2×2 attribution:** splits leader-owned gates (unchosen DACI calls, unsent briefs, unheld 1:1 support) from delegated work and classifies loops into six regimes: *Validated Win*, *Thesis Falsified — Clean Execution* (Holmström/Kerr team exoneration), *Leader-Gated Stall*, *Execution Drift — Untested Thesis* (Fixsen Type-III error guard), *Confounded — Refused* (explicit refusal when both execution and outcome fail without a settled premise), and *In-Flight On Pace*.
- **Brinson–Fachler (1985) 3-way economic variance & Savage (1951) ex-post policy regret:** decomposes cost delta into schedule drift, rate/spend revision, and joint interaction with zero residual while enforcing strict ISO currency isolation (`mixed-currency-refused`) and keeping unspent budget commitments `encumbrance-only`; grades ex-post regret across Response Studio's `Contain now` / `Evidence first` / `Delay` branches.
- **Prospective Brier calibration & generalized `RULE-STL-01..05` propagation:** freezes Cromwell-clamped $[5\%, 95\%]$ loop forecasts ahead of closure, grades them once out-of-sample on `case.resolved` / `premise.outcome` (Brier Skill Score withheld below $n = 5$), writes typed `settles-loop` / `exonerates-delivery` / `flags-bottleneck` edges, queues blameless 1:1 clean-delivery credit prompts, opens governed double-loop thesis-pivot DACI decisions (priced downstream by Decision Tempo in the same transaction), seeds After-Action Review drafts, flags leader-owned decision bottlenecks, and guards open assumptions against premature Type-III abandonment without breaking untouched Action Bundle withdrawal.

**Start:** `npm ci` then `npm run app` (default `http://localhost:5173`), or open the rebuilt `LeadOS-standalone.html` directly. Verify with `npm run verify:canonical` and `npm run verify:standalone`. This session: all 107 canonical test suites pass (**0 failures** across `[a-z]*.test.mjs`, including new `settlement.test.mjs` **9/9** and `access-audit.test.mjs` **13/13**), standalone **7/7**, scale **5/5**, lint, boundary, and internal markdown links pass.

**Scope & limits:** never a person rating or HR ranking; personal-blame language is rejected/scrubbed; observational attribution refuses confounded loops rather than claiming causal proof; real-browser and physical screen-reader walkthroughs remain **[UNVERIFIED]** (automated JSDOM + `axe-core` verified).

---

## 2026-11-01 — Currency-safe capacity and hiring decisions

Capacity now withholds global allocation and release rankings when estimated values use multiple currencies. The capacity-overload rule still opens a linked trade-off decision, but explains why ranked deferrals are unavailable; suggested scope trims are withheld too. Hiring and Today show vacancy exposure per currency; scenario historical vacancy and shadow-value claims are withheld when their units do not match. Existing decisions are not rewritten. No exchange rates, schema changes or new dependencies are introduced. Full workspace-wide dimensional safety and real-browser accessibility remain **[UNVERIFIED]**.

---

## 2026-11-01 — Decision integrity: currencies and portfolio tails (Session 105)

The operational-case portfolio now separates amounts by currency rather than adding, for example, EUR to USD and labeling the result USD. When a scenario's participating funded projects, cases, simulated changes or hiring costs use different currencies, the scenario engine withholds its combined valuation and Pareto claim; no exchange rates are invented. Different single-currency scenario values are not compared either. The decision handoff preserves that uncertainty rather than calling an unavailable comparison “dominated”. Numeric daily vacancy costs now enter scenario economics.

Summed individual P90 estimates for cases and diverted person-days are explicitly labeled as such, **not** as a portfolio P90; dependence is unknown. These checks are derived from the current records, so existing case rules still create decisions, delegations, capacity reserves and coaching prompts in the same transaction, and the valuation guard updates without re-entry. No storage migration, backend, dependency, or FX service is added. Other financial aggregations and capacity value-density rankings remain **[UNVERIFIED]** for mixed-currency safety; this change does not constitute a workspace-wide FX system.

---

## 2026-11-01 — Action Bundles: one review, many modules, one transaction (Session 104, Schema v74, [ADR-0066](./docs/adr/0066-action-bundles.md), CSV #64)

Response Studio now hands off to **Action Bundles** (`#/bundles`). From one operational case, propose a coordinated decision, delegated verification, testable assumption, budget commitment, stakeholder briefs and a blameless 1:1 prompt. Edit or deselect each action, rehearse the real production commands in a background worker, inspect the exact collection and typed-graph diff, then adopt atomically.

The generalized rule spine receives every staged source event in the same store transaction. A failed command, failed rule or mismatch with the reviewed footprint rolls the whole bundle back. Adoption freezes target fingerprints; withdrawal is allowed only while every target is untouched. It returns work, releases unspent money, dismisses unsent drafts and removes only untouched records—audit history and downstream work remain. No message is sent, no option is chosen, and no spend is recorded by adoption.

**Integrated:** case detail and Response Studio handoffs, Today and Signals attention, typed `bundle` node and `coordinates` relation, RULE-BND-01..03, Settings review-checkpoint toggle, nav badge/route aliases/title, aggregate-only CSV #64, receipt export, demo cleanup, additive v73→v74 migration, hosted module worker and standalone Blob worker.

**Start:** `npm ci` then `npm run app` (default http://localhost:5173), or open the rebuilt `LeadOS-standalone.html` directly. No account, backend, model key or runtime network call. Verify with `npm run verify:canonical` and `npm run verify:standalone`. This session: full suite **2018/2018**, final focused regressions **86/86**, standalone **7/7**; lint, boundary and documentation-link checks pass.

**Scope:** software rehearsal is not a causal outcome forecast; commitments are not actual spend; coaching is not a person score. Real-browser/assistive-technology walkthrough remains **[UNVERIFIED]** (JSDOM + axe coverage is automated).

---

## 2026-11-01 — Response Studio: rehearse contain / verify / wait across the real rule graph before you commit (Session 103, Schema v73, [ADR-0065](./docs/adr/0065-response-studio.md), CSV #63)

A first-time manager's hardest moment is not filling a form. It is the sentence after an incident lands:
**"What happens if I contain this now, verify it first, or wait?"** Until this session LeadOS could capture
the intake and simulate a case, but the three choices were still intuition, and the product could not show
their cross-module consequences before they became facts.

`#/responses` is the **Response Studio**. Pick an intake draft, declare the weekly delay cost
(low / mode / high), the mitigation budget, the delay window and the evidence window, then run a rehearsal.
The same commands and post-commit rules that run after commit are replayed in three disposable stores:

- **Contain today** — open the case now and spend the declared mitigation budget;
- **Verify first** — zero mitigation spend today, a cheap evidence action and a dated review;
- **Wait** — keep the budget, replay the case at the declared delay, and price the carry cost.

You see the operational diffs, typed relationships, rule failures, warnings and economics side by side.
The economics are **declared, not inferred**: PERT three-point mean, carry cost, Savage minimax regret,
and a verification break-even threshold. Adoption rechecks revision and fingerprints, refuses any failed
branch, and writes the case + routed intake + immutable receipt in **one transaction**. Follow-up is a
generalized rule (`RULE-RSP-01..04`): typed `rehearses`/`responds-to` edges, one owned delegation or DACI
decision fallback, and orphan repair. `responseAutoPropagate` pauses follow-up only. CSV #63 and the
identity-free brief export aggregate telemetry only. Hosted builds use a module worker; the standalone
reuses its inline bundle as a Blob worker with a fail-closed timeout.

**Cross-module links added/updated:** `response` and `intake` typed-link nodes, `rehearses` /
`responds-to` relations, a published propagation contract, the `Responses` insights bucket
(`RSP-01..03`), Today banner, Intake handoff, Settings cadence toggle, nav badge and route aliases.

---

## 2026-11-01 — Your probability words are an instrument: certify them out of sample, then transport them (Session 102, Schema v72, [ADR-0064](./docs/adr/0064-confidence-transport.md), CSV #62)

Every terminal in this product asks the leader to write a number with a percent sign on it. A decision's *P(this works out well)*. An assumption's prior. A study's expected confidence. A recovery plan's adopted probability. A deferral's *P(committed by the deadline)*. A monitoring review's *P(any false alarm)*. A survival reading's *P(still open at the horizon)*. Those numbers drive rankings, expected values, deferral premiums and every downstream forecast — and until this session nothing in the product asked the only question that makes them mean anything: **when this leader writes 80%, does 80% happen?**

`#/confidence` is the **Confidence Transport Terminal**. It harvests every settled declaration the workspace already keeps across **seven ledgers** (assumption outcomes, decision reviews, scored impact studies, recovery-plan reviews, graded deferral timing calls, graded monitoring reviews and survival horizons), orients each so 1 means *the declared event happened*, and races three instruments against each other on the leader's own record:

- **identity** — the numbers exactly as written, the null hypothesis that translating them buys nothing;
- **Platt scaling** — a two-parameter logistic fit with a Gaussian prior toward identity, so a thin record cannot manufacture a dramatic correction;
- **binned isotonic regression** — pool-adjacent-violators with a Beta(1,1) pseudo-count in every occupied bin and monotonicity repaired after smoothing, the most flexible map that can be fitted without inventing an ordering.

**The race is prequential, not in-sample.** Every settled declaration is predicted by a map that was fitted only on settlements that arrived *before* it. The last 240 settlements are the test set, and nothing is scored on data its own model saw. Brier is the only score. The verdict is decided by a deterministic paired bootstrap on the per-settlement Brier difference, and it can refuse in three different ways: `insufficient` below 24 settled declarations or 16 out-of-sample points (with the counts printed and no map fitted at all), `no-gain` when nothing clears the material margin with the interval's lower bound above zero, `harmful` when every fitted map is materially worse than the numbers as written, and `supported` only when both conditions hold. Simplest instrument first: the sigmoid wins a tie.

**A transport is applied, never written back.** Every open declaration is printed exactly as written, with the certified reading beside it and the gap in points; 15 points flags a reading. Six live readings per module, ranked by disagreement. The declared number in the record is never rewritten — a product that silently edits your forecast to its own better number has destroyed the only thing that made the forecast gradeable. A **calibration certificate** freezes the map's parameters, the prequential scores at issue, the pace and an expected-resolution count as facts; grading uses only settlements that resolved strictly *inside* the window, a window that closes empty **lapses** rather than being credited, and skill is derived on read from the two frozen Brier scores — never stored, never scored from a single window.

**Four rules on the shared spine** (`RULE-CTR-01..04`), marker-idempotent, inside the caller's transaction, paused by `confidenceAutoPropagate` while an explicit scan always runs: certify when transport is supported and nothing is open — with typed `recalibrates-belief` edges to the three promises it reads furthest from; one owned re-read task per source module per ISO week (cap 5 declarations); grade/lapse/challenge, where a transported loss opens one blameless process task and at most one governed decision per week; and edge reconciliation to deleted certificates.

**No per-person calibration exists anywhere in this product, and this module does not add one.** The unit is the leader's probability vocabulary. The demo makes the whole workspace tell one story: its decision journal carries 58 dated calls whose declarations slope the right way and land far too optimistically, which is exactly what makes Forecast Integrity, Calibration and Confidence Transport agree instead of contradicting each other.

**Cross-module links added/updated:** new `certificate` node (`#/confidence?panel=certificates&certificate=`) and relation `recalibrates-belief` (system-generated, assertable by the engine only); typed edges from a certificate to the premises, decisions and delegations it reads furthest from; a published propagation contract for the rule; the `Confidence` insights bucket (`CFI-01..05`); CSV scope **#62** (aggregate rows only — bands, sources, maps and certificates; no declaration title, id, name or free text, and blanks rather than zeros below every floor); an identity-free brief; a nav badge and 14 route aliases.

**Verified:** 46/46 new confidence-transport tests, including the hand-computed Platt recovery (true slope 1.6, intercept −0.8 recovered within tolerance), the isotonic monotonicity repair, the prequential guarantee (no point scored by a model fitted on it), the three-way refusal (`insufficient` / `no-gain` / `harmful` / `supported`), the stale-then-lapsed certificate lifecycle, single-grading, marker idempotency across repeated scans, the pause-versus-scan distinction, the aggregate-only CSV, the typed node/relation/route, six rendered panels and an axe-clean pass.

## 2026-11-01 — The Authority Model: does autonomy predict on-time delivery? (Session 101, Schema v71 unchanged; [ADR-0063](./docs/adr/0063-authority-covariate-model-preview.md))

The Borrowed Evidence terminal now has an **Authority model** panel (`#/credibility?panel=covariate`). When the leader has enough outcomes across at least three authority levels, it fits a deterministic one-covariate **Beta-binomial logistic regression** over the authority contract's ordinal ladder (recommend → agree → act + inform → own). It reports the posterior autonomy slope, a 90% interval, `P(slope > 0)`, and class-level on-time predictions with intervals. It fits only when the panel is opened; the existing rate estimates and event rules are unchanged.

This is a research preview, not a causal claim: delegation classes are few, outcomes may be temporally dependent, and authority assignment is not random. It does not change forecasts, verdicts, or automation. The panel refuses on insufficient variation and states the model prior. It first requires the existing pool's minimum three observed classes and eight decisive outcomes (plus a non-degenerate pattern), then at least three distinct authority levels. No new data collection, dependency, schema migration, or person-level score.

## 2026-10-31 — How much of this number is yours? The Borrowed Evidence Engine (Session 100, Schema v71)

A new manager's workspace is made of small samples, and for ninety-nine sessions every terminal did the honest thing with them: it refused. *Too few verdicts. Below the floor. Insufficient.* Correct each time — and useless together, because in the first quarter almost every question was answered "ask again later". The market does the same thing more bluntly: survey platforms suppress any group under three to five people, so a fifteen-person company gets one company-wide number. Open **`#/credibility`** (nav: *Borrowed evidence*) and every small sample is now priced with the evidence it shares with its neighbours.

**What it computes.** Each evidence group is a Beta-binomial hierarchy: signal families (the Signal Integrity Board's *actionable precision*, against the Board's own floor), assumption criticality classes (how often settled premises held) and delegation authority classes (delivered by the due date — returned and overdue work count as not delivered, work not yet due is censored rather than guessed). The hyperparameters are integrated over by **full Bayes on a deterministic grid** under the BDA3 hyperprior — not plugged in, because plug-in empirical Bayes understates its own uncertainty — so every unit gets a borrowed estimate with a 90% interval, its **own weight** Z = n/(n+M) (Bühlmann credibility, exact for this model), the exact posterior probability it sits below its floor, the **date its own record takes over** at the current pace, and the number of outcomes that would **flip its verdict**. A *what-if* re-weights the hyperposterior exactly to show what three more false alarms would do.

**What it acts on.** `RULE-CRE-01` runs on the shared post-commit spine the moment evidence arrives. Register an assumption at 90% in a class that has held 2 of 8 times and, in the same transaction, the **outside view** opens one governed decision (re-price / defend the inside view in writing / buy information / refuse borrowing) with a typed `outside-view` edge to the premise — later premises that week attach to the same decision. A delegation authority class that is decisively late opens one leader-owned **checkpoint task** linked to every delegation falling due in 21 days, each with its borrowed probability of landing on time. A signal family that the pool says is below the precision floor — while its own record is still too thin for the Board — opens one re-tune task. `RULE-CRE-02` asks once whether a heterogeneous pool is really one kind of thing, and obeys your written ruling for 90 days. Nothing is ever a person: units are families and classes, and every task is the leader's.

**Borrowing is graded, not trusted.** Every borrowed claim the rules act on is **frozen** with both forecasters — the borrowed estimate and the unit's own (Jeffreys) estimate — and `RULE-CRE-03` scores both by Brier on the same outcomes when the window closes. If borrowing loses to own data over six graded frames, the engine says so and opens the decision to stop. The demo seeds frames frozen from the state as it stood 30 days ago and graded from what actually followed: borrowing won one of three, and skill is withheld until three more are graded.

**Cross-module links added/updated:** new `credibilityframe` node (`#/credibility?panel=ledger&frame=`), relations `borrows-evidence` (frame → premise/alert), `outside-view` (decision → premise) and `governs-pooling` (frame → decision/delegation); `tracks-followup` edges from checkpoint tasks to delegations; the Signal Integrity Board's inventory now shows each thin family's borrowed precision and what a never-judged family inherits; a new **Credibility** Insights bucket (CRE-01..05) and nav badge; CSV scope **#61**. Additive `70 → 71`. See [ADR-0062](./docs/adr/0062-borrowed-evidence-engine.md). Real-browser and assistive-technology walkthrough remains **[UNVERIFIED]**, as does whether criticality and authority classes are the exchangeability classes leaders actually believe in. A borrowed number is model-based decision support, not a measurement.

## 2026-10-31 — Who grades the grader? The Signal Integrity Board (Session 99, Schema v70)

LeadOS evaluates roughly 300 rule predicates and one statistical scan every time a screen renders. That is a multiple-testing procedure, and until this session the product kept no record of what it cost or how often it was right. Every earlier session added tests; this one audits the *procedure that runs them*. Open **`#/integrity`** (nav: *Signal integrity*) and the Board reports **two numbers that have to disagree**: what the declared plan claims about family-wise error, and what your own one-tap verdicts say actually happened.

**The budget is charged, not asserted.** Lan–DeMets alpha spending, both published shapes — O'Brien–Fleming-like `α*(t) = 2 − 2Φ(z_{α/2}/√t)` and Pocock-like `α*(t) = α·ln(1 + (e−1)t)` — normalised so `α*(1) = α`, look *k* of *K* receiving the increment. Look 13 of a 12-look plan spends nothing and grants nothing; the budget does not renew itself. Multiplicity uses the **effective test count** `1 + (m−1)(1−ρ)` with ρ **declared** and a printed 0/30/60% sensitivity table — never estimated from co-firing, because a leadership record cannot identify the dependence between its own detectors, and inventing it would be the exact failure the Board exists to prevent.

**The detectors are graded by your verdicts.** On every insight card there is now a **Judge this signal** button: confirmed, explained, dismissed or false alarm. Those four split into detection truth (*explained* and *dismissed* were real changes) and actionable truth (only *confirmed* and *false alarm* enter actionable precision). Each family gets a Wilson 95% interval, and the status is deliberately asymmetric: **over-claiming** only when the *upper* bound falls below your floor, **calibrated** only when the *lower* bound clears it, **indeterminate** in between, **insufficient** below the verdict floor — where the count is printed and no score is given. Alerts-per-useful-alert (`nnfAlert`) turns "these alerts are noisy" into a number with an interval.

**One family carries a p-value. Fifty-four do not, and the product says so.** A predicate over your records has no null distribution, so applying Bonferroni to it would produce the *appearance* of rigour and none of the content. Only the early-warning scan is corrected; the rest are audited by measured precision. That claim is asserted in the suite so it cannot quietly become false.

**Forecasts freeze and are graded once.** A review stores the budget state on a date plus exactly one prospective claim — P(any false alarm among the next *n* surfaced signals) — and is graded after the window from *surfaced* verdicts dated inside it (a suppressed candidate was never shown, so it is never scored). Brier, with skill withheld below three grades; challenge notes **append**, nothing is rewritten.

**Cross-module links added/updated:** `integrityreview → decision` (*governs-monitoring-plan*) and `integrityreview → delegation` (*calibrates-rule*) through the case graph; a new `integrityreview` entity type deep-linking to `#/integrity?panel=ledger&review=`; the Board's own signals join the Insights roll-up in a new **Signal integrity** domain (42 of 42 buckets filled); verdicts are keyed by a de-identified digest so **no person is scored**, and calibration tasks open on the *leader*, never on the colleague whose record tripped a rule. **RULE-INT-01..04** run on the post-commit spine, marker-idempotent per ISO week, and never change the monitoring plan on your behalf — the governor opens one governed decision with four priced options instead.

**Try it in the demo:** load Demo data and open `#/integrity`. The demo carries 27 verdicts across 5 families, 7 recorded looks (69% of the budget spent), one **graded** review whose prediction provably predates its grade, one live unresolved claim, and a family measured below its floor. Judge a couple of findings from `#/insights` and watch the family's status move. CSV scope **#60** exports aggregate-only rows with a blank cell — never a zero — below the floor. Additive `69 → 70`. See [ADR-0061](./docs/adr/0061-signal-integrity-board.md). Real-browser and assistive-technology walkthrough of the five panels remains **[UNVERIFIED]**, as does whether 10% / 12 looks / Pocock survives contact with real use. This is a monitoring-cost model on your own records, not a claim about your team.

## 2026-10-31 — What fails together? The book of open calls (Session 98, Schema v69)

The per-call terminal prices one option at a time; a leader holds a **book** of them. Under independent exercise the expected total is the sum of the per-call premiums under *any* correlation — so every expected-value surface is structurally blind to what makes a book different from a list: what correlation moves is the **joint tail**, the **concentration** of that tail, and how often coupled calls **lapse together**. Open **`#/deferral?panel=portfolio`** (nav: *Deferral options → Portfolio*) and the terminal reads the whole book per currency.

**Correlation is discovered, ρ is declared.** The premise graph already knows which calls fail together — two decisions resting on the same load-bearing premise are coupled (`premise.decisionId` plus `rests-on`/`tests` links, open decisions only). A sharing pair with **no declared ρ refuses the joint tail and names the pair**; the graph identifies the coupling, you own the number. Non-sharing pairs take ρ = 0 by printed convention; ρ outside [−0.99, 0.99] is dropped, never clamped; and a mutually inconsistent set of declarations is refused outright — the module will not silently project it onto the nearest valid matrix.

**What you can act on.** Per-currency VaR/CVaR at your tail convention, with **Tasche component contributions** that partition the tail exactly — a call that is a small share of the premium but a large share of the tail is the concentration finding; HHI on premium and on contribution; the diversification credit (subadditivity: pooling softens the tail; a small negative measured credit is simulation noise, and the panel says which is which); and the **premise stress** — for each premise coupling members, the joint lapse probability under your declared ρ beside the same under independence, and the excess in percentage points. That excess is the number that says "these calls fail together X pp more often than unrelated calls would."

**The forecast discipline is unchanged.** A frozen reading stores ids, aggregates and **one** probability — P(any member commits before the window closes) — and nothing else: no titles, questions, persons or notes. One freeze per currency per day; graded exactly once, after the window, from recorded `decidedOn` dates; Brier against the frozen claim; skill withheld below five grades. A premise that moves **appends** a challenge note to every reading resting on it and never rewrites a figure. `RULE-DPO-01..04` propagate on the shared spine: every member call and stressed premise is linked to the reading; a scan reconciles edges, opens grading work and turns an expired window into one governed decision per week; a graded surprise opens one blameless process task; a premise breach opens one re-price decision per premise per week.

**Honest limits, printed on screen.** The quoted expected total is **always the exact lattice sum** — the Monte Carlo runs on a daily grid, is printed only as its grid error with the cause named (checkpoint overshoot; the commit *rate* still matches the lattice), and never stands in for the exact number. Signals read frozen records, not live renders. The demo seeds a coupled book (two top-priced calls `tests`-linked to the load-bearing premise, one declared ρ = 0.45) and no pre-frozen forecast. CSV scope **#59** exports per-currency aggregates only, blank below five readings. Additive `68 → 69`. See [ADR-0060](./docs/adr/0060-deferral-portfolio.md). Full browser/assistive-technology walkthrough remains **[UNVERIFIED]**. This is a decision-analysis model on a real-world measure, not a market price and not investment advice.

## 2026-10-31 — What is the flexibility to wait worth? (Session 97, Schema v68)

Every delay surface in LeadOS prices **what waiting costs** — Decision Tempo's carrying rate, the Cost of Waiting queue, the Consequence Lab's integrated cost, Information Value's EVSI. None of them priced **what the right to wait is worth**, so the product could only ever nag. Open **`#/deferral`** (nav: *Deferral options*) and the new terminal prices one open decision's option to wait as an **American call**, solved by Cox–Ross–Rubinstein backward induction at every node, and refuses when the record cannot support the answer.

**What it computes.** The stake `V` is the decision's typed value at stake. The commitment cost `K` is the money budget lines already point at that decision; a **reversible** call sinks nothing, so `K = 0` and the terminal tells you to decide now, while an irreversible call with no committed line falls back to the full stake and prints that convention. Waiting costs the workspace's own 12-week erosion price as a **cash outflow, never as drift**, because putting the delay price into both would double-count the Cost of Waiting arithmetic. Volatility is **measured, not typed**: 1.4826 × MAD of log(realised ÷ assessed) across your settled case exposures and delivered effort ratios, root-time annualised from the median horizon it prints. Below the observation floor the frame refuses; below the σ floor it withholds; a σ you declare yourself is accepted only when labelled `declared`.

**What you can act on.** The exercise boundary — *commit when the stake reaches X* — with the hysteresis that only exists because the call is irreversible and the value is uncertain; the flexibility premium; the probability the optimal policy commits before the window closes; the expected wait and the carry paid to get there; and two solved break-evens: the **carry price at which waiting stops paying** and the **σ below which it never appears**. Verdicts are decisions, not scores: *Decide now*, *Waiting pays*, *Indifferent* (a premium under your materiality floor is not advice to postpone), *Act or drop*, or *Withheld* with the missing input named.

**What it refuses.** It never adds the premium to EVSI or to the Cost of Waiting's integrated carrying cost — they measure different things — and it never runs on a risk-neutral measure, because a leadership decision has no replicating portfolio. No default σ, `K` or carry: each would make the screen work on every workspace and print a number nobody supplied. No `act-or-drop`/`commit-now` frame opens a watch task; the two verdicts that say "decide" do not also say "wait".

**The forecast.** Freezing a frame stores a bounded, identity-free record — stake, cost, carry, σ and its source, the lattice output and exactly one claim: `P(commit by deadline)`. It is graded once, after the window, from the decision's **recorded** `decidedOn`; a choice recorded without a date is ungradable, a graded frame cannot be deleted, and Brier skill waits for five grades. `RULE-DRO-01..03` write on the shared spine in the same transaction: a typed `defers-decision` link plus one owned boundary watch; a scan that reconciles edges, opens due grading work and turns a window that expired with the call still open into exactly one governed decision per ISO week; and a blameless process task when a grade misses by Brier ≥ 0.25. `deferralAutoPropagate = false` pauses freeze-driven writes, never an explicit scan.

**Try it in the demo:** load Demo data, open `#/deferral`, and use the what-if row to declare a carry of 0 on the irreversible negotiation call — the premium rises from USD 742 to USD 2,085 and the verdict flips from *Indifferent* to *Waiting pays*. The what-if is a URL, not a write; nothing is stored until you freeze. Signals land in Insights (*Deferral options*) and on the nav badge; CSV scope **#58** exports aggregates only, with means and money blank below five frames. Additive `67 → 68` — empty frame and marker ledgers, no back-filled prediction. See [ADR-0059](./docs/adr/0059-deferral-option-terminal.md). Full browser/assistive-technology walkthrough remains **[UNVERIFIED]**. This is a decision-analysis model on a real-world measure, not a market price and not investment advice.

## 2026-10-31 — Case-mix guard for delivery forecasts

Open **Delivery survival → Classes → Operational cases**. The new overlap read compares the current case types in the same two mature day-30 cohorts used by the existing drift check. It prints cohort counts and total-variation distance; a difference of at least 25 percentage points or a recent type absent in the earlier cohort requests review. This is a descriptive convention, not a statistical test or causal diagnosis. Current types can have changed since intake; normalized older records may default missing types to `risk`, so the check cannot prove historical overlap.

When the mix triggers, **Cost of waiting** marks affected case rows low-confidence without changing prices or probabilities. An explicit survival scan opens a linked review decision and, if an active owner can be resolved, a task; it challenges relevant frozen survival readings and can link a re-freeze task to the latest exposure certificate. No messages are sent. SURV-12 surfaces the warning and the survival brief includes it. Evidence is refused if either cohort has fewer than eight records or a harvested type is unknown. This first slice covers case type only, not severity or other work classes.

The survival harvester also no longer counts a future-dated exit as already observed. An unassessed transport axis can no longer produce an overall supported headline; an untestable exit cause is not described as a stable mix. **[UNVERIFIED]** full repository and legacy tree, real-browser/assistive-technology walkthrough, usefulness in the field. Existing case normalization can replace an invalid/missing closed date with today, so the harvest fix cannot recover dates already repaired by normalization.

## 2026-10-31 — Transport, decomposed: which numbers may still be read? (Session 95)

The decomposition below now runs at **three landmarks (14 / 30 / 60 days)** and is read as **two transport axes** on the **Delivery survival → Classes** panel. A shift that exists only by day 14 is intake volatility; one that survives to day 60 is structural; the shape across landmarks is named (early-only, sustained, crossing…). **Timing** (time to any exit) carries still-open probabilities and waiting-cost exposures; **completion** (the day-30 exit-mix verdict) carries completion probabilities and the "50% complete by" quantile. When only the completion axis fails, timing outputs stand and the failing numbers say so — on **Cost of waiting**, row confidence is no longer flattened by any drift, and the **Consequence Lab** flags descriptive futures and stamps both axes into every frozen reading. A **Scan** additionally challenges your frozen evidence: survival readings on a challenged class gain a note (their probabilities are never rewritten), and exposure certificates gain one owned re-freeze task — only when *timing* fails, because that is the arithmetic they freeze. Nothing is recalibrated: this is a stability audit of your reference class, not causal transport. See [ADR-0058](./docs/adr/0058-transport-decomposed.md).

## 2026-10-31 — Drift decomposition: which exit moved? (Session 94)

The transport check below pools every exit. The **exit-mix decomposition** on the same **Delivery survival → Classes** panel splits it: by day 30, did the recent cohort *finish* less, *give up* more — or both at once, at unchanged speed, so every cycle-time view stays green while completions are quietly replaced by abandonments? The split is exact (completed + abandoned + still open = 100% in each cohort), each cause is landmark-tested with Holm correction across six classes × two causes, sparse causes are refused rather than estimated, and a **Scan** opens the week's drift decision framed by the component that moved — an intake review with recent abandonments linked as exhibits, or a completion review about blockers. See [ADR-0057](./docs/adr/0057-drift-decomposition-competing-risks.md).

## 2026-10-31 — Forecast transport guardrail

Open **Delivery survival → Classes** (`#/survival?panel=classes`) to check whether historical delivery behaviour still describes recent work. Fixed start cohorts (30–89 versus 90–149 days ago) receive equal 30-day follow-up; Mantel–Cox log-rank tests use Holm correction across all six classes. Requires 8 items per cohort and 6 observed exits. Restricted mean time to **any exit** supplies the direction; abandonment is not success.

A detected shift lowers **Cost of waiting** confidence to low without changing declared prices or probabilities. **Scan** creates one review decision per class/week, links up to 20 affected open records, and creates a five-day evidence-check delegation if the leader resolves to an active person. No owner is invented. All changes use the existing atomic post-commit/persistence spine and append audit events. No dependency or schema change.

Limits: observational diagnostic; assumes independent items/censoring and comparable case mix. Fixed windows can miss other shifts. Holm controls this scan's six comparisons, not repeated looks over time. No detected shift is not proof of stability. Generated decisions freeze the diagnostic as text, not a reconstructable statistical snapshot.

Verification: 108 targeted tests passed (calendar drift, survival and cost of waiting), including real API propagation and reload. Full legacy/repository audit remains **[UNVERIFIED]**.

## 2026-10-31 — The Consequence Lab: what happens while a decision waits? (Session 93, Schema v67)

**Open `#/consequences`** in the app, or on an open Decision card select **Trace consequences**. No new intake form: the Lab reads the decision, its already-recorded money and typed graph connections, and the class's dated completion/abandonment history. Five panels take a first-time leader through an auditable decision-futures exercise:

1. **Executive read.** The default is the highest-ranked *priced* open decision whose +2-week survival curve actually meets the evidence floors. Its weekly price, still-open probability and **integrated expected carrying cost** are shown beside the number of first- and second-order operational records it touches. Select another decision to see it, even if its probability must be withheld.
2. **Ripple map.** Trace up to two recorded typed links from the source to cases, budgets, premises, dependencies, goals, other open calls and stakeholder records. Each path says *which* link connects two actual records; each destination deep-links to the source. People, candidates, confidential conflicts and anonymous pulse answers never relay. A graph path is **an association, not a causal effect**. A missing link is reported; a capped map is visibly incomplete.
3. **Delay futures.** Compare +1, +2 and +4 weeks. The module integrates the conditional Kaplan–Meier survival curve over each period: `E[outstanding weeks] = (1/7)∫ S(age+t)/S(age) dt`, then multiplies by the weekly price **already derived** from typed decision value (linear Reinertsen cost of delay) or the price the leader declared. This is more honest than the `#/wait` screen's `price × weeks × P(still open at end)`, which is a **lower bound** on expected carrying cost because it ignores time spent waiting by decisions that close before the endpoint. The Lab prints that lower bound, the integrated expected cost, and the full-wait ceiling together. With too few dated exits, too few items at risk or a horizon beyond the observed record, the expected cost is **withheld**, not set to zero. An unpriced call is **unpriced, not free**. Currencies never mix.
4. **Frozen & graded.** Freeze a supported +1/+2/+4-week probability *before the outcome*, then review once after the exact horizon: the decision's recorded `decidedOn` settles whether it was still open. Brier loss is printed for the frozen probability; base-rate skill waits for five graded readings. A missing decision date is a refusal, and a graded record cannot be rewritten or deleted. A failed browser save is explicitly warned as **in-memory only** with an export-backup path, never toasted as saved. A sealed reading stores only IDs and bounded aggregate numbers — no title, person, stakeholder stance or note.
5. **Method & refusals.** Every assumption, floor, named method and rejected interpretation is on screen. Conditional ceilings for linked priced work mean **“if every related item also waits the full period”**; they are not an expected domino loss, are never added to root cost and may describe overlapping money. They are not a recommendation to decide now.

**One action, many modules:** freezing a reading writes its typed `maps-consequence` / `surfaces-impact` links, an owned signpost-verification task if a linked premise is at watch/breach, and at most one DACI coordination decision per root/week when another open decision is connected and the root has material recorded delay price — all **in the same post-commit transaction**. An explicit scan reconciles stale edges and opens due grading work; a material forecast miss opens one blameless learning task when automation is enabled. Nothing is sent, no option selected, no person scored. Consequence signals land in Insights/Today and on the nav badge. An identity-free, board-ready text brief can be downloaded or copied. CSV export scope **#57** groups by horizon × currency and blanks means/money below five records; no individual reading appears.

**Try it in the demo:** load Demo data, visit `#/consequences` (the default selected decision has a supported curve), compare +2 weeks with the `#/wait` endpoint-only lower bound, select a linked decision from the chooser to follow its recorded path to a source case or budget, then **Freeze** a supported horizon. In your own workspace, first register a decision and link its operational context (the Decision card has a one-click entrance). There is no application backend, new dependency, external model or network call. This is an evidence-bounded decision aid, **not an AI that predicts the causal effect of your choice**.

See [RESEARCH.md §93](RESEARCH.md) for the named RMST, causal-evidence and competitive sources, [ADR-0056](docs/adr/0056-decision-consequence-lab.md) for the design and refusals, [ROADMAP.md](ROADMAP.md) for the next higher-leverage bets, and [AI-SESSION-LOG.md](AI-SESSION-LOG.md) for verified test/sync results. **[UNVERIFIED]:** real-browser screen-reader/contrast walkthrough, field validation with managers, class exchangeability and price accuracy; legacy `src/**` is non-canonical.

## 2026-10-31 — Evidence Terminal: what do several studies of the same lever say together? (Session 92; Schema v66)

Sessions 84–91 built the workspace's *single-study* machinery: the Impact Ledger pre-registers a hypothesis and scores it with interrupted-time-series regression, the Assumption Ledger scores priors, the Performance terminal freezes and scores a support-plan probability, and the Information Value terminal prices a declared experiment. Each answers a question about **one** study. `#/evidence` answers the one after it: **several studies of the same lever on the same metric have now closed — what do they say together, is the disagreement real, and is one more study worth running?**

Two families, pooled with the same core:

- **Effect family.** Every scored, locked impact study contributes its ITS level shift as a percentage of the pre-period mean — dimensionless, so different metrics can be pooled — **oriented so positive always means better**, with the un-oriented shift kept beside it. A fall in feedback latency is an improvement, not a backfire.
- **Resolution family.** Every *declared* probability that has since resolved — a study's expected confidence, a premise prior, a frozen support-plan probability — pooled on the log-odds scale with the Haldane–Anscombe correction, Wilson intervals, Brier **skill** against the base rate, and calibration-in-the-large (observed vs expected events, two-sided z).

Pooling is **DerSimonian–Laird random effects** with τ², Cochran's Q and I², and **both** intervals are computed so the **wider** of the z and **Hartung–Knapp** interval is reported — a small-study correction may only widen what the terminal claims. Five guards keep the number honest:

- **Pooling floor.** Fewer than three pre-registered studies ⇒ counts only, no estimate, reason printed. Exploratory studies are counted and shown, **never pooled** — that would reward declaring a hypothesis after the answer arrived.
- **Heterogeneity floor.** τ² and I² are withheld below four studies: three cannot separate real between-study variance from noise. Above it, I² ≥ 75 with p_Q < 0.1 returns **"Depends where you use it"**, not an average.
- **Direction.** A cell is only "works here"/"backfires here" when the reported interval excludes zero on the useful/harmful side *for that metric's declared direction*.
- **Independence.** Random-effects pooling assumes independent estimates. Two ITS studies of the *same* team metric whose **windows overlap** share observations, so the pooled SE is optimistic. The terminal counts the overlapping pairs and prints them beside the estimate instead of assuming the problem away. No meta-analysis tool surveyed (RevMan, CMA, JASP, `metafor`, MetricGate, the free calculators) flags this.
- **Influence.** Leave-one-out names any study whose deletion moves the pooled answer by more than the median within-study SE, or flips whether the interval crosses zero.

Egger's test refuses below ten studies: below that a funnel plot is a shape, not a signal. Ranking is the **lower credible bound plus the priced value of what one more trial would teach**, with both limits asserted by test — an uninformative trial is worth exactly zero and a perfect one is worth EVPI. When no within-study noise was declared, the value of a trial is `null` **with a reason**, never `0`, which would read as "worthless" when it is merely unpriced.

Freezing a review stores **aggregates only** — no title, hypothesis, note or identifier — so it cannot become a second unredacted copy behind the export boundary, and a later edit to a study cannot rewrite what it said. Grading reports **coverage beside mean absolute error**, because an interval wide enough covers almost anything and coverage alone would reward predicting nothing useful.

Five marker-idempotent rules (`RULE-EBM-01..05`) run on the shared post-commit spine before `decisionTempoRule`, pauseable via `evidenceAutoPropagate` while an explicit scan always runs: one DACI decision per pooled cell **ever** when the interval stays on the harmful side of zero, with `grounds-practice` edges back to the evidence (`RULE-EBM-01`); one replication task when a supported result stands alone — counted on independent *roots*, so three studies of which two are replications is still one finding (`RULE-EBM-02`); one pre-registration task where information value exceeds expected effect (`RULE-EBM-03`); typed `recommends-for` edges from the newest frozen review to open cases plus one owned delegation, because an edge needs a durable source and a page view is not one (`RULE-EBM-04`); stale-edge reconciliation and grading work (`RULE-EBM-05`).

EBM-01..08 signals, an `Evidence` insights bucket, nav badge, CSV scope #56 (opaque intervention/outcome/source codes; no titles, hypotheses, notes, names or free text; blank below every floor, never zero), and a demo that scores seven extra studies through the **real** estimator and freezes one review through the **real** builder, so the terminal never opens on a dead end.

Writing the suite found six real defects, all fixed rather than waived: the pooling core was fed units carrying `effect` where it reads `estimate`, so **every** cell silently refused to pool and the terminal was inert; `actions.js` declared `gradeEvidenceReview` locally, shadowing the imported engine function so the action **recursed into itself** and grading could never succeed; `unreplicated` required `replications === 0`, excluding precisely the case it exists to surface; metric direction was harvested but never applied, so a fall in a down-is-good metric was reported as a backfire; `#/impact` rendered nine identically-named `<section>` landmarks (an axe `landmark-unique` violation); `#/evidence` and `#/parity` had no document title.

See [RESEARCH.md §92](RESEARCH.md), [ADR-0055](docs/adr/0055-evidence-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: every meta-analysis tool surveyed is built for a researcher who already has a spreadsheet of study estimates — none harvests from the system where the work happened, none writes the finding back into the decisions and cases it should change, none refuses below declared floors, and none flags overlapping study windows. Search-limited comparison; **no claim of category-first status** in meta-analysis and no vendor outcome claim used as evidence. The design leans on published evidence rather than novelty: Korevaar et al. (2023, *Research Synthesis Methods*) find random-effects meta-analysis of ITS level-change estimates holds nominal coverage regardless of estimation method or study count, and the 2024 empirical comparison in *BMC Medical Research Methodology* finds the choice of random-effects estimator barely moves the answer — which is why DerSimonian–Laird is chosen for transparency, not for accuracy it does not have.

## 2026-10-31 — Leadership Parity & Standard Consistency: audit the leader's own distribution and bar (Session 91; Schema v65)

Session 88 audited the leader's due process *within* one performance concern; Session 90 priced the open queue. Neither answered the uncomfortable cross-cutting question Session 88 explicitly left open: **is this leader distributing coaching, stretch scope, promise reliability, and evaluative thresholds consistently across peers — or running one bar for an inner circle and another for everyone else?** Commercial HR and performance platforms (Lattice, Culture Amp, 15Five, Leapsome, Visier) tackle bias post-hoc through multi-manager HR calibration panels, survey sentiment, or demographic cuts, leaving a single manager's day-to-day operational allocation unmeasured before review season.

`#/parity` audits **only the leader's recorded behaviour** across active direct reports from dated workspace artifacts (1:1s, SBI feedback, GROW/stretch delegations, recognition, succession bench nominations, formal performance concerns, and completed reviews) — storing **zero protected characteristics**, computing **zero employee scores or rankings**, and taking **zero adverse actions**:

- **LMX Variety vs. Disparity (Theil $T = T_{\text{between}} + T_{\text{within}}$, finite-sample Gini, zero-safe Atkinson $A_{0.5}$):** Decomposes four leader-investment channels (coaching time, SBI feedback, stretch authority, sponsorship) across `level × rampBand` cohorts (Graen & Uhl-Bien 1995; Buengeler, Piccolo & Locklear 2021; Theil 1967; Atkinson 1970). New joiners inside `parityRampDays` (default 90d) are explicitly protected so elevated onboarding support counts as structural *LMX Variety* ($T_{\text{between}}$) and never triggers a fringe or disparity alert ($T_{\text{within}}$). Post-ramp teammates with skipped/overdue 1:1s, zero SBI feedback, and zero stretch/recognition while peers receive multi-channel capital surface in the **Structural Invisibility Fringe**.
- **Psychological-Contract Promise Ledger (Rousseau 1989; PSYCONES 2025; Wilson 1927):** Audits only `leader` and `shared` 1:1 commitments (`carryHistory` carry chains, overdue counts, and 95% Wilson score intervals so a `1/1` record is never misread as 100% reliability) and flags cross-teammate fulfillment spread above `parityPromiseGapWarn` (default 35pp).
- **Intra-Leader Standard Consistency & Noise Audit (Leventhal 1980; Kahneman, Sibony & Sunstein 2021; Nordmo 2026; Kendall 1938 $\tau_b$):** Compares evidentiary bars across adopted Performance Recovery plans (observation counts, override asymmetry, voice timing), checks succession nominations against the 5-signal behavioural rubric (halo nominations vs. overlooked 4/5+ bench), and computes tie-adjusted Kendall $\tau_b$ concordance plus $>65\%$ final-quarter recency flags across completed reviews.
- **Counterfactual 14-Day Rebalancing Planner & Falsifiable Parity Audits (Brier 1950):** Allocates `parityWeeklyBudgetHours` greedily across leader-owned actions (overdue promises, fringe 1:1/SBI restoration, overlooked-bench career conversations, standard re-anchoring) and projects counterfactual $T_{\text{within}}$ and overdue-promise reductions. Freezing a Parity Audit snapshots baseline metrics and an ex-ante improvement probability (5–95%), scored irreversibly once after `reviewOn` with Brier's quadratic rule (mean Brier withheld below five graded audits).

Five marker-idempotent rules (`RULE-PAR-01..05`) run on the shared post-commit spine before `decisionTempoRule`: domain-scoped standard-consistency DACI decisions with typed `audits-consistency` edges (`RULE-PAR-01`), blameless 1:1 prompts and leader-owned tasks (never assigned to the neglected report) with `rebalances-attention` edges (`RULE-PAR-02`), promise-repair tasks/decisions with `repairs-contract` edges (`RULE-PAR-03`), overlooked-bench sponsorship prompts (`RULE-PAR-04`), and stale-audit grading work (`RULE-PAR-05`). `parityAutoPropagate=false` pauses automatic triggers while explicit `scanParity` always runs. Signals `PAR-01..06` surface in the `Leadership parity` insights bucket; Today (`#parity-triage`) and Person views surface due audits and overdue leader commitments; CSV scope #55 exports opaque cohort and channel aggregates only (zero names, person IDs, conflict prose, or pulse comments).

Session 91 also uncovered and repaired **five pre-existing cross-module defects** from earlier sessions: (1) string severities on `warGameSignals` breaking numeric sorting plus missing `'War games'` in `DOMAIN_ORDER`; (2) `warGameRules` failing to persist `draft.warGameMarkers` and omitting required decision/delegation fields; (3) `warGameRules` passing 2 arguments instead of 3 to `ensureEntityLink`, causing `postCommit` savepoints to roll back war-game propagations silently; (4) `app/views/warGame.js` calling `ui/components.js` with incompatible positional signatures; and (5) `performanceSignals` emitting legacy `?tab=` / `panel=conversation` deep links instead of `#/performance?panel=evidence|diagnosis|plan|concerns`.

See [RESEARCH.md §91](RESEARCH.md), [ADR-0054](docs/adr/0054-leadership-parity-consistency-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: Lattice, Culture Amp, 15Five, Leapsome, Visier, and inFeedo Amber focus on multi-manager review calibration, pulse/sentiment surveys, or demographic equity cuts; search-limited comparison, and **no claim of category-first status**. The distinction is structural and testable: intra-leader allocation entropy, leader-owed promise intervals, and cross-artifact evidentiary concordance are computed locally from dated operational records before review season, with zero demographic collection and zero employee scoring. Explicitly not legal advice.

**Verified:** 15/15 new parity tests across 6 suites plus new War-Game and Performance regression tests. Full canonical suite **1,640/1,640 pass** (0 failures), `eslint` clean, canonical boundary **232 app ES modules / 92 test suites / 0 leaks**, internal docs links **322 across 161 markdown files**, standalone build **4,752,191 bytes at schema v65** (231 inlined modules) with **7/7** portability tests green.

## 2026-10-31 — Cost of Waiting: the queue with a price tag on the wait (Session 90; Schema v64)

Session 89 could say *which open items have already outlasted their class and what the chance is they are still open in N weeks*. None of that was in money. `#/wait` puts the price on the wait: the leader declares **one weekly price per class of work** (cases, funded work, hiring, change programmes, delegations, decisions — cap 24, fail-closed), and every open item is multiplied by the censoring-aware probability from the leader's own closed records: P(still open after waiting w more weeks) = S(age+w)/S(age). A decision with linked committed money is priced automatically — value at stake ÷ the 12-week erosion window (linear Reinertsen cost-of-delay, CD3) — and an item with no declared price is shown as **unpriced, never zero**.

The Queue ranks priced-overdue items first — overdue meaning past the class's own completion median — and prints per row the price (declared / derived / unpriced), days overdue, the still-open probability with the at-risk count it was conditioned on, and the legacy wait-horizon scenarios (1/2/4/8 weeks: probability and **endpoint lower bound**, `price × weeks × probability`; Schema v67 corrects the time-integrated expectation in the Consequence Lab). Totals are **per currency and never pooled**, with the top item's share of overdue exposure. Below the at-risk floor the scenario cell prints the refusal; past the longest observation it is flagged as extrapolated. Weekly **exposure certificates** freeze the priced queue, totals and scenarios with a review date, and are navigable from every priced item through typed `prices-delay` edges.

Five marker-idempotent rules on the shared spine make it structural: a scan or a price change reconciles stale edges, freezes the weekly certificate, links the priced-overdue queue to it (≤ 40, price in the edge), opens **exactly one triage DACI decision per currency per week** above the declared threshold, one owned delegation per top priced-overdue item (≤ 5, due +3 days, recorded owner only), and one declare-a-price task per unpriced overdue class (≤ 3, due +7 days). The rule opens the decision; the leader makes it. Signals WAIT-01..06 land in the new `Cost of waiting` insights bucket; CSV scope #54 exports aggregate per class × currency under opaque codes with scenario figures blanked below the evidence floor.

Schema v64 is additive (`waitPrices`, `waitExposures`, `waitCostMarkers`, clamped `wait*` conventions). On the shipped demo: 30 open items, 20 priced, 3 priced-overdue; **USD 40,538.89/week** of waiting exposure, **13,861.11** of it overdue; waiting +1/+2/+4/+8 more weeks is expected to add **19,141 / 27,032 / 26,420 / 41,758** more USD. Empty collections are the correct upgrade state — no price or certificate is invented for an existing workspace.

See [RESEARCH.md §90](RESEARCH.md), [ADR-0053](docs/adr/0053-cost-of-waiting-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: CoD/CD3 tooling (Reinertsen; WSJF; Productboard/Aha!/Airfocus) prices product-backlog items from a leader-declared per-feature cost of delay; people-analytics and AI-coaching vendors do not price the operational queue from the workspace's own records. Search-limited comparison, and **no claim of category-first status**. The distinction is narrow and testable: the price is declared once per class, the still-open probability is censoring-aware and estimated from the leader's own records across six modules, currencies are never pooled, and the page refuses a number its data cannot support.

**Verified:** 43/43 new tests, including the hand-computed Kaplan–Meier fixture (S(10)=0.5, S(15)=1/3, P(+2 weeks at age 13)=2/3), per-currency totals, all five rules with idempotency, the one-write cascade (certificate + links + triage decision in a single `store.update`), the aggregate-only CSV, the typed node/relation/route, rendered panels and an axe-core pass. Full canonical suite **1,623/1,623 pass**, lint clean, boundary 227 modules / 91 suites, standalone build **4,658,027 bytes at schema v64** (226 modules) with its 7 portability tests green.

## 2026-10-30 — Delivery Survival: the queue that tells you what waiting costs (Session 89; Schema v63)

Every queue in every tool, including this one, answers *what is open*. None of them answers the question a manager actually asks on a Monday: **which of these has already taken longer than work like this normally takes here, and if I wait two more weeks, what is the chance each one is still sitting there?** Two statistical reasons explain why nobody ships the answer, and neither is a styling decision. Open items are **censored** — drop them, as every "average cycle time" tile does, and you have measured only the work that went well. And work is **abandoned** as well as finished — count an abandoned item as "still running", and every team eventually completes everything.

`#/survival` handles both. It harvests every dated record the workspace already keeps across six modules — funded portfolio work, operational cases, hiring requisitions, org-change programmes, delegations and decisions — with no new data entry to get a first reading, and it estimates the curve properly: Kaplan–Meier product-limit survival with Greenwood variance and a log–log band, keeping open items in the risk set; the **Aalen–Johansen cumulative incidence** of completion, so abandonment is a competing exit rather than a silent censoring. The page prints both figures side by side, because the gap between them is exactly the work the organisation starts and does not finish. On top of that: Nelson–Aalen hazard in elapsed-time buckets, a Mantel–Cox log-rank comparison of any two classes, conditional completion over the next N days given the item is still open, and an **age percentile** — the share of past exits that took less time than this item already has — which is labelled a percentile and never a probability, because a percentile of past exits has no horizon in it.

The refusals are on the screen, in the place the number would have been: below the at-risk floor the page prints the refusal and the at-risk count instead of a probability; a median that was never reached says *not reached* instead of printing the maximum; a tail past the longest observation is flagged as extrapolated; a reading with fewer than five settled items withholds its skill score. A frozen reading is a falsifiable commitment — per-item probabilities, the at-risk counts they were conditioned on, the curve digest, a review date — scored once, afterwards, with Brier's quadratic rule **against the class's own base rate**. A graded reading cannot be deleted; a prediction cannot be frozen after the fact.

Five marker-idempotent rules on the shared spine make it structural: a frozen reading writes typed `endangers` edges to the items it does not expect to finish and one owned task per such item (max 5, addressed only to the record's real owner); a graded reading that lost to its base rate opens one repair task; a scan opens exactly one DACI decision per class per week when abandonment reaches the declared share of exits — one decision about a class of work, never one per item; one task per returned delegation with no recorded reason; one grading task per stale reading. `survAutoPropagate=false` pauses automation; an explicit scan always runs.

Schema v63 is additive (`survivalReadings`, `survivalMarkers`, eight clamped `surv*` conventions). Every statistic is recomputed on read, so no stored number can drift from the records that produced it — and an empty reading list is the correct upgrade state, because back-filling a prediction would be a prediction made after the answer was known.

See [RESEARCH.md §89](RESEARCH.md), [ADR-0052](docs/adr/0052-delivery-survival-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: project trackers show cycle-time averages and burndowns, portfolio-analytics vendors sell delivery metrics with percentile bands, PMO suites sell earned value. Search-limited comparison, and **no claim of category-first status** in delivery analytics. The distinction is narrow and testable: the curve is estimated from the leader's own records across six modules with censoring and competing risks handled explicitly, both the naive and the corrected completion figure are printed with the reason they differ, and the page refuses a probability the data cannot support. A vendor dashboard printing the corrected number would have to tell its customers that a quarter of their work is abandoned; the naive number is better for the vendor.

**Verified:** 57/57 new tests, including the hand-computed Kaplan–Meier and cumulative-incidence fixture, the log-rank tail, the at-risk refusal, the median-not-reached case, the effort-bias pair rule, the reading lifecycle refusals, all five rules with idempotency, the pause-versus-scan distinction, the insights bucket, the aggregate-only CSV, the typed node/relation/route, five rendered panels and an axe-core pass. Full canonical suite **1,580/1,580 pass**, boundary 222 modules / 90 suites, docs links 313 across 159 files, standalone build **4,590,498 bytes at schema v63** with its 7 portability tests green.

## 2026-10-30 — Performance Recovery: audit the leader's process, price the wait (Session 88; Schema v62)

Every other terminal grades something the leader produced. This one is for the moment the thing in question is a **person who is not delivering** — the moment where the market's tools are a rating grid, a PIP template whose conclusion already exists, or sentiment analytics scraped from messages. All three are refused here. What ships instead is the only artefact that actually helps: the leader's own record of what was expected, what was seen, whether the person was heard, whether anything was changed to help, and what the gap costs while nobody decides.

`#/performance` holds a concern as a dated record: the declared expectation with its source and the date it was said, the observed gap and its impact, observations scored for **answerability** against the feedback module's SBI scale (three thin observations are one moment dressed as a pattern, and the page says so), conversations, support actions, and the seven **Mager & Pipe** analysis questions that separate "could not" (a skill remedy) from "could and didn't" (a system remedy). Six **Leventhal/Colquitt** procedural-justice rules — notice, accuracy, consistency, voice, bias suppression, support — plus a named diagnosis gate a formal plan. While any gate stands the app refuses to adopt one unless the leader writes an override of at least 40 characters, which is stored verbatim and displayed beside the plan for the life of the record. It is not a checkbox, and it cannot be edited away.

Adoption freezes the objectives, a review date and a 5–95% probability; review is single-scoring, cannot be backdated before adoption or dated in the future, and a not-met verdict opens **exactly one** decision about the next *process* step with no exit option. Waiting is priced from recorded pay (Reinertsen cost of delay, replacement-cost convention) or reported as unknown — never zero. Five rules on the shared spine make it structural: a missing expectation opens one owned task and one blameless 1:1 prompt; meeting the evidence floor without a two-way conversation opens the conversation; adopting a plan opens one DACI decision on the support mechanism plus typed `concern→person` and `decision→concern` edges and a dated check-in; a not-met review opens one next-step decision; an explicit scan sweeps a passed review into one task. All marker-idempotent, all suppressible by `perfAutoPropagate=false` — but never an explicit scan.

The honesty envelope is tighter here than anywhere else in the product, and it is enforced in code rather than in copy: **no** performance rating, potential score, nine-box, ranking, sentiment or language analysis, and **no adverse action** — the app cannot terminate, demote, dock pay or change a role. The brief omits names by construction, CSV scope #52 exports one row per concern under opaque codes (`PC01`, `P01`) with no labels, notes or override text, and every screen that could be mistaken for a legal opinion says *"This is not legal advice."*

v62 also fixed a real v61 defect: the Coupled Load terminal had reused the continuity module's `couplingAutoPropagate` key, so pausing one paused both. `coupledLoadAutoPropagate` is now its own key and inherits the old value once, so no workspace's setting flips on upgrade.

See [RESEARCH.md §88](RESEARCH.md), [ADR-0051](docs/adr/0051-performance-recovery-due-process.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: HR performance suites (Lattice, 15Five, Culture Amp) sell review workflows, ratings and engagement analytics; PIP-template marketplaces automate a document with the conclusion pre-written; people-analytics vendors infer sentiment and flight risk. Search-limited comparison, and **no claim of category-first status**. The bet is narrow and testable: grade the leader's process and the leader's own probability, refuse to proceed while a fairness fact is missing, and make the adverse action structurally unavailable.

**Verified:** 43/43 new tests, including the 40-character override gate, single-scoring and backdating refusals, marker idempotency across repeated edits, the pause-versus-scan distinction, Brier scoring with the five-plan floor, the insights bucket, the codes-only CSV, five rendered panels and axe-clean markup. Full canonical suite **1,523/1,523 pass**, boundary 217 modules / 89 suites, docs links 307 across 158 files, standalone build 4,511,380 bytes at schema v62.

## 2026-10-30 — The Signal Path: what never reached you (Session 85; Schema v59)

Every other terminal in this workspace grades a decision you made. None of them grades the **channel the decision's inputs travelled through**. A disciplined decision engine fed by a three-level reporting line scores the choice as if the facts arrived intact, when three relays forwarding at 78% each deliver a material fact 47% of the time — and nothing in the workspace ever counts the misses, so the channel is described as working.

`#/signal` prices a declared escalation channel as a series of relays. Reach is `1 − (1 − Π t_hop)(1 − q_direct)`; false alarms compound in the opposite direction, so depth costs twice; latency is arrival-conditional rather than a naive sum; expected loss is `θ × exposure × (1 − reach × (1 − min(1, lag/horizon)))` — a channel absorbs part of a loss, never abolishes it. Information is Shannon mutual information in bits, sensitivity is d′ with a log-linear correction, and depth is derived from your roster: a management cycle is detected and refused rather than given a plausible-looking number.

The declaration is **falsifiable**, which is the whole point. Committing freezes the reading at four decimal places and refuses to let the exposure be rewritten; probes then ask a question you already know the answer to — *this fact existed on Monday, how did you come to know it?* — and the ledger grades the frozen prediction with counts, a Wilson interval, d′ and a Brier score. Below six settled probes the page prints counts and explicitly withholds a verdict. Nothing here infers anything about a person: the probe records delivery, not sentiment, and the copy says so.

Five interventions are priced, and each is re-scored by the *same* evaluator, so no recommendation can contradict the baseline it came from and no lever may lower reach or raise the wait. The hurdle is your own price of an hour, taken from the Attention Market where that terminal has a measured price; a lever below the hurdle is still shown, priced and labelled as not clearing. Four rules on the shared spine make it structural: typed `reaches` edges along the chain, exactly one redesign decision plus one owned probe task when the ledger contradicts you, a link from any case that lands on a blind path, and owned dated work for an adopted lever.

See [RESEARCH.md §85](RESEARCH.md), [ADR-0050](docs/adr/0050-signal-path-cascade-latency.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: escalation and on-call routing (PagerDuty, OpsGenie, Xurrent) is mature for *systems*, and the mum effect, upward distortion and organizational silence are decades-old findings in the management literature (Rosen & Tesser 1970; Athanassiades 1973; Milliken, Morrison & Hewlin 2003). This is not a claim of category-first status, and no vendor's outcome claim is used as evidence. The bet is narrow: price the channel from the roster, learn the per-hop declaration from a probe ledger instead of from surveillance, and grade the declaration rather than the people.

**Verified:** 28/28 new tests; real `addSignalClass → commitSignalClass → addSignalProbe → settleSignalProbe → adoptSignalLever → addCase` flow with rules co-firing, marker idempotency, and a case linked only when its path is genuinely blind; demo seeded through the real contract; axe-gated terminal. Full canonical suite and standalone verification below in the session log.

## 2026-10-30 — Autopilot Studio: standing instructions the workspace follows — but only after you rehearse them (Session 84; Schema v58)

Every previous LeadOS automation was developer-authored. Now a leader can declare their own **operating agreements**: when this event happens and these recorded facts match, create this accountable work. The vocabulary is deliberately closed — 4 sources (cases, decisions, delegations, goals), 14 events, 5 actions (open a DACI decision, assign owned work, prepare a blameless 1:1, register a testable assumption, ensure stakeholder briefs) — so there is nothing to misread and nowhere for a guessed owner or a sent message to hide.

Nothing runs until it is **rehearsed**: the same executor previews the agreement against your current records on a disposable copy, showing every match, every record it would create, every owner it would load, every blocked action and a threshold sensitivity. Activation binds your approval to a digest of the definition, the workspace revision and that preview — change anything afterwards and the approval is void. Execution is all-or-nothing inside the triggering transaction with typed `automates` provenance, durable idempotency keys and a bounded budget; a missing owner or a full 1:1 queue blocks the whole run, records the refusal and pauses the agreement instead of half-applying it.

Two deliberate orderings make this honest rather than merely functional. The rule evaluates **first** on the post-commit spine, against the record as your action left it — built-in propagation flips a fresh case to mitigating mid-transaction, so any later position would make "created while open" unmatchable. And markers are **desired-state** (one record per agreement, version, source and action): identical re-fires skip silently, changed facts open a new run that reuses the existing response instead of duplicating it.

What it can never do is the actual specification: no message sent, no decision option selected, no rating, no pay/hiring/termination effect, no agreement triggering another agreement. See [RESEARCH.md §84](RESEARCH.md), [ADR-0049](docs/adr/0049-governed-operating-agreements.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: Aera's October 2026 release describes Policy Studio (approve drafted rules, test against live decisions, then enforce) with a per-decision policy ledger, and Cloverpop/WorkBoard/Lattice all ship governed or conversational automation with vendor-claimed outcomes. This is not a claim of category-first status. The bet is the local-first binding for one leader with no model to trust: a readable vocabulary, a rehearsal from their own records, approval bound to that preview, five bounded writes. Sources, confidence labels and limits are in the research note.

**Verified:** 27/27 new tests; real declare → rehearse → activate → `addCase` fan-out (decision + task + prompt + joined assumption + drafts, 10 typed edges) with built-in rules co-firing and RULE-DEC-01 correctly declining; idempotent re-fires; both refusal paths with pause + AP-01; cascade guard; batch-ceiling rollback with receipt; axe-gated terminal. Full canonical suite and standalone verification below in the session log.

## 2026-10-30 — Shared-barrier risk is now visible across cases (Session 83; Schema v57 unchanged)

Operational risk is rarely independent. LeadOS now compares the **systemic barrier** a leader has already recorded on active cases and groups exact matches (case/Unicode/whitespace-normalized). On case create, edit, resolution, reopening or deletion, `RULE-ATT-05` reconciles typed `shares-barrier` case links. The graph edge contains no copied RCA text; changing the barrier removes stale links.

The Attention Market's Market panel now shows a **common-mode sensitivity** beside the ordinary additive plan: the sum of case exposures versus the scenario where they fully overlap (the largest individual exposure). Different currencies stay separate; unpriced cases stay unknown. This is deliberately an exposure sensitivity, **not** a correlation estimate, confidence interval, causal claim or optimizer input. A new signal routes the leader back to the cases. The optimization still makes the original additive assumption; pricing a correlated loss requires better evidence than matching prose.

The implementation also removes a mutable module-global clock from the Attention Market harvesters, so explicit `now` values are passed through each read and do not leak between calls. No schema migration or runtime dependency was needed. See [RESEARCH.md §83](RESEARCH.md), [ADR-0048](docs/adr/0048-shared-barrier-exposure-sensitivity.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: risk aggregators already describe portfolio/common-cause analysis (NIST IR 8286C; Resolver's publicly summarized incident-to-RCA workflow), while AI-coaching vendors such as Coachello and Skillsoft CAISY offer conversation simulation. This is not a claim of category-first status. The bet is narrower: connect a leader's existing 5-Whys barrier entries to a privacy-minimized typed graph and expose the non-additivity question in the same hour-allocation market. Sources, confidence labels and limits are in the research note.

**Verified:** focused suite 31/31; real `addCase` → link → market scenarios → resolve/reopen → manual-link refusal → stale-edge removal; currency and missing-value handling; JSDOM render. `npm run verify:canonical` passes 1,376/1,376 tests, lint, boundary and docs links; `npm run verify:standalone` passes 7/7.

## 2026-10-30 — Price the week, not the list: the Attention Market (Schema v57)

Every screen in this workspace owns a queue and each one reports its own attention count. None of them answered the question a manager actually opens the product to ask: **I have eleven hours this week — which eleven hours should they be, and what does the twelfth cost me?** A merged, severity-sorted list cannot answer it, because it cannot say that two rows are the same item in different modes, it cannot say that handing work off moves it into somebody else's week, and it prices nothing. The consequence is the one every manager lives with: the obligations that carry a number win, and the ones that do not quietly stop being scheduled — with no decision on record, because nobody made one.

`#/attention` answers it. Every obligation the workspace can price becomes one group of mutually exclusive choices — **do it yourself**, **hand it off**, or **let it carry** — and the week is solved as a multiple-choice knapsack under **two** ceilings: your declared hours, and a delegate pool that stops the plan from handing everything to the most reliable person and calling it a strategy.

- **Nothing is invented.** Exposure comes from the record that already exists: a case's three-point cost estimate, a funded item's effort and value, a negotiation's stakes over your own BATNA, a dependency's measured daily impact and time-to-recover, an overspent budget, a priced decision frame. An obligation with no money is listed as `unpriced` with the hours it consumes, because work that cannot enter an optimisation is a fact the leader needs, not a row to delete.
- **The price of your next hour is measured.** The same market is re-solved with one more hour and the change is the price. A zero means the budget is not binding — which is an answer, and one most leaders never get.
- **Optimal when it can be, honest when it cannot.** Small markets close exactly by branch and bound and say "optimal" with a zero gap. Larger ones fall back to Dyer's relaxation with a Lagrangian dual minimised by golden-section search, and print the distance to a bound they can prove. No printed number claims more than it has.
- **The forgone set gets a price and an owner.** `RULE-ATT-03` writes **one** decision covering everything the plan refused, with the expected value it gives up, so "I was too busy" stops being free.
- **A plan is held to its own number.** Committing freezes the budget, the bought set, the forgone set and every success probability. The review re-reads each bought record, excludes items that have not moved (a plan is not wrong for being young), and scores the frozen probabilities with a Brier term over settled items only.

**What the build found:** the first convex-hull pruner removed the *cheap* dominated option instead of the expensive one, which silently deleted every delegation from the market; `effortDays` was being priced as the *leader's* hours, allocating 423 hours of "attention" against a 12-hour budget; and delegation, offered automatically on an uninformative prior, handed all ten obligations to one person because a hand-off looked strictly better than doing the work. All three are fixed and the first is now a regression test. Effort-days are team effort, so the module applies a **declared leader share** (default 10%), prints it beside every derived figure, and lets you override any row.

**Competitive benchmark (vendor documentation and peer-reviewed literature, not independent validation):** the algorithms are decades old — [Dyer (1984)](https://link.springer.com/article/10.1007/BF01580667) for the multiple-choice knapsack relaxation, [Fisher (1981)](https://pubsonline.informs.org/doi/10.1287/mnsc.27.1.1) for Lagrangian bounds. Enterprise connected-planning platforms (Anaplan, Pigment, o9) solve capacity allocation at company scale with a modelling team and a pipeline; calendar optimisers (Reclaim, Clockwise) allocate time *blocks* rather than priced *obligations*; Cloverpop logs decisions without allocating a manager's hours [UNVERIFIED — public product descriptions only]. LeadOS's narrower claim is the binding: objectives derived from the leader's own dated records, constraints on their own week and their team's own measured reliability, a frozen prediction, and a forgone list written into the decision register with its cost. That is a feature-shape comparison, not a claim of category-first status. See [ADR-0047](docs/adr/0047-attention-market-constrained-allocation.md), [`RESEARCH.md` §82](RESEARCH.md) and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

## 2026-10-30 — Plan the tests, not just the next one: the Sequential Investigation Planner (Schema v56, unchanged)

The Information Value Terminal priced one test at a time. A leader with three open tests saw three independent net values and no answer to the question that actually matters: **what do I run first, what do I do after each result, and when do I stop?** The new **Sequence** tab (`#/voi?panel=sequence`) answers it. It solves the declared test menu exactly by backward induction over up to three stages, conditions the belief by Bayes' rule after each settled test, and draws the decision tree as a nested list with the recommended path.

Every number is inspectable. The Sequence tab shows the stop value, the best single test, the full-sequence value, the second-stage gain, the expected number of tests run, each test's raw net value alone (negative when a test does not pay for itself, matching the register), and the assumptions the plan rests on: binary tests, conditional independence given the true state, and a finite menu. It refuses explicitly for unpriced frames, probabilities that do not sum to 100, settled evidence that cannot all be true, and excludes coin-flip and untargeted tests from the menu. Its limits are capped and printed rather than hidden: at most six tests (any excess is counted), and at most three stages.

Three marker-idempotent rules on the shared post-commit spine act on the plan:

- **`RULE-SEQ-01`** writes one advisory note giving the conditional plan when a second stage adds at least the materiality threshold.
- **`RULE-SEQ-02`** opens one commit decision, with each frame option priced under the current belief, when the plan says to decide now. A later stop revises that open decision in place; a decided one is never edited.
- **`RULE-SEQ-03`** creates one owned task on the frame owner for the next planned test, dated to that test and linked back to the frame. With no owner, it records a note and invents no assignee.

A worked example in the test suite (Vendor status read at 60/70, free; Load test at 70/70, USD 20 fee and wait) gives a plan of 550 against 520 for deciding now, a second-stage gain of 24, and a 1.39 expected number of tests. The planner's numbers were then checked by hand against the Bayes update and the backward induction; they agree.

**Consistency with the existing engine is tested, not assumed.** Across 60 deterministic random frames, each test's one-stage net equals the existing `evaluateInquiry` net within rounding. A perfect test is worth exactly the EVPI on top of the stop value (700 = 520 + 180), and a duplicate test adds nothing.

**Competitive benchmark (vendor documentation, not independent validation):** SpiceLogic's Decision Tree Analyzer computes EVPI from a hand-built tree and highlights the recommended policy after each result ([SpiceLogic docs](https://spicelogic.com/docs/decisiontreeanalyzer)). SmartOrg's Supertree "automatically re-orders tree nodes to calculate values of information and of control" ([SmartOrg](https://smartorg.com/supertree-sensitivity/)), so automatic sequencing is not new in that category. TreeAge Pro is listed at a one-time $450 price on a third-party directory [UNVERIFIED — the price was not checked against the vendor]. Cloverpop's public descriptions cover capturing decisions, rationale and outcomes; we found no description of a test-sequencing calculation [UNVERIFIED]. A [third-party scoring page](https://www.rfp.wiki/artificial-intelligence/decision-intelligence-platforms/cloverpop) rates its simulation and scenario testing at 3.2/5 [UNVERIFIED]. LeadOS's distinct combination is narrower than "sequential decision analysis": the exact plan is kept inside the decision register, its tasks and notes are written by the same event spine, and it is re-read on every settlement. We did not find evidence that the competitors above tie a plan to owned tasks and a decision log, but that is a search limit, not a proof of absence. See [ADR-0046](docs/adr/0046-sequential-investigation-planner.md), [`RESEARCH.md` §81](RESEARCH.md) and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

## 2026-10-30 — Calibration now changes the decision sensitivity (Schema v56)

LeadOS now carries a leader's own scored probability history into the **money and option sensitivity of an open decision**. The Calibration panel compares declared EVPI with a shrinkage-weighted scenario and a marginal Wilson-corner range, then reports whether the expected-value option changes across those tested scenarios. It refuses to calculate when any target probability band has fewer than three historical observations or the payoff table is incomplete.

When a new VOI frame has enough evidence, `RULE-LCAL-04` appends one explicitly non-prescriptive stress note and up to three typed `calibrates` links to the prior settled forecast frames that contributed the evidence. A later settlement also backfills eligible already-open frames (bounded to 20 per sweep, with a remainder event). The declaration and any frozen snapshot are never rewritten. This is a descriptive stress—not a posterior, forecast, or simultaneous confidence interval—and samples are not corrected for within-frame clustering. See [ADR-0045](docs/adr/0045-calibration-to-decision-sensitivity.md), [`RESEARCH.md` §80](RESEARCH.md), and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

**Competitive benchmark:** People-platform AI coaching (Culture Amp) and MCP/in-flow leadership assistants (Teamspective) make contextual action guidance a current product direction; forecasting platforms such as Metaculus return proper-score feedback. LeadOS joins the leader's score history to a specific business frame's EVPI with inspectable typed evidence. This is a public-feature synthesis, not a verified first-to-market or effectiveness claim.

Verification and release status for this change are recorded in the session log.

## 2026-10-30 — Decision evidence integrity

Information Value investigations can update an assumption only if the leader explicitly confirms that **one selected state is equivalent to that assumption**; composite targets and unconfirmed tests remain decision evidence, not belief updates. The association is frozen when the test is declared and checked again on settlement. Negative diagnostic evidence now uses the reciprocal likelihood ratio expected by the assumption ledger. Portfolio stress amounts are separated by currency; no exchange rates are invented. The concentration scan repairs missing typed follow-up links without duplicating tasks or decisions.

**Existing workspaces:** earlier releases could write investigation observations without this confirmation, underweight negative results, or produce concentration decisions that combined currencies incorrectly. Review existing investigation-sourced observations in the assumption ledger and old generated concentration decisions before relying on them; history is not silently rewritten. Scanning Information Value repairs missing concentration links when the premise is currently the top qualifying concentration. Back up your workspace first. This local app does not validate declared test accuracy or prove that the leader's equivalence is true.

## Information value — what is worth finding out before you commit (2026-10-30, Schema v54)

Seventy-six sessions of this workspace price almost everything a leader decides *after* the decision: a delay, a commitment, an intervention, a structure, pay, an exit. The sentence that decides whether any of those are worth opening had no surface at all: **how much is it worth to find this out before I commit?**

Without a number, two failures dominate real management. *"Let's get more data"* is a socially acceptable way of not deciding, with an unpriced delay attached. *"Let's just decide"* is a way of not thinking, with an unpriced risk attached. Consulting runs on the gap between those two sentences; no software prices it.

Schema v54 adds the Information Value Terminal (`#/voi`), which takes a declared decision frame — two to six states of the world with probabilities summing to exactly 100%, two to five options including doing nothing, and what each option pays in each state — and computes what information about that frame is worth.

- **EVPI is exact, not simulated.** `EVPI = Σ p(s)·max(o,s) − max(o) Σ p(s)·o(s)`, enumerated over the declared state space (Raiffa & Schlaifer 1961; Howard 1966). It is an upper bound *given the leader's declarations*, and the page says so beside every figure. No Monte Carlo, no seed, no approximation to argue about.
- **A missing payoff is null, never zero.** One blank cell makes that option unpriced and makes EVPI `null`, with the count of missing cells printed. A zero would silently become the most persuasive number on the page — the unknown option would look free.
- **Probabilities that do not sum to 100 are refused, not rescaled.** Rescaling typos produces a confident answer from numbers nobody declared, and nothing downstream can tell.
- **A test is worth what it changes.** With the declared sensitivity and specificity, Bayes' rule gives the exact posterior and `EVSI = E_signal[max_o E[u | signal]] − max_o E[u]`. Net value subtracts the declared cost; a test that costs more than it can be worth is reported as such, including the case where **no achievable accuracy pays for it**. The break-even sensitivity is found by bisection, which is valid because EVSI is monotone in accuracy (Blackwell 1951/1953). A test whose sensitivity and specificity sum to 100% is a coin flip and is refused at entry.
- **Expected value is not the only defensible rule.** Minimax regret (Savage 1951) sits beside it, and the page says plainly when the robust choice differs. Deciding against the arithmetic is allowed and requires a written reason — not a nudge towards the arithmetic, but a demand that a legitimate judgement be recorded as one rather than absorbed as an accident.
- **A settled test is evidence in the belief ledger.** `RULE-VOI-03` converts the arrived signal into the standard diagnostic likelihood ratio — `LR+ = se/(1−sp)`, `LR− = (1−se)/sp` — and appends **one dated observation** to the premise the frame's target states rest on, in the same transaction as the money result. The decision frame and the Assumption Ledger are the same uncertainty seen from two sides; a perfect test's infinite likelihood ratio is clamped, because the ledger refuses certainty.
- **Decisions that rest on one premise are one bet.** A Herfindahl index and a declared flip-stress (swap the two probabilities that carry the premise) show how many open frames change their preferred option if it is wrong, and what sticking with the old choice would cost. The flip is a declared stress, **not a probability that the premise is wrong**, and no covariance is estimated. `RULE-VOI-04` opens exactly one decision about de-risking the shared assumption — never one per frame.
- **A decided frame is held to its own number.** Deciding freezes EVPI, the per-option expected values and the declared distribution in the same write, and schedules one dated review that restates them. Recording the state that actually happened scores the frozen distribution (multi-class Brier 1950, log loss) and writes the **regret actually incurred**. Nothing is back-filled; nothing is rewritten.

`RULE-VOI-01..05` run on the shared post-commit spine and are marker-idempotent: typed `rests-on` provenance to every premise a frame's states reference plus an `informs` edge to the decision it belongs to; **exactly one** buy-information DACI decision (with the price of each branch printed) plus one owned task to scope the cheapest informative test when EVPI clears a declared money floor *or* a share of the declared stake — whichever is higher; one premise observation per settled test; one de-risking decision when a premise anchors too many open frames; and one dated outcome review per decision. `voiAutoPropagate: false` pauses the automatic side while an explicit scan still runs. The demo workspace carries two priced frames over its own assumption ledger, one live investigation and one settled one, so the page never opens on a dead end — the lesson Session 76 recorded after the structural terminal shipped against a roster with no reporting lines.

CSV scope #48 exports counts and ratios under opaque positional codes — **no label, no question, no premise title, no name, no currency amount, no individual payoff**. See [ADR-0042](docs/adr/0042-information-value-terminal.md) and [`tests/app/information-value.test.mjs`](tests/app/information-value.test.mjs).

## Workforce transition — the plan you can price, and the screen you must not quote (2026-10-29, Schema v52)

Every other module here answers a question about work. The largest people decision a first-time manager is ever in the room for — **who leaves, what it costs, and what leaves with them** — had no surface. The tools that exist are a compliance file (employee pools, protected-class adverse-impact analysis, WARN timelines, release packets, two-reviewer sign-off) or a workbook and a consultant's PDF. Both answer "can this survive a challenge". Neither answers "is this a decision".

Schema v52 adds the Workforce Transition Terminal (`#/transition`), with five tabs that read the same records the rest of the app already keeps — pay from the merit cycle, last completed rating, dependency stewardship, bench readiness, open cases, delegations and goals.

- **The cost is arithmetic with printed conventions.** Pay in lieu of notice at the declared notice days, severance at the declared months-per-year-of-service inside the declared cap. No tax, no holiday balance, no statutory guess, no FX. A person with no recorded pay is **unpriced** and `null` — never `0`, and never quietly dropped from a total that reads as complete.
- **Selection is a constrained optimizer that admits what it is.** Greedy by the declared objective, then swap repair against a cost ceiling, with blocked rows excluded (a sole steward of a critical dependency is **refused**, not warned about), locked rows forced, and the fractional-relaxation bound plus the gap to it printed. It never claims optimality.
- **Stability instead of confidence.** A seeded ensemble perturbs the declared weights, re-solves, and prints what share of draws each person survives. A name in every draw is robust to the weight table; a name in half of them is a judgement the model is hiding. It is not a probability that anyone should leave.
- **The screen is a screen.** Four-fifths over a declared organisational dimension or opaque group codes, with Wilson intervals on every rate, no comparison below the declared group floor, a printed count of candidates with no group code at all — and, because a ratio is an effect size with no significance test, **how many selections would have to move before the direction reverses**. On the test fixture: three of eight against one of eight, one transfer. The page says so instead of printing "adverse impact detected".
- **Compliance is priced.** When the screen fails, the module searches swaps between the over- and under-selecting groups and reports the cheapest set that clears the floor — swaps, cash delta, capability lost, headcount unchanged — or states that no swap set inside this plan can reach it, so the target or the criteria have to change.
- **Knowledge that walks out is an obligation, not a warning.** Continuity risk is read from recorded stewardship and open ownership; each materially at-risk leaver gets one owned hand-over task dated before the last working day; a sole holder blocks the selection outright.
- **The survivors are modelled, and the model is frozen before the change.** Recorded ownership is redistributed mechanically to the three lowest-loaded teammates; overload is reported; a four-term departure convention is frozen for retained high-value people as well as leavers, so the convention can produce a **false positive** and be scored for it. Brier skill is withheld below five resolved predictions.
- **Four paths, one comparison rule.** Declared-criteria selection, a voluntary offer priced as *adverse selection* (take-up concentrates among the most mobile — the people the criteria would have kept), internal redeployment (marked unavailable, not silently identical, when there is no receiving requisition), and doing nothing. Cash and capability are never converted into each other: the output is either one dominating option or the Pareto frontier with the trade between its ends.

`RULE-TRN-01..06` run on the existing post-commit spine and are marker-idempotent: typed `separates` provenance to every named person, **exactly one mechanism decision** about the criteria and the target when the screen fails (plus one owned scoring-grid evidence task) rather than a private swap of two names, one owned hand-over per at-risk leaver with typed edges to the dependencies at stake, at most three blameless survivor prompts, one dated outcome review plus one owned tracking task at finalization, and a resolved prediction when someone leaves. `transitionAutoPropagate: false` pauses the automatic side while an explicit scan still runs. Two gates refuse before any of that is spent: no **decide** without an accountable owner and a fully named target, no **finalize** without an owner and at least one priced exit.

Defects the new suite found and fixed: the CSV scope threw on `daysBetween is not defined` (never imported); `impactScreen` folded twelve undeclared candidates into an `unspecified` group and made the screen unreadable for the wrong reason; the outcome window used a literal 365 days while the review used the declared horizon; redeployment with no requisition silently reported the same headcount and cost as the involuntary plan; `decide` and `finalize` accepted a programme nobody owned. CSV scope #46 exports counts and ratios under positional programme codes — **no name, no identifier, no group code, no note, no per-person cost, no departure probability**.

This is a decision surface, not an HR system: it stores no protected characteristic, produces no legal document, runs no payroll, and its conventions exist to be printed and later contradicted by the calibration card. See [ADR-0040](docs/adr/0040-workforce-transition-terminal.md) and [`tests/app/workforce-transition.test.mjs`](tests/app/workforce-transition.test.mjs).

## Merit & pay equity — what the money buys, and what pattern it makes (2026-10-29, Schema v51)

Every other module in this workspace answers a question about work. The largest decision a first-time manager makes about **people** — how to spend a fixed merit budget across a team of unequal market position, unequal replaceability and unequal history — had no surface at all. The tools that exist produce a spreadsheet and a communication problem; pay-equity consulting produces a PDF that is out of date the day it prints.

Schema v51 adds the Merit & Pay-Equity Terminal (`#/merit`). It prices the decision three ways against the same budget, then grades its own prediction later:

- **Three policies, one budget.** Across-the-board at the budget's share of payroll; performance-weighted with an explicit fallback weight for anyone without a completed review; and **marginal retention value** — a raise-by-raise greedy optimiser over `replacement cost × reduction in modelled departure probability`, bounded by the band ceiling and the cycle's maximum increase. Each policy prints spend, budget use, minimum and maximum increase, band violations, the four-fifths ratio it would produce, expected departures, retained value and **regret against the best feasible policy**. Applying one recomputes it from the records; the view never writes a plan it was handed.
- **A decomposition with an honest interval.** Twofold Oaxaca–Blinder on log pay, controlling for level, tenure and the last completed rating (a missing review gets an explicit missingness term instead of being dropped). The interval on the adjusted gap is the standard error of a group indicator times a small-sample t. A percentile bootstrap was tried, measured and rejected: with eight people per group a resample can leave a level cell empty, so the interval measures composition noise rather than uncertainty about the gap.
- **A screen, not a verdict.** The four-fifths rule (EEOC Uniform Guidelines) is applied to the *decision*: a favourable outcome is an adjustment at or above the cohort median. Wilson intervals attached, `reliable: false` below the sample floor, and the page prints that a screen is not a legal conclusion.
- **No protected characteristic is stored.** The audit runs on a comparison the leader declares — hire origin (internal promotion versus external hire) or reporting line. Both are recorded, decision-relevant and not protected classes. Three caveats always print: an unexplained gap is not proof of discrimination, the controls are thin, and scope, negotiation history and market timing sit inside the residual.
- **The model grades itself.** The retention hazard is `logistic(z)` over four printed terms (band deficit, peer deficit, a recorded concern, nothing else) and no coefficient was fitted to the user's data. Finalizing freezes a per-person probability, `person.archived` resolves it, and the Brier skill score against the observed base rate is reported only at five or more outcomes — the demo honestly shows a base rate with no variance and a skill of `null`.

`RULE-COMP-01..05` run on the existing post-commit spine: typed `compensates` provenance from the cycle to every person it pays; **exactly one mechanism decision** when the audit is flagged (recalibrate the bands against the work, publish the grid and its evidence rules, commission a targeted review, or collect the missing variables — each with its cost) rather than an individual adjustment, because no individual adjustment repairs a distribution; one owned relative-pay task per cycle with typed `compares-pay-with` links; one dated outcome review; and a resolved prediction when someone leaves. Marker-idempotent, with `compAutoPropagate: false` pausing the automatic side while an explicit scan still runs.

Two defects the new suite found and fixed: `money(null)` coerced a blank salary to `0` through `Number(null)`, and the policy comparison read its own last-applied proposal as the baseline. Finalizing now refuses a cycle containing a blank decision, because a frozen audit cannot contain an empty row. CSV scope #45 exports ratios, counts and grades under opaque cycle codes — **no salary, no absolute pay, no name, no note, no cycle label**.

This is a decision surface, not a compensation system: it stores no protected class, runs no payroll, and its hazard coefficients are conventions that exist to be printed and later contradicted by the calibration card. See [ADR-0039](docs/adr/0039-merit-and-pay-equity-terminal.md) and [`tests/app/merit-equity.test.mjs`](tests/app/merit-equity.test.mjs).

## Implementation fidelity — was the thing actually delivered? (2026-10-29, Schema v50)

Every reviewed people-management suite measures whether **the tool** was used. Lattice's own analytics page describes its Adoption Dashboards as metrics on "engagement and utilization of Lattice". That is product adoption, not intervention fidelity, and the difference decides whether a contradicted study means "the idea failed" or "we never ran it".

Schema v50 adds the Implementation Fidelity Ledger (`#/fidelity`). A leader declares a plan *before* delivery — intervention type, intended population, planned units, and a window of at most 364 days — and the ledger then reads that plan two ways that are never merged:

- **Observed.** Four stages are derived from dated typed records the leader already keeps, each with an explicit standard: 1:1s that carry written notes, feedback notes that are complete Situation–Behaviour–Impact records, delegations that carry a dated check-in, goals with a key result that moved. Adaptation has **no instrument**, and the page says so rather than substituting a proxy.
- **Attested.** A dated human verdict per stage with an author and a note. A verdict that contradicts the records requires a written reason, and the disagreement is classified (optimistic, conservative, lenient, strict, mismatched) instead of being averaged away. Across plans it becomes a leader-level calibration statistic with a Wilson 95% interval, withheld below three verdicts.

Exposure is **multiplicative** — reach × dose × quality — because a practice delivered to everyone at 40% dose is not 70% delivered. Grading is refused (`insufficient`) when the evidence covers less than 60% of the model's weight, which is the reporting gap the 2025 fidelity reviews keep finding, surfaced as a state instead of a footnote.

`RULE-FID-01..05` run on the existing post-commit spine and are marker-idempotent: typed `measures-delivery` links to the measured record, a disagreement prompt, one repair decision plus one owned delegation when a settlement shows material under-delivery, one overdue-checkpoint task per plan, and a frozen `implementationSnapshot` when a linked Impact study is scored. That snapshot prints the ITT estimate, the Bloom/LATE per-complier estimate (ITT ÷ measured exposure) and the inflated minimum detectable effect together — so a study run at 50% exposure is described as underpowered by construction — and yields `null`, never `0`, when no counterfactual was fitted. `RULE-IMP-02` reads the same exposure: a contradicted but materially under-delivered study opens *repair delivery or stop on a weak test*, not a stop decision.

This is **delivery, not effectiveness**. It cannot see work outside LeadOS, practices with no typed records, or receipt by the people on the other side; it scores no person and reads no free text. The thresholds are printed conventions. Competitor absence, parity and comparative effectiveness remain **[UNVERIFIED]**. See [ADR-0038](docs/adr/0038-implementation-fidelity-ledger.md) and [`tests/app/implementation-fidelity.test.mjs`](tests/app/implementation-fidelity.test.mjs).

## Impact execution evidence — connect a declared intervention to its retained rule path (2026-10-29)

Schema v49 extends the existing Impact Ledger rather than building another workflow. When declaring a study, a leader can choose the exact existing case, decision, delegation, goal, feedback record or other supported typed source. Scoring freezes a bounded snapshot of successful LeadOS propagation transactions whose root or applied-step event names that exact source. A real case-created cascade can reach decisions, delegations, goals and coaching records through the shared event spine; the study connects back to the source case with an `evaluates` edge.

This is **implementation evidence, not an efficacy claim**. The ledger does not show work outside LeadOS or prove delivery, exposure, fidelity, adoption, quality or causality. A zero match can mean no automation was triggered, the work happened elsewhere, or the transaction aged out of the bounded 250-row lineage. Historical v48 studies are labeled `not-recorded`; no past snapshot is inferred. See [ADR-0037](docs/adr/0037-impact-execution-evidence.md) and [`tests/app/impact-execution.test.mjs`](tests/app/impact-execution.test.mjs).

- The snapshot is taken at scoring, counts exact typed root/step matches from the declared start date, and keeps at most 12 local trace-navigation IDs. It stores no copied titles, hypotheses, notes or event payloads.
- The Impact screen names the source record and shows the scoring-time counts with explicit uncertainty language. Redacted exports remove navigation IDs for lineage rows they omit; demo cleanup clears deleted source pointers while preserving frozen counts.
- Impact CSV scope #32 adds status and bounded aggregate counts only—no source IDs, trace IDs, labels, titles, hypotheses or free text.
- Research compared this slice with vendor-announced Lattice Workforce Intelligence / AI Leverage Insights and 15Five Agents. These are different products and evidence units; current availability and feature parity remain **[UNVERIFIED]**. No uniqueness or competitor-absence claim is made.

Frameworks informing the design: implementation fidelity versus outcome evaluation (Carroll et al.); pre-registration and interrupted-time-series guardrails already in the Impact Ledger; atomicity/idempotency patterns from reliability engineering (not a claim of a distributed outbox); missingness under a bounded observation window; and data minimization.

## Cross-module provenance — follow what the automation actually changed (2026-10-29)

A typed link should land on the record it names, and a successful automation cascade should leave a receipt without creating a second copy of sensitive content. LeadOS now does both on the existing local event spine. See [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md), [`tests/app/typed-links-lineage.test.mjs`](tests/app/typed-links-lineage.test.mjs) and [`tests/app/typed-link-navigation.test.mjs`](tests/app/typed-link-navigation.test.mjs).

- **Exact navigation:** the shared typed-link resolver builds encoded routes; destination views focus the selected record instead of dropping the leader at a module home. Selection is navigation only. Retired scorecards remain reachable for provenance.
- **A real cross-module example:** committing a distorted scorecard can create a redesign decision, owned delegations and a coaching prompt, connected back to the frozen scorecard with typed `informs` links. The automation—not a hand-written narrative—produces the lineage.
- **Schema v48 success lineage:** `#/propagation?tab=lineage` records the source event, applied rule steps, changed collection/type/ID references, new typed edges and emitted event types. It stores no titles, summaries, notes, score inputs or record bodies. It is capped at 250 transactions, 32 steps, and 48 target, edge and event references per transaction; omissions are disclosed.
- **No fabricated past:** upgrading a v47 workspace starts with an empty lineage. No success is inferred from old audit messages. Failures continue to use the separate propagation-receipt path; the lineage is not a replay log or a claim of causal effectiveness.
- **Lifecycle and export:** conflicts and anonymous pulse records are excluded; clearing demo data scrubs deleted-record references; candidate-linked transactions are omitted from redacted exports. CSV scope #43 exposes counts and types only, while a full JSON backup preserves the bounded ledger. Record IDs remain workspace data and are not claimed to be anonymous.

The feature extends the native browser app and existing generalized rule engine; it adds no runtime dependency or network service.

## Scorecard integrity — what the numbers will make people do (2026-10-29)

Every goals tool reports progress on the metric you chose. LeadOS now models the metric itself.
Declare a scorecard — the tasks it counts, what each is really worth, how easy each number is to
move without moving the work, how noisy it is, and how much pay or promotion rests on it — and the
lab computes the effort equilibrium an honest agent will land in: genuine work, cosmetic movement,
and the uncounted job that quietly stops happening.

The output is a figure a leader can act on: **34.3% of first-best value** on the demo card, with
**75.7%** of measured effort modelled as cosmetic, and the search offering a redesign worth
**+23.4 net value points**. In hours, ≈21h/week buys behaviour the scorecard does not reward and
≈11.2h/week is recoverable. Committing freezes the prediction; recording what actually happened
scores the model and prints the miss. Nothing is inferred from messages, calendars or telemetry,
and no person is ever scored. See [ADR-0035](docs/adr/0035-scorecard-integrity-lab.md) and
`tests/app/measurement.test.mjs`.

## Case mitigation evidence gate (2026-10-29)

The case graph now shows how many distinct linked mitigation delegations are complete or missing. **Monitoring is a cue to verify residual risk, not proof of safety.** Completion of a delegation moves an open/mitigating case to Monitoring only when every `mitigates` delegation in either graph direction is present and marked done. Returned or missing work blocks the transition. Duplicated edges count once. Well-formed links from an existing case to a missing mitigation survive normalization and reload (unlike other invalid links), with a warning. After checking the missing work, use **Review & remove** on the case to remove that link; the audit records the link and the case rule re-evaluates remaining work. No delegation is deleted. Removing the last link never implies completion. Existing Monitoring cases are not automatically rolled back, and manually resolving a case remains a human action.

This is deterministic local logic, not an AI prediction or proof that the work is effective. No network or new runtime dependency. See `tests/app/case-mitigation-gate.test.mjs`.


## Case cascade integrity (2026-10-29)

Case details flag operational links whose targets cannot be resolved. The case rule preview and sync treat missing decision and mitigation targets as missing, so eligible rules can create replacement linked work; broken edges remain for investigation. The case audit shows typed case events and propagation events for explicitly linked peers, rather than guessing relevance from titles. It excludes conflict and pulse events. This is an integrity safeguard, not an assertion that all modules self-repair.

# LeadOS — a leadership workspace that keeps its own receipts

LeadOS helps a first-time manager turn real conversations, feedback, goals and commitments
into evidence-linked next steps. Its team-health indicator is an explainable heuristic over
those records, not an objective leadership grade or a substitute for listening to people.

## The Scorecard Integrity Lab — modelling the measure, not just the goal ([ADR-0035](docs/adr/0035-scorecard-integrity-lab.md), `RULE-MTX-01..02`, Schema v47)

Goals tooling has an unexamined premise: that measuring something and reporting progress on it is
neutral. It is not. A measure is an incentive, and an incentive that pays for the cheap way to move
a number will buy the cheap way — from people who are not being cynical at all. LeadOS could already
track a goal's pace honestly (`goalPace`), check a single change for incentive alignment
(`evaluateStarAlignment`), and price the value of waiting on a decision (`expectedValueOfInformation`).
It had nothing to say about the instrument itself.

**The model.** `scorecardEquilibrium` solves a multitask principal–agent problem with a gaming
technology, in closed form, on the leader's declared parameters:

- `ŵ = w/Σw` — declared weights are renormalized, so a hand-edited 80/80 cannot double the real
  intensity;
- `ρ = ŵ/(1 + rσ²)` — a noisy metric is discounted (Banker & Datar 1989);
- `genuine = (ρ/c)(1 − 0.6·ratchet)` — the ratchet withholds output (Weitzman 1980);
- `gaming = ρ·ease·(0.6 + 0.8·stakes)/k` — stakes raise cosmetic behaviour (Campbell 1979);
- uncounted work receives **none** of the incentive (Holmström & Milgrom 1991), and the shortfall
  against first-best is printed rather than implied.

Effort is conserved: the declared uncounted-work floor is a share of a fixed budget, and when the
leader declares nothing uncounted, that floor redistributes instead of evaporating — a defect the
new tests found and now pin.

**The redesign search.** Seven deterministic designs — re-weight toward value that is hard to fake,
pair guardrails on the most gameable metrics, halve the stakes, measure the work you left uncounted,
and three combinations — are evaluated against the same model and ranked by modelled value net of a
declared per-metric measurement cost (default 2 points). A recommendation is made only when the net
lift clears 2 points; *keep it* is a legitimate and common answer.

**The falsifier.** Committing freezes the prediction: efficiency, cosmetic share, neglect, Goodhart
index, worst metric, and a +12pp margin. The leader later records their own estimate of how much of
the movement was cosmetic; the lab scores it, prints the error, drafts an after-action review when
the model was too kind, and refuses to claim calibration below three observations.

**Cross-module propagation.** `RULE-MTX-01` turns a distorted commit into exactly one DACI redesign
decision with four real options (including accepting the distortion), at most two owned delegations
(instrument the counter-metric; baseline the uncounted work) and at most one blameless 1:1 question.
`RULE-MTX-02` turns a falsified observation into one calibration decision and a pre-filled review.
A sound scorecard creates nothing at all. A committed design cannot be edited — the lab forks a new
draft with its own prediction, so the earlier forecast stays scorable.

**What this is not.** It is not a measurement of any person, and it never reads a message, calendar,
keystroke or sentiment. The parameters are declared conventions; a leader who declares their metric
unfakeable will be told the card is sound. That is the risk the falsifier exists to cover, and why
every number on the page is printed next to the equation that produced it.

## Hand-over execution verification, causal mechanism attribution & cross-team vendor contagion ([ADR-0034](docs/adr/0034-handover-execution-mechanism-attribution-and-vendor-contagion.md), `RULE-LCS-04`, `LCS-06..07`)

A cover delegation marked `done` on paper is not the same thing as an executed hand-over, and a
drill that stalls because nobody briefed or executed the cover plan is not a probability-model
error. Session 69 closes the three remaining gaps from [ADR-0033](docs/adr/0033-correlated-absence-and-briefing-readiness.md):

1. **Three-stage hand-over implementation grading (`gradeCoveredSourceProgress`, `handoverImplementation`, `LCS-06`).**
   Every covered source obligation (`decision`, `case`, `delegation`, `stakeholder`, `goal`,
   `person`) linked from a commissioned cover delegation is checked against its own dated
   lifecycle fields on or after `windowStart`. A cover delegation closed as `done` while zero
   linked source obligations moved is graded **`paper-only`** (never silently counted as executed)
   and raises `LCS-06` at severity 4; advancing at least one linked source record upgrades it to
   **`completed-verified`**.
2. **Automatic fallback hand-off on returned cover (`RULE-LCS-04` on `delegation.returned`).**
   When a deputy returns a commissioned cover delegation (`status: 'returned'`), `RULE-LCS-04`
   evaluates the remaining deputy pool for that window at the 75% fallback fit convention
   (`CONTINUITY_BACKUP_FIT_DISCOUNT`). If an eligible backup deputy clears the evidence floor, it
   creates a replacement cover delegation (`priorDelegationId`, `supersededByDelegationId` on the
   returned record, typed links to the parent hand-over decision and all covered obligations, and
   one blameless 1:1 briefing prompt). If no remaining deputy clears the floor, it opens one DACI
   cover-gap decision (`[LCS-RETURN:...]`) linked to the uncovered obligations so Decision Tempo
   prices it in the same transaction.
3. **Causal mechanism attribution on closed drills (`attributeDrillOutcomes`, `RULE-LCS-04` on `continuity.drill.closed`).**
   Closed-drill predictions are partitioned into **`model-miss`** (predicted covered or actively
   executed cover that still stalled), **`implementation-drop`** (commissioned cover that was
   unapproved, unbriefed, returned, unexecuted, or paper-only and stalled),
   **`predicted-stall`**, **`unmodelled-resilience`**, and **`clean-cover`**, reporting both the
   unconditional Brier/skill and **`executionConditionedBrier`** / **`executionConditionedSkill`**.
   When a window drops implementation, `RULE-LCS-04` automatically drafts one pre-filled
   After-Action Review (`retros`, Schema v43) and opens one owned ritual-fix delegation
   (`[LCS-EXEC:...]`).
4. **Multi-shock & cross-team vendor common-mode contagion (`vendorCommonModeContagion`, `LCS-07`).**
   Removes the single-shock, single-team ceiling by modelling a second simultaneous shock
   (`continuitySecondShockPct`, default 10%) alongside active service and vendor dependencies in
   `state.dependencies` (Schema v29) whose Simchi-Levi survival shortfall (`effectiveTTR > ttsDays`)
   pulls primary and backup stewards across multiple teams into incident recovery at once. Active
   dependencies missing `annualFailureProb` or `ttrDays` are surfaced in `unmodeledDependencies`
   and never treated as 0% failure risk.

## Correlated absence and the briefing nobody recorded (Schema v46, ADR-0033)

Schema v45's exact stall distribution assumed independent items. Measured on the demo's own
records, that assumption was worth **31.6% of the P90 tail**: 16.88 expected stalls and P90 19
under independence become 19.07 and P90 25 once a shared cause is allowed. So the page now shows
both, side by side, and prints the lift instead of picking the flattering number.

The correlated model (`simulateCorrelatedAbsence`) adds three mechanisms and states each one:
one shared cause per window takes the deputies recorded on **one team** offline together (25% by
default, adjustable 0–100%, a stress convention and not a measured outage rate); each deputy is
individually away with 8%-per-14-days odds compounded over the window; and when a deputy is away
the item falls back to the **next eligible deputy at 75% of their recorded fit**, or stalls if
there is nobody else. Coverage is now `fit × P(at their desk)` rather than `fit × availability`.

That last change fixes a real defect rather than tidying one: under the old formula a deputy who
was away *reduced* coverage by a multiplier but never lost it, so a stress test would have
reported **less** exposure after removing the person the plan depends on. There is now a test
pinning that 100% absence means certain stalls.

If every deputy is recorded on one team — or on none — a team-level shared cause is total. The
page reports that as a finding with a rendered label rather than letting P90 equal the item count
look like an accident, and points you at the deputy-unavailability stress for a partial loss.

**Concentration, not nomination.** `coverConcentration` counts distinct *eligible* deputies per
item at the evidence floor. A plan that names one of three equally eligible deputies is not
concentrated; an item with exactly one eligible deputy is. This also caught an error: a person was
eligible to cover contact with a stakeholder whose record is themselves, and collected a
relationship bonus for it. Self-cover is now refused with a stated reason, and relationship credit
requires a typed `stakeholder → person` link rather than a name in a text field. Correcting it
moved the demo plan from 53.5% to **46.5%** criticality coverage — the honest number.

**Stress, with no writes.** `#/handover?stress=<deputyIds>` takes up to three deputies out of the
window and re-derives coverage from the remaining pool at the same evidence floor. It shows which
obligations lose cover, which lose it entirely, and the change in expected stalls. Nothing is
commissioned, nothing is written, and the deep link is shareable.

**Then check the briefing.** A commissioned hand-over is a document until someone acknowledges it.
The readiness card links the hand-over decision's cover delegations and counts a delegation as
acknowledged only when it has a recorded check-in or is completed — never because it exists, and
never because a talking point was queued. Inside seven days, an unacknowledged cover delegation
raises `LCS-05` at severity 4. If you preview today's window while a future hand-over is
commissioned, the card shows the **future** one, because that is the plan that needs briefing.

**Evidence contract:** the correlated model's probabilities are conventions with printed values,
not measured outage or illness rates, and the assumptions list is rendered in full. One shared
cause per window is modelled; two simultaneous shocks and a vendor failing under two teams are not.
Readiness measures *recorded* acknowledgement, so a briefing that happened but was never recorded
reads as unbriefed — the correct bias for a workspace that claims to keep receipts. Existing drills
were not rescored under the new model, because that would make the ledger retroactive. See
[ADR-0033](docs/adr/0033-correlated-absence-and-briefing-readiness.md).

## Leader Continuity Drill — what breaks if you are not there (Schema v45, ADR-0032)

Open **Leader continuity** (`#/handover`). Pick the date an absence starts and how long it
lasts. LeadOS lists every dated obligation already in the record that currently needs the
leader inside that window — decisions waiting for a call or a review, case review dates, 1:1s
past cadence, active delegations, stakeholder contacts, overdue goal check-ins — and says, item
by item, why it scored the criticality it did.

Three things make the answer usable rather than decorative:

1. **Some work is not coverable, and the app says so.** A management conversation, or a call
   that is both irreversible and above your big-bet threshold, is marked *held*: it appears in
   the uncovered list with its reason and raises a structural signal. It is never quietly
   assigned to a deputy on paper.
2. **The stall count is exact, and the money is coherent.** The number of items that stall is a
   Poisson–binomial convolution of the per-item probabilities, so the mean, P50/P80/P90 and the
   probability that nothing stalls carry no sampling error. Currency exposure is a seeded Monte
   Carlo over the same probabilities, reported per currency with P90 and expected shortfall at
   90%, and never summed across currencies. Only items with a recorded amount are valued; the
   rest are counted as unpriced, not guessed.
3. **The hand-over is the smallest one that covers critical work.** Candidate actions are
   deputy × stall-class bundles with an explicit setup cost in minutes; the planner solves
   minimum set cover by exact branch and bound under a disclosed node cap and falls back to a
   labelled greedy plan when the instance is too large. Coverage is measured over every critical
   item's weight, so exported, held or uncoverable work cannot be counted as covered.

**Commission** creates the actual work in one transaction: one four-option DACI decision, up to
four owner-assigned delegations with explicit authority due before you leave, typed links to
every covered record, and at most one blameless 1:1 prompt per deputy. A stale preview is
refused (`planKey`, window and workspace revision are all checked), and a second click on the
same window is idempotent rather than creating a near-duplicate plan.

**Then test the prediction.** A drill freezes today's stall probabilities against a dated
window; nothing recomputes them. When you return, tick what actually stalled and record how many
unpredicted stalls you saw. Scoring is Brier, base rate, Brier skill, precision, recall and
coverage, withheld to counts below five predictions and three drills. Negative skill opens one
rebase decision instead of hiding behind a dashboard.

**Evidence contract:** the model assumes conditional independence between items, so shared
causes (two deputies away in the same week, one dependency failing) are out of scope. Deputy fit
and criticality are transparent conventions with printed components, not validated
psychometrics, and fit is never written to a person record or exported. A drill scores the
workspace's own prediction — not the quality of the handover, and not whether your absence
caused what you observed. The demo workspace starts with an empty drill ledger and no fabricated
history. See [ADR-0032](docs/adr/0032-leader-continuity-drill.md).

**Competitive benchmark, not a superiority claim:** the vendor material reviewed this session
(Lattice's Spring/Summer 2026 release, 15Five's Agents overview) describes AI review drafting,
focus briefs and meeting preparation. None of the public descriptions reviewed covers simulating
the manager's own dated absence, pricing the stalled obligations, solving the minimum cover, and
scoring the frozen prediction against a real absence. Public capability descriptions are not
proof of absence, and competitor behaviour and user outcomes remain **[UNVERIFIED]**.

## After-action evidence: from “applied” to record-corroborated — 2026-10-28 (Schema v44)

Open **Learning ledger** (`#/learning`) → **Ledger**. An applied label remains a human
claim. For a lesson, **Attach record** offers only a distinct anchored org change, completed
delegation, or reviewed decision dated between the review and the claimed application. The
leader selects the artifact and writes what it corroborates. LeadOS snapshots its small set
of relevant fields and rechecks that snapshot and the qualifying state every time the report
is rendered. If the record changes, disappears, becomes unfinished, or falls outside the
window, the evidence is labelled **stale**; it is never quietly kept green.

A link creates `lesson — corroborates → artifact` in the typed relationship graph. When the
lesson has an active owner, the same atomic post-commit transaction (`RULE-AAR-04`) also opens
one 30-day sustainment delegation, with links back to both lesson and artifact. The follow-up
asks whether the practice persisted and what evidence supports that; it explicitly does not
claim the practice worked or caused an outcome. Duplicate retries are idempotent. No owner
means no invented assignment. The new coverage card stays separate from the learning index:
corroboration is counts-only below five applied lessons, and stale records are reported
separately.

**Evidence contract:** a selected record is workspace corroboration, not external audit,
semantic matching, independent witness, proof of implementation quality, or causal/economic
effect. The chosen artifact can be misclassified by the user. Evidence lives in the local
workspace; no new export of lesson narratives, network service, connector, model, or telemetry
was introduced. v43 “applied” claims are preserved with empty evidence lists and remain
unverified after migration. See [ADR-0031](docs/adr/0031-learning-record-corroboration.md).

**Competitive benchmark, not a superiority claim:** Lattice describes review drafts grounded
in 1:1s, feedback, goals and prior reviews ([Spring/Summer 2026 release](https://lattice.com/blog/lattice-spring-summer-2026-product-release)); 15Five describes Agents for evidence-grounded review writing, manager focus briefs, and meeting preparation/notes ([Agents overview, updated 2026-10-08](https://success.15five.com/hc/en-us/articles/51450804595483-Agents-Overview)). Both vendor descriptions demonstrate that evidence synthesis and AI coaching are now incumbent capabilities. LeadOS therefore advances the *after* side of the loop: a user-selected dated artifact, stale-link detection, then a scheduled persistence check. Current competitor product depth and real-world user outcomes were not independently tested **[UNVERIFIED]**.

## Mitigation robustness & evidence gate — 2026-10-28

Open **Automation control room** (`#/assurance`), or an open case's **Stress-test
mitigation** action. The new gate asks a harder question than a point-estimate ROI:
**does this choice survive being wrong about the probability?**

1. Supply current/proposed event-probability bounds, a shared future horizon and the
   **additional** mitigation cost. Probability fields start blank. By default the case's
   conditional-loss range is shared between both plans. FMEA occurrence ratings are never
   converted here.
2. Or open **Constrain what the intervention changes** and give defensible bounds for
   event-probability reduction and the change in conditional severity. LeadOS clips the
   probability pair and severity pair to their feasible sets and computes exact extrema
   from their vertices—so impossible within-pair combinations cannot dominate the answer.
   Cross-dependence between the probability effect and severity effect is not modeled. Negative probability reduction explicitly permits a worse event rate.
3. Inspect **Savage minimax regret**, dominance versus evidence-sensitive choices,
   worst/best savings, break-even thresholds where defined, and a model-only
   perfect-information ceiling. The basic rectangular model is solved at eight corners;
   constrained mode enumerates exact feasible vertices. Its frontier only shows feasible
   illustrative points, not a probability distribution or confidence score.
4. Choose an active verifier and explicitly **Commission evidence review**. One atomic
   write opens a DACI decision with captured numeric assumptions, an owned verification
   delegation due within seven days (or the shorter horizon), and a blameless 1:1 topic
   if the existing queue has space. Typed links connect the work; the engine's derived
   decision event also reaches Decision Tempo automatically. Nothing applies a mitigation,
   changes residual risk ratings, sends a message or spends money.
5. Export a numeric brief without case/employee narratives. Same numeric facts, assumptions
   and owner reuse the existing gate across reloads. A changed local workspace revision
   requires a fresh comparison. Paused case automation stays paused.

Example: conditional loss **1,000 / 4,000 / 10,000 DKK**, current event probability
**20–80%**, proposed **5–40%**, additional cost **500 DKK**, horizon **30 days**.
Savings range from **−2,500 to +7,000 DKK**. Worst regret is **7,000 DKK** for holding
and **2,500 DKK** for the proposal: the proposal minimizes maximum regret but does
**not** dominate. Gathering evidence is meaningful; the **2,500 DKK** perfect-information
ceiling is a model bound, **not** EVSI or permission to spend that amount on research.

Advanced example: keep probability bounds at current **20–80%** and proposed **5–40%**,
then declare reduction **20–50 percentage points**, severity change **−1,000 to +1,000 DKK**
(proposed minus current), and additional cost **500 DKK**. Exact feasible-set savings are
**−700 to +4,800 DKK**; the proposal still does not dominate. Conditional severity ranges
from **0 to 11,000 DKK** after the nonnegative-loss constraint. No single break-even-loss
number is reported when severity changes under the intervention.

**Limits:** declared ranges are not calibrated estimates or causal evidence. The default
model uses a shared conditional loss and independent probability boxes, which may admit
impossible combinations. Advanced bounds narrow only the dependencies the user declares;
unmodelled dependence remains. Safety/compliance override the financial ranking. Historical spend is sunk;
delay and research costs are unpriced. Captured numbers live in an editable decision record,
not an immutable archive. Local revision checks are not cross-tab write isolation, so the
lab still cannot adopt a rehearsal snapshot. Schema v43 is unchanged; no new runtime
dependency, network service, account or export scope. Calculation and safety contract:
[ADR-0029](docs/adr/0029-mitigation-robustness-evidence-gate.md).

## Close the loop from 1:1 prep — 2026-10-28

Open a person's **Prepare → Open commitments** sheet and mark completed 1:1 promises or
manager-owned check-in follow-ups complete without leaving the preparation workflow. Only
those two record types expose this action; other commitment groups keep their existing
review flows. The action is hidden when printing, saved through the existing mutation APIs,
and the item leaves the open list after the sheet refreshes. An eight-second **Undo** action
restores an accidental completion. Completion remains a manager update
(`completedInMeetingId` stays empty): it does not claim that a 1:1 happened or that the person
confirmed anything. It adds no schema fields and does not change the sheet's
conflict or anonymous-pulse exclusions.

The choice compounds the existing evidence-linked preparation and follow-through ledger
rather than adding another terminal: the manager can see what they owe and close a finished
promise at the point they review it. Manager Tools' practitioner guide treats notes and
follow-up as critical and explicitly asks managers to prepare by reviewing their follow-up
notes ([One-on-One Basics](https://www.manager-tools.com/system/files/documents/docs/Manager-Tools_One_on_One_Basics.doc),
accessed 2026-10-28); this is practitioner guidance, not evidence that this change improves
outcomes. The feature is deterministic and local; no model or connector is involved.

## 1:1 discussion confirmation — 2026-10-28

A prepared agenda is not evidence that a conversation happened. In **Prepare → Log the
1:1**, select the items actually discussed and explicitly confirm them. Optionally clear
confirmed employee topics from their waiting list; otherwise they remain for a future meeting.
Changing the selection, person, or meeting status resets the confirmation. Skipped and moved
meetings cannot confirm discussion or clear topics. Existing local records and export formats
are unchanged; the feature does not send messages or access new data.

This addresses a frequent follow-through risk using existing agenda and talking-point data,
rather than adding another queue. An adoption signal worth checking with users is whether
uncovered topics return to the next 1:1 without requiring re-entry; no impact has been measured.
Atlassian describes keeping undiscussed topics on the agenda and assigning follow-up actions
([one-on-one meeting guidance](https://www.atlassian.com/blog/teamwork/running-successful-one-on-one-meetings),
accessed 2026-10-28); that product guidance is not evidence of a measured LeadOS outcome.

## The After-Action Review & Learning Ledger — 2026-10-28 (Session 63, Schema v43, ADR-0028)

Open **Learning ledger** in the sidebar (`#/learning`).

Every other terminal measures the work. This one measures whether the team converts what
happened into a change in how it works — and it can print the sentence no other tool prints:

> *You have diagnosed the same class of failure three times. The change you committed after
> the second one was never made.*

No incumbent product prints that, because printing it needs four things at once: a dated
record of the event closing, the intention **as frozen before the outcome was known**, a
classification stable enough to count, and the discipline to keep a committed change `open`
until a human says it was made. LeadOS already held the first two — case forecasts frozen at
opening, settled actuals, decision probabilities recorded before the call, delegation due
dates. v43 adds the last two.

**The review is pre-filled from the record, never from memory.** Opening a review for a
closed case loads *what was supposed to happen* from the forecast snapshot frozen at opening
and *what actually happened* from the settled actuals; for a decision it loads the recorded
probability and the reviewed outcome. The closing date is read from the record and cannot be
typed over, and a review cannot be held before the outcome it reviews. That is what stops a
retrospective from becoming a hindsight story.

**The cause is yours, and it has a floor.** The two evidence questions arrive filled; the
*why* is a human sentence of at least 12 characters or the review does not hold. No model, no
keyword rule and no template writes a cause in this codebase.

**A lesson must be classified, and must say what changes.** Eleven classes, each naming a
*system* failure mode rather than a person: estimation, scope, dependency & handoff, decision
quality, escalation, quality & rework, staffing & capacity, communication, process & ritual,
assumption, other. `Nothing — this was a one-off` is a first-class answer: it is stored as an
**observation**, shown beside committed changes, and excluded from the applied rate. That is
the difference between single-loop learning (fix the error) and double-loop learning (change
the policy that produced it), and the ledger keeps them apart instead of averaging them into a
"lessons learned" document nobody opens twice.

**A change is applied only when a human says so.** `open → applied` requires a date and a
sentence about what is now different; `dropped` requires the same and is the honest
alternative to a loop that rots open forever. Closing the related delegation is explicitly
*not* evidence: a task ended, a practice may not have changed.

**What propagates (ADR-0008 spine, one transaction):**

| Rule | Trigger | What the leader gets |
|---|---|---|
| `RULE-AAR-01` | a case, change, decision or delegation closes | one review, dated from the record, with both evidence questions pre-filled — no cause, no lesson, no verdict |
| `RULE-AAR-02` | a lesson is recorded on a held review | a `delegation` change opens exactly one owned delegation; a `decision` change opens one DACI decision; an owned lesson queues one blameless follow-up talking point |
| `RULE-AAR-03` | the same class repeats while its earlier change is still `open` | exactly one close-or-drop decision per class, not one per event — the app never drops the change itself |

Markers are stable (`[RULE-AAR-02:<lessonId>]`), so replay is a no-op and a class cannot
accumulate duplicate decisions. `learningAutoDraft` and `learningAutoPropagate` stop the
derived records without hiding the measurement.

**What is measured, and what is withheld.** Coverage is dated closures in the review window
that carry a held review or a dated skip, over all dated closures in the window; undated
closures and closures outside the window are excluded **and counted**, with the reason
printed. Below three dated closures there is no percentage at all — only counts. Median time
to apply is withheld when fewer than two changes have applied, and the composite index is
computed only over the components that can be measured (coverage 35%, applied changes 35%,
learning carried 30%), renormalising the weights and naming what is missing; below two measurable
components the index is not shown.

**What this deliberately does not do.** Nothing rates a person: a lesson names a system, a
decision or a practice, and every tab says so. There is no CSV export scope for this ledger,
so the free text here — the most sensitive prose in the workspace — stays inside the existing
export-redaction and conflict-privacy boundaries. There is no automatic class inference from
RCA prose and no auto-applied change; both were rejected in ADR-0028. Timings and rates are
computed on the demo workspace only **[UNVERIFIED]** beyond it.

## The Strategy Coherence Terminal — 2026-10-28 (Session 62, Schema v42, ADR-0027)

Open **Strategy coherence** in the sidebar (`#/strategy`).

Every other terminal answers a question *inside* a declared frame — what a decision is worth,
where effort is allocated, what a premise assumes. This one asks whether the frame itself is
the one being funded. Strategy documents are the best-dressed fiction in management: a leader
writes five priorities, funds three of them, plus two accidents nobody chose, and the deck
stays true because nothing in the system ever compares the two. LeadOS now holds both sides.

**Declare the bets.** A bet is a Rumelt kernel, not a note: a diagnosis, a guiding policy, at
least one thing the team will **not** do, an accountable owner, a declared share of effort, a
horizon, and a dated stop rule (metric, direction, date). A draft is not measured; an active
bet must carry the date it was adopted, and the normaliser demotes an active bet with no
adoption date back to draft with a warning, because an invented adoption date would let the
gap be manufactured.

**Then tag real work to it.** One link table — `strategyTags` — points at open cases, goals,
delegations, plan items, decisions, changes and hires, with an optional effort estimate. No
other module gained a field, so the change is additive: a workspace from Schema v41 migrates
without one record being rewritten.

**Then the number is forced.** Declared shares and measured shares are two distributions over
the same support, and the report prints their **total variation distance** in percentage
points (0 = identical, 100 = every funded record sits on something undeclared). On the demo
workspace: declared 60/25/15 against measured 58.3/41.7/0 — a **16.7pp say–do gap**. The
15% bet is funded by nothing at all, and the 25% bet is over-funded by 16.7pp. Per-bet signed
gaps are printed beside the aggregate; there is no invented "alignment score" and no weighted
composite of unrelated units.

Alongside it, three tests that a deck cannot pass:

- **Blind WIP** — the share of open work inside the strategy era that no bet funds. Demo:
  **24 of 29 records (82.8%)** are strategy-blind, above the workspace convention of 40%.
- **Effort drift** — measured share of the whole stock versus measured share of work tagged in
  the last 28 days. A bet can hold its historical share while nothing new is being put behind
  it; the flow column is what makes that visible.
- **Falsifiability** — six named checks per bet (owner, diagnosis, guiding policy, refusal,
  dated stop rule, at least one tagged commitment), graded falsifiable / partial /
  unfalsifiable. Demo: two bets pass 6 of 6; `bet-demo-3` passes 2 of 6 — no guiding policy,
  no refusal, no dated stop rule, no tagged work — so the weakest bet is named instead of being
  averaged into a healthy-looking 77.8%. The same bet's stop-rule date, 2026-10-22, has passed
  with no human verdict, which is the one overdue call the terminal raises (`SCO-04`).

**Concentration, honestly labelled.** Herfindahl over measured and declared shares, with
conventional bands and the caveat in the UI: a low HHI means the strategy is diffuse, not that
the leader is diversified.

**The coherence composite** (declared-vs-funded 45%, falsifiability 35%, coverage 20%) is only
computed over components that can be measured; the weights renormalise and the missing
components are listed. Below five open post-strategy records or five funding tags the report
demotes itself to **counts-only** and says why — no share is presented as measured when it is
arithmetic on two records.

**What propagates (ADR-0008 spine, one transaction):**

| Rule | Trigger | What the leader gets |
|---|---|---|
| `RULE-SCO-01` | a bet is adopted | one DACI commitment decision (priced by Decision Tempo in the same transaction once a value at stake exists), one owned delegation to tag work already in flight, one blameless talking point |
| `RULE-SCO-02` | gap exceeds the convention | one rebalancing decision naming the over-funded and under-funded bets and three options |
| `RULE-SCO-03` | active bet without a dated stop rule | one bounded, blameless delegation per bet to write metric, direction and date |
| `RULE-SCO-04` | stop-rule date passed, no verdict | one retire-or-renew decision plus an owner talking point — the app never retires a bet itself |

Re-running the audit is idempotent: the marker includes the bet set, so the same divergence
never re-opens a decision. Turning off `strategyAutoPropagate` stops the derived decisions and
delegations without hiding the measurement.

**What this deliberately does not do.** Nothing rates a person. There is no strategy CSV
export scope, so bet text — the most sensitive prose in the workspace — stays inside the
existing export-redaction and conflict-privacy boundaries. There is no forecasting of whether a
strategy will win; the terminal measures whether it is funded as declared, which is a fact about
the leader's own records, not a prediction. Effort estimates are self-reported, so the measured
share is only as good as the tagging; the report prints the coverage of effort estimates and
falls back to counting records when fewer than half carry one. Timings and share values are
computed on the demo workspace only **[UNVERIFIED]** beyond it.

## The Propagation Ledger — 2026-10-28 (Session 61, Schema v41, ADR-0026)

Open **Propagation ledger** in the sidebar (`#/propagation`).

Every other screen shows what the automation *produced*. This one shows what it *cost*, what
it *declined*, and what it *lost* — because until now nothing in the product did, and the
number was not small.

**Price.** One `case.created` event attempts 42 (rule, event) pairs across 14 rules and 5 of
them apply. The ledger reports invocations, applications, declines and collapsed re-runs,
then ranks the rules by measured milliseconds. On the demo workspace `earlyWarningRule`
(150 ms), `premiseRule` (82 ms), `dynamicsRule` (35 ms) and `loadRule` (12 ms) accounted for
~91% of rule time, and three of them applied nothing at all on that event. Wall clock and the
sum of rule durations are shown separately, so engine overhead is never folded into a rule's
share.

**Coverage.** Which event types actually moved the workspace, and which were delivered to
rules that all declined. The full rule chain is listed with its declared purpose, whether it
scans the workspace, and whether the engine is permitted to collapse a proven repeat.

**Failures.** A rule that throws is rolled back so the workspace stays consistent — and the
failure becomes a durable receipt (Schema v41) holding the event that triggered it and the
error. **Retry now** re-runs only that rule, against the workspace as it stands. Before this,
a failed propagation was a toast: the decisions, delegations and goals it would have created
were simply absent, with no way to find out later or to ask for them again. Receipts are
content-free by design — event identity and an error message only — so they cannot become a
second copy of your records outside the export-redaction and conflict-privacy boundaries.

**What changed underneath.** The savepoint that gives each rule a private, rollback-safe view
of the workspace used to be a full deep copy of everything, once per rule per event. It is now
copy-on-write: a rule that returns early on its event-type guard — the first line of every
rule in this codebase — copies nothing. Measured on the demo workspace:

| Scenario | Before | After | Gain |
|---|---|---|---|
| Single `case.created`, 362 records | 233.1 ms | 138.5 ms | 1.7× |
| Single `case.created`, 5,792 records | 4,254.1 ms | 2,943.5 ms | 1.4× |
| Four-event cascade, 362 records | 369.6 ms | 54.0 ms | 6.8× |
| Four-event cascade, 5,792 records | 5,532.0 ms | 1,284.4 ms | 4.3× |

A declined re-run is collapsed only when it produced no write, no emission, no audit entry,
no warning and no effect at an unchanged workspace version — and only for rules whose decline
verdict has been **proven** independent of which entity the event named. The proof is a test,
not a comment, so an unproven rule is never skipped however expensive it is. The single-event
gain stays at 1.4–1.7× because there is nothing to collapse there; both numbers are reported.

These are timings on one machine with a synthetic fixture, not a performance guarantee. The
remaining cost is genuine analytical work in the three scan rules, which is now visible with a
name and a number instead of being an unexplained slowdown.

## Counterfactual mitigation lab — 2026-10-28

Open **Automation control room** (`#/assurance`) → **Counterfactual mitigation lab**.
Choose an open case, enter three proposed residual FMEA ratings and an **additional**
mitigation cost, then compare. Two disposable stores run the real validated `updateCase`
action and all production post-commit rules at the same clock: a refresh of the current
plan versus the proposed edit. Collection counts and typed relationship deltas expose
follow-through into decisions, coaching, capacity, communication and other relevant modules.
Global governors may also react: these are whole-transaction effects, not case-only causality.

The financial panel uses **Savage minimax regret** over your three declared loss scenarios.
It exposes break-even loss and both alternatives' worst regret. Occurrence rating / 10 is
explicitly an **uncalibrated sensitivity proxy**, not measured probability; historical
mitigation spending is sunk, and proposed spending is incremental. Missing baseline ratings
or loss estimates suppress economic ranking. Safety and compliance always override it.
Exports contain numeric assumptions and aggregate effects, not record titles, identities or
private narrative. Failed post-commit rules are counted and make the rehearsal incomplete.

No live writes, no messages sent, and no stale snapshot can be applied. Adoption remains an
explicit edit of the original case. HTTP runs use a module worker with a 30-second timeout;
the portable standalone falls back to local execution (large workspaces can pause its UI).
No new dependencies, network calls or schema migration were introduced.

## Connected response & Watch integrity — 2026-10-28 (Session 60, Schema v40)

LeadOS now delivers derived lifecycle events through a bounded, synchronous, breadth-first
queue inside the existing local transaction. A rule's changes, logs, warnings and emitted
events share its savepoint; failure rolls back that rule, reports a warning and does not erase
the source action. New cases, decisions, delegations and portfolio records created by an
action or rule emit typed lifecycle events automatically. Events deduplicate by type/entity/id
and stop at 64 per transaction; a limit or rule failure is recorded, not hidden. Not every
entity or update in the application has been migrated to this mechanism; see the roadmap.
For derived case/decision creations, Decision Tempo only processes related decisions; an
explicit/root scan can still evaluate the wider workspace.

### Try the connected workflow

1. Open **Early-warning watch** (`#/watch`) and record a verdict on an open signal. Detection
   is a screening heuristic; it cannot by itself establish a cause or open a case.
2. For **Confirmed**, optionally choose an existing active owner, goal and stakeholder; add a
   first response action and opt in to an open decision. Optional FMEA ratings must be entered
   as a complete 1–10 set. Optional optimistic / most-likely / pessimistic person-day estimates
   require those ratings. Unknowns stay blank; no ratings, owner, goal or three-point effort inputs are invented.
3. The resulting alert → case link can fan out, depending on the supplied facts and settings,
   to a DACI decision, owner delegation and coaching topic, goal risk check-in, capacity reserve,
   opening estimate, proposed (not armed) Decision Tempo timebox, and unsent stakeholder brief.
   The **Automation control room** can preview or refresh follow-through. No message is sent.
4. A failed promotion leaves the one-way verdict and response context on the alert. Use **Retry
   case promotion** or **Refresh follow-through** in Judged alerts. Automatic sensing may be
   paused without blocking the explicit human confirmation or retry. Rule errors are reported;
   persistence errors are separately surfaced by the store.

The same case lifecycle is used for direct cases and resilience-drill cases. Breached drills
no longer fabricate a case owner, FMEA ratings, loss range or person-days from a steward or
recovery duration. Case-linked typed relationships exclude confidential conflicts and anonymous
pulse records. Watch CSV #40 contains only opaque codes and numeric/provenance fields, never
verdict notes, response text or names.

**Unrated cases:** PERT magnitude and capacity can be recorded without ratings, but
probability-dependent expected loss, ROI, occurrence Brier and scenario net value are withheld.
An opening snapshot with unknown occurrence remains unknown even if someone rates the case
later; magnitude can still be scored. New-case and resolution dialogs do not prefill FMEA
ratings. FMEA occurrence ÷ 10 and projected residual reduction are modelling conventions,
not measured event frequencies; independent empirical validation is **[UNVERIFIED]**.

### What the Watch can and cannot claim

- The four Shewhart rule scores are ranked with a **Benjamini–Hochberg-style step-up**. They are
  nominal screening scores, not validated p-values: limits are fitted in-sample, many vitals
  are overlapping 28-day windows, series are dependent and scans repeat. **No FDR guarantee or
  expected false-discovery count is established.** The budget, cooldown and noisy-series
  suppression remain visible. Governance rules can create monitoring decisions independently
  of a verdict; only a confirmation opens a case from an alert.
- New predictions target an entire future Monday–Sunday week and are unique per series/target.
  The first available outcome is frozen at the next scan; a capture after the following day is
  displayed but excluded from skill. Later reconstructed-source revisions are flagged. Legacy
  and demo replay forecasts are preserved as unscorable, not real out-of-sample evidence.
- Per-series MAE and skill are withheld until at least five timely comparable observations and
  nonzero total naive error; mixed-unit MAEs are never pooled. This floor is a display convention,
  not proof of predictive power. Windows overlap, historical records can be backdated or
  revised before capture, and the local app is not an immutable data-vintage archive.
- Human verdict precision and Wilson intervals describe the judged subset, not ground truth or
  all suppressed alerts. See `RESEARCH.md` §64 and ADR-0025 for assumptions and limits.

**Audit scope:** this session inspected and tested the canonical local-first app paths touched
here, not the entire repository line by line. Earlier capabilities, competitive comparisons,
real-browser/screen-reader behavior and large-workspace performance not independently checked
this session are **[UNVERIFIED]**; historical sections below describe earlier claims, not a fresh
certification.

## Structural Capital Allocation — 2026-10-28 (Session 58, Schema v38)

Open **Capital allocation** (`#/capital`). This is the first LeadOS surface that answers the
question a leader actually faces at the start of a quarter: *I have a fixed number of effort-weeks
and six ways to spend them — which mix, what does it buy, and does the model that priced it deserve
to be believed?*

Set a **budget** (1–40 effort-weeks, default 12), a **horizon** and, if you disagree with the
convention, the four **objective weights**. The engine spends the budget by marginal return per
effort-week — greedy, so every accepted increment paid for itself — and then runs a complementarity
pass, because a synergetic pair funded together is worth more than either alone.

Four tabs, in the order a leader has to think:

- **Plan** — the funded portfolio, effort spent and left, the joint trajectory against doing
  nothing, and a verdict that separates *improves* from *investment* (it raises the ceiling but
  costs this horizon's throughput) from *worsens*. Effort costs come from a published book and are
  labelled conventions, not measurements.
- **Attribution** — **exact Shapley** over every coalition of the funded levers (six levers is 64
  evaluations, so this is exact and instant, never sampled), with the efficiency gap printed. Below
  it, a substitute/complement table: `WIP cap × learning` on the demo is **+25.07** (fund them
  together), `WIP cap × delegation` is **−7.34** (they compete for the same constraint).
- **Robustness** — 32 seeded lognormal draws of every structural parameter, P10/P90 bands, and
  **Savage minimax regret** across your plan, the six named playbooks and doing nothing. On the demo
  the portfolio has mean 52.6 (P10 50.2 / P90 56.4) and max regret **26.93** — it wins because its
  worst case is the least bad, not because its mean is highest.
- **Checkpoints** — the do-nothing baseline is **frozen beside the prediction at adoption**. When the
  checkpoint arrives, the app scores the frozen prediction as a **skill score** against persistence
  (`1 − model error / naive error`), not against memory. Skill is withheld when no baseline was
  frozen, pooled skill is suppressed below two observations, and two non-positive checkpoints open
  exactly one re-baselining decision instead of silently retuning the model.

**The trust ladder is the point.** `unvalidated → refuted → provisional → backtested → validated`.
Only **backtested** or better may be called *actionable*, and every grade lists the evidence that
would move it up. The demo workspace sits at **refuted** (its dynamics hindcast has skill −5.38), so
the page tells you the recommendation is *comparative*, not something to act on. A tool that always
says "optimal" is a toy.

**Cross-module, on the same spine.** Adopting a portfolio opens exactly one DACI commitment decision
— priced by Decision Tempo in the same transaction, with the Shapley rows as options and the trust
grade in the question — and exactly one owned, dated checkpoint delegation carrying the frozen
prediction. Checkpoints append typed `scores` lineage. `SCA-01..05` signals reach Insights, CSV scope
#39 exports numeric telemetry under opaque codes (no names, titles or notes), and the header
downloads a deterministic board brief.

Nothing is auto-implemented, no data leaves the browser, and no people are ranked by the answer.

## Operating System Dynamics Lab — 2026-10-28 (Session 57, Schema v37)

Open **System dynamics** (`#/dynamics`). This is the first LeadOS module that treats the team
as a **system with accumulations and delays** instead of a snapshot: five stocks (delivery
capacity, work in progress, quality debt, perceived pressure, dependency concentration) are
derived from records you already keep, integrated forward with RK4 at a one-week step, and
read back as trajectories, loop dominance and archetypes.

Four tabs, in the order a leader has to think:

- **Structure** — the stocks, where each number came from (measured / estimated / convention),
  the simulated saturation trajectory against the 100% "fully committed" line, and the
  structural-risk score.
- **Loops** — seven named loops (burnout spiral, key-person, capability growth, backlog drain,
  hiring drag, symptom repair, intake renegotiation) ranked by **measured gain**, not by how
  loud they look, plus the dominance table week by week and the archetype findings with their
  evidence lines.
- **Policy lab** — six playbook interventions and your own experiments, each compared with
  doing nothing: delta saturation, delta WIP, delta throughput, delta capacity, and a verdict
  that distinguishes *improves* from *investment* (raises the ceiling while costing this
  quarter's throughput) from *worsens*. Adopting an experiment **freezes** the prediction and
  opens one owned checkpoint; retiring requires a written reason.
- **Calibration** — a hindcast against weekly WIP reconstructed from dated portfolio
  lifecycles, scored against naive persistence, with five refusal gates. On the demo workspace
  the model is explicitly **no better than "tomorrow equals today"** (MASE 2.53, skill -5.38).

Three rules propagate what it finds, atomically and idempotently: **RULE-DYN-01** opens exactly
one four-option DACI structural decision priced by Decision Tempo, **RULE-DYN-02** queues one
blameless, marker-leading 1:1 talking point naming the loop, and **RULE-DYN-03** opens one
delegation carrying the frozen prediction. `dynamicsAutoPropagate: false` pauses the automatic
side; an explicit **Scan now** always runs. CSV scope #38 exports 20 opaque/numeric columns
with no names, hypotheses or notes.

Honesty is enforced, not promised: every parameter carries provenance and the report prints the
split (the demo is 65% conventions, so its structural claims are labelled *provisional*); an
undated closure is excluded and counted, never interpolated; the stability verdict is a local
linearisation and is described as one; and the module never predicts morale, sentiment or
individual attrition. See ADR-0022.

**Status block, verified 2026-10-28 (this session, not carried over):** Schema v37; 125 app ES
modules; 57 test suites; **906/906 canonical tests pass** (ESLint clean, canonical boundary OK,
144 internal documentation links resolve); `npm run verify:standalone` 7/7 with the artifact
rebuilt at 2,647,591 bytes. Demo regression and all engine numbers are quoted in `ROADMAP.md`
for Session 57.

## Automation rehearsal relationship diff — 2026-10-28

In **Automation control → Rehearse a case event**, preview now compares valid
operational relationships before and after the production post-commit rules run.
It groups added and removed edges by source module, relation and target module,
including replacements where both counts rise, and shows before/after counts for
dangling, duplicate and unknown-relation diagnostics. It does not expose names or
record IDs in this diff. Private links are excluded; links are evidence, not causal
claims. Preview is disposable and only covers post-commit rules, not case-opening
action automation; refresh always recomputes against current state.

## Assumption-Aware Scenario Tails — 2026-10-28 (Session 55, derived on Schema v36)

Open **Assumption ledger → Scenario tails** (`#/premises?tab=tails`). LeadOS now answers:
*how much wider is the delivery tail because the reasons for the plan may be wrong — and
which assumption is doing the damage?* Each evidenced premise is coupled through the same
two-hop typed graph to measured committed portfolio work. A paired, seeded Monte Carlo
(Common Random Numbers — identical Beta-PERT draws with and without premise failure)
reports baseline vs premise-coupled P50/P80/P90 and overload risk. Leave-one-out
attribution shows the P90 days recovered by holding each single premise true.

Honesty gates are the feature: a premise with **no committed evidence is never coupled**
(a prior is not a frequency); belief weights a **stress test, not an actuarial forecast**;
failure shocks (+60% load-bearing / +40% major / +25% monitor effort, capped ×3/item) are
labelled conventions. Correlated-evidence clustering groups observations sharing one
typed source — one incident told three times is flagged **pseudo-replicated**, never
silently counted as three. Signals TAIL-01..03 surface tail widening, the dominant
assumption, and evidence concentration in Insights. CSV scope #37 exports opaque
telemetry only. No schema change, no new dependency, no network. See ADR-0021.

## Sensor Calibration Loop — 2026-10-27 (Schema v36)

The Assumption Ledger now closes the loop on its own sensors. When a premise becomes
knowable, use **Assess outcome** to append a human judgement: **held**, **failed**, or
**inconclusive**. A conclusive label is immutable and unique per premise; an inconclusive
checkpoint is retained but not scored. The date is when the outcome became knowable, not
when someone happened to type it. No sensor decides whether its own claim was true.

The new **Sensor calibration** tab scores the sensor's declared likelihood-ratio strength
against those later outcomes with the Brier score, mean forecast vs. observed held rate,
calibration gap, directional accuracy and a forecast-mix PSI comparison. Repeated changes
to the same typed source collapse to its last state before the outcome, and each premise
counts once per sensor. Metrics stay **counts-only below five settled premises**; PSI needs
ten earlier and ten recent samples. PSI compares separate earlier/recent settlement-date cohorts (never splitting one same-day wave) and is only a distribution-shift indicator, not a finding
that quality got worse. The LR-to-probability mapping starts from a neutral 50% prior; it is a
transparent diagnostic convention, not proof that a declared LR is empirically valid. **No
LR is automatically retuned.** Sparse, dependent leadership observations do not justify
auto-learning.

`RULE-PREM-05` links an outcome to its premise (`validates`) and linked decision (`revisits`)
on the generalized event spine. Point-in-time views exclude outcomes not yet knowable, and
clearing demo premises clears their outcomes. CSV scope #36 uses opaque premise codes and
exports numeric sensor telemetry only—no premise titles, notes, people names or evidence
text. See [ADR-0020](docs/adr/0020-outcome-scored-premise-sensor-calibration.md).

## Automation Control Room — 2026-10-27

Open **Automation control** in the sidebar (`#/assurance`). Trace shortest operational
relationship trails with per-hop rule provenance; inspect dangling endpoints, duplicate edges
and unregistered relations; export a text assurance brief. Reverse traversal is labelled: a
relationship is evidence, **not causal failure propagation**. Confidential conflicts and anonymous
pulses are excluded, and arbitrary failure-log text is never displayed or exported here.

Choose a case → **Preview in sandbox** to run the actual post-commit registry on a disposable
copy. See created/updated/removed row counts and a per-rule savepoint trace. **Refresh current
case** requires confirmation and recomputes from current facts; it never installs the preview
snapshot. It may create unsent comms drafts, decisions or coaching prompts. Nothing is sent.

Post-commit rules now use isolated savepoints: an exception discards that rule's writes and
buffered success events, records a named failure, then continues from the last successful rule.
The source action remains committed. This does **not** yet isolate action-level automation,
external effects, ID allocation or whole-transaction persistence failures. Existing storage-error
warnings remain authoritative; a successful refresh means in-memory commit, not guaranteed disk
persistence. No schema migration or runtime dependency was added. See
[the assurance architecture note](docs/adr/0010-automation-assurance-savepoints.md).

## Premise Sentinel — 2026-10-27 (Schema v36)

Open **Assumption ledger** in the sidebar (`#/premises`). Before an important decision,
write down the **load-bearing premise** — the thing that must stay true for the call to
keep working — plus the signpost that would prove it wrong. Give it an owner, a prior
belief, watch/breach thresholds and a review date. LeadOS then watches the records you
already keep: cases, stakeholders, continuity dependencies, budgets, delivery actuals,
forecast challenges, reviewed decisions and cognitive-load bands. A two-hop typed
relationship graph finds linked evidence without you re-entering it.

Each dated observation has a named likelihood ratio for or against the premise. The
engine turns those into a posterior belief using transparent log-odds, discounts old
evidence by a leader-owned half-life, and shows Wald-style evidence boundaries and
information gain in bits. **A broken signpost does not reverse your decision.** It opens
one four-option DACI re-decision (hedge, pause, reverse or buy information), one owner
verification delegation, one blameless 1:1 prompt and typed links back to the original
call; Decision Tempo prices the delay on the same event when typed value links exist.
You can pause governance fan-out, run an explicit signpost scan, reaffirm or retire a
premise with a dated note, and download a board brief. CSV scope #35 exports only opaque
premise codes and numeric belief telemetry — never titles, notes or people names. No
network, LLM, sentiment inference, conflict record or anonymous pulse is used.

The math and its limits are documented in
[ADR-0019](docs/adr/0019-assumption-ledger-premise-sentinel.md) and RESEARCH §61.
Likelihood ratios are conventions, not calibrated probabilities; Wald boundaries are
not p-values on independent trials; the leader owns every re-decision.

The **canonical application is `index.html` + `app/**`**. It runs in your browser with no
account, application backend, database or runtime package dependency. The static server
only serves files; app records stay in this browser's `localStorage` unless you explicitly
export them. **Optional passphrase encryption** can seal that stored copy (Settings → Protect
this browser copy). Exports are separate files and stay unencrypted unless you choose
*Create encrypted backup*; a lost passphrase cannot be recovered by anyone.

```sh
node scripts/serve.mjs --host 0.0.0.0 --port 5173
# or: npm run app
# Open http://localhost:5173
```

Node 18+ can serve the application; there is no build or dependency install required to run
it. For the test tooling, use Node 22+ (verified with Node 22.22.3):

```sh
npm ci --no-audit --no-fund
npm run verify:canonical     # ESLint + ADR-0007 boundary gate + docs link gate + canonical regression suite (see AI-SESSION-LOG.md for latest results)
```

CI ([`.github/workflows/node.js.yml`](.github/workflows/node.js.yml)) runs those same four gates
on Node 22.x — the single version the workflow pins. (Earlier versions of this file said "20.x and
22.x"; the workflow has never had a matrix, so that claim was wrong and is corrected here.) It
deliberately does **not** run `next build`. Per
[ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md) and
[ADR-0072](docs/adr/0072-ci-verifies-canonical-app.md), the `src/**` Next.js tree is a frozen
quarantine that is documented as non-building, so building it in CI measured a tree no LeadOS user
can reach and held the check permanently red — which meant the canonical test suite never ran in
CI at all. CI now fails only when the running product regresses.

## Run LeadOS from one HTML file on any PC

[`LeadOS-standalone.html`](LeadOS-standalone.html) is a **self-contained copy of the entire
application**: every canonical JavaScript module under `app/**` (327 at Session 115) and the full
stylesheet are inlined into one ~6 MB HTML file. There is no server, build, install, backend, account, `node_modules`, CDN,
font fetch or network request.

**To use it:**

1. Download or copy `LeadOS-standalone.html` to any PC (USB stick, desktop, shared drive — the
   filename can be changed).
2. Double-click it. It opens in any modern browser from a `file://` path.
3. Use the app normally. In the served version, **Settings → Portable offline copy** offers the
   same file as a download.

**Moving your records:** the HTML file contains the app, **not your data**. Records are kept by
that browser's local storage under a separate `leados.standalone.v1` key, so the portable copy
does not overwrite a served workspace on the same machine. Before moving PCs, use
**Settings → Export JSON**; on the other PC open the copied HTML and use **Import JSON**. Some
browsers restrict `localStorage` or Web Crypto for local files: if Settings shows a saving
warning, records are temporary and plain JSON exports are not encrypted — export before closing
the tab. The standalone file also ships a `connect-src 'none'` CSP as a defence-in-depth
guarantee that it cannot call a network API.

**Regenerate after changing the app:**

```sh
npm ci --no-audit --no-fund
npm run build:standalone       # writes/overwrites LeadOS-standalone.html
npm run verify:canonical       # full canonical regression suite
```

`esbuild` is a **build-time-only** dev dependency used by
[`scripts/build-standalone.mjs`](scripts/build-standalone.mjs); none of it is needed to run the
generated HTML. The script refuses to overwrite canonical `index.html`, computes a source
fingerprint, rejects any residual external script/stylesheet, module import, `fetch()` or
external CSS URL, and can write to any output path with `--out`. See
[ADR-0009](docs/adr/0009-single-file-offline-distribution.md) and
[RESEARCH.md](RESEARCH.md) §50 for the rationale and limits of `file://` single-file apps.

## Cognitive Load & Attention Governor — 2026-10-27 (Session 52, Schema v34)

`#/load` answers the person-side question every plan begs and no hour-booking heatmap can:
**whose cognitive capacity is the system constraint right now, and what should move?** Nothing
is measured from calendars, messages or keystrokes. Every input is a fact the leader already
records — funded portfolio commitments, the roster and its reporting graph, dependency
stewardships, onboarding plans — and nothing about the result is persisted as a rating. The
report recomputes live, on a **role in a system**, never as a score of the human.

- **One transparent saturation index, four named components** (weights shown in the policy tab,
  no hidden model): intrinsic utilization of ramp-adjusted, reserve-discounted supply (0.40),
  WIP switching against the shared Kanban convention (0.25), extraneous coordination —
  strong-tie degree, 1.5 per direct report, weighted stewardships (0.20) — and open
  delegations/cases (0.15). Five bands follow fixed cut-points with a leader-owned saturation
  threshold (default 80): headroom, managed, elevated, saturated, overloaded. The team panel
  adds Brooks's `n(n−1)/2` communication channels and the single Goldratt system constraint.
- **A seeded Monte Carlo says whether the commitments fit.** Beta-PERT effort draws against the
  person's own horizon supply produce a reproducible overload probability; commitments without
  measured triples are counted as *unquantified* and excluded from every draw — never sampled
  as zero.
- **Per-person Little/Kingman queueing, with honest floors.** Throughput and median cycle time
  come from recorded completions; expected wait is Kingman's `(ρ/(1−ρ))·c·cycle` (c = 1, an
  exported convention). Counts-only below two completions, learned at five; at ρ ≥ 1 the
  terminal reports *unstable* with no fabricated finite wait.
- **Germane load is protected, never penalised.** A ramping team member (active
  onboarding/transition plan, supply factor below one) is flagged, not scored down;
  `RULE-LOAD-04` asks the in-roster manager to protect learning time once the person reaches
  the elevated band.
- **Four event-driven rules on the generalized post-commit spine** (triggered by portfolio,
  delegation, dependency, person-archive and explicit scan events — no hardcoded glue):
  `RULE-LOAD-01` opens exactly one four-option DACI load-shedding decision (defer the lowest
  value-density thread / reassign to measured headroom, honestly naming when none exists /
  open a requisition / renegotiate scope or dates) with typed `involves`/`decides` links,
  priced by Decision Tempo in the same transaction; `RULE-LOAD-02` queues a blameless
  WIP-limit prompt; `RULE-LOAD-03` flags an individually oversized commitment *inside* the WIP
  limit; prompts self-clear when resolved and marker-idempotence makes repeated scans
  converge. A pause switch blocks automatic fan-out while an explicit human scan always runs.

Signals `LOAD-01..05` appear in Signals; CSV scope #34 exports opaque per-person telemetry
(`load_person_n` codes — no names, roles or free text); a deterministic board brief names the
constraint and its caveats. Rules: `RULE-LOAD-01..04` — see
[ADR-0018](docs/adr/0018-cognitive-load-attention-governor.md) and [RESEARCH.md](RESEARCH.md)
§60 (Sweller; Skelton & Pais; Little; Kingman; Anderson; Brooks; Goldratt). The demo ships
mid-story on real records with a visible threshold policy: one ramping team member saturated
at index 76, one engine-opened shed decision, WIP and germane prompts waiting. Thresholds and
weights are transparent conventions, not empirically validated team constants — the UI says so.

## Allocation Governor — 2026-10-27 (Session 51, Schema v33)

`#/allocation` answers the question every plan begs and no ranked list can: **where should the
next person-day go?** Classify each operating-plan item as **Core** (optimise what exists),
**Adjacent** (extend into nearby ground) or **Exploratory** (a bet on new ground) — Nagji &
Tuff's ambition horizons. Work you have not classified is shown as unmeasured; the app never
guesses. From then on the Governor does three things continuously:

- **It learns what each horizon returns.** Every delivered item with recorded actual effort and
  value becomes one settled observation. Per currency, each horizon ("arm") earns a UCB1 index —
  its mean settled value per person-day plus an exploration bonus that prices how rarely it has
  been tried (Auer, Cesa-Bianchi & Fischer 2002). Below five settled bets an arm shows counts
  only: no return is invented. Settled work without recorded actuals is excluded and counted as
  an evidence debt, never scored zero. Currencies are never mixed.
- **It watches your funding behaviour, not your intentions.** If the exploratory share of
  classified effort funded in the look-back window falls below your floor (default 10% over
  180 days), exploration is being starved — March's (1991) success trap, measured. `RULE-ALLOC-01`
  then opens exactly one DACI rebalancing decision with the queued bets attached (fund one,
  fund a smaller probe with a stop rule, defer on the record, or lower the floor deliberately),
  and Decision Tempo prices it in the same transaction. Nothing is auto-funded, ever.
- **It closes the learning loop.** A funded bet queues a 1:1 prompt to agree its learning
  checkpoint and stop rule (`RULE-ALLOC-02`); a delivery without actuals opens one
  evidence-closure delegation (`RULE-ALLOC-03`); funded-but-unclassified work prompts its owner
  to classify it, and the prompt clears itself when done (`RULE-ALLOC-04`).

Rules: `RULE-ALLOC-01..04` (see [ADR-0017](docs/adr/0017-allocation-governor-explore-exploit.md)
and [RESEARCH.md](RESEARCH.md) §59). Signals `ALLOC-01..05` appear in Signals; CSV scope #33
exports the arm table (aggregates only — no titles, no names). The demo ships mid-story: 0%
exploratory funding against a 10% floor, one engine-opened rebalancing decision waiting, arms
honestly counts-only at n<5.

Also fixed this session: blank FMEA ratings persist as *unrated* (`null`) end-to-end — cases show
"Rating needed" instead of a default RPN — and `store.lastPropagations` is wired, so action
results report the cross-module propagations that actually happened.

## Stakeholder Comms Outbox — 2026-10-27 (Session 50, Schema v32)

`#/comms` turns the stakeholder updates you already owe into drafts you can review.
When you register or update an operational case, LeadOS writes a status brief for each
**key stakeholder** (manage-closely or keep-satisfied) and each **opposing** stakeholder
(blocker or skeptical), using only facts recorded on the case: the risk rating, owner,
mitigation, review date and any financial estimate. A fact you have not recorded appears as
**"[to confirm — …]"** and lowers the readiness meter. Approving a draft with a gap requires you
to acknowledge it.

- **Nothing is sent by the app.** You approve, copy the text into your own email or chat, and
  record it as sent. A logged stakeholder touch also marks the matching draft sent.
- **Closure is owed, not assumed.** When the case resolves, unsent briefs are withdrawn. A closure
  note is drafted only for people who were actually briefed. Reopening withdraws it.
- **Edits are honest.** Changing an approved message withdraws its approval. Changing a case fact
  supersedes the draft and records why. A dismissed draft is not re-drafted until the facts change.
- **Typed links.** Each draft links to its case (`communicates`), so it appears in the case's
  linked-entity panel.

Rules: `RULE-COMMS-01..04` (see [ADR-0016](docs/adr/0016-stakeholder-comms-outbox.md) and
[RESEARCH.md](RESEARCH.md) §58). Signals `COMMS-01..03` appear in Signals. The demo workspace
ships a populated outbox.

Limits: FMEA ratings defaulted to 5 at case creation, so an unrated case could not be told apart
from a deliberate 5/5/5 — **fixed in Session 51** (blanks now persist as unrated, and the outbox
readiness check flags them). Drafts are not in CSV exports, but they are in the full JSON backup.

## Impact Ledger — 2026-10-27 (Session 49, Schema v31)

`#/impact` answers the question no other leadership tool will answer: **did that
actually work?** You declare a study before you run it — metric, direction, the
day the intervention starts, how long you are willing to wait, and (optionally)
the effect size you expect and your confidence. The app then decides whether your
records can answer the question at all, and says so when they cannot.

It is not a dashboard with a causal adjective bolted on. Every number is derived
from dates you already typed — 1:1s held, feedback given and observed,
delegations delegated and completed, cases opened and resolved, decisions taken,
pulses answered, recognition given — and the inference is designed to fail
loudly:

- **Pre-registration is a constraint, not a promise.** `declaredOn` is stamped by
  the app, so a hypothesis written down after the intervention began is filed as
  *retrospective* forever and can never count as confirmation. Predictive fields
  are refused once the window closes, and scoring freezes the evaluation
  permanently — the report reads the frozen copy, never a live recomputation.
- **Unmeasured is not zero.** A week with no observation is a gap in the chart,
  never a `0`. A closed record with no close date is excluded and counted, never
  interpolated. A metric whose log does not reach back far enough is trimmed at
  its coverage frontier rather than drawn as weeks of imaginary absence.
- **A result must clear its own noise floor.** `designPower` computes, from your
  metric's own week-to-week variation, the smallest level shift a given number of
  pre- and post-intervention weeks could detect — live, inside the dialog, before
  you commit. An effect below that floor is reported as *underpowered*, never as
  "no effect".
- **Placebo tests, with their own resolution stated.** Every other metric measured
  on the same grid is treated in turn (Abadie-style in-space placebo), and fake
  interruption dates are fitted inside the pre-period (in-time placebo). Rank
  tests report their finest attainable p-value and are refused as a gate when
  they could not possibly reject — a check that cannot fail is not a check.
- **Fragility is quantified.** The ledger states how much differential trend,
  sustained across the post-period, would reproduce the entire estimate, and
  calls the result fragile when that number is small enough to be plausible.
- **The ledger scores you, gently.** Direction accuracy, a Brier score over your
  stated confidences, and the median ratio of realised to declared effect size.
  Most leaders discover they overestimate their own impact by a factor of two or
  more; the app shows the number and moves on.

One intervention can be supported on one metric and contradicted on another — the
demo workspace ships exactly that pair, pre-registered before the same date —
which is the situation a single-line dashboard is structurally unable to
represent.

`RULE-IMP-01..06` then carry the result across the workspace in one transaction:
typed `evaluates`/`replicates` links, a 4-option DACI scale/stop decision for a
confirmatory decisive result, blameless mechanism-framed 1:1 talking points when
a people-facing intervention is contradicted, exactly one proposed replication of
a supported study, and calibration and pre-trend findings. See
[ADR-0015](docs/adr/0015-impact-ledger-preegistered-evaluation.md),
[RESEARCH.md](RESEARCH.md) §57 and `tests/app/impact.test.mjs`.

## Influence Network Intelligence — 2026-10-27 (Session 48, additive on Schema v30)

`#/network` is an offline, **surveillance-free Organizational Network Analysis**
terminal. It derives the collaboration graph **entirely from records you already
entered** — cases, DACI decisions, delegations, goals, changes, negotiations,
operational dependencies, war-room games and typed graph links. It never reads
email, chat, calendar, sentiment, or any external data, and it never rates a
person. A structural position is a fact about your recorded work graph, not a
judgment about a colleague.

- **A real graph engine, not adjectives** (`app/core/domain/orgNetwork.js`):
  Newman bipartite co-affiliation projection; Freeman/Brandes degree,
  betweenness & closeness centrality; weighted PageRank influence; Burt
  structural-hole constraint; Watts–Strogatz clustering; Tarjan articulation
  points & bridges; and Latora–Marchiori network efficiency. Every measure is
  computed by name and verified against textbook graphs.
- **A tunable strong-tie backbone:** incidental co-appearance can make a graph
  look fully connected. A tie must be at least N% as strong as the strongest tie
  (Settings / the map tab, default 50%; 0% shows every real tie). This is a
  visualisation threshold over real data — nothing is invented.
- **Structural key-person stress test:** remove any person from the map and see
  exactly how connectivity, clusters and efficiency change — a deterministic
  what-if, fused with the Operational Resilience Bus Factor (verified backup
  stewards). Identify brokers, isolates and single points of connection before
  they become a continuity problem.
- **Five tabs:** a deterministic SVG network map (accessible name + legend +
  a full data table), positions & centrality, brokers & structural holes,
  the key-person stress test, and a follow-through + board pack.
- **Atomic cross-module automation (`RULE-ORG-01..05`):** one "Run
  influence-network follow-through" fans the analysis, in a single store
  transaction, into typed person↔person graph links, a **blameless**
  cross-training delegation, a DACI org-design decision for a fragmented team,
  1:1 check-in talking points for isolates and over-loaded brokers, and
  `ORG-01..05` signals (also on Today and the nav badge). Idempotent, with
  pause semantics and self-cleaning prompts; employee-authored 1:1 topics are
  never modified. Unrelated writes do not trigger it (no alert fatigue).
- **Privacy by construction:** CSV scope #31 exports only dimensionless scores
  and integer counts keyed by an opaque `node_index` — no names, titles or free
  text. Below two active people the network is reported as unmeasurable, not a
  fabricated zero.

Additive on Schema v30: a derived lens needs no new record collection or
migration; two settings (`networkTiePct`, `networkAutoPropagate`) are handled by
normalization. See [ADR-0014](docs/adr/0014-influence-network-intelligence.md)
and [RESEARCH.md](RESEARCH.md) §56. **Honest limits:** centralities describe
recorded structure, not behaviour or performance; co-affiliation is a proxy for
collaboration, not observed communication; no predictive attrition, sentiment
inference or employee ranking.

## Robust Strategy Lab — 2026-10-27 (Session 47)

Open **War Room → Robust strategy lab** (`#/power?tab=stress`). Edit a situation
and supply an optional **payoff uncertainty ±** bound. Blank means unconfigured;
zero explicitly tests the point estimates. No uncertainty is inferred from confidence.

- **Exact continuous-box guarantees:** tests whether the target remains Nash and whether
  one fixed conditional concession works for *every* independently varying payoff.
  Shows the feasible transfer interval and its uncertainty break point.
- **Savage minimax regret vs Wald maximin:** compares pure strategies by worst regret
  and security payoff. Ties stay visible; the app never chooses for you.
- **Single-opposition shocks:** tests each non-opposed stakeholder becoming opposed,
  keeping the electorate and quota fixed. Neutral is persuadable, not committed.
- **Automatic follow-through:** extended `RULE-PWR-02/04` creates one DACI strategy
  decision, typed relationship and owner 1:1 verification prompt on stress vulnerability;
  `PWR-07` surfaces it in insights. Scripts, briefs and derived verdicts use the same
  analysis. Reanalysis is idempotent and the existing automation pause still applies.
- **Honest limits:** comparable transferable utility, independent equal-width bounds,
  pure-strategy regret and weak Nash only. Not money, a probability, a causal forecast,
  or a full robust mixed-strategy equilibrium solver. Decisions are opening snapshots;
  current analysis is in the lab. Nothing is executed or sent externally.

No runtime dependency or network architecture changes. The optional `stressRadius`
field is an additive schema-v30 extension: old records normalize to `null`, and JSON
export/import retains it. Older app versions may discard the new optional field.
The standalone HTML is regenerated with the lab included.

## Coalition & Incentive War Room — 2026-10-27 (Session 46, Schema v30)

`#/power` (and `#/power/:id`) is an offline **computational political-economy engine** — no
language model, no network, no invented numbers. It reasons over the stakeholders, weights and
payoff estimates *you* record and turns them into a confidence-scored verdict, a Nash-equilibrium
read, a mechanism-design recommendation and a tailored influence script — then fans the result
out across the whole workspace atomically. See [RESEARCH.md](RESEARCH.md) §54 for the 2026
competitive benchmark and [ADR-0013](docs/adr/0013-coalition-incentive-war-room.md).

- **Exact cooperative power indices (Banzhaf / Shapley-Shubik).** A weighted voting game over up
  to 8 stakeholders computed by exact 2ⁿ coalition and n! ordering enumeration: normalised
  Banzhaf & Shapley-Shubik power, Riker **minimum winning coalitions**, **Tsebelis veto players**,
  **dummy players** and **dictators**, plus a stance-aware "can allies/neutrals reach quota?"
  feasibility check and a Banzhaf-power **HHI** concentration score.
- **2×2 non-cooperative game (Nash).** Pure & mixed **Nash equilibria**, strictly dominant
  strategies, **Pareto frontier**, social welfare, **price of anarchy** and coordination loss for
  the leader-vs-pivotal-counterparty game, with a hand-drawn SVG payoff-space chart.
- **Mechanism design (incentive compatibility).** The **minimal transfer** that makes your
  target outcome a Nash equilibrium (revelation principle / DSIC framing), with an explicit
  feasibility bound from the leader's own headroom — i.e. the price of aligning incentives.
- **Confidence-scored, not flat.** An **equilibrium robustness margin** (distance to the nearest
  best-response boundary, relative to payoff scale) combined (weaker-of) with your declared
  estimate confidence into a high/medium/low band — a labelled management convention, not a
  statistical interval.
- **Deterministic influence script & board pack.** An SBI/DESC-framed, per-stakeholder rehearsal
  script and a copyable board brief generated from the computed numbers — explicitly labelled as
  template generation, never an LLM, and never reading confidential conflicts or anonymous pulses.
- **Atomic cross-module propagation (`RULE-PWR-01..06`).** One registered or reanalysed game
  creates typed graph links, a derived verdict snapshot, **one** DACI coalition-strategy decision
  (which the Decision Tempo engine classifies in the same transaction), **one** blameless
  incentive-alignment delegation, and **one** estimate-verification 1:1 talking point —
  idempotently, with a one-click pause. `PWR-01..06` signals, a Today triage card, a nav badge,
  CSV scope #30 (no titles or names), point-in-time rewind and clearDemo parity.

Verified this session: `npm run verify:canonical` → **666/666** tests across **46** suites, 0
ESLint errors, 0 canonical-boundary leaks (99 app modules); `npm run verify:standalone` → **7/7**.
`[UNVERIFIED]`: real-browser graphical rendering, spoken screen-reader output, general-sum
N-player solving, and empirical calibration of verdicts against realised outcomes (needs n≥5
settled games).

## Operational Resilience, Dependency & Continuity Terminal — 2026-10-27 (Session 45, Schema v29)

`#/resilience` (and `#/resilience/:id`) brings an offline, zero-telemetry **Enterprise Resilience
Decision System** into LeadOS — connecting human Bus Factor, internal platforms, and multi-tier
suppliers directly to your live Capacity, Delegations, Goals, Negotiations, Cases, and Decision Tempo:

- **Simchi-Levi Continuity Tolerances (`TTS` / `TTR` / `REI`) & Nth-Party Cascades (EU DORA Art. 29).**
  Models **Time-to-Survive (`TTS`)** vs. **Time-to-Recover (`TTR`)** across a cycle-checked multi-tier
  DAG (`service`, `system`, `process`, `vendor`), propagating upstream outages through `none`,
  `warm-standby`, and `dual-active` substitutability modes to surface common-mode and sub-tier
  choke points (`depth ≥ 2`) and per-currency **Risk Exposure Index (`REI ∈ [0, 1]`)**.
- **Avelino Minimal Hitting-Set Bus Factor & Verification Firewall.** Computes exact minimal
  personnel cut-sets across critical/important capabilities while enforcing an epistemic firewall:
  unverified backups (`verifiedOn: null`) and `trainee` shadows remain `inTraining` and never
  inflate Bus Factor until independent operation or a continuity drill is explicitly recorded.
- **Supplier Concentration (`HHI`), Williamson Hold-Up & Conformal Drill Calibration.** Computes
  DOJ/FTC **Herfindahl-Hirschman Index (`HHI`)** per currency without cross-currency summation,
  scores **Williamson (1985) supplier hold-up** leverage ahead of contract renewals, and calibrates
  `realizedTtrDays ÷ estimatedTtrDays` across continuity drills using split-conformal bands
  (suppressed to counts only below `n = 5`).
- **Zero-Write Counterfactual Stress Lab (`#/resilience?tab=stress`).** Simulates simultaneous
  key-person unavailability and multi-tier vendor/platform shocks without mutating workspace state,
  cross-checking surviving backups against `buildCapacityModel` so backups allocated `≥ 90%` in
  Capacity trigger explicit contention warnings.
- **Six Post-Commit Rules Chaining into Decision Tempo (`RULE-RES-01..06` → `RULE-DLY-03`).**
  Registering or updating a critical dependency syncs typed graph links and derived daily exposure
  (`RULE-RES-01`), opens blameless cross-training delegations and focus-protection 1:1 prompts
  (`RULE-RES-02`), opens DACI continuity trade-off decisions that Session 44's `RULE-DLY-03`
  **atomically prices and proposes a Cost-of-Delay / EVSI timebox for in the same write**
  (`RULE-RES-03`), injects hold-up warnings into supplier negotiations (`RULE-RES-04`), shifts
  underpinned goals to `at-risk` and opens remediation cases on breached drills (`RULE-RES-05`),
  and logs delegation completions without fabricating human verification (`RULE-RES-06`). See
  [ADR-0012](docs/adr/0012-operational-resilience-continuity-terminal.md) and
  [RESEARCH.md](RESEARCH.md) §53.

## Decision Tempo & Timing Terminal — 2026-10-26 (Session 44, Schema v28)

LeadOS now prices the decision nobody made. `#/tempo` treats every open decision as a timed
economic position and answers one question per call: **decide now, or is the option to wait
worth its carrying cost?** The economics are named, closed-form and auditable — no model call,
no simulation, no cloud — so the same numbers appear in the served app and the standalone file.

- **Cost of delay, priced from records you already hold.** Reinertsen's four delay profiles
  (linear, fixed-date, expedite, standard) with a weekly rate derived from *value at stake ÷
  erosion window*, capped at the value at stake. The value itself is assembled from typed
  graph links — PERT case exposure, encumbered budget lines, portfolio value, negotiated
  stakes — split by currency and never summed across currencies. Nothing linked means
  *unpriced*, not zero.
- **The option to wait, priced exactly.** Preposterior EVSI (Raiffa–Schlaifer) on the edge
  between your leading option and the runner-up: `EVSI(t) = E[max(0, posterior mean)] −
  max(0, prior mean)`, which is zero today, rises as evidence arrives at a stated half-life,
  and can never exceed the value of perfect information. Add the carrying cost and the
  evidence cost and you get the optimal decision date, the switch probability and a verdict
  — **gather that evidence first**, or **decide now**.
- **Latency that is measured, not assumed.** Decisions now record `decidedOn` — the moment
  the call was actually made. The workspace's own latency band is a split-conformal order
  statistic with its finite-sample coverage bound, suppressed to counts only below five
  measured decisions, and legacy decided records stay unmeasured rather than inferred.
- **A commitment firewall.** Automation proposes a timebox with the derived money and a
  guardrail date; it never arms one and never records the edge or the uncertainty on your
  behalf. One click pauses all automatic tempo writing while the read-side model keeps working.
- **Five rules, one terminal.** `RULE-DLY-01` settles a timebox and measures the latency
  when the call is made; `RULE-DLY-02` turns an overdue call into exactly one owned, blameless
  delegation to the recorded approver; `RULE-DLY-03` proposes one timebox for a priced,
  untimed decision; `RULE-DLY-04` refreshes the derived value when a linked record moves more
  than 20% without touching your recorded inputs; `RULE-DLY-05` opens one DACI tempo-policy
  decision when a *class* of decisions breaches its own measured p80. `DLY-01..06` surface the
  position on Signals and Today, the queue is ranked by CD3, and the board pack is
  deterministic text you can copy or download. See
  [ADR-0011](docs/adr/0011-decision-tempo-terminal.md) and [RESEARCH.md](RESEARCH.md) §52.

## Natural-Language Intake Terminal — 2026-10-26 (Session 43, Schema v27)

A leader can now paste a situation note into `#/intake` instead of opening a form, and an
on-device triage engine produces a confidence-scored routing plan with full evidence. The
engine is a pure, deterministic ES module — no network, no model download, no data leaves the
device, so it works identically in the served app and the double-clickable standalone file.

- **Fourteen-category weighted-evidence triage** with NegEx-style negation windowing,
  softmax temperature scaling and uniform-prior shrinkage so thin input cannot look certain.
  Four uncertainty controls — completeness, top-1/top-2 ambiguity, high-stakes labels and
  explicit negation — route uncertain cases to human review with the triggering reason shown.
- **Entity extraction with provenance** for roster people (first-name ambiguity is flagged,
  never auto-resolved), money in US/EU/Danish formats with a currency-assumption flag,
  durations and person-days, percentages, recurrence and severity markers, each with
  sentence and character offsets.
- **Human-confirmed, never automatic.** The engine prepares a pre-filled case and a live
  propagation preview (DACI decisions, delegations, capacity reserves, coaching,
  stakeholder schedules); the leader edits and confirms through the standard case dialog,
  which runs the existing event-driven rules engine unchanged.
- **Privacy and safety by rule.** Conflict language hits the RULE-INTAKE-04 privacy wall and
  routes the leader to the confidential conflict workspace without creating operational
  records or graph links; safety/legal stakes force the RULE-INTAKE-05 human review.
- **Calibration ledger (RULE-INTAKE-07).** Every confirmation records whether the primary
  label and entities were accepted or edited. The construct is honestly named *human
  agreement* (not accuracy), counts only below n=5, stale drafts surface as RULE-INTAKE-06
  signals, and the `intakeCalibration` CSV export contains no free text. See
  [ADR-0010](docs/adr/0010-on-device-nl-intake-triage.md) and [RESEARCH.md](RESEARCH.md) §51
  for the 2026 competitive hunt and the on-device decision.

## Forecast Integrity Terminal — 2026-10-26 (Session 41, Schema v26)

LeadOS now treats every promise as one typed **prediction atom** and scores the workspace as a
forecasting system, not a collection of unrelated forms. `#/forecasts` unifies decision
probabilities, plan effort, case exposure/diverted-days/mitigation spend, budget commitments
and negotiated value. Probabilities are scored with **Brier (1950)** and **Murphy (1973)**
reliability/resolution/uncertainty decomposition; magnitude forecasts use dimensionless
actual ÷ recorded-forecast ratios segmented by quantity, currency and deal direction. An
**exact two-sided sign test** separates systematic bias from one ugly outlier, and a
**distribution-free conformal band** (Vovk et al., 2005; Angelopoulos & Bates, 2021) produces
an 80% outside-view range with an explicit finite-sample coverage bound — counts-only below
n=5, marginal coverage only, exchangeability stated rather than assumed silently.

The loop is automated. A new generalized post-commit rules hook
([ADR-0008](docs/adr/0008-post-commit-rules-hook.md)) runs pure domain rules inside the
store's atomic transaction. `RULE-FCI-01` turns a settled outcome into idempotent
outside-view challenges for open forecasts in the same class **and**, where the pooled
evidence is biased, low-confidence challenges in other modules; `RULE-FCI-02` opens exactly
one DACI re-baseline decision per challenged class; `RULE-FCI-03` opens one blameless
measurement-recovery delegation when three settled records lack actuals; `RULE-FCI-04`
feeds `FI-01..05` signals, Today triage, a nav badge and a deterministic board-ready brief.
Every challenge is a separate reviewable record with accept/adapt/dismiss and written
rationale — **no recorded forecast is ever rewritten**.

Verified example: recording the fifth 1.5× budget actual creates one class-specific challenge
on an open budget commitment and one low-confidence mixed-quantity challenge on an open
portfolio estimate, two DACI decisions, typed `forecasts`/`decides` graph links and audit
events in the same transaction; a second scan writes nothing. Ships with an additive
v25→v26 migration, normalizer repair, `clearDemo`/point-in-time rewind parity, a 29-column
formula-safe `forecasts` CSV scope (#26), five-tab terminal UI, JSDOM/axe coverage of every
tab and the response dialog, and 22 new tests. See [RESEARCH.md](RESEARCH.md) §49 for the
2026 AI-forecasting, decision-intelligence and people-analytics hunt, academic sources and
rejected shortcuts.

## Stakeholder Influence Register — 2026-10-26 (Session 40, Schema v25)

LeadOS now keeps one persistent political map across every case, change and negotiation
(`#/stakeholders`). The lightweight embedded stakeholder stubs those modules already carry
are reconciled into a first-class register under **strict matching** — exact normalized
name or internal person link; a near-miss is counted as an unmapped hygiene gap, never
guessed into a relationship. Each record is analyzed through four named lenses that update
live as you edit: **Mendelow (1981)** power × interest quadrants in a 5×5 matrix with
cadence guidance, **Mitchell-Agle-Wood (1997)** all seven salience classes with an
evidence-confidence-adjusted score (×1.0/×0.85/×0.7), **Tsebelis (1995, 2002)** veto-player
change-difficulty bands (stance-distance × power, ≤25 points per gate, +5/+8 cohesion
penalties, feasible/contested/blocked bands, honestly labelled a heuristic, not a spatial
model), and a union-find **coalition network** — bloc leaning from power-weighted stance
centroids, directional opposition/influence edges, centrality and hidden influencers.

Political signals now propagate like everything else: an adverse veto gate on an open
initiative opens **exactly one** DACI alignment decision in the same transaction
(`RULE-STK-02`); an adverse stance shift on an internal high-salience stakeholder queues a
blameless, idempotent 1:1 talking point (`RULE-STK-03`); reconciliation maintains typed
`involves` edges (`RULE-STK-01`); and a write-free cadence watch surfaces contact decay,
urgency-without-plan and low-confidence veto assessments (`RULE-STK-04`, signals
`STK-01..07`). The register dialog shows a dry-run propagation preview before you save and
respects an `autoPropagate` pause. Stances, veto bases and influence notes are
contextual-integrity governed — redaction neutralizes them in CSV/JSON exports with a
scrub count, its CSV scope (#25) runs to 32 formula-safe columns, the v24→v25 migration is
purely additive (no invented actors), and point-in-time rewind rewinds stance/contact
history with an explicit approximate-fidelity note. A 12-record demo reconciles at 100%
coverage and stays automation-silent by design. See [RESEARCH.md](RESEARCH.md) §48 for
the academic sources, 2026 SRM competitive audit and rejected shortcuts.

## Budget & financial commitments — 2026-10-26 (Session 39)

LeadOS now has a finance leg (Schema v24). A **budget envelope** is an approved ceiling in one
currency for one period; its commitment lines follow commitment (encumbrance) accounting —
`planned` → `committed` (budget authority reserved) → `spent` (actual you recorded) or
`released` (authority returned). The headline number is **forecast at completion**: recorded
actuals + open commitments, compared with the ceiling while you can still act. Planned lines
are separate pipeline exposure; a missing actual or an unpriced commitment labels the forecast
*understated* instead of silently counting as zero, and an actual is never pre-filled from the
committed figure. A ceiling is a limit, never a spend target: underspend is not scored as
failure, and the period-end signal says so (Liebman & Mahoney, 2017, on use-it-or-lose-it
surges).

Money now propagates like everything else in the OS. A forecast breach opens **exactly one
DACI trade-off decision** (`RULE-FIN-01`); a line that funds a case, negotiation, portfolio
item, requisition, goal, decision or change creates a typed `funds` graph link, and when that
record completes the encumbrance is marked *actuals due* in the same transaction
(`RULE-FIN-02`); recording a real actual feeds a **fifth calibration ledger** that scores
actual-vs-committed honestly — counts only below n=5, ratios pooled across currencies without
FX, and a calibrated forecast shown *beside*, never instead of, the recorded one
(`RULE-FIN-03`). Signals `FIN-01..05`, a Today card, `#/finance` routes, a `finance` CSV
export scope (#24) and a Settings watch-% convention complete the loop. Conflict cases and
anonymous pulse surveys can never be funding sources. Amounts remain leader-entered evidence —
nothing here reconciles to invoices or a general ledger. See [RESEARCH.md](RESEARCH.md) §47
for sources, boundaries and rejected shortcuts.

## Negotiated-value settlement calibration — 2026-10-26 (Session 38)

The negotiation settlement ledger now closes the fourth forecast-calibration loop without
confusing a signed amount with value actually realised. `negotiationSettlementCalibration`
pairs only agreed records with a positive explicit signed deal value and an explicit realised
value; it segments by currency and issue direction, never converts FX, and keeps other settled
records in a named actuals follow-up list. Cohorts show **counts only below n=5**; at n≥5 a
median shortfall of 20% or more is a **review guardrail**, not evidence of causality or an
individual negotiation/employee score.

`RULE-NEG-07` runs beside existing `RULE-NEG-06` in the `recordNegotiationSettlement`
transaction and records an idempotent derived-calibration propagation. `NEG-09` routes a
qualifying cohort to `#/decisions`; `#/negotiations/:id` shows prior comparable settlements
for preparation while excluding the current agreement from its own reference class and never
changing the current BATNA, target or forecast. The `calibration` CSV now includes settlement
pairs, count-only cohort rows and missing-actual follow-up rows. No schema migration, FX
conversion, inferred value, automatic forecast adjustment or backend was added.

Research triangulated Flyvbjerg's outside-view method, Perold's implementation-shortfall
lens and Deming's PDCA with product patterns from Oracle's plan/actual/forecast workflow,
Coupa's sourcing-to-invoice/value-realisation story, and Suplari's published advice to agree
a baseline before negotiation and validate at invoice/ledger level. These vendor materials are
pattern references, **not independent proof** of efficacy. LeadOS does not claim savings or
invoice verification from manager-entered values. See [RESEARCH.md](RESEARCH.md) §46 for
sources, comparison limits, and rejected shortcuts.

**Verification:** the focused calibration + negotiation suites pass **40/40** tests. Full
`npm run verify:canonical` passes **485/485 tests across 38 suites**, with 0 lint errors,
0 canonical-boundary leaks and **89/89** internal Markdown links resolving. Real-browser
rendering, spoken screen-reader output, source-system validation of financial actuals and
field comprehension remain **[UNVERIFIED]**.

## Returned-commitment recovery & ex-post agreement settlement governance — 2026-10-26 (Session 37)

- **Returned-commitment recovery & immutable lineage (`RULE-NEG-05`)**: When a delegated commitment returns
  to the leader (`status: 'returned'`), the leader can now explicitly recover and re-delegate it from either
  `#/delegations` (*Re-delegate / recover*) or `#/negotiations/:id` (*Recover term*) via
  `redelegateReturnedOutcome` / `recoverNegotiationTerm`. Grounded in **Oncken & Wass (1974)** monkey-management
  control, **Grove (1983)** task-relevant maturity, and **Hollnagel (2014)** closed-loop safety recovery, the
  original returned delegation remains immutable in history (`status: 'returned'`, `returnedOn`, `returnReason`,
  `supersededByDelegationId`, `recoveredOn`) while a successor active delegation is created with
  `priorDelegationId` and a required `recoveryNote` countermeasure. Cycle-safe schema repair
  (`repairDelegationRecoveryChains`) and lineage derivation (`deriveDelegationLineage`) track attempt count and
  prior owners across reloads. `RULE-NEG-05` atomically updates `term.ownerId`, `term.dueOn`, and
  `term.priorOwners`, carries forward `tracks-followup` and `mitigates` graph links, queues a blameless 1:1
  handover talking point on the new owner naming the prior return reason and countermeasure, and clears
  `NEG-07` once an active recovery delegation is in flight.
- **Ex-post agreement settlement & BATNA-breach governance (`RULE-NEG-06`, `NEG-08`)**: Grounded in
  **Williamson (1985)** *Transaction Cost Economics*, **Hart & Moore (1988)** *Incomplete Contracts*,
  **Perold (1988)** *Implementation Shortfall*, and **Raiffa (1982)** BATNA walk-away regret, agreed
  negotiations can now record explicit post-agreement settlement actuals (`recordNegotiationSettlement`:
  `settledOn`, `realisedValue`, `counterpartyDelivered`, `note`, and quantitative per-term `settledValue`),
  never pre-filled or fabricated from signed estimates. `evaluateNegotiationSettlement` computes direction-aware
  implementation shortfall and unit-honest walk-away BATNA breach (`sameUnitDealBatna`). `RULE-NEG-06` cascades
  settlement telemetry to linked goal check-ins and opens a linked DACI settlement review decision when the
  realised outcome breaches the walk-away BATNA, suffers counterparty non-delivery, or experiences material
  implementation shortfall; `NEG-08` surfaces both completed high-stakes agreements awaiting settlement and
  adverse settled outcomes requiring governance action.
- **Store, Rewind & Test Determinism Hardening**: `store.clearDemo()` now scrubs dangling demo references on
  retained user `negotiations`; `reconstructStateAt()` rewinds `negotiations` (including post-cutoff agreements
  and settlements) and delegation recovery lineage as of `asOfDay`; `scale.test.mjs` exercises `delegations`,
  `negotiations`, and `changes` at scale; and `case-calibration.test.mjs` / `calibration.test.mjs` use
  deterministic `app.navigate(...)` + `app.destroy?.()` teardown.
- **Verification this session**: `npm run verify:canonical` passes **483/483 tests across 38 suites (`0 fail`)**,
  `0` ESLint errors, `0` boundary leaks, and `88/88` internal markdown links. Graphical browser rendering of
  the Session 35–37 Negotiation Workbench views, spoken screen-reader output, and field comprehension remain
  **[UNVERIFIED]**.

## Agreement delivery feedback — 2026-10-26 (Session 36)

The Negotiation Workbench shows each current term as **In progress, Delivered,
Returned — needs recovery, or Untracked — gap**, with a link to delegations.
`RULE-NEG-04` feeds completed/returned negotiated delegations back into agreement history
and neutral linked-goal check-ins in the same safe-write transaction. `NEG-07` surfaces
returned commitments for recovery. Neither completion nor agreement fabricates financial
actuals, goal progress, confidence changes or decision outcomes. Source negotiation/term
IDs survive normalization.

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. Per
**[ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md)**, they are quarantined as a frozen
historical archive in place, **not rebuilt or deleted**, and enforced via `npm run check:boundary`
so zero canonical `app/**` modules can ever import from them.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 94 native JavaScript modules, CSS and shell; Schema v28; tested below. |
| `scripts/serve.mjs`, `scripts/check-canonical-boundary.mjs`, `scripts/check-docs-links.mjs` | Dependency-free static server + canonical boundary and documentation link gates. |
| `tests/app/**` | Canonical automated suite (`565` tests across `42` suites), run by `npm test` / `npm run verify:canonical`. |
| `scripts/app-browser-smoke.mjs`, `scripts/app-onboarding-smoke.mjs`, `scripts/app-manager-support-smoke.mjs` | Optional real-Chromium lifecycle/mobile/accessibility checks; Session 29 also ran a full Chromium `143.0.7499.0` WCAG 2.1 AA + `1440px`/`390px`/`320px` reflow audit across 11 routes and 4 modals ([validation report](docs/VALIDATION-2026-10-25-session-29.md)). |
| `public/index.html` | Quarantined older synthetic-data console (ADR-0007), not the product; runtime status **[UNVERIFIED]**. |
| `src/**`, root React files, `drizzle/`, `openapi.yaml` | Quarantined frozen historical archive (ADR-0007); current builds, security and workflows **[UNVERIFIED]**. |
| `deprecated/vite-index.html` | Quarantined old Vite entry (ADR-0007). |

**Correction to earlier documentation:** `src/db/` exists. It contains a PostgreSQL/Drizzle
client, schema and repositories; `src/app/page.tsx` is a PostgreSQL starter page. Claims that
the data layer is absent were wrong. The starting checkout contained 3,650 tracked files,
3,495 source files and 316,352 source lines. All source was scanned for inventory/imports;
that is **not** personal line-by-line verification of the whole legacy tree. Historical
TypeScript error counts were not rerun. See the latest focused
[capacity, flow & portfolio allocation audit](docs/AUDIT-2026-10-25-session-24.md),
the [cross-domain operational cases & automation audit](docs/AUDIT-2026-10-25-session-23.md),
the [inline error accessibility audit](docs/AUDIT-2026-10-25-session-22.md), the previous
[browser validation audit](docs/AUDIT-2026-10-25-session-21.md), the earlier
[architecture inventory](docs/AUDIT-2026-10-25-session-17.md), and the corrected
[architecture decision](docs/adr/0006-canonical-zero-build-app.md).

## What it actually does

### Conversations and feedback

- Log a 1:1 as held, moved or skipped; compute cadence, cancellation streaks and adherence
  from real dates. Generate editable agenda suggestions with a reason for each item, pre-check
  the top items inside the *Log a 1:1* dialog so you can check/uncheck what was actually
  covered, and automatically exclude retired or dropped GROW commitments.
- Build a **printable, shareable one-meeting prep sheet** (`#/prep/<personId>`): the topics the
  person has asked to raise, the generated agenda with reasons, every open commitment grouped
  by source (past-1:1 actions, 30-60-90 onboarding / transition / re-boarding checkpoints,
  feedback follow-ups, development actions, delegation checkpoints), what happened since you
  last spoke, outcomes at risk, and a notes area. Check or uncheck employee topics and agenda
  suggestions directly on the prep sheet and click **Log the 1:1** to carry your exact selection
  into *Log a 1:1* with true agenda provenance (`their-topic`, `delegation`, `onboarding`, etc.) —
  clearing covered employee topics only when a `held` 1:1 is saved while keeping uncovered ones
  queued for next time. Confidential conflict records and anonymous pulse answers are excluded by
  construction and named on the sheet. **Today and the 1:1 due queue now offer `Prepare` as the
  primary action**, opening this sheet directly; the shorter `Log` path remains explicit for
  leaders who need it, and first meetings land on the same preparation journey.
- Execute **30-60-90 check-ins from Today**: overdue and next-seven-day phase conversations
  across onboarding, internal transitions and return-to-work plans, ordered by due date.
  Today shows the four oldest conversations and an explicit link to the full **Check-ins due**
  queue (`#/onboarding?status=checkins`). Log the two-way conversation in place; cancelling
  changes nothing, saving removes only that phase from the queue, and checkpoints/other phases
  remain untouched. **Open plan** follows the exact plan (`?plan=<id>`), including a completed
  plan rather than silently substituting a newer plan for the same person. The seven-day
  look-ahead is a fixed interface convention, not a validated deadline or a notification service.
- After a Day 30/60/90 conversation is actually recorded, add an **explicit, dated manager-owned
  follow-up** for the concrete action you will take. The task keeps the exact check-in ID, plan,
  phase and date; it is separate from candid blockers, never copied into performance-review
  evidence, and never housed in a synthetic 1:1. The shared 1:1 commitment board shows it as
  yours to do, and a later real held 1:1 can mark it done, carry it forward with a date, or drop
  it. The source phase/date survives carries and is included in the commitments CSV.
- Run structured **30-60-90 onboarding, role-transition & return-to-work ("re-boarding")
  scaffolding** (`#/onboarding`, `Schema v14`): written role clarity, peer buddy assignment,
  stakeholder introduction tracking (`met`/`metOn`), a scoped early win, editable checkpoints
  across Day 30 / Day 60 / Day 90 horizons, and dated two-way phase check-in conversations. New
  joiners get the onboarding template; a tenured person promoted or moved into a new scope gets
  a labelled **role-transition** plan (old-role handover inventory, written scope/authority
  delta, first early win in the new seat, 60-day old-habits calibration); and a person returning
  from extended leave gets a **return-to-work (`reboarding`)** plan (what changed while away,
  agreed 4-week load pacing, peer catch-up buddy, key re-connections) with explicit guidance
  never to record medical or personal leave reasons. Transition and return-to-work plans anchor
  to day one of the new phase — `person.startDate`, `person.role` and tenure are never
  rewritten. Missing scaffolding is flagged on the manager (`ONB-02`…`ONB-05`), never as a
  personality or performance grade on the person, and 30-60-90 check-ins are kept out of
  performance review packets so people in a new phase can raise confusion safely.
- **Reconcile the onboarding against every reporting line, not just the one that opened the plan** (`#/onboarding?panel=matrix` and `#/onboarding?panel=clarity`, Schema v125–v128): in a matrix, one person can sit on two lines with two managers who never compared notes. The matrix lens asks every line in force to write a dated, first-person brief of what it expects — or an explicit decline with a stated reason — and the person acknowledges the exact text (`RULE-ONB-01`). The role-clarity lens compares what the lines *defined* the job as (a closed accountability-domain lexicon, a closed decision-right scale and a closed criteria standing, declared by each line when it writes its brief — never inferred from prose) and names `contested` definitions — a two-step decision-right or criteria spread — before anyone is graded against them. Findings are always on a line or a domain, never a rating of the person, and the export (CSV #115) carries no identity.
- **Record who owes each promise, and see your own debts** (`Schema v8`): every 1:1 action
  carries an owner — *they* do it, *you* do it, or *both* of you — or is explicitly left
  unrecorded, which the board counts rather than guessing. Promises you own appear in a private
  **"What you owe"** card on Today, in an "I owe" stat and an inline owner column on the 1:1
  board, and in `CONV-07` once one is overdue. A promise that is carried forward keeps its owner;
  reassigning one is a separate, logged action, and closed promises cannot be rewritten.
- **Reconcile last time's promises when you log the next 1:1** (`Schema v7`): every open
  commitment appears with how long it has been alive and how often it has moved, and the leader
  records an explicit outcome — done in this conversation, still open, carried forward with a new
  date, or dropped with a reason. Nothing is carried automatically, the original keeps a link to
  its successor, and a broken or cyclic chain is repaired by reopening the promise rather than
  losing it. Carried promises show on the 1:1 board, the person page, the prep sheet, the CSV
  export and signal `CONV-06` once the same promise has survived two conversations.
- Capture owned, dated meeting actions; overdue commitments surface on Today.
- Record Situation → Behaviour → Impact feedback with a live, non-blocking specificity coach.
  Track praise/constructive balance and follow-up dates without imposing a target ratio.
- Store observation and conversation dates separately. Unknown observation dates stay
  unmeasured, not zero-day feedback; date corrections preserve the original note.

### Goals, delegation, development and succession

- Goals have key results, computed progress, confidence and dated check-ins. A goal with no
  measurable results is unmeasured, not 0%. Authorship is co-authored, explicitly leader-set
  or unknown; unknown does not trigger the leader-set warning.
- Delegate an outcome with one accountable owner, expected result, resources/support, dates
  and explicit decision authority: recommend, agree first, act-and-inform or own.
- Check in, record blocks, complete with the delivered result, or explicitly accept the work
  back with a reason and next step. Closed delegations retain their history. Stretch delegations
  hand off in one click (**Add to GROW** / **Start GROW plan**, `Schema v12`) into an explicitly
  linked GROW commitment (`delegationId`) that survives carry-forwards, links bidirectionally
  across `#/delegations`, `#/growth`, `#/people/<id>`, CSV exports and `Hold review`, and prompts
  explicit coaching reflection when the delegation completes or returns — never silently closing
  the GROW commitment on your behalf.
- Today now shows an executable **delegation follow-through** queue for blocked work, overdue
  outcomes, missing due dates and stale check-ins. Record a check-in or explicitly complete the
  outcome directly from the queue; the existing validated dialogs/events are reused, and marking
  work on track does not complete it. The full queue opens `#/delegations?filter=attention`.
  Items are ordered for leader support, not to score or rank the owner; the configured check-in
  cadence is a team convention, and no reminder is sent.
- GROW plans separate Goal, Reality, Options and Will. A plan without a dated commitment is
  reported as incomplete, not treated as progress. Show competency coverage across the team.
- **Development commitments follow the same ledger as 1:1 promises** (`Schema v9`): each one can be
  closed in a recorded review, **carried forward** with a new date — the original stays in the plan
  history and "carried 2× since 14 Sep" is derived from the chain, never stored as a counter — or
  **dropped with a mandatory reason**. Dropped is never counted as done, and a dropped or carried
  version leaves the completion denominator, so moving a date cannot look like progress.
- **A review is a record, not a date edit.** *Hold review* captures when it happened, what was
  discussed, the outcome for every live commitment and the next date you agreed — and Today's
  **Development reviews** queue (`#/today`) surfaces overdue, due-within-7-days and unscheduled
  GROW reviews with an inline *Hold review* button so you can settle commitments without hunting
  through another screen. Pushing the review date without holding one increments a deferral
  counter instead of silently rescheduling: `GROW-07` fires at two deferrals, and `GROW-06`
  fires when one commitment has been carried twice. A closed or moved commitment is kept in an
  expandable record with its dates and reason.
- Succession readiness challenges unsupported claims using recorded development, feedback and
  conversation evidence (`#/readiness`), stores optional development-gap & stretch notes per
  seat, and wires a one-click **Start transition** handoff (from `#/readiness` or `#/people/<id>`)
  directly into a pre-filled `role-transition` 30-60-90 plan showing the candidate's readiness
  status and notes as context — without fabricating `roleClarity` or overwriting roster titles.

### Performance reviews

- Assemble an evidence packet for a person and inclusive period: dated 1:1s, feedback,
  goal check-ins, development, recognition and delegation outcomes with source links.
- Keep four self-reflection prompts separate from three manager-assessment prompts and an
  optional behaviour-anchored rating. Reflection is manager-entered, not independently
  submitted by an employee account.
- Seven calibration checks challenge thin, recent-only, one-sided or unsupported assessments.
  These are transparent prompts, not proof of fairness or an automated performance score.
- Completion recaptures and freezes evidence; reopening and refreshing are separate audited
  actions. Current goal/development/delegation values are labelled **at capture**, not falsely
  reconstructed at period end. Browser print/save-PDF is wired; visual print output remains
  **[UNVERIFIED]** in this session.
- A completed packet offers an explicit choice to open a goal or GROW form. The review's
  development focus is editable draft text; a goal still needs a measurable key result, and a
  GROW plan still needs a newly written Will commitment. Review next steps are shown as a
  discussion prompt, never copied into commitments. Each created record retains a validated
  `sourceReviewId`, links back to the packet in the UI and CSV, and remains blank on legacy records
  (`Schema v13`). Completing a review creates nothing by itself.

### Conflict resolution — a working record, not an HR case system

- Start with a neutral situation, coordinator and follow-up date; hear 2–8 participants'
  perspectives and underlying interests, including people outside your roster.
- Participation is unknown, willing or declined. Unknown is never consent. Informal
  agreement requires an explicitly appropriate route, everyone willing/heard, and recorded
  process and information-sharing limits.
- Record an explicitly confirmed agreement and 1–12 owned, observable, dated commitments.
  Keep agreement versions and the context captured with each one.
- Record real results, then an all-party follow-up that checks those results. An agreement
  is **not** resolution; an earlier same-day check cannot verify results recorded later.
- Close only when current-context commitments and verification support it. Reopening keeps
  history and requires a fresh check; materially changed context requires a new agreement.
- For serious/uncertain matters, record the qualified support contact and next check date.
  **A support handoff sends nothing and is not resolution.** The manager must contact the
  appropriate person; the app is not a mediator, investigation or emergency service.
- Private case content is excluded from generated 1:1 agendas, person timelines, readiness,
  health scoring and performance-review evidence. General reminders use counts/status only.
  This is exposure minimisation, **not access control**: full JSON backups include the notes.

### Team pulse

- Four dimensions: psychological safety, clarity, sustainable workload and growth.
- Default reporting floor is **5 complete responses**; supported settings are 3–25.
  Aggregate, dimension means and weekly trend use the **same complete four-answer cohort**.
  Partial responses cannot supply a misleading privacy floor or distort released means.
- Suppress the entire vector when any dimension, or each response's overall mean, is
  identical across the cohort. Otherwise overall/other means could reveal a suppressed
  dimension by subtraction. Future responses are excluded from current windows.
- Comments need their **own** minimum number of nonempty, varied comments. Score-response
  count alone does not release a lone comment. Suppressed comparisons stay null, not zero.
- Anonymous records store `personId: null`; imports strip an identity value. The local app
  cannot verify independent respondents or guarantee anonymity against a determined observer.
  Writing style and someone with access to the browser/export can still identify people.

### Decisions, recognition and next steps

- DACI decisions capture roles, reversibility, options and rationale, support audited edits when
  governance metadata changes (`DEC-03`), deep-link directly from `DEC-01`/`DEC-03` signals via
  `#/decisions?decision=<id>`, surface token-matched DACI involvement on `#/people/<id>`, and
  feed Today's actionable **Decision reviews** queue (`#/today`) with inline *Review outcome*
  settlement (guarding undecided choices out of `reviewsDue` and rewinding post-snapshot reviews
  in historical trends).
- Recognition records real contributions; drought prompts use logged dates.
- **46 deterministic signal rules**, including `ONB-01`…`ONB-05`, `CFL-01`…`CFL-04`, `GROW-06` and
  `GROW-07`, produce
  evidence, urgency and one next action. Similar person findings roll up rather than flooding the
  page. Conflict reminders never include case titles, names or notes and work without a roster.
- Optional demo data is clearly labelled. The demo refuses to replace real records without
  confirmation, including workspaces containing only delegations or conflict records.

### Optional passphrase encryption of the browser copy

- Turn it on in **Settings → Protect this browser copy**. The stored blob becomes a versioned
  envelope: PBKDF2-HMAC-SHA-256 (600,000 rounds, random 16-byte salt) derives an AES-256-GCM
  key from your passphrase; every write gets a fresh 96-bit IV. The passphrase is never stored,
  and the key never leaves the tab.
- **Plaintext → encrypted is verified before it overwrites anything:** derive, encrypt,
  decrypt, compare, then write. If any step fails the workspace stays plain text and says so.
- A reload shows a **lock screen** and nothing else: no navigation, no records, no half-loaded
  state. A failed attempt reports the failure and leaves the stored ciphertext byte-identical.
- While locked, **every write path is refused** — including imports, demo loading, reset and CSV
  export — so nothing can replace the only copy of the ciphertext. `Export JSON` in that state
  hands back the untouched encrypted file rather than an empty workspace.
- **Change passphrase** re-keys with a new salt (the old passphrase stops working), **Lock now**
  discards the key after flushing pending writes, and **Turn off encryption** writes plain text
  again only after the write succeeds.
- **Idle auto-lock:** an unlocked, encrypted workspace locks itself after a configurable window of
  inactivity (default 30 minutes, 0 = off, set in Settings). It warns first with a non-destructive
  "keep working or lock now?" prompt and locks automatically after one minute, so an unattended
  unlocked tab cannot leave your notes readable. The lock is recorded in the event log.
- **Encrypted backups:** `Export encrypted JSON` produces a portable envelope for the same
  passphrase (or a new one if the workspace is not encrypted). `Import JSON` accepts both
  plain-text and encrypted files; an encrypted import into a plain workspace is explicitly
  disclosed as a downgrade, and restoring an encrypted backup into a lock screen keeps the
  workspace encrypted.
- **Limits stated in the UI, not only here:** no recovery key, no reset link, no account; a lost
  passphrase means the encrypted copy cannot be opened. Encryption protects a copied profile or
  backup file, not a browser someone can already use while the workspace is unlocked. CSV and
  plain-text JSON exports remain unencrypted. Web Crypto requires a secure context — over plain
  HTTP on a LAN address the lock screen says so before you type a passphrase.
- Envelope headers (KDF name, rounds, salt, purpose) are bound into the GCM additional
  authenticated data, so tampering with them fails authentication instead of silently weakening
  the file; a foreign envelope asking for more than 2,000,000 rounds is refused rather than
  burning the CPU.

### Cross-domain operational cases & parallel rules automation (`#/cases`, `Schema v22`)

- Register an **Operational Case** (`incident`, `risk`, `escalation`, or `initiative`) on `#/cases`
  or escalate directly from an active **Goal**, **Delegation**, or **Decision**.
- Model each case across seven connected disciplines:
  - **Engineering FMEA (`computeFmea`):** Severity × Probability × Detection RPN (`1..1000`),
    **AIAG-VDA (2019) Action Priority** (elevating Severity 9–10 failure modes even when RPN is
    modest), and post-mitigation residual RPN reduction %.
  - **Math/Statistics & Finance (`computePertImpact`):** Three-point Beta-PERT financial cost and
    diverted team-capacity days ($\mu = \frac{O + 4M + P}{6}$, $\sigma = \frac{P - O}{6}$,
    $P_{10}..P_{90}$), expected unmitigated vs residual loss, net risk-adjusted value, mitigation
    ROI multiple, and explicit opportunity cost.
  - **Production / Safety Science (`evaluateRca`):** Structured **Toyota 5-Whys** causal chain,
    **Reason Swiss-Cheese** missing systemic barrier, preventive action, and an automatic warning
    when text blames an individual without naming a process guardrail.
  - **Political Science (`summarizeStakeholderCoalition`):** **Mendelow Power × Interest**
    stakeholder matrix (*Manage closely*, *Keep satisfied*, *Keep informed*, *Monitor*), stance
    tracking (`champion` → `blocker`), and scheduled briefing checkpoints.
- **Event-driven parallel cross-module propagation (`app/core/domain/automation.js`):** saving or
  updating a case (previewed live inside the dialog before saving) evaluates deterministic,
  idempotent rules inside a single atomic store transaction to simultaneously:
  1. Schedule stakeholder coalition cadences (`RULE-STAKE-01`),
  2. Create & link a PERT-backed **DACI Decision** (`RULE-DEC-01`),
  3. Create & link an accountable **Mitigation Delegation** with calibrated authority (`RULE-DEL-01`),
  4. Append a risk check-in & adjust confidence on the impacted **Goal** (`RULE-GOAL-01`), and
  5. Queue blameless support & barrier talking points into **1:1 agendas & printable prep sheets**
     (`RULE-COACH-01`) — strictly excluded from performance-review rating evidence and isolated
     from confidential `conflicts` and anonymous `pulses`.
- **Closed-loop feedback:** completing linked mitigation delegations automatically transitions an
  open/mitigating case to **Monitoring** (`RULE-SYNC-DEL-01`), and resolving the case records
  residual FMEA verification while appending a resolution check-in on the linked goal. `RULE-COACH-02`
  also turns only that case's tagged 1:1 support topic into a blameless systemic-learning prompt;
  reopening restores active support. Employee-raised topics are preserved, and neither prompt enters
  performance-review evidence.

### Capacity, flow & portfolio allocation (`#/capacity`, `Schema v16`)

The operating-plan layer. Goals, delegations, cases and 30-60-90 plans record *intent*; this is
the only screen that answers "given the people I actually have, what can we commit to, what has
to give, and how confident should I be in that date?" It applies four disciplines to the same
records:

- **Operations research — capacity supply.** Focused hours per person ÷ an 8-hour day × the
  planning horizon, reduced by an explicit **transition ramp** (active 30-60-90 plan: 0.45 in the
  first month, 0.75 while ramping, 0.8 in a role transition, 0.7 on return-to-work) and by a
  configurable **operational reserve** (default 20%) for interrupts and support. Headcount is
  never used as capacity.
- **Queueing theory — what utilisation actually costs.** **Little's Law** (WIP = throughput ×
  cycle time; Little, 1961) and **Kingman's diffusion approximation** give a queue-delay
  multiplier from utilisation, so 86% committed is shown as *≈7× service time spent waiting*
  rather than as a reassuring percentage. Throughput is measured from delivered items only, and
  the app refuses to state a rate from a single completion.
- **Economics & finance — allocation under scarcity.** Each item carries a three-point
  **Beta-PERT** effort and value estimate; ranking uses **value density** (expected value ÷
  expected person-days), the funding boundary is marginal (the next item that fits, and the first
  one that does not), and an over-committed plan names the **lowest-value committed work to
  release first** instead of the newest or least popular.
- **Statistics — a date range, not a promise.** Independent PERT variances are additive, so the
  funded portfolio produces **P50/P80/P90** completion dates and **cumulative** target-date risk
  (each target is judged against all work due by then, not against that item alone).

**Parallel cross-module automation (Schema v16):**

1. **`RULE-CAP-01` — capacity reserve registration.** Registering a case with a capacity estimate
   creates a committed reserve entry in the plan (dated from the case, linked `consumes-capacity`);
   editing the estimate updates that same record in place; resolving the case **releases** the
   capacity; reopening it reinstates the reserve. No second data entry, no duplicate.
2. **`RULE-CAP-02` — over-allocation trade-off decision.** When committed work exceeds allocatable
   capacity, exactly one **DACI decision** is opened (never more than one while it is unanswered)
   containing the real numbers and concrete options: defer the lowest-value item, cut the next
   one, accept the queue delay, or stop starting unfunded work.
3. **`RULE-CAP-03` — funding decision → goal impact.** Deferring or cutting goal-backed work
   writes an explainable check-in on that goal and, if it was on track, moves it to at risk;
   re-funding writes the follow-up. A capacity decision can never be silently detached from the
   objective it starves.
4. **`RULE-CAP-04` — delegation completion → portfolio delivery.** When a plan item is explicitly
   linked to an active delegation, recording its verified completion marks that item delivered on
   the same date, keeps the typed graph edge, writes an automation audit event and removes its work
   from committed capacity. Returned delegations do not trigger this rule; the engine does not
   mistake reassignment for delivery. A closed delegation cannot be used to create new open plan
   demand. **Sync rules** also repairs existing completed-delegation links from older workspace
   state; it is safe and idempotent to run again.
5. **`RULE-CAP-06` — settled case capacity calibration → portfolio.** After at least five cases
   have recorded actual diverted days and the median actual/forecast ratio is at least 1.25×,
   settling or backfilling a case automatically refreshes every open case reserve in the same
   transaction. Normal-priority cases use the observed median; high-priority cases use the
   observed P80. The reserve (not the case estimate) receives the contingency, then capacity
   trade-off and seeded Monte Carlo tail-risk rules re-run. The live case dialog previews the
   adjustment and sample size. The frozen opening estimate is unchanged for honest later scoring;
   below n=5 or below the 25% threshold there is no automatic uplift. This is a local reference
   class, not a validated universal coefficient or external benchmark.

Signals `CAP-01`–`CAP-05` report utilisation, queue delay/WIP breaches, undecided demand, missing
effort estimates and unachievable target dates. A **`portfolio`** CSV scope (19 total, with `hiring`) exports the
whole ledger with derived PERT values and value density, formula-injection safe.

### Selection & hiring (`#/hiring`, `Schema v17`)

Hiring is the highest-leverage decision most managers make and the one they get the least training
for, so LeadOS models it as a measurement problem with a decision at the end rather than a pipeline
with a score. A **requisition** records what the role must be able to do, who will interview, and
(optionally) the interview effort it will consume. A **candidate** record holds the evidence
collected and the decision — and nothing about protected characteristics.

- **Industrial/organisational psychology — the method determines the weight.** Each observation is
  tagged with the method used, and methods carry the validity coefficients from **Sackett, Zhang,
  Berry & Lievens (2022)**, the re-analysis that corrected decades of range-restriction
  overcorrection: structured interviews `.42`, job-knowledge tests `.40`, work samples `.33`,
  cognitive ability `.31`, unstructured conversations `.19`, years of experience `.07`. (Schmidt &
  Hunter's 1998 table is the better-known predecessor and is higher on every method — work samples
  were `.54` and ranked first; the 2022 revision puts structured interviews first. Using the newer,
  lower numbers is the conservative choice, and it changed one product claim: the app no longer
  calls a work sample the strongest available signal.) A 5/5 structured interview moves the estimate
  by at most `.42`, which is exactly why one conversation cannot decide anything.
- **Statistics — combined in log-odds, discounted when correlated.** Evidence is summed on the
  log-odds scale and converted back once. A repeated rating of the same competency by a different
  interviewer counts half; by the same interviewer, a quarter — so five unstructured chats with one
  manager never masquerade as five independent signals. A 3/5 rating is genuinely neutral and moves
  the estimate not at all. Rater disagreement of three or more points on one competency is
  **surfaced, not averaged away**: the app says to run a work sample or a calibration conversation.
- **Decision science — the falsification test.** Every assessment states how many further strong
  observations at the opposite extreme would move the estimate across the 50% line. The estimate is
  labelled decision support, never a prediction, and the offer gate is described as a convention
  (evidence weight ≥ `0.50`, at least two methods, all required competencies covered) rather than a
  validated cutoff.
- **Economics — the vacancy is never free.** The funnel tracks stage counts and conversion rates;
  a **cost of vacancy** is reported only from a daily figure the leader recorded. If none is
  recorded the app says the delay is unpriced rather than deriving one from a salary band. Cycle
  time is withheld below two completed hires, the same small-sample discipline as the flow metrics.
- **Process fairness without protected data.** No attribute is stored, so the check made is
  procedural: the same competencies assessed for everyone who reached the same stage. A rejection
  resting on less evidence than the process promised is allowed only with an explicit, recorded
  acknowledgement — the same gate as an offer made on thin evidence.

**Parallel cross-module automation (Schema v17):**

1. **`RULE-HIRE-01` — interview effort becomes committed capacity.** An active requisition with a
   recorded three-point effort estimate creates a `hiring`-kind entry in the operating plan
   (`consumes-capacity`, funded, value deliberately unmeasured), refreshed in place when the
   estimate or target changes, **completed as delivered** when the seat is filled, and **released**
   when the role is cancelled or held. A requisition with no estimate reserves nothing: the plan
   never invents an effort figure.
2. **`RULE-HIRE-02` — an accepted offer closes the loop into people and onboarding.** Accepting an
   offer creates the roster record and a new-hire 30-60-90 plan (seeded with the standard
   checkpoints, anchored on the agreed start date), marks the role filled, writes typed edges
   `candidate → requisition`, `requisition → person` and `person → onboarding`, and completes the
   interview reserve so its capacity returns to delivery. One action, one transaction, no
   re-entry.
3. **`RULE-HIRE-03` — a stalled role becomes an operational case, once.** A role that has not moved
   for the configured window (`hiringStallDays`, default 30) is escalated through the *same* path as
   every other module, so the case arrives with FMEA severity/probability/detectability, financial
   PERT fields, a stakeholder coalition, a DACI decision and an accountable delegation already
   attached. The `autoEscalated` flag on the requisition keeps it to exactly one case for the life
   of the role, even if that case is later closed.

Signals `HIRE-02`–`HIRE-07` report stalled roles, target-date slippage, roles with no competencies,
interview effort missing from the plan, final-round decisions short on evidence, and uneven process
coverage. A **`hiring`** CSV scope (19 total) exports roles, competencies, evidence weight and
coverage per candidate with formula-injection protection; it is flagged as sensitive because it
contains named candidate data. Deleting a candidate record removes its evidence and graph edges —
data minimisation is an obligation, not an archive policy.

### Candidate data: a retention reminder, never an automatic eraser (`Schema v18`)

Candidate records are the most sensitive thing this workspace holds and the least useful once the
decision is made. They are now covered by an explicit data-minimisation review rather than by hope:

- **`candidateRetentionDays`** (default **180**, `0` turns the review off) sets how long a closed or
  settled record stays useful. A candidate still in play on an open role is never flagged — that
  record is the working file for a live decision.
- **Nothing is deleted automatically.** A timer that erases records inside a local tool that also
  keeps the audit trail can destroy the reasoning behind a decision someone is still questioning. The
  app lists what is past the window on `#/hiring` and raises signal **`HIRE-08`**; a person decides,
  record by record, with a confirmation that names what else goes (the evidence, the graph edges) and
  says it cannot be undone.
- **"Keep in touch" is an exemption, and it stays visible.** A silver medallist you intend to call
  about the next opening is listed as exempt rather than silently skipped, so retaining a record
  remains a decision you can see.
- **The clock runs from the last recorded fact** about the person (decision, offer, hire or activity).
  A record with no dates is reported as unknown age, never guessed at, and a typo in the setting falls
  back to the default rather than switching the reminder off.

### Longitudinal team-health & habit trends and scoped CSV export

- View **8-week, 12-week and 6-month** checkpoint trends across composite health, all five
  health dimensions, feedback observation-to-conversation latency and delegation follow-through
  on `#/health` (with direct dimension drill-down from `#/today`).
- Checkpoints before the workspace recorded management activity stay `pre-history` (`null`),
  never `0`. Historical reconstruction restores team members archived after a past checkpoint
  (preventing survivorship bias), uses Schema v5 dated check-in/completion snapshots where
  present, marks pre-snapshot mutable fields **`approximate`** (hollow chart markers + plain
  explanation), and compares composite deltas across **matched dimensions** so newly unlocked
  pulse data never produces a false composite drop.
- Every trend chart pairs non-color stroke/shape encoding with a collapsible HTML data table
  (`<th scope="col|row">`) carrying exact checkpoint values and privacy-suppression states.
- Export **17 purpose-limited CSV tables** from Settings (`people`, `onboarding`, `oneOnOnes`,
  `actions`, `feedback`, `goals`, `delegations`, `growthPlans`, `recognition`, `readiness`,
  `decisions`, `cases`, `caseLinks`, `reviews`, `pulseSummary`, `healthTrends`, plus
  confirmation-gated confidential `conflicts`) with a copyable preview modal when downloads are
  restricted.
- Export an **operational copy** (Settings, plain or encrypted): a restorable JSON backup with
  the confidential conflict records and their event-log traces left out, for moving devices or
  sharing records upwards. The omission is declared inside the file (counts only) and in its
  `leados-operational-…` filename; restoring one reports what was left out, and replacing a
  browser that still holds conflict records requires explicit confirmation — so the safe-to-
  share file can't quietly become the one that deleted your mediation history.
- Text cells starting with `=`, `+`, `-`, `@`, control whitespace or full-width formula
  prefixes (`＝`, `＋`, `－`, `＠`) are prefixed with `'` (OWASP CWE-1236) while negative
  numbers stay numeric and unknown values stay blank (`""`). `pulseSummary` exports only
  anonymity-checked weekly aggregates and independently thresholded comments.

## Data integrity and architecture

- **Schema v18**, with additive v1→…→v18 migrations; pre-v5 records retain `null` for unknown
  historical completion dates and check-in snapshots rather than fabricating history. Normalization
  additionally repairs hiring records rather than rejecting the workspace: an unknown candidate
  stage falls back to the earliest real stage, out-of-order effort triples are re-ordered, an
  interviewer, competency or candidate/requisition reference that no longer exists is dropped with a
  warning, and an out-of-range rating is clamped. The v5→v6
  through v10→v11 steps add onboarding, 1:1 ownership, GROW history and explicit onboarding kinds
  without inferring missing facts. v11→v12 adds explicit GROW-to-delegation links; v12→v13 adds
  nullable performance-review provenance on goals and GROW plans; v13→v14 adds the separate
  `state.managerSupport` ledger; v14→v15 adds `state.cases`, `state.links` and
  `settings.caseReviewDays` (default 14) without fabricating historical cases or links, and strips
  any forbidden `conflict` or `pulse` link references on normalization. v15→v16 adds
  `state.portfolio` and four planning conventions (`capacityHoursPerWeek`, `planningHorizonWeeks`,
  `operationalLoadPct`, `wipLimitPerPerson`); existing goals, cases and delegations are **not**
  converted into portfolio items, because an effort or value estimate nobody gave would be
  invented data. v16→v17 adds `state.requisitions`, `state.candidates` and three hiring conventions
  (`hiringBaseRate` as an explicitly labelled prior assumption, `hiringStallDays`,
  `interviewHoursPerStage`) without converting any person, goal or case into a role or a candidate:
  who you have and who you might hire are different facts, and the migration reports what it left
  empty rather than inferring it. v17→v18 adds one hiring convention — the candidate retention
  reminder — and deliberately adds **no field to any candidate record**: a retention clock has to
  start from a date that was actually recorded, so the review reads the existing dates at review time
  instead of back-filling a `retentionStartsOn` nobody ever observed. Open cases with recorded capacity days still count as implicit reserves. Existing check-ins and 1:1
  actions are never migrated into manager commitments. Recorded check-ins gain stable IDs so a
  follow-up preserves the exact phase and the date captured when the manager chose the task.
  Normalization warns on a broken source link but preserves the manager's open commitment text.
  Unrecognised 1:1 owner values are cleared and reported, never coerced into a plausible one; GROW
  "will" actions carry no owner field at all.
- Follow-through links are repaired on load and import, in plain language: a successor that is
  missing, belongs to another person, sits earlier in time or forms a cycle clears the carry and
  reopens the promise; a successor that names a predecessor with no forward link has the link
  rebuilt; duplicate action ids inside one meeting are dropped with a warning.
- Load/import normalisation reports repairs. Conflict dates, explicit confirmation, supported
  closure and reopening boundaries are rechecked; malformed/duplicate conflict history produces
  warnings. Oversize conflict writes are rejected before any state/event change, not silently cut.
- The static server allows only the canonical shell/assets, rejects write methods, and refuses
  symlink aliases. It does not publish scratch backups, `.env`, `.git`, test tools or legacy source.
  Historical console/docs files remain in the repository but are no longer served by this entry.
- Future/invalid declared schema versions are not silently downcast: imports are rejected;
  incompatible saved data is write-protected and exports unchanged for recovery. Only explicit
  compatible import/reset can replace it, and protection survives a failed replacement write.
- Corrupt JSON opens a fresh workspace with a warning; recovery quarantine is **best effort**,
  capped at 500,000 characters and can itself fail when storage is full. Keep external backups.
- Each storage write replaces one JSON blob. On ordinary write failure, changes remain **in
  memory only**, with a persistence error; conflict dialogs and Settings report this explicitly.
  Imports adopt nothing unless the replacement saves. Reloading loses unsaved in-memory changes.
- Meaningful mutations append events; the general log retains the latest **600** entries.
  Conflict agreement/check/transition history stays in its record. Neither is tamper-proof.

```text
index.html                 shell, landmarks, navigation and modal/toast roots
app/main.js                router, application context, shell and error boundary
app/actions.js             DOM-free validated write API
app/conflict-actions.js    conflict lifecycle validation and generic audit events
app/core/                  schema, injected storage/clock, pure domain modules
app/core/crypto.js         PBKDF2-SHA-256 + AES-256-GCM envelope (no I/O, injectable crypto)
app/ui/                    shared DOM/forms/dialogs/charts
app/views/                 route renderers, not persistence implementations
tests/app/                 node:test domain/store/jsdom tests
```

No runtime framework, package dependency, account, network service or model inference was
added. Research and product tradeoffs are in `RESEARCH.md` §§14–40.
The five health dimensions use weights 24/20/20/16/20 for cadence/feedback/clarity/growth/
wellbeing. Missing dimensions stay null and weights renormalise; grades are A/B/C/D/F.
Historical comparison uses Schema v5 dated snapshots where recorded and explicitly labels
checkpoints `approximate` when pre-v5 or in-place edited fields lack history.

## Verification — 2026-10-26, session 32

- `npm run verify:canonical`: **`eslint .` (`0` errors/warnings), `check:boundary` (`79` canonical ES modules & `38` test suites, `0` quarantined-tree or network leaks), `check:links` (`0` broken internal links), and `475 passed, 0 failed, 0 skipped` across 38 suites** (up from 457 across 37 before Session 34).
- New `tests/app/case-calibration.test.mjs` (10 tests, Session 32) verifies:
  1. Hand-pinned FAIR frequency × magnitude maths (occurrence Brier fixtures, exposure/spend/diverted-days
     ratios, the actuarial loss-development aggregate), snapshot-first vs `resolution-estimate` scoring,
     verdict sample floors, and reference-class hint floors.
  2. `RULE-FCT-03` opening-forecast freeze at first quantification (creation or later edit), immune to
     subsequent estimate edits; settled-actuals capture in `resolveCase` + `recordCaseActuals` backfill
     with validation; reopen voiding; point-in-time actuals rewind.
  3. `RULE-FCT-04` one-shot under-reserving governance decision (median ≥1.25× at n=5) linked to the
     worst settlement, idempotent while unreviewed; `FCT-05`…`FCT-07` firing on sufficient evidence and
     silent on the demo baseline ("collecting evidence", one settlement at 1.1939×).
  4. Regression coverage for both Session 32 audit defects: the `updateCase` closed-status capacity-reserve
     leak (reserve now released + goal check-in via the Edit path) and `reopenCase` stale resolution notes.
  5. v21→v22 additive migration with dirty-actuals/snapshot repair and null-preservation; `cases` CSV
     settlement columns + `calibration` CSV case rows with CWE-1236 escaping; JSDOM `#/cases` card,
     settled-actuals detail panel and both dialogs with `axe-core` (0 violations).
- New `tests/app/scenarios-sensitivity.test.mjs` (7 tests, Session 30) verifies:
  1. Strict zero-mutation isolation (`projectScenarioState`, `compareScenarios`, `computeSensitivityTornado`, and opening/toggling `#/scenarios` leave `store.state`, `localStorage`, and `events` untouched).
  2. Law & Kelton Common Random Numbers (`seed`) determinism and variance reduction across scenario deltas.
  3. Brooks's Law onboarding mentoring drag vs. Watkins 30-60-90 ramp crossover (late hires reduce near-term horizon net capacity; early hires with freed interview reserve add net capacity).
  4. Keeney–Raiffa Pareto frontier dominance classification and Eschenbach/Howard One-at-a-Time Tornado P80 schedule swing ranking.
  5. `RULE-SCN-01` (#21) non-destructive DACI logging (`recordScenarioDecision`) vs. atomic workspace commitment (`commitScenarioLevers`, cascading `RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`, and `RULE-CHG-01`..`05`), `SCN-01` Pareto-relief insight, and `sensitivity` CSV (#21) formula-injection escaping.
  6. Regression coverage for all **7 pre-existing cross-module defects** discovered in the Session 30 audit (`documentTitle` routes, `cases[].stakeholders[].keyMessage` governance/redaction, `RULE-CAP-05` catalog threshold wording, `reconstructStateAt` candidate rewind, `personOptions`/`goalOptions` sentinels, `openSettingsDialog` simulation/change fields & zero-allowed minima, and `personSupply` future `startDate` proration).
  7. End-to-end interactive `#/scenarios` UI lever edits, hypothetical request injection, modal commitment (`RULE-SCN-01`), and `axe-core` (`0` violations in JSDOM).
- Live HTTP static server (`scripts/serve.mjs`) verified returning `200 OK` with expected MIME types for `/`, `/app/main.js`, `/app/core/domain/scenarios.js`, and `/app/views/scenarios.js`.
- **Not verified in Session 30 (`[UNVERIFIED]`):** `@sparticuz/chromium` is not installed in this container's `node_modules` and external browser CDNs are outside the sandbox allowlist, so real graphical browser rendering (`1440px`/`390px`/`320px`) of the new `#/scenarios` view and `tornadoChart`, spoken assistive-technology announcements (NVDA/JAWS/VoiceOver/Orca), Firefox/Safari engines, print pagination, and real-manager field comprehension remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 20

- `npm test`: **315 passed, 0 failed, 0 skipped** across 24 test files.
- Scoped ESLint on the changed application modules and affected tests, `node --check` for changed
  JavaScript, and `git diff --check` passed.
- JSDOM/API tests cover explicit task creation after a held phase check-in, blank user-controlled
  task text, stable source phase/date through edits/carries, Today and 1:1 ledger actions, real
  meeting reconciliation, CSV provenance, snapshot rewind, and exclusion from performance-review
  evidence. These are automated tests, not real-browser or usability validation.
- `npm ci --no-audit --no-fund` installed the existing lockfile dependencies; package manifests
  and lockfile were not changed. No build, backend, dependency or network request was added.
- Real mobile/browser and assistive-technology validation, manager/employee comprehension, print
  output, large-workspace behavior, and full manual legacy source/build/deployment audit remain
  **[UNVERIFIED]**.

## Verification — 2026-10-25, session 27

- `npm test`: **408 passed, 0 failed, 0 skipped across 29 suites** (session 26 shipped 368 across
  27). New: `tests/app/retention.test.mjs` (23, candidate-data retention), `tests/app/scale.test.mjs`
  (5, large-workspace correctness and timing) and `tests/app/access-audit.test.mjs` (12, structural
  accessibility and destructive-confirmation safety). Timings and method are in the
  [validation report](docs/VALIDATION-2026-10-25-session-27.md).
- **Dependency audit remediated:** `next` 16.2.6 → 16.4.3, `postcss` 8.5.8 → 8.5.31,
  `eslint-config-next` → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11. `npm audit --omit=dev` now reports
  **0 vulnerabilities** (was 1 critical, 2 high). Four moderate advisories remain in a dev-only
  `drizzle-kit → esbuild 0.18.20` chain whose advisory concerns a development *server* that this
  repository never runs; the offered "fix" is a breaking downgrade of the migration CLI, so it was
  declined and explained rather than applied.
- **The legacy Next app does not build, and did not before this change** — verified against both
  dependency sets: `next build` fails on `src/lib/agent/tools.ts` importing `toolEffects` from
  `src/db/schema`, and `tsc --noEmit` reports 6,977 errors. Deployment is therefore moot rather than
  "risky"; the canonical zero-build app imports none of these packages. This is recorded, not fixed:
  repairing a non-canonical tree is a separate decision. **CI was aligned with this fact on
  2026-11-02** ([ADR-0072](docs/adr/0072-ci-verifies-canonical-app.md)): the workflow previously ran
  `npm run build`, so it compiled the quarantined tree, failed in ~50s, and cancelled the matrix
  before `npm test` ever executed. It now runs the canonical gates on Node 22.x (the workflow has no
20.x leg; that claim in earlier revisions of this README was wrong).
- **Real browser and screen-reader validation could not be performed here.** Playwright's browser CDN
  and Google's are outside the sandbox network allowlist; the in-package `@sparticuz/chromium` build
  launches only with `libnspr4`/`libnss3`, which requires a system package install the container
  cannot reach. In place of a browser, a structural audit asserts what axe cannot: one `h1` per
  screen with no skipped levels, an accessible name on every interactive control, captioned tables
  with `scope`d headers, landmark structure and a working skip link, dialog focus trap and
  restoration, and state that is announced rather than only coloured. Reading order and
  comprehension with an actual assistive technology remain **[UNVERIFIED]**, as does any manager's
  real hiring decision.
- **Large-workspace validation:** a 120-person / 300-case / 180-item / 40-role / 320-candidate
  workspace with 900 typed edges normalizes in ~35 ms, builds insights in ~42 ms, and exports all 19
  CSV scopes in under 50 ms each; every edge resolves at both ends and a second normalization is a
  no-op. A 300-role × 5,000-candidate stress case exposed an O(roles × candidates) scan in
  `hiringSummary` and the hiring CSV export, now single-pass indexed (~110 ms at that ratio).
- Five defects were found by these tests and fixed: destructive confirmations that ran *before* the
  user answered (and, in cases, showed no message at all), focus lost to `<body>` when a dialog
  trigger was re-rendered away, two uncaptioned capacity tables, a retention window that a typo could
  silently switch off, and the quadratic scan above.

## Verification — 2026-10-25, session 26

- `npm test`: **368 passed, 0 failed, 0 skipped across 27 suites** (baseline before this session was
  341 across 26). The new `tests/app/hiring.test.mjs` adds 27 tests covering the evidence
  mathematics (log-odds combination, correlated-evidence discounting, neutrality at 3/5, the
  falsification test), competency coverage and the offer gate, process parity, the cycle-time floor
  and vacancy honesty, the v16→v17 migration and normalization repairs, action validation, and the
  three automation rules end to end — including "a stalled role raises exactly one case even after
  repeated syncs" and "accepting an offer creates the roster record, the 30-60-90 plan, three typed
  links and frees the reserve, once".
- `axe-core` in JSDOM: **0 violations** on `#/hiring`, on `#/hiring/:id?candidate=…` and inside the
  requisition dialog. One genuine defect was found by the suite and fixed: two tables had an empty
  header cell, which axe reports as `empty-table-header`.
- `scripts/serve.mjs` returns `200` for `/`, `app/main.js`, `app/views/hiring.js`,
  `app/ui/hiring-modals.js`, `app/core/domain/hiring.js` and `app/styles.css`.
- Not verified: no GUI browser, screen reader or mobile device was available in this container, so
  real-browser rendering, keyboard traversal, print output and assistive-technology announcements
  for the new screens remain **[UNVERIFIED]**. No manager has used this module on a real hiring
  round, so the validity weights are the published coefficients applied as weights — not evidence
  that this implementation predicts anyone's performance.

## Verification — 2026-10-25, session 22

- A review of the shared form helper found that inline validation errors were announced as alerts
  and marked invalid, but were not connected to their matching fields. The helper now adds the
  current error ID to `aria-describedby` while preserving help text; a successful retry removes
  the stale error description. See the [focused audit](docs/AUDIT-2026-10-25-session-22.md).
- The updated JSDOM and manager-follow-up Chromium checks verify the field's `aria-invalid`,
  `role=alert` error text, both help/error descriptions and error cleanup. Axe remains at zero for
  the selected views, but it did not discover this relationship gap by itself.
- No actual screen reader/assistive technology, GUI browser, or comprehension study was available.
  NVDA/JAWS/VoiceOver/TalkBack/Orca announcements, possible duplicate alerts and manager/employee
  comprehension remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 21

- The two existing Chromium smoke scripts and the new `scripts/app-manager-support-smoke.mjs`
  all pass with headless Chromium **153.0.8010.0**, using isolated fictional records and no
  external application requests.
- The new script runs the recorded Day 30 check-in → separate manager-authored action with a
  manager-chosen date → exact source link → explicit completion in a real held 1:1. It checks
  that candid blocker text is not copied into the commitment or the 1:1 board, and that opening
  the 1:1 dialog creates no synthetic meeting.
- At **1440×1000** and **390×844**, the covered screens have no horizontal overflow. Eight axe-core
  scans for WCAG 2.1 A/AA rule tags report zero findings. Browser keyboard checks cover initial
  focus, Tab and Shift+Tab containment, Escape dismissal and focus return to the opener.
- These are selected automated checks in one headless Chromium version, not full visual review,
  screen-reader certification or a manager/employee comprehension study. Those, other browser/
  device configurations, print/PDF and large-workspace behavior remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 19

- `npm test`: **312 passed, 0 failed, 0 skipped** across 24 test files.
- Scoped ESLint on changed application modules and schema-version tests, changed-module syntax
  checks, and `git diff --check` passed.
- JSDOM exercised both review handoff forms, source validation/export and reverse links. No real
  Chromium/mobile or assistive-technology test was run for this increment; those remain
  **[UNVERIFIED]**.
- Legacy build/runtime/security, print/PDF output, full manual source review, large-workspace
  performance and manager/employee outcomes remain **[UNVERIFIED]**.

## Historical verification — 2026-10-25, session 17

- `npm test`: **305 passed, 0 failed/skipped** across 23 test files (`tests/app/*.test.mjs`).
  The 293-test baseline passed before edits. Twelve new `onboarding-queue.test.mjs` tests
  cover inclusive UTC date boundaries, deterministic ordering, all three plan kinds, archived/
  inactive/orphan/future exclusions, unheld phases, no private-data access, validation, inert
  cancellation, in-place logging, exact-plan/all-due filters, persistence/audit history, visible
  failed writes, and XSS-safe rendering. Existing migration, encryption, follow-through,
  performance-review, decision, GROW, prep, pulse, export and actual-HTTP server tests still pass.
- All 55 canonical JS modules pass `node --check`; scoped ESLint passes with zero warnings.
- **Chromium 153.0.8010.0:** both optional smoke scripts pass, using isolated fictional records,
  no user's browser data and no external application requests. The new script covers Today →
  overflow → full check-in queue → validation → log re-boarding conversation → save/reload →
  exact source plan → stale-link recovery. The existing script covers conflict lifecycle,
  export/import, keyboard trapping, fifteen mobile routes and health. Combined, **11 WCAG
  A/AA axe scans report zero violations**, including color contrast in real Chromium.
- No horizontal document overflow at the tested **1440×1000** desktop and **390×844** mobile
  states. Browser verification found and repaired existing onboarding-toolbar and Settings
  export/backup-button overflow; the older smoke script's two stale checkbox selectors now
  use the real accessible labels.
- Demo re-measured at `2026-10-25T10:00:00Z`: health **55.1 (C)**, matched 30-day trend **+8.3**
  (`previous: 46.8`, `approximate`), **37 findings / 25 rule IDs / 12 urgent / 4 wins**, unchanged.
  Today's new queue shows Samuel's Day 30 check-in **8 days overdue**. No demo records changed.
- Schema stays **v12**; no migration, account, backend, runtime dependency or network call was
  introduced. `npm audit --omit=dev` still reports 1 critical / 2 high legacy dependency findings.
- **[UNVERIFIED]:** full manual line-by-line legacy review/build/runtime, Safari/Firefox,
  real screen-reader and physical-device use, print/PDF visual output, large-workspace
  performance and real-manager outcome improvements. Automated source inventory is not
  personal verification of all 333k source lines. See the [audit](docs/AUDIT-2026-10-25-session-17.md).

Optional browser reproduction on Linux (tools are test-only, installed in ignored scratch):

```sh
# Keep the static server running in another terminal.
npm install --prefix tmp/browser --no-save --no-audit --no-fund \
  playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
node scripts/app-browser-smoke.mjs
node scripts/app-onboarding-smoke.mjs
node scripts/app-manager-support-smoke.mjs
# Evidence: tmp/browser-evidence/, tmp/onboarding-evidence/ and
# tmp/manager-support-evidence/ (not committed)
```

## Known limitations and next

- **One leader, one browser profile.** No accounts, employee submission, multi-manager sharing,
  authentication or background notifications. Never store notes you are not authorised to hold;
  export contains sensitive data. Clearing site data deletes the workspace.
- Pulse suppression is intentionally more conservative: some previously visible sparse,
  unanimous or thin-comment windows now remain hidden. A floor is not an anonymity guarantee.
- Cadence and latency/check-in cadences are configurable; the review queues use a fixed
  seven-day look-ahead. None is a validated universal deadline. No real-manager longitudinal validation or proof of improved outcomes is claimed.
- Encryption is optional and passphrase-only: no recovery key, no key escrow, and no protection while the workspace is unlocked and in active use. An unlocked, encrypted workspace now auto-locks after a configurable inactivity window (default 30 minutes, 0 = off, set in Settings), warning first so nothing in progress is discarded. CSV and plain-text JSON exports are always unencrypted, and full JSON backups still contain conflict
  notes; the operational copy leaves conflict records and their event traces out, but still
  contains 1:1 notes, feedback and reviews — "conflict-free" is not "safe for any audience".
  Its omission marker is a declaration the import path trusts, so a hand-edited unmarked file
  is indistinguishable from an honestly conflict-free workspace. Enabling encryption replaces
  the browser's single stored blob, so a passphrase lost before the next unlock is
  unrecoverable by design.
- Follow-through is self-reported. A promise is only recorded as kept, carried or dropped when
  the leader logs the next 1:1; the app cannot observe delivery, and it deliberately sends no
  reminder (no backend, no notifications). A workspace with few logged 1:1s therefore shows few
  reconciliations — the gap is the missing conversation, not a hidden tracking failure.
- Ownership is whatever the leader recorded. "Not recorded" is a real state that the board counts
  and the export leaves blank; the app never infers an owner from who tends to do that kind of
  work, and "What you owe" is private to the browser (no employee view exists, so nobody else can
  see it or hold the leader to it).
- The 1:1 prep sheet is assembled from records, not a meeting transcript: it surfaces what was
  promised and still open, and cannot recover a conversation that was never logged. "Topics they
  want to raise" is recorded by the manager because the app has no employee login — the manager
  is the scribe, not an employee-submitted form. Print/PDF visual output remains **[UNVERIFIED]**
  in a real browser.
- Hiring stores candidate names and interview evidence in the same local browser copy as everything
  else. A retention *reminder* (default 180 days, `Schema v18`) lists records past the window and
  raises a signal, but deletion stays explicit, one record at a time, and audited — a workspace shared
  with a laptop profile still shares its candidates, and a reminder is not a guarantee that anyone
  acted on it. The validity weights are published population averages used
  as fixed weights (structured interviews: `.42`, 80% interval `.18`–`.66`), not a prediction about
  any individual, and no manager has run a real hiring round against this module, so whether the
  weighted read improves a real decision is **[UNVERIFIED]**. Cost of vacancy is reported only from a
  daily figure the leader enters; if it is left blank the module shows the delay as unpriced rather
  than estimating one.
- **Organizational Design, Team Topologies & Shewhart XmR Statistical Process Control (`#/changes`, `Schema v19`)**:
  models team-boundary redesigns, charter changes, and ritual shifts across Kotter's 8-Step progression
  (with foundational-skip warnings), Lewin Force-Field driving vs. restraining barriers, Conway's Law /
  Skelton & Pais Team Topologies + Sweller Cognitive Load + Brooks inter-team coordination channels
  (`N(N-1)/2`), Galbraith's 5-Point Star + Holmström–Milgrom incentive-mismatch checks, Mendelow +
  Tsebelis veto-player coalitions, and Beta-PERT transition effort & J-Curve payback economics. Active
  changes propagate atomically (`RULE-CHG-01`..`05`) into capacity reserves (`#/capacity`), DACI charter
  decisions (`#/decisions`), opted-in Watkins 30-60-90 `role-transition` plans (`#/onboarding`) + blameless
  1:1 prep (`#/prep/:id`), coalition briefing schedules, and linked OKR risk telemetry (`#/goals`),
  cascading vertically into `RULE-CAP-02` if transition reserves + role-transition ramps push team
  capacity past 100%. Shewhart/Wheeler Individual & Moving Range (`XmR`) charts (`X̄ ± 2.66 mR̄`, `URL = 3.267 mR̄`,
  Western Electric Rules 1–4) separate routine common-cause noise from real special-cause process shifts
  on both `#/changes/:id` metrics and `#/health` longitudinal trends (requiring ≥4 measured windows and ≥3
  adjacent moving ranges; missing windows are never interpolated). Force-field weights, cognitive load
  ratings, and transition economics remain manager-estimated inputs rather than observed telemetry, and
  participation in an organizational change never enters individual performance review evidence. Real-browser
  visual rendering and screen-reader usability on `#/changes` remain **[UNVERIFIED]**.
- **Seeded Monte Carlo Portfolio, Critical-Chain Bottlenecks & Coupled J-Curve Simulation (`app/core/domain/simulation.js`, `#/capacity`, `#/changes/:id`, `Schema v20`)**:
  deterministic Mulberry32 PRNG + Marsaglia–Tsang Gamma / Vose Beta-PERT sampling (`seed = 42` default,
  configurable 250–5,000 trials in Settings) simulates right-skewed 3-point PERT commitments jointly across
  funded portfolio work, incident reserves, hiring effort, and active organizational changes. Surfaces Sam
  Savage's *Flaw of Averages* (`overloadProbability` when expected person-days appear to fit `≤ 100%`),
  Goldratt's *Critical Chain* owner-constrained `P50`/`P80`/`P90` calendar dates vs. fungible team-sum dates,
  variance-contribution sensitivity drivers, and coupled Satir J-curve valley depth & payback quantiles on
  `#/changes/:id`. Wired into `RULE-CAP-05` (idempotent goal tail-risk check-ins + Flaw-of-Averages DACI
  trade-off decisions) and `SIM-01`/`SIM-02` signals, with accessible SVG histogram & fan charts backed by
  expandable HTML data tables. Trial independence is assumed; correlated common-mode shocks are not modelled.
- **Pre-Export Candidate Retention (`HIRE-08`) & Contextual-Integrity Disclosure (`app/core/domain/export-governance.js`, `app/ui/export-dialogs.js`, `Schema v20`)**:
  before exporting plain JSON, operational JSON, encrypted backups, or `hiring`/`cases`/`changes` CSV scopes,
  LeadOS inspects the workspace for overdue candidate records past `candidateRetentionDays` (GDPR Art. 5(1)(e)
  storage limitation), disabled retention windows, confidential conflict cases, and candid `skeptical` /
  `resistant` / `opposing` stakeholder or veto-player notes (Nissenbaum *Contextual Integrity*). Offers
  optional export-only redactions (`pruneOverdueCandidates`, `redactStakeholderStances`, `redactConflicts`)
  that scrub the exported copy without mutating the live workspace and append a private-content-free
  `export.disclosed` audit event.
- **Non-Persisted Counterfactual Scenario Sandboxing, Pareto Frontier Dominance & One-at-a-Time Tornado Sensitivity (`app/core/domain/scenarios.js`, `#/scenarios`, `Schema v20`)**:
  rehearses scope trims (Reinertsen CD3), uncommitted urgent requests, incident mitigation (`#/cases`),
  active org-change phasing (`#/changes`), Brooks's Law hiring start-date vs. mentoring drag (`#/hiring`),
  and Argyris & Schön double-loop operating-policy shifts (`operationalLoadPct`, `capacityHoursPerWeek`,
  `wipLimitPerPerson`) over isolated `structuredClone` snapshots using Law & Kelton Common Random Numbers
  (`seed`), without mutating `store.state` or appending audit events until explicitly committed. Surfaces
  Keeney–Raiffa Pareto-optimal vs. dominated options, Samuelson marginal shadow pricing of capacity,
  Tsebelis veto-player / OKR coalition risk, and an accessible diverging SVG `tornadoChart` ranking
  one-at-a-time P80 schedule drivers (`sensitivity` CSV #21). Explicit commitment via `RULE-SCN-01` (#21)
  records a calibrated DACI decision (`recordScenarioDecision`) or atomically executes levers across
  portfolio, cases, changes, goals, and settings (`commitScenarioLevers`). Graphical browser rendering of
  `#/scenarios` in Session 30, spoken screen-reader output, and real-manager comprehension remain
  **[UNVERIFIED]**.
- **Forecast Calibration & Reference-Class Learning Loop (`app/core/domain/calibration.js`, `#/decisions`,
  `#/capacity`, `Schema v21`)**: closes the loop over the app's own predictions. Decisions now record an
  optional Cromwell-clamped (5–95%) probability when the call is made — scenario decisions derive theirs
  automatically from the CRN overload odds — and the outcome review scores it with Brier (1950),
  Murphy (1973) reliability/resolution/uncertainty decomposition and an accessible reliability
  (calibration-curve) diagram; the forecast is frozen after review so hindsight cannot game the record.
  Funding planned work freezes its PERT forecast into an immutable snapshot (`RULE-FCT-01`) so delivery
  actuals — now captured in the Deliver dialog or backfilled later, never pre-filled from the estimate —
  score the belief held at commitment. Median actual/estimate ratios, interval-coverage honesty, and
  Flyvbjerg (2006) reference-class uplifts feed the Capacity delivery forecast; ≥5 scored items at
  ≥1.25× median optimism opens one DACI governance decision (`RULE-FCT-02`), while `FCT-01`…`FCT-04`
  signals surface estimate bias, too-narrow ranges, decision overconfidence, and unrecorded actuals.
  Verdicts refuse to render below n=5 (the demo honestly shows "collecting evidence": Brier 0.04, n=2
  estimate pairs). Ships with the `calibration` CSV scope (#22). Graphical browser rendering of the
  Session 31 calibration card, spoken screen-reader output, and field comprehension remain
  **[UNVERIFIED]**.
- **Case-Cost Calibration Ledger (`app/core/domain/calibration.js`, `#/cases`, `Schema v22`)**: the third
  prediction ledger, completing the learning loop over operational risk. When a case is first quantified,
  `RULE-FCT-03` freezes its opening beliefs (PERT exposure distribution, diverted-capacity expectation,
  planned mitigation spend, pre-mitigation FMEA probability) into an immutable snapshot; when the case
  resolves, settled actuals — did it materialise, realised exposure, actual mitigation spend, actual
  diverted days, each recordable independently and never pre-filled from the estimate — score against
  that frozen forecast. FAIR's (Freund & Jones, 2015) two legs are scored separately: occurrence
  (FMEA-implied probability vs materialisation, Brier) and magnitude (realised vs expected exposure
  with interval-coverage honesty), alongside spend and diverted-days discipline (the diverted-days leg
  is also the first accuracy read on `RULE-CAP-01` capacity reserves, deliberately excluded from the
  effort ledger in Session 31). The aggregate Σrealised ÷ Σexpected-unmitigated is the actuarial
  loss-development factor for the case book; at n≥5 with median development ≥1.25×, `RULE-FCT-04`
  opens one DACI decision offering reference-class contingency uplifts, linked to the worst
  under-assessment, while `FCT-05`…`FCT-07` surface reserve adequacy, occurrence blind spots and
  unscored settlements. **`RULE-CAP-06` closes the ledger-to-capacity loop:** once five actual
  diverted-days settlements establish a ≥1.25× median under-reserve, open case capacity reserves
  receive a median uplift (P80 for high-priority cases), automatically re-triggering deterministic
  capacity trade-offs and seeded Monte Carlo tail-risk checks. The dialog previews the factor and
  sample count; case estimates and their frozen scoring baseline remain untouched. Five is a
  conservative product trigger, not statistical proof or a universal policy, and real-team
  validation remains **[UNVERIFIED]**. Session 32 also fixed two audited cross-module defects: closing a case via
  the Edit dialog previously leaked its capacity reserve as open forever, and reopening left stale
  resolution notes diverging from a reload. Graphical browser rendering of the case-cost card and
  `caseRatioChart`, spoken screen-reader output, and field comprehension remain **[UNVERIFIED]**.
- Legacy build/runtime, Safari/Firefox, spoken assistive-technology output and physical-device
  use, print visual output and field comprehension remain **[UNVERIFIED]**.
- **The legacy Next app does not build and is quarantined under [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md).**
  `next build` fails on `src/lib/agent/tools.ts` importing a `toolEffects` export that does not exist in
  `src/db/schema`, and `tsc --noEmit` reports 6,977 errors; the root `App.tsx` imports `./lib/store`,
  `./lib/seed`, `./lib/engine` and `./components/*` that are not in the repository. ADR-0007 freezes these
  non-canonical paths as a read-only historical archive and enforces `npm run check:boundary` so canonical
  `app/**` modules never depend on them. Session 27 removed every production advisory (`npm audit --omit=dev`:
  **0**); four moderate advisories remain in a dev-only `drizzle-kit → esbuild 0.18.20` chain.
- **Accessibility is verified in Headless Chromium `143.0.7499.0` + `jsdom`, not with spoken screen readers.**
  Session 29 executed real Headless Chromium `143.0.7499.0` against `scripts/serve.mjs` across 11 routes at
  `1440×1000`, `390×844`, and `320×800` (WCAG 1.4.10 Reflow) plus 4 live modals, uncovering and fixing 7 real
  contrast, label-in-name (`wcag21a`), and flex-reflow defects (`0` `axe-core` WCAG 2.1 AA violations and `0`
  horizontal overflows post-fix). Spoken screen-reader output (NVDA, JAWS, VoiceOver, Orca), Firefox/WebKit
  rendering, and human manager comprehension remain **[UNVERIFIED]**. See the
  [Session 29 validation report](docs/VALIDATION-2026-10-25-session-29.md) and earlier
  [Session 27 validation report](docs/VALIDATION-2026-10-25-session-27.md).

## Documentation

- [ROADMAP.md](ROADMAP.md) — verified inventory, ordered next work and rejected directions.
- [RESEARCH.md](RESEARCH.md) — frameworks, product benchmarks and design consequences.
- [ADR-0030](docs/adr/0030-coupled-continuity-capacity-simulation.md) — Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation & Cross-Module Governance.
- [ADR-0029](docs/adr/0029-mitigation-robustness-evidence-gate.md) — Mitigation Robustness & Evidence Gate (`RULE-ROB-01`).
- [ADR-0012](docs/adr/0012-operational-resilience-continuity-terminal.md) — Operational Resilience, Dependency Topology & Continuity Terminal architecture decision.
- [ADR-0011](docs/adr/0011-decision-tempo-terminal.md) — Decision Tempo & Timing Terminal architecture decision.
- [Session 29 validation report](docs/VALIDATION-2026-10-25-session-29.md) — real Chromium 143 WCAG 2.1 AA & 320px/390px/1440px reflow audit, defects fixed, and `[UNVERIFIED]` boundaries.
- [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md) — frozen archive-in-place quarantine disposition of the legacy Next.js / Vite trees.
- [Current audit](docs/AUDIT-2026-10-25-session-23.md) — Session 23 cross-domain operational cases, parallel automation engine, and verification boundaries.
- [Session 22 audit](docs/AUDIT-2026-10-25-session-22.md) — inline validation error accessibility audit.
- [Session 19 audit](docs/AUDIT-2026-10-25-session-19.md) — Session 19 handoff audit, source provenance and verification boundaries.
- [Session 18 audit](docs/AUDIT-2026-10-25-session-18.md) — delegation-queue gap decision and verification boundaries.
- [Previous audit](docs/AUDIT-2026-10-25-session-17.md) — phase-conversation queue, source inventory and browser evidence.
- [Session 4 audit](docs/AUDIT-2026-10-24-session-4.md) — conflict lifecycle and Chromium baseline.
- [Historical audit](docs/AUDIT-2026-10-24.md) — original record with explicit corrections.
- [AI-SESSION-LOG.md](AI-SESSION-LOG.md) — cumulative session history, including corrections.

## Session 56 (2026-10-28) — Predictive Anomaly Intelligence
- Added #/anomaly terminal with Shewhart XmR, linear prediction bands, Brier-calibrated confidence, and RULE-ANOM-01 event-driven cross-module propagation.

### Anomaly integrity correction (2026-10-28)
The earlier Session 56 description immediately above is **superseded**: the former anomaly rule returned descriptors, not actual cross-module records, and its forecast was not Brier-calibrated. `#/anomaly` now displays descriptive weekly open-case snapshots and exploratory in-sample XmR limits only. No forecast or anomaly-driven records are created. Detected reopenings and missing dates suppress the series; editable dates and the capped event log mean historical fidelity is not guaranteed. Existing operational-case automation remains separate and creates linked decision, delegation, goal, coaching, capacity and communication records when applicable. The canonical schema is now v37 (Session 57, Operating System Dynamics Lab); the anomaly work described here never required a version bump of its own.

## Session 66 (2026-10-28) — Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation ([ADR-0030](docs/adr/0030-coupled-continuity-capacity-simulation.md))

- **All-Weather Continuity-Coupled Portfolio Engine (`app/core/domain/continuityCoupling.js`, `#/capacity`, `#/resilience`, `#/scenarios`):** couples seeded Beta-PERT + Reinertsen CD3 + Goldratt Critical-Chain portfolio simulation with Poisson operational dependency outages (`annualFailureProb`), multi-tier Nth-party cascades, empirical/split-conformal continuity-drill TTR calibration (`declared-point-ttr` below $n = 5$ drills; `empirical-drill-bootstrap` at $n \ge 5$), preemptive steward capacity diversion, and coherent per-currency Expected Shortfall ($\text{VaR}_{90}$ / $\text{CVaR}_{90}$, Rockafellar & Uryasev, 2000; currencies never summed).
- **Generalized Multi-Hop Post-Commit Governance (`app/core/domain/continuityCouplingRule.js`, `RULE-CPL-01..03`, `CPL-01..04`):** registered on the shared `postCommit.js` spine (`DEFAULT_POST_COMMIT_RULES` + `PROPAGATION_CONTRACTS`) and unified in `AUTOMATION_RULES` (`114` total rules). When a fair-weather feasible plan ($\ge 50\%$ fit) suffers a continuity mirage, `RULE-CPL-01` opens one undecided 4-option DACI trade-off decision linked to the shock-driving dependency and funded portfolio item, chaining in the **same atomic transaction** into `decisionTempoRule` (`RULE-DLY-03`) to propose a priced Cost-of-Delay timebox; `RULE-CPL-02` opens one blameless relief delegation and non-evicting `[CPL:<personId>]` 1:1 talking point for contended dual-hat stewards, self-cleaning when contention clears.
- **Counterfactual Hardening Frontier & What-If Sandbox (`rankHardeningInterventions`, `dependencyHardening` levers):** `#/resilience` ranks single-node warm-standby / dual-active + backup-steward upgrades by paired Common-Random-Numbers fit gain, P80 days saved, $\text{CVaR}_{90}$ reduction, and redundancy ROI, deep-linking (`#/scenarios?hardenDep=<id>`) into the non-persisted What-If Scenario Sandbox where `commitScenarioLevers` (`RULE-SCN-01`) atomically commits chosen upgrades. Real-browser visual inspection and assistive-technology speech output remain **[UNVERIFIED]** in this CLI session.

## Session 76 (2026-10-30) — The Structural Design Terminal: measure the shape, then change it (Schema v53, [ADR-0041](docs/adr/0041-structural-design-terminal.md))

Every other screen in this workspace optimises work *inside* the structure. `#/orgdesign` is the
first one allowed to change the structure, and it does it as a measured, reversible, pre-registered
decision rather than a diagram.

- **The structure is a graph, and it is measured, not drawn.** Span is out-degree, layers the longest
  path from the roots, and coordination channels are `n(n−1)/2` per unit with the manager included
  (Graicunas 1933; Brooks 1975) — so the marginal channel cost of one more report is visible per unit
  instead of averaged away. A reporting cycle, a self-managed record and a dangling manager are
  reported and cut; none is silently repaired.
- **The decision queue is built from this workspace's history, not from a guess.** For each manager,
  arrivals come from their own completion count in a declared window (Little's law in steady state),
  `Ts` is the median of their own completed commitment spans, `Cs` their own coefficient of
  variation, and the wait is Kingman's (1961) diffusion approximation
  `Wq = ρ/(1−ρ)·(Ca²+Cs²)/2·Ts`. Below three completions the queue is `insufficient`; at ρ ≥ 1 the
  wait is `null`, because an unstable queue has no finite expectation and printing one would be a
  lie. This is the first place the product answers "why is everything slow now that I have nine
  reports?" with the leader's own numbers.
- **The demo has a real hierarchy now.** The sample roster used to set `managerId: null` on every
  person, so the first thing a new user saw on this page was a dead end. It now carries one line per
  person under the lead — span 4 inside the band, ten coordination channels, $27,750/year priced from
  the FY25 cycle the merit terminal already holds — and the queue still reports `insufficient`,
  because that manager has no completed commitments in the window. A demo that fabricates a measured
  wait would be the first lie in the product.
- **Coordination is priced, or it is absent.** Hours are a declared convention per channel; money is
  derived from the latest effective merit cycle at the manager's loaded hourly rate. A manager with no
  recorded pay makes the unit `unpriced`, and the total prints its priced share — a partial sum never
  reads as the whole.
- **Declaring is free; committing is not.** A design is a draft of proposed reporting lines. Committing
  refuses a missing owner, no moves, a move that changes nothing, an archived or missing person, a
  self-report or a cycle; then it applies every move to `people.managerId` **and** freezes the
  prediction in one transaction. `revertOrgDesign` restores exactly the line recorded at commit and
  leaves alone any line someone changed again, reporting what it skipped.
- **The counterfactual is labelled a model.** A proposed structure scales measured arrivals by the
  ratio of coordination channels before and after. That scaling is a declared convention and it is
  printed beside every number it produced; the module never calls the scaled wait a forecast.
- **Designs are compared as a Pareto set, never a score.** Four minimised objectives — coordination
  hours, units over the band, modelled median P80 wait, and people whose line or depth moves. No
  weighted composite, because it would decide the trade-off the leader has to decide.
- **`RULE-ORD-01..05` on the same spine:** typed `structures`/`resizes` provenance; **one** DACI
  decision about the mechanism when a unit is still over the declared band plus one owned scope task
  on its manager — never a decision that moves one named report to one named manager; at most three
  blameless prompts for the people whose line moved ("what did you lose in this change?"); one dated
  outcome review that restates the frozen prediction; and a scored median absolute percentage error
  once the window closes, withheld below the floor.
- **Telemetry, not a target list.** CSV scope #47 carries counts and ratios under opaque positional
  design codes — no name, identifier, label, note, individual pay or individual wait — and exports a
  live reading when no design exists. The `Structural design` Insights bucket carries `ORD-01..06`.

**Not claimed:** the span band and coordination hours are declared conventions, not validated
instruments; the queue is a single-server approximation and correlated arrivals between two managers
are not modelled; the channel-scaling counterfactual is a convention that can be wrong in either
direction, which is exactly what the calibration card exists to contradict; there is no HRIS or market
pay feed; and nothing here chooses which person should report to which person. Real-browser and
assistive-technology behaviour of this page remains **[UNVERIFIED]**.

## 2026-11-02 — Important correction: seat privacy and roll-up integrity

**Do not use the Operating Seat as a security boundary.** The previous session's claims of enforced ABAC/RLS are incorrect: the browser has no authenticated identity; `buildContext` passes the full state to ordinary renderers and export functions, and seat resolution errors fail open. The lens and route gate are useful local UI features, not isolation. Restrict the workspace to one trusted operator. The projection's cross-span decisions now require all named people in scope, and aggregate-only records cannot pass `canAct`; these helper changes do not secure the rest of the app.

RULE-SEAT-01 now reconciles its own typed roll-up links on a scan or eligible commit: stale links are removed after reorganisation, closure or sensitivity change; other rules' links are preserved. Removal is audited. The existing cap still limits new links and may require subsequent commits or a scan to finish. Paused or undeclared seats remain inert. Schema unchanged. See the session log for verification and limitations.

## 2026-11-01 — Currency-safe capacity and hiring decisions

Capacity now withholds global allocation and release rankings when estimated values use multiple currencies. The capacity-overload rule still opens a linked trade-off decision, but explains why ranked deferrals are unavailable; suggested scope trims are withheld too. Hiring and Today show vacancy exposure per currency; scenario historical vacancy and shadow-value claims are withheld when their units do not match. Existing decisions are not rewritten. No exchange rates, schema changes or new dependencies are introduced. Full workspace-wide dimensional safety and real-browser accessibility remain **[UNVERIFIED]**.

---

## 2026-10-31 — Case-mix guard for delivery forecasts

Open **Delivery survival → Classes → Operational cases**. The new overlap read compares the current case types in the same two mature day-30 cohorts used by the existing drift check. It prints cohort counts and total-variation distance; a difference of at least 25 percentage points or a recent type absent in the earlier cohort requests review. This is a descriptive convention, not a statistical test or causal diagnosis. Current types can have changed since intake; normalized older records may default missing types to `risk`, so the check cannot prove historical overlap.

When the mix triggers, **Cost of waiting** marks affected case rows low-confidence without changing prices or probabilities. An explicit survival scan opens a linked review decision and, if an active owner can be resolved, a task; it challenges relevant frozen survival readings and can link a re-freeze task to the latest exposure certificate. No messages are sent. SURV-12 surfaces the warning and the survival brief includes it. Evidence is refused if either cohort has fewer than eight records or a harvested type is unknown. This first slice covers case type only, not severity or other work classes.

The survival harvester also no longer counts a future-dated exit as already observed. An unassessed transport axis can no longer produce an overall supported headline; an untestable exit cause is not described as a stable mix. **[UNVERIFIED]** full repository and legacy tree, real-browser/assistive-technology walkthrough, usefulness in the field. Existing case normalization can replace an invalid/missing closed date with today, so the harvest fix cannot recover dates already repaired by normalization.

## 2026-10-31 — Forecast transport guardrail

Open **Delivery survival → Classes** (`#/survival?panel=classes`) to check whether historical delivery behaviour still describes recent work. Fixed start cohorts (30–89 versus 90–149 days ago) receive equal 30-day follow-up; Mantel–Cox log-rank tests use Holm correction across all six classes. Requires 8 items per cohort and 6 observed exits. Restricted mean time to **any exit** supplies the direction; abandonment is not success.

A detected shift lowers **Cost of waiting** confidence to low without changing declared prices or probabilities. **Scan** creates one review decision per class/week, links up to 20 affected open records, and creates a five-day evidence-check delegation if the leader resolves to an active person. No owner is invented. All changes use the existing atomic post-commit/persistence spine and append audit events. No dependency or schema change.

Limits: observational diagnostic; assumes independent items/censoring and comparable case mix. Fixed windows can miss other shifts. Holm controls this scan's six comparisons, not repeated looks over time. No detected shift is not proof of stability. Generated decisions freeze the diagnostic as text, not a reconstructable statistical snapshot.

Verification: 108 targeted tests passed (calendar drift, survival and cost of waiting), including real API propagation and reload. Full legacy/repository audit remains **[UNVERIFIED]**.

## 2026-10-30 — Price the week, not the list: the Attention Market (Schema v57)

Every screen in this workspace owns a queue and each one reports its own attention count. None of them answered the question a manager actually opens the product to ask: **I have eleven hours this week — which eleven hours should they be, and what does the twelfth cost me?** A merged, severity-sorted list cannot answer it, because it cannot say that two rows are the same item in different modes, it cannot say that handing work off moves it into somebody else's week, and it prices nothing. The consequence is the one every manager lives with: the obligations that carry a number win, and the ones that do not quietly stop being scheduled — with no decision on record, because nobody made one.

`#/attention` answers it. Every obligation the workspace can price becomes one group of mutually exclusive choices — **do it yourself**, **hand it off**, or **let it carry** — and the week is solved as a multiple-choice knapsack under **two** ceilings: your declared hours, and a delegate pool that stops the plan from handing everything to the most reliable person and calling it a strategy.

- **Nothing is invented.** Exposure comes from the record that already exists: a case's three-point cost estimate, a funded item's effort and value, a negotiation's stakes over your own BATNA, a dependency's measured daily impact and time-to-recover, an overspent budget, a priced decision frame. An obligation with no money is listed as `unpriced` with the hours it consumes, because work that cannot enter an optimisation is a fact the leader needs, not a row to delete.
- **The price of your next hour is measured.** The same market is re-solved with one more hour and the change is the price. A zero means the budget is not binding — which is an answer, and one most leaders never get.
- **Optimal when it can be, honest when it cannot.** Small markets close exactly by branch and bound and say "optimal" with a zero gap. Larger ones fall back to Dyer's relaxation with a Lagrangian dual minimised by golden-section search, and print the distance to a bound they can prove. No printed number claims more than it has.
- **The forgone set gets a price and an owner.** `RULE-ATT-03` writes **one** decision covering everything the plan refused, with the expected value it gives up, so "I was too busy" stops being free.
- **A plan is held to its own number.** Committing freezes the budget, the bought set, the forgone set and every success probability. The review re-reads each bought record, excludes items that have not moved (a plan is not wrong for being young), and scores the frozen probabilities with a Brier term over settled items only.

**What the build found:** the first convex-hull pruner removed the *cheap* dominated option instead of the expensive one, which silently deleted every delegation from the market; `effortDays` was being priced as the *leader's* hours, allocating 423 hours of "attention" against a 12-hour budget; and delegation, offered automatically on an uninformative prior, handed all ten obligations to one person because a hand-off looked strictly better than doing the work. All three are fixed and the first is now a regression test. Effort-days are team effort, so the module applies a **declared leader share** (default 10%), prints it beside every derived figure, and lets you override any row.

**Competitive benchmark (vendor documentation and peer-reviewed literature, not independent validation):** the algorithms are decades old — [Dyer (1984)](https://link.springer.com/article/10.1007/BF01580667) for the multiple-choice knapsack relaxation, [Fisher (1981)](https://pubsonline.informs.org/doi/10.1287/mnsc.27.1.1) for Lagrangian bounds. Enterprise connected-planning platforms (Anaplan, Pigment, o9) solve capacity allocation at company scale with a modelling team and a pipeline; calendar optimisers (Reclaim, Clockwise) allocate time *blocks* rather than priced *obligations*; Cloverpop logs decisions without allocating a manager's hours [UNVERIFIED — public product descriptions only]. LeadOS's narrower claim is the binding: objectives derived from the leader's own dated records, constraints on their own week and their team's own measured reliability, a frozen prediction, and a forgone list written into the decision register with its cost. That is a feature-shape comparison, not a claim of category-first status. See [ADR-0047](docs/adr/0047-attention-market-constrained-allocation.md), [`RESEARCH.md` §82](RESEARCH.md) and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

## 2026-10-30 — Plan the tests, not just the next one: the Sequential Investigation Planner (Schema v56, unchanged)

The Information Value Terminal priced one test at a time. A leader with three open tests saw three independent net values and no answer to the question that actually matters: **what do I run first, what do I do after each result, and when do I stop?** The new **Sequence** tab (`#/voi?panel=sequence`) answers it. It solves the declared test menu exactly by backward induction over up to three stages, conditions the belief by Bayes' rule after each settled test, and draws the decision tree as a nested list with the recommended path.

Every number is inspectable. The Sequence tab shows the stop value, the best single test, the full-sequence value, the second-stage gain, the expected number of tests run, each test's raw net value alone (negative when a test does not pay for itself, matching the register), and the assumptions the plan rests on: binary tests, conditional independence given the true state, and a finite menu. It refuses explicitly for unpriced frames, probabilities that do not sum to 100, settled evidence that cannot all be true, and excludes coin-flip and untargeted tests from the menu. Its limits are capped and printed rather than hidden: at most six tests (any excess is counted), and at most three stages.

Three marker-idempotent rules on the shared post-commit spine act on the plan:

- **`RULE-SEQ-01`** writes one advisory note giving the conditional plan when a second stage adds at least the materiality threshold.
- **`RULE-SEQ-02`** opens one commit decision, with each frame option priced under the current belief, when the plan says to decide now. A later stop revises that open decision in place; a decided one is never edited.
- **`RULE-SEQ-03`** creates one owned task on the frame owner for the next planned test, dated to that test and linked back to the frame. With no owner, it records a note and invents no assignee.

A worked example in the test suite (Vendor status read at 60/70, free; Load test at 70/70, USD 20 fee and wait) gives a plan of 550 against 520 for deciding now, a second-stage gain of 24, and a 1.39 expected number of tests. The planner's numbers were then checked by hand against the Bayes update and the backward induction; they agree.

**Consistency with the existing engine is tested, not assumed.** Across 60 deterministic random frames, each test's one-stage net equals the existing `evaluateInquiry` net within rounding. A perfect test is worth exactly the EVPI on top of the stop value (700 = 520 + 180), and a duplicate test adds nothing.

**Competitive benchmark (vendor documentation, not independent validation):** SpiceLogic's Decision Tree Analyzer computes EVPI from a hand-built tree and highlights the recommended policy after each result ([SpiceLogic docs](https://spicelogic.com/docs/decisiontreeanalyzer)). SmartOrg's Supertree "automatically re-orders tree nodes to calculate values of information and of control" ([SmartOrg](https://smartorg.com/supertree-sensitivity/)), so automatic sequencing is not new in that category. TreeAge Pro is listed at a one-time $450 price on a third-party directory [UNVERIFIED — the price was not checked against the vendor]. Cloverpop's public descriptions cover capturing decisions, rationale and outcomes; we found no description of a test-sequencing calculation [UNVERIFIED]. A [third-party scoring page](https://www.rfp.wiki/artificial-intelligence/decision-intelligence-platforms/cloverpop) rates its simulation and scenario testing at 3.2/5 [UNVERIFIED]. LeadOS's distinct combination is narrower than "sequential decision analysis": the exact plan is kept inside the decision register, its tasks and notes are written by the same event spine, and it is re-read on every settlement. We did not find evidence that the competitors above tie a plan to owned tasks and a decision log, but that is a search limit, not a proof of absence. See [ADR-0046](docs/adr/0046-sequential-investigation-planner.md), [`RESEARCH.md` §81](RESEARCH.md) and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

## 2026-10-30 — Calibration now changes the decision sensitivity (Schema v56)

LeadOS now carries a leader's own scored probability history into the **money and option sensitivity of an open decision**. The Calibration panel compares declared EVPI with a shrinkage-weighted scenario and a marginal Wilson-corner range, then reports whether the expected-value option changes across those tested scenarios. It refuses to calculate when any target probability band has fewer than three historical observations or the payoff table is incomplete.

When a new VOI frame has enough evidence, `RULE-LCAL-04` appends one explicitly non-prescriptive stress note and up to three typed `calibrates` links to the prior settled forecast frames that contributed the evidence. A later settlement also backfills eligible already-open frames (bounded to 20 per sweep, with a remainder event). The declaration and any frozen snapshot are never rewritten. This is a descriptive stress—not a posterior, forecast, or simultaneous confidence interval—and samples are not corrected for within-frame clustering. See [ADR-0045](docs/adr/0045-calibration-to-decision-sensitivity.md), [`RESEARCH.md` §80](RESEARCH.md), and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

**Competitive benchmark:** People-platform AI coaching (Culture Amp) and MCP/in-flow leadership assistants (Teamspective) make contextual action guidance a current product direction; forecasting platforms such as Metaculus return proper-score feedback. LeadOS joins the leader's score history to a specific business frame's EVPI with inspectable typed evidence. This is a public-feature synthesis, not a verified first-to-market or effectiveness claim.

Verification and release status for this change are recorded in the session log.
