# ROADMAP

Living document. Status is per capability, not per file. Every "Done" line was verified
by an automated test or a measured run in the session that claimed it; anything else is
marked `[UNVERIFIED]` and is not counted as done.

Last updated: 2026-10-24 (session 1 of the standing brief).

---

## Done — and verified this session

| Capability | Where | Verified by |
|---|---|---|
| Zero-build app that boots and routes | `index.html`, `app/main.js` | `tests/app/app.test.mjs` (boot, all routes, unknown route) |
| Versioned store, migrations, quarantine on corruption | `app/core/store.js`, `app/core/schema.js` | core tests; corrupt-blob integration test |
| Append-only event log with cap | `core/store.js` | integration test (audit event written on each action) |
| Person roster: add, validate, XSS-safe, archive/restore | `views/people.js`, `actions.js` | integration tests (validation, `<script>` in a name rendered as text) |
| 1:1 logging incl. moved/skipped as signals | `domain/oneonone.js` | domain + integration tests |
| Agenda generated from the record, with reasons | `domain/oneonone.js` `suggestAgenda` | domain test + person-page test |
| SBI feedback with live quality coaching | `domain/feedback.js` | integration test (quality meter, rejection of empty behaviour) |
| Feedback balance and follow-ups | `domain/feedback.js` | domain tests, rules `FB-03`–`FB-05` |
| Goals with computed progress, pace and check-ins | `domain/goals.js` | integration test (check-in moves progress) |
| Goal with no key results reported as unmeasured | `domain/goals.js` | integration test `KR-less goal` |
| GROW plans scored stage by stage | `domain/growth.js` | domain tests |
| Competency coverage | `domain/growth.js` | growth view render test |
| Evidence-gated succession readiness | `domain/readiness.js` | integration test (unsupported "ready now" flagged) |
| Anonymous pulse with a k-anonymity floor, unanimous suppression, threshold on comments | `domain/pulse.js` | domain + integration tests |
| Pulse windows on calendar days (no double-counting) | `domain/pulse.js` | domain test on window boundaries |
| Decision log (DACI, reversibility, options, rationale, review) | `domain/decisions.js` | integration test (log → decide → review) |
| Recognition ledger + drought detection | `domain/insights.js` `REC-01` | view + insights tests |
| 33 rule families with severity, evidence, one action | `domain/insights.js` | domain tests (determinism, shape, urgency) |
| Repetition collapsed above 3 people, names preserved | `domain/insights.js` `rollUpFindings` | domain + integration tests (24-person roster) |
| Today: health, next actions, due 1:1s, pulse prompt | `views/today.js` | full-demo render test |
| Health score: 5 dimensions, null-safe weighting, honest trend | `domain/health.js` | domain tests + demo baseline |
| Export / import / reset / demo, with demo protection | `core/store.js`, `views/settings.js` | integration tests (round-trip, demo refusal) |
| Accessibility: skip link, focus trap, Escape, focus return, `aria-live`, AA contrast | `ui/dom.js`, `styles.css` | integration test (Escape + focus return); contrast measured |
| Dialogs cannot survive a route change | `app/main.js` | integration test |
| Roster search that does not steal focus | `views/people.js` | integration test |
| 82 automated tests | `tests/app/**` | `npm test` |

Baseline measured on the demo workspace (`2026-10-24T10:00:00Z`): health **53.3 (D)**,
trend **+0.5** vs 30 days ago, pulse **n=5**, overall **2.55/5**, safety **2.8**, workload
**2.0**, change **−0.59**; **27 findings, 9 urgent, 2 wins**; all 13 routes render with no
console errors; worst render 90 ms with 45 people (jsdom).

---

## Next (ordered by value, not by ease)

1. **Feedback latency, not just recency.** Add `observedOn` to feedback entries and score
   the gap between the event and the conversation. Research note: latency is a stronger
   early warning than "days since last note" (`RESEARCH.md`, standing debt 1).
2. **Goal co-authorship.** A field recording whether the person helped set the objective,
   and a `GOAL-06` finding for leader-authored goals on someone else's behalf. Gallup:
   involvement in goal setting is strongly associated with engagement.
3. **Performance review preparation.** Assemble a review packet from a period: goals and
   outcomes, feedback themes, 1:1 notes, growth progress — with every claim linked to its
   record, and a self-review section the person fills in. This is the biggest missing
   piece of the leadership lifecycle and the one a first-time manager is least equipped
   to do alone.
4. **Review calibration warnings.** Flag when the leader's written assessments diverge
   from the record (e.g. "exceeds expectations" on a person with no logged feedback).
5. **Delegation log.** What was delegated, to whom, with what authority, and whether it
   came back. Fills the one lifecycle gap that currently has no data at all.
6. **Conflict resolution.** A structured record for a conflict: parties, interests,
   agreed process, resolution and follow-up. Currently only visible indirectly through
   pulse safety.
7. **Team-level trends for every dimension** (not just pulse), with the same
   "not enough history" honesty the health trend already has.
8. **CSV export** alongside JSON, for people who want the records in a spreadsheet.
9. **Print/PDF review packet** — the print stylesheet exists; the packet does not.
10. **Optional encryption of the local store.** A passphrase-derived key (WebCrypto,
    still no network) would make the "data lives in this browser" claim survive a shared
    laptop. Requires a migration path for existing unencrypted stores.

---

## Later / deliberately deferred

| Item | Why deferred |
|---|---|
| Multi-user, org hierarchy, shared workspaces | Requires a backend, accounts and an honest privacy story. The current invariant is "no network, no server", and breaking it needs an ADR, not a sprint. |
| Upward / 360° feedback | Needs multiple raters to mean anything (see `RESEARCH.md` §10). |
| Notifications, email or calendar sync | A browser tab cannot schedule work; promising reminders it cannot deliver would be a silent failure. |
| Mobile app | The responsive web app is the mobile app until there is a reason otherwise. |
| AI/LLM assistance for drafting feedback | Needs network calls and would put unreviewed text in front of a person's record; the SBI coach is deterministic and auditable. Revisit only with a local model and a clear provenance marker. |
| Sentiment analysis of pulse comments | Unverifiable inference; violates the no-fabrication invariant. |
| Gamification (streaks, badges) | Rewards logging rather than leading; the scores already carry the incentive risk. |

---

## Rejected, with the reason recorded

| Idea | Reason |
|---|---|
| Repairing the Next.js/Postgres tree into the product | It has 6,879 type errors and 352 missing modules; there is no data layer at all. Repairing is a rewrite wearing a maintenance costume. Preserved as evidence, documented as non-canonical. |
| Keeping four apps "just in case" | Four half-products are why nothing here ran. One app, one entry point, one test suite. |
| Soft-deleting demo data silently | Replacing a leader's real records with fabricated ones is the worst possible failure mode; the store refuses without explicit confirmation. |
| Showing a pulse average under the anonymity floor | Makes individual answers recoverable by subtraction. Suppression is shown as a state, with the count, so it never looks like a broken chart. |
| Scoring missing data as zero | Turns "no evidence yet" into "failing". Unmeasurable dimensions are excluded and the weights renormalise. |
| A hard validation block on vague feedback | People stop logging. The app coaches instead, and keeps the note. |
| Trend lines with a single data point | Implies knowledge that does not exist; the UI says "not enough history" instead. |
| Self-assessment quizzes (leadership style, personality) | Not falsifiable against records, and they invite the leader to substitute a label for observation. |
| A numeric "leadership score" for the leader | Would turn a diagnostic tool into a grade, and the grade would be gamed. Team health is measured; the leader is shown their behaviour, not a mark. |

---

## Known gaps I am not pretending are closed

- Pulse anonymity cannot be guaranteed in teams of 3–4; the copy says so.
- The health trend depends on records older than 30 days; fresh workspaces show
  "not enough history" rather than a line.
- "Weekly meaningful feedback" is the evidence-backed cadence; the default target is 21
  days because it is achievable, and the difference is stated in Settings.
- Rehearsal against real usage is absent: every number in this file comes from the demo
  workspace and the test suite, not from a manager's actual quarter.
