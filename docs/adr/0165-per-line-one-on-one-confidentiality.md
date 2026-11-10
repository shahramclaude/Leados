# ADR-0165 — A declared line is an accountability, not a readership of the conversation: per-line 1:1 body confidentiality

- **Status:** Accepted (Session 228, 2026-11-10)
- **Schema:** v132 unchanged — no collection, no stored field, no rule, no action, no setting, no migration. A pure read-boundary change (`viewScope.js`) plus a fail-closed guard on three existing write doors (`toggleMeetingAction`, `addMeetingAction`, `setActionOwner`) and honest rendering (`#/oneonones`, `#/people/:id`, `#/prep`).
- **Surface:** every screen that renders a 1:1 body; `#/oneonones`, the person page and the prep sheet print a printed reason instead of content; no new route, no CSV scope (an identity-free export of another line's conversations would be a second leak wearing a report's clothes)
- **Altitude / structure:** frontline / mid-manager PRIMARY × matrix — the altitude that lives in these rooms — with director, VP and the C-suite read-side behaviour unchanged (individual-class detail ceiling already withholds bodies above rank 2); a single-chain workspace behaves exactly as before

## Context

Session 226 put a declared additional line inside the Operating Seat's read scope (`seat.lineScope`) so a second-line manager gets the accountability the declaration creates: the work, the promises, the cadence. That was correct for work records and wrong for **conversations**. A 1:1 record (`oneOnOnes`) holds free-text notes, a mood grade, an agenda whose every line is something the person asked to raise, and promises made in the room — individual-class material (`RECORD_POLICIES.oneOnOnes`, detail ceiling rank 2). Before this ADR, `scopedViewState` passed any meeting naming a person reachable through `lineScope` into the projection **in full**: a project manager who reached Sam only through a 40% declared line read the notes of her home manager's 1:1 with Sam on the exact same screens the home manager used. Session 226 flagged this on a live fixture; Session 227 merged the 1:1 holder-attribution slice with the defect named as an explicit merge blocker; this ADR closes it.

A declared line is an **accountability** (someone must answer for the share) — not a **copy of the room** (what was said between two other people). Holmström & Milgrom (1991) multi-task agency cuts both ways: two principals each need to know the work is happening; neither needs the other's private supervision notes to do their own job. Jaques' time-span of discretion places conversation content at the manager-and-week rung; nothing about a second line raises a reader into the room.

## Decision

One rule, one place, no second hierarchy (`meetingPrivacy.js`, built on the SAME `buildMatrix` → `buildSeats` → `activeSeat` engine every matrix module uses):

For any stored 1:1 row and any resolved seat:

| Meeting's recorded holder | Seat holds the line-only reach… | Verdict |
|---|---|---|
| this seat (`heldById === seat.id`, any basis incl. `claimed`) | — | **body readable** — one's own record of one's own duty |
| a *different* recorded holder (any basis) | tree or line | **withheld** — the room is identified; nobody outside it reads inside it, not even the home tree |
| none recorded (every pre-v132 row) | tree scope | **readable** — the pre-ADR-0165 rule; a single-chain workspace is *exactly* as before |
| none recorded | line only | **withheld** — never attributed by inference |
| — (row otherwise unreachable) | neither | not projected at all (existing sideways rule); if reached anyway, fail closed |

Withheld rows keep the **fact** — id, person, date, `dateUncertain`, status, `heldById`/`heldByBasis`/`heldByAt`, `createdAt` — and lose everything conversational: `notes`, `mood`, `agenda`, `resolvedTopics`, `actions`. Stubbing happens only in the per-render projection (`scopedViewState`); persisted bytes, normalization and the storage schema are untouched. The stub carries `bodyWithheld` + `bodyWithheldReason` so every renderer can print the reason instead of content — never a blank that reads as an empty room.

The same verdict guards the three legacy write doors that mutate a meeting's body, refusing the mutation outright (`meetingBodyRefusal`) — an unresolvable boundary is a refusal, never a courtesy invitation. `logOneOnOne`'s own cross-line rules (`lineOnly`) already refuse closing another line's promise at log time; this ADR closes the remaining doors. ADR-0086 release grants (explicit, recorded, consented) remain the one legitimate cross-boundary path for content — consent opens the room, an accountability declaration does not.

### Claiming is attestation — considered, not accidental

A seat may still **claim** an unattributed meeting on its line (`oneOnOneLineClaim`): the claim writes `heldById = seat.id`, `heldByBasis = 'claimed'`, emits its own event, and fails if a holder is already recorded. After the claim the room is identified as the claimant's — which is the semantics of the claim, not a side door: a false claim is a recorded, named act on the shared spine (visible to the person, the home manager and the operator, and reversible via release), exactly how the product treats every other recorded human attestation. What the claim may never be is a way to read a meeting that already names a different holder — it refuses those, and this ADR leaves that refusal standing.

## Consequences

- The project manager sees that a 1:1 happened, when, whether it held or was skipped, and who it is attributed to — never what Sam said, asked, felt or promised there.
- The home manager's room is exactly as private as the project manager's: visibility no longer follows merely being close to the person, it follows **being in the conversation or being handed it by one**.
- Cadence and line-coverage readings (date/status only) are unaffected; quality grades, promise counts and prep-sheet "since we last spoke" content for a withheld meeting are withheld with the same reason, never computed from an empty shell. Aggregate signals a line-only seat computes therefore derive from its *own* conversations — by design, not by omission.
- Single-chain workspaces: no additional line exists, so no withheld branch is reachable — default unchanged, pinned by test.
- The undeclared operator view (`__operator__`) is byte-for-byte unchanged, pinned by test.

## Limits and non-goals

- The seat system is a **local disclosure contract, not authentication** (ADR-0076); a browser-owner can always read localStorage. This boundary is about the workspace's own governance of who sees what, and about defense-in-depth against the product's own projections leaking sideways — not a promise against a hostile device.
- `people[].talkingPoints` (the person's own queue) already rides only `PUBLIC_PERSON_FIELDS` across a line; the same boundary class has **not** been applied to `feedback` conversation bodies, which remain line-readable at rank ≤ 2 — recorded as a Planned gap, not fixed here.
- Rank ≥ 3 seats were already capped at counts by the individual class; this ADR changes nothing above rank 2.
- The marker fields (`bodyWithheld`) exist only in memory projections; import/export/scheduling are not certification grounds for this boundary.

## Evidence

`tests/app/meeting-privacy.test.mjs` (7/7): line-only fact-not-body with holder/tree/legacy rules all honoured; home-cannot-read-project's recorded room; legacy tree rule preserved; single-chain inert; operator byte-identical; write doors refused; JSDOM render never prints withheld text while disk bytes stay verbatim; claim-as-attestation round trip. Adjacent suites (1:1 holder slice, line coverage, operating seat, matrix line seat, prep, ownership, reconcile, cadence-matrix, disclosure-compiler, jurisdiction-matrix, mission-control, mission-command-flow, onboarding, transitions, budget-exposure, decision-robustness, execution-loops, continuity-coupling, changes-spc, cases-automation, resilience, standalone 7/7): all green except the pre-existing stale schema-version pins also failing on the untouched base commit (verified by `git stash` re-run, identical failure sets). No store, schema, rule or CSV change; `npm run check:boundary` PASS (689 modules / 216 suites / 23 doc checks, 0 leaks); `npm run lint` PASS on changed files; `LeadOS-standalone.html` rebuilt (10,623,814 bytes / 687 modules — ceiling unchanged).
