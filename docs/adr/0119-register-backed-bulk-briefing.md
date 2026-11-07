# ADR-0119 — Register-backed, privacy-scoped bulk briefing on an adopted case

- **Session:** 161 (2026-11-07)
- **Schema:** v113 unchanged (no new collection, no new rule ID)
- **Surface:** `#/mission?panel=capture` (adopted-case brief card)
- **Commands:** `missionCaptureBriefCandidates` (read), `missionCaptureBriefBulkPreview` (read), `missionCaptureBriefBulkDraft` (write, right `prepare-comms`)
- **Altitude:** director (rank 3) and VP / executive (rank 4) PRIMARY; frontline, manager and CEO on the same scoped adapter
- **Closes:** the Session-158 "In Progress" remainder — register-backed, privacy-scoped bulk selection with name disambiguation on the adopted-case brief path

## The duty

A director who has just arbitrated a cross-team constraint does not brief one sponsor.
They brief four in one sitting — the executive sponsor, the manager who owns half the
handoff, the vendor who keeps slipping, the finance partner who will ask what it costs —
each with a different stance. The VP doing the same across divisions briefs six.

Session 158 shipped the single-recipient path: name, explicit power × interest, stance,
preview the exact case-sourced text, one atomic write. Repeating it four times means
retyping four names the register already holds and re-deriving four assessments the
register already carries a dated value for. Worse, it leaves the leader unable to ask the
question that actually matters: **which register people are eligible for this case, and
which must not be reached at all?** A UI that answers that by letting any name be typed
has already answered it wrongly.

## The decision

**1. The audience is derived from the register, never typed.**
`briefCandidates` reads every active `stakeholders` record against the seat's own span and
this case, and puts each in exactly one state with a printed reason:

- `eligible` — in span, qualifies under Mendelow (1981) power × interest (key player) or
  carries an opposing stance, not already on the case;
- `already-on-case` — the single-recipient path reviews and regenerates their existing
  brief rather than duplicating the stub;
- `refused` — outside the operating span (a peer subtree is named as such), or in a
  quadrant that does not qualify for an individual brief.

Selection is by **register id**. Two records that normalize to one name are flagged
`nameCollision` on both rows and refused **as a pair**, because two briefs to one apparent
person is not a reviewed audience.

**2. The selection is assessed as a whole.**
`briefBulkProposal` refuses the entire set if any member is not eligible, if the set
exceeds `maxRecipients` (8), if a selected pair collides, or if the arithmetic
`existing + selected > 25` breaches the case's `normalizeCaseStakeholders` ceiling. The
fingerprint covers every register assessment **and** every rendered body, so a stance
edited in the register, a case fact changed by another module, or a changed selection all
invalidate the preview the human actually read.

**3. One transaction, rules as the only author.**
`missionCaptureBriefBulkDraft` attaches all recipients to the **same case** in one
`store.update`, running the ordinary `propagateCaseEvent` once. `RULE-STK-01` writes one
exact-name `involves` edge per register match; `RULE-COMMS-01` renders one unsent brief per
qualifying recipient. This module writes no draft, no link and no message of its own. In
`afterRules` the produced text is compared, recipient by recipient, against the reviewed
preview; any rule failure, missing draft, body drift or ceiling breach rolls the whole
audience back.

**4. Bulk is a selection efficiency, never an approval one.**
There is no bulk approve, no bulk send, no bulk stance edit. Every created message is
reviewed, edited and approved individually through the Session-158 path.

## Additive storage

No schema bump. A case stakeholder stub carries no `registerId`: `normalizeCaseStakeholders`
keeps a closed key set, so a field it would drop on reload is a receipt that silently
disappears. The durable provenance is the existing `RULE-STK-01` case → register `involves`
edge, asserted across a reload in the suite.

## Verification (one focused pass)

New `mission-capture-brief-bulk` suite **7/7** — register-derived candidates with printed
refusals; whole-set refusal, recipient cap and the computed 25-entry ceiling; one
transaction producing exactly the previewed bodies plus the `involves`/`rolls-up-to` edges,
asserted across a reload; injected rule failure leaving no partial audience; name
disambiguation; VP-altitude span refusal and a jsdom render of the dialog; and the
command-declaration parity (2 safe reads, 1 write on the existing `prepare-comms` right).
Adjacent `command-flow-brief` + `command-flow-merge` 19/20, the single failure being a
**pre-existing** stale pin `assert.equal(migrated.raw.schemaVersion, 112)` in
`mission-command-flow.test.mjs` left behind by Session 160's v113 bump; the migration
really produces 113 and the pin was corrected, after which that suite is **9/9**.
`npm run lint` PASS; `npm run check:boundary` PASS (563 modules / 164 suites / 23 doc
checks); `LeadOS-standalone.html` rebuilt (9,227,170 bytes / 562 modules / schema v113) and
`standalone` **7/7**.
