# AI Session Log — LeadCore continuation engineering

**Session:** Continuation of `wbweve/Leados` (LeadCore spec) → production single-file build
**Constraint set (permanent, non-negotiable):** vanilla JS, no framework, no paid APIs, no OAuth, no credentials, all state client-side in `localStorage`, everything in one deliverable.
**Persona operating mode:** technical peer. Critique first, failure modes named before fixes, positions held under pushback absent a real argument.

---

## 1. Critique raised before building (and what it forced)

1. **Propagation is where these systems die.** A case spine writing into ~12 modules tempts twelve ad-hoc side-effects that drift, double-write, and orphan records. → Mitigation built: single `Engine.createCase` with a **propagation ledger** on every case (`{module, kind, id, label}` per record), prior signal values stored so closure *restores* state instead of smearing it. Closure cancels orphaned tasks by query, not by hope.
2. **localStorage's silent failure mode.** ~5 MB quota, synchronous, and quota overflow throws on write — invisible to users who then lose a day of journal entries. → Mitigation: every write counted, every *failed* write counted and toasted, live quota meter in the top bar and in Data & integrity, export/import as the stated disaster plan ("export weekly" is in the chrome, not a footnote).
3. **The "mentor" framing is a liability if it issues verdicts.** The spec's own division of labour is correct, so it is enforced structurally: all 26 models return score/band/reason/actions and stop there; the escalation test (`ethics_hr`, sev 5, harm/legal/safety keywords) hard-stops automation and redirects to HR; the termination and PIP scripts are guardrails that defer to professionals, not scripts to improvise from.

## 2. What was built this session

Delivered `index.html` — the complete application in one file (~2,800 lines), in layered chunks:

| Layer | Contents |
| --- | --- |
| STORE | `blank/load/save/mut`, failed-write surfacing, quota telemetry |
| UTIL/DOM | dates/esc, toast stack, modal system, **generic form builder** (text/textarea/select/number/range/checkbox/person/team + live model preview), clipboard |
| FRAMEWORKS | `FW.*` — 26 pure scoring models (trust, SL2, delegation L1–7, flight risk, psych safety, five dysfunctions, Tuckman, Cynefin, Type 1/2, Eisenhower, meeting economics, load index, bus factor, 9-box, OKR health, feedback balance, candour, Thomas-Kilmann, performance diagnosis, power-interest, escalation test, cadence, decision calibration, replacement cost, ADKAR, time targets) |
| CONTENT | 15 case types with dated playbooks, pitfalls, signal boosts, module routing; 12 parameterized scripts incl. separation/PIP guardrails; 5 question banks; 15 lessons with drills + scored checks; 6 two-round scenarios |
| ENGINE | classification, playbook dispatch, cross-module propagation with ledger, structured closure + 30-day verification, 1:1 agenda assembly from 6 sources, team health composite |
| MENTOR | 24 detection rules (`RULES`), weighted ranking, cached scan, daily brief |
| VIEWS | 15 routes incl. detail pages; `Actions` registry with delegated clicks; auto-render after settled mutations |
| SEED+BOOT | example org constructed **through the engine** (so playbooks, propagation, advisories are production paths); `C` + `1–9` shortcuts |

Module surface: today, inbox, cases (+detail), people (+dossier), teams (+workspace), 1:1 session runner, feedback, delegation, decisions, performance, portfolio, scripts, academy, self, data & integrity.

## 3. Defects found and fixed in-session (QA pass)

- Malformed string expression in `okr_risk` advisory (comma-operator accident) — rebuilt.
- Flight-risk band typo artifact (`'stabled'.replace`) — replaced with literal band.
- Cases list comparator precedence bug (severity/SLA ordering) — rebuilt as explicit comparator.
- Feedback draft sort inverted (newest-first instead of most-aged-first) — flipped.
- Emoji in two UI surfaces (commitments row, case person chip) — replaced with Lucide icons.
- **No re-render after state-mutating actions** — added deferred render: mutations re-render after the call stack settles; modal-close schedules render so submits never paint stale state.
- 1:1 agenda checkbox toggles left stale modal visuals — toggle now re-opens session modal.
- Flight-risk advisory passed person id in the wrong action slot (landed as team preset; person unset) — fixed parameter order.
- Mood slider inline handler wrote the value into the wrong label node — retargeted to `.rv`.
- 1:1-opener script mode lookup could not match multi-word keys — converted the parameter to a select with exact option values.
- Seed path invoked the interactive 90-day action (spurious toast at boot) — extracted pure `ninetyPlan()` used by both seed and action.
- Stakeholder "touched" label concatenated two relative-date strings — simplified.
- `dys-edit` modal intro contained a stray placeholder-ish string — replaced with real instructional text.

## 4. Intentional decisions (don't "fix" these without reading)

- **Escalation test blocks rather than advises.** Legal/safety-grade content must not be scored. Removing the block is a values decision, not a refactor.
- **Perf-diagnosis wizard refuses coaching output for system/clarity causes.** The block is the feature — three of four performance causes are manager-owned.
- **Render-time lesson sanitizer** (`1️⃣`/`🔹` → styled markup) keeps lesson source copy readable while guaranteeing no emoji glyphs in UI. If you edit lesson bodies, the sanitizer covers the same glyph set.
- **Close schedules verification instead of trusting closure.** A re-open path exists on purpose.

## 5. Known limitations (accepted, stated to user)

- localStorage: one browser, one profile, unencrypted, ~5 MB, wiped with site data. Mitigations exist (telemetry, export); there is no sync by design.
- Tailwind/Lucide/Google-Fonts load from CDN; full functionality needs first-load network. Styling degrades gracefully offline; icons hide.
- Focus-item ordering in the daily brief is a heuristic (overdue-SLA first, then severity) — intentionally simple; false precision here would be worse.
- 9-box/grid visualizations are DOM/CSS, not canvas — deliberate (cheap, accessible, printable).

## 6. Next steps (ordered by value, not effort)

1. Weekly-digest view: auto-composed "week in review" from closures, advisories trend, journal gap — the loop is the product, make it explicit.
2. Case-type statistics: closure rate, avg SLA adherence, repeat-case detection per person (pattern ⇒ structural verdict).
3. Scenario simulator: branching round-2 per round-1 choice (currently fixed round 2).
4. Import-merge mode (append people/cases instead of replace-all).
5. Print stylesheet for 1:1 agendas and evidence logs (grievance-ready exports).

## 7. State of the deliverable

- `index.html` — complete, no stubs, no `// TODO`, no placeholders; grepped clean.
- `README.md` — product + architecture + storage reality + shortcuts.
- `AI-SESSION-LOG.md` — this file.

---

# Session 2 — implementation, improvement, enhancement

Worked the "Next steps" list from session 1 in value order, plus three trust fixes found while building.

## Built

1. **`#/review` — Weekly review (was next-step #1).** Auto-assembled 7-day digest (cases opened/closed, lifetime SLA adherence, 1:1s held vs cancelled with avg mood — *cancelled 1:1s are now tracked*, tasks completed via new `doneAt` timestamps, feedback praise/correction split, journal count, decisions reviewed, snooze pile size) → deterministic verdict narrative → **case-type statistics** (count / closed / avg days-to-close / breach — was next-step #2) with **60-day repeat-case pattern detection** (2+ cases on one person ⇒ structural prompt, not incident framing) → exposure panel (flight-risk ladder, overdue decision gates) → **one-click cadence sweep** (books missing 1:1s at each person's model cadence) → **guided 4-field commitment ritual** (wins / misses / avoided-conversation / ratified top-3). Commit writes a `kind:'weekly'` journal entry and dates the top-3 as tasks. Friday banner on `#/today` if no review within 4 days. Shortcut `0`.
2. **Inbox snoozing (trust fix).** Stateless rules resurrected dismissed advisories every render — that teaches users the inbox cries wolf. Now: signature-keyed snooze ledger (`rule|text-stub` → until-date, 3d), snoozed section with restore, sidebar badge counts only visible advisories. Snooze is deferral with a date, never silent dismissal.
3. **Scenario consequence branching (was next-step #3, v1).** `SC_R2ALT`: every scenario has a damaged-state round-2; round-1 score < 2 routes there with a consequence card. Option content written to consequence logic (recovery paths score 3, doubling down scores 0).
4. **Print stylesheet.** Screen chrome stripped, ink-friendly contrast, `break-inside:avoid` cards, modal-aware (open modal prints the modal via `body.has-modal`). Print buttons on the 1:1 session runner and person dossier (was next-step #5, scoped to the two surfaces that actually get printed).
5. **Import merge mode.** Append-only import: new ids copied, collisions keep local, counts reported. Replace-all-only imports are how backups destroy new data (was next-step #4).

## Decisions this session (don't unwind casually)

- Repeat-case detection thresholds (2 cases / 60d) are deliberately sensitive — false positives cost a conversation; false negatives cost a resignation.
- Review stats use `doneAt` timestamps added to tasks this session; pre-existing done tasks simply don't count toward weekly stats until toggled — accepted, not backfilled (no fabricated timestamps).
- Snooze signatures are content-derived, so an advisory that *changes* facts (new severity, new SLA) produces a new signature and escapes its own snooze. That's the intended behavior, not a leak.

## Still open (re-prioritized)

1. ~~Scenario branching v2: branch keys per chosen option~~ — landed Session 3.
2. ~~Advisory trend history~~ — landed Session 3.
3. ~~Evidence packet export~~ — landed Session 3.
4. ~~Per-person snooze on cadence rules~~ — superseded by proper leave mode, Session 3.

---

# Session 3 — open items, executed in promised order

## Built

1. **Scenario branching v2 (`SC_R2X`)** — option-scoped branches: round-1 options can now carry a `branch` key, and a chosen branch takes priority over the pass/fail alt path. Two dedicated branches shipped: the counter-offer auction (sc1) and the quarantine dodge (sc4), each with consequence cards and their own scored option sets.
2. **Advisory trend history** — one persisted snapshot per day (`S.trends`, 60-day retention, recorded inside `mentorScan`), rendered as three sparklines (open count / risk-grade / weighted pressure ÷10) at the top of `#/review` via a new `spark()` SVG helper.
3. **HR-request packet** — file-check button on the dossier generates a neutral, dated, formal HTML document (record policy statement, evidence log, delivered feedback with asks, diagnoses, improvement plans, case register with outcomes) in a new tab for browser print/PDF. Footer states plainly: local unaudited record, verify against primary sources.
4. **Leave mode** (`person.onLeaveUntil`) — parental/sabbatical/medical. Pauses the `oo_cadence`, `fb_silent`, and `flight` rules (`onLeave()` guard), badges the people table, banners the dossier. Explicitly does NOT touch cases — risk is still risk.

## Also landed

- **Per-person risk history**: every signal save appends `{at, score}` to `p.hist` (24 entries kept); dossier flight-risk card shows the sparkline. Risk is now a trend, not just a point.
- **30/60/90 ramp generator**: one click on the dossier writes 7 dated gate tasks (doc-agreed → first ship → buddy-in-use → day-30/60/90 gates) and injects the first gate into the person's next 1:1 agenda. Regenerate path replaces undone ramp tasks.
- Repair: an edit clipped `evidence-add`'s title line mid-session; caught on grep and restored in the same edit that added the packet action.
- Repair: average-mood expression from Session 2 had an `x/0 → Infinity` render path for mood-less legacy 1:1s (fixed last pass, logged here for completeness).

## Notes for the next engineer

- `S.trends` only accrues on days the app is opened (recorded inside the scan). A week of no opens = a gap in the series; the sparkline is honest about it rather than fabricating continuity.
- The packet HTML is generated as a Blob URL and revoked after 30s — long enough to open, short enough not to leak via session storage.
- Leave rules: `onboard` intentionally NOT guarded (leave overlap with a 45-day window is rare and the dates in the copy would still be true); revisit if it ever nags wrongly.
