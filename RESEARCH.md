# RESEARCH — what the rules are based on

This file records the leadership frameworks and evidence behind LeadOS, and — more
importantly — what each one turned into in code, or why it was rejected. It is updated
every session. Rules named here are the same ids the app shows on every finding.

Last refreshed: 2026-10-24, session 4. Fresh conflict-practice/product research is in §14;
earlier source summaries are retained as earlier research, not claimed to have all been refetched.

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

**Timeliness added this session.** Gallup describes useful feedback as fast, frequent and
focused on recent work ([Gallup, *Fast Feedback Fuels Performance*](https://www.gallup.com/workplace/357764/fast-feedback-fuels-performance.aspx)).
That supports measuring the observation-to-conversation gap; it does **not** establish a
universal seven-day scoring cutoff. Feedback now stores `observedOn` separately from the
conversation date. `feedbackLatencySummary()` reports average/max/delayed counts only for
real date pairs in the 90-day window, and `FB-06` links to the measured items beyond the
configurable team convention. Missing dates remain unmeasured; received/upward feedback is
excluded from person-performance latency. Existing dates can be corrected without rewriting
the SBI note.

**Deliberately not implemented.** A hard block on vague feedback, a zero-day value for an
unknown observation, or a claim that seven days is a research-validated threshold. People
stop logging under hard blocks; a coach that explains is worth more than a validator that
refuses, and unknown data must not become a flattering measurement.

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

**Co-authorship added this session.** Gallup reports that employees whose managers involve
them in goal setting are 3.6× as likely to be engaged; that is an association, not proof that
every leader-set objective causes disengagement ([Gallup, *Re-Engineering Performance Management*](https://www.gallup.com/workplace/238064/re-engineering-performance-management.aspx)).
A person-owned goal now records `coAuthored: true | false | null`: shaped together, explicitly
leader-set, or unknown. Team goals store null as not applicable. `GOAL-06` fires only for an
explicit false value and prompts a conversation about understanding and ownership; it never
infers authorship from silence. The goal edit flow corrects the field without replacing the
objective's key results or check-in history, and review evidence labels the capture-time value.

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

**Evidence (recorded in the earlier baseline session).** Published vendor conventions
cluster at 5, with some minima of 3 and larger groups for sensitive topics. These are
product policies, not proof that any group size guarantees anonymity. Culture Amp's default reporting
group minimum is 5 and applies to *combinations* of groups; 15Five defaults to 5 and
allows 3 or 4; Lattice publishes a floor of 3 that admins may raise but never lower;
Microsoft Viva Glint uses 3 for confidential surveys and 10 for comments. Guidance also
names the **homogeneity attack**: if everyone answers identically, the aggregate reveals
each individual's answer regardless of group size, and thresholds must apply to every
slice, not just the top level ([FeedbackPulse on k-anonymity](https://feedbackpulse.com/resources/survey-anonymity-thresholds),
[15Five confidentiality](https://success.15five.com/hc/en-us/articles/8359259684507-Confidentiality-for-engagement-surveys),
[SurveyMonkey best practice](https://www.surveymonkey.com/mp/anonymous-employee-surveys/)).

**Implemented, strengthened in session 4.** Default 5; settings/API/imports support 3–25.
All aggregate/dimension/trend values come from the same complete four-dimension cohort.
Incomplete imported responses cannot inflate its floor or distort means. If any dimension
or per-response overall value is unanimous, the *whole vector* is suppressed, preventing
subtraction of released dimensions from the overall. Weekly charts apply the same policy,
exclude future responses and retain null gaps/comparisons. Missing/blank/boolean scores do
not become low answers, through either import or the write API.

Comments require their own floor of nonempty responses and varied text, rather than
borrowing the score-response count. Anonymous records carry `personId: null`; normalization
removes any imported identity value. This corrects the earlier inaccurate “no field at all”
claim. Regression tests and real-browser health rendering verify the release paths.

**Tradeoff and limitation.** More sparse, unanimous and thin-comment windows are now hidden.
That is deliberate: releasing more numbers is not worth quietly identifying a respondent.
A local manager-entered workspace cannot verify independent respondents, protect raw JSON
from someone with browser access, or prevent identification by writing style. This is a
conservative release policy, **not** a privacy guarantee or a complete k-anonymity system.

---

## 12. Performance reviews: evidence, reflection, and calibration

**Research and product benchmark (2026-10-24).** CIPD's evidence review of people
performance practice argues for meaningful measurement, evidence-based practice and
critical examination of assumptions rather than a universal review formula
([CIPD evidence review, 2022](https://www.cipd.org/globalassets/media/knowledge/knowledge-hub/evidence-reviews/people-performance-practice-summary_tcm18-109854.pdf)).
Lattice's review-form guidance recommends setting expectations before a cycle, asking
consistent and specific questions, prompting for concrete evidence, and separating
backward-looking assessment from future development
([Lattice](https://lattice.com/articles/writing-great-review-questions-and-forms)).
Culture Amp's template guidance starts with strengths, covers both past and future,
includes employee self-reflection, and treats peer/upward input as useful but bias-prone;
its optional four anchors are Needs Development, Consistently Meets Expectations, Often
Exceeds Expectations and Sets a New Standard
([Culture Amp template science](https://support.cultureamp.com/en/articles/7048422-the-science-behind-culture-amp-s-performance-review-templates),
[Culture Amp manager guide](https://www.cultureamp.com/blog/managers-guide-to-employee-performance-reviews)).
CCL's SBI guidance remains the basis for observable behaviour and impact rather than
personality judgements (§1).

**Gap analysis in plain language.** LeadOS already helped a manager hold the daily and
weekly conversations, but at review time none of that work became a usable packet. The
manager would have to reconstruct a quarter from memory—the exact moment when recency and
a general impression are most likely to replace the record. Feedback latency and goal
co-authorship remain valuable, but they improve one existing record type; the absent
review lifecycle left the largest whole-job gap. This session therefore implemented the
packet and its calibration checks together rather than adding another isolated score.

**Implemented.** `app/core/domain/reviews.js` builds an inclusive-period, oldest-first
appendix from 1:1s, manager-to-person SBI feedback, goals, dated delegation events, GROW plans and recognition.
Every excerpt carries its source type, source id, basis and local route. Upward feedback
about the manager and anonymous pulse answers are deliberately excluded. Current goal and
plan values say **at capture** because the old store does not contain enough history to
reconstruct period-end values. Four employee reflection prompts, three manager prompts,
and an optional four-point manager rating are stored separately. Completion requires
source evidence and all three manager narratives, but does not fabricate employee
participation by requiring self-reflection.

`CAL-01`…`CAL-07` expose thin source coverage, later-period concentration, high or low
ratings without corresponding dated evidence, thin rating narratives, and entirely
positive or entirely developmental evidence. They never calculate a rating, alter one, or
claim to prove fairness. Completed packets freeze a recaptured snapshot; reopening and
refreshing are explicit audited actions. Print/save-PDF uses the browser print dialog.

**Deliberately rejected.** Automatic performance scores, an averaged employee self-rating,
and a nine-box calibration grid. A single-manager local record cannot support the cross-
rater comparison those devices imply. The checks are transparent heuristics over recorded
evidence, not a psychometric instrument or a claim that bias has been eliminated.

**Remaining limitation.** In this single-user app, the manager enters a reflection supplied
by the employee; there is no employee login or direct submission. The packet is only as
complete as the underlying records, and a source link opens the live record, which may
have changed since the snapshot.

---

## 13. Delegation: transferred authority and visible follow-through

**Research and product benchmark (2026-10-24).** CCL defines effective delegation as
transferring authority and responsibility with the direction, resources and support needed
for expected results—not merely clearing the leader's desk ([CCL, *Delegating Effectively*](https://www.ccl.org/leadership-solutions/leadership-topics/delegating-effectively/)).
Asana's task-management pattern makes one owner, due date, details, status and completion
visible ([Asana](https://asana.com/uses/task-management)). LeadOS borrows that basic clarity
but adds the leadership-specific decision boundary, support, checkpoint history and explicit
return-to-leader outcome instead of becoming another generic task list.

**Gap analysis in plain language.** The owner explicitly selected all three former roadmap
priorities for this session. Feedback recorded the conversation but not how old the observed
moment was; goals recorded progress but not whether the owner helped shape them; and there
was no delegation record at all. Those are three different truth gaps, so the increment adds
three record models/signals rather than hiding them inside one composite “leadership score.”

**Implemented.** A normalized `delegations` collection stores one accountable owner, title,
expected outcome, decision authority, support, delegation/due dates, dated check-ins, and a
terminal completion or return outcome. Four operational authority choices—recommend, agree
first, act-and-inform, own—are LeadOS conversation labels, not a claimed CCL maturity scale.
`delegationHealth()` keeps overdue, blocked and checkpoint-due facts independent even though
the headline shows the most actionable state. `DEL-01` covers overdue/missing dates, `DEL-02`
a latest blocked check-in, and `DEL-03` the configurable checkpoint convention. Suggested 1:1
agendas point to the same record. Completion requires the delivered outcome; accepting work
back requires why and what happens next. Closed records remain read-only history in the UI.
Review evidence uses only dated in-period delegation events and labels current authority/status
as capture-time values.

**Deliberately rejected.** Inferring authority from seniority, silently reassigning work,
calling a returned outcome completed, or promising reminders without a background service.
The seven-day checkpoint is a team convention, not a validated universal threshold. No
backend, account, network call or new dependency was introduced.

---

## 14. Conflict resolution: interests, voluntary process and verified follow-through

**Research refreshed 2026-10-24 (session 4).** Acas describes mediation as voluntary,
neutral and forward-looking: the participants control the agreement, and decide what may
be shared. Its example outcomes include acknowledging perspectives, changing behaviour
and regularly reviewing the agreement ([1](https://www.acas.org.uk/mediation)). CIPD's
public guide distinguishes ordinary relationship disagreements from serious harassment
complaints, which need formal procedures; only the public introduction was read, not the
member-only material ([10](https://www.cipd.org/uk/knowledge/guides/workplace-mediation/)).
Harvard's Program on Negotiation recommends observable problems, open questions, testing
assumptions and understanding everyone's interests before seeking options; it explicitly
asks whether a trained facilitator, HR or an ombudsman should help
([9](https://www.pon.harvard.edu/daily/conflict-resolution/conflict-management-intervening-in-workplace-conflict/)).
These are practice sources, not evidence for an automated diagnosis or a universal deadline.

**Product benchmark.** Lattice's record-of-discussion pattern separates factual context,
agreed actions with owners/dates, and a dated review. Its acknowledgement/signature is not
necessarily agreement—an important distinction for LeadOS's single-manager data entry
([1](https://lattice.com/articles/record-of-discussion-template)). Its 1:1 action items carry
forward until completed; the useful pattern is continuity, not a one-off notes form
([5](https://help.lattice.com/hc/en-us/articles/360060026934-Add-and-Manage-1-1-Action-Items)).
No claim is made that Lattice provides the same conflict case workflow built here.

**Gap analysis and decision before implementation.** Conflict resolution is the first
unbuilt whole-job workflow in the existing roadmap. Pulse may signal an unsafe climate,
but a score cannot record whose concerns have been heard, what people need, what was
agreed or whether the agreement lasted. Build a manager's working record, not an HR
investigation system: separate perspectives/interests, unknown/willing/declined participation,
explicit process and sharing limits, owned dated commitments, follow-up, resolution with
recorded verification, manual support handoff and reopening. An agreement is not resolution.
Serious/uncertain concerns and declined participation must block the informal-agreement
path; the app must not force reconciliation or claim to contact a professional.

**Privacy boundary.** Notes remain unencrypted local data and appear in full JSON backups.
Keep conflict content out of generated 1:1 agendas, person timelines, readiness scores and
performance-review evidence; general Today/Signals reminders may contain only counts and
status, not titles, names, interests or allegations. This is exposure minimisation, not
access control or a promise of confidentiality. A manager-recorded confirmation is not an
employee signature, independent testimony, legal finding or proof of fairness.

**Audit-led safety work in the same increment.** Existing pulse trends bypass unanimous
suppression and imported partial responses can defeat per-slice floors. Align release rules
for aggregate, dimension, trend and comments; suppressed/missing values must remain null.
Fix goal/delegation tab keys and protect delegation-only workspaces from demo replacement.
No runtime dependency, backend, account, model inference or network integration is needed.

**Implemented and verified.** The additive schema-v4 record has versioned agreements,
owned commitments/results, context snapshots, dated checks and closure/handoff/reopening
history. Unknown or declined participation cannot enter the informal-agreement path.
Resolution requires completed results and a current-context all-party check that actually
covered those results; an earlier same-day check cannot verify later work. Reopening keeps
a verification boundary in the record and transition; damaged/missing boundaries require
a fresh check rather than inventing chronology. Support handoff is manual and explicitly
not sent/not resolved. Generic `CFL-01`…`CFL-04` reminders work even without a roster.

Pure/API/schema/jsdom tests and actual Chromium create→agreement→result→check→resolve→reload→
reopen→support-handoff→export/import runs cover the lifecycle and privacy exclusions.
Unencrypted-storage warnings are part of capture/detail/export copy, not hidden in docs.
The final audit also protects future-format data from accidental downcasting, reports
malformed/duplicate conflict history and rejects oversize writes rather than cutting notes.
The static server is restricted to canonical assets so scratch exports, credentials and
repository files are not inadvertently published alongside the local application.
No claim of independent attestation, legal defensibility, mediation competence or clinical
risk assessment follows from a manager ticking confirmation. An encountered July-2026
Acas disciplinary-code draft was **not** treated as a binding/current legal code.

**Rejected.** Conflict-style/personality scores, blame assignment, sentiment inference,
a conflict-count penalty on team health or talent ratings, automatic HR messages and
using private mediation notes as automatic performance evidence.

---

## 15. Frameworks considered and rejected

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

1. **Upward feedback** — the single highest-value addition that a local, single-user app
   cannot honestly provide without independent contributors and a privacy model.
2. **Pulse question validity** — the four dimensions are chosen for actionability, not
   psychometric validation. If this grows beyond a personal tool, the items should be
   replaced with validated ones (e.g. a short psychological-safety scale) and the change
   recorded here.
3. **Conflict practice validation** — test the workflow with consented real-manager use;
   this working record is not a trained mediator or a jurisdiction-specific case system.
4. **Longitudinal latency/delegation outcomes** — current thresholds are transparent team
   conventions. Do not claim predictive validity without real, consented longitudinal data.
