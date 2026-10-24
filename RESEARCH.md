# RESEARCH — what the rules are based on

This file records the leadership frameworks and evidence behind LeadOS, and — more
importantly — what each one turned into in code, or why it was rejected. It is updated
every session. Rules named here are the same ids the app shows on every finding.

The bar for inclusion is not "it sounds like good leadership". It is: does it give the
app something *checkable* against records the leader can enter? Frameworks that only
produce adjectives are recorded in `ROADMAP.md` under "Rejected" with the reason.

---

## 1. Situation, Behaviour, Impact (SBI)

**Source.** Centre for Creative Leadership's SBI model; used widely as the structure for
feedback that can be heard without triggering defensiveness.

**Why it matters.** Feedback fails for two reasons that have nothing to do with
courage: it generalises one moment into a character trait ("you're always
dismissive"), and it omits the impact, so the receiver has no reason to change.
Gallup's manager research found meaningful feedback is the single lowest-rated manager
behaviour and among the strongest predictors of engagement — only 16% of employees say
their last conversation with their manager was extremely meaningful ([Gallup, *A Great
Manager's Most Important Habit*](https://www.gallup.com/workplace/505370/great-manager-important-habit.aspx)).

**Implemented.** `app/core/domain/feedback.js` → `validateSBI()` scores specificity on
three axes and returns coaching for each gap, live, while the note is being written
(`views/feedback.js`, `ui/modals.js`). Rules `FB-01` (never recorded), `FB-02` (stale),
`FB-03` (praise only), `FB-04` (criticism only), `FB-05` (follow-up due).

**Deliberately not implemented.** A hard block on vague feedback. People stop logging;
a coach that explains is worth more than a validator that refuses.

---

## 2. GROW (Whitmore)

**Goal → Reality → Options → Will.**

**Why it matters.** Most development plans stop after Goal ("get better at influence")
and never reach Will (a dated action the person owns). The plan then functions as
evidence of intent rather than a mechanism for change.

**Implemented.** `app/core/domain/growth.js` → `growCompleteness()` scores how many of
the four stages have real content behind them (Options needs two distinct routes; Will
needs a dated commitment). `planHealth()` refuses to call a plan healthy without a
committed action. Rules `GROW-01`…`GROW-05`, plus competency coverage gaps.

---

## 3. Radical Candor and the feedback balance

**Source.** Kim Scott's *Radical Candor* — care personally, challenge directly;
"ruinous empathy" is praise-only feedback that avoids the hard conversation.

**Implemented.** The praise/constructive balance per person (`BALANCE_LABELS`) and two
separate findings: `FB-03` for praise-only, `FB-04` for criticism-only. Two distinct
failures need two distinct interventions.

**Caveat recorded.** Balance is not a target ratio. A person who is performing well
should receive mostly praise; the finding fires on *absence* of one kind over a long
window, not on a ratio being "wrong".

---

## 4. Psychological safety (Edmondson)

**Why it matters.** Safety is the precondition for every other signal here: if people
cannot raise problems, the leader's picture is systematically wrong, not merely
incomplete.

**Implemented.** Pulse dimension *safety* ("I can raise a problem or admit a mistake
without penalty"), aggregated anonymously. `PULSE-03` fires below 3.0/5 and says
plainly that every other signal is compromised while it stays there. The app treats a
suppressed pulse as a finding in its own right (`PULSE-02`), because "we cannot see" is
itself a risk.

---

## 5. Situational leadership (Blanchard) and onboarding

**Implemented narrowly.** Rather than a style inventory (which would be a quiz, not a
tool), the app uses *tenure and record density* as the situational signal: a joiner in
their first 90 days with fewer than two logged 1:1s gets `ONB-01` at high severity, and
dimensions that cannot yet be measured for a new joiner return `null` instead of zero.

**Rejected.** Asking the leader to label each person's development level (D1–D4) and
adapting advice to their own self-assessment. It is unfalsifiable and it makes the
leader do the classification work the app claims to do.

---

## 6. One-to-ones: consistency over frequency

**Evidence.** Gallup's manager research links frequent, development-focused
conversations with engagement; managers account for ~70% of the variance in team
engagement ([Gallup](https://www.gallup.com/workplace/713033/managers-and-team-productivity.aspx)).
Vendor analysis of manager-effectiveness products makes a sharper operational point:
*consistency* (held vs scheduled over eight weeks) predicts better than frequency,
because cancellation teaches a team that their time is the flexible variable.

**Implemented.** `cadence()` computes status from real dates and a configured cadence,
plus `skippedStreak` and `adherence` over the last four meetings. `CONV-02` (overdue),
`CONV-03` (due), `CONV-04` (streak of moved/skipped). Agenda generation
(`suggestAgenda()`) turns the person's record into a reason for each item, so a 1:1 has
content before it starts.

**Design consequence.** A *moved* 1:1 is recorded as a signal, not deleted — deleting it
would make adherence uncomputable and flatter the leader.

---

## 7. Goals: OKRs, and the difference between unmeasured and zero

**Frameworks.** OKR (objectives + measurable key results); Gallup finds employees whose
manager involves them in goal setting are substantially more likely to be engaged, while
only ~30% report experiencing it.

**Implemented.** Progress is computed from key results. Expected progress is computed
from elapsed time. The gap drives `GOAL-01` (behind pace / overdue) and `GOAL-02`
(flagged at risk). `GOAL-04` fires when a goal has no key results and reports the goal
as *unmeasured* — never as 0%, because a missing number and a bad number demand
different responses. `GOAL-03` tracks check-in staleness.

**Planned, not done.** Recording whether the *person* co-authored the goal (Gallup's
involvement finding). The data model has no field for it yet and inventing a checkbox
that nothing checks would be decoration. See `ROADMAP.md`.

---

## 8. Decision quality: DACI, reversibility, and pre-registered rationale

**Frameworks.** DACI (Driver, Approver, Contributors, Informed) for role clarity; the
"reversible vs irreversible" distinction (Bezos' one-way/two-way doors) for how much
process a decision deserves.

**Implemented.** `decisions.js` + `views/decisions.js`: roles, reversibility, options,
rationale captured *before* the outcome, a review date, and a review that records what
actually happened. `DEC-01` for decisions that have gone quiet; `DEC-02` for reviews due.
"Outcome known but never reviewed" is treated as a completed loop only when the review
is recorded.

**Why before, not after.** A rationale written after the outcome is a story, not a
forecast, and it cannot teach the leader anything about their own judgement.

---

## 9. Recognition

**Evidence.** Only ~23% of employees strongly agree they get the right amount of
recognition; those who do are about four times as likely to be engaged, and employees
who do not feel adequately recognised are about twice as likely to say they will leave
within a year ([Gallup](https://www.gallup.com/workplace/236441/employee-recognition-low-cost-high-impact.aspx),
[Gallup & Workhuman](https://www.gallup.com/workplace/651812/organizations-redefine-feedback-including-recognition.aspx)).

**Implemented.** A recognition ledger that requires *what the person did* (not "great
job"), a per-person recency row so a drought is visible as a row rather than a feeling,
and `REC-01` for people who have not been recognised in the window.

---

## 10. Succession and 360° feedback

**Implemented.** Evidence-gated readiness (`readiness.js`): a "ready now" claim with
thin supporting evidence is flagged (`READY-01`) rather than displayed as fact;
`SUCC-01` finds seats with no ready successor.

**Rejected for now.** Full 360° collection. It needs multiple raters per person and
therefore a multi-user system; in a single-leader local app it would be one person's
opinion dressed up as a circle. Gallup's finding that fewer than half of employees can
formally feed back on their manager is exactly why this matters — and exactly why a
tool that pretends to do it alone would be dishonest.

---

## 11. Anonymity thresholds in pulse surveys

**Evidence (fetched this session).** Published floors cluster at 5, with 3 as the
weakest defensible minimum and 10 for sensitive topics. Culture Amp's default reporting
group minimum is 5 and applies to *combinations* of groups; 15Five defaults to 5 and
allows 3 or 4; Lattice publishes a floor of 3 that admins may raise but never lower;
Microsoft Viva Glint uses 3 for confidential surveys and 10 for comments. Guidance also
names the **homogeneity attack**: if everyone answers identically, the aggregate reveals
each individual's answer regardless of group size, and thresholds must apply to every
slice, not just the top level ([FeedbackPulse on k-anonymity](https://feedbackpulse.com/resources/survey-anonymity-thresholds),
[15Five confidentiality](https://success.15five.com/hc/en-us/articles/8359259684507-Confidentiality-for-engagement-surveys),
[SurveyMonkey best practice](https://www.surveymonkey.com/mp/anonymous-employee-surveys/)).

**Implemented (corrected this session).** The default floor was raised from 3 to 5
(`DEFAULT_SETTINGS.pulseMinResponses`). Comments are now held to the same floor as
scores — previously a single comment in a five-person team was shown, which is
effectively a signed memo. Identical answers are suppressed with an explicit reason
(`aggregate().blockedReason === 'unanimous'`). The UI always states the threshold and
the count rather than showing a bare empty state, and anonymity is enforced in the data
model: anonymous responses have no `personId` field, and the normaliser strips one from
hand-edited imports.

**Known limitation.** In a team of three, no threshold can promise anonymity. The
Settings copy says so rather than implying otherwise.

---

## 12. Frameworks considered and rejected

| Framework | Why not implemented (yet) |
|---|---|
| **Kotter's 8 steps** | A change-management sequence, not a weekly leadership habit. Would need a change programme object with its own lifecycle; nothing here measures progress through it honestly. |
| **Tuckman stages** | Team-development stages are a narrative, not an observable. Any inference from recorded data would be astrology with a citation. |
| **Servant leadership inventories** | Self-report questionnaires. This app scores behaviour against records, not self-image. |
| **RACI on every task** | RACI earns its cost on cross-team deliverables, not on a leader's own 1:1 actions. DACI is kept for decisions, where role confusion has a measurable cost. |
| **Nine-box grids** | Requires calibrated ratings across managers; with one leader it is a sorting exercise with a promotion attached. |
| **Personality/strengths assessments** | Not evidence the app can verify, and a leader who trusts a label over a record stops looking at the record. |
| **Sentiment analysis of free text** | Would require a model, network calls and unverifiable inference. Rejected on the product invariants (no network, no fabrication). |
| **Earned-value / capacity planning** | Needs effort estimates the app does not collect; faking capacity numbers would violate "unmeasured ≠ zero". |

---

## Standing research debts

1. **Feedback latency** (days between an observed event and the coaching conversation)
   is a better leading indicator than "days since last note". The data model lacks an
   observation date; noted in `ROADMAP.md`.
2. **Goal co-authorship** — Gallup's involvement finding is strong and unimplemented.
3. **Upward feedback** — the single highest-value addition that a local, single-user app
   cannot honestly provide.
4. **Pulse question validity** — the four dimensions are chosen for actionability, not
   psychometric validation. If this grows beyond a personal tool, the items should be
   replaced with validated ones (e.g. a short psychological-safety scale) and the change
   recorded here.
