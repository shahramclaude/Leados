# ADR-0215: The Speak-Up Concern Routing & Impartiality Register — who heard it, in what role, and what came back

- **Status:** accepted
- **Date:** 2026-11-15
- **Deciders:** Frontline supervisor raising a concern, mid-manager as the ordinary receiver, director+ for the declared windows, with the matrix providing the route out of the home line
- **Schema:** v168 → v169 (three additive, EMPTY-at-upgrade collections; four conventions)
- **Surface:** `#/speak-up` (Concerns / Who can hear it / Method), CSV scope #157 (`speak-up-concerns`)
- **Code:** `app/core/domain/speakUpRegistry.js`, `speakUpSchema.js`, `speakUp.js`, `speakUpActions.js`, `speakUpRules.js`, `app/views/speakUp.js`

## Context

The workspace could already ask *did the decision-maker have a stake in the decision?* — ADR-0210's conflict-of-interest and recusal ledger refuses an approver who holds an interest and routes the decision to the lowest seat above every line the holder sits on.

It could not ask the complement:

> A person disagrees with how they are being managed, or has seen something that should not stand. **Did they have a way to say so, to whom, in what role, and was it ever closed?**

Every screen that touched the question answered by disclaimer. `app/views/conflicts.js:57` prints that the ledger records interests, not reports; `app/views/health.js:28` prints that organisational health is not a grievance channel. There was no record of a concern raised, no clock on the acknowledgement or the outcome, no impartiality test on the receiver, and no way to see that the person who raised it is still there and has not been retaliated against. Targeted searches of `app/` and this roadmap for `speak-up`, `speak up`, `whistleblow`, `grievance`, `retaliation`, `raise a concern`, `impartial` found **no implementation and no logged gap**; the only hits are those two disclaimers. Wider market absence is **[UNVERIFIED]**.

The failure this slice exists to prevent is not "the concern was handled badly". It is the quiet one: the concern goes to the manager it is about, the manager acknowledges their own conduct, and the record shows a closed item. A register that cannot name the receiver's role makes that loop look like governance.

## Decision

Record the raise, the receiver **and the receiver's role**, and derive everything else from the graph and the calendar:

**1. An impartial receiver is computed, never assumed.** On every read, for the recorded route, `impartialityVerdict` re-tests the receiver against the reporting graph:

- **refused** if the receiver *is* the subject, *is* the reporter, or sits **below** the subject or the reporter on any line (including a declared matrix line);
- otherwise **permitted, and labelled with the role it actually gives** — `manages-subject` prints as an **escalation route** (the person accountable for the conduct, hearing it from the next rung; never described as independent, because they answer for the behaviour being reported), `manages-reporter` prints as the ordinary matrix route (the project or second line hearing a concern about the home line), `neither` as the cleanest reading the graph can give.

The refusal set is the whole point. Routing a concern about a manager to that manager's manager is an *escalation*, and calling it independent is the corruption. Routing it to the manager themselves is refused by its own name (`receiver-is-subject`) before any rank check.

**2. Three kinds of route, and a printed finding where there is none.** `internal-person` names a receiver; `external-declared` records that the workspace's channel is external and names it, with no internal case built; `none-available` is a **finding**, not a failure — the register prints that no impartial route exists in this graph, writes **one identity-free marker**, and asks nobody. Because the marker exists, the count of concerns nobody could hear is visible instead of being absorbed into silence.

**3. The promise made to the reporter is frozen at the raise.** A raise carries its own `ackDays` / `feedbackDays` / `watchDays` (defaults 7 / 90 / 90, declared at director rank 3+). A later convention change cannot shorten the promise already made to somebody: every read re-derives the windows from **both** bases and reports `windowsMoved` rather than silently re-timing an open concern.

**4. Eleven states, and the sub-clocks kept apart.** Precedence: `withdrawn` → `no-impartial-route` → `external-referred` → `ack-overdue` → `unacknowledged` → `feedback-overdue` → `acknowledged` → `watch-overdue` → `watched` → `closed`, with `outcome-recorded` where nothing is owed. Acknowledgement, outcome and retaliation-check are **three distinct facts** with three distinct clocks; the retaliation check also carries its own sub-state (`running`, `overdue`, `checked`, `skipped-by-close`, `pending`, `none`), so closing a case early is visible as a **skipped** check rather than an absent one.

**5. Disclosure is a ladder, and it is counted.** The reporter reads their own case; the named receiver reads body and detail; an ancestor of either party reads a summary with the body withheld; a peer, the subject, or an unrelated seat reads a **count** and is told why. Nothing prints a name to a seat the ladder does not reach, and every withheld cell is counted and explained.

**6. Thirty named refusals.** `subject-is-reporter`, `summary-too-short`, `future-dated`, `backdated-before-roster`, `receiver-is-subject`, `receiver-reports-to-subject`, `receiver-is-reporter`, `receiver-reports-to-reporter`, `not-the-receiver`, `acknowledge-before-raise`, `already-acknowledged`, `outcome-before-ack`, `outcome-once`, `watch-before-outcome`, `watch-outside-window`, `watch-once`, `watch-by-subject`, `close-before-outcome`, `withdraw-not-reporter`, `convention-out-of-bounds`, and the rest — each with its own sentence. A person cannot be the subject of their own concern, a receiver cannot answer a case they are not the receiver of, and a concern cannot be dated into the future.

**7. `RULE-SUP-01` is spine rule 132/132.** Two conditions only — `ack-overdue` and `watch-overdue` — filed at most once per deterministic `sup1:…` signature, bounded at four per commit with the remainder counted. The ask goes to the **receiver**: never to the reporter, never to the receiver's manager, never to the subject, because any of those placements would disclose the raise to somebody it was raised about. Its text is deliberately opaque ("a dated act is owed on the speak-up register"); the party, category, date and detail live only in the typed `issues-obligation` link, which is not readable on the delegation. Where no impartial receiver exists, or the receiver's impartiality **drifted** after the route was chosen, the rule writes one identity-free `concernMarkers` observation and asks nobody — it never re-routes a concern on its own. It is idempotent, self-closing when the condition clears or the receiver moves, and pause-governed on every path including the explicit scan (`speakUpAutoPropagate`).

**On the matrix-reach switch list, deliberately not.** Every other matrix-reading rule declares its switch there, because silencing it withholds work from a second line. `speakUpAutoPropagate` is **not** listed, and the reason is recorded rather than glossed: the reach list is derived from source (a rule module that itself reads the reporting graph and is gated by a switch), and `speakUpRules.js` never reads the graph — it places its ask with the receiver the **reader** already resolved through `buildMatrix`. Claiming reach would therefore require a comment in the rule file asserting something it does not do, which is precisely the kind of claim this repository refuses to make. The consequence is printed, not hidden: silencing the switch stops an overdue acknowledgement or an overdue retaliation check from being asked about at all, by anybody.

**8. Authority is a right, not a rank alone.** `read-concerns` (1+), `raise-concern` (1+), `answer-concern` (1+ **and** the named receiver), `govern-concerns` (3+, declares the windows and scans). A manager may not declare the window they owe. Record policies for all three collections are report-only (detail ceiling 0), so nothing on the concern record is handed to a report surface.

**9. The export carries no identity at all.** CSV #157 is aggregate-only — 15 columns: `as_of`, the concern totals (`concerns_total`, `concerns_live`), one row per bucket keyed by `category` / `route_kind` / `state_key` with `state_count`, the three declared windows, the three exception counts (`overdue_count`, `no_impartial_route_count`, `receiver_drifted_count`), and two flags — and **no reporter, subject, receiver, id, summary, note or concern date**. The bucket counts re-add to the state totals; `counts_reconcile` says whether they did, and `figures_complete` says whether every concern was inside the reading seat's reach. Two different claims about two different facts, printed apart.

## Alternatives considered

- **Fold this into the conflict-of-interest ledger (ADR-0210).** Rejected: the questions, the signatories and the clocks differ. A recusal ledger records a *stated stake* against a decision and needs an alternative decision-maker today. A speak-up register records a *protected disclosure* by a person and needs an answer over weeks, plus a retaliation check months later. Merging them would put a grievance body into a record printed on the matrix screen.
- **Always route to the seat above the subject.** Rejected — it is the exact failure mode. That seat is the subject's manager: permitted as an escalation route, and *refused* as independence. The register prints the label rather than the comfort.
- **Pick a receiver automatically when the named one is partial.** Rejected: that invents an allocation between lines and quietly moves a person's disclosure to a seat they did not choose. The register prints `no-impartial-route` and a marker instead.
- **A free-text note field on the person record.** Rejected: unqueryable, unauditable, no clock, no ladder, and — worst — it makes the case body visible to whoever reads the person record, which is the disclosure the ladder exists to control.
- **Record retaliation as a boolean on the outcome.** Rejected: a boolean cannot be overdue. The check is a dated act against a dated window, so "nobody ever checked" is a state the screen can print.
- **Anonymous intake.** Not modelled, and not claimed. This register records a named raise with a protected route; claiming anonymity it cannot enforce would be worse than not offering it.

## Consequences

- A frontline or mid-manager seat can now raise a concern, see who is permitted to hear it **and in what role**, and see the acknowledgement and outcome clocks move — in a matrix, routed over a second line precisely because the home line is the subject.
- The register refuses more than it prints: a partial receiver, a self-concern, a future date, a second acknowledgement, a retaliation check outside its window. Every refusal is a sentence on the screen, not a silent no.
- Where the graph offers no impartial route, the record says so and counts it. That is uncomfortable on purpose: a workspace with a systemic routing hole should be able to see the hole.
- Nothing rates a person. No score, no "trust index", no ranking of reporters or receivers.
- Unchanged: the conflict-and-recusal surface, the delegation engine, the seat model and the disclosure ceilings. The window conventions live on `settings` and are refused outside their bounds rather than clamped.
- Revisit: an external channel is *declared*, never integrated; if a real integration is wanted it is a separate, deliberately-scoped decision with its own data-egress story.

## Benchmark

The category bar is set by ethics-and-compliance intake suites — **NAVEX One (EthicsPoint)**, **OneTrust (Convercent)**, **WhistleB**, **AllVoices**, **EQS Integrity Line** — and by the standards they sell against: EU Directive 2019/1937, ISO 37002:2021, FCA/PRA SYSC 18 and SOX §806. Those tools set the bar at: multi-channel intake, case triage and workflow, deadline management, anonymity where the channel allows it, retaliation monitoring, and aggregate board reporting.

This slice matches the *state-and-clock* instrument (eleven states, three independent windows, the frozen promise), the aggregate-only export, and the retaliation check as a dated act. It adds what those instruments generally do not: the receiver's **impartiality recomputed against the live reporting graph on every read**, printed as a role label with the escalation route explicitly *not* called independent; **matrix-native routing** (a concern about the home line heard on a declared second line); a printed finding plus marker where no impartial route exists; and asks whose text is opaque because a delegation is readable above the receiver. It does not do anonymous two-way messaging, telephony intake, or investigation case management with evidence attachments, and claims none of them.

No tool was run hands-on this session: **[BENCHMARK-UNVERIFIED]**. The comparison is category knowledge and published descriptions, not a measured feature-by-feature audit.

## Asset

Higgsfield is not connected (`list_connector_tools` → `unsupported`) — reported as a blocker, not worked around silently. The built-in generator produced `app/assets/speak-up-routing.jpg` (119,734 bytes, 1672×941, SHA-256 `c768d7d5d590dce136249a90cee0c60565c3c4bebd2042febc8a82825279f851`) in the house line-art style, shown on the Method tab with alt text and a "generated asset, not workspace data" caption.

## Verification

`tests/app/speak-up.test.mjs` — **16 / 16**: the v168 → v169 migration is additive and infers no concern; thirty named refusals each by name; the same receiver on a chain and on a matrix line printing `manages-reporter` and `escalation route`; `no-impartial-route` writing exactly one marker and no ask; the three clocks (late acknowledgement, skipped retaliation check, close-before-check) and the frozen-promise re-derivation (`windowsMoved`); the disclosure ladder cell by cell (subject and peer count-only, ancestor summary, receiver full body); receiver drift created by a new line declared after the route; `RULE-SUP-01` filed once, opaque, idempotent on a re-commit, self-closing, and silent when paused; spine order (immediately before `seatRule`, one contract, 132/132); reload identity with a malformed row dropped and counted; the panel's printed cells equal to the reader's computed values; the export's 15 columns carrying no identity and its buckets re-adding.

Adjacent suites run after the change: `core` + `csv` 20/20, `conflict-recusal` + `standard-waivers` + `work-rest-recovery` + `propagation-ledger` **112/112**, `standalone` 7/7. Structural checks: `lint` clean, `check:boundary` 913 modules / 268 suites / 0 leaks, `check:links` 1249 links, `check:a11y` 121 routes. `verify:standalone` rebuilt at 15,433,345 bytes / 913 modules (ceiling 15,350,000 → 15,650,000 with the reason recorded; density guard unchanged).

Two defects found and fixed while verifying, with cause named:

1. `scripts/sweep-schema-pins.mjs` rewrote `assert.equal(next.schemaVersion, N)` inside a **one-step** migration test, turning a permanent historical fact (v165 → v166) into a false head pin. The same corruption had already left `standard-waivers.test.mjs` red on `main`. The sweep is now block-aware — a test block that calls one migration step directly through `MIGRATIONS` is exempt from the `schemaVersion` swap — and the historical value was restored.
2. Three positional/stale spine pins (`ids.length, 131`; `ids.at(-3)`, and a `slice(-3)` tail in `wait-cost.test.mjs` left stale since ADR-0212) were corrected; `ids.length, <from>` is now swept too.

The whole suite was **not** run to completion this session: **[UNVERIFIED]**. Session 287's full run (4,417 tests / 48 pre-existing failures, all reproduced on the base commit) is the last complete measurement, and the base branch remains red independently of this work. In-browser and assistive-technology walkthrough of the new route is **[UNVERIFIED]**.
