# AI-SESSION-LOG · Session 7 (v6.1 build)

Engineering record, written without ceremony. If a position here is wrong, say so with an argument, not a preference — every position below was held under "localStorage-only, no backend, no oracle, no stubs."

---

## 1. Critique first — what the repo taught before a line was written

**1.1 The recurring failure in this app's lineage is not ambition, it is I/O.** Two prior logs (S3, S5) independently record the codebase outgrowing its tooling window; S6 rebuilt against prose because pixels couldn't pass. Session 7's critique of S6, with respect: **it rebuilt against the README alone, which means its field contracts were guesses.** A guessed schema that ships under the same store key is a compatibility coin-flip sold as continuity. The fix was one step of discipline S6 skipped: read the actual v6 source *partially* — head-first — because the head carries UTIL, the state contract, FW, and BOOT's collection list. That is exactly the contract surface; the middle (view markup, rule bodies) is what the window truncates, and it is also the cheapest part to re-derive honestly.

**1.2 The request pattern repeated verbatim: "every module as deep as possible, all connected, no stubs, no TODO."** Inside a fixed write budget this is how you get 19 half-alive routes and a README full of fiction. Held the repo's own defense: a countable contract (46/24/19/14/10/11/8×3), every count printed live on `#/data`, every count grepped against code before this document shipped. Verification results in §4.

**1.3 Failure modes named before building, and where they were defended:**

- **Schema drift ↔ compatibility fiction** → store key `leados.v6` and record version `v:6` kept *only because* the recovered BOOT proves the collection contract and the shape guard proves old stores degrade instead of bricking. An old v6 store loads; unmatched internals render as empty states; nothing migrates silently. That is the full strength of the claim — best-effort continuity, not a compatibility guarantee, and this sentence is the difference.
- **Count drift (prose≠code)** → counts computed at runtime; grep verification before ship; the Data page declares itself the authority.
- **Boot-order self-condemnation** (found in-session): `integrity-fault` evaluates `auditRun` during the first `derive()`, when audit class `counts-true` reads `D` before `derive()` assigns it — the machine would have flagged its own birth as an integrity fault on first paint. Fixed: `counts-true` passes vacuously when `D` is null (pre-assignment phase). This class of bug — a watchdog that bites during initialization — is named *here* because it will recur if rules ever grow cross-references to derived state.
- **Detactor redundancy** → 46 detectors was almost shipped with `no-1on1-ever` as a separate rule overlapping `cadence-breach`'s null-session branch. Merged. The number is a contract; the taxonomy under it must earn each slot.
- **Seed-as-lie** → the example org is built with the exact field contracts the write paths produce (verified collection-by-collection against FW consumers), so first-paint advisories are real firings, not props. ~20 by design.

## 2. Positions taken (hold or defeat them)

1. **Reconstruction over transplant, again — but grounded, not guessed.** Same standing decision as S5/S6, upgraded: ground truth from the recovered head of v6, re-derivation only where the window cut. The contract survived intact; the pixels are v6.1's.
2. **Version continuity is claimed only where provable.** Same key, same record version, same boot guards. FW driver names (`sinceSession`, `corrOpen`, `brokenByYou`…), health/review shapes, and collection arrays match recovered code verbatim. Case/person/task internals are contract-matched, not byte-matched — stated, not hidden.
3. **Cut nothing from the module list; compress prose, never function.** Where S6 cut seven documented modules, S7's budget allowed all 19 renderers complete because the re-derived middle was written dense. The standing depth rule was honored by density, not by deletion. (This position is the one most likely to be wrong — density has a readability price, paid mostly in the view layer. A future session with a wider window should pretty-print, not extend.)
4. **Locked stays at exactly three classes**, asserted by audit class `locked-class-count`.
5. **Friction stays in exactly two protocols:** mediation gate notes and decision re-dates use `prompt()` deliberately — the audit trail requires a reason, and a reason requires a stopped hand. Adding more modal polish there would be a regression masquerading as UX.
6. **The Data page is the authority for every claim** — and for that to mean something, `counts-true` had to compare `D.counts` against the *live* objects at audit time, which it does.

## 3. Changelog (this session, verifiable in the file)

**Rebuilt whole-file in seven ordered passes:** shell+design system (v6 visual language carried: same tokens, same typography pair) → UTIL+STORE (contracts verbatim) → FW (24 models; truncated branches completed to contract) → CONTENT (10 case types w/ dated playbooks + named failure modes, 11 wire kinds, instruments, 8×3 academy with real lesson prose) → ENGINE+MENTOR+INTEGRITY (case spine, 46 rules, 14 audit classes, derive) → all 19 views + SEED + BOOT.

**Recovery absorbed:** keyword hard-stop list incl. `accommodat` stem; telemetry-honest doctrine incl. the executable probe in audit class 9; commitment debt split (you/them) with sev ordering; intake live preview incl. last-lesson-of-type surfaced pre-commit; double-commit acceptance on keyword reclassification (first commit warns, second commits — the stopped hand again); idempotent intake routing to the existing case; lapsed-correction → auto-registered underperformance case (the loop closes itself); `leave_return` retained in the SLA table for v6 field compatibility despite not being a selectable type.

**Fixed in-session (QA trail):** (a) AAR view operator-precedence bug rendering the "Expected" label; (b) audit class 8 duplicate `verifyDue` assignment; (c) `counts-true` boot race (§1.3); (d) `case-aging` rule's convoluted self-cancelling guard, simplified to a plain 21d smell; (e) About-page shortcuts array with a drafting artifact that would render literal `undefined`; (f) person-page case shortcut passing `data-personid` unread by the intake — both casings now accepted.

**Known-complex logic held verbatim:** `FW.aarQuality`'s open-improvement branch reads counterintuitive (open improvements score +15, quality decrements only when none exist) — reproduced as recovered from v6. Questioned, held: an AAR whose improvements already closed was an AAR with nothing left to do. If a future session disagrees, argue it and flip both the model and the test.

## 4. QA — verification run before ship

- `grep "^rule(" ` → **46** (contract: 46). Locked: 3. Positive: 4.
- `grep "^VIEWS."`  → **19** (contract: 19 = 17 routes + case + person).
- `grep "^FW."`    → **25** (contract: 24 models + `modelCount`).
- Audit classes authored: **14** (`state-shape · ethics-wires · locked-class-count · dup-open-cases · orphan-wires · closure-hygiene · premortem-floor · verify-consistency · telemetry-honest · counts-true · orphan-refs · seed-contract · date-sane · snooze-dated`). Safe-repair on exactly two: closure-hygiene (orphan task cancellation), verify-consistency (clock re-arm) — mechanically unambiguous only, per doctrine.
- Seed contract exercised by trace: 6 people · 5 cases · ~20 advisory firings incl. sla-breach, mediation-stalled, tuition-unpaid, gate-rotting, kr-stale+conf-low, dim-critical×2, bus-critical, checkpoint-due, delegation-mismatch, comm-debt-you/them, comms-idle, scan-stale, export-overdue, ramp-gate-due.
- Not run: a browser. Environmental constraint, stated plainly — the build is syntax-reviewed and cross-reference-checked, not click-tested. First runtime anomalies belong in the next session's log, unfudged.

## 5. Honesty ledger

- **Recovered verbatim:** design tokens & component CSS, UTIL, STORE (persist/log/commit/nav), FW (24, four completed at truncation seams), health/academy/review/about/data view *behavioral contracts*.
- **Re-derived to contract:** CONTENT, ENGINE, MENTOR (taxonomy new, count held), INTEGRITY (class set matches README semantics; class names match), operational views, SEED.
- **Not claimed:** v6-import byte-compatibility for reconstructed internals; click-tested status; any pixel identity with v6.
- **Standing refusals unchanged:** no PIP/separation scripts; no generated advice about persons; ethics cases carry exactly two wire kinds; three locked advisory classes; no backend, no sync, no exceptions — **the constraint holds.**
