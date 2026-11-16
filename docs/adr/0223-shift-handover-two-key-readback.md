# ADR-0223 — Shift handover & two-key readback ledger

- Date: 2026-11-15
- Status: Accepted — Shipped (Session 300)
- Primary duty: frontline / mid-manager boundary transfer; director / VP oversight
- Structures: single-chain and matrix
- Source schema: v178; route `#/shift-handover`; CSV #165; rule `RULE-SHO-01`

## Context

The workspace can measure the routine the shift runs (`standardWork.js`), whether a station can be manned (`stationCoverage.js`), the rest between shifts (`workRest.js`) and designating leave cover (`dutyCoverage.js`) — but it could not record the HANDOVER itself. Day shift ends with an abnormal station — an interlock jumpered and tagged out, a permit that expires at 02:00, an action owned by "maintenance, Wednesday" — and night cover, frequently on a second, matrix line, works the board the clock handed them, not a two-key boundary transfer.

`altitudeRouter.js` names missed night-shift handovers in prose; no module models one. A word-boundary search of `app/` and `ROADMAP.md` for `shift handover`, `shift handoff`, `shift changeover`, `I-PASS`, `SBAR` and `turnaround handover` returned zero implementations before this build (broader semantic absence **[UNVERIFIED]**). This is the gap Session 297 hunted and logged as Planned (Step 3); this session builds it.

## Source design implemented

Three collections (`shiftHandovers`, `shiftHandoverReadbacks`, `shiftHandoverMarkers`) start EMPTY at upgrade; `MIGRATIONS[177]` adds them and the `shiftHandoverAutoPropagate` convention. No brief is inferred from the roster, station windows, duty roster, standard work or the work/rest ledger: nothing in those records says that a station changed hands, and a brief invented at upgrade would fabricate a boundary transfer — and its missing readback — that no human declared.

The registry is a pure leaf (`#/shift-handover`). Fail-closed normalizers, a single pure reader (`buildShiftHandover`), seat-checked actions (`createShiftHandoverActions` + `accessGateway` `RECORD_POLICIES`), a post-commit rule (`RULE-SHO-01`, spine rule **139/139**) and a four-tab view (`Briefs`, `Readbacks & disputes`, `Escalations`, `Method`) share one vocabulary:

- **The brief is the outgoing operator's key** — first person only. Severity (`routine | watch | abnormal | emergency`, I-PASS), station reference, a station summary, a structured open-action list (bounded at 12; unowned actions are printed as unowned, never auto-assigned or re-assigned), active waivers/abnormalities in bounded text, and a required contingency (`if it moves, do this`). A declared `dueAt` (readback owed by; at most 72h out) and `cancelled{on,byId,reason}` all-or-none. One operator cannot hand a station to themselves; the incoming operator must be a different, active roster person.
- **The readback is the incoming operator's key** — first person only, and the actor MUST BE the declared incoming operator. `synthesized` requires the receiver's own words (≥ 24 chars); `disputed` requires its named reason (≥ 24 chars). A contained handover is immutable history; a dispute stands until the incoming operator records a later synthesis; a clock-in, a silence and the outgoing operator's confirmation are never keys.
- **Between the keys**, the register prints the derived state (`awaiting-readback | disputed | contained | cancelled`), the `overdue` modifier (no grace, no rounding — past `dueAt` and uncontained), unowned-action counts, and cross-line vs same-line boundary classification. `countsReconcile` (parts re-add; every readback references a held brief) and `figuresComplete` (no overdue uncontained brief; no emergency-severity brief uncontained) are separate claims, reported separately.
- **Escalation (`RULE-SHO-01`)** for an overdue uncontained or disputed brief asks the lowest seat above EVERY line of BOTH operators (`matrixJointApex` over the union of the outgoing and incoming operators' active manager lines) — never one peer line over the other, never either operator. A diamond tie files one ask per joint apex; a graph that cannot name such a seat writes ONE identity-free `shiftHandoverMarkers` observation and substitutes nobody. Asks are opaque `act-inform` delegations (no station, no name, no abnormality), idempotent per (signature, addressee), self-closing, bounded at 4 per commit, pause-governed on every path (`shiftHandoverAutoPropagate`) including the explicit scan.
- **Two altitudes, one ledger, redacted honestly**: manager-altitude seats read brief names and content in their span; at rank ≥ 4 without full access, identities are withheld (`outgoingName`/`incomingName`/`actorName`/`ownerName` → null) while counts, station references, severities and escalation routes remain — the same posture as the Duty-Without-Means register. Handover counts are NEVER ranked per person and are printed as changeover-debrief context only.
- **Cancellation** is the outgoing operator's own act, only before any readback exists (a changeover that did not happen leaves no phantom two-key fact).
- **UI & asset**: four-tab `#/shift-handover` view with declare/readback/cancel dialogs and method diagram `app/assets/shift-handover-two-key.jpg` generated via built-in `generate_image` (Higgsfield returned `unsupported` — reported, not faked).

## Verification

- `npm run lint`, `npm run check:boundary`, `npm run check:links`, `npm run check:a11y`, `npm run verify:standalone` and the focused suites (`shift-handover`, migration chain, CSV, pause-permits, propagation) are recorded in `AI-SESSION-LOG.md` for this session. The full `npm test` run and a real-browser/assistive-technology walkthrough are **[UNVERIFIED]** unless the log says otherwise.

## Benchmark and limitations

Category bar: Shiftconnector (Eschbach), j5 Operations Management (Hexagon), Epic I-PASS handoff workflows, and ISA-95/ANSI shift-log standards for control of documented changeovers. No hands-on evaluation of any of these was performed this session; the implementation encodes I-PASS and HRO boundary-transfer doctrine from the published literature (Starmer et al. 2014; Patterson et al. 2004; Reason 1990; Weick & Sutcliffe 2001/2015; citation details from memory, **[UNVERIFIED]**) rather than any vendor's workflow engine. Competitive parity is **[BENCHMARK-UNVERIFIED]**.

This is local-first boundary-transfer discipline, not authentication or tenant isolation; seats are declarations. The register does not clock anyone in or out, does not integrate an LMS/permit system, and does not record physical lockout/tagout state — it records what the humans declared at the boundary. A handover whose readback window lapsed while the outgoing operator was still on station is an operational fact this register reports, not repairs.
