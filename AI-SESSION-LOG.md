# AI-SESSION-LOG · Session 6 (v6 build)

Engineering record, written without ceremony. If a position here is wrong, say so with an argument, not a preference — positions below were held under "localStorage-only, no backend, no oracle, no stubs."

---

## 1. Critique first — what the v5 tree actually was when I arrived

**1.1 The repo advertised a Session-5 build and shipped one:** ~257 KB of single-file application plus a README written as a contract, a Session-5 log, and a Session-3 patch file. The doctrine was coherent and — rarer — self-aware: both documents independently record that the codebase had already outgrown its tooling window twice. Session 3 shipped anchored blind patches because the file couldn't move whole; Session 5's log states flatly that diffing a 261 KB blob through a narrow window is malpractice and rebuilt from the contract.

**1.2 The request arriving with Session 6 repeated the classic failure pattern in this family of apps: "every module, as deep as possible, all connected, no stubs."** Taken literally inside a fixed output budget, that sentence is how you get 24 half-alive routes and a README full of fiction. The only honest reading is the one this repo itself institutionalized: hold the contract, pick the module set you can make *complete*, and write the cuts in an honesty ledger instead of shipping stubs and silence.

**1.3 Failure modes named before writing a line, and how the build defends against each:**

- **Breadth theater** → cut seven documented v5 modules rather than thin everything (ledger, README §Honesty). Depth rule's price, named.
- **Counts drifting from code** → the Data page computes rules/models/renderers/audit-classes live; the README says "if prose and code disagree, the Data page is the authority." Carried verbatim from v5 because it is the single best anti-lying device in the tree.
- **Fabricated telemetry** → Session 3's `estimated` doctrine absorbed *at birth*: untouched 1:1 pulse sliders write the flag; `FW.moodSlope` filters estimates; audit class `telemetry-honest` re-checks the invariant at runtime. Not re-patched — never regressed.
- **Advisories that can't clear** → every rule has a computable clear-condition; ramp-gate hits clear the advisory at write time; export clears on export; snooze is dated and never permanent.
- **The mentor auditing only downward** → commitment debt splits broken-by-you vs owed-to-you on the Today page; `comm-debt-you` is sev-2, higher than `comm-debt-them`. A mentor that only audits downward trains its user to audit downward — v5's critique of v4, still correct, still encoded.
- **UI deadlock inside a safety protocol** → mediation advance is a single idempotent write; gates are checks on content, not modal state machines.

## 2. Positions taken (hold or defeat them)

1. **Continuation rewrite over blind patch — same standing decision as Session 5, invoked deliberately, not habitually.** The v5 blob could not be fetched *and* republished inside this window at fidelity; a corrupted v5 serves nobody. The contract survived the transfer; the pixels did not, and the ledger says which pixels.
2. **Cut scope before faking it.** Simulator, negotiation lab, hiring pipeline, meetings engine, skip-levels, self/energy, P×I register — out. Each exit named in the README. The standing depth rule outranks the feature-list instinct.
3. **No generated judgment.** The app classifies, scores, sequences, and drafts *structure*. It does not write advice for a termination, a harassment allegation, a medical disclosure — those write paths hard-stop. This is also what keeps the app fully offline and legally defensible.
4. **Locking stays at exactly three classes** (escalation-open · HR-task-due · integrity-fault). Asserted by full-audit class `locked-class-count`, so a future session that inflates the lock list fails its own audit.
5. **Positive signals are not decoration.** 4 rules exist to reinforce verified closures, mood brightening, lesson streaks, clean handoffs.
6. **Friction is sometimes the feature.** prompt/confirm in mediation stage-notes and decision re-dates is intentional — the audit trail requires a reason, and the reason requires a stopped hand.
7. **The Data page is the authority for every claim.** Live `RULES.length`, `Object.keys(FW)`, `Object.keys(VIEWS)`, audit class count. A README number that can't be grepped against runtime doesn't ship — and for that to be true, the duplicate renderer key found in QA (§4) had to go, because it would have made the live count a lie by one.

## 3. Changelog (this session, verifiable in the file)

**Architecture** — carried: STORE / UTIL / FW / CONTENT / ENGINE / MENTOR / VIEWS / INTEGRITY / SEED+BOOT in one script; delegated `data-a` actions + `data-f` forms + `data-ch` change layer; single `derive()` recomputation pass after every write; command palette; keyboard layer (`/`, `C`, `0–9`, `Esc`) with input-focus guards; top-bar save-state with red WRITE FAILED; print styles.

**Case spine** — 10 types, 11 wire kinds, idempotent intake with dup-refusal routing to the existing case, live intake preview (Cynefin + hint, Eisenhower, SLA runway, keyword hits named, exact propagation list, last-lesson-of-type surfaced *before* commit), cross-linking both directions with timeline entries, per-type known-failure-modes rendered on the case page, comms drafts with send-or-kill lifecycle.

**Closure discipline** — outcome+lesson mandatory at form layer; orphaned playbook tasks cancelled with count; +30d verification (verify or re-open, re-open writes the reason into the timeline); sev ≥ 4 arms AAR; the `tuition-unpaid` advisory holds until the AAR exists; a lapsed +21d feedback verification **auto-registers an underperformance case idempotently** — the loop closes itself without manager discipline.

**People instrumentation** — flight risk with weighted drivers *and the reasons rendered*, trust equation (Credibility + Aptitude + Reliability) ÷ Self-orientation with live band, nine-box click-stamp expiring at 120d view-time, evidence ledger with case backlinks, re-armable 30/60/90 gates whose advisory clears at gate-hit, dev plan, archive/restore.

**1:1 engine** — cadence tightens to 7d when flight band is HIGH; auto-agenda assembled from six sources (open prior commitments, case-injected queue, feedback drafts, person-looped tasks, question bank with deterministic weekly rotation, queued manual items); covered claim marks prior commitments done and drops queue items on finish; pulse sliders with touch-tracking and the `estimated` flag.

**Feedback studio** — SBI/AID/COIN live assembly + lint (identity-language, missing time anchor, weak verbs, thinness), praise 48h / correction 72h ageing clocks on drafts, deliver → evidence + +21d verification, sustained/lapsed outcomes, balance board with 60–85% zone and per-person ledger.

**Practice** — SLII skill×will sliders → style/rung suggestion with mismatch warns both directions; delegation checkpoints re-armed with logged sighting; debrief verdicts (autonomous/rescue/failed) write evidence. Mediation: six stages, order enforced, behavior-floor stage, locked gates at 1 and 4, one-write halt to ethics case, agreement embeds evidence to both parties + arms +14d verification.

**Direction** — direction-aware KR scoring with confidence as the leading indicator (≤2 arms an advisory), stalled-KR / off-track / expired-ungraded rules, grading ritual requiring causal lessons; Type-1/2 decisions with premortem ≥3 enforced at the form layer and re-asserted by audit, re-date-with-reason ledger, confidence-stamped calibration grading; fortnight pulse with deltas and per-dimension playbook text on criticals; Edmondson scan with correct reverse-scoring (items 2/4/6); five-dysfunctions *sequential* stepper with next-rep suggestion; bus-factor capability map.

**Mastery loop** — weekly review (auto 7d digest, 8-week case-pressure spark, copyable 60-second upward brief, guided 4-field ritual, lesson journal fed by cases/decisions/goals/AARs); AAR with numbers-mandatory, causality-validated whys, blameless gate, owned+dated improvements armed as loops, live quality score; Academy with 8 lessons × 3 checks + application notes, and the PIP/separation refusal card where scripts would otherwise live.

**Integrity** — 14 audit classes (9 quick subset runs inside `derive()`; full set on `#/data`), safe-repair for the three mechanically unambiguous classes (task/feedback/session orphans), quick-faults arm the locked `integrity-fault` advisory, v6-only import fail-loud + merge with quoted-string deterministic re-mint + post-import audit, prune reports counts, example org load/erase gated on the `exam` flag, factory reset double-confirmed.

## 4. QA found this session (kept as a record of care, not pride)

- **NaN in weekly question rotation:** `+weekKey().slice(5)` produced `"W07"` → `NaN`, which would have injected the literal string `undefined` into 1:1 agendas. Class: silent telemetry of the worst kind — *fabricated content that looks intentional*. Fixed with explicit parse + `Math.abs`.
- **Event listener accumulation on the modal root:** the GROW question-chip click handler bound to `#mroot` on every session open — handlers would multiply-fire and duplicate inserts. Re-scoped to the form element.
- **Missing change-delegation listener:** the `CHANGES` registry existed with zero dispatch — the trust sliders, the one interactive write that bypasses a submit, would have updated nothing. The *kind* of bug that survives demo day and dies in week two. Delegated `change` listener added.
- **Locked-advisory typo** (`ESC ALATION`): cosmetic, but the mentor's voice is a trust surface; fixed before ship.
- **Archived-person renderer crash:** `derive()` computed per-person stats only for the active roster while the profile route can render archived people. Stats now computed for all people; rules still scope to active. One redraw-class bug removed.
- **Honesty by omission:** trust-slider change handler carried a tautological toast (`FW.trust(FW.trust? …)`) from a draft; noisy and meaningless. Removed — sliders commit silently, like every good instrument.
- **Duplicate renderer key** (`casePage` + `case` alias) would have inflated the live renderer count by one — deleted, because the Data page is the authority and authorities don't round up.
- **Seed artifact:** a deliberately filtered empty timeline node (`A(19)+0?'':A(19)`) left in the crisis seed reads as what it is — an authoring shortcut. It is inert; logging it instead of laundering it.

## 5. Watchlist for Session 7 (open by design, not forgotten)

1. **`quickIntegrity()`'s class filter is redundant** (three overlapping predicates that collapse to `!ok`). Correct, ugly: simplify to a whitelist so a future noisy class doesn't force a lock.
2. **Pressure math is case-derived, not calendar-derived** — a calm org generating many tiny cases reads as pressure. Consider weighting by sev.
3. **Decision `created` exists on all new records**; two seed decisions carry it explicitly. If any out-of-band record ever lacks it, `decision-aging` silently skips — the audit should assert presence.
4. **Merge-import re-mint is string-based** (quoted-id, longest-first). O(refs²), bounded by the ~5 MB store, audit-guarded post-import. A shared-prefix id scheme would harden it; current ids don't share exploitable prefixes, so this is watchlist, not bug.
5. **The mnemonic center of gravity is `derive()`** — every rule runs every commit. Fine at 46 rules × ~5 MB; if Session 7 doubles the rule set, memoize per-collection hashes before reaching for a framework. That temptation is how these files die.

---

*Session 6 close. The build runs at `index.html` — one file, no install, no network. The loop is the course.*
