# AI-SESSION-LOG · Session 5 (v5 build)

Engineering record, written without ceremony. If a position here is wrong, say so with an argument, not a preference — these were held under the constraint "localStorage-only, no backend, no oracle, no stubs."

---

## 1. Critique first — what v4 actually was

**1.1 The v4 tree is 261 KB of single-file application.** Deep, coherent, and — on inspection of its README contract — honest about its own counts (which is more than most codebases manage). The spine was right: one registration point, N wires, a ledger, checked closure. Session 5 keeps that shape deliberately.

**1.2 Failure modes that were present or latent in v4, named before fixing:**

- **The loop back to the leader was quieter than the loop into the org.** v4 tracked what the org owed; it under-instrumented what the *leader* owed (commitments broken-by-you, calibration drift, tuition unpaid). A mentor that only audits downward trains its user to audit downward. v5 splits commitment debt (broken-by-you vs owed-to-you) onto the Today page and adds decision calibration grading.
- **No doctrine page.** v4 asked for total trust and explained it only in a README file the operating user may never open. A system that claims "mentor by all means" must state its judgment contract in-app. v5 ships `#/about`.
- **Advisories that can't clear train users to ignore advisories.** Ramp-gate "missed" counters were historic-only; hitting the gate left the advisory glowing. Fixed — `gateHit` recomputes openness.
- **One bug class worth recording as a warning:** any UI deadlock inside a safety protocol (e.g., a stage-6 advance button that saves but can't advance) erodes trust in every *other* gate. Found and removed in mediation.
- **Diffing a 261 KB blob through a narrow tooling window is malpractice.** The README is the contract; the rebuild honors it and logs what was knowingly compressed instead of pretending a byte-level transplant happened.

**1.3 What v4 had right and v5 keeps verbatim in spirit:** escalation hard-stop in the write path; idempotent intake; premortem enforcement for Type-1 at the form layer; closure verification at +30d; "tuition unpaid" language; positive-signal lane; storage reality stated in the UI.

## 2. Positions taken (hold or defeat them)

1. **Rewrite over blind patch.** A coherent v5 that preserves the documented contract beats a corrupted v4. Cost: some v4 surface detail (Tuckman override, finer time-mix math, full KR versioning) is consciously compressed. Recorded in the honesty ledger, README §Honesty.
2. **Positive signals are not decoration.** Three rules exist solely to reinforce verified closures, mood brightening, and lesson streaks. Detection-only mentors produce risk-averse operators.
3. **The mentor may lock three things only.** escalation-open, HR-task-due, integrity-fault. Expand that list and the lock stops meaning anything. Declined an internal suggestion to lock verify-overdue.
4. **Every count on the README is grepped and re-counted live.** Claims outrun code in this family of apps; the Data page is the tie-breaker.
5. **No AI text generation of advice.** The app scores, sequences, and drafts structure — never judgment. Non-negotiable, and it's also what keeps the app fully offline and legally defensible.
6. **Ethics class stops at record + evidence + HR task, and the audit checks it.** `ethics-wires` fails the audit if an ethics case ever crosses that line. Not a style choice; it's the difference between a tool and a lawsuit.

## 3. Changelog (this session, verifiable in git/index.html)

**Architecture** — carried: STORE / UTIL / FW / CONTENT / ENGINE / MENTOR / VIEWS / INTEGRITY / SEED+BOOT in one script; delegated `data-a` actions with colon-namespaced payloads; `data-ch` change handlers; generic `openForm` builder killing ~40 bespoke form modals of boilerplate; command palette; keyboard layer (`/`, `C`, `0–9`, `Esc`) with input-focus guards; print styles for HR packet/briefs.

**New module `#/about`** — judgment contract, refusal list, module map, live counts. Replaces README-as-doctrine.

**Mentor engine — 59 rules** (grep-verified), 3 locked, 3 positive. Notable additions over the inherited set: `pressure-spike` (vs 7d baseline, not absolute), `load-high`, `comm-debt-you`/`them`, `leave-return`, `salary-band`, `scorecard-gap` (compares-before-scoring detection), `coach-stale` per lead, `energy-low`, `weekly-due`, `mood-dropping`/`pos-mood` pair, `bench-gap`, `aar tuition-unpaid`, `neg-underprepped` (BATNA < 40), `verify-due` (closure), `gate-missed` (now clears when hit).

**Case spine** — 15 types, 14 wire kinds, ledger with click-through routes, cross-linking both directions with timeline entries on both cases, per-type "known failure modes" rendered on the case page. Intake reclassifies to `ethics_hr` on keyword hits *and tells you which words tripped it before commit*.

**Closure discipline** — outcome+lesson mandatory; orphan tasks cancelled with count; +30d verification (verify or re-open); sev ≥ 4 arms AAR and the inbox enforces "tuition unpaid"; a lapsed +21d feedback verification **auto-opens a fresh underperformance case** — the loop closes itself.

**People instrumentation** — flight risk with 8 weighted drivers and daily per-person history; trust sliders writing to the equation with self-orientation dividing; blended 4-slider pulse feeding flight slope; nine-box click-stamp (rows = potential) with 120d expiry and band labels; replacement economics with exposure estimate tied to flight band; re-armable 30/60/90 gates.

**Team instrumentation** — Edmondson with correct reverse-scoring (2/4/6), five-dysfunctions sequential stepper, bus-factor-per-capability, composite health with component bars, derived bench (nine-box × trust × delegation ladder → readiness + exact next rep), retro engine writing owned dated stop/start tasks.

**Governance** — direction-aware KR scoring + trajectory sparks, expired-goal grading ritual (lessons mandatory even for drops), P×I register w/ ADKAR first-gap coaching, stakeholder quadrants + 14d manage-closely cadence, comms drafts from the case spine with send-or-kill + dates.

**Judgment tooling** — decision journal with premortem → risks, re-date requiring recorded reason, outcome-based calibration grading vs stamped confidence; BATNA lab (floor advisory, ladder, redacted draft, rot rule); meeting verdicts with annualized cost + factory flag + journaled async savings; AAR with causality-validated whys and blameless stop checkbox; academy (12 lessons × 4 checks + application notes) and a 4-scenario × 3-stage simulator with two-tier consequence scoring (4/2/0) and persistent best runs.

**Integrity** — 18 executable audit classes; 9 safe-repairable (mechanically unambiguous only); quick-check subset runs continuously and locks the inbox unsnoozably on fault; import (v5-only) with deep id re-mint + post-import audit; prune reports counts, doesn't guess.

## 4. QA found this session (kept as a record of care, not pride)

- **Syntax error, self-inflicted:** a stray object-literal-in-array line (`['a':'']`) would have bricked the entire script at parse. Caught on review before ship; removed.
- **Strict-mode ReferenceError:** dead code assigning to an undeclared binding inside `forEach` in the energy modal. Removed.
- **Advisory that couldn't clear:** ramp-gate `missed` never recomputed. Fixed (positions §1.2).
- **Mediation stage-6 dead advance button** (position §1.2). Removed.
- **Case list mislabel:** displayed bucket *totals* where the row's own bucket belonged. Fixed.
- **Audit-fix ordering:** table was written then immediately destroyed by re-render. Reordered to render-then-run.
- **Mentor prose typo** ("they'reArmoring") — cosmetic but the mentor's voice is a trust surface; fixed.
- **Non-English token** (`收回`) leaked into SLII mismatch string. Removed.
- **Filler model** (`calm`) deleted to keep FW honest — every model is now used by a view or a rule.

**Counts, grepped against the build:** rules **59** (two ids contain digits; a naive `[a-z-]+` grep undercounts to 57 — noted so nobody "fixes" 59 to 57), models **33**, renderers **27** (24 routes + 3 workspaces), case types **15**, wire kinds **14**, scripts **8**, lessons **12**, scenarios **4×3**, audit classes **18**.

## 5. Watchlist for Session 6 (ordered by leverage)

1. **Decision calibration curve** — enough closed decisions with confidence stamps to plot a reliability diagram (60%-confident things should happen ~60% of the time). Infrastructure is already collected; needs the visual + drift advisory per band.
2. **Case aging heatmap across scopes** — cross-link exists; the aggregate view (which scopes accumulate crossing cases over a quarter) would catch systemic rot earlier.
3. **Delegation ladder trend per lead** — bench reads point-in-time; a 90-day ladder-elevation slope per lead would make "coaching your coaches" measurable, not rhetorical.
4. **Meeting-cost sink ledger** — killed-meeting savings are journaled loosely; formalize a cumulative savings counter with dates (the CFO-shaped argument for the whole meeting designer).
5. **Import rewiring is string-based O(refs²)** — fine at 5 MB; if anyone forks toward multi-profile, replace with id-prefixed mapping at parse time.
6. **Session transcript structure** — session notes are free text; a light schema (mood / one decision / one fear) would let the mentor read subtler trends. Keep it optional; mandated structure becomes theater.
7. **Do not:** accounts, sync, cloud, AI-advice generation, PIP automation, anonymous comparison. Each was declined this session for cause; the reasons haven't changed.

## 6. Handoff

Files in tree: `index.html` (entire app), `README.md` (v5 contract), `AI-SESSION-LOG.md` (this file). Boot = open `index.html`. First paint builds the demo org through the production engine; erase via `#/data` when the real org arrives. The Data page is the authority on all counts. Export weekly. Write every note as if read aloud in the grievance room.

— Session 5 staff engineer, out.
