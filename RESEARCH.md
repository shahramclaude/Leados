# RESEARCH — what the rules are based on

This file records the leadership frameworks and evidence behind LeadOS, and — more
importantly — what each one turned into in code, or why it was rejected. It is updated
every session. Rules named here are the same ids the app shows on every finding.

**Session 60 correction (2026-10-28):** §64 supersedes §63's stronger claims about
FDR control, false-discovery counts and hindsight-free demo scoring. Prior sections are
historical and were not re-audited or re-fetched in full **[UNVERIFIED]**.

Last refreshed previously: 2026-10-28, session 59. Fresh 2026 research on alert-fatigue precision
benchmarks, false-discovery-rate control for operational monitoring and Wilson-interval
reporting is in **§63** at the bottom of this file, converted into `RULE-EW-00..04` /
`EW-01..05` / CSV scope #40 the same session. Earlier: 2026-10-27, session 53. Fresh 2026 research on decision-intelligence platforms, assumption ledgers, continuous assurance, OKR/strategy execution, RAND Assumption-Based Planning, Wald SPRT and prospective hindsight is in **§61** at the bottom of this file, converted into `RULE-PREM-01..04` / `PREM-01..05` / CSV scope #35 the same session. Earlier fresh 2026 competitive research on AI-native people analytics / decision-intelligence platforms (SAS Intelligent Decisioning, Palantir Foundry+AIP, Visier Vee, Workday Illuminate, Windmill ONA, One Model, PeoplePilot 2026 state-of-market, EU AI Act explainability) and the network-science basis for surveillance-free Organizational Network Analysis (Newman co-affiliation projection, Brandes/Freeman centrality, PageRank, Burt structural holes, Tarjan articulation points, Latora–Marchiori efficiency) is in **§56** at the bottom of this file, converted into `RULE-ORG-01..05` / `ORG-01..05` / CSV scope #31 the same session. Earlier sections (§1–§55) preserve prior research and were not all re-fetched.

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

---

## 16. Longitudinal people analytics & safe HR spreadsheet exports (Session 5)

**Sources & industry benchmarks.**
- *Survivorship & composition bias in people analytics:* Excluding departed/archived team
  members from historical cohorts inflates historical cadence and engagement metrics
  (survivorship bias), while comparing composite averages when new survey dimensions enter
  the denominator produces Simpson's / composition-shift paradoxes even when underlying
  behaviours are unchanged.
- *Longitudinal pulse anonymity:* Culture Amp and Microsoft Viva Glint default to a minimum
  of 5 respondents for quantitative scores (supported minimum 3), enforce cascading/unanimous
  suppression so identical slices cannot be deduced by subtraction across adjacent windows,
  and apply independent floors to open-text comments.
- *Spreadsheet formula injection & HR data minimisation:* OWASP WSTG (`WSTG-INPV-21`) and
  MITRE `CWE-1236` document that RFC 4180 CSV quoting does **not** stop spreadsheet engines
  (Excel, LibreOffice Calc, Google Sheets) from executing cells starting with `=`, `+`, `-`,
  `@`, control whitespace (`\t`, `\r`, `\n`), leading whitespace before formula prefixes, or
  Unicode full-width equivalents (`＝`, `＋`, `－`, `＠`). GDPR Art. 5(1)(b)/(c) (purpose
  limitation and data minimisation) requires routine operational exports to exclude
  confidential interpersonal mediation records and raw pulse rows.
- *Accessible data visualisation:* W3C WCAG 2.1 SC 1.1.1 (text alternatives), 1.3.1
  (programmatic table relationships), 1.4.1 (non-color series differentiation via dash
  patterns and marker geometry), 1.4.3 (>=4.5:1 text contrast) and 1.4.11 (>=3:1 graphical
  object contrast).

**Implemented.**
- **Schema v5 dated snapshots (`schema.js`, `actions.js`):** 1:1 action `completedOn`,
  feedback `followUpCompletedOn`, goal `initialConfidence` / `completedOn` / `krUpdatedOn` /
  `initialCurrent` / check-in `{ progressPct, keyResults }`, and GROW `closedOn` /
  `stagesUpdatedOn` / `will[].completedOn`. Pre-v5 migrations keep unknown dates `null`.
- **Bias-safe historical series (`health.js`, `trends.js`):** `reconstructStateAt()` restores
  `active` status when `archivedAt > asOf`, labels each dimension `exact` vs `approximate`,
  guards pre-logging windows as `pre-history` (`null`), and computes `matchedDelta` across
  shared dimensions (`coverageChanged` disclosed).
- **Accessible SVG + table charts (`ui/charts.js`, `views/health.js`):** 8-week, 12-week and
  6-month series with distinct stroke dash + marker shapes, hollow markers for approximate
  checkpoints, broken polylines across suppressed gaps, and collapsible `<details>` HTML
  `<table scope="col|row">` alternatives.
- **Scoped, formula-neutralized CSV export (`core/csv.js`, `core/store.js`, `views/settings.js`):**
  13 purpose-limited scopes; string formula triggers prefixed with `'` while finite negative
  numbers remain numeric and `null`/`undefined` stay `""`; `pulseSummary` enforces weekly
  cohort, unanimity and comment floors with zero `personId`; confidential `conflicts`
  separated behind a danger confirmation prompt.

---

## 17. Encryption at rest for a local leadership record (Session 6)

**The question this section answers.** LeadOS keeps 1:1 notes, feedback, performance-review
reflections and confidential conflict records in one browser `localStorage` blob. That is the
most sensitive class of text a manager holds, and until this session it was plain text: readable
by anyone who opened the browser profile, copied the storage, or picked up a backup file. What is
the responsible design when the app has no server, no account and no way to reset anything?

**Sources & industry benchmarks.**
- *Key derivation:* OWASP's Password Storage Cheat Sheet (2023, still the current published
  guidance in 2026) recommends PBKDF2-HMAC-SHA-256 with **600,000 iterations** and a per-record
  random salt of at least 128 bits; NIST SP 800-132 is the underlying KDF standard. PBKDF2 is
  chosen over Argon2id here because every browser ships it in WebCrypto with no dependency, and
  Argon2id's memory-hardness buys little against the actual threat (an offline copy of the file
  and a guess at a human passphrase) once the passphrase is long.
- *Cipher and construction:* AES-256-GCM (NIST SP 800-38D) gives confidentiality **and**
  integrity in one pass, which matters more here than in a typical app: a silently corrupted
  workspace that still decrypts would be indistinguishable from a legitimate edit. The GCM
  additional-authenticated-data binds the KDF parameters, so an envelope cannot be rewritten to
  use a cheap iteration count.
- *Passphrase quality signals:* NIST SP 800-63B's 2024 revision argues for length over
  composition rules and against forced rotation. The policy here is a 12-character floor with no
  character-class rules, plus two footgun guards (reject leading/trailing whitespace, reject a
  single repeated character). It deliberately shows no "strength meter", which would promise a
  measurement the app cannot make.
- *How password managers frame the same tradeoff:* Bitwarden, 1Password and Proton all raise the
  KDF iteration count over time while keeping the count **stored per file/account** so raising
  the default does not orphan data encrypted earlier. The envelope here records its own
  parameters for exactly that reason.
- *Local-first product patterns:* offline-first apps with real user data converge on the same
  three-part safety story — an explicit lock state, no silent fallback to plain text, and a
  visible, irreversible warning at the moment encryption is enabled rather than in a help page.

**What this application chose, and why.**
| Decision | Reason |
|---|---|
| Encryption is **opt-in**, off by default | Turning it on changes where the only copy of the data lives (behind a key nobody can reset). A first-time manager must be able to choose that, not discover it. |
| Envelope is **self-describing and versioned** | A future version can open today's files without guessing parameters, and refuses a newer format instead of mangling it. |
| **Verified round-trip before overwrite** | Encrypt → decrypt → compare → write. The failure mode of "saved an unreadable blob" is total data loss; the cost of the extra check is one AES operation. |
| **Locked blocks every write path** | An API call, an import, a demo load or a reset could each replace the ciphertext with an empty plaintext workspace. One guard in the store covers all callers. |
| Lock screen renders **only** the lock screen | Half-rendered navigation over an unreadable workspace implies readability that does not exist, and invites actions that cannot work. |
| Ciphertext is **never treated as corruption** | The existing corrupt-blob path quarantines and starts fresh. Applying that to an encrypted workspace would destroy it, so vault envelopes are detected before that path. |
| Import declares its **mode change** | Restoring an encrypted backup into the lock screen keeps encryption; restoring an encrypted file into a plain workspace says, in words, that it is now stored unencrypted. Silent downgrades are how people believe they are protected when they are not. |
| Exports are **separate decisions** | A plain-text JSON backup remains the recovery-of-last-resort for a forgotten passphrase; encrypted backups exist for everything else. The UI states which is which at the button. |
| **Idle auto-lock timer** | Implemented this session: locks an unlocked encrypted workspace after a configurable inactivity window (default 30 minutes, 0 = off), warns first with a non-destructive "keep working" affordance and a one-minute grace, and logs the lock to the event log (`tests/app/idle.test.mjs`). The timer cannot fire mid-sentence without warning, and any activity cancels a pending lock. |

**Deliberately rejected.**
| Idea | Reason |
|---|---|
| A recovery key or security questions | A recoverable key stored next to the data is decoration, and security questions are guessable by exactly the people most likely to try. |
| Encrypting CSV exports by default | A CSV's purpose is opening in a spreadsheet. Encrypting it makes the routine export useless; the honest control is a warning plus a separate encrypted-backup path. |
| Key escrow / "account recovery" | There is no account and no server, and inventing a hint of one would be a lie about who can read the data. |
| Storing the derived key in `localStorage` to avoid the lock screen | That reduces encryption to a flag: anyone with the profile gets the key with the data. |
| Argon2id via WASM | A dependency, a CSP and a supply-chain surface for a marginal gain on a long passphrase. |

**Standing research debt.** Browser WebCrypto was not exercised in a real browser binary in this
session (Node's `webcrypto` was injected into jsdom), so genuine cross-browser unlock behaviour
remains `[UNVERIFIED]`. Remaining gaps worth future sessions: per-collection encryption for the
conflict records specifically, and a passphrase-strength estimate based on a local wordlist rather
than a character meter.

---

## 18. One-meeting preparation: the paper the leader walks in with (Session 8)

**The question this section answers.** A 1:1 fails most often *before* it starts. The manager
remembers the last two topics and forgets the promise made three meetings ago, the blocked
delegation, the feedback that was never closed. The app already generated an agenda from a
person's record (`suggestAgenda()`, §6), but that agenda lived only inside the log dialog and the
person page — there was no way to walk into the meeting with it, and no way to hand the person a
sheet of their own topics. What does a leader actually need on one page, and what must never be
allowed onto it?

**Sources & product benchmarks.**
- *Consistency beats frequency, and preparation beats status updates.* Gallup's manager research
  links frequent, development-focused conversations with engagement and notes managers account for
  roughly 70% of the variance in team engagement ([Gallup](https://www.gallup.com/workplace/713033/managers-and-team-productivity.aspx)).
  Vendor and practitioner guidance on 1:1s is consistent that an agenda shared *before* the meeting
  (and notes taken *during* it) is the single highest-leverage habit; a 1:1 that becomes a status
  readout is the failure mode to avoid.
- *Pre-read / one-page brief culture.* Amazon's narrative-memo ("6-pager") practice and the wider
  "committee memo" tradition are the extreme case of the same idea: force the thinking onto one
  document *before* people gather, so the meeting debates the document rather than improvising it.
  A 1:1 prep sheet is the lightweight, personal version of that.
- *1:1 templates in real products.* 15Five, Lattice, Culture Amp and similar manager-tooling
  products ship 1:1 agenda templates and, in several cases, a "pre-meeting" prompt that pulls open
  items forward. The pattern adapted here is the *generated* agenda with a stated reason per item,
  which is more honest than a blank template and more useful than a generic list.
- *Two-way agendas.* Best practice is that the employee also brings topics. In a local,
  single-user tool there is no employee login, so the honest implementation is a manager-recorded
  "topics they have asked to raise" field, labelled as a scribe record rather than a form the
  employee filled in.
- *Privacy boundaries.* A printed or shared sheet is a *new* exposure surface. The two things that
  must never travel on it are the confidential conflict working record (§14) and individual
  anonymous pulse responses (§11). Both are excluded at the data layer and named on the sheet.

**What this application chose, and why.**
| Decision | Reason |
|---|---|
| A **route, not a dialog** (`#/prep/<personId>`) | A printable document needs a stable address you can bookmark, print, or save-as-PDF. A modal cannot be printed cleanly. |
| **Their topics first** | The person's agenda is not a courtesy — it is the reason the meeting exists. Leading with the leader's generated items would recreate the status-meeting failure mode. |
| **Generated agenda keeps its reason** | Reuses `suggestAgenda()` unchanged, so the sheet inherits the same auditable logic as the log dialog. An item with a reason can be accepted or dropped knowingly. |
| **Open commitments grouped by source** | A promise made in a 1:1, a feedback follow-up, a GROW action and a delegation checkpoint live in different records; grouping them makes it obvious what is still owed. Overdue items sort first within each group. |
| **"Since we last spoke" from the record** | The last meeting's notes, mood, carried-forward actions and recognition are fact, not memory. |
| **Exclusions are named on the sheet** | A reader holding the paper should know the sheet is *missing* conflict records and anonymous pulse answers on purpose, so an absence is not mistaken for an omission. |
| **A notes area on the sheet** | The sheet becomes the raw material for the next log entry; the manager writes on it and then logs the 1:1. |
| **`talkingPoints` is a plain string array** | Readable in an export, survives a copy/paste into the person dialog, and degrades to an empty list on every old record without a migration. |

**Deliberately rejected.**
| Idea | Reason |
|---|---|
| Employee self-submission of topics | There is no account, no employee login and no server. A field the manager fills in is honest; a form that pretends to be the employee's is a fabrication. |
| Auto-including conflict records "because they are relevant" | Exactly the leak this sheet is designed to avoid. Conflict content stays in the conflict workspace and surfaces only as count-only signals. |
| A per-meeting copy stored as a new record | Duplicates data and creates drift. The sheet is a *view* over current records, regenerated each time, like the review packet. |
| A scoring or grade on the sheet | The sheet is a brief, not a verdict. Adding a number would invite the leader to grade the meeting instead of run it. |
| Sending the sheet anywhere | There is no network, no email and no server. "Shareable" here means print or save-as-PDF, and the sheet says so. |

**Standing research debt.** Print/PDF visual output and real-browser geometry of the sheet remain
**[UNVERIFIED]** (no browser binary in this container). Whether a manager actually uses the sheet
before the meeting — and whether the grouped-commitment format reduces forgotten follow-ups —
requires rehearsal with real usage, which is absent here.

---

## 19. Structured 30-60-90 onboarding scaffolding (Session 9)

**The question this section answers.** LeadOS deliberately pauses steady-state goal (`GOAL-05`)
and development-plan (`GROW-01`) reminders during a new joiner's `onboardingDays` window (default
90 days) so new hires are not judged on steady-state KPIs before they have context. Until this
session, the *only* onboarding check was `ONB-01` (`< 2` held 1:1s). As soon as a manager logged a
second 1:1 in week two, the app fell silent for the remaining 75 days of onboarding. What belongs
in a structured first-90-days tracker for a first-time manager, and what would turn onboarding into
harmful bureaucracy or premature grading?

**Sources & product benchmarks.**
- *Organizational socialization ("The Four C's"):* Talya N. Bauer's SHRM Foundation guide
  (*Onboarding New Employees: Maximizing Success*, 2010) and Bauer et al.'s meta-analysis of 70
  socialization studies (*Journal of Applied Psychology*, 2007) separate passive administrative
  orientation (*Compliance*) from three proactive levers that predict role performance, job
  satisfaction, organizational commitment and retention: **Clarification** (explicit role
  expectations and decision boundaries), **Culture** (team norms and unwritten working rules), and
  **Connection** (peer buddy and deliberate stakeholder introductions, since social capital rarely
  forms on its own — especially on remote/hybrid teams).
- *Phased 30-60-90 role transitions:* Michael D. Watkins (*The First 90 Days*, Harvard Business
  Review Press, 2003 / updated 2013) frames role transitions around three distinct 30-day horizons
  rather than one flat checklist: **Day 30 (Learn & Connect)** — role clarity, buddy, stakeholder
  introductions and working rhythm; **Day 60 (Contribute & Calibrate)** — a bounded early win that
  builds self-efficacy and credibility plus explicit two-way calibration feedback; **Day 90 (Own &
  Transition)** — end-to-end ownership of a recurring domain, a 90-day retrospective, and handoff
  into steady-state goals and growth planning.
- *Product benchmarks:* Lattice Onboarding, Culture Amp Onboarding, Rippling and BambooHR separate
  IT/HR paperwork from manager-owned 30-60-90 plans with buddy assignment, stakeholder maps and
  30/60/90 check-in conversations. Where enterprise suites over-index on compliance checklists or
  single-person surveys that carry no statistical anonymity, a local manager tool excels at making
  the **manager's own scaffolding obligations** visible and auditable.
- *Psychological safety boundary (Edmondson, 1999):* Onboarding check-ins ask a new hire what is
  confusing, surprising or blocking them. If onboarding scaffolding records were auto-imported into
  formal performance review evidence packets, new hires would have an incentive to hide confusion.

**What this application chose, and why.**
| Decision | Reason |
|---|---|
| **Dedicated `state.onboarding` collection (Schema v6)** | Keeps 30-60-90 plans independent of roster edits, supports future internal role transitions, participates in demo-overwrite protection and activates future-schema safety for older builds. |
| **Zero fabrication on `v5 → v6` migration** | Existing workspaces migrate with `onboarding: []`; plans are started explicitly by the leader with 6 editable 30/60/90 starter checkpoints anchored to `startDate`. |
| **Scaffolding gaps framed on the manager, never as a score on the person** | Missing role clarity, an unassigned/archived buddy, unmapped stakeholder introductions or a missing early win (`ONB-03`) are manager debts, not an employee "62% onboarded" grade. |
| **Three horizons (`30`, `60`, `90`) + dated phase check-ins** | Pairs observable checkpoints per horizon with explicit Day 30, Day 60 and Day 90 check-in conversations (`heldOn`, `summary`, `blockers`) validated against `startDate` and the clock. |
| **Day 90 conversation gate before completion** | A plan cannot be marked `completed` until the Day 90 check-in conversation is recorded, preventing checkbox closure without an actual conversation. |
| **Excluded from performance-review packets (`reviews.js`)** | Protects psychological safety during onboarding check-ins while still integrating into `#/onboarding`, `#/people/<id>`, `suggestAgenda()`, `#/prep/<id>`, `personTimeline()` and scoped CSV export. |

**Deliberately rejected.**
| Idea | Reason |
|---|---|
| A numeric "onboarding score" or ramp percentage on the person | Conflates missing manager support (no buddy, unclear scope) with employee capability and invites gaming. |
| Personality or "culture-fit" ratings | Unfalsifiable against observable work and a well-known vector for similarity bias. |
| HR / IT compliance checklists (laptop, payroll, tax/right-to-work forms) | Administrative orientation belongs in HRIS/IT systems; mixing paperwork into a leadership workspace crowds out role clarity and coaching. |
| Auto-ingesting onboarding blockers into performance reviews | Punishes candour in month one and turns developmental check-ins into evaluation files. |

**Standing research debt.** Real-browser visual layout and print geometry of `#/onboarding` and the
updated `#/prep/<personId>` commitment section remain **[UNVERIFIED]** in this container (no
browser binary installed); JSDOM workflows, `axe-core` semantic/ARIA checks and live HTTP module
serving are verified.

## 20. 1:1 follow-through: closing the loop the meeting left open (Session 10)

**The question this section answers.** LeadOS already recorded 1:1 actions, surfaced overdue ones
and listed them on the printable prep sheet. What it could not express was the *outcome* of a
promise: an action was open or done, with no way to say "we moved this to next week", "we agreed to
drop it", or "this was confirmed face to face". The roadmap item was therefore not "more reminders"
but a *ledger*: at the end of a conversation, what happened to everything that was promised before
it? This section records the evidence behind the design, and the parts deliberately not built.

**Sources & product benchmarks.**
- *Practitioner guidance on the ritual itself.* The recurring finding across 1:1 guides is that the
  meeting should **open** with the previous meeting's commitments: "review action items from the
  previous meeting … whether they've been completed" (Fellow, *One-on-One Meetings: The Definitive
  Guide*, 2026), "start every 1:1 by reviewing what was agreed last time" (Popwork, 2026), and a
  standing "review commitments → progress → obstacles → new commitments → feedback" structure
  (Deliberate Directions, 2025). None of this is peer-reviewed research; it is convergent practice
  from vendors and coaches, and the app treats it as design input rather than proof.
- *Product benchmarks.* 15Five places incomplete action items from past agendas in a **Previous
  action items** section and carries them over when the 1:1 is ended (15Five Help Center, *End a
  1-on-1 meeting*, 2026); Lattice action items "carry over from meeting to meeting until they are
  checked off" (Lattice Help Center, 2023); Fellow exposes a per-note **Carry-forward** setting with
  *Always / Never / Ask me* (Fellow Help Center, 2026); Granola's rolling action list treats a
  repeatedly carried item as "a signal rather than a scheduling problem" and advises naming the
  block directly (Granola, *One-on-one meeting template*, 2026).
- *Accountability research and commentary.* Gallup's 2025 workplace work reports that creating
  accountability ranks **lowest of seven leadership competencies** that influence engagement and
  performance (46% of leaders rate themselves exceptional at it; 30% of managers rate their leaders
  the same way) — a survey, not a controlled study, but consistent with the product observation that
  the gap is follow-through rather than intent. SHRM's manager guidance is blunter: "mistrust arises
  when managers don't do what they said they would do" (*Building Trust as a Manager*, 2023). HBR's
  2026 argument that "accountability must be chosen, not mandated" is the reason this feature asks
  for a decision instead of enforcing a checklist.
- *Behavioural mechanism.* Gollwitzer's implementation-intentions research (*American Psychologist*,
  1999) supports specifying when and how a commitment will be met; a due date is a weak commitment
  device, but an explicit re-commitment with a new date is stronger than silently re-showing the old
  one. Edmondson's psychological-safety findings (§4) set the tone of the question: "what got in the
  way?", not "why did you fail?".
- *Metric caution.* Practitioner guides propose a "commitment completion rate" with a healthy band
  around 85–95% and a warning zone below 70% (Deliberate Directions, 2025). That number has no
  published dataset behind it, and in a single-manager, manager-entered record it would measure
  what the manager bothered to log. It is recorded here as a *rejected* metric, not adopted.

**What this application chose, and why.**
| Decision | Reason |
|---|---|
| **Four explicit outcomes per open promise** — done in this conversation, still open, carried into a later meeting, dropped with a reason | Silent auto-carry (the 15Five/Lattice default) hides a blocker: the item reappears every week and the backlog looks unchanged. Asking per item is Fellow's "Ask me" option, with the decision and its history kept. |
| **The original is closed, not moved** (`carriedTo*`), and the successor links back (`carriedFrom`) | The record keeps both the date the promise was first made and the meeting that moved it. Carry depth and "first agreed on" are *derived* from the chain at read time, so an edited import cannot fabricate a flattering history. |
| **A rejected link reopens the promise instead of losing it** — missing successor, another person, a date going backwards, or a cycle | The failure mode the feature exists to prevent is a promise disappearing from every open list. Normalization reports the repair in plain language. |
| **`CONV-06` fires at two carries, not one** | One carry is life. Two carries is the point where "scheduling" stops explaining it (Granola's advice), and the conversation should be about the block or an explicit drop. |
| **Board completion `completedInMeetingId = null`** | Ticking a box is a report, not a conversation. Only a held 1:1 can record that a promise was confirmed face to face. |
| **A "promises closed in a 1:1" win** (≥ 2 in a fortnight) | A follow-through feature that only produces alarms trains avoidance. The same records should show what is working. |
| **Historical snapshots rewind carries, drops and confirmations** | Otherwise a trend chart claims a promise was closed before the meeting that closed it. This mirrors the Session 5 survivorship-bias and Schema v5 snapshot rules. |
| **CSV exports the ledger, not a score** — `state`, `carried_forward_count`, `first_agreed_on`, `confirmed_in_meeting`, and per-meeting `carried_in` / `carried_out` | A leader can audit the raw facts. No percentage is computed for them. |

**Corrections made while building it.** The export's `owner` column was removed from 1:1, GROW,
feedback and onboarding rows: the application never asked who owned a 1:1 action, so the column was
asserting `leader` for every row. An honest export shows only recorded facts.

**Deliberately rejected.**
| Idea | Reason |
|---|---|
| Automatic carry-forward of every incomplete item | Makes a repeating commitment invisible, inflates the "open" backlog without naming the block, and removes the moment where a leader could decide to drop or re-scope. |
| Deleting a dropped commitment | The decision to stop is evidence. Keeping the reason supports "what did we choose not to do?" in a review and prevents the same promise being re-made blindly. |
| A completion-rate score or ranking per person | The data is manager-entered and incomplete; a percentage would reward under-recording and read as a performance rating. Counts and dates only. |
| Email/Slack reminders for carried items | No backend, no network, no scheduler (standing architecture constraint); a tab cannot reliably deliver a reminder, and pretending otherwise is a silent failure. |
| Letting "carried" count as progress in the health score | Carrying is the absence of a decision, not delivery. The health dimensions continue to use cadence, feedback, goals, growth and pulse, not promise throughput. |

**Standing research debt.** There is no validation that explicit reconciliation reduces the number
of abandoned commitments in a real team; the carry count is descriptive, not causal. Real-browser
keyboard and screen-reader behaviour of the new dialog (radios, conditional date/reason fields) is
**[UNVERIFIED]** in this container — JSDOM + `axe-core` 4.11 report 0 violations, but no browser
binary was available.

**Sources consulted (accessed 2026-10-25).**
- 15Five Help Center, *End a 1-on-1 meeting* — https://success.15five.com/hc/en-us/articles/360059003911-End-a-1-on-1-meeting
- 15Five Help Center, *Hold a 1-on-1 meeting* — https://success.15five.com/hc/en-us/articles/360002699811-Hold-a-1-on-1-meeting
- Lattice Help Center, *Add and Manage 1:1 Action Items* — https://help.lattice.com/hc/en-us/articles/360060026934-Add-and-Manage-1-1-Action-Items
- Fellow Help Center, *Carry Incomplete Items Forward* — https://help.fellow.ai/en/articles/3945044-carry-incomplete-items-forward
- Granola, *One-on-one meeting template for managers* — https://www.granola.ai/blog/one-on-one-meeting-template-for-managers
- Gallup, *How Can Leaders Build Accountability and High Performance at Work?* (2026 update) — https://www.gallup.com/workplace/712004/accountability-in-the-workplace.aspx
- SHRM, *Building Trust as a Manager* — https://www.shrm.org/topics-tools/news/managing-smart/building-trust-manager
- Harvard Business Review, *Accountability Must Be Chosen, Not Mandated* (April 2026) — https://hbr.org/2026/04/accountability-must-be-chosen-not-mandated

## 21. Who owes it: commitment ownership and the leader's own half of the ledger (Session 11)

**The question this section answers.** Session 10 made a 1:1 promise's *outcome* explicit, but every
promise still looked the same: the record said what was agreed and when it was due, never **who was
going to do it**. On a five-person team the leader can hold that in their head for a week; on a real
team it is exactly the detail that evaporates, and it is the detail every comparable product
records. Worse, the previous export had to be corrected because it printed `owner = leader` for every
row — a column asserting something the application never asked. This session answers three
questions: does ownership belong in the model, whose ownership should a 1:1 tool recognise, and how
should a first-time manager be confronted with their *own* unkept promises without turning the tool
into a scold.

**Sources & product benchmarks.**
- *Large-sample evidence that keeping promises is a leadership behaviour, not a nicety.* Zenger
  Folkman analysed 1.8 million assessments of 162,000 leaders (≈13 raters each, 60 behaviours),
  including the item "honors commitments and keeps promises" (Folkman, *Forbes*, 29 Aug 2025).
  Leaders rated **needing improvement** on that item sat at the **13th percentile** of overall
  leadership effectiveness; "competent" at the **23rd**; "strength" at the **46th**; and only a
  "profound strength" reached the **74th**. Correlational, not causal, and self/other ratings are
  involved — but the spread is large enough that follow-through is not a soft skill.
- *Trust is already falling, and promises are the mechanism people name.* DDI's *Global Leadership
  Forecast* reports trust in immediate managers down **17 points between 2022 and 2024 (46% → 29%)**,
  with "breaking promises" first on its list of trust traps (DDI, 2024/2026). Gallup's 2026 study of
  seven leadership competencies finds **creating accountability the lowest-rated of the seven**, and
  managers rate their own leaders well below how those leaders rate themselves. The Gallup framing
  ("holding everyone responsible") is about *others*; the gap this feature targets is the mirror
  image.
- *The asymmetry is the point.* Practitioner work on leadership integrity cites Simons and McLean
  Parks' study of nearly **7,000 employees across 76 hotels**, measuring whether managers' words and
  actions line up ("My manager delivers on promises"). The widely repeated conclusion is that a
  breach is weighted far more heavily than a kept promise, which is why a team remembers the one
  meeting the manager moved and forgets the nine they held. Two-way accountability is named
  explicitly: accountability is "a two-way contract… where it breaks is usually the second half"
  (Tina Laws Consulting, 2026), and "one-way accountability is the death of trust" (learn2, 2022).
  A tool that tracks only the report's commitments reproduces exactly that one-way structure.
- *What comparable products do.* **15Five** assigns a 1-on-1 action item to its creator by default
  and lets you reassign it to the other participant — and only to them (*Create and reassign a 1-on-1
  action item*; *Hold a 1-on-1 meeting*, 2024–2026). **Lattice** behaves the same way: items default
  to the creator and can be reassigned to the other person in the 1:1 (*Add and Manage 1:1 Action
  Items*, 2023). **Fellow** puts the assignee inside the note and chases it, described by reviewers
  as "so I do not have to remember who owes me what" (PeopleGoal, 2026). Practitioner templates make
  the field mandatory: `Commitment · Owner · Due date · Evidence of completion` (Evalflow, 2026), and
  "an action item only works when one person owns it" (Sprad, 2026).
- *Where the evidence stops.* None of this shows that adding an owner field improves outcomes. The
  claim this application makes is narrower and defensible: an unowned promise cannot be followed up
  by anyone, and a leader who never sees their own debts cannot practise the two-way accountability
  the sources describe.

**What this application chose, and why.**
| Decision | Reason |
|---|---|
| **Ownership is a three-value vocabulary** — `them`, `leader`, `shared` — plus `null` | A 1:1 has exactly two participants, so a name is unnecessary and a free-text owner invites ambiguity. `shared` exists because "we will both draft it" is true often enough that forcing a fiction would corrupt the record. |
| **`null` means "not recorded", and the app says so** | 15Five defaults new items to *you*; that is a plausible default, not a fact. LeadOS keeps the field unknown, shows "Owner not recorded", and counts the gap, because a fabricated owner is worse than a visible one. |
| **The leader's own promises get a first-class surface** — *What you owe* on Today, a "I owe" stat and an inline owner column on the board | The research above is about the manager's own half. A list that mixes both people's promises lets the leader scan past their own; separating them makes the debt unavoidable without adding a score. |
| **A carried promise keeps its owner** | The person a promise was made to does not change because the date moved. Reassigning is a separate, audited action (`oneonone.action.owner`), and the original (already carried) is refused with a pointer to the live copy. |
| **`CONV-07`, per person, when the leader is late on their own promise** | "Mei is waiting on a promise you own" is actionable; "1 overdue action" is not. Severity rises from 3 to 4 when one person is waiting on more than one, because a pattern is what erodes trust. |
| **`CONV-05` now covers only promises the team owes** | Before this, the same overdue record produced two findings. Splitting by owner keeps one fact in one place: what they owe versus what you owe. |
| **Ownership is part of the export, truthfully** | The `owner` column returns — this time because the app records it. Unrecorded owners are blank, and GROW "will" actions carry no owner at all: by definition they belong to the person whose plan it is. |
| **Ownership is editable only while a promise is open** | Rewriting who owed something after it was done or dropped would rewrite the history the ledger exists to preserve. |

**Deliberately rejected.**
| Idea | Reason |
|---|---|
| Defaulting every new action to the report (or to the leader) | The most common product default, and the least honest: most promises are the report's, which makes a wrong default invisible, and the leader's own half disappears entirely. |
| A completion-rate score for "your commitments" | Same reason the report-side rate was rejected in §20: manager-entered, incomplete, and it would reward under-recording. Counts, dates and names only. |
| Automatic escalation (email/Slack/notifications) when the leader is late | No backend and no scheduler by architecture; a tab cannot promise a reminder. The card and the signal are honest about being visible only when the app is open. |
| A free-text owner field, or assigning to anyone outside the 1:1 | Invents a roster the app does not have and makes "who owes it" unanswerable. The two participants are the only people the record can vouch for. |
| Letting the leader reassign a promise to the report retroactively | Would turn the ledger into a tool for rewriting who was responsible. The write path refuses a closed promise and makes reassignment an explicit, logged act. |

**Standing research debt.** No controlled evidence that surfacing leader-owned commitments changes
behaviour; the demo's single overdue leader promise is illustrative, not measured. Real-browser
keyboard/screen-reader behaviour of the inline owner select and the Today card remains
**[UNVERIFIED]** in this container (JSDOM + `axe-core` 4.11 report 0 violations).

**Sources consulted (accessed 2026-10-25).**
- Folkman, J., *When Leaders Keep Their Word (And When They Don't)*, Forbes, 29 Aug 2025 —
  https://www.forbes.com/sites/joefolkman/2025/08/29/when-leaders-keep-their-word-and-when-they-dont/
- Gallup, *Accountability Is Leadership's Greatest Weakness* (Harter & Tatel, 2026) —
  https://www.gallup.com/workplace/703379/accountability-leadership-greatest-weakness.aspx
- DDI, *Leadership Trust: 7 Ways Leaders Build Trust and Strengthen Teams* (2026) —
  https://www.ddi.com/blog/leadership-trust
- *Integrity in Leadership: What It Is and How to Show It* (Simons & McLean Parks hotel study summary,
  2026) — https://leadchangegroup.com/leadership/integrity-in-leadership/
- Tina Laws Consulting, *Leadership Accountability: Why Managers Set the Temperature* (2026) —
  https://www.tinalawsconsulting.com/strategy-hub/leadership/leadership-accountability-why-managers-set-the-temperature-for-every-team/
- learn2, *How to Build High-Trust Leadership* (2022) —
  https://www.learn2.com/building-high-trust-workplace-culture/
- 15Five Help Center, *Create and reassign a 1-on-1 action item* —
  https://success.15five.com/hc/en-us/articles/360040690591-Create-and-reassign-a-1-on-1-action-item
- 15Five Help Center, *Hold a 1-on-1 meeting* —
  https://success.15five.com/hc/en-us/articles/360002699811-Use-the-1-on-1-agenda
- Lattice Help Center, *Add and Manage 1:1 Action Items* —
  https://help.lattice.com/hc/en-us/articles/360060026934-Add-and-Manage-1-1-Action-Items
- PeopleGoal, *10 Best 1-on-1 Meeting Software* (Fellow action assignment, 2026) —
  https://www.peoplegoal.com/blog/1-on-1-meeting-software/
- Evalflow, *Manager One-on-One Meeting Agenda Template* (owner field, 2026) —
  https://www.evalflow.com/blog/one-on-one-meeting-agenda-template

## 22. Development commitments that keep moving: a review is a record, not a date change (Session 12)

**The problem this answers.** Session 10 gave 1:1 promises a follow-through ledger (done / still open /
carried / dropped, with the chain and the reason). The GROW module still had the older, weaker shape: a
`will` list with a `done` checkbox and one `reviewOn` date. A plan could therefore be "reviewed" by
editing the date — the cheapest possible way to look like development is being managed — and a
commitment that stopped moving could only be ticked, left alone, or deleted by editing the plan. That is
the same hole the 1:1 ledger closed, still open in the module whose whole purpose is growth.

**What the practitioner literature actually says.** The consensus is unusually consistent, and it is
about cadence and record-keeping rather than about frameworks:

- Plans fail for structural reasons, not motivational ones. The named failure modes are "plans that are
  created and then ignored for twelve months", "check-ins stop after the initial planning meeting",
  "nothing is scheduled", and "keeping obsolete goals active after priorities change" (performspark,
  letscatapult, TMI, culturespark). A plan with no calendar entry is "a document, not a commitment".
- Annual review is not a cadence: "Annual review is not a cadence. It is a postmortem." Practical
  rhythms cluster at weekly-to-monthly micro check-ins inside existing 1:1s plus a quarterly formal
  review (Huneety, TMI, Culture Amp, Lattice's own guidance, Engagedly, firsthr).
- The review has to be a conversation with a record, not a status field: "The conversation is the
  plan" (Huneety); a documented close-out covering what was completed, what changed, and what is next
  (performspark); notes at each check-in so "the plan's history tells the development story"
  (bundleskills).
- Dropping is a legitimate outcome and must be explicit. "Drop goals that no longer fit" and "close the
  plan with a documented review" appear as *best practice*, while "keeping obsolete goals active after
  priorities change" appears as a named mistake. A silently abandoned goal and a dropped one look
  identical in a checklist.
- Development reviews are forward-looking and must stay separate from performance ratings (Huneety,
  LMSpedia, firsthr) — the same separation the app already enforces between review packets and growth.

**Evidence strength, stated honestly.** The behaviour-change literature does not support a 30-day rule.
Singh et al.'s 2024 systematic review (20 studies, 2,601 participants) found median times to
habit-formation of 59–66 days with a 4–335 day range for *simple* behaviours. So the default 30-day
review date in this app is a **convention chosen for the demo and the UI**, not a validated cutoff, and
the research screen says so. The weaker-support facts used for prioritisation: Gallup (2023 State of the
Global Workplace) reports only 33% of employees strongly agree their manager helps them set goals they
can get excited about; Gallup (2019) reports 14% strongly agree performance reviews inspire improvement,
and weekly feedback is associated with 5.2× the odds of strongly agreeing feedback is meaningful. These
are correlational survey findings, not causal proof that a carry counter improves anybody's development.

**Product benchmarking.** Every commercial suite keeps development plans inside the manager cadence
rather than as a separate annual document: Lattice Grow embeds IDPs in 1:1s and review cycles with
"ongoing development check-ins" and automated reminders; 15Five connects IDP goals to recurring
check-ins and 1:1s and explicitly carries development goals "forward into future review cycles";
Trakstar/Bridge tie development tracking to manager-owned conversations. What they mostly do **not**
expose is the *decision* per commitment — carry-over is usually automatic or a checkbox. That is the
gap this session fills: the same four outcomes as a 1:1 promise (done, still open, carried with a new
date, dropped with a reason), a derived carry depth, and a visible distinction between "the review
happened" and "the date moved".

**Decision (implemented).**

1. **A review is a first-class record** (`growthPlans[].reviews[]`): date, what was discussed, the
   agreed next date, and the per-commitment decisions applied at that moment. `reviewOn` remains the
   scheduled date, but it can only move *legitimately* by holding a review; `updateGrowthPlan` pushing it
   later increments `reviewDeferrals` and stamps `reviewMovedOn` instead of silently accepting it.
2. **Carrying is renegotiation, not failure** — the original keeps its date and a link to its successor,
   the successor keeps the original's `addedOn` (so "carried 2× since 14 Sep" is derived from the chain,
   never stored as a counter), and the live copy is the only thing counted as open work. `GROW-06` fires
   at two carries, exactly as `CONV-06` does for 1:1 promises.
3. **Dropping requires a reason (3–300 chars)** and is excluded from the completion denominator; it is
   never counted as done, even if a stale `done` flag survives an import.
4. **A held review resets the deferral count** and sets the plan's review date to the date the two of
   them agreed. `GROW-07` reports a review date that has been moved twice or more without a review.
5. **The review's dates win**: a commitment carried *in* a review is stamped with the review date, not
   the day the record was typed, so the ledger cannot be rewritten by entering it late.

**Rejected, with the reason recorded.**

| Idea | Reason |
|---|---|
| Auto-rolling every unfinished development action into the next review | Lattice/15Five-style automation hides the one moment where the leader could re-scope or drop the commitment. The stall becomes invisible, which is precisely what `GROW-06` exists to catch. |
| A development-completion percentage per person | Manager-entered, self-reported, and it rewards under-recording; the same reasoning that rejected a 1:1 completion rate. Counts, dates and reasons only. |
| Editing the review date as the primary "review" action | The behaviour the data model should discourage: it makes a plan look managed while nothing is discussed. Kept possible, but counted (`reviewDeferrals`) and signalled. |
| Deleting a dropped commitment | The decision to stop is the useful part. Keeping the reason supports "what did we choose not to do?" and prevents the same promise being re-made blindly. |
| A hard block on plans with no review date | Punishes the honest early state and encourages inventing a date. The app reports it (`GROW-04`) and offers the dialog instead. |
| A fixed 30-day review cadence presented as best practice | The evidence supports frequency, not a cutoff (Singh et al. 2024: median 59–66 days, range 4–335). 30 days is a default, labelled as a convention. |
| Marking commitments done automatically when the plan closes | Closing a plan is an administrative act; capability change needs evidence. Done requires a date and, ideally, a review. |

**Standing research debt.** No controlled evidence that a visible carry count changes a manager's
behaviour, and no validation with real managers. The two new signals are diagnostic, not predictive.
Real-browser keyboard/screen-reader behaviour of the new per-commitment Carry/Drop controls, the review
dialog and the expandable history remains **[UNVERIFIED]** in this container (JSDOM + `axe-core` 4.11
report 0 violations on `#/growth`, `#/people/<id>` and the open review dialog).

**Sources consulted (accessed 2026-10-25).**
- Huneety, *How to review and track an IDP* — https://www.huneetylearning.com/individual-development-plans/reviewing-and-tracking
- Huneety, *How to write an IDP for managers* — https://www.huneetylearning.com/individual-development-plans/for-managers
- PerformSpark, *Individual Development Plan Best Practices for HR* — https://performspark.ai/blogs/individual-development-plans-best-practices
- Let's Catapult, *Employee Development Plan: What to Include and Example* — https://letscatapult.org/blog/employee-development-plans/
- TMI, *How to Build an Employee Development Plan That Drives Real Growth* — https://www.tmi.org/blogs/how-to-build-an-employee-development-plan-that-drives-real-growth
- Culture Amp, *Employee development plans: Templates and examples* — https://www.cultureamp.com/blog/personalized-employee-development-plans
- Lattice, *Employee Development Plans & Growth Software* — https://lattice.com/platform/grow
- Lattice, *Grow Manager Guide to Development One-on-Ones* (field guide PDF) — https://cdn.prod.website-files.com/5b3faf37aa13a17359838c48/62323163936302e190d52f2f_Lattice_Managers%20Guide%20to%20Development%201-1s.pdf
- 15Five, *Growth Studio — Individual Development Plans* — https://www.15five.com/products/perform/growth-studio
- Bundleskills, *Individual Development Plan: Template and 6 Real Examples* — https://bundleskills.com/blog/individual-development-plan-template
- Engagedly, *Individual Development Plan (IDP): A Complete Guide* — https://engagedly.com/blog/what-is-an-individual-development-plan-idp-why-do-you-need-it/
- FirstHR, *Individual Development Plan: A Guide for Small Business* — https://firsthr.app/blog/performance/individual-development-plan
- Singh, B. et al. (2024), habit-formation systematic review, summarised in Phi Management, *Individual Development Plan: Real Timelines* — https://phimanagement.com/blog/individual-development-plan/
- Gallup (2023), *State of the Global Workplace*, as quoted by Teachable — https://www.teachable.com/blog/employee-development-plan
- HBR, *How to Talk to Your Team About Their Career Development* (2023) — https://hbr.org/2023/03/how-to-talk-to-your-team-about-their-career-development

## 23. Internal role transitions: the move nobody onboards (Session 13)

**The question this section answers.** The Schema v6 onboarding tracker (§19) scaffolds a person
*joining the team* for 90 days. But most 90-day transitions a leader will ever manage are not
hires: they are promotions, lateral moves and scope changes by people already on the roster
(IC → Lead is the canonical case). Until this session the only way to give such a person a
30-60-90 plan was to create a "new joiner" plan — which defaulted its anchor to
`person.startDate`, so a plan for a three-year veteran opened at "day 1,069", instantly past
window, with joiner-flavoured checkpoints and no way to record what the move even was. What
does the evidence say about internal transitions, how do they fail differently from external
hires, and what should the record look like?

**Sources & product benchmarks.**
- *Transitions are mostly internal, and the first months predict the outcome:* Michael D.
  Watkins, *The First 90 Days* (Harvard Business Review Press, 2003/2013). In Watkins' survey
  of 580 leaders (avg. 18.2 years' experience), the typical leader had been **promoted 4.1
  times, moved between business units 1.9 times and changed function 1.8 times**, versus
  joining a new company 3.5 times — internal moves outnumber external joins roughly 2:1.
  In his parallel survey of 1,300+ senior HR leaders, almost 90% agreed "transitions into new
  roles are the most challenging times in the professional lives of leaders" and nearly
  three-quarters agreed "success or failure during the first few months is a strong predictor
  of overall success or failure in the job."
- *Internal movers are the under-supported group:* Watkins (responding to McKinsey, 2021):
  "leaders making internal moves get far less support than new hires. In my study, **56% of
  respondents disagreed or strongly disagreed** that their companies did a good job of
  supporting internal moves such as promotions." The promoted-from-within case is repeatedly
  identified as the one organisations most often under-support precisely because "someone who
  already knows the team and the work" is assumed to need nothing — while the real risks
  (leading yesterday's peers, an unclear new mandate, quietly keeping the old job) are
  relational, not operational.
- *How internal transitions actually fail:* Watkins' "promote yourself" imperative — the
  strengths that earned the move get over-applied to a seat that rewards different behaviour
  (his Douglas Ivester case: a superb COO failing as CEO by remaining a "super-COO"); the
  first-time-manager literature calls the same pattern the **Doer Trap** (the newly promoted
  lead keeps doing IC work because it feels productive, while nobody clears the team's
  blockers). Practitioner checklists for internal hires (HiBob) converge on the same four
  contents, in this order: **handover of the previous position** (document
  responsibilities, train a replacement, transfer projects), **new-role clarity** (review
  the new KPIs/expectations that differ from the old seat), **new stakeholder
  introductions**, and a **buddy inside the new team**. Enboarder's transition toolkit adds
  the sharpest framing: "what stays with the person vs what stays with the role — skills
  travel, but systems access and stakeholder ownership don't always."
- *Failure rates justify scaffolding even for proven people:* the widely cited baseline is
  that ~40% of executives fail within their first 18 months in a new role (Watkins 2003, as
  reviewed in the leadership-transition literature; a Center for Creative Leadership white
  paper puts outright executive-integration failure at 38% to over half, attributing it to a
  *diagnostic* failure — applying the old playbook to a new situation — rather than effort).
- *The manager's own manager is the intervention:* DDI's Global Leadership Forecast
  (summarised in manager-onboarding practice guides) finds managers who receive support from
  their own leader during the transition are ~1.5× more likely to be effective in their
  first year. In LeadOS terms: the scaffolding gaps must be framed as the *leader's* debts,
  exactly as `ONB-03` already does for joiners (§19).

**What this application chose, and why.**
| Decision | Reason |
|---|---|
| **`kind` + `label` on the existing plan record (Schema v10), not a new collection** | A transition is the same "first 90 days in the role" object: same horizons, same Day 90 conversation gate, same one-active-plan-per-person invariant. `kind: 'role-transition'` + a `label` naming the new scope records the move itself, which no other record in the app captured. |
| **The anchor is the plan's, never the roster's** | A transition defaults its start to today and can never precede `person.startDate`; `person.startDate` is not touched, so tenure, `isNewJoiner`, `ONB-01`/`ONB-02` and "years on the team" stay truthful. The pre-session behaviour (defaulting to the join date) made every tenured plan instantly "past window" — the exact silent nonsense this product exists to prevent. |
| **A transition requires its label** | The label *is* the feature: "Team Lead · Platform" is what makes the plan readable as a move rather than a second onboarding. Structural requirement (like a goal title), not a quality gate. |
| **A distinct starter template** | The 6 transition checkpoints follow the failure modes above: Day 30 = old-role handover inventory + written scope/authority delta; Day 60 = first early win *in the new seat* + explicit old-habits calibration ("promote yourself"); Day 90 = end-to-end ownership without falling back + goals/GROW reset to the new level. The new-joiner template is unchanged. |
| **Same signals, honest wording** | `ONB-03`–`ONB-05` fire for transitions with transition wording (scaffolding owed is scaffolding owed); tenure-based `ONB-01`/`ONB-02` stay joiner-only, and a transition plan does **not** silence a new joiner's `ONB-02` — the two kinds answer different questions. No new rule ids, so signal history stays comparable. |
| **Kind is correctable, history is not** | `updateOnboardingPlan` can reclassify kind/label (e.g. a plan created before v10) while checkpoints, check-ins and the anchor are preserved. Migration labels every pre-v10 plan `new-hire` with an empty label — the only kind the app could create before, so nothing is invented. |
| **Dialog defaults that match the decision** | Opening the dialog for someone past the onboarding window pre-selects "role transition" anchored to today; switching kind/person re-anchors the suggested date until the leader picks one, after which the field is never overwritten. |

**Deliberately rejected.**
| Idea | Reason |
|---|---|
| Resetting `person.startDate` when a transition starts | Destroys tenure and corrupts every tenure-derived signal. The start date is a fact; the transition is a later fact. |
| Inferring a transition from a role/level edit on the roster | Would fabricate plans from typo fixes. Only the leader knows a move happened. |
| A separate `state.transitions` module | Duplicates horizons, gates, signals and exports to answer the same question; breaks the one-active-plan invariant's meaning. |
| A "transition score" or ramp percentage for the promoted person | Same reason as the rejected onboarding score (§19): missing handover time or an absent buddy is the *organisation's* scaffolding debt, not the person's capability grade. |
| Auto-updating role/title/level when a transition plan is created | The plan records the intended move; the roster edit is a separate deliberate act. Coupling them would let a cancelled plan rewrite someone's record. |

**Standing research debt.** Real-browser (non-JSDOM) interaction with the reworked plan dialog
(kind select → date re-anchor) and visual layout of the two-kind `#/onboarding` list remain
**[UNVERIFIED]** in this container, as in §19. The return-from-leave ("re-boarding") literature
was noted but not yet researched in depth — it is roadmap Next #4, not assumed identical to
promotion transitions.

**Sources.**
- Watkins, M. D., *The First 90 Days* (HBR Press, 2003; updated 2013) — transition taxonomy,
  13.5 transitions per leader, first-months predictor, "promote yourself" / Ivester case.
- Watkins, M. D., *Why is McKinsey Trashing The First 90 Days?* (LinkedIn, 2021) — 56%
  internal-move support gap.
- Watkins, M. D., *Strategy for the critical first 90 days of leadership* (2004) — 40%
  18-month failure baseline.
- HiBob, *New hire checklist* — internal-hire variant (handover inventory, new KPIs, buddy,
  stakeholder introductions).
- Enboarder, *Employee Transition Plan Toolkit* — "what stays with the person vs what stays
  with the role"; 30/60/90 clarity for internal moves.
- Happily.ai, *Manager Onboarding Checklist* — the Doer Trap; DDI Global Leadership Forecast
  manager-support effect; peer-to-manager boundary conversation.
- HRHook, *30-60-90 day onboarding plan* — "Do not skip onboarding because the employee knows
  the company. Focus on the changed identity, relationships, authority, and skills."

## 24. Sharing without the dispute file: conflict-redacted operational exports (Session 14)

**The question.** Until this session a leader could not move their whole workspace to another
device, or share records upwards, without bundling every word of the confidential conflict
records into the file: the JSON backup was all-or-nothing, and CSVs can show tables but cannot
restore a workspace. Was a "leave the conflict records out" mode the right next capability —
and if so, what exactly should be left out, and what could go wrong?

**Why conflict records are not just another table.** Across mediation practice the
confidentiality norm is near-absolute and covers more than content. CIPD's mediation factsheet
says anything said in mediation "should be confidential to those taking part", and that a
mediator may report to HR only *that* a meeting successfully took place, "not disclose the
detail of what was discussed or agreed". Several professional standards go further and treat
**the fact that a case exists at all** — and attendance/status around it — as confidential
information in its own right; mediator working notes are routinely destroyed at conclusion
(EEOC, FCC, Oxford MSD all describe note destruction), because even a content-free trace
 invites reconstruction. Two design consequences follow, both implemented:

1. **Existence traces go too.** LeadOS event-log entries about conflicts already carry no
   content ("Conflict record created"), but they still reveal that a case exists, when it was
   opened and how often it was touched. Under the mediation norm that is itself a disclosure,
   so the operational copy removes conflict *events* as well as records, and discloses only
   counts in a machine-readable marker — the same count-only disclosure the app already uses
   for `CFL-01…04` reminders.
2. **Encryption is not a substitute for omission.** GDPR Art. 5(1)(c) requires shared data to
   be "adequate, relevant and limited to what is necessary" (ICO), and commentators on the
   principle put it bluntly: "a secure, encrypted copy of an unnecessary field is still
   unnecessary." The operational copy is therefore offered plain (the sharing case) *and*
   encrypted (the move-device case), with redaction applied before sealing in the encrypted
   variant, so the omitted records are absent from the ciphertext too.

**The second-order hazard: a "safe" file that is dangerous later.** The real risk of this
feature is not the export; it is a restore months later from the incomplete file, silently
trading a complete local history for an empty conflict list. Mitigations, in depth: the file
declares its own incompleteness (`redactions` marker, counts only); the filename differs
(`leados-operational-…` vs `leados-export-…`); import always reports the omission as a
warning; and importing a file that *declares omitted records* over a browser that *has
readable conflict records* is refused with `reason: 'redacted-replacement'` until the user
explicitly confirms the replacement (Settings asks with a danger dialog and retries with
`replaceWithRedacted: true`). Where the current copy is unreadable (locked/protected), the
existing explicit total-replacement confirmations apply and the omission warning still
surfaces — blocking there would create a dead end for exactly the people the recovery path
exists for.

| Alternative considered | Rejected because |
|---|---|
| Anonymise conflicts instead of omitting them (fake names/dates) | Creates false facts in a file that will be imported as truth; small-team records are re-identifiable from structure anyway. The app's convention is omit-and-declare, never fabricate. |
| Keep conflict events (they contain no content) | Existence and cadence of a case are themselves confidential under mediation practice (above). |
| Refuse to import operational copies at all | Breaks the primary use case — restoring operational records onto a new/empty device. A warning where nothing can be lost is honest; a blanket refusal is a dead end. |
| Guard on "mode used" even when 0 records were omitted | A 0-omission operational copy is byte-equivalent in content to a full backup of that workspace; guarding it would cry wolf and train users to click through the warning that matters. The guard fires on *declared omissions*, and completeness is still announced. |
| Detect redacted files without the marker (e.g. "conflicts empty but workspace old") | Unfalsifiable inference — an honestly conflict-free workspace is indistinguishable from a hand-stripped one. The marker is the only non-fabricated signal; malformed markers are ignored rather than guessed at. |

**Honest limits.** The marker is a declaration, not a proof: someone can edit JSON by hand,
and an unmarked stripped file is undetectable (above). "Conflict-free" means the conflict
collection and its event traces are absent; it does not mean the file is fit for any audience —
1:1 notes, feedback and reviews remain in it, and the UI says so. There is `[UNVERIFIED]`
real-browser evidence for the new Settings flows (download handler, modal-stacked confirm);
coverage is JSDOM + `axe-core`, matching the standing debt.

**Sources.**
- CIPD, *Workplace Mediation* (factsheet) — confidentiality of content; only the fact of a
  successful meeting may be reported, not detail.
- ICO, *Principle (c): Data minimisation* — Art. 5(1)(c): "adequate, relevant and limited to
  what is necessary".
- Legiscope, *GDPR Purpose Limitation and Data Minimisation: Official Rules in Practice* —
  "A secure, encrypted copy of an unnecessary field is still unnecessary."
- Workplace-mediation confidentiality practice (CMC, EEOC Q&A, FCC mediation agreement,
  University of Oxford MSD) — mediator notes destroyed; the occurrence/attendance of a case
  itself treated as confidential.

## 25. Closing the execution loops: Today's development-review queue, succession-to-transition handoff, and return-to-work ("re-boarding") 30-60-90 plans (Session 15)

**The three gaps.** Sessions 12 and 13 built the underlying ledgers — GROW development reviews
with explicit commitment outcomes (§22) and internal role-transition 30-60-90 plans (§23) — but
left three execution loops disconnected in daily manager workflow:

1. **Development reviews had a ledger, not a daily queue.** `reviewStatus` knew which GROW plans
   were overdue, due within 7 days or unscheduled, and how many times a review date had been
   pushed without holding one (`reviewDeferrals`), yet `#/today` only listed overdue individual
   GROW commitments inside *Loose ends* and linked out to `#/growth`. A manager triaging Today
   could not hold a due development review from Today itself.
2. **Succession readiness stopped at the rating.** `#/readiness` evaluated behavioural evidence
   for named seats (`EVIDENCE_DEFINITIONS`), and `#/onboarding` ran 30-60-90 `role-transition`
   plans, yet when a tracked candidate actually stepped into a seat there was no handoff between
   the two — managers had to re-enter the seat and person manually on another screen while losing
   sight of the readiness gaps and notes already recorded.
3. **Return from extended leave had to masquerade as a promotion or a new hire.** Using
   `new-hire` for a returning tenured employee anchored horizons to a years-old `person.startDate`;
   using `role-transition` demanded a promotion/new-role label and seeded handover checkpoints
   aimed at leaving an old job rather than catching up on context and pacing load back sustainably.

**Research & product benchmarks.**

- *Actionable review prompts beat passive dashboards:* Whitmore's GROW model (*Coaching for
  Performance*) treats the *Will* stage as incomplete without an agreed review conversation where
  commitments are inspected, renegotiated or retired. Lattice Grow and 15Five Growth Studio
  surface IDP check-ins inside recurring manager workflows rather than burying them on a separate
  development tab, though both lean on automatic goal carry-over. Surfacing `dueGrowthReviews`
  directly on `#/today` (ordered overdue → due within 7 days → unscheduled) with a one-click
  *Hold review* button that opens `openGrowthReviewDialog` in place combines suite-grade workflow
  convenience with LeadOS's explicit per-commitment decision discipline (done / still open /
  carried / dropped with reason).
- *Succession planning fails at the handoff into Day 1:* Charan, Drotter & Noel (*The Leadership
  Pipeline*) and Watkins (*The First 90 Days*, §23) both observe that organisations spend far
  more effort rating potential successors than scaffolding the first 90 days once someone steps
  into the seat — assuming an internal candidate "already knows how things work here". Benchmarked
  talent suites (Lattice Talent Reviews / Workday Succession) store readiness matrices separately
  from onboarding checklists. `transitionHandoff` bridges `#/readiness` (and `#/people/:id`)
  into `openOnboardingPlanDialog` pre-filled with `kind: 'role-transition'`, `label: seat`,
  `startDate: today`, and a read-only *Succession handoff* callout displaying the candidate's
  recorded readiness status, behavioural evidence count and optional development-gap `notes` —
  while leaving `roleClarity` blank for the manager to write honestly and leaving `person.role`
  and `person.startDate` untouched.
- *Return-to-work ("re-boarding") fails on context drift and unpaced load, not capability — and
  leave reasons do not belong in a browser app:* Ladge & Greenberg (*Academy of Management
  Perspectives*, 2015; HBR, *How to Make Sure Working Parents Can Succeed When They Return*) and
  CIPD's return-to-work guidance highlight three recurring failure modes after parental,
  caregiving, sabbatical or extended absence: (a) nobody briefs the returner on decisions,
  priorities and org changes that happened while they were away; (b) full pre-leave workload
  resumes on week one without agreed pacing; and (c) informal peer re-connection is left to
  chance. At the same time, GDPR Art. 9 treats health/medical data as special-category data
  requiring strict necessity and safeguards. LeadOS therefore adds `'reboarding'` as a third
  `ONBOARDING_KINDS` value (Schema v11) with six re-entry starter checkpoints (context catch-up,
  4-week load pacing, peer catch-up buddy, key stakeholder re-connections, one bounded early
  deliverable, and Day 90 steady-state goal/GROW recalibration), optional non-medical context
  `label`, and explicit UI guidance never to record medical, health or personal leave reasons.

| Alternative considered | Rejected because |
|---|---|
| Auto-copying readiness warnings/notes into `roleClarity` on handoff | Evaluation notes describe past readiness gaps, not agreed 90-day scope and decision authority; copying them silently fabricates `roleClarity` and suppresses `ONB-03` before expectations are written. |
| Auto-updating `person.role` when starting a transition from `#/readiness` | A 30-60-90 transition may represent an acting/stretch seat or phased handover before a formal title change; roster edits stay explicit. |
| Adding a `leaveType` or `leaveReason` field to `reboarding` plans | Invites storing medical, health or family leave data (GDPR Art. 9 special-category risk) in a local browser tool that needs only operational re-entry scaffolding. |
| Reusing `role-transition` for return-to-work | Forces a fake "new role" label when the person is returning to the *same* role and seeds old-role handover checkpoints that do not match re-entry needs. |
| Navigating from `#/today` to `#/growth` instead of opening the review dialog directly | Adds an extra screen hop and forces the manager to hunt for the overdue card on `#/growth` instead of holding the review where the prompt appeared. |

**Honest limits.** As with §§19–24, no controlled trial with managers validates whether these
prompts improve retention, transition outcomes or return-to-work experience. Real-Chromium pixel
contrast, mobile layout and screen-reader traversal of the new `#/today` card, `#/readiness`
handoff and `reboarding` flows remain **[UNVERIFIED]** in this container (verified via Node 22,
JSDOM and `axe-core` 4.11 with 0 violations across 289 automated tests).

**Sources.**
- Whitmore, J., *Coaching for Performance* (5th ed.) — GROW *Will* review accountability.
- Charan, R., Drotter, S., & Noel, J., *The Leadership Pipeline* (Jossey-Bass) — passage-specific
  scope/time-application shifts when stepping into a new leadership seat.
- Watkins, M. D., *The First 90 Days* (HBR Press) — internal transition scaffolding (§23).
- Ladge, J. J., & Greenberg, D. N. (2015), *Extreme Mixed-Emotions: Becoming a New Mother in the
  Professional Workplace*, Academy of Management Perspectives — re-entry uncertainty, identity/load
  recalibration and manager scaffolding after extended leave.
- CIPD, *Managing a Return to Work after Long-Term Absence* — structured catch-up, phased pacing
  and confidentiality boundaries around absence reasons.
- GDPR Art. 9 & ICO Special Category Data guidance — data-minimisation prohibition on collecting
  unnecessary health/medical information in general management records.

## 26. Closing the remaining daily loops: decision outcome reviews on Today, delegation-to-GROW capability handoff, and 1:1 prep-sheet carry-through (Session 16)

**The three gaps.** After Session 15 closed Today's development-review queue and succession
handoff, source audit revealed three remaining workflow breaks between planning and follow-through:

1. **Decision outcome reviews had a signal (`DEC-02`), not an execution queue — and decisions were
   immutable once saved.** `app/core/domain/decisions.js` flagged `reviewsDue` only after a review
   date was strictly past (`< today`) and did not check `Boolean(d.chosen)`, so an *undecided*
   record whose `reviewOn` passed could masquerade as an outcome review due. Meanwhile `#/today`
   lacked a *Decision reviews* card comparable to *Development reviews*, `DEC-01` linked to
   `#/decisions?decision=<id>` which `views/decisions.js` ignored, `DEC-03` asked the manager to
   *"Name the approver"* while no `updateDecision` action or *Edit* dialog existed, and DACI
   person matching used substring `.includes()` (`"Bo"` false-matching `"Bob"`).
2. **Stretch delegations and GROW commitments lived in two disconnected ledgers.** `#/delegations`
   recorded owned outcomes, authority levels (`investigate` → `own`), checkpoints and terminal
   outcomes, while `#/growth` tracked GROW capability commitments (`will[]`). Turning a stretch
   delegation into a tracked GROW commitment required manual re-typing on a second screen with
   zero cross-reference when the delegation later completed or returned.
3. **1:1 preparation stopped at the door of `Log a 1:1`.** `#/prep/<personId>` assembled the
   report's waiting `talkingPoints` and `suggestAgenda`, yet clicking *Log the 1:1* dropped any
   item selection made during preparation, collapsed every checked suggestion's `source` to
   `'suggested'` instead of its real provenance (`'delegation'`, `'onboarding'`, `'growth'`, etc.),
   and left covered employee `talkingPoints` stuck on `person.talkingPoints` forever unless the
   manager opened a separate dialog after the meeting.

**Research & product benchmarks.**

- *Separating decision quality from outcome luck requires scheduled post-decision reviews:*
  Annie Duke (*Thinking in Bets*) warns against **"resulting"** — judging the quality of a
  decision solely by whether it turned out well without revisiting the rationale and assumptions
  recorded at decision time. Kahneman, Lovallo & Sibony (*Before You Make That Big Decision*, HBR)
  and Gary Klein (*Performing a Project Premortem*, HBR) show that lightweight, pre-scheduled
  outcome reviews calibrate leader judgement only when they happen while context is still
  retrievable; Bain's RAPID and Intuit's DACI frameworks likewise treat explicit *Approver*
  clarity as revisable governance metadata when a missing approver is caught (`DEC-03`). Decision
  intelligence tools such as Cloverpop surface due decision reviews in active queues rather than
  archiving calls out of sight. LeadOS now guards `reviewsDue` and `dueDecisionReviews` on
  `Boolean(d.chosen)`, surfaces overdue and due-within-7-days calls directly on `#/today`
  (prioritising `irreversible` calls on ties) with an inline *Review outcome* modal, honours
  `?decision=<id>` focus links, adds audited `updateDecision`, and renders exact token-matched
  DACI involvement on `#/people/<id>`.
- *70% of capability growth happens inside real stretch assignments, but only when paired with
  deliberate reflection:* McCall, Lombardo & Eichinger (*The Career Architect* / Center for
  Creative Leadership's *Lessons of Experience*, 70-20-10 model) demonstrate that real owned
  responsibilities — not classroom courses — drive the majority of leadership and technical
  growth, *provided* a coaching loop extracts lessons from the experience. Whitmore's GROW model
  positions stretch assignments inside *Options* and concrete *Will* commitments. Unlike Lattice
  or 15Five — where project tasks and IDP items either stay siloed or auto-sync completion
  percentages — LeadOS adds explicit `delegationId` linking on `growthPlans[].will[]` (Schema
  v12) with one-click *Add to GROW* / *Start GROW plan* handoffs from `#/delegations`, carry-chain
  link preservation, and an explicit coaching-reflection prompt when a linked delegation
  completes or returns (**never** silently auto-closing the GROW commitment).
- *1:1s work best when employee topics lead and carry cleanly into the meeting record:* Steven
  Rogelberg (*The Surprising Science of Meetings*) shows that 1:1 effectiveness rises sharply
  when direct reports shape the agenda and see their raised topics explicitly addressed rather
  than crowded out by status updates. Dedicated 1:1 tools (Fellow, Hypercontext, Lattice 1:1s)
  carry talking points directly from prep into the live meeting doc and mark covered topics done
  while keeping uncovered ones queued for next time. LeadOS now renders interactive checkboxes on
  `#/prep/<personId>` across *Their topics* and *Suggested agenda*, passes the exact selection
  into `openOneOnOneDialog`, preserves true agenda `source` provenance (`'their-topic'`,
  `'delegation'`, `'onboarding'`, etc.), and clears covered employee topics **only** when a 1:1
  is logged as `held` (never on `skipped` or `moved`).

| Alternative considered | Rejected because |
|---|---|
| Auto-closing a GROW `will` commitment when its linked delegation completes | Shipping a delegated deliverable is operational execution; capability growth requires a coaching reflection on *what was learned* before marking the GROW commitment done. |
| Counting undecided decisions with past `reviewOn` dates inside `reviewsDue` / `DEC-02` | An unmade decision needs a *call* (`DEC-01`), not an outcome review; mixing the two muddies accountability and lets `reviewDecision` run before an option is chosen. |
| Clearing all `person.talkingPoints` automatically whenever any 1:1 is logged | Wipes topics the conversation ran out of time to cover — or worse, wipes topics on a `skipped`/`moved` 1:1. Only explicitly checked topics in a `held` 1:1 are cleared. |
| Substring matching (`field.includes(name)`) for DACI roles on person pages | False-matches short names inside longer ones (`"Bo"` inside `"Bob"` or `"Bono"`). Delimiter-aware token matching keeps DACI attribution accurate. |

**Honest limits.** As with §§19–25, all records remain manager-entered in a single local browser
profile: direct reports cannot submit `talkingPoints` or co-sign a GROW reflection themselves,
and no field study with managers measures whether Today's decision-review queue improves
long-term calibration. Real-Chromium pixel contrast, mobile layout and print/PDF rendering of the
updated `#/today`, `#/decisions`, `#/delegations`, `#/growth` and `#/prep/<id>` views remain
**[UNVERIFIED]** in this container (verified via Node 22, JSDOM and `axe-core` 4.11 with 0
violations across 293 automated tests).

**Sources.**
- Duke, A., *Thinking in Bets: Making Smarter Decisions When You Don't Have All the Facts*
  (Portfolio) — separating decision process quality from outcome luck ("resulting").
- Kahneman, D., Lovallo, D., & Sibony, O. (2011), *Before You Make That Big Decision*, Harvard
  Business Review — structured decision hygiene and post-decision review discipline.
- Klein, G. (2007), *Performing a Project Premortem*, Harvard Business Review — explicit
  assumptions and scheduled outcome calibration.
- McCall, M. W., Lombardo, M. M., & Eichinger, R. W., *The Career Architect* / CCL *Lessons of
  Experience* — stretch assignments + reflection loop (70-20-10 developmental model).
- Rogelberg, S. G., *The Surprising Science of Meetings* (Oxford University Press) — employee-led
  1:1 agendas and explicit topic follow-through.




## 27. A phase conversation is not a completed checklist (Session 17)

**Audit and gap.** The existing `onboardingHealth` model already distinguishes checkpoint
completion from Day 30 / 60 / 90 conversation dates and exposes `ONB-04` for missed
conversations. Today did not offer these conversations as executable work. Its other
review queues were directly actionable; onboarding required a screen hop and manual search.
The standing inventory in §§5, 19, 23 and 25 therefore pointed to a workflow gap, not a
missing framework, another onboarding schema or a new backend.

### Fresh research, retrieved 2026-10-25

Outbound research in this environment is restricted to approved hosts. The following
public documents and product source were actually read through GitHub's API; they are
pinned for repeatability. We did **not** log into a vendor product or freshly verify the
full feature claims for Lattice, 15Five or Culture Amp in earlier sections.

1. **Sourcegraph's documented manager practice and Lattice workflow** —
   [Onboarding Feedback Milestones](https://github.com/sourcegraph/handbook/blob/5752928b213a3ddbc7cee4459524f404a5b96fb4/content/departments/people-talent/onboarding-feedback-milestones.md),
   [Onboarding Review Process](https://github.com/sourcegraph/handbook/blob/5752928b213a3ddbc7cee4459524f404a5b96fb4/content/departments/people-talent/onboarding-reviews.md),
   and [Hiring Manager responsibilities](https://github.com/sourcegraph/handbook/blob/5752928b213a3ddbc7cee4459524f404a5b96fb4/content/departments/people-talent/onboarding-for-hiring-managers.md).
   This published workflow describes structured two-way conversations, written expectations,
   and Lattice reviews issued at days 25 and 85 before month-one/month-three conversations.
   It explicitly says onboarding reviews do not replace 1:1s. It also assigns buddy selection
   and other scaffolding to managers. This is evidence of one company's documented use,
   not proof of current vendor defaults, efficacy or universal timing. Adapt: surface the
   conversation before its date; identify the person and plan; keep conversation evidence
   separate from the task list. Do not copy company-specific probation/re-hire ratings.
2. **Frappe HR employee-onboarding product implementation** —
   [Boarding controller](https://github.com/frappe/hrms/blob/20e9b8934d5f9d63522eb2fbeaa483b00e7cfe4f/hrms/controllers/employee_boarding_controller.py)
   and [Employee Onboarding](https://github.com/frappe/hrms/blob/20e9b8934d5f9d63522eb2fbeaa483b00e7cfe4f/hrms/hr/doctype/employee_onboarding/employee_onboarding.py).
   Source confirms template activities become dated project tasks with explicit assignments;
   date offsets are anchored to `boarding_begins_on`, and overall boarding status follows
   project progress. Its explicit completion operation can mark all associated tasks complete.
   Adapt the anchored-date and actionable-work patterns, **not** the task-completion semantics:
   LeadOS's phase dates already use each plan's own anchor, and a recorded conversation
   must not silently complete its checkpoints, other phase conversations, or the entire plan.
   This is a source-level benchmark, not an executed Frappe deployment or code reuse.

### Established frameworks applied, with boundaries

- **Bauer's organizational-socialization / Four Cs model** (see §19): clarification and
  connection are manager-provided scaffolding. A late check-in is a missing opportunity to
  hear the joiner, not a numeric measure of their capability. Existing templates are retained.
- **Watkins' transition horizons** (§§19, 23): internal role moves need explicit expectations
  and two-way calibration just as new hires do. Return-to-work plans retain their own start
  anchor and privacy boundaries (§25); tenure is never reset to drive this queue.
- **Psychological safety** (§4): ask about unclear expectations, surprises and support;
  avoid probation grades and medical/leave reasons. These are design guardrails, not a claim
  that a browser prompt raises psychological safety or predicts retention.

### Implementation, backlog and explicit rejections

| Considered capability | Status / consequence |
|---|---|
| Date-derived phase conversation queue on Today | **Implemented:** `dueOnboardingReviews` + shared `onboardingCheckinsCard`; overdue then due today/within seven UTC calendar days, all three plan kinds. |
| Complete queue and exact source-plan navigation | **Implemented:** `#/onboarding?status=checkins`, `?person=`, `?plan=`; completed exact-plan links remain resolvable, stale/archived-person links explain why no record is shown. |
| In-place capture, traceability and truthful completion | **Implemented:** existing validated `recordOnboardingReview`, persisted phase record and `onboarding.review.recorded` event; cancel is inert; other horizons and checkpoints stay untouched. |
| Manager support commitments after phase conversations | **Planned:** explicit opt-in owner/date handoff into 1:1 follow-through; existing `blockers` are still free text, not an owned task ledger. No automatic export into performance evidence. |
| A seven-day lead time as a validated best practice | **Rejected:** seven days is the existing app's fixed review-queue look-ahead convention, not a research finding or universal deadline. |
| Automatically mark Day 30/60 held when Day 90 is held | **Rejected:** invents conversations that may never have happened. Missing earlier phases remain visible while the plan is active. |
| Completing checkpoints or the plan when logging a check-in | **Rejected:** confuses conversation evidence with delivery; the existing explicit completion action remains separate. |
| Scheduled email/calendar reminders or a new task database | **Deferred:** would break the no-backend architecture; queues derive when the app renders and send nothing. |

**Verification and limits.** Twelve new Node/JSDOM tests cover boundaries, sort stability,
private-data exclusion, all three kinds, cancellation, validation, lifecycle, deep links,
persistence, visible storage failure and XSS-safe rendering. Chromium 153 exercises
Today → complete queue → dated conversation → reload → exact plan at desktop and mobile
sizes, with five WCAG A/AA axe scans (including color contrast) reporting no violations.
There is no real-manager outcome study, screen-reader certification, Safari/Firefox or
physical-device verification. Full evidence boundaries are in the session-17 audit.

---

## 28. Delegation follow-through as a support prompt, not a performance verdict (Session 18)

### Fresh research, retrieved 2026-10-25

- The Center for Creative Leadership's first-time-manager research describes delegation and
  micromanagement as a transition challenge: managers must decide when to step in or provide
  support without taking ownership back. Its practical advice treats new managers as needing
  support and development, not as people whose delegation record can be graded. [CCL, *Understanding
  the Leadership Challenges of First-Time Managers* (2026 PDF)](https://www.ccl.org/wp-content/uploads/2026/02/leadership-challenges-first-time-managers-research-paper-center-for-creative-leadership.pdf).
  This research strengthens the case for a practical aid on the manager's own next action.
- Gallup's article reports a 2014 study of 143 Inc. 500 CEOs: people ranked as high in delegation
  talent also had higher growth/revenue outcomes in that sample, and described delegators as
  setting outcome expectations, ensuring resources and encouraging autonomy. This is an
  association in a small, selected founder/CEO sample, not causal proof or a universal manager
  benchmark. [Gallup, *Delegating: A Huge Management Challenge for Entrepreneurs*](https://news.gallup.com/businessjournal/182414/delegating-huge-management-challenge-entrepreneurs.aspx).
- **Product gap checked in source:** the live delegation view already exposed check-in,
  completion and return actions, while Today had no direct lane for blocked/stale work. Existing
  `delegationHealth` already distinguished blocked, overdue, missing-date and stale-check-in
  facts; no new model or arbitrary deadline was required.

### Design consequence and safety boundary

Today now derives the queue from those existing record signals, ordered blocked → overdue →
missing due date → stale check-in. A blocked result appears first because the leader can offer
help; it is not a judgement about the team member. **Record check-in** and **Complete** open the
existing validated dialogs and persist the respective `delegation.checkin` /
`delegation.completed` events. A follow-up marked on-track removes the item from the attention
list, but does not complete the outcome; completion and return-to-leader remain separate, explicit
actions.

The existing configurable seven-day interval is a team convention. It is not newly validated by
CCL or Gallup, and the queue does not claim to predict missed delivery. There are no background
reminders, employees are not notified, and manager-entered status is not independently verified.

### Inventory and explicit decisions

| Capability | Status / consequence |
|---|---|
| Direct Today queue for blocked, overdue, unscheduled and stale active delegations | **Implemented:** pure `dueDelegationCheckins`; selected items are actionable without leaving Today. Archived-owner records remain visible and are labelled. |
| Existing full attention lane and source-record links | **Reused:** `#/delegations?filter=attention` plus exact `?delegation=<id>` route. |
| Check-in and completion event history / terminal outcome integrity | **Reused:** existing validated dialogs and `delegation.checkin` / `delegation.completed` events; check-in never silently completes or returns work. |
| Fixed global check-in schedule | **Rejected:** teams and assignments differ; keep the configured cadence explicitly labelled as a local convention. |
| Manager-entered readiness or performance score derived from stale delegation | **Rejected:** record completeness is not employee performance; no owner ranking, capability inference or health-score input. |
| Background reminders / employee notifications | **Deferred:** canonical local app cannot schedule or send them; do not imply a notification was delivered. |

**Verification boundary.** Pure priority/order/exclusion and deterministic state tests plus JSDOM Today →
open dialog → cancel with no write → record check-in → event/persistence/reload, and explicit
completion with required delivered-result evidence, passed. Axe scans of the selected dashboard and
dialog found zero WCAG A/AA/21AA violations, excluding color contrast in JSDOM. No physical/mobile browser pass, real screen-reader test, manager usability study or
employee outcome study was conducted in this session; those remain **[UNVERIFIED]**.

## 29. Performance-review follow-through as an explicit handoff (Session 19)

### Sources checked 2026-10-25

- CIPD's current performance-management factsheet describes reviews as an opportunity for
  learning and improvement and advocates a continuous cycle, high-quality coaching conversations,
  and regular, timely feedback. It also cautions that objectives should be meaningful and that
  complex knowledge work may call for learning outcomes rather than rigid targets. This informed
  the choice to carry a review focus forward as editable context, not auto-convert it to a metric.
  [CIPD, *Performance management: An introduction* (29 Jan 2026)](https://www.cipd.org/en/knowledge/factsheets/performance-factsheet/).
- MIT HR describes performance reviews as part of ongoing manager–employee dialogue, calls for
  shared responsibility and follow-through, and says conversations should establish future SMART
  goals and plan follow-up discussions. This supports a deliberate conversation/form step instead
  of an automatic record-creation side effect.
  [MIT Human Resources, *Performance Reviews*](https://hr.mit.edu/performance/reviews).
- Lattice's published product notes say its Agent can draft Growth Areas from reviews, feedback
  or 1:1s and add action items; its Grow product describes individual development plans and 1:1
  integration. This is a vendor description of functionality, not independent evidence that the
  feature improves outcomes. The useful pattern is reducing re-entry while connecting context to
  ongoing development; LeadOS deliberately uses a human-controlled, editable form and keeps the
  exact source review rather than inferring agreement or auto-writing action items.
  [Lattice, March 2026 product updates](https://lattice.com/blog/march-2026-product-updates);
  [Lattice Grow](https://lattice.com/platform/grow).

### Repository gap and selected design

The completed packet stored manager `development` and `nextSteps`, while goals and GROW plans
were created through separate forms with no review provenance. The prior workflow therefore
lost context at exactly the point where ongoing performance conversations should turn toward
learning. The handoff is available only on a completed review and offers two explicit choices:

- **Goal:** editable prefill of the development focus, with owner fixed to the reviewed person,
  authorship left unknown, and a human-entered measurable key result required.
- **GROW:** editable Goal prefill only. Reality, Options and a new Will commitment remain empty
  until the leader and person formulate them; review `nextSteps` appear only as a clearly labelled
  discussion prompt, never as a prefilled agreement.

Schema v13 adds nullable `sourceReviewId` on goals and growth plans. Creation validates that the
source review exists, is complete and belongs to the same person; normalization clears dangling or
cross-person links and preserves valid provenance if the source review is later reopened for a
correction. Both sides link in the UI and the operational CSVs. Completion itself creates no
follow-up record. Existing GROW behavior closes the previous active plan when a new one is saved;
the handoff form now calls this out if one exists. No dependency, backend, account, network call,
reminder or new personal-data collection was added.

### Verification and boundaries

The new API tests cover v12→v13 migration, same-person/complete-source guards, author unknown,
link repair, CSV preservation and no side effects on review completion. A real-dialog JSDOM test
runs both handoff choices, confirms editable text and empty GROW Will, submits only a user-written
commitment, and checks both-direction UI traceability. These tests do not show that managers and
employees understand or agree with a resulting plan. Real Chromium/mobile, assistive technology,
print output, human usability and outcome validation remain **[UNVERIFIED]**.

## 30. Manager-owned support after Day 30/60/90 check-ins (Session 20)

### Sources checked 2026-10-25

- **ACAS, Planning an induction programme** (guidance updated 30 June 2026): plan an induction
  around the role and person, maintain regular manager contact, listen and answer questions, give
  feedback/guidance, and review training and support needs. This supports an explicit manager
  follow-up after a recorded conversation; it does not say to turn candid concerns into employee
  performance evidence or prescribe a universal deadline.
  [ACAS, *Planning an induction programme*](https://www.acas.org.uk/inductions/planning-an-induction-programme).
- **CIPD, Employee induction**: its practical induction tools cover preparation, phased induction
  and evaluating the process. The applicable product pattern is a phase-linked next step that can
  be revisited, rather than a one-off checklist completion claim.
  [CIPD, *Employee induction*](https://www.cipd.org/en/knowledge/tools/employee-induction/).
- **MIT Human Resources, Performance Reviews**: guidance emphasizes shared responsibility,
  explicit expectations and resources, ongoing dialogue, reviewing earlier commitments/obstacles,
  setting concrete next steps and planning follow-up. This informed an opt-in action authored by
  the manager, with a due date and later review, not an automatic task generated from notes.
  [MIT HR, *Performance Reviews*](https://hr.mit.edu/performance/reviews).
- **Lattice Help, Add and manage 1:1 action items**: the product documents assigned, optionally
  dated items that remain available across meetings until explicitly completed. This is a vendor
  description, not independent outcome evidence. LeadOS reuses the persistent action-ledger
  pattern, but retains 30-60-90 check-in provenance and keeps this record distinct from a real
  meeting action until a held 1:1 explicitly reconciles it.
  [Lattice Help Center, *Add and manage 1:1 action items*](https://help.lattice.com/en-us/articles/15178767-add-and-manage-1-1-action-items).

### Repository gap and design decision

The 30/60/90 check-in stored `heldOn`, `summary` and optional `blockers`, while the 1:1 commitment
ledger stored actions nested inside actual meeting records. No explicit manager-owned action
could be attached to the check-in without either silently copying candid blocker text or inventing
a meeting. The improvement creates an independent, user-entered manager-support record only after
a check-in exists. The blank form asks the manager to describe their specific action and choose a
due date. It stores stable check-in ID, plan ID, horizon and source-date snapshot; later edits to
the check-in keep the source identity and do not rewrite the original date snapshot.

The new record participates in the manager's open/overdue obligation ledger and can be explicitly
marked done on the board or reconciled in a later *real held 1:1* as done, carried forward, or
dropped. A carried copy keeps its originating phase and date; the actual meeting is separately
recorded as the carry/confirmation context. `managerSupport` is not a performance-review evidence
source, blockers are not imported into it, and ordinary check-in recording creates no task.
Existing meetings and action history remain untouched. Schema v14 introduces a separate
`state.managerSupport` collection without migrating/inferencing earlier check-ins into actions.
The `actions` CSV export adds source-check-in ID, plan, horizon and held date fields.

### Verification limits

Automated API, normalization, migration, CSV, source-link, real-1:1 reconciliation, snapshot-rewind,
review-evidence-exclusion and JSDOM interaction checks cover the data path. They do not establish
that a real manager or employee interprets the action correctly, that candid disclosure feels
safe, or that follow-through improves. Real-browser/mobile, assistive technology, human usability,
privacy effects and employee outcomes remain **[UNVERIFIED]**. The approach does not create
notifications or claim that a future meeting will occur.

## 31. Real-browser validation of manager-owned check-in follow-through (Session 21)

### Guidance checked 2026-10-25

- **W3C WAI-ARIA Authoring Practices, Modal Dialog Pattern.** Its keyboard pattern moves focus
  into a modal, keeps Tab and Shift+Tab within it, and closes it with Escape; implementation
  notes also discuss returning focus to the invoking control. These are interaction expectations,
  not proof of screen-reader compatibility. They informed the focused real-Chromium keyboard
  checks in the new smoke script.
  [W3C WAI-ARIA APG, *Dialog (Modal) Pattern*](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### Audit gap and validation decision

Session 20 had JSDOM lifecycle and axe coverage for the new manager-support form, ledger and 1:1
reconciliation, but no real-browser run of that specific workflow. The repository already had
optional Chromium checks for conflicts and onboarding phase queues. Extending those large scripts
would couple otherwise separate smoke scenarios, so Session 21 adds a standalone, optional,
isolated `scripts/app-manager-support-smoke.mjs`.

The new script uses a fictional person and a fixed clock in a clean browser context. It records a
Day 30 check-in with a distinct candid blocker string, explicitly enters a manager-owned action and
due date, follows the source link, and settles the action in an actual held 1:1. It also verifies
that cancellation and opening the meeting dialog write no records, that the blocker string is not
copied into the commitment or displayed on the 1:1 board, and that the saved source phase/date and
meeting provenance remain intact. It checks axe findings, horizontal overflow at selected desktop
and mobile viewport sizes, focus entry/containment, Escape dismissal and focus restoration. No
product data/schema or application dependency changed.

### Evidence and limits

- Chromium **153.0.8010.0**, headless: new smoke script passed; no uncaught page/console errors,
  no external application requests, and no horizontal overflow at **1440×1000** and **390×844**.
- Eight axe-core scans using WCAG 2.1 A/AA rule tags reported zero findings. Keyboard tests cover
  focus entering the modal, Tab and Shift+Tab staying within it, Escape close and return to the
  trigger. Existing conflict and check-in queue Chromium scripts were also rerun successfully.
- Automated axe is not a WCAG conformance certificate; headless Chromium is not exhaustive visual
  or device testing. No actual assistive technology/screen reader or manager/employee comprehension
  session was available in this run. Those, browser diversity, print/PDF and representative
  large-workspace performance remain **[UNVERIFIED]**.

## 32. Programmatic association for inline validation errors (Session 22)

### Guidance checked 2026-10-25

- **W3C WAI Forms Tutorial, User Notification.** Dynamic errors should be made noticeable to
  assistive technology (for example, with an alert container); field-level messages can also be
  associated with their matching controls using `aria-describedby`. Messages should be concise and
  explain how to correct the problem. This informed the field-error association fix and regression
  checks. The guidance does not replace testing with actual assistive technologies.
  [W3C WAI, *User Notification*](https://www.w3.org/WAI/tutorials/forms/notifications/).
- **W3C WCAG Technique ARIA21.** The informative technique demonstrates `aria-invalid` and
  `aria-describedby` together to mark a field invalid and expose its error text. Techniques are
  examples, not normative requirements in themselves.
  [W3C, *ARIA21: Using aria-invalid to Indicate An Error Field*](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21).

### Audit finding and repair

Reviewing the shared form helper while preparing screen-reader tests found that `setFieldError`
inserted inline text in `role="alert"` and marked its control `aria-invalid="true"`, but left
`aria-describedby` pointing only at the ordinary help text (or unset). When focus later returned
to the invalid control, its specific correction was not programmatically associated with it. Axe
had not reported this gap.

`buildForm` now retains the existing help-text ID and adds the current inline error ID to the
control's `aria-describedby` when an error appears. Clearing an error removes only that error ID
and the invalid state, while preserving the help association. A JSDOM flow and the Chromium
manager-follow-up smoke check assert the invalid state, live error role, both description IDs and
successful cleanup/retry. The helper is shared, so the repair applies to all forms that use
`setFieldError`, not only this follow-up dialog.

### Verification limits

The existing focused UI flow passed and the full-suite/Chromium results are recorded in the
Session 22 log. Automated DOM assertions prove the relationship exists, not that NVDA, JAWS,
VoiceOver, TalkBack or Orca announce it clearly or without duplication. No actual screen-reader
session or manager/employee comprehension study was available; both remain **[UNVERIFIED]**.

## 33. Cross-domain operational cases & event-driven parallel propagation engine (Session 23)

### Cross-domain synthesis

First-time managers rarely experience delivery incidents, vendor failures, scope escalations, or
strategic bets as isolated entries inside one HR tool. An operational incident simultaneously tests
engineering reliability, financial and capacity trade-offs, stakeholder politics, OKR confidence,
decision governance, and blameless psychological safety. Session 23 synthesises seven quantitative
and qualitative traditions into a single local-first entity (`state.cases`) backed by a typed
cross-module relationship graph (`state.links`) and a deterministic parallel rules engine
(`app/core/domain/automation.js`):

1. **Engineering & Safety Science — AIAG-VDA (2019) FMEA Action Priority + Reason (1990) Swiss-Cheese Barriers.**
   Classical Risk Priority Numbers ($\text{RPN} = S \times P \times D$, $1..1000$) treat
   $(S=10, P=2, D=2 \Rightarrow 40)$ as lower priority than $(S=4, P=5, D=5 \Rightarrow 100)$.
   AIAG-VDA (2019) corrected this by elevating Severity 9–10 failure modes to High/Medium Action
   Priority regardless of modest RPN. Reason's (1990) *Human Error* / Swiss-Cheese model and Dekker's
   blameless post-mortem practice further show that stopping at "who made a mistake" leaves latent
   systemic conditions intact. `computeFmea` and `evaluateRca` implement both: Action Priority
   overrides naive RPN when Severity $\ge 9$, residual FMEA tracks post-mitigation RPN reduction %,
   and `BLAME_PATTERN` warns when causal text blames an individual without naming a missing systemic
   guardrail.
2. **Mathematics & Statistics — Three-Point Beta-PERT Estimation (Malcolm et al., 1959).**
   Single-point cost and effort guesses systematically underestimate right-skewed operational tails.
   `computePertImpact` models both financial exposure and diverted team-capacity person-days via
   three-point PERT ($\mu = \frac{O + 4M + P}{6}$, $\sigma = \frac{P - O}{6}$, and approximate 80%
   interval $P_{10}..P_{90}$), rejecting inverted inputs ($O > M$ or $M > P$).
3. **Finance & Economics — Risk-Adjusted Expected Value, Mitigation ROI & Opportunity Cost.**
   Capital and engineering time are scarce. `computePertImpact` pairs PERT expected cost with
   pre- and post-mitigation occurrence probabilities to compute expected unmitigated loss, expected
   residual loss, expected loss avoided, net risk-adjusted value ($\Delta E[\text{Loss}] - C_{\text{mit}}$),
   and mitigation ROI multiple, alongside explicit opportunity cost and cumulative diverted
   team-capacity alerting (`CASE-04` at $\ge 10$ expected person-days).
4. **MBA / Operations & Decision Governance — Bain RAPID / Intuit DACI & Reversibility.**
   High-exposure or irreversible operational trade-offs should not hide inside chat threads.
   `RULE-DEC-01` automatically creates and links a structured DACI Decision record seeded with
   PERT-quantified options (*Execute preventive mitigation* vs *Accept / defer*) whenever Action
   Priority is High, PERT expected exposure $\ge 10{,}000$, or the case is an escalation/initiative.
5. **Political Science — Mendelow (1981) Power × Interest Stakeholder Matrix & Coalition Stance.**
   Operational fixes fail politically when high-power skeptics or blockers are surprised late.
   `classifyMendelowStakeholder` maps each stakeholder onto *Manage closely*, *Keep satisfied*,
   *Keep informed*, or *Monitor*, tracks stance (`champion` → `blocker`), auto-schedules briefing
   cadences (`RULE-STAKE-01`), and triggers `CASE-02` when briefings go overdue or high-power
   stakeholders remain skeptical/blocking.
6. **Production / Lean / Six Sigma — Ohno (1988) Toyota 5-Whys & Closed-Loop Verification.**
   Mitigations that are delegated but never verified decay silently. `RULE-DEL-01` creates an
   accountable mitigation Delegation with calibrated authority; completing all linked mitigation
   delegations (`onDelegationCompleted` / `RULE-SYNC-DEL-01`) automatically transitions the Case to
   *Monitoring* so residual FMEA scores are verified before closure (`resolveCase`).
7. **Leadership & Psychological Safety — Edmondson (1999) Blameless Coaching Air-Cover.**
   `RULE-COACH-01` queues blameless support/barrier talking points into `person.talkingPoints`,
   1:1 agenda suggestions, and printable 1:1 prep sheets, while strictly excluding operational
   incidents from automatic performance-review evidence and blocking any links to confidential
   `conflicts` or anonymous `pulses`.

### Verification and limits

- **322/322 Node & JSDOM tests pass** across 25 test files (`tests/app/cases-automation.test.mjs`
  verifies FMEA/PERT/Mendelow/5-Whys math, 5-way parallel propagation, idempotency, delegation →
  monitoring feedback loop, resolution propagation, upstream escalation from Goals/Delegations/
  Decisions, Schema v14 → v15 migration, privacy-wall enforcement, CSV formula-injection defense,
  and zero `axe-core` violations across `#/cases`, `#/cases/:id`, dialogs, and connected views).
- PERT probabilities and $P_{10}..P_{90}$ bounds are decision-support approximations over
  manager-entered numbers, not actuarial forecasts. Real graphical browser layout/overflow on the
  new `#/cases` surfaces, assistive-technology screen-reader announcements, and real-manager
  comprehension remain **[UNVERIFIED]** in this container (no browser or screen-reader binary
  installed).


## 34. Capacity, flow and allocation: the operating-plan layer (Session 24)

**Audit and gap.** Session 23 closed the cross-domain *case* loop. Reading the whole canonical
runtime (§§5–33 plus `app/**`) showed a structural gap rather than a missing feature: every module
records intent — goals, delegations, cases, 30-60-90 plans, decisions — and nothing answered the
manager's weekly question, *"do the people I have actually have the capacity to do this, and what
has to give?"* Every comparable product category assumes that layer exists (OKR tools grow a
"workload" tab, portfolio tools import a capacity sheet, PSA tools assume a time-entry system).
Building the layer as a *derived* view over existing records is the version that fits LeadOS's
no-backend, no-fabrication architecture.

**Frameworks applied, with the boundaries stated.**

| Discipline | Framework | How it is used — and what is deliberately *not* claimed |
|---|---|---|
| Operations research | Little's Law (Little, 1961): WIP = throughput × cycle time | Throughput is counted only from **delivered** plan items in a trailing window; WIP counts only funded plan items, the same unit. Below two completions the app refuses to state a rate. |
| Queueing theory | Kingman's diffusion approximation (Kingman, 1961) with a variability factor of 1 (Poisson/exponential) | Reported as a **delay multiplier** at the current utilisation. It is a model, not a measurement: it says utilisation above ~80% costs lead time super-linearly, which is the decision-relevant claim. |
| Production / lean | Reinertsen's *Principles of Product Development Flow* (2009), Goldratt's Theory of Constraints | WIP limits and bottleneck naming (highest per-person utilisation, with unowned work shared evenly so the bottleneck cannot be hidden). No "efficiency score" for a person. |
| Economics / finance | Marginal analysis, opportunity cost, value density (expected value ÷ expected person-days) | Funding is a boundary decision, not a ranking alone: "what is the next thing that fits?" and "what is the cheapest thing to remove?" Sunk cost is never used to defend an item. |
| Mathematics / statistics | Three-point Beta-PERT (Malcolm et al., 1959) and additive variance under independence | Independent PERT variances sum, so the portfolio range widens with scope (central limit theorem). Target-date risk is **cumulative** — each target is judged against all work due by then. No claim of independence in reality; the caveat is in the view. |
| Leadership | Protected focus and explicit saying-no (Drucker; Doerr's OKRs; Sull & Escobari on commitments) | Trade-offs are recorded as owned DACI decisions with generated options, never performed silently by the engine. |
| HR / change | Transition productivity ramp (Watkins, *The First 90 Days*) | Ramp factors (0.45 / 0.75 / 0.8 / 0.7) are **planning conventions**, editable in Settings, not measurements of anyone's ability. |

**Implementation.** `app/core/domain/capacity.js` (pure): `buildCapacityModel`, `flowMetrics`,
`rankPortfolio`, `deliveryForecast`, `capacityHistory`, `capacitySummary`; Schema v16 adds
`state.portfolio` plus four planning settings; `app/views/capacity.js` and
`app/ui/capacity-modals.js` render and capture it; `CAP-01`–`CAP-05` join the signal engine.

**Cross-module propagation (the reason it is architecture, not a dashboard).** Three rules extend
the Session-23 engine rather than duplicating it:

| Rule | Trigger | Effect |
|---|---|---|
| `RULE-CAP-01` | `case.created` / `case.updated` / `case.resolved` | Registers, refreshes, releases, or reinstates a **committed capacity reserve** dated from the case. Idempotent; a reopened case gets its capacity back. |
| `RULE-CAP-02` | any event that makes utilisation > 100% | Opens **exactly one** DACI trade-off decision containing the numbers and concrete options (defer the lowest-value item, cut the next, accept the delay, stop starting unfunded work). No second decision while the first is unanswered. |
| `RULE-CAP-03` | `portfolio.decided` | Writes an explainable check-in on the linked goal when its funded work is deferred or cut (moving on-track → at-risk), and the follow-up when it is re-funded. Funding new work writes nothing. |

**Alternatives considered and rejected.**

| Alternative | Rejected because |
|---|---|
| Deriving effort automatically from goal key-result counts or delegation due dates | Produces confident numbers with no basis; a plan built on invented effort is worse than no plan. Unestimated work is counted as a gap instead. |
| Hours-per-week per person as an editable field | Invites recording contracted hours rather than focused hours, which is the number that determines delivery. One team-level convention plus an explicit operational reserve is more honest and far less data entry. |
| A single "capacity score" or utilisation grade | A grade invites gaming (reserve less, estimate lower). The view reports utilisation, delay multiplier, deficit and date range — each with its own evidence. |
| Letting the engine auto-defer or auto-cut work when the plan is infeasible | Removes the human decision that is the whole point of leadership, and rewrites someone's committed work without a conversation. The engine generates options; the leader decides and signs a rationale. |
| Auto-creating a capacity reserve during the v15→v16 migration | An estimate nobody gave would be invented. Migration adds the empty ledger; open cases with recorded capacity days still count as implicit reserves at read time. |
| Treating each target's probability independently | Every item would claim the whole team's capacity and report ~100% confidence until the day it slips. Cumulative risk is the only honest aggregation. |
| A time-entry system | Different product, needs a backend and daily compliance; LeadOS stays a planning and conversation tool. |

**Honest limits.** Every number is manager-entered: focused hours, effort, value, targets and
ramp are conventions, not measurements. The utilisation history is a **reconstruction** from item
lifespans with current roster and ramp values, and is labelled `approximate` in the UI. Little's
Law at a small completion count is thin, and the app says so rather than hiding it. No field study
shows that seeing a delay multiplier changes a manager's behaviour; real-browser rendering of
`#/capacity`, screen-reader announcement of the capacity bar, and print output remain
**[UNVERIFIED]** here. No outbound retrieval was performed this session (host allowlist), so the
citations above are to published works rather than freshly retrieved vendor documentation.

**Verification.** 18 new tests in `tests/app/capacity-flow.test.mjs`; full suite **340 passed, 0
failed, 0 skipped across 26 files**; `axe-core` in JSDOM reports **0 violations** on `#/capacity`
and on the add-work dialog; `node --check` and ESLint pass on every touched module; the static
server returns `200` for all new modules.

## 35. Delegation completion must close the capacity loop (Session 25)

**Gap found in code, not inferred from a feature checklist.** Session 24 allowed a portfolio item to
carry `sourceType: delegation` and a typed `funds` graph edge. But the inspected completion path
(`completeDelegation` → `onDelegationCompleted`) only advanced linked operational cases to
Monitoring. A linked portfolio item remained open and funded after its delegated outcome had been
verified. That stale item continued to inflate committed demand and WIP, and it was absent from
delivered throughput. The relationship existed; its lifecycle propagation did not.

**Design:** `RULE-CAP-04` consumes the already-audited `delegation.completed` event and only closes
portfolio items explicitly linked to that delegation. This follows Deming's Plan–Do–Check–Act
loop (the completion evidence is the Check; synchronized delivered state is the Act), Little's Law
(incorrect WIP distorts cycle-time estimates), and the product's existing source-of-truth rule:
explicit links authorize propagation, never a title/date guess. The historical item and graph edge
remain; the completed date comes from the delegation record. Returned work is deliberately not
closed as delivered because the outcome has not been achieved. A closed delegation cannot create
new open planned demand.

**Product-pattern synthesis.** Prior repository research documents Asana's single-owner/due-date
execution pattern (§13), the explicit ask-versus-auto-carry trade-off in 1:1 systems (§18), and
portfolio/OKR tools' expectation that committed work has a recorded owner and status (§34). LeadOS
keeps those useful facts—owner, due date, status and explicit handoff—but extends them through the
existing typed relationship graph so a verified lifecycle event updates the connected module once.
This is not a claim that a competitor ships the same local-first automation. The current session
used the repository's dated benchmark artifact and code, not fresh vendor pages; contemporary
vendor functionality remains **[UNVERIFIED]**.

**Cross-domain application:**

| Discipline | Applied decision |
|---|---|
| Engineering / systems | One event rule in the shared automation engine, one atomic store transaction, no UI-only state mirroring. |
| Operations / Lean | Delivered work leaves WIP; completion contributes to observed throughput, preventing stale queue metrics. |
| Economics / finance | The capacity previously committed is released, improving the scarce-resource plan without changing the original estimate or value. |
| Statistics | The actual delegation completion date drives cycle-time history; no completion date or effort is fabricated. |
| Leadership / incentives | Only a leader's explicit completion record propagates; return/reassignment cannot be mistaken for success. |
| Governance / audit | Typed provenance remains queryable and the automatic write adds its own append-only rule-tagged event. |

**Implementation:** `RULE-CAP-04` in `app/core/domain/automation.js`, called by the existing
`completeDelegation` transaction in `app/actions.js`. `syncCapacityPlan` also reconciles
pre-existing completed-delegation links from older workspace state; repeated sync is idempotent. No
new schema version, collection, dependency, network or account. End-to-end regression in
`tests/app/capacity-flow.test.mjs` covers completion, capacity release, preserved linkage, audit
provenance, closed-source and chronology guards, legacy-state repair and repeated-sync idempotency.

**Rejected:** marking a delegation-linked portfolio record delivered when the delegation is
*returned*. That only says the owner returned the work; it does not prove delivery, and automatically
releasing its demand would understate the capacity still required. Also rejected: inferring links
from matching titles, person IDs or due dates; those are not evidence of a relationship.

**Remaining gap:** edit/start-date chronology is guarded at completion, but the plan contains no
independent effort-consumption telemetry; estimated remaining effort stays an estimate until the
item is explicitly completed/released. Work linked to goals/cases still has separate lifecycle
rules. No fresh vendor retrieval or field study was conducted this session.

## 36. Selection and hiring: evidence weights, correlated signals and the cost of an empty seat (Session 26)

### Research retrieved 2026-10-25

The first implementation of this module used Schmidt & Hunter's (1998) validity table from memory.
Two things were wrong with that, and both were caught by retrieval rather than by review:

1. **A wrong figure.** The draft used `.18` for *unstructured interviews*. In Schmidt & Hunter that
   value is `.38`; `.18` is *years of experience*. A single transcription error would have made the
   weakest interview method look as weak as a CV screen — plausible enough to survive review, which
   is exactly why the numbers needed checking against a source.
2. **A superseded table.** Sackett, Zhang, Berry & Lievens (2022) re-analysed the underlying
   meta-analyses and argued that decades of range-restriction corrections had systematically
   *overcorrected*, inflating validity estimates. Their revised figures are materially lower and
   **re-ordered**: structured interviews (.42) now rank first, job-knowledge tests .40, work samples
   .33 (down from .54 — the largest drop of any method), cognitive ability .31 (down from .51),
   integrity .31, assessment centres .29, unstructured interviews .19, years of experience .07.

Sources read this session:

- Sackett, P. R., Zhang, C., Berry, C. M. & Lievens, F. (2022). *Revisiting meta-analytic estimates
  of validity in personnel selection.* Journal of Applied Psychology, 107(11), 2040–2068 —
  author manuscript: <https://gwern.net/doc/statistics/meta-analysis/2021-sackett.pdf>
- Comparison tables of the two revisions, including the 80% credibility interval for structured
  interviews (.18–.66): <https://www.master-hr.com/insights/new-study-providing-updated-validity-estimates/>
  and <https://ink.library.smu.edu.sg/cgi/viewcontent.cgi?article=8187&context=lkcsb_research>
- SIOP's practitioner summary of the re-ordering ("structured interviews … among the top five
  strongest predictors … cognitive ability rounded out this list at .31"):
  <https://www.siop.org/tip-article/is-cognitive-ability-the-best-predictor-of-job-performance-new-research-says-its-time-to-think-again/>
- Schmidt & Hunter (1998) summary, retained as the context for why the older numbers are still
  everywhere: <https://firstpersonnel.org/wp-content/uploads/2013/10/Summary-Schmidt-Hunter-1998.pdf>

Classic foundations used without a fresh fetch: Spence (1973) on signalling and Akerlof (1970) on
adverse selection (why an expensive, job-related signal is worth more than a cheap one — and why an
unstructured chat mainly measures the interviewer); Bauer & Erdogan (2011) on organisational
socialisation (why an accepted offer should hand off to a 30-60-90 plan rather than to nothing);
Kahneman & Tversky's work on anchoring and the planning fallacy (why "I liked them" arrives with a
number attached before any evidence does).

Vendor and market claims about contemporary hiring tools were **not** retrieved this session and are
**[UNVERIFIED]**.

### Design consequences

- **Weights are inputs, not conclusions.** A 5/5 structured interview moves the posterior by at most
  .42. That single constraint is what stops the module becoming a scoreboard: no one conversation,
  however good, can decide anything, and the UI says so.
- **Correlated evidence is discounted explicitly.** Two ratings of the same competency by the same
  interviewer are not two observations. The second rating of a `(method, competency)` pair counts
  ×0.5 with a different rater and ×0.25 with the same rater. Deterministic, order-stable (signals
  are sorted by date then id) and explained line by line in the evidence table, so a leader can see
  *why* their fifth interview changed almost nothing.
- **Neutral is neutral.** 3/5 means "mixed / no decisive signal" and contributes exactly zero to the
  log-odds. A scale that only pushes upward is how "not bad" becomes "good".
- **Disagreement is surfaced, not averaged.** A spread of 3+ points on one competency becomes a
  finding with an instruction (run a work sample or a calibration conversation). Averaging two
  opposite ratings produces a confident middle that nobody actually observed.
- **The falsification test replaces a confidence percentage.** "Three more strong contrary
  observations would move this across the 50% line" is a claim a manager can act on; "78% likely to
  succeed" is not, and it invites treating a heuristic as a prediction.
- **The offer gate is a convention and says so.** Evidence weight ≥ 0.50 (at the 2022 weights: at
  least two reasonably strong independent observations), ≥ 2 methods, every required competency
  assessed. Below that, a decision is still allowed — with a recorded acknowledgement. Blocking
  would push the decision out of the tool; silently allowing it would launder a guess into evidence.
- **Fairness without special-category data.** The 4/5 adverse-impact rule needs race/sex/disability
  data that a local single-manager browser tool has no lawful basis to collect. What is measurable
  instead is process parity: were the same competencies assessed for everyone who reached the same
  stage? That is auditable from the record and cannot be gamed by not recording it.
- **An empty seat is priced only if priced.** Cost of vacancy uses a leader-recorded daily figure.
  Deriving it from a salary band would put the most persuasive number on the screen without any
  basis; the module shows "unmeasured" and explains how to estimate it in one line.
- **Small-sample floors apply here too.** Cycle time is withheld below two completed hires, matching
  the flow metrics' refusal to state a rate from one completion.

### Cross-module wiring (the architectural point)

Hiring is only useful as a *system* member. Three rules run inside the existing event engine:

- `RULE-HIRE-01` turns a recorded interview-effort estimate into a committed `hiring` capacity item,
  refreshes it in place, completes it on a fill and releases it on hold/cancel. This is what makes
  the operating plan honest: interviews are work, and they were previously invisible to it.
- `RULE-HIRE-02` closes the loop on acceptance — roster record, new-hire 30-60-90 plan, three typed
  graph edges, reserve completed — inside one transaction, so a hire never requires a second entry
  and is traceable from requisition to first 90 days.
- `RULE-HIRE-03` escalates a stalled role through the *shared* escalation path, so the resulting case
  immediately inherits FMEA severity/probability/detectability, financial PERT fields, a stakeholder
  coalition, a DACI decision and an accountable delegation. The `autoEscalated` flag keeps it to one
  case for the life of the role.

### Rejected during implementation, with reasons

| Idea | Why rejected |
|---|---|
| A single candidate "score" out of 100 | Collapses method quality, coverage and direction into one number that gets compared across people who were assessed differently. The module reports weight, band, coverage and the flip count separately. |
| Auto-reject / auto-advance thresholds | Removes a person from consideration without a human decision. Gaps are surfaced and acknowledgements recorded; the decision stays with the leader. |
| "Culture fit" rating | Unfalsifiable, reliably similarity-to-self, and the documented route by which structured processes decay back into affinity bias. |
| Storing protected characteristics for adverse-impact maths | No lawful basis or safe storage in a local single-manager browser tool. Process parity is the honest substitute. |
| Résumé parsing / file import | Adds an unverifiable inference step to the one module whose value is evidence quality, plus a data-protection surface. |
| Inferring interview effort from headcount or stage counts | Would fabricate the estimate the capacity layer depends on. A suggestion is shown next to the field and stored only if the leader submits it. |
| Retention timer that auto-deletes candidate records | Tempting for data minimisation, but a timer that silently deletes records in a local browser tool can destroy a decision rationale mid-dispute. Deletion is explicit and audited; a prompt-based retention reminder is on the roadmap instead. |

### Verification and limits

`tests/app/hiring.test.mjs` (27 tests) covers the mathematics, the migration, every action gate and
all three rules end to end; the full suite is 368/368 across 27 files. `axe-core` reports zero
violations on `#/hiring`, `#/hiring/:id` and the requisition dialog.

Limits that remain, stated plainly: the validity coefficients are population meta-analytic averages
with wide credibility intervals (structured interviews: .42, 80% interval .18–.66), applied here as
fixed weights — they are not a prediction about any individual, and this implementation has not been
validated against anyone's real performance. The prior is a user-set assumption. The model ignores
the incremental-validity question entirely (two correlated methods do not add as much as the sum of
their validities), beyond the crude repeat-discounting above. No manager has used this module on a
real hiring round, and no browser, screen reader or mobile device was available in this container,
so rendering, keyboard traversal and assistive-technology behaviour remain **[UNVERIFIED]**.

## 37. Candidate-record retention, dependency risk, and what "validated" can honestly mean here (Session 27)

### Research retrieved 2026-10-25

**Data minimisation and retention.** GDPR Art. 5(1)(e) (storage limitation) requires that personal
data be kept "no longer than is necessary for the purposes for which the personal data are
processed"; Art. 17 (erasure) creates a right to have it removed; Art. 5(1)(c) (minimisation) means
holding a rejected candidate's interview notes indefinitely is not neutral. Recital 39 ties both to
time limits being *set* and *reviewed*. The ICO's guidance on storage limitation is explicit that an
organisation should be able to justify each retention period and should review records rather than
hold them "just in case". Two practical consequences shaped the design:

- The obligation is to **decide**, not necessarily to delete on a schedule. A single-manager local
  tool with no server, no processor and no transfer sits in an unusual position: there is no
  controller/processor split to manage, but the data is still personal data, sitting in a browser
  profile that may be shared, backed up to a synced folder, or left on a laptop.
- A timer that erases is *also* a data-integrity risk: if a rejection is challenged, the rationale
  and the evidence behind it are the record that defends the decision. Automated erasure trades one
  compliance risk for another, silently, at a moment nobody chose.

So the shipped behaviour is a **review prompt with a visible exemption mechanism**, and the reasoning
is written into the code comments (`retentionReview`) rather than only into this document. The
"keep in touch" exemption matters because a silver medallist you intend to call about the next opening
is *necessary* data — the point of surfacing exemptions is that "we kept this on purpose" becomes an
auditable statement instead of an omission.

**Dependency risk.** The advisory set behind `next@16.2.6` is unusually bad for a "just upgrade it
later" posture: unauthenticated RCE in the Image Optimization API for AVIF/SVG inputs, RCE in
`next/og`'s `ImageResponse`, RCE in `use cache` functions returning typed arrays, SSRF in Image
Optimization, SSG/ISR cache poisoning that lets one user's render be served to another, and a DoS in
Server Actions. All of those are reachable only by a *running Next server* — which is precisely why
the honest finding is not "the risk was accepted" but "this tree cannot be built, so the advisories
have no path to execution". The upgrade is still correct (the packages are installed, `next build` is
a documented command, and a future repair should not inherit an RCE), but it changes the audit
counter, not the deployment risk.

**What "validated" can mean without a browser or a screen reader.** A theme worth naming, because it
recurs in this project: the difference between *well-formed* and *usable*. axe-core answers
well-formedness; a heading outline, accessible names and a focus trap answer more of usability; none
of them answer comprehension. The literature on accessibility conformance (WebAIM's annual
"WebAIM Million" consistently finds automated tools catch roughly a third to a half of WCAG failures,
with the remainder needing human judgement; the WCAG-EM evaluation methodology mandates manual and
assistive-technology testing) says exactly this: automated coverage is necessary and insufficient. The
session therefore ships the automated part, states the gap in the report, and refuses to describe a
green suite as accessibility validation.

### Design consequences

- **Prompt, never erase.** Retention is a decision the leader makes with the app's help. The reminder
  names the window, the age, the evidence that will go with the record, and that it cannot be undone.
- **Exemptions are visible and counted.** A deliberate retention is listed; a silent one is how a
  policy becomes a fiction.
- **Unknown age is unknown.** No date means no age, not "assume old". Guessing age is how a reminder
  turns into an accusation about a record the leader may have created last week.
- **Invalid configuration fails safe.** A negative window falls back to the default rather than to
  zero, because "off" must be a deliberate act.
- **Deletion stays a single, named, confirmed act** — which is what surfaced the confirmation bug.
- **Confirmation primitives must be boringly correct.** A destructive dialog that returns immediately
  is worse than no dialog: it teaches the user that the dialog is decoration. The fix (a promise that
  only settles when the dialog closes, with `onConfirm` still supported) is now covered by tests for
  confirm, cancel, Escape and single execution.
- **Scale tests assert invariants and print numbers.** Counting records and resolving edges catches
  the failure mode that matters (silent truncation); printing timings catches the one that does not
  throw (the quadratic scan).
- **The dependency finding got a decision, not a badge.** Four moderate advisories remain, with the
  reason they are not reachable, and the cost of the offered "fix" recorded.

### Rejected this session, with reasons

| Idea | Why rejected |
|---|---|
| Auto-delete candidate records after the window | Trades a privacy risk for an evidence-loss risk, at a moment nobody chose, in a tool that also holds the audit trail. The prompt keeps the decision with the person who can justify it. |
| `npm audit fix --force` to clear the last four moderates | It "fixes" a dev-only esbuild advisory by downgrading `drizzle-kit` to 0.18.1 — a breaking change to the migration tool, applied blind, to silence a counter. |
| An `overrides` pin forcing `esbuild@0.25` under `@esbuild-kit/core-utils` | Attempted and reverted: the package pins a 0.18.20 platform binary, so npm reported the tree `invalid` and the CLI would have run an untested combination. A broken tree is worse than an explained advisory. |
| Repairing the legacy Next build in this session | 6,977 TypeScript errors and missing modules across a non-canonical tree is its own project, and the product decision (repair vs archive) belongs in the roadmap, not in an accessibility-and-scale session. |
| Claiming JSDOM + axe as "screen-reader validated" | It is not what was run. The report says block, explains the commands and their failures, and lists exactly which questions remain open. |
| Rendering the retention card as a plain alert bar | A record-by-record decision needs names and ages side by side with the delete control; a banner would push the decision back into a settings page where it would never be made. |

### Verification and limits

`npm test` → **408 passed, 0 failed across 29 suites** (368 → 408: +23 retention, +5 scale, +12
accessibility). `npm audit --omit=dev` → 0 vulnerabilities. `next build` → fails identically on both
dependency sets (pre-existing, documented). Playwright/Chromium: not runnable in this container
(recorded with the exact error). Real screen-reader output, comprehension, visual contrast in a
rendering engine, zoom/reflow, touch targets and large-workspace behaviour on a phone remain
**[UNVERIFIED]**, as does any claim that the retention prompt changes anyone's behaviour.

---

## 38. Organizational Design, Team Topologies, Veto Coalitions & Shewhart XmR Statistical Process Control (Session 28)

### The two structural gaps

Auditing the full canonical product (`app/**`, 63 modules prior to Session 28) surfaced two missing
layers across management, systems engineering, economics, political science, statistics, and
lean/production operations:

1. **No separation between common-cause noise and special-cause signal.** `#/health` reported 30-day
   and multi-window deltas, and `#/cases` recorded point-in-time FMEA RPNs, yet neither distinguished
   routine period-to-period variation ("noise") from a genuine shift in the underlying operating
   system ("signal"). As Deming (*Out of the Crisis*, 1986) and Wheeler (*Understanding Variation*,
   2000) demonstrate, reacting to common-cause fluctuations as if they were special causes ("tampering")
   increases variance and demoralises teams.
2. **Every module treated team boundaries, APIs, and charters as immutable.** `#/cases` could diagnose
   that a recurring failure was caused by a 5-way cross-team deployment handoff or cognitive overload
   (5-Whys / Swiss-Cheese systemic barrier), `#/capacity` could show Kingman queue blowup, and
   `#/onboarding` could scaffold individual `role-transition` plans — yet nowhere could a leader design,
   stress-test, govern, execute, and statistically verify an **organizational boundary, topology, or
   process redesign** itself.

### Cross-domain theoretical synthesis

- **Production / Six Sigma / Statistics — Shewhart (1931) & Wheeler (2000) Individual & Moving Range (`XmR`) Process Behaviour Charts:**
  For sequential operational observations $X_1, \dots, X_n$ with adjacent moving ranges $mR_i = |X_i - X_{i-1}|$:
  $$\bar{X} = \frac{1}{n}\sum_{i=1}^n X_i, \quad \overline{mR} = \frac{1}{k}\sum mR_i, \quad \hat{\sigma}_{\text{within}} = \frac{\overline{mR}}{d_2}\; (d_2 = 1.128)$$
  $$\text{UNPL} = \bar{X} + 2.66\,\overline{mR}, \quad \text{LNPL} = \bar{X} - 2.66\,\overline{mR}, \quad \text{URL} = D_4\,\overline{mR}\; (D_4 = 3.267)$$
  Unlike parametric $t$-tests that assume i.i.d. sampling, $\hat{\sigma}_{\text{within}}$ estimates
  dispersion from consecutive differences so a step-change in the mean does not artificially inflate
  control limits to mask itself. Missing windows (`null`) break adjacency rather than interpolating
  across gaps. Western Electric / Wheeler rules (`WE-1` beyond UNPL/LNPL, `WE-2` moving-range jump
  $> \text{URL}$, `WE-3` 8 consecutive points on one side of $\bar{X}$, `WE-4` 3-of-4 beyond $2\hat{\sigma}$)
  classify direction-aware `favorable` vs `adverse` special causes.
- **Systems Engineering & Architecture — Conway (1968), Skelton & Pais (*Team Topologies*, 2019), Sweller (1988) & Brooks (1975):**
  Models the Inverse Conway Maneuver explicitly (`stream-aligned`, `platform`, `enabling`,
  `complicated-subsystem` × `x-as-a-service`, `collaboration`, `facilitating`), tracks before/target
  Sweller cognitive load and cross-team blocking handoffs, and computes Brooks's inter-team bilateral
  coordination channels $N(N-1)/2$ for $N = 1 + \text{collaboratingTeamsCount}$, flagging permanent
  multi-team collaboration overload (`TT-COLLAB-OVERLOAD`), coupled platforms (`TT-PLATFORM-COUPLED`),
  high residual cognitive load (`TT-HIGH-TARGET-LOAD`), and rising handoffs (`TT-HANDOFF-INCREASE`).
- **MBA / Organizational Economics — Galbraith's 5-Point Star (1977), Porter's Trade-Offs (1996) & Holmström–Milgrom Multitask Principal-Agent Theory (1991):**
  Evaluates alignment across Strategy, Structure, Processes, Rewards, and People plus explicit
  *non-goals* ("what this team stops doing"). When Structure or Processes are redesigned while Rewards /
  KPIs are left blank, LeadOS surfaces an explicit Holmström–Milgrom incentive-mismatch warning ("hoping
  for A while rewarding B").
- **Leadership & Change Execution — Kotter's 8-Step Model (1996), Lewin's Force-Field Analysis (1951) & Watkins's 30-60-90 Transitions (2003):**
  Tracks Kotter stages 1–8 with live evidence backing and foundational-skip detection (`skippedSteps`);
  models Driving ($+$) vs. Restraining ($-$) forces where mitigating a barrier halves its effective drag
  (teaching leaders to weaken barriers rather than pile on top-down pressure into a `high-tension-stalemate`);
  and links impacted team members directly to Watkins 30-60-90 `role-transition` plans (`RULE-CHG-03`).
- **Political Science — Mendelow Power × Interest & Tsebelis (*Veto Players*, 2002):**
  Extends stakeholder mapping with explicit `vetoPlayer` gatekeepers whose agreement is structurally
  required to shift the status quo; unaligned veto players tighten briefing cadences (`RULE-CHG-04`),
  discount economic feasibility, and propagate risk to dependent OKRs (`RULE-CHG-05`).
- **Finance / Operations — Beta-PERT Transition Reserves & Satir J-Curve Payback Economics:**
  Computes 3-point Beta-PERT transition effort ($\mu = (O + 4M + P)/6$, P10–P90), reserves active
  effort in `#/capacity` (`RULE-CHG-01`), cascades vertically into `RULE-CAP-02` if combined reserves
  plus role-transition supply ramps push utilisation past 100%, and computes feasibility-discounted net
  horizon benefit and payback months.

### Rejected this session, with reasons

| Idea | Why rejected |
|---|---|
| Individual employee "change readiness" or "ADKAR resistance" scores | Turns structural boundary friction and healthy engineering skepticism into personal compliance grades, destroying psychological safety during reorganizations. |
| Linear interpolation across missing health/metric windows in XmR charts | Creates artificial near-zero moving ranges (`mR`), shrinking `2.66 mR̄` limits and firing false special-cause alarms. |
| Student's $t$-test / $p$-value badges on 4–8 operational data points | Short sequential operational time series violate independence and normality assumptions; Wheeler's XmR limits are mathematically grounded for small sequential series. |
| Auto-rewriting `person.role` when a `#/changes` record becomes Active | Boundary experiments and phased handovers precede HR title changes; `RULE-CHG-03` scaffolds 30-60-90 transition support while keeping roster titles deliberate. |
| Copying organizational change friction into `reviews.js` performance packets | Punishes engineers who take on messy structural migrations (Satir J-curve dip); change records stay strictly excluded from individual performance review evidence. |

### Verification and limits

`npm test` → **415 passed, 0 failed across 30 suites** (`tests/app/changes-spc.test.mjs` + extended
`tests/app/access-audit.test.mjs` + `tests/app/scale.test.mjs` across all 20 CSV scopes). `npx eslint app scripts tests/app`
→ 0 errors and 0 warnings across `app/**`, `scripts/serve.mjs` and `tests/app/**`. Live HTTP serving
verified via `scripts/serve.mjs`. Real-browser visual rendering, assistive-technology screen-reader
traversal, print layout, and field validation with managers running a live reorganization remain
**[UNVERIFIED]**.

---

## 39. Seeded Monte Carlo Portfolio & Coupled J-Curve Simulation, Contextual-Integrity Export Governance & Chromium 143 Reflow Audit (Session 29)

### The four structural gaps addressed in Session 29

1. **Deterministic / CLT portfolio forecasts hid Sam Savage's *Flaw of Averages* and Goldratt's *Critical Chain* owner bottlenecks.**
   `capacity.js` previously summed PERT expected values ($\mu = (O + 4M + P)/6$) and Normal-approximated
   standard deviations ($\sigma = (P - O)/6$). For small portfolios ($N = 4\text{–}10$) of right-skewed
   tasks ($P - M \gg M - O$) concentrated on one tech lead, two compounding errors occur:
   - **Flaw of Averages (Savage, 2009):** A plan at $98\%$ expected utilisation looks feasible on average,
     yet right-skewed Beta-PERT draws breach horizon capacity $>50\%$ of the time.
   - **Fungible-team fallacy (Goldratt, *Critical Chain*, 1997; Brooks, 1975):** Summing team-wide supply
     assumes person-days are interchangeable across specialists. On the LeadOS demo workspace, fungible
     team completion at `P80` is `2026-11-13` (`19` calendar days), whereas owner-constrained Critical-Chain
     contention on Mei Lin Chen pushes joint `P80` completion to `2026-11-24` (**`+11` calendar days slip**).
2. **Organizational change J-curves were isolated from live portfolio congestion.**
   `changes.js` previously discounted monthly benefit by static Kotter/force-field/veto feasibility,
   ignoring that an overloaded engineering team stretches transition effort and delays benefit ramp-up.
3. **Retention (`HIRE-08`) and candid coalition stances lacked export-boundary contextual integrity.**
   Candidate records past `candidateRetentionDays` raised an in-app banner on `#/hiring`, and operational
   JSON exports offered conflict omission — yet exporting JSON or CSV could silently bundle expired
   candidate evaluations or candid `skeptical`/`resistant`/`opposing` stakeholder & veto-player stances
   recorded for private manager sensemaking into shareable files.
4. **Legacy `src/**` / root `.tsx` disposition and real-engine CSS/ARIA verification.**
   Non-canonical Next/Vite artifacts needed an explicit architectural quarantine gate (`ADR-0007`), and
   `jsdom` could not evaluate real CSS contrast compositing, WCAG 2.5.3 label-in-name matching, or
   `390px`/`320px` flex reflow.

### Cross-domain theoretical synthesis

- **Mathematics / Statistics / Risk Engineering — Mulberry32 PRNG, Marsaglia & Tsang (2000) Gamma & Vose (2008) Beta-PERT:**
  For a 3-point estimate $(O, M, P)$ with shape parameter $\lambda = 4$:
  $$\mu = \frac{O + 4M + P}{6}, \quad \alpha = 1 + 4\frac{M - O}{P - O}, \quad \beta = 1 + 4\frac{P - M}{P - O}$$
  Drawing $G_1 \sim \text{Gamma}(\alpha, 1)$ and $G_2 \sim \text{Gamma}(\beta, 1)$ via Marsaglia–Tsang
  rejection over Box–Muller normals seeded by Mulberry32 (`seed = 42` default, configurable 250–5,000
  trials) yields exact Beta-PERT variates $X = O + \frac{G_1}{G_1 + G_2}(P - O)$ with 100% bit-reproducible
  quantiles (`P10`, `P25`, `P50`, `P80`, `P90`) and zero `Math.random()` non-determinism.
- **Operations Research / Production — Goldratt (*Critical Chain*, 1997) & Variance-Share Sensitivity:**
  Each trial accumulates both team-wide demand and per-owner committed demand against individual
  allocatable supply, computing `ownerBottleneckBreachProbability`, `bottleneckCompletion` (`P50`/`P80`/`P90`),
  `slipDaysVsTeamP80`, and item-level `varianceShare` sensitivity drivers.
- **Finance / Organizational Strategy — Coupled Stochastic Satir J-Curve & `RULE-CAP-05`:**
  In `simulateChangeJCurve`, each trial samples transition effort, realization delay, and 3-point monthly
  benefit while coupling portfolio overload congestion (`overloadStretch`) into the ramp curve — widening
  the J-curve valley (`troughValueP50`, `troughValueP90Worst`) and shifting payback quantiles (`2.4 mo`
  deterministic vs. `5.5 mo` coupled `P50` on `chg-demo-1`). `RULE-CAP-05` propagates tail-risk warnings
  to linked OKRs (`<50%` MC target probability while deterministically on-track) and opens an idempotent
  DACI trade-off decision when `flawOfAveragesTrap` (`utilisation <= 100%` and `overloadProbability >= 50%`)
  triggers.
- **Privacy / Governance / Political Science — GDPR Art. 5(1)(c)/(e) & Nissenbaum (*Contextual Integrity*, 2009):**
  Information shared safely inside one context (a manager's local encrypted workspace) violates contextual
  integrity when transmitted across an export boundary without scope transformation. `inspectExportGovernance`
  audits `EXPORT-RET-01`, `EXPORT-RET-02`, `EXPORT-CFL-01`, `EXPORT-STK-01`, and `EXPORT-HIR-01` before
  download, offering export-only `pruneOverdueCandidates` and `redactStakeholderStances` redactions while
  leaving live workspace records untouched.

### Rejected this session, with reasons

| Idea | Why rejected |
|---|---|
| Unseeded `Math.random()` Monte Carlo draws | Makes P80 dates, insights, and `RULE-CAP-05` non-reproducible across page renders and automated tests. |
| Pairwise task-correlation matrix inputs (Gaussian/t-copulas) | Demands $O(N^2)$ subjective correlation numbers that managers cannot calibrate reliably; coupled capacity congestion + shared-owner Critical-Chain contention captures structural coupling from real records. |
| Silent automatic deletion of expired candidate records during export | Mutates or hides records without informed consent; opt-in export pruning with explicit counts preserves human agency and auditability. |
| Deleting legacy files & removing `eslint-config-next` | Breaks offline transitive `axe-core` availability and creates noisy multi-hundred-file diffs; ADR-0007 + `check:boundary` enforces strict zero-leak isolation cleanly. |

### Verification and limits

`npm run verify:canonical` → `eslint .` (`0` errors/warnings), `check:boundary` (`73` ES modules, `34`
suites, `0` leaks), `check:links` (`0` broken links), and **`427/427` passing tests across 34 suites**.
Real Headless Chromium `143.0.7499.0` pass (`docs/VALIDATION-2026-10-25-session-29.md`) audited 11 routes
at `1440×1000`, `390×844`, and `320×800` + 4 live modals → **7 real contrast/label/reflow/float defects
fixed, `0` `axe-core` WCAG 2.1 AA violations, `0` horizontal overflows**. Spoken screen-reader output
(NVDA/JAWS/VoiceOver/Orca), Firefox/WebKit engines, print pagination, and real-manager field trials
remain **[UNVERIFIED]**.

---

## 40. Counterfactual Scenario Sandboxing, Pareto Frontier Dominance, Brooks’s Law Onboarding Drag & One-at-a-Time Tornado Sensitivity (Session 30 — Schema v20)

Session 29 added seeded Monte Carlo portfolio and coupled J-curve simulation (`app/core/domain/simulation.js`), diagnosing when a plan suffers from Savage’s *Flaw of Averages* (`SIM-01`) or Goldratt’s *Critical Chain* owner bottleneck (`SIM-02`). However, a first-time manager facing an overloaded plan could not test counterfactual trade-offs — deferring lowest-CD3 items, absorbing an executive interrupt, mitigating an active operational case, phasing an org change, or accelerating an offer — without mutating live records and polluting the append-only audit ledger. Session 30 resolves this gap with `app/core/domain/scenarios.js`, `app/views/scenarios.js` (`#/scenarios`), `tornadoChart` (`app/ui/charts.js`), `RULE-SCN-01` (`app/core/domain/automation.js`), `SCN-01` (`app/core/domain/insights.js`), and the `sensitivity` CSV scope (`app/core/csv.js`), grounded in nine cross-domain frameworks:

1. **Decision Analysis & Tornado Sensitivity — Howard (1968), Eschenbach (1992), Saltelli et al. (2008).**
   - Howard, R. A. (1968). *The Foundations of Decision Analysis*. IEEE Transactions on Systems Science and Cybernetics, 4(3), 211–219; Eschenbach, T. G. (1992). *Spiderplots versus Tornado Diagrams for Sensitivity Analysis*. Interfaces, 22(6), 40–46; Saltelli, A., et al. (2008). *Global Sensitivity Analysis: The Primer*. Wiley.
   - `computeSensitivityTornado(state, opts)` perturbs every funded portfolio item (optimistic `a` vs. pessimistic `b`), active incident/change/hiring capacity reserve (`0d` resolved vs. `1.5×` escalation), operational interrupt reserve (`−5pp` vs. `+10pp`), and focused hours/week (`+4h/wk` vs. `−4h/wk`) one factor at a time under Common Random Numbers, ranking drivers strictly by total owner-constrained P80 completion swing (`|ΔP80_high − ΔP80_low|`) and rendering an accessible diverging SVG `tornadoChart` with an expandable keyboard-reachable `<details><table>` fallback.
2. **Variance Reduction via Common Random Numbers (CRN) — Law & Kelton (2000).**
   - Law, A. M., & Kelton, W. D. (2000). *Simulation Modeling and Analysis* (3rd ed., §11.2). McGraw-Hill.
   - `evaluateScenario` and `compareScenarios` drive Baseline and every candidate scenario through `simulateJointWorkspace` with the identical Mulberry32 `seed` (`settings.simulationSeed`), inducing positive correlation across shared random streams so scenario deltas (`ΔOverload`, `ΔP80`, `ΔValue`) reflect structural lever changes rather than Monte Carlo sampling noise.
3. **Multi-Objective Pareto Optimality & Dominated-Option Elimination — Keeney & Raiffa (1976).**
   - Keeney, R. L., & Raiffa, H. (1976). *Decisions with Multiple Objectives: Preferences and Value Tradeoffs*. Wiley.
   - Rather than collapsing schedule risk, overload probability, and economic value into an arbitrary utility score, `computeParetoFrontier(evaluations)` tests strict dominance across `{overloadProbability ↓, effectiveP80Days ↓, netRiskAdjustedValue ↑}` (whenever ≥1 scenario measures currency value; otherwise the 2D `{overloadProbability ↓, effectiveP80Days ↓}` projection), flagging dominated options alongside the exact peer scenario that beats them.
4. **Constrained Optimization, Opportunity Cost & Shadow Pricing — Samuelson (1947); Reinertsen (2009).**
   - Samuelson, P. A. (1947). *Foundations of Economic Analysis*. Harvard University Press; Reinertsen, D. G. (2009). *The Principles of Product Development Flow*. Celeritas Publishing.
   - `evaluateScenario` computes a multi-ledger risk-adjusted net economic objective across the single currency present (`portfolio PERT μ_value − unmitigated FMEA case PERT μ_fin − mitigation spend + active Change risk-adjusted net benefit`), marking multi-currency mixes `mixedCurrency: true` instead of inventing FX rates, and computes the **implied marginal shadow price of capacity** (`λ = ΔValue / ΔCommittedDays`) alongside Reinertsen CD3 trim presets (`buildSuggestedScenarios`).
5. **Software Systems Dynamics & Onboarding Drag — Brooks (1975); Watkins (2003).**
   - Brooks, F. P. (1975). *The Mythical Man-Month*. Addison-Wesley; Watkins, M. D. (2003). *The First 90 Days*. Harvard Business School Press.
   - `projectScenarioState` models simulated requisitions (`hireSimulated`) with three coupled effects inside the current planning horizon: (a) prorated newcomer availability via `personSupply` (`startDate > today` `inHorizonShare`) × Watkins 50% new-hire ramp factor, (b) Brooks’s Law mentoring & coordination drag (`mentoringDragDaysPerWeek`, default `1.25d/wk`) deducted as a dedicated committed `onboarding` portfolio reserve during in-horizon active days, and (c) optional interview-loop reserve release once the role closes — demonstrating mathematically why late hires slip near-term P80 dates while early hires with freed interview load add net capacity.
6. **Strategic Scenario Planning & Pre-Commitment Rehearsal — Schoemaker (1995); Kahneman & Tversky (1979); Tetlock & Gardner (2015).**
   - Schoemaker, P. J. H. (1995). *Scenario Planning: A Tool for Strategic Thinking*. Sloan Management Review, 36(2), 25–40; Kahneman, D., & Tversky (1979). *Prospect Theory: An Analysis of Decision under Risk*. Econometrica, 47(2), 263–291; Tetlock, P. E., & Gardner, D. (2015). *Superforecasting*. Crown.
   - All scenario mutations occur on ephemeral `structuredClone` snapshots (`SCHEMA_VERSION = 20` unchanged; zero `localStorage` or `events` writes during exploration), countering planning fallacy and framing bias by comparing explicit counterfactual options (`peerScenarios`) before recording a calibrated DACI review date (`reviewOn`).
7. **Double-Loop Learning vs. Single-Loop Tweaks — Argyris & Schön (1978).**
   - Argyris, C., & Schön, D. A. (1978). *Organizational Learning: A Theory of Action Perspective*. Addison-Wesley.
   - The sandbox separates single-loop item toggles (funding/deferring items, injecting hypothetical urgent work) from double-loop governing-variable levers (`operationalLoadPct`, `capacityHoursPerWeek`, `wipLimitPerPerson`) so leaders can compare trimming scope against structural WIP and interrupt-shielding policy shifts.
8. **Coalition Feasibility & Veto-Player Gate — Tsebelis (2002); Gilpin & Rogers (2008).**
   - Tsebelis, G. (2002). *Veto Players: How Political Institutions Work*. Princeton University Press.
   - Scenarios that defer funded work linked to an OKR, pause an active organizational change, or rely on an unblocked veto coalition compute a deterministic `coalitionRisk` check surfacing opposing high-power veto players and impacted goals before commitment, and feed DACI `options` (`pros`/`cons`) directly into `RULE-SCN-01`.
9. **Verification Boundaries.**
   - Verified via `tests/app/scenarios-sensitivity.test.mjs` (7 tests covering zero-mutation isolation, CRN determinism, Brooks’s Law crossover, Pareto dominance, Tornado OAT ranking, `RULE-SCN-01` cascades, all 7 Session-30 cross-module audit fixes, and interactive `#/scenarios` modal commitment), `tests/app/access-audit.test.mjs` (`axe-core` 0 violations on `#/scenarios`), `tests/app/scale.test.mjs` (`sensitivity` CSV #21 at enterprise scale), and live HTTP module checks over `scripts/serve.mjs`. Graphical browser layout/contrast of `#/scenarios` in Session 30, spoken screen-reader output, and manager field comprehension remain **`[UNVERIFIED]`**.

## 41. Forecast Calibration, Planning-Fallacy Measurement & Reference-Class Learning (Session 31 — Schema v21)

Through Session 30, LeadOS predicted constantly — Beta-PERT effort/value triples on every plan item, deterministic and Monte Carlo P50/P80/P90 delivery dates, Common-Random-Numbers scenario odds, DACI decisions with scheduled outcome reviews — but **never scored a single prediction against its outcome**. Decisions recorded `good/mixed/bad` at review with no probability ever stated at decide time; plan items completed with only a `completedOn` date and no actual effort; the scenario engine's overload odds were written into decision prose, unverifiable later. A system that predicts without scoring cannot learn; it can only re-assert. Session 31 closes the loop with `app/core/domain/calibration.js`, `RULE-FCT-01`/`RULE-FCT-02`, signals `FCT-01`…`FCT-04`, the reliability diagram `calibrationChart`, the delivery-actuals dialogs, and the `calibration` CSV scope (#22), grounded in eight cross-domain frameworks:

1. **Proper Scoring Rules & Brier Scores — Brier (1950); Gneiting & Raftery (2007).**
   - Brier, G. W. (1950). *Verification of Forecasts Expressed in Terms of Probability*. Monthly Weather Review, 78(1), 1–3; Gneiting, T., & Raftery, A. E. (2007). *Strictly Proper Scoring Rules, Prediction, and Estimation*. JASA, 102(477), 359–378.
   - Decisions capture `forecastProbability` ("P(this works out well)", Cromwell-clamped to 5–95%) at the moment of commitment — inside `decideDecision`, the Decide dialog (with the leader's own reviewed base rate shown as the outside view), and automatically for scenario decisions as `100 − CRN overload odds`. Outcome reviews score `good/mixed/bad → 1/0.5/0` with per-decision Brier contributions surfaced on the decision card, in the `decisions` CSV, and aggregated on `#/decisions` with a skill score against the base-rate climatology forecast.
2. **Skill Decomposition & Reliability Diagrams — Murphy (1973).**
   - Murphy, A. H. (1973). *A New Vector Partition of the Probability Score*. Journal of Applied Meteorology, 12(4), 595–600.
   - `murphyDecomposition` partitions the Brier score into reliability (calibration error), resolution (discrimination), and uncertainty (base-rate variance) over forecast quintiles, rendered as an accessible SVG reliability diagram with an expandable data table. Because `mixed` outcomes enter at 0.5, the decomposition identity is approximate — the residual is computed and reported rather than hidden (the test suite pins it at −0.008 on a known 5-pair fixture).
3. **Calibrated Judgement Under Feedback — Tetlock (2005); Tetlock & Gardner (2015).**
   - Tetlock, P. E. (2005). *Expert Political Judgment*. Princeton University Press; Tetlock, P. E., & Gardner, D. (2015). *Superforecasting: The Art and Science of Prediction*. Crown.
   - Two Tetlock rules are enforced in code, not prose: (a) score the forecast that was made — `RULE-FCT-01` freezes the funding-time PERT belief into an immutable `forecastSnapshot`, and decision forecasts freeze at outcome review (`updateDecision` rejects post-review edits), so hindsight cannot rewrite history; (b) frequent, granular feedback — every outcome review updates the curve immediately, and verdicts refuse to render below n=5 so an anecdote is never dressed as a statistic.
4. **The Planning Fallacy & the Outside View — Kahneman & Tversky (1979); Kahneman & Lovallo (1993).**
   - Kahneman, D., & Tversky, A. (1979). *Intuitive Prediction: Biases and Corrective Procedures*. In *Judgment Under Uncertainty*; Kahneman, D., & Lovallo, D. (1993). *Timid Choices and Bold Forecasts*. Management Science, 39(1), 17–31.
   - Delivered work is scored as actual ÷ funding-time-expected ratios; a median ≥1.25× (or ≤0.80× padding) raises `FCT-01`. Interval honesty is measured separately (`FCT-02`: share of actuals inside [optimistic, pessimistic] and P10–P90 vs the ≈80% target), because centring and precision are different virtues and the classic failure is a centred mean inside fiction-narrow ranges.
5. **Reference-Class Forecasting — Flyvbjerg (2006).**
   - Flyvbjerg, B. (2006). *From Nobel Prize to Project Management: Getting Risks Right*. Project Management Journal, 37(3), 5–15.
   - The observed ratio distribution becomes the uplift: median ratio recentres new point forecasts, the ratio P80 gives the "budget this for an 80% chance of holding" figure, shown alongside (never silently folded into) the CLT delivery forecast on `#/capacity`. `RULE-FCT-02` turns proven systematic optimism (n≥5, median ≥1.25×) into exactly one DACI decision offering the median uplift, the P80 uplift, an estimation-practice investigation, or explicit acceptance — linked to the worst overrun, idempotent while unreviewed.
6. **Honest Missingness as a First-Class Signal — Little & Rubin (2002).**
   - Little, R. J. A., & Rubin, D. B. (2002). *Statistical Analysis with Missing Data* (2nd ed.). Wiley.
   - Actuals are never back-filled from estimates and forecasts never default to 50%: unknown stays null through schema normalization, migration, and export. Delivered-without-actuals is counted and surfaced (`FCT-04` at ≥3) with a one-click backfill dialog whose fields start blank — pre-filling an "actual" from the forecast would fabricate the very calibration being measured. Schedule adherence (target vs completed) is computed from dates alone precisely so some evidence exists before effort actuals accumulate.
7. **Case-Cost Calibration — deliberately deferred.**
   - Operational cases carry PERT financial exposure but no settled-actual field; scoring case cost estimates requires a resolution-time actuals capture in the case dialog and its own ledger semantics (mitigation spend vs realised exposure are different quantities). Recorded here as the next calibration ledger, not silently folded into portfolio ratios where it would double-count capacity-reserve effort.
8. **Verification Boundaries.**
   - Verified via `tests/app/calibration.test.mjs` (12 tests: Brier/Murphy/curve maths pinned to hand-computed fixtures, anti-hindsight freeze, `RULE-FCT-01` freeze/clear/re-freeze, actuals validation and backfill, ratio/interval/uplift statistics, `RULE-FCT-02` single-shot governance linked to the worst overrun, `FCT-01`…`FCT-04` firing and demo-baseline silence, scenario auto-forecast equality with CRN odds, v20→v21 additive migration with null-preservation, `calibration` CSV + CWE-1236 safety, and the JSDOM `#/decisions` card + `#/capacity` Deliver-dialog flow with zero axe violations), plus the full `npm run verify:canonical` gate (446 tests). Graphical browser rendering/contrast of the calibration card, spoken screen-reader output, and whether Brier feedback changes a real manager's forecasting behaviour over a quarter remain **[UNVERIFIED]** — the last is the field study this feature now makes possible.

## 42. Case-Cost Calibration: Actuarial Loss Development & FAIR Frequency × Magnitude Scoring (Session 32 — Schema v22)

Session 31's §41.7 deliberately left one prediction class unscored: operational cases carried three-point PERT financial exposure, planned mitigation spend and diverted-capacity estimates (Session 23), and `RULE-CAP-01` already converted their capacity triples into committed portfolio reserves — but resolution recorded only a date and a note. The system therefore assessed risk quantitatively and then never learned whether its risk numbers were worth anything. Session 32 closes the third ledger with `cases[].forecastSnapshot` + `cases[].actuals` (Schema v22), `RULE-FCT-03`/`RULE-FCT-04`, signals `FCT-05`…`FCT-07`, the `#/cases` case-cost card + `caseRatioChart`, and case rows in the `calibration` CSV, grounded in seven cross-domain frameworks:

1. **Quantitative Risk Decomposition — FAIR / Open FAIR (Freund & Jones, 2015; FAIR Institute Standard v3.0, 2025).**
   - Freund, J., & Jones, J. (2015). *Measuring and Managing Information Risk: A FAIR Approach*. Butterworth-Heinemann; FAIR Institute (2025). *Factor Analysis of Information Risk (FAIR) Model*, Standard Artifact v3.0.
   - FAIR defines risk as Loss Event Frequency × Loss Magnitude, each estimated as a calibrated range rather than a point. The case ledger scores exactly those two legs **separately**, because they fail independently: the **frequency leg** compares the FMEA-implied occurrence probability (`min(1, max(0.1, p/10))` — the same mapping `computePertImpact` has always used for expected loss) against whether the failure mode materialised, Brier-scored per case; the **magnitude leg** compares realised exposure against the PERT cost distribution (expected value, [optimistic, pessimistic] and P10–P90 coverage) on materialised cases only. A contained risk contributes no magnitude score — dividing zero by the expectation would reward the forecast for the mitigation working, which is a category error FAIR's decomposition exists to prevent. The interval-coverage check targets FAIR's best-documented practitioner failure: 90%-confidence ranges that contain the truth barely half the time.
2. **Actuarial Loss Development & Case-Reserve Adequacy — Chain Ladder / Bornhuetter–Ferguson tradition (Mack, 1993; England & Verrall, 2002).**
   - Mack, T. (1993). *Distribution-free Calculation of the Standard Error of Chain Ladder Reserve Estimates*. ASTIN Bulletin, 23(2), 213–225; England, P. D., & Verrall, R. J. (2002). *Stochastic Claims Reserving in General Insurance*. British Actuarial Journal, 8(3), 443–518.
   - Insurers judge a book of case reserves by how settlements **develop** against the initial estimate: the age-to-ultimate development factor. The ledger's aggregate `Σ(realised exposure + mitigation spend) ÷ Σ(expected unmitigated loss)` over complete settlements (single-currency, both money legs recorded — never summing a partial settlement as zero) is that factor for a team-sized book, and the median per-case ratio is the reserve-adequacy diagnostic: ≥1.25× is **deficient** reserving, ≤0.8× is **redundant**. `RULE-FCT-04` converts proven deficiency (n≥5) into exactly one DACI decision offering the observed development factor as a contingency uplift on new case exposures, P80 reserving for High-priority cases, an assessment-practice investigation, or explicit self-insured acceptance — linked `decides` to the worst under-assessment, idempotent while unreviewed, mirroring `RULE-FCT-02`'s contract for effort.
3. **Score the Forecast That Was Made — Tetlock (2005); Tetlock & Gardner (2015).**
   - Case estimates *should* be refined as mitigation proceeds — unlike funded work, updating a risk estimate is good practice, not gaming. But the numbers that drove the escalate/mitigate/accept call (and that `RULE-DEC-01` thresholds on for its automatic DACI decision) are the opening ones. `RULE-FCT-03` therefore freezes the first measured PERT exposure, capacity expectation, planned mitigation spend and pre-mitigation FMEA probability into an immutable `forecastSnapshot` the first time an open case is quantified (at creation or at the edit that first quantifies it), and settled actuals score against it. Freezing is never retroactive: a case already resolved is never frozen, and pre-v22 settlements fall back to the resolution-time estimate labelled `resolution-estimate`, the weaker evidence named as such in every UI and CSV surface.
4. **The Planning Fallacy in Risk Assessment & Reference Classes — Kahneman & Tversky (1979); Flyvbjerg (2006); Hubbard (2020).**
   - Kahneman, D., & Tversky, A. (1979). *Intuitive Prediction*; Flyvbjerg, B. (2006). *From Nobel Prize to Project Management*; Hubbard, D. W. (2020). *The Failure of Risk Management* (2nd ed.). Wiley.
   - Hubbard's central indictment — risk registers full of unscored ordinal scores that are never compared with outcomes — described pre-v22 cases precisely. `caseReferenceClassAdjustment` turns the materialised-exposure ratio distribution into median/P80 contingency uplifts for new case assessments (hint floor n≥3, verdict floor n≥5, shared with the effort ledger), so the team's own settlement history becomes the outside view for the next FMEA money column instead of the assessor's mood.
5. **Four Independent Quantities, Four Independent Scores (Session 31 §41.7's caveat, implemented).**
   - Mitigation spend vs plan (spend discipline) and diverted days vs the PERT capacity expectation are scored as their own legs, never netted against exposure. The diverted-days leg closes an explicit Session 31 debt: `calibration.js` excluded `capacity-reserve` plan items from the effort ledger because "their actual is the case outcome, which is a separate ledger" — this is that ledger, so `RULE-CAP-01` reserves now have an accuracy read (median days ratio) for the first time. Occurrence is read jointly with spend, because mitigation is *supposed* to push realised occurrence below the pre-mitigation assessment: `FCT-06` says so in its copy rather than crying wolf at successful mitigation, while a positive gap (things materialise more often than assessed) has no such excuse and fires at severity 4.
6. **Honest Missingness & Settlement Integrity — Little & Rubin (2002).**
   - Every actuals leg stays null when unrecorded: an unknown exposure is not zero, a case resolved without actuals joins `missingCaseActuals` (and `FCT-07` at ≥3) instead of vanishing, and dialog fields start blank — pre-filling an "actual" from the estimate would fabricate the calibration being measured. Reopening a case voids its settlement (actuals leave the ledger, exactly as the resolution note is voided) while retaining the frozen opening forecast, and `reconstructStateAt` rewinds actuals (and post-cutoff snapshots) out of point-in-time snapshots so historical reads never see a settlement that had not happened.
7. **Audit findings & repairs (Session 32).**
   - **Defect 1 (cross-module, capacity integrity):** closing a case through the Edit dialog (`updateCase` status → resolved/closed) routed through `propagateCaseEvent`, which ignores closed cases — so the `RULE-CAP-01` capacity reserve stayed `open` forever (silently shrinking apparent team capacity) and the `RULE-GOAL-01` resolution check-in never fired. The edit path now runs `propagateCaseResolution` identically to `resolveCase`; regression-pinned in `tests/app/case-calibration.test.mjs`.
   - **Defect 2 (live/reload divergence):** `reopenCase` cleared `resolvedOn` but left `resolutionNotes` in live state, while schema normalisation blanks them on reload — the same divergence class as Session 31's `'wanted'` lever. Both `reopenCase` and `updateCase`'s open branch now clear `resolutionNotes` and `actuals` in step with the schema.
8. **Verification Boundaries.**
   - Verified via `tests/app/case-calibration.test.mjs` (10 tests: hand-pinned FAIR-leg maths incl. Brier 0.16 occurrence fixtures and the 2.4592 aggregate development factor, snapshot-first vs resolution-estimate scoring, `RULE-FCT-03` freeze/no-refreeze/quantify-later, resolve-time + backfill capture with validation, reopen voiding, both defect regressions, `RULE-FCT-04` single-shot governance linked to the worst settlement, `FCT-05`…`FCT-07` firing + demo silence, demo baseline "collecting evidence" at 1.1939×, point-in-time actuals rewind, v21→v22 additive migration with dirty-record repair, `cases`/`calibration` CSV + CWE-1236, and the JSDOM `#/cases` card + detail panel + both dialogs with zero axe violations), plus the full `npm run verify:canonical` gate (456 tests, 37 suites) and live `serve.mjs` HTTP 200 checks. Graphical browser rendering/contrast of the case-cost card and `caseRatioChart`, spoken screen-reader output (NVDA/JAWS/VoiceOver/Orca), Firefox/WebKit engines, print pagination, and whether development-factor feedback measurably improves a real team's exposure assessment over a quarter remain **[UNVERIFIED]** — the field study this ledger now makes possible joins the existing one from §41.

---

## 43. Operational-case capacity calibration becomes a live portfolio control (Session 33)

### Research checked 2026-10-26

- Flyvbjerg, Hon & Fok (2016), *Reference Class Forecasting for Hong Kong's Major Roadworks Projects*, reports retrieval of forecast and actual outcomes for 25 roadwork projects and comparison against a wider class of 863 comparable projects. Its use of observed outcome distributions to set decision-maker risk-appetite uplifts supports learning from actuals—not copying an infrastructure percentage into unrelated engineering work. [Paper (arXiv PDF)](https://arxiv.org/pdf/1710.09419); [PMI-hosted Flyvbjerg, 2006 article](https://www.pmi.org/learning/library/nobel-project-management-reference-class-forecasting-8068).
- Atlassian's current Jira Plans / Advanced Roadmaps guidance describes capacity planning against work and scenario-specific what-if planning. LeadOS already has a counterfactual sandbox and seeded Monte Carlo; the gap was that recorded case diverted-days never fed back into its live operating plan. [Atlassian: Manage capacity in Advanced Roadmaps](https://support.atlassian.com/jira-software-cloud/docs/manage-capacity-in-advanced-roadmaps/); [Atlassian: Scenarios in Advanced Roadmaps](https://confluence.atlassian.com/jirasoftwareserver102/scenarios-in-advanced-roadmaps-1473872949.html).
- Cross-domain rationale: **operations research / queueing** (Little's Law, Kingman's utilization penalty) makes a capacity reserve an input to WIP and delay; **statistics** requires scoring actual diverted-days against the frozen forecast and separating a point estimate from the original estimate; **economics** treats this reserve as a contingency with real opportunity cost, so the resulting over-allocation creates the already existing DACI trade-off rather than silently taking more capacity; **production quality** makes calibration a closed-loop correction with audit provenance; **political/leadership governance** keeps the manager's input explicit and visible rather than auto-editing their judgment.

### Gap and implementation

`RULE-CAP-01` already reserved a case's PERT diverted person-days, and the Session 32 case-cost calibration ledger already scored actual diverted-days versus the opening forecast. But settlement did not update other open reserves or re-run the portfolio forecast: the loop ended at a report. Added pure `caseCapacityReferenceClassAdjustment` and event-driven `RULE-CAP-06` (`app/core/domain/calibration.js`, `app/core/domain/automation.js`, `app/actions.js`):

1. Use *days actuals vs days forecast*, not financial-loss ratios. This preserves dimensional validity and separates operational capacity from financial risk.
2. Wait for at least `CALIBRATION_MIN_SAMPLES` (currently five) and a median actual/forecast ratio ≥1.25 before applying any automatic reserve-only correction. The 1.25 trigger follows the existing product under-reserving policy; five is a conservative product minimum, not a statistical confidence guarantee.
3. Use the empirical median for ordinary cases and P80 for high Action Priority cases. Scale the reserve's three PERT legs, not `case.financial` and not the immutable `forecastSnapshot`; that snapshot remains the baseline for whether the historical forecast was good.
4. On resolution-time settlement or actuals backfill, resize every currently open case reserve in the same atomic store mutation. Re-run the established `RULE-CAP-02` capacity trade-off and `RULE-CAP-05` seeded Monte Carlo tail-risk checks so decision and goal telemetry see the revised capacity immediately.
5. Preview the selected multiplier, reference sample size, adjusted/raw expected days, and the no-evidence threshold in the operational-case dialog. Audit the resulting reserve update with its source rule ID.

### Deliberately rejected

- **Use exposure-cost uplift to inflate capacity-days** — dimensions and causal mechanisms differ. Use the diverted-days calibration ledger instead.
- **Rewrite the case estimate or frozen forecast when a new settlement arrives** — that would score against a moving target and hide whether the old forecast was accurate.
- **Apply a multiplier at n=1–4 or when the median is below 1.25×** — not enough local evidence for this product's automatic action; these limits do not prove n=5 is sufficient.
- **Automatically lower reserve estimates when the team has been conservative** — no shrinkage or discount is applied in this increment; over-reserving requires deliberate trade-off review because false precision has operational cost too.
- **Add a new vendor integration, backend, schema field, or user-configurable setting** — the required evidence, provenance and atomic event path already exist; additions would add setup/data risk without a demonstrated need.

### Verification and boundaries

`tests/app/case-calibration.test.mjs` proves four settled examples do not trigger automatic reserve inflation; the fifth settlement refreshes an existing open case's reserve to the median (and high-priority sizing uses P80), emits `RULE-CAP-06`, leaves the frozen opening estimate unchanged, and exposes the adjusted value in the dry-run preview. Full verification passed: `npm run verify:canonical` (ESLint, canonical boundary, documentation links, 457 tests/37 suites). No schema migration or runtime dependency was added. Real-world predictive benefit, calibration quality at n=5, Firefox/Safari visual layout, and spoken assistive-technology behavior remain **[UNVERIFIED]**.

## 44. Case closeout must reach the next coaching conversation (Session 34)

### Research checked 2026-10-26

- Google SRE's postmortem guidance defines a learning record as impact, response, causes and follow-up actions; its workbook explicitly recommends tracking action items so follow-up does not disappear after the postmortem. LeadOS already registers operational cases and creates support topics in 1:1 prep, but the topic stayed framed as active incident response after resolution. [Google SRE, Postmortem Culture](https://sre.google/sre-book/postmortem-culture/); [Google SRE Workbook, Postmortem Practices](https://sre.google/workbook/postmortem-culture/).
- Leadership and safety application: psychological safety and blameless learning require asking what conditions and safeguards shaped the outcome, not re-labelling the individual's conduct as performance evidence. This is a bounded prompt transformation, not a sentiment/competence inference.
- Product pattern: incident-management systems retain action ownership beyond closure. LeadOS adapts that continuity to the manager's next 1:1 rather than adding an external ticketing integration or claiming to schedule a conversation.

### Gap selected and shipped

The prior engine propagated an active case to an employee's 1:1 agenda, but case resolution only released capacity and updated a linked goal. The case support topic could remain stale; reopening did not restore active support if the user had already cleared it. Added `RULE-COACH-02` in `app/core/domain/automation.js`, using a case-reference marker in the generated topic to identify and reversibly update only that system-generated item. Resolution changes it to a systemic-learning prompt; reopening restores/queues active support. Employee-entered topics are not parsed, rewritten or removed; reviews are not touched. The action emits normal append-only propagation events. No schema migration was needed because the existing topic string and typed case→person coaching edge suffice; no new service or dependency was added.

### Deliberately rejected

- Automatically place a case summary in a performance review — confuses incident learning with individual performance and undermines candid reporting.
- Delete every case-related 1:1 topic on resolution — can erase unspoken follow-up; instead leave a relevant, learning-oriented topic for the next real conversation.
- Infer learning, confidence, sentiment or blame from notes — no validated evidence or need; keep the prompt deterministic and manager-reviewed.
- Auto-schedule or send reminders for a conversation — the browser-local app has no background scheduler, and pretending otherwise is a silent failure.
- Rewrite untagged legacy talking points based only on title text — title collisions and manager edits make ownership ambiguous; legacy strings are intentionally left as-is.

### Verification boundaries

`tests/app/cases-automation.test.mjs` traces case creation → typed 1:1 support topic → resolution → case-learning topic → reopen → active-support restoration, checks the `RULE-COACH-02` propagation entries, and proves an employee-authored topic survives unchanged. Spoken screen-reader output, real manager comprehension, and whether the new prompt improves operational learning remain **[UNVERIFIED]**; Google SRE practice is design guidance, not evidence of LeadOS field impact.

## 45. Negotiation Workbench: BATNA discipline, ZOPA geometry and agreement ownership (Session 35 — Schema v23)

### Research checked 2026-10-26

- **Fisher & Ury, *Getting to Yes* (1981).** Principled negotiation separates the people from the
  problem, focuses on interests rather than positions, generates options for mutual gain, and
  insists on objective criteria. Its operational anchor is the **BATNA** (Best Alternative to a
  Negotiated Agreement): the concrete course of action taken if no deal is reached. A negotiator
  without a BATNA cannot honestly know a walk-away price, and Fisher & Ury warn against negotiating
  without one. LeadOS turns this into a weighted preparation checklist in which the BATNA and a
  recorded reservation price carry double weight, and raises signal `NEG-01` when a high-stakes
  record lacks either.
- **Raiffa, *The Art and Science of Negotiation* (1982).** The decision-analytic school models each
  issue with reservation prices (walk-away limits) for both sides; the interval between them, when
  it exists, is the **Zone of Possible Agreement (ZOPA)**. Where envelopes do not overlap, the
  measured *gap* quantifies how much new options, criteria or BATNA improvement must close —
  pressure alone cannot manufacture overlap. LeadOS computes ZOPA bounds, width and midpoint per
  measurable issue for both minimize- and maximize-direction issues, and treats missing estimates as
  `incomplete` rather than zero, because a coerced zero manufactures a false no-ZOPA verdict.
- **Lax & Sebenius, *The Manager as Negotiator* (1986).** Negotiation jointly creates value
  (integrative, enlarging the pie through package options and traded differences) and claims value
  (distributive). Agreements fail in execution when commitments lack an owner. LeadOS therefore
  requires package options and objective criteria in prep, and on agreement converts each *owned*
  term into a tracked delegation (`RULE-NEG-02`); an ownerless term is surfaced as an explicit
  ownership gap, never silently assigned.
- **Walton & McKersie (1965)** frame the same tension as integrative vs. distributive bargaining;
  the workbench keeps both visible at once — ZOPA coverage measures distributive feasibility while
  options/interests capture the integrative work.
- **Nash (1950, "The Bargaining Problem", *Econometrica*)** formalizes the midpoint-like axiomatic
  split; LeadOS surfaces the Raiffa midpoint as an *analytical reference*, never as a recommendation
  the manager is nudged to accept.

### Gap selected and shipped

No canonical module could hold a bargaining record: vendor renewals, internal resource trade-offs
and scope/deadline deals had no BATNA, no reservation prices, no ZOPA, and no path from impasse or
agreement into the existing operational graph. Shipped as Schema v23 (`negotiations` collection,
additive migration): a domain engine (`app/core/domain/negotiation.js`), register/edit and agreement
dialogs with live ZOPA and propagation previews, list and detail views at `#/negotiations`, six
insight signals `NEG-01`..`06`, a Today triage card, the 23rd formula-safe CSV scope, and three
event-driven rules. `RULE-NEG-01` links impacted goals and 1:1 coaching and raises a pursue-deal-vs-
execute-BATNA DACI mandate for high-stakes work; `RULE-NEG-03` turns an impasse into exactly one
operational escalation case (idempotent on repeated deadlocks); `RULE-NEG-02` fans agreed terms out
as delegations or visible gaps. All fan-out is graph-edge based, idempotent, and per-record
switchable via `autoPropagate`. A same-unit-only BATNA cross-check deliberately stays silent across
mixed units rather than comparing dollars against days.

### Deliberately rejected

- Auto-assign ownerless agreed terms to the negotiation owner — ownership is a commitment the
  system cannot make; the gap stays visible (`NEG-06`) until a human assigns it.
- Treat a missing counterparty estimate as zero — `Number(null) === 0` once fabricated false
  no-ZOPA gaps; null now means "not recorded" end to end, locked by a regression test.
- Recommend an opening offer, target price or the Nash midpoint as advice — the app computes the
  geometry and leaves the judgement to the manager; no behavioural nudge engine is claimed.
- Auto-send anything to a counterparty — the app is local-first with no network capability by
  architecture; all outputs are records for the leader's own preparation.
- Parse free-text notes to infer reservation prices or sentiment — no validated extractor; every
  number is an explicit, confidence-labelled user entry.
- Auto-fire negotiation rules from the demo seed — the three demo records are a healthy baseline
  that fires zero `NEG-*` signals, asserted by test, so demo data never masquerades as findings.

### Verification boundaries

`tests/app/negotiation.test.mjs` (18 tests) pins ZOPA/gap math for both directions, the weighted
prep checklist, dimensional BATNA silence, transition guards, the full RULE-NEG-01/02/03 propagation
trace with idempotency and scoped delete cascade, insight firing and demo silence, CSV round-trip
including CWE-1236 neutralization, v22→v23 additive migration with repair-not-reject semantics, and
a JSDOM + axe-core list/detail/dialog workflow with zero violations. Whether the framework
discipline improves real negotiation outcomes, and how screen readers and managers experience the
views, remain **[UNVERIFIED]** — no browser engine, assistive technology or field study runs in this
container; the cited literature supplies design principles, not evidence of LeadOS field impact.

## Session 36 — Agreement is not delivery (2026-10-26)

### Research and gap decision
Re-read the Session 35 negotiation inventory and traced agreement → delegation → persistence
→ completion/return → goal/insight UI. Fisher & Ury/BATNA and Raiffa/ZOPA address agreement
quality, not execution evidence. Apply **PDCA**: agreement is Plan, delegation is Do,
observed completion/return is Check, explicit recovery is Act. Financial discipline keeps
recorded deal value separate from realised return; statistical discipline does not equate
a task completion with a measured goal result. Political accountability preserves ownership
rather than silently assigning returned work to someone else.

External benchmark read this session: https://github.com/opf/openproject (repository README,
retrieved 2026-10-26). It explicitly inventories project/portfolio, task collaboration,
time/cost/budgeting, meeting records and integrations. Adapt the connected execution-record
pattern, not its backend or accounts. This is a README-level benchmark, not a hands-on
product evaluation or validation of comparative superiority. A separate attempted VA design
README URL returned 404 and contributed no evidence. Prior framework/product inventory
remains applicable; no fresh review of every cited framework is claimed.

**Implemented:** RULE-NEG-04 completion/return feedback to negotiation history and goal
telemetry; current-term delivery states; NEG-07 recovery findings; persisted delegation
source IDs. Existing v23 shape gains preserved optional provenance, no migration required.
**Planned:** explicit recovery/redelegation with term lineage; browser/AT validation;
settled financial outcomes with evidence rather than inferred savings.
**Rejected:** automatic goal progress or savings; auto-reassignment; treating empty terms
as 100% delivered; reporting superseded terms as current delivery failures.

Limits: old stored delegations whose provenance was already stripped cannot reliably be
mapped back to a specific term using a negotiation-level edge alone. No heuristic repair is
performed. Full legacy line review and field effectiveness remain **[UNVERIFIED]**.

---

## Session 37 — Returned-commitment recovery lineage (`RULE-NEG-05`) and ex-post agreement settlement governance (`RULE-NEG-06`, `NEG-08`) (2026-10-26)

### Cross-domain frameworks applied

1. **Leadership & Management — Oncken & Wass (1974) *"Management Time: Who's Got the Monkey?"*, *Harvard Business Review*, and Grove (1983) *High Output Management* (Task-Relevant Maturity):**
   When a delegated outcome is returned to the manager (`status: 'returned'`), two anti-patterns commonly occur: either the commitment remains indefinitely on the manager's desk as an unowned "monkey", or the manager re-assigns it by overwriting the original record — erasing who previously held it, why it returned, and what changed in scope, authority, or support. Oncken & Wass and Grove establish that re-delegating a returned outcome requires an explicit transfer of ownership accompanied by adjusted authority or support commensurate with task-relevant maturity, while preserving the historical return record.
2. **Engineering & Safety Systems — Hollnagel (2014) *Safety-I and Safety-II* & Closed-Loop Corrective Action (CAPA):**
   In safety-critical engineering, a failed or returned execution attempt is never deleted when a countermeasure is launched; the failure record is linked to its corrective successor (`priorDelegationId` ↔ `supersededByDelegationId`) with a mandatory countermeasure note (`recoveryNote`), and cycle-safe graph traversal (`repairDelegationRecoveryChains`, `deriveDelegationLineage`) prevents corrupted imports from creating infinite loops.
3. **Economics & MBA/Strategy — Williamson (1985) *The Economic Institutions of Capitalism* (Transaction Cost Economics & Ex-Post Governance) and Hart & Moore (1988) *"Incomplete Contracts and Renegotiation"*, *Econometrica*:**
   Signing an agreement is ex-ante contracting; real economic value is determined during ex-post execution and settlement, where incomplete contracts encounter opportunism, scope drift, or environmental shocks. A negotiation workbench that stops at `status: 'agreed'` conflates paper terms with realised outcomes.
4. **Finance & Investment — Perold (1988) *"The Implementation Shortfall: Paper vs. Reality"*, *Journal of Portfolio Management*:**
   Perold formalizes implementation shortfall as the difference between the performance of a paper decision and the actual realised outcome after execution slippage. In LeadOS (`evaluateNegotiationSettlement`), signed `stakesValue` and per-term `agreedValue` are compared directionally against recorded `settlement.realisedValue` and `term.settledValue` to compute `realisationRatio` and `shortfallRatio` without ever pre-filling or fabricating actuals from the paper agreement.
5. **Decision Science, Game Theory & Political Science — Raiffa (1982) *The Art and Science of Negotiation* (Ex-Post BATNA Regret) & DACI Governance:**
   A walk-away BATNA (`ourBatnaValue`, `ourBatnaUnit`) is the reservation floor that justified signing the agreement rather than walking away. If the ex-post settled outcome (`realisedValue` or `settledValue` in the same unit) is worse than `ourBatnaValue` in the issue's optimization direction, or if `counterpartyDelivered === false`, the agreement suffered BATNA regret or counterparty breach, triggering `RULE-NEG-06` to open a linked DACI settlement review decision (*Execute walk-away BATNA / Invoke contract remediation / Accept realised variance*).
6. **Mathematics & Statistics — Dimensional Analysis & Survivorship-Bias-Free Point-in-Time Reconstruction:**
   `evaluateNegotiationSettlement` compares `realisedValue` against `ourBatnaValue` only when `stakesCurrency` and `ourBatnaUnit` match (`sameUnitDealBatna`), refusing to compare dollars against weeks or percentages. `reconstructStateAt(state, asOf)` rewinds post-cutoff agreements, settlements, and delegation recovery links so longitudinal health and trend series remain free of look-ahead bias.
7. **Production & Lean / Six Sigma — Deming (1986) PDCA Act Phase & Poka-Yoke Mistake-Proofing:**
   Completes the PDCA loop started in Session 36: Plan (prep/ZOPA) → Do (delegate agreed terms, `RULE-NEG-02`) → Check (observe delivery/return, `RULE-NEG-04`, and score settlement actuals, `evaluateNegotiationSettlement`) → Act (explicitly recover returned commitments with a countermeasure, `RULE-NEG-05`, and trigger DACI governance on adverse settlement, `RULE-NEG-06`).

### Implemented in code

- **Schema & Normalization (`app/core/schema.js`)**: Added `priorDelegationId`, `supersededByDelegationId`, `recoveredOn`, and `recoveryNote` on `delegations[]` with cycle-safe `repairDelegationRecoveryChains`; added `priorOwners` and `settledValue` on `negotiations[].agreedTerms[]` and `settlement` (`settledOn`, `realisedValue`, `counterpartyDelivered`, `note`) on `negotiations[]` via `normalizeNegotiationSettlement`.
- **Domain Engines (`app/core/domain/delegations.js`, `app/core/domain/negotiation.js`, `app/core/domain/automation.js`, `app/core/domain/insights.js`)**:
  - `deriveDelegationLineage(state, delegationId)` and `delegationSummary` (`unrecoveredReturned`, `recoveredReturned`).
  - Lineage-aware `negotiationDelivery` (`chain`, `priorOwners`, `attemptCount`, `recovered`, `inProgress`) and `evaluateNegotiationSettlement(record)`.
  - `RULE-NEG-05` (`propagateReturnedDelegationRecovery`) and `RULE-NEG-06` (`propagateNegotiationSettlement`), expanding `AUTOMATION_RULES` from 31 to 33 rules.
  - `NEG-07` scoped to unrecovered returned commitments (`!d.supersededByDelegationId`), plus `NEG-08` firing on adverse settlement governance triggers or completed high-stakes agreements awaiting settlement.
- **Actions, UI & CSV (`app/actions.js`, `app/ui/modals.js`, `app/ui/negotiation-modals.js`, `app/views/delegations.js`, `app/views/negotiation.js`, `app/core/csv.js`)**:
  - `redelegateReturnedOutcome`, `recoverNegotiationTerm`, and `recordNegotiationSettlement`.
  - `openRedelegateDialog`, `openRecoverNegotiationTermDialog`, `openNegotiationSettlementDialog`, lineage badges on `#/delegations` and `#/negotiations/:id`, and the *Agreement settlement & realization* card on `#/negotiations/:id`.
  - Additive lineage columns on `delegations` CSV and settlement columns on `negotiations` CSV.
- **Store, Rewind & Test Determinism (`app/core/store.js`, `app/core/domain/health.js`, `tests/app/*.test.mjs`)**:
  - `store.clearDemo()` scrubs dangling demo references on retained user `negotiations`.
  - `reconstructStateAt()` rewinds `negotiations` and delegation recovery lineage as of `asOfDay`.
  - Synchronous `app.navigate(...)` + `app.destroy?.()` in `case-calibration.test.mjs` and `calibration.test.mjs`; `delegations`, `negotiations`, and `changes` added to `scale.test.mjs`.

### Deliberately rejected

- Overwriting a returned delegation record in place when re-assigning — erases accountability and return reasons; rejected in favor of immutable returned records linked to a successor (`priorDelegationId` / `supersededByDelegationId`).
- Auto-assigning a returned commitment to the negotiation owner or a fallback person — violates political accountability; recovery requires an explicit human choice and countermeasure note.
- Pre-filling `realisedValue` or `settledValue` from `stakesValue` or `agreedValue` in the settlement dialog — manufactures fake zero-shortfall precision; fresh settlement inputs start blank.
- Comparing `realisedValue` to `ourBatnaValue` when units differ — rejected; `sameUnitDealBatna` stays `false` when units do not match.

### Verification boundaries

Verified by `npm run verify:canonical`: **483/483 tests passing across 38 test suites** (`0` failures), `0` ESLint errors, `0` boundary leaks, and `88/88` internal markdown links. Real graphical browser rendering of the Session 35–37 Negotiation Workbench views, spoken assistive-technology output, and field manager comprehension remain **[UNVERIFIED]**.

---

## 46. Negotiated-versus-realised settlement calibration (`RULE-NEG-07`, `NEG-09`) — Session 38 (2026-10-26)

### Why this gap matters

A signed negotiation value is a forecast/contract baseline, not evidence that the value was delivered. Session 37 added an explicit settlement capture and a BATNA/governance loop; the remaining gap was that the observed signed-versus-realised pair did not feed an outside-view reference class or improve preparation for later, comparable negotiations. The fourth calibration ledger is deliberately a derived read model over the existing `negotiations[]` and `evaluateNegotiationSettlement()` contract, not a second editable source of financial truth.

### Frameworks applied across domains

1. **Strategy and decision science — Flyvbjerg (2006), reference-class forecasting.** A forecast is improved by comparing it with the observed distribution of genuinely comparable past cases, not by extrapolating from the current negotiation's inside view. The arXiv abstract explicitly describes basing forecasts on actual performance in a reference class of comparable projects to bypass optimism bias and strategic misrepresentation ([paper record](https://arxiv.org/abs/1302.3642)). LeadOS uses currency and issue direction as minimum comparability boundaries; this is an outside-view *context*, not a promised forecast or automatic target.
2. **Finance — Perold (1988), implementation shortfall.** Signed paper value is distinct from realised outcome after execution/slippage ([journal record, *The Implementation Shortfall*](https://doi.org/10.3905/jpm.1988.409150)). The calibration pairs use the existing evaluator's direction-adjusted variance and shortfall, but do not relabel either as audited procurement savings or P&L impact.
3. **Economics — Williamson (1985) ex-post governance; Hart & Moore (1988) incomplete contracts.** Value can leak after signature through scope, usage, timing, performance or renegotiation. A median shortfall should prompt review of contract execution and the baseline before any attribution. Existing `RULE-NEG-06` remains the governance path; `RULE-NEG-07` only refreshes the comparison read model.
4. **Statistics — descriptive estimands, missingness and small-sample discipline.** A pair requires an explicit positive signed value and an explicitly recorded realised value. Unknowns remain in a follow-up queue, never imputed as zero or as the signed amount. Cohorts are keyed by currency and direction and never FX-converted. Below n=5 the UI and cohort CSV show counts only; at n≥5 the median and empirical P80 are descriptive, with a 20% median shortfall as an operational review guardrail. Neither n=5 nor the 20% threshold establishes statistical significance, causality or forecast coverage; the P80 is not a confidence interval.
5. **Leadership and political accountability — fair process, DACI and blameless learning.** `NEG-09` is cohort-level and routes to the Decisions calibration view; it explicitly instructs the manager to check baseline, scope, usage and delivery before assigning cause. It is not a ranking of negotiators, an employee-performance measure, or a substitute for the agreement owner's judgement. Existing BATNA breach and counterparty-remedy governance remains separate.
6. **Production practice — Deming PDCA / event-driven idempotency.** Settlement is the Check input after Plan (BATNA/ZOPA) and Do (delegation/delivery); the review is the Act. `RULE-NEG-07` executes in the same safe-write transaction as `RULE-NEG-06`, returns typed propagation metadata, and deduplicates an identical audit propagation. Statistics remain recomputed from the source records rather than stored as mutable copies.
7. **Engineering and information integrity — dimensional analysis and privacy of unknowns.** Comparing EUR with USD or cost-minimising with value-maximising issues would manufacture meaning. `calibration.js` consumes `dealDirection`, `stakesCurrency`, `stakesValue`, `realisedValue`, `favorableValueVariance`, and `shortfallRatio` from the settlement evaluator; no `schema.js` change or external service is required. Preparation excludes the current negotiation from its own reference class to prevent self-scoring.

### Product-pattern benchmark (not a comparative efficacy study)

- **Oracle Cloud EPM Financials** documents separate actual, plan and forecast scenarios and explicit calculation/roll-up steps ([tutorial](https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/planning-tutorials-calculating-actuals-and-preparing-plans-and-forecasts/index.html)). Adapted pattern: keep actuals and forecasts distinct, label how comparisons are computed. LeadOS is not a financial consolidation or accounting system.
- **Coupa Direct Material Sourcing** markets a connected strategy-to-contract-to-invoice/value-realisation loop and scenario modelling across cost, capacity, lead time and risk ([vendor product page](https://www.coupa.com/products/direct-material-sourcing/)). Adapted pattern: follow signed terms through execution; boundary: Coupa's sourcing, CLM and invoice-matching capabilities are vendor claims and were not independently tested here.
- **Suplari's procurement savings article** argues for agreeing the baseline/methodology before negotiation and checking invoice/ledger evidence after signature ([vendor-authored article](https://suplari.com/blog/realize-savings-in-procurement-how-to-prove-what-your-team-actually-delivered)). Adapted pattern: preserve baseline provenance and do not call a negotiated number "realised savings". The article is a commercial vendor publication, not independent evidence; LeadOS currently records manager-entered amounts and does not validate invoices or general-ledger transactions.

### Implemented design and cross-module path

- `app/core/domain/calibration.js`: `negotiationSettlementPairs()`, `negotiationSettlementCalibration()` and `calibrationSummary().negotiations`; only explicit, positive-baseline pairs enter cohorts, while incomplete settled records carry a human-readable reason and remain countable.
- `app/core/domain/automation.js` + `app/actions.js`: `RULE-NEG-07` is called in the `recordNegotiationSettlement()` transaction beside `RULE-NEG-06`; repeat application is idempotent for the same emitted cohort outcome, while source settlement events remain in the audit history.
- `app/core/domain/insights.js`: reserved `NEG-09` triggers for a sufficient cohort at the 20% median-shortfall guardrail and links to `#/decisions`; it makes no causal or employee-level assertion.
- `app/views/decisions.js`: fourth calibration readout, counts-only small cohorts, accessible table, and a record-by-record follow-up list for missing values.
- `app/views/negotiation.js`: prior comparable cohort context appears in preparation only when a same-currency issue direction is recorded; current negotiation is excluded, small cohorts remain counts-only, and no targets are rewritten.
- `app/core/csv.js`: additive `negotiation-settlement`, `negotiation-reference-class` and `negotiation-missing-actual` rows in the existing `calibration` scope. Cohort summary rows stay counts-only under n=5; raw pair rows are explicitly recorded source observations, not a pooled verdict.

### Gaps, rejected shortcuts and boundaries

- **Not implemented:** invoice/GL verification, a procurement integration, FX conversion, automatic savings claims, automatic changes to BATNA/targets, causal attribution to negotiation skill, or use of settlement statistics in performance reviews. Those would exceed the current evidence and may require consent, baseline methodology, transaction provenance and finance review.
- **Rejected:** putting different currencies into a common mean, treating a cheaper realized price as adverse for every agreement, filling missing actuals from the signed value, hiding incomplete settlements, or calling the 20%/n=5 guardrails research-validated.
- **Gap analysis:** the ledger now links negotiation → settlement → calibration → insight/decision → future preparation. The largest remaining evidence gap is source verification: actual amounts are user-entered and may not reconcile to invoices, usage, volume or the agreed baseline. Real-world performance, manager interpretation, and whether n=5/P80 is useful for a live team are **[UNVERIFIED]**.
- `npm run verify:canonical` passed: **485/485 tests across 38 suites**, 0 ESLint errors, 0 canonical-boundary leaks and 89/89 internal Markdown links. Repository-sync outcome is recorded in Session 38 of `AI-SESSION-LOG.md` after the push. Graphical browser rendering, spoken screen-reader output, finance-system reconciliation and field comprehension remain **[UNVERIFIED]**.

## 47. Budget envelopes & financial commitments: encumbrance accounting, budgetary control and the fifth calibration ledger (Session 39 — Schema v24)

### Gap found by audit

Before this session, money in LeadOS existed only as scattered estimates — a case's PERT
exposure, a portfolio item's value triple, a negotiation's stakes and settled actuals. No
record answered the first-time leader's most concrete finance question: *what envelope do I
have, what have I already committed against it, what has actually been spent, and am I forecast
to breach?* Session 38's roadmap also left settlement actuals with no "finance-approved
baseline" home. The missing module was a budget ledger — the finance/capital-allocation leg of
the cross-domain mandate — not another estimate field.

### Frameworks applied (named, not paraphrased)

1. **Finance / management accounting — budgetary control & variance analysis (Anthony &
   Govindarajan, *Management Control Systems*).** Control is exercised on the *forecast at
   completion* (recorded actuals + open commitments) against the approved ceiling while
   corrective action is still possible. Post-period variance reporting alone is archaeology.
2. **Public-sector finance — commitment/encumbrance accounting (GASB budgetary accounting;
   Oracle Commitment Model documentation).** Encumbrance reserves budget authority when an
   obligation is entered into (PO/contract), before any invoice; the encumbrance is reversed
   when the actual expenditure is recorded ([encumbrance vs expenditure summary](https://gao.fo.uiowa.edu/managing-grants-contracts/encumbrances),
   [Oracle Commitment Model](https://docs.oracle.com/cd/E18727_01/doc.121/e13418/T343030T346715.htm)).
   Hence four line states — `planned`, `committed`, `spent`, `released` — never one "spent" column.
3. **Economics — expiring budgets (Liebman & Mahoney, 2017, *American Economic Review*).**
   Federal spending in the final week runs 4.9× the weekly average and year-end IT projects
   are 2.3–5.6× more likely to score below-median quality ([paper/abstract](https://www.nber.org/papers/w19481)).
   Design consequence: an envelope is a ceiling, not a target — underspend is never scored as
   failure, FIN-05's period-end copy says so explicitly, and nothing recommends spending to
   protect a future envelope (also Hope & Fraser's *Beyond Budgeting* critique of fixed
   budget-as-contract).
4. **Statistics / strategy — reference-class forecasting (Flyvbjerg, 2006) and the planning
   fallacy (Kahneman & Tversky, 1979).** Recorded actuals are scored as actual÷committed
   ratios. Ratios are dimensionless, so they may pool across currencies without FX conversion;
   amounts never pool. Counts-only below n=5, as in every other ledger. The 1.20× median
   overrun trigger and 80% watch share are product guardrails, not validated constants.
5. **MBA / decision governance — DACI with explicit opportunity cost.** A forecast breach
   opens exactly one decision whose options are concrete: release/defer the largest
   encumbrances (returning named amounts of authority), request a named envelope increase, or
   accept the breach explicitly. No silent re-baselining.
6. **Engineering / production — closed-loop control (Deming PDCA) and dimensional honesty.**
   One currency per envelope by construction; missing actuals and unpriced commitments make
   the forecast *labelled understated* instead of being silently zero-filled.

### Implemented design and cross-module paths

- `app/core/domain/finance.js` (new, pure): `evaluateBudget`, `summarizeBudget`,
  `budgetsRollup`, `commitmentCalibrationPairs/Calibration`, `calibratedForecast`,
  `sourceCompletion`, `formatMoney`.
- Schema v24 (`budgets` collection, `budgetWatchPct` setting, additive 23→24 migration):
  dead owners/sources are cleared while amounts survive; a zero/blank ceiling means
  tracking-only; actuals only exist on `spent` lines.
- `RULE-FIN-01` (budget write → decisions/graph): forecast breach opens one idempotent DACI
  trade-off, linked `budget →decides→ decision`.
- `RULE-FIN-02` (bidirectional): sourced lines create typed `funds` edges and neutral,
  idempotent goal funding check-ins (confidence/progress untouched); in reverse, case
  resolution, negotiation settlement and portfolio delivery stamp matching encumbrances
  `actualsDueOn` inside the completing transaction.
- `RULE-FIN-03` (actual recorded → calibration): typed propagation + idempotent audit event;
  the fifth ledger appears in `calibrationSummary()`, the Decisions calibration card and the
  `calibration` CSV (`budget-commitment`, `budget-reference-class`, `budget-missing-actual`).
- Signals `FIN-01..05` (Finance domain), Today finance triage card, `#/finance` + `#/finance/:id`
  views, budget/line/actual dialogs (live forecast readout; actual never pre-filled), `finance`
  CSV scope (#24), Settings watch-% convention, healthy demo envelope (zero FIN findings),
  `clearDemo` scrubbing and `reconstructStateAt` rewind parity.

### Deliberately rejected / deferred

| Idea | Reason |
|---|---|
| Copying committed amounts into blank actuals | Would fabricate a perfect 1.0× calibration score from no evidence — the single worst failure mode for this module. |
| Auto-converting case exposures / portfolio values / negotiation stakes into budget lines | Those are estimates in different units of meaning; an envelope the leader never recorded is invented financial data. |
| FX conversion to a "workspace total" | No rate source exists locally; a converted total would be a fabricated precision claim. Ratios pool; amounts don't. |
| Scoring underspend or "budget utilisation" as performance | Directly creates the Liebman & Mahoney year-end surge incentive. Ceilings are limits, not quotas. |
| Earned-value % -complete / CPI-SPI forecasting | Requires percent-complete judgements this record cannot evidence; FAC from actuals + encumbrances is the honest subset. |
| Invoice/GL integration or bank sync | Network + accounts violate the local-first invariant; needs an ADR, not a feature flag. |
| Auto-increasing ceilings or rewriting committed amounts from calibration | The reference class informs the next human decision; restating recorded figures destroys the audit trail it is scored from. |

### Boundaries

Recorded amounts are leader-entered evidence, not reconciled to invoices, POs or a general
ledger — validation against source finance systems, real-browser/screen-reader behaviour of
the new views, manager comprehension, and the field usefulness of the 80% watch share and
1.20× median-overrun guardrails remain **[UNVERIFIED]**. Verification numbers are recorded in
Session 39 of `AI-SESSION-LOG.md`.

---

## 48. Stakeholder Influence Register: four-lens political analysis with cross-module propagation (Session 40 — Schema v25)

### Why now and what the category actually does

The Session 39 roadmap named the Stakeholder Influence Register the natural next module.
The published 2025–26 category audit of stakeholder relationship management (SRM) software
shows the commercial field is oriented to **engagement logistics** — communication logs,
GIS, grievances, sentiment NLP and compliance reporting — not to political analysis:

- **Borealis**, the infrastructure/energy SRM reference platform, generates only "basic
  stakeholder maps … on a grid with parameters like power, level of interest, and level of
  influence" and is independently reviewed as lacking "advanced analytics … qualitative
  analysis, sentiment analysis, tagging, and relationship health scores" plus "linking
  between stakeholder records and other relevant tools and records"
  ([Simply Stakeholders' Borealis alternatives page](https://simplystakeholders.com/borealis-alternatives/),
  vendor-published comparison — treat as a commercial claim, not independent evidence).
- **Simply Stakeholders (formerly Darzin)** goes furthest methodologically with a proprietary
  six-attribute scoring model (Criticality, Position, Effort, Interest, Impact, Influence)
  and relationship network views, but the model is a closed proprietary score, not a
  transparent published framework; its own category comparison rates automated workflows
  "basic" against CRMs and markets 3–6 month implementations
  ([salesmotion 2026 tool round-up](https://salesmotion.io/blog/stakeholder-mapping-tools);
  [Simply Stakeholders compare page](https://simplystakeholders.com/compare/)).
- Even the category leader concedes the core technique's weakness: the power-interest grid
  "can oversimplify complex relationships" and depends on "subjective positioning of
  stakeholders" ([Borealis stakeholder mapping guide](https://www.boreal-is.com/blog/stakeholder-mapping-identify-stakeholders/)).
- CRMs (Salesforce, Dynamics, HubSpot) are repeatedly rejected as the system of record
  because the sales pipeline is linear whereas engagement is multi-faceted and
  multi-decade, and CRMs lack salience/veto constructs entirely
  ([Borealis CRM vs engagement](https://www.boreal-is.com/blog/crm-vs-stakeholder-engagement-whats-the-difference/);
  [Simply Stakeholders vs CRM](https://simplystakeholders.com/comparison/simply-stakeholders-vs-crm/)).

### Academic anchors actually implemented (not name-dropped)

1. **Mendelow (1981/1991) power × interest** — quadrant, cadence defaults and guidance;
   reused the canonical classifier already proven on case/change stubs since Schema v16,
   so the 5×5 matrix and embedded-stub vocabulary stay consistent.
2. **Mitchell, Agle & Wood (1997), *Academy of Management Review* 22(4), 853–886** — all
   seven salience classes (dormant, discretionary, demanding, dominant, dangerous,
   dependent, definitive) from power/legitimacy/urgency possession at threshold ≥4; raw
   score /15 with an evidence-confidence adjustment (high ×1.0, medium ×0.85, low ×0.7).
   The MAW twenty-year retrospective (Wood, Mitchell, Agle & Bryan) documents salience
   *flux* — an actor's class changes as urgency rises or coalitions align — which is why
   the register carries append-only stance history and recalculates class on every read,
   rather than persisting a label
   ([Ronald Mitchell publications](https://www.ronaldmitchell.org/publications/20%20years-AS%20ACCEPTED%20(pre-publication).pdf)).
   Agle, Mitchell & Sonnenfeld (1999) found urgency the strongest of the three predictors
   of managerial salience — the empirical basis for RULE-STK-04's high-urgency-without-
   contact-plan signal rather than treating all low-power actors as ignorable
   ([MAW guide with empirical summary](https://umbrex.com/resources/frameworks/organization-frameworks/stakeholder-salience-model-mitchell-agle-wood/)).
3. **Tsebelis (1995, 2002) veto players** — agreement gates shrink the win-set. LeadOS
   implements an explicit, labelled *heuristic*: each veto player contributes at most 25
   difficulty points from stance distance (ordinal 0–4 ÷ 4) × power (rating ÷ 5) × 25;
   cohesion penalties follow Tsebelis's own empirical emphasis on ideological distance
   and cohesion among collective veto actors (+5 spread ≤1 ordinal, +8 unified blocker
   front), producing feasible (0–33) / contested (34–66) / blocked (67–100) bands with a
   per-analysis confidence label. The UI states it is an operational proxy, not the formal
   spatial win-set model ([empirical veto-player applications review](https://www.researchgate.net/publication/225845382_Empirical_Applications_of_Veto_Player_Analysis_and_Institutional_Effectiveness)).
4. **Nissenbaum (2009) contextual integrity** — political assessments are governed by
   context-specific appropriateness: stances, veto bases and influence notes exist for
   internal decision quality but are neutralized by the existing redaction machinery
   (`redactStakeholderStances`) before any copy leaves the device, with a scrub count in
   the export metadata.

### What makes this ahead of the commercial category

| Capability | LeadOS Schema v25 | Commercial SRM (Borealis / Simply Stakeholders / Quicker) |
|---|---|---|
| Transparent published-theory analytics | MAW salience classes + Tsebelis difficulty bands, formulas visible in-app | Proprietary six-attribute scores; method closed; power/interest grid only |
| Reconciliation | Strict exact-name/person matching of embedded initiative stubs against one persistent register, coverage % with unmapped count as a hygiene signal | Records typically per-project; category-wide linking flagged as a gap even in Borealis reviews |
| Event-driven action | `RULE-STK-02` opens a DACI alignment decision in the **same transaction** as the adverse veto signal; `RULE-STK-03` queues a blameless 1:1 talking point on a stance shift | Workflows are task/reminder automation on engagement records, not theory-driven cross-entity governance |
| Coalition graph | Union-find alliance blocs with power-weighted stance centroids, directional opposition/influence edges, hidden-influencer detection (low power, high out-influence) | Network views exist in premium tiers but without bloc-leaning or hidden-influencer computation documented |
| Privacy posture | Local-first, contextual-integrity redaction with metadata counts, full CSV/JSON export by design; no account, cloud or AI training path | Cloud SaaS; competitor comparisons themselves document export limits/paid add-ons and onboarding fees above $12k AUD |
| Point-in-time | Stance/contact rewind with explicit approximate-fidelity note | Not found in category materials |

### Deliberately rejected / deferred

| Idea | Reason |
|---|---|
| Fuzzy/near-name auto-linking of embedded stubs | A guessed political edge is worse than a counted gap; near-misses stay unmapped and surface as STK-02 hygiene findings. Strict matching is the test-pinned contract. |
| Persisting salience class or Mendelow quadrant as a stored field | MAW is dynamic by construction; stored labels go stale the moment urgency changes. Class is pure derivation from current ratings (and rewinds correctly under point-in-time). |
| A formal spatial win-set / indifference-curve model | Requires ideal-point estimation the ordinal data cannot support; the stance-distance heuristic is honestly labelled in every UI surface and rationale string. |
| Sentiment NLP on contacts/notes | Needs a network service and a model; violates local-first and contextual integrity. Stance is explicit leader evidence, never inferred from text. |
| Converting embedded case/change/negotiation stubs into register records at migration | Would invent named actors the leader never registered; the v24→v25 migration is additive and the register starts empty, reconciling through RULE-STK-01. |
| Auto-scheduling meetings or sending outreach | No network primitives by ADR-0006; cadence proposes the next contact date, the leader acts. |
| Graph visualization beyond lists/chips | A force-directed canvas adds rendering/AT complexity without evidence of better decisions; blocs, edges and the 5×5 grid carry the same information accessibly. |

### Boundaries

All ratings are leader-entered ordinal evidence with explicit confidence labels; the
cohesion thresholds (+5/+8), band edges (33/66) and confidence factors (0.85/0.7) are
transparent product guardrails, not empirically validated constants, and remain
**[UNVERIFIED]** in field use. Vendor feature claims above are marketing-page evidence
about competitors, not independent benchmarking; no accounts were created or trials run.
Real-browser graphical rendering, spoken screen-reader output and field usefulness remain
**[UNVERIFIED]**. Verification numbers are recorded in Session 40 of `AI-SESSION-LOG.md`.

---

## 49. Cross-ledger Forecast Integrity: conformal outside views, decision-native scoring and the 2026 competitive hunt (Session 41 — Schema v26)

### Why this was the highest-leverage gap

Sessions 31–40 built five honest calibration ledgers: decision probabilities (Brier/Murphy),
delivery effort (planning-fallacy ratios), case exposure/occurrence (FAIR), negotiated value
(implementation shortfall) and budget commitments (encumbrance accuracy). Each was a
rear-view mirror. A first-time leader about to commit money, time or political capital still
had to open five screens, mentally combine unlike quantities, and guess whether the team's
history was a real base rate or five anecdotes. No module answered: **"what range of
outcomes should I plan for, and how much should I trust it?"**

Commercial "calibration" in HR software means something else entirely: calibrating
*performance ratings* across managers, not calibrating the leader's own forecasts against
recorded outcomes. That distinction is the product opportunity.

### The 2026 competitive hunt — what the best in the world are actually doing

**AI forecasting and proper scoring are advancing fast, but on external events.**
- Bridgewater AIA Labs' **AIA Forecaster** technical report reports Brier 0.108 vs a
  superforecaster median 0.111 on two resolved ForecastBench rounds and 0.1002 on a live
  n=64 forward evaluation; it uses agentic search and Platt scaling as a final recalibration
  stage ([arXiv:2511.07678](https://arxiv.org/html/2511.07678v1)). This is a cloud research
  agent forecasting public questions, not a manager's private delivery promises.
- A 2026 survey of eleven AI-forecasting analyses reports logistic recalibration (Platt
  scaling) improving binary Brier scores by 0.016 (p=0.00052) and notes that 86% of
  competition winners ensemble or aggregate forecasts
  ([EA Forum, July 2026](https://forum.effectivealtruism.org/posts/Spyz3wESZu2eeqhDj/ai-forecasting-in-2026-what-11-analyses-say),
  [LessWrong mirror](https://www.lesswrong.com/posts/a82q6yd8zKpYk56cF/ai-forecasting-in-2026-what-11-analyses-say)).
- ForecastBench's updated methodology introduces a **difficulty-adjusted Brier score** so
  forecasters who answered non-overlapping questions can be ranked
  ([ForecastBench methodology PDF](https://www.forecastbench.org/assets/pdfs/forecastbench_updated_methodology.pdf)).
  A 2026 arXiv paper restates the Murphy decomposition into uncertainty, reliability and
  resolution and warns that detecting a small Brier edge needs hundreds of resolved binary
  predictions ([arXiv:2605.00420](https://arxiv.org/html/2605.00420v2)).
- The Good Judgment Project found "comparison classes" — reference-class forecasting —
  correlated with forecasting accuracy
  ([AI Impacts evidence summary](https://aiimpacts.org/evidence-on-good-forecasting-practices-from-the-good-judgment-project/)).
  A 2025 review of reference-class forecasting documents both the planning-fallacy rationale
  and unsolved problems of class selection and uniqueness bias
  ([Production Planning & Control, 2025](https://www.tandfonline.com/doi/full/10.1080/09537287.2025.2578708)).

**Decision-intelligence platforms remember decisions but do not score the decision-maker's own estimates.**
- Gartner's 2026 decision-intelligence market page describes Aera Decision Cloud's real-time
  recommendations and scenario modelling and Quantexa's entity-resolved contextual decisions
  ([Gartner Reviews](https://www.gartner.com/reviews/market/decision-intelligence-platforms)).
  Aera's 2026 announcement markets a "decision memory" that captures context, action and
  outcome for later recommendations
  ([Aera Technology](https://www.aeratechnology.com/news/aera-technology-named-leader-2026-gartner-magic-quadrant-decision-intelligence-platforms/)).
- Cloverpop documents a **Decision Bank** storing what was decided, why, by whom and with what
  outcome, plus D-Sight agentic recommendations and AI forecasting
  ([Cloverpop platform](https://www.cloverpop.com/resources/what-you-get-in-the-cloverpop-decision-intelligence-platform),
  [CloverPlan forecasting](https://www.cloverpop.com/planning-forecasting)).
- Quantexa announced a **Simulation Lab** for modelled realities
  ([Quantexa, Sept 2026](https://www.quantexa.com/blog/building-better-decisions-through-simulation-and-context/)).
  A 2026 buyer guide says Gartner's inaugural Magic Quadrant evaluated 17 vendors and named
  FICO, Aera, SAS, IBM, ACTICO and Quantexa Leaders
  ([Market Intelligence Tools](https://marketintelligencetools.com/rankings/decision-intelligence-platforms/)).
- These are enterprise, cloud, integration-heavy systems aimed at recurring operational
  decisions. None of the cited materials describes a transparent Brier/Murphy score for the
  leader's own probability forecasts, a distribution-free prediction band over that leader's
  money/time estimates, or a same-transaction challenge fan-out across decisions, budgets,
  cases and coaching. Vendor materials are capability claims, not independent benchmarks; no
  accounts or trials were run here.

**People-analytics vendors predict employees, not the manager's promises.**
- Lattice's 2026 State of People Strategy report positions AI as an aid to manager calibration
  and consistency in performance reviews
  ([Lattice](https://lattice.com/state-of-people-strategy/2026));
  a 2026 comparison describes predictive attrition modelling and AI coaching suggestions
  ([HR Tools Nav](https://hrtoolsnav.net/blog/lattice-vs-15five-vs-culture-amp-2026)).
- Betterworks' 2026 calibration guide describes rating matrices, distributions and activity
  logs — rating calibration, not forecast calibration
  ([Betterworks](https://www.betterworks.com/magazine/best-performance-calibration-software-for-2026)).
  A people-analytics survey lists predictive attrition, theme detection and anomaly detection
  as current AI uses while naming causal inference and cross-source harmonisation as unsolved
  ([PeoplePilot, Oct 2026](https://www.peoplepilot.io/blog/state-of-people-analytics-2026)).
- These claims are vendor/aggregator evidence. The relevant gap is not "add an LLM"; it is
  that the manager's own estimate→outcome loop is unscored in the tools they already use.

### Academic anchors actually implemented (not name-dropped)

1. **Brier (1950) proper scoring + Murphy (1973) decomposition.** Decision probabilities are
   scored separately from magnitudes and decomposed into reliability, resolution and
   uncertainty. The UI prints Brier and bias in percentage points, with counts-only below n=5.
   The 2026 arXiv paper above states the decomposition and its small-sample power limits.
2. **Kahneman & Tversky (1979), Flyvbjerg (2006), Good Judgment Project.** Dimensionless
   actual÷forecast ratios are the outside view. Classes stay segmented by quantity, currency
   and deal direction; no FX, no inferred actual, no "our project is different" exception.
3. **Exact two-sided sign test.** A median ratio alone can be one outlier. LeadOS computes the
   exact binomial p-value around ratio=1 (excluding ties) and requires p≤0.10 plus a
   1.25×/0.80× median guardrail before issuing any challenge. At n=5 all five above the line
   gives p=0.0625; below n=5 no verdict is rendered.
4. **Split conformal prediction.** With n calibration residuals and k=⌈(n+1)(1−α)⌉, the
   k-th ordered absolute relative residual yields a band with marginal coverage ≥ k/(n+1)
   for a fresh exchangeable outcome. Angelopoulos & Bates state the non-asymptotic,
   distribution-free guarantee and the impossibility of general conditional coverage
   ([arXiv:2107.07511](https://arxiv.org/html/2107.07511v6),
   [Berkeley PDF](https://people.eecs.berkeley.edu/~angelopoulos/publications/downloads/gentle_intro_conformal_dfuq.pdf)).
   A 2026 neural-operator paper restates the 1/(n+1) finite-sample gap and the exchangeability
   assumption ([arXiv:2606.09923](https://arxiv.org/html/2606.09923)).
   LeadOS therefore states **marginal coverage only**, shows the finite-sample bound, and
   refuses a band below n=5.

### What makes Schema v26 ahead of the surveyed category

| Capability | LeadOS v26 | 2026 tools surveyed |
|---|---|---|
| Unit of learning | One typed prediction atom across decision probabilities, plan effort, case exposure/days/spend, budget commitments and negotiated value | AI forecasters score public-event questions; HR tools score people; decision platforms log enterprise decisions |
| Uncertainty representation | Distribution-free conformal band with finite-sample coverage bound and visible exchangeability caveat | Vendor forecasting accuracy claims; no published per-manager conformal band found in the surveyed materials |
| Proper scoring of the leader | Brier/Murphy for probabilities; exact sign test for ratios; counts-only below n=5 | Rating calibration, attrition scores, proprietary model confidence |
| Propagation | One post-commit rule fans a single outcome into challenges, typed graph links, DACI decisions, a measurement-recovery delegation, signals and a board brief in the same transaction | Workflows/approvals and recommendations; no same-transaction cross-ledger outside-view challenge found |
| Data posture | Local-first, zero-build, deterministic, no cloud LLM, full CSV/JSON export | Cloud enterprise platforms; integration and account requirements |
| Human authority | Source forecasts are immutable; a leader accepts/adapts/dismisses with a written reason | Automated/assisted/advised decision spectra; model recommendations may be accepted or overridden |

### Deliberately rejected / deferred

| Idea | Reason |
|---|---|
| Automatically rewriting estimates from the reference class | Destroys the immutable forecast being scored and hides the learning loop. Challenges are separate, reviewable records. |
| A single "confidence score" over money, days and probabilities | Incommensurable units and different proper scoring rules. Probability, ratio and pooled descriptive views stay separate. |
| Normal/log-normal ±1.28σ intervals | Small, heavy-tailed operational samples do not justify a parametric error model; conformal quantiles require only exchangeability and state it. |
| Conditional coverage claims for each person/vendor/class | Distribution-free conditional coverage is impossible in general. The guarantee is marginal; low-evidence classes get a labelled low-confidence pooled prior, not a precise promise. |
| Pooling amounts across currencies or inferred FX | Ratios are dimensionless and can pool; amounts cannot. Currency/direction cohorts remain segmented. |
| LLM-generated forecasts or sentiment from notes | Network dependency, unverifiable inference, and private data leave the device. All numbers derive from explicit outcomes in this workspace. |
| Treating missing actuals as zero or as the estimate | Survivorship bias and fabricated perfect calibration. Missing outcomes are counted and trigger one blameless recovery delegation at three gaps. |
| Employee/team performance scores from forecast error | The error belongs to the planning system, not a person. Signals are blameless and process-oriented. |

### Boundaries

Conformal coverage is marginal and assumes future errors are exchangeable with calibration
errors; a process change, new vendor class or learning effect can break that assumption.
n=5, 1.25×/0.80×, p≤0.10 and 80% target coverage are transparent operational guardrails,
not externally validated constants. The board brief is deterministic text from recorded
evidence, not an LLM opinion or invoice/GL reconciliation. Real-Chromium graphical rendering,
spoken assistive technology, manager comprehension and field usefulness remain
**[UNVERIFIED]**. Verification numbers are recorded in Session 41 of `AI-SESSION-LOG.md`.

---

## 50. One-file offline distribution: why a standalone HTML artifact, and what it can honestly promise (Session 42)

### User need and gap found in the current app

The canonical app is zero-build but not zero-folder: `index.html` loads
`./app/main.js`, which imports 88 more modules. Over HTTP this is elegant. Copied
alone to a different PC and opened as `file://`, it fails because module scripts
are fetched with CORS semantics and local files have an opaque origin
([MDN: JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules),
[MDN: CORS request not HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp),
[WHATWG HTML issue #8121](https://github.com/whatwg/html/issues/8121)).
A non-engineer cannot be expected to copy a whole folder, install Node, or start
a browser with `--allow-file-access-from-files`.

### Competitive / pattern hunt — genuinely new findings this session

- **TiddlyWiki is the canonical single-file local-first app.** Its GitHub
  organisation describes "a standalone portable wiki in a single HTML file" that
  works offline from a USB stick with no server or installation
  ([Tiddly-Wiki GitHub](https://github.com/Tiddly-Wiki)); the mature
  TiddlyWiki5 repository documents both single-file browser use and an optional
  Node server ([TiddlyWiki5](https://github.com/TiddlyWiki/TiddlyWiki5)).
  Independent 2026 coverage notes that the entire editor, UI and content can
  live in one file, but saving behaviour depends on browser savers, IndexedDB or
  a download fallback — the HTML file itself is not magically writable
  ([WindowsForum local-first roundup](https://windowsforum.com/news/local-first-web-apps-tiddlywiki-excalidraw-minipaint-openreel-and-super-productivity.401547/),
  [MakeUseOf](https://www.makeuseof.com/open-source-apps-that-run-entirely-in-browser-dont-touch-cloud/)).
- **Single-file build tooling is a real 2026 pattern.** `vite-plugin-singlefile`
  explicitly targets offline apps bundled into one HTML file you can double-click
  with no server, and lists `localStorage`, hash-based SPA routing and relative
  links as supported patterns
  ([npm package](https://www.npmjs.com/package/vite-plugin-singlefile)).
  A 2026 developer report describes shipping a ~1.7 MB single-file wedding
  planner with IndexedDB first, `localStorage` fallback and a loud "download a
  backup" path when neither write succeeds
  ([DEV Community](https://dev.to/spectrtech/a-web-app-in-one-offline-html-file-indexeddb-a-localstorage-fallback-and-a-hand-written-zip-459e)).
- **The category's honest limit is storage, not computation.** A 2025 HN
  discussion of two dozen single-file tools lists ~5 MB `localStorage`, no Cache
  API and CORS restrictions as the real constraints
  ([Hacker News](https://news.ycombinator.com/item?id=46353359)). An
  awesome-list of single-file tools frames the benefit as "no npm install, no
  complex build pipelines, zero telemetry"
  ([awesome-singlefile-tools](https://github.com/tschnorpfeil/awesome-singlefile-tools)).
- **Why LeadOS is not just copying a pattern:** the existing product already has
  explicit JSON import/export, an append-only event log, optional AES-GCM
  encryption and 26 governed CSV scopes. The portable artifact therefore
  separates *application portability* from *data portability* instead of
  pretending a browser can reliably rewrite its own HTML file.

### Decision implemented

`scripts/build-standalone.mjs` uses `esbuild` **at build time only** to inline the
entire ES-module graph as one classic IIFE, inlines `app/styles.css`, removes all
external script/stylesheet references, injects a `connect-src 'none'` CSP and a
source fingerprint, and writes `LeadOS-standalone.html`. Details and rationale:
[ADR-0009](docs/adr/0009-single-file-offline-distribution.md).

The standalone page sets a distinct `leados.standalone.v1` storage key, shows a
banner that the app travels but records do not, and adds a Settings card with a
download link (served mode) or export/import guidance (standalone mode). The
static server now exposes only that one deliberate artifact outside `app/**`.

### Deliberately rejected

| Idea | Reason |
|---|---|
| Ask users to install Node and run `scripts/serve.mjs` on each PC | Contradicts "copy one file and run locally"; adds a command-line dependency. |
| Keep ES modules and require Chrome's `--allow-file-access-from-files` | Insecure flag, still needs the whole folder, and fails in other browsers. |
| Write records back into the standalone HTML file | Browser file-write APIs are inconsistent and permissioned; silent data loss is worse than explicit JSON export. TiddlyWiki's own saver complexity is evidence. |
| Inline a CDN-hosted framework or fonts | No network guarantee; would break offline and create a tracking surface. |
| Electron/Tauri installer | An installer is not "one HTML file"; adds a runtime and update burden. |
| Claim `localStorage` always works for `file://` | Browsers treat local files as opaque origins; Firefox/Chrome behaviour differs. The app degrades to in-memory with a visible warning. |
| Claim standalone encryption always works | Web Crypto availability depends on the browser's secure-context policy for local files. The UI disables it honestly. |
| Reuse the served workspace's storage key | A local file and an HTTP origin in the same browser could silently overwrite each other's records. |

### Boundaries

JSDOM proves the generated file boots from a `file://` URL with an arbitrary
filename, renders Today/Settings/Forecast Integrity, uses hash routing, makes no
`fetch`/WebSocket call and has zero axe-core violations in the scanned empty
workspace. It cannot prove graphical rendering, real `localStorage` policy,
Web Crypto support, Blob downloads, browser-specific file-origin isolation,
spoken screen-reader output or manager comprehension in Chrome, Firefox or
Safari; those remain **[UNVERIFIED]**. The committed artifact is a build output:
regenerate it with `npm run build:standalone` after any canonical source change.

## 51. Natural-language intake triage: confidence-gated human-in-the-loop routing, on-device (Session 43 — Schema v27)

### What the 2026 market actually does

The 2026 competitive hunt focused on intelligent triage — the closest market category to
LeadOS's intake requirement — across ITSM, case management and HR/NLP privacy:

- **Confidence-threshold routing is the state of practice, not a differentiator.** Moveworks
  describes intelligent triage as inherently probabilistic: classifications and routing
  outcomes carry confidence scores, and low-confidence or ambiguous cases go to human
  reviewers or clarification flows rather than being forced through ([1](https://www.moveworks.com/us/en/resources/blog/what-is-intelligent-triage-it-support)).
  Elementum's 2026 roundup reports configurable AI-versus-human decision thresholds as a
  standard feature, with high-confidence routing autonomous and borderline cases escalated
  ([2](https://www.elementum.ai/blog/ai-tools-for-it-support-ticket-triage)).
- **The four uncertainty controls.** A widely cited 2026 practitioner synthesis recommends
  defining uncertainty with checks you control rather than the model's own confidence: a
  rule/validity check, a completeness check for thin inputs, an agreement check, and a
  stakes check that routes high-value labels to humans regardless of score — any one firing
  is enough ([3](https://www.pravinkumar.co/blog/how-to-route-low-confidence-ai-classifications-to-a-human-2026)).
  LlamaIndex's routing glossary uses 0.50/0.75 probability bands for escalation vs
  clarification vs autonomous handling ([4](https://www.llamaindex.ai/glossary/confidence-based-routing)).
- **Overrides are the training signal.** Iris Agent's 2026 playbook: teams approaching
  100% auto-triage track every manual re-route as feedback, start narrow (3–5 intents), and
  attach the AI's reasoning to every human fallback — "it never forces a wrong decision"
  ([5](https://irisagent.com/ai-ticket-automation/)). Public-sector case-management guidance
  prescribes weekly blind-review sampling with override-rate KPIs and pre-agreed rollback
  thresholds ([6](https://blog.primereadysub.com/blog/ai-for-case-management)).
- **Calibration beats decoration.** Regulated-workflow guidance (Nov 2025, still cited in
  2026): a confidence number is meaningless without calibration — "90% confidence is right
  roughly 90% of the time" — and field-level scores with audit trails outperform one
  document-level number ([7](https://www.multimodal.dev/post/using-confidence-scores-to-reduce-risk-in-ai-driven-decisions)).
- **LLM confidence is itself suspect.** An ICLR 2026 cascade paper found LLMs poorly
  calibrated and replaced naive confidence thresholding with explicit epistemic-risk
  estimates ([8](https://proceedings.iclr.cc/paper_files/paper/2026/file/51b3bf54f2a06c3c844b09d20b70eadb-Paper-Conference.pdf)).
- **HR text defaults to on-device/on-prem processing.** The FINDHR survey of NLP for human
  resources documents pervasive data-protection constraints and data-donation/anonymization
  as the standard research path ([9](https://arxiv.org/html/2410.16498v2)). 2026 products in
  client-side DLP (PrivacyScrubber's zero-egress browser processing) and hybrid medical
  triage (local phi-4-mini parsing behind a privacy gate) show the emerging architecture:
  sensitive parsing stays on the machine, only sanitized summaries cross a gate
  ([10](https://privacyscrubber.com/),
  [11](https://www.foundrylab.fr/hybrid-ai-lab-triage.html)).
- **Transparent classifiers still win well-defined classes.** A 2026 enterprise ITSM study
  (MDPI *Systems* 14(2):223) found logistic-regression classifiers reliable for
  high-frequency, well-defined requests while transformers only added real value on
  semantically overlapping, underrepresented classes — evidence that a transparent
  weighted-evidence scorer is defensible for operational leadership vocabulary.

### What LeadOS ships that the category does not

1. **On-device by architecture, not policy.** The triage engine is a pure ES module with no
   network API and no runtime dependency, so it runs identically in the served app and the
   double-clickable standalone HTML file. Employee text structurally cannot egress.
2. **Four uncertainty controls made explicit and visible:** completeness gate, top-1/top-2
   margin ambiguity flag, NegEx negation windowing, and a stakes check that forces human
   review on safety/legal/confidentiality markers — each surfaced in the UI with its reason.
3. **Every suggestion is evidence-linked.** Term weights, negated matches, sentence offsets
   and extraction spans are shown next to the label; softmax probabilities are shrunk toward
   uniform and labeled heuristic until the ledger can measure agreement empirically.
4. **A conflict privacy wall.** Interpersonal-conflict language never auto-creates a case
   or a graph link; the leader must open the confidential conflict workspace themselves,
   consistent with the existing `FORBIDDEN_LINK_TYPES` boundary.
5. **Routing lands in a real cross-module propagation engine.** A confirmed triage creates
   its case through the same validated `addCase` path as every other module, so DACI
   decisions, delegations, coaching, capacity reserves and stakeholder schedules propagate
   in parallel via the existing event-driven rules — no parallel glue code.
6. **An honest calibration ledger from day one.** RULE-INTAKE-07 measures *human agreement*
   (never mislabeled accuracy), counts only below n=5, and exports a data-minimized CSV with
   no free text — the override-as-training-signal discipline without a cloud training loop.

### Deliberately rejected

| Idea | Reason |
|---|---|
| Cloud LLM classification endpoint | Violates ADR-0006/0007 zero-network boundary and the offline standalone promise; HR/safety text would leave the device. |
| Auto-creating cases without a human confirm | Contradicts 2026 human-review thresholds and the product doctrine's human-accountable-owner requirement; the engine proposes, the leader disposes. |
| Calling softmax outputs "calibrated probabilities" | No empirical calibration exists at n=0; bands are labeled heuristic until RULE-INTAKE-07 agreement data exists (ICLR 2026 calibration warning). |
| Auto-resolving ambiguous first-name matches | Picking one of two "Priyas" silently invents an attribution; ambiguity is surfaced and excluded from auto-selection. |
| Storing raw notes in the calibration CSV export | Data minimization; the analytics export carries bands, categories and edit counts, never source text or dismiss reasons. |
| Training/finetuning a local model | No model runtime in the zero-build architecture; a transparent lexicon scorer is auditable, deterministic and testable, and 2026 evidence supports it for well-defined classes. |

### Boundaries

The engine is deterministic lexicon scoring, not semantic language understanding: novel
phrasing with no term overlap returns an honest *insufficient evidence* verdict instead of a
guess. Multi-word intent, sarcasm and non-English text beyond Danish number/currency
conventions are **[UNVERIFIED]** and mostly out of scope. The agreement ledger measures
acceptance, not truth; real classifier accuracy would need labeled outcomes the local-first
architecture deliberately does not collect.

## 52. Decision tempo: pricing the option to wait, and measuring the latency a leader actually has (Session 44 — Schema v28)

### The gap this session attacked

Every module in the product up to Session 43 modelled decisions that *get made*: DACI roles,
options, rationale, a review date, and (from Session 41) forecast integrity over their stated
probabilities. None of them modelled the far more common failure: the decision that is
deferred, re-deferred, and quietly paid for. The roadmap had named "decision-delay scenario
simulation (`what happens if I wait two weeks?`) with conformal bands and an auto-generated
board pack" as the next priority for two sessions. This is that terminal, plus the economics
that make it honest rather than rhetorical.

### Competitive / market findings (2026)

- **The cost is being quantified in public, which raises the bar for a vague tool.** A 2026
  vendor study puts the aggregate annual cost of enterprise decision delay at $630B across
  the Global 2000, combining Splunk/Oxford Economics *Hidden Costs of Downtime 2026*
  (~$600B of downtime, ~73% of it detection/triage/diagnosis rather than repair) with a
  3.5%-of-net-profit estimate for non-IT decisions
  ([1](https://przen.com/pr/new-research-puts-the-cost-of-enterprise-decision-delay-at-630-billion-year-across-the-global-2000-przen-33619058)).
  West Monroe's 2026 *Speed Wins* survey (214 C-suite, 1,000 managers, US firms ≥$250M
  revenue) reports nearly three in four leaders estimating up to 5% of annual revenue lost to
  slow decisions, and labels it the **"Slowness Tax"** ([4](https://blog.flowmono.com/the-approval-bottleneck-why-good-decisions-are-taking-too-long-inside-growing-businesses/)).
  Same survey, via CFO Dive: ~half the respondents estimate ≥4% of topline lost, 73% say
  halving decision time would add ≥5% revenue, and the leading causes are *"the need for more
  data or certainty"* followed by *"fear of risk and mistakes"*
  ([10](https://www.cfo.com/news/slow-decision-making-can-lop-off-a-significant-chunk-of-revenue/811298/)).
  That second-ranked cause is precisely what an EVSI calculation can price, and the first is
  what it can bound.
- **Category vendors still sell operational decisioning, not leadership tempo.** The 2026
  decision-intelligence market is sized at $17.4B (2025) → $20.7B (2026) at ~19% CAGR
  ([1](https://www.domo.com/learn/article/decision-intelligence-platforms)), and roughly
  $20.7B → $42.5B by 2030 in a parallel estimate
  ([17](https://www.researchandmarkets.com/reports/5896020/decision-intelligence-market-report)).
  The 2026 platform rankings are dominated by credit/claims decisioning and DecisionOps —
  FICO, SAS, IBM, ACTICO, Taktile, Pega, Decisions — with "decision modelling and
  orchestration" and "DecisionOps" as the two named architectural approaches
  ([4](https://marketintelligencetools.com/rankings/decision-intelligence-platforms/),
  [8](https://growthbusiness.co.uk/top-decision-intelligence-solutions-2584150/)). None of
  them models the *leader's* queue: what each unmade call costs per week, and whether the
  next week of evidence is worth more than the wait.
- **Decision-logging tools stop at the reminder.** A 2026 comparison of decision-logging
  software describes the "lightweight" tier as decision capture plus 30/90/180-day review
  reminders, explicitly noting that enterprise suites offer no confidence logging and that
  passive repositories (Notion, Confluence, Obsidian) "offer no structured templates, no
  reminder workflows for outcome reviews, no confidence tracking, and no pattern analysis"
  ([10](https://reflect-os.com/blog/decision-intelligence-software-guide)). There is no
  cost-of-delay rate, no information-value curve and no measured latency anywhere in the
  category.
- **Decision latency is becoming a named operational metric.** 2026 practitioner writing
  proposes benchmarks such as *time to first decision* (<24h tactical), *approval cycle
  time* (<2 days), and *revised-decision frequency* (<15%)
  ([3](https://www.ai-infra-link.com/how-latency-shapes-product-decisions-in-2026-key-insights/)),
  and a 2026 self-report instrument — the **Decision Latency Scale** — was proposed to
  measure "the elapsed time and behavioral friction between recognizing a problem and
  committing to a defensible course of action"
  ([9](https://nutsaboutleadership.wordpress.com/2026/07/28/decision-latency-scale/)). Both
  stop at self-report or process timestamps; neither prices the delay against the decision's
  own value at stake.
- **The binary 70% rule keeps being cited without arithmetic.** A 2026 Forbes column repeats
  the widely taught heuristic that a leader should decide at ~70% of desired information and
  argues that reversible decisions deserve a lighter process
  ([5](https://www.forbes.com/sites/markmurphy/2026/03/10/slow-executive-decisions-cost-more-than-wrong-ones/)).
  It is good advice with no way to check it against a specific decision. EVSI is the
  arithmetic behind the heuristic: it says *when* the next unit of evidence stops paying for
  the waiting it requires.
- **Agentic decisioning is arriving, which makes a tempo ledger more valuable, not less.**
  Gartner projections cited in the 2026 practitioner press: 15% of day-to-day work decisions
  made autonomously by agentic AI by 2028 (from ~0 in 2024), 40% of enterprise applications
  carrying task-specific agents by end-2026, and 65% of C-suite decisions AI-augmented by
  2026 ([2](https://superkind.ai/blog/decision-latency),
  [15](https://stealthagents.com/research/executive-decision-making-statistics-2026)). As
  routine decisions get delegated to or drafted by agents, the scarce human judgment is
  exactly the timing and framing of the decisions that remain — which is what this terminal
  records.
- **Statistical honesty matters more than another dashboard percentage.** The 2026 market is
  full of unqualified "decision scores". The engineering literature LeadOS already uses —
  split-conformal coverage bounds and exact sign tests (Session 41) — gives a defensible
  alternative: show a coverage bound and suppress the number below n = 5.

### The economics this terminal implements, named explicitly

| Framework | Source | Where it lives in the code |
|---|---|---|
| **Cost of delay / CD3** | Reinertsen, *The Principles of Product Development Flow* (2009); CD3 = cost of delay ÷ duration (Black Swan Farming / Arnold); four delay profiles | `delayCostAt`, `derivedRatePerWeek`, `decisionCd3` |
| **Preposterior analysis / EVSI** | Raiffa & Schlaifer, *Applied Statistical Decision Theory* (1961); EVPI ≥ EVSI; ENGS = EVSI − sampling cost | `expectedValueOfInformation`, `posteriorMeanSpread`, `switchProbability` |
| **Option to wait / real options** | Dixit & Pindyck, *Investment under Uncertainty* (1994) | `evaluateDecisionTiming` (net = EVSI − carrying cost − evidence cost) |
| **Decision taxonomy and tempo** | McKinsey, *Decision making in the age of urgency* (2019) — delegated, cross-cutting, big-bet; ~37% of decisions both fast and high quality | `classifyDecisionType`, `guardrailDaysFor`, RULE-DLY-05 |
| **Conformal latency band** | Vovk et al. split conformal; order statistic k = ⌈(n+1)·coverage⌉ | `latencyBand`, `latencyByDecisionType` |
| **Blameless escalation** | Deming / systems thinking; McKinsey ↔ Google re:Work psychological-safety evidence already used in the coaching modules | RULE-DLY-02 delegation copy |

### What LeadOS ships that the category does not

1. **A per-decision price for waiting, derived from records the app already holds.** The
   value at stake is assembled from typed graph links — PERT case exposure, encumbered budget
   lines, portfolio value, negotiated stakes — split by currency and never summed across
   them. A decision with nothing linked is labelled *unpriced*, not priced at zero.
2. **The counterweight, not just the alarm.** A full delay curve with EVSI, carrying cost,
   evidence cost and net value of waiting, sampled at 0/3/7/14/30/60 days, plus the optimal
   horizon and the switch probability. This is the first time a leadership tool shows the
   *case for waiting* next to the case for deciding, on the same axis, for a specific
   decision.
3. **Measured, not assumed, latency.** `decidedOn` is stamped when the call is recorded;
   the class band is an empirical conformal quantile with a finite-sample coverage bound,
   counts-only below five samples, and legacy decided records stay unmeasured forever.
4. **A commitment firewall.** Automation proposes a timebox and derives the money; it never
   arms one and never records the believed edge or the uncertainty on the leader's behalf.
   One click pauses all automatic tempo writes without disabling the read-side model.
5. **Class-level governance instead of nagging.** When a decision *class* breaches its own
   measured p80, exactly one DACI decision is opened with four real options (timebox at the
   measured p80, delegate the class, add a standing evidence plan, or accept the tempo). The
   engine never re-times an individual's recorded date.
6. **A board brief that is arithmetic, not adjectives.** Deterministic text with position,
   highest cost of delay, where waiting is already losing, what the empirical band says and
   what is unmeasured — copyable, downloadable, and generated without a network call.
7. **Data-minimised export.** CSV scope #28 carries timing economics (CD3, rates, EVSI,
   verdicts, bands) and zero titles, rationale, notes or names, so tempo can be audited
   without exporting the substance of the calls.

### Deliberately rejected

| Idea | Reason |
|---|---|
| Auto-arming timeboxes at a CD3 threshold | Arming is a commitment the leader owns; the engine cannot know the edge or the risk appetite (see ADR-0011). |
| Monte Carlo for the wait decision | The normal/normal preposterior has an exact closed form; simulation would add variance to a number the leader will be asked to defend. |
| Using `reviewedOn` or the logged date as a proxy for the decision moment | That fabricates latency evidence; unmeasured stays unmeasured. |
| FX conversion to compare currencies | No honest rate source exists offline; currencies stay separate and only the dominant one drives the model. |
| A per-person decision-velocity score | Turns a systemic symptom into a performance rating; the band is a class-level planning range. |
| Blending in the confidential conflict or pulse data | Existing privacy walls; the engine reads only decisions, links, cases, budgets, portfolio and negotiations. |

### Boundaries

The economics assumes a two-option normal/normal preposterior: multi-option decisions are
modelled as leading-vs-runner-up, and a skewed or heavy-tailed payoff distribution is
**[UNVERIFIED]** against this closed form. Carrying-cost rates are conventions unless a rate
is recorded; the cap at value-at-stake is a modelling choice, not a forecast. Latency bands
are exchangeable-class planning ranges: a workspace whose decision mix changes materially
will have a band that lags reality until new settlements arrive. The board brief is
deterministic text, not an LLM narrative, and it deliberately avoids claims about causality
between speed and outcome quality.

---

## 53. Operational Resilience, Dependency Topology & Continuity Calibration (Session 45)

### Cross-domain theoretical synthesis

1. **Production, Operations & Supply-Chain Risk — Simchi-Levi `TTS` / `TTR` / `REI`:**
   Simchi-Levi, Schmidt & Wei (HBR 2014; *Operations Research* 2015; Gao, Simchi-Levi, Teo & Yan, *Operations Research* 2019; Purdue Business June 2026) replace subjective likelihood-by-impact grids with measurable temporal buffers: **Time-to-Survive ($\text{TTS}_j$)** (how long downstream operations can run before impact tolerance breaks) vs. **Time-to-Recover ($\text{TTR}_j$)** (time to restore full capability or cut over to a warm standby). Performance impact accrues over the unbuffered survival shortfall $\Delta_j = \max(0, \text{TTR}_{\text{eff},j} - \text{TTS}_j)$, normalized within each currency cohort into the **Risk Exposure Index $\text{REI}_j = \text{PI}_j / \max_k \text{PI}_k \in [0, 1]$**. Low-spend sole-source nodes routinely carry higher REI than high-spend diversified vendors.
2. **Engineering & Systems Thinking — Directed Cascade Topology & Bus Factor:**
   - **Avelino Minimal Hitting-Set Bus Factor** (Avelino et al., ICPC 2016; Jabrayilzade et al., 2022; *Information Sciences* Mar 2026): models human knowledge concentration as the smallest cut-set of active personnel whose simultaneous unavailability leaves $\ge 50\%$ of critical/important capabilities with zero verified stewards.
   - **Multi-Tier / Nth-Party Cascades** (RiskLedger *Every Link Matters 2026*; DEMATEL RTII, *Applied Sciences* Mar 2026): 35%–45% of concentration risk sits in shared sub-tier dependencies beyond Tier-1 vendors, while only 30% of TPRM teams have sub-tier visibility. Propagating effective outage durations across a cycle-checked DAG exposes common-mode upstream initiators and sub-tier choke points ($\text{depth} \ge 2$).
3. **Economics & Antitrust — Herfindahl-Hirschman Index (`HHI`) & Williamson Hold-Up:**
   - **Supplier & Stewardship Concentration (`HHI`):** $\text{HHI} = \sum_i s_i^2$ on percentage shares ($0\text{–}10{,}000$; US DOJ/FTC & OECD Supply Chain Resilience Review 2025: $<1{,}500$ unconcentrated, $1{,}500\text{–}2{,}500$ moderate, $>2{,}500$ high), paired with top-1 concentration $\text{CR}_1$.
   - **Transaction-Cost Hold-Up** (Williamson, *The Economic Institutions of Capitalism*, 1985): asset specificity + sole-source lock-in + $\text{TTR} > \text{TTS}$ + missing exit strategy gives suppliers structural bargaining power at renewal.
4. **MBA / Corporate Strategy & Regulation — EU DORA Art. 11, 26 & 29:**
   EU Digital Operational Resilience Act (in force Jan 2025; ESA critical ICT third-party oversight active 2025–2026; CRO Forum June 2026) mandates mapping Critical or Important Functions (CIFs), assessing ICT concentration and substitutability, documenting exit strategies (Art. 28/29), and proving recovery within impact tolerances via scenario drills rather than paper assertions (Art. 26).
5. **Finance & Capital Allocation — Redundancy Payback & Expected Loss Avoidance:**
   Evaluates annual expected disruption loss $p \times \text{BlastExposure}$ against `mitigationCost` to surface net annual benefit and ROI multiple without fabricating probabilities or FX conversions.
6. **Political Science & Bargaining — External Veto Gatekeepers & Renewal Leverage:**
   Connects sole-source vendor dependencies directly to `#/negotiations` (`RULE-RES-04`) and external `#/stakeholders` (Tsebelis veto players) so renewal prep accounts for real switching shortfalls before conceding commercial terms.
7. **Mathematics & Statistics — Distribution-Free Split-Conformal Drill Calibration:**
   Applies split-conformal prediction (`conformalBand` at 80% target coverage, finite-sample bound $\lceil (n+1)(1-\alpha)\rceil / (n+1)$, plus exact two-sided `ratioSignTest`) to `realizedTtrDays / estimatedTtrDays` across continuity drills and live incidents, strictly refusing quantiles below $n = 5$ paired observations.

### 2026 competitive landscape benchmark

| Category & 2026 Entrants | What they do well | Where they fall short for a manager | How LeadOS Session 45 Leapfrogs |
|---|---|---|---|
| **Enterprise Resilience Decision Systems (ERDS) & GRC** — Fusion Risk Management ERDS (Aug 2026), Archer, ServiceNow Operational Resilience, MetricStream | Map enterprise services, impact tolerances, and compliance registers for regulated financial institutions. | $100k+/yr enterprise deployments; disconnected from 1:1 coaching, team capacity, blameless cross-training delegations, and Cost-of-Delay decision timing. | Zero-setup local-first terminal connecting `TTS`/`TTR`/`REI` directly to People, Capacity, Delegations, Negotiations, Cases, and Decision Tempo (`RULE-RES-01..06` -> `RULE-DLY-03`). |
| **TPRM & Sub-Tier Network Tools** — RiskLedger (2026), Vendorica, Prevalent, Bitsight | External vendor security ratings and Nth-party supplier graph discovery. | Blind to *internal* human Bus Factor, team capacity contention on surviving backups, and internal platform runbooks. | Unifies internal human stewards, systems, processes, and multi-tier vendors in one DAG with per-currency HHI and Williamson hold-up scoring. |
| **Software Engineering Intelligence (SEI)** — Jellyfish (Oct 2026 AI Impact), Swarmia (Oct 2026), LinearB, Worklytics, Zoe Diagnostics | Git commit concentration, PR cycle times, and AI coding adoption telemetry ($15–$62/dev/mo SaaS). | Cloud surveillance model; equates commit volume with operational continuity and ignores vendor lock-in, financial blast exposure, and scenario drill calibration. | Strictly private, zero-network, blameless stewardship model with an explicit human verification firewall (`verifiedOn`) and conformal drill TTR calibration. |

### Shipped in code (`app/core/domain/resilience.js`, `app/views/resilience.js`, Schema v29)

- **Read-side signals (`RES-01..07`):** `RES-01` critical human SPOF (`busFactor <= 1`), `RES-02` unbuffered survival shortfall (`effectiveTtr > tts`), `RES-03` sub-tier / common-mode upstream choke point (EU DORA Art. 29), `RES-04` high vendor concentration (`HHI > threshold`) or high Williamson hold-up (`score >= 60`) near renewal, `RES-05` untested or stale continuity drills beyond `resilienceDrillDays`, `RES-06` optimistic recovery-time bias (`median realized/estimated TTR >= 1.25x` at $n \ge 5$), `RES-07` critical/important capabilities with unmeasured `TTS` or `TTR`.
- **Post-commit cross-module rules (`RULE-RES-01..06`):**
  - `RULE-RES-01`: maintains typed graph edges (`depends-on`, `stewards`, `impacts-goal`, `funds`, `negotiates`, `involves`, `consumes-capacity`) and refreshes `derivedDailyImpact` on $\ge 20\%$ linked drift.
  - `RULE-RES-02`: critical non-vendor SPOF (`busFactor <= 1`) opens one blameless cross-training `Delegation` and queues a load-protection 1:1 talking point.
  - `RULE-RES-03`: critical survival shortfall (`TTR > TTS`) opens one DACI continuity trade-off `Decision` which chains atomically into `decisionTempoRule` (`RULE-DLY-03`) in the same write.
  - `RULE-RES-04`: high hold-up vendor appends renewal leverage warning to linked `Negotiation`.
  - `RULE-RES-05`: breached continuity drill shifts underpinned `Goals` to `at-risk` and opens a linked remediation `Operational Case`.
  - `RULE-RES-06`: completing a cross-training delegation records audit history without auto-fabricating `verifiedOn`.

### Deliberately rejected

- **Paper-backup Bus Factor inflation:** Unverified backups (`verifiedOn: null`) and `trainee` shadows remain `inTraining` and never raise Bus Factor.
- **Auto-verifying backups on delegation completion:** Task completion is not proof of solo failover capability.
- **Cross-currency summation:** HHI and REI stay strictly partitioned by ISO currency.
- **Individual SPOF "risk grades" in performance reviews:** Being a sole steward is an org-design gap, never a performance penalty.

---

## 54. Coalition & Incentive War Room: computational political economy for a first-time leader (Session 46 — Schema v30, 2026-10-27)

### The question no existing tool answers

A first-time manager's hardest problem is not a dashboard — it is a *political* one: "Given who
holds power and how everyone is incentivised, will my preferred outcome actually hold, and what
do I say to the person who can block it?" This session hunted the 2026 market across
decision-intelligence platforms, organisational-network-analysis (ONA) tools, AI-coaching
products, and the academic state of the art in cooperative game theory and mechanism design, to
find who answers it. None do — and the gap is structural, not incremental.

### 2026 competitive landscape benchmark

| Category & 2026 entrants | What they do well | Where they fall short for a manager | How LeadOS Session 46 leapfrogs |
|---|---|---|---|
| **Decision-intelligence platforms** — IBM Decision Intelligence (2026 Gartner MQ Leader / IDC MarketScape Leader), Aera Decision Cloud, Palantir Foundry/AIP, Quantexa, Tellius, Sisu/Pecan, Nected, Dot | Composite AI (rules + ML + GenAI), agentic orchestration, decision logs, explainability, governed "decision models from policy text". [IBM](https://www.ibm.com/products/decision-intelligence) · [bteanalytics/Aera-Palantir](https://bteanalytics.co/knowledge/what_are_the_best_decision_intelligence_platforms_in_2026_and_how_do_i_choose_one_for_my_team.php) · [getdot.ai 2026 list](https://www.getdot.ai/blog/decision-intelligence-software) · [Domo comparison](https://www.domo.com/learn/article/decision-intelligence-platforms) · [Neuroscale 2026](https://www.neuroscale.ai/blog/best-ai-decision-intelligence-platforms-2026) · [StartupStash Aera](https://startupstash.com/top-decision-intelligence-platforms/) | They reason over **warehouse/graph data and business rules** — not over the *power dynamics and incentives of a specific human decision*. Enterprise-priced, cloud, need data engineering; none compute a voting-power index or a Nash equilibrium for a leader's coalition. | Local-first, zero-setup, reasons over the leader's own stakeholder/payoff model with exact math, and **propagates the verdict into DACI decisions, delegations and 1:1s** — the human workflow, not just an analytic output. |
| **Organisational Network Analysis (ONA)** — Worklytics, Microsoft Viva Insights, Humanyze, Time is Ltd. | Passive collaboration-graph mapping from M365/Slack/Google signals; centrality, AI-adoption analytics. [Worklytics 2026](https://www.worklytics.co/blog/best-organizational-network-analysis-tools) · [Microsoft Viva](https://learn.microsoft.com/en-us/viva/microsoft-viva-overview) | Maps who *talks* to whom; does **not** compute Banzhaf/Shapley-Shubik voting power, veto players, minimum winning coalitions, or which outcome is incentive-compatible. Survey/surveillance-adjacent, no coaching script. | A formal **weighted voting game** with exact power indices and Tsebelis veto-player theory, plus a mechanism-design transfer — opinionated math a first-time leader can act on. |
| **AI leadership coaching / role-play** — BetterUp Grow, Skillsoft CAISY, Tough Tongue AI, Valence (Nadia), Coachello, Microsoft Copilot learning-agent role-plays (2026) | LLM conversation practice for difficult feedback/conflict, nudges in the flow of work, whole-person models. [Growthspace 2026](https://www.growthspace.com/blog/best-ai-leadership-coaching-platforms) · [Tough Tongue AI comparison](https://www.toughtongueai.com/blog/executive-coaching-llm-feedback-conversations-comparison/) · [Cloverleaf 2026](https://cloverleaf.me/blog/best-ai-coaching-platforms-for-managers-and-teams/) · [BetterUp Grow](https://www.betterup.com/products/betterup-ai-coaching) · [HR Digital Digest 2026](https://www.hrdigitaldigest.com/manager-coaching-ai-tools/) | Generate scripts generically; explicitly criticised for having **"no visibility into team dynamics, meeting context, or real conversation patterns"** and for being hard to measure. Cloud LLM, non-deterministic, no exact numbers. | The influence script is **deterministic and grounded in the computed equilibrium and power indices** for *this specific* conflict — auditable, testable, offline, and labelled as template generation, not an LLM. |
| **Academic power-index & mechanism-design tooling** — `pouvoir-de-coalition` (Z3-verified Shapley-Shubik/Banzhaf, 2026), InfluenceNet (ML Banzhaf/Shapley prediction, 2025), adaptive-Banzhaf veto-distortion (2026), MIT/Duke/CMU game-theory courses, VCG/Clarke tax, revelation principle | Rigorous exact indices, formal verification, implementability theory. [InfluenceNet arXiv 2503.08381](https://arxiv.org/html/2503.08381v1) · [pouvoir-de-coalition GitHub](https://github.com/kaelag/pouvoir-de-coalition) · [adaptive Banzhaf 2026](https://jamie.tuckerfoltz.com/Papers/2026-07-PropensityBanzhaf/main.pdf) · [Shapley–Shubik](https://en.wikipedia.org/wiki/Shapley%E2%80%93Shubik_power_index) · [mechanism design](https://en.wikipedia.org/wiki/Mechanism_design) · [IC roadmap arXiv](https://arxiv.org/html/2402.12907v3) · [MIT 6.254](https://ocw.mit.edu/courses/6-254-game-theory-with-engineering-applications-spring-2010/) | Research code / pedagogy — no manager-facing product, no cross-module automation, no coaching script. A "Claude Nash Equilibrium skill" exists as an LLM prompt ([skillsdirectory](https://www.skillsdirectory.com/skills/deciqai-nash-equilibrium)), not a computational engine. | Ships the exact algorithms to a non-technical leader in a premium UI **and** wires them into an event-driven rules spine — the first product to do both. |

### The gap, stated bluntly

The best decision-intelligence platforms treat decisions as first-class *data objects* but not as
*strategic games among people*. ONA maps networks but not formal voting power. AI coaches write
scripts but without any model of team dynamics. Exact game theory and mechanism design exist only
in academia. **No tool combines (a) exact cooperative power indices, (b) 2×2 Nash equilibria,
(c) mechanism-design incentive alignment, (d) robustness-scored recommendations, (e) a
deterministic influence script grounded in the analysis, and (f) atomic cross-module propagation
that turns the analysis into decisions, delegations and 1:1 conversations.** Session 46 ships all
six.

### Frameworks implemented (named, not vague "best practice")

- **Cooperative game theory:** Banzhaf power index (Banzhaf 1964; exact 2ⁿ coalitions),
  Shapley–Shubik power index (Shapley & Shubik 1954; exact n! orderings), Riker minimum winning
  coalitions (Riker 1962), Tsebelis veto players (Tsebelis 2002), dummy/dictator detection,
  Penrose/Banzhaf power concentration (an HHI-style Σβ²), capped at n=8 for exact enumeration.
- **Non-cooperative game theory:** pure & mixed Nash equilibria (Nash 1950), strictly dominant
  strategies, Pareto efficiency, price of anarchy (Koutsoupias–Papadimitriou 1999;
  Roughgarden–Tardos 2002), coordination loss / price of stability.
- **Mechanism design:** minimal transfer for Nash incentive compatibility (Hurwicz 1960;
  Myerson 1979; revelation principle, DSIC), with an explicit feasibility/headroom bound —
  honestly scoped to a single-outcome transfer, NOT a full VCG mechanism.
- **Decision quality:** an equilibrium robustness margin (distance to a best-response boundary)
  combined with declared estimate confidence — confidence-weighted advice per the decision-
  intelligence literature's emphasis on guardrails and human override.

### Shipped in code (`app/core/domain/power.js`, `app/views/power.js`, Schema v30)

- **Pure engine:** `computeBanzhafIndices`, `computeShapleyShubik`,
  `minimumWinningCoalitions`, `analyzeVotingPower`, `solveNormalForm`, `incentiveAlignment`,
  `equilibriumRobustness`, `powerConfidence`, `analyzePowerGame`, `buildInfluenceScript`,
  `buildPowerBrief`, `buildPowerReport`, `powerSignals`, `powerRule`.
- **Post-commit rules (`RULE-PWR-01..06`):** typed links + derived telemetry; blocked coalition
  → one DACI decision (chained into Decision Tempo); misaligned target → one blameless delegation
  + 1:1 talking point; coordination risk/fragility → one estimate-verification 1:1 prompt;
  settlement → append-only calibration history; read-side signals + pause switch.
- **Signals (`PWR-01..06`):** coalition blocked, misaligned target, no pure equilibrium, fragile
  equilibrium, dummy ally, stale/low-confidence read.
- **Integration:** `power` graph entity type, `powerGames` collection, v29→v30 additive
  migration, `normalizePowerGames` repairs, `entityIdSetsForLinks`/`clearDemo` parity,
  `reconstructStateAt` rewind, CSV scope #30 (counts only), 5-tab UI + `#/power/:id` dossier,
  Today card, nav badge, Settings posture row.

### Deliberately rejected

- **LLM-generated strategy advice as the core:** non-deterministic, needs a network/backend
  (violates local-first), untestable, fabricates numbers. A future *optional* on-device narrative
  layer could sit on top, but the engine of record stays exact and auditable.
- **Auto-syncing game stances from the stakeholder register:** situational estimates must never
  be silently overwritten by a general register default ("never overwrite human inputs").
- **Full N-player general-sum / VCG mechanism:** exact 2×2 + single-transfer scope is solvable,
  explainable and useful to a novice; deferred to the roadmap.
- **Heuristic power scores:** exact enumeration is cheap for n≤8 and defensible.
- **Trusting game-theoretic outputs as predictions:** all payoffs are labelled as the leader's
  estimates on an arbitrary scale; robustness/confidence bands are management conventions, not
  statistical guarantees.

## 55. Robust Strategy Lab — 2026-10-27 / Session 47

### Fresh competitive hunt (web excerpts retrieved this session)

- **Cloverpop** describes zero-code decision playbooks, living knowledge graphs and
  asynchronous human/agent decision records. Benchmark: reasoned choices should flow
  into a persistent decision, not a disconnected report.
  [3](https://www.cloverpop.com/decision-intelligence-platform)
- **Valence Nadia** markets personalised coaching at enterprise scale; its performance
  page reports an observational association between heavy usage and performance-band
  improvement. This is vendor evidence, not independently verified causality, and is
  not a basis for scoring an employee in LeadOS.
  [6](https://www.valence.co/performance-management)
- **Lattice / Workday Peakon / BetterUp Grow:** fresh secondary-source inventory covers
  performance/OKRs, sentiment-derived manager talking points, and hybrid AI/human
  coaching. These are market-discovery leads, not hands-on product verification.
  [1](https://hraitoolskit.com/articles/best-ai-performance-management-tools-2026/)
  [2](https://www.boon-health.com/learn/resources/best-ai-coaching-platforms)
- **Succession / predictive people analytics:** an independent buyer guide describes
  Workday's predictive retention and succession positioning; competitor Engagedly
  describes Lattice succession integrated with calibration. Product efficacy and
  current availability [UNVERIFIED]; avoid treating individual forecasts as facts.
  [7](https://www.viewpointanalysis.com/post/hr-ai-software-options-2026)
  [8](https://engagedly.com/blog/best-succession-planning-softwares/)

### Underused framework selected and implemented

The US Climate Resilience Toolkit describes DMDU as seeking confidence in a decision
rather than a particular model, using stress tests to find failure conditions.
[4](https://toolkit.climate.gov/course-lesson/decision-making-under-deep-uncertainty)
A 2025 framework comparison distinguishes robustness metrics (satisficing/regret)
from vulnerability/scenario-discovery analysis.
[2](https://www.sciencedirect.com/science/article/pii/S1462901125002412)

**Gap:** the existing War Room computed nominal equilibria and one nominal concession,
plus a heuristic fragility score. It did not test whether the same concession remained
feasible under a leader-declared uncertainty set, or expose opposing robust criteria.
**Choice:** extend the existing model and propagation rather than add another register.
No claim that LeadOS is first in the market; no paid competitor hands-on evaluation.

**Implementation:** independent additive ±d bounds on all eight payoff values, without
clipping, no sampling and no probability distribution. With leader target slack L and
counterparty slack R, a fixed nonnegative target-only transfer requires
`max(0, -R + 2d) <= t <= L - 2d`. Its feasibility break point is
`min(L/2, (L+R)/4)` when nominally feasible. Target Nash guarantee requires
`min(L,R) >= 2d`. Savage pure-strategy worst regret is the largest alternative-row
advantage under the same response plus `2d`, floored at zero. Wald security is the
row's minimum payoff minus `d`. A separate fixed-electorate stress test flips each
non-opposed stakeholder to opposition. These are conditional model guarantees, not
confidence intervals, calibrated probabilities or predictions of human behaviour.

**Converted into shipped automation:** stress failure enters derived verdicts and
PWR-07 insights, extends RULE-PWR-02 DACI creation and RULE-PWR-04 owner verification,
and changes influence scripts and exported briefs. Exact box formulas independently
checked against every corner for 40 deterministic matrices × four target cells.

**New backlog:** correlated uncertainty, mixed-policy minimax, adaptive signposts and
explicit non-transferable-utility safeguards. **Rejected:** pass-rate probabilities,
inferred uncertainty magnitudes, automatic concessions and personnel ratings.

---

## 56. Influence Network Intelligence — surveillance-free ONA from the leader's own records (Session 48, 2026-10-27)

**Fresh competitive hunt (2026-10-27, first time these sources inform a session).**
The 2026 people-analytics / decision-intelligence market has converged on
"predictive + prescriptive + explainable", but the organisational-network half
is either surveillance-based or cloud/enterprise-priced:

- **SAS Intelligent Decisioning** (IDC MarketScape press release, 2026-09-01,
  https://www.sas.com/en_in/news/press-releases/2026/september/intelligent-decisioning-idc-marketscape.html)
  explicitly sells a *hybrid* of deterministic rules + predictive/prescriptive
  analytics + GenAI in ONE governed flow, with data-to-decision lineage,
  versioned audit trails and model cards (bias/sensitivity). This is the
  strongest benchmark for "explainable, auditable, defensible" hybrid
  decisioning — and exactly the posture LeadOS's post-commit rules spine
  (ADR-0008) already embodies, now extended to structural graph decisions.
- **AI-native people analytics platform guides** (Knowlee 2026 buyer's guide,
  https://www.knowlee.ai/blog/people-analytics-platform-guide; Workhuman 13
  best tools 2026, https://www.workhuman.com/blog/people-analytics-software/;
  Windmill/One Model/Visier/ChartHop comparison,
  https://gowindmill.com/resources/lists/top-ai-people-analytics-tools-early-stage-companies/)
  describe Workday People Analytics (Illuminate AI, Skills Cloud), SAP
  SuccessFactors (Joule + Talent Intelligence Hub), Visier (Vee NL queries,
  25,000+ orgs, prescriptive analytics), ChartHop (live org model), One Model
  (explainable predictive modeling) and **Windmill**, which builds ONA "from
  work tools/conversations". Phenom acquired Included (agentic people
  analytics) in 2026. **Gap:** these infer networks from communication
  telemetry or require a cloud data warehouse; none is a free, instant,
  local-first tool a first-time leader can use without HRIS integration.
- **State of People Analytics 2026** (PeoplePilot, 2026-10-01,
  https://www.peoplepilot.io/blog/state-of-people-analytics-2026) reports a
  demand/deployment gap: manager-effectiveness analytics wanted by 70%+ but
  deployed by ~20%; predictive attrition 75%/~25%; engagement→outcome 60%/~15%.
  Betterworks/SHRM 2026 (https://www.betterworks.com/magazine/how-ai-is-transforming-hr-the-future-of-people-analytics)
  found 87% of CHROs forecast greater AI adoption but most orgs use AI for
  isolated tasks rather than an integrated predictive intelligence layer.
- **Analytical-rigor sources** (AIHR Institute worked precision/recall example,
  https://www.aihr-institute.com/people-analytics-in-2026-from-reporting-dashboards-to-predictive-workforce-models;
  PlotStudio, https://www.plotstudio.ai/articles/predictive-analytics-platform;
  Pecan/DataRobot, https://www.pecan.ai/blog/predictive-analytics-tools/;
  Neuroscale decision-intelligence comparison,
  https://www.neuroscale.ai/blog/best-ai-decision-intelligence-platforms-2026;
  BTE Analytics, https://bteanalytics.co/knowledge/what_are_the_best_decision_intelligence_platforms_in_2026_and_how_do_i_choose_one_for_my_team.php;
  Viewpoint Analysis, https://www.viewpointanalysis.com/post/hr-ai-software-options-2026)
  all stress time-based validation, calibration, subgroup performance, feature
  contributions for explainability (EU AI Act), and a red flag on "a single
  accuracy number without validation context". Palantir/Aera/Infoveave are
  priced $250K–multi-million per year.

**Honest positioning.** No claim that LeadOS is first to market, and no paid
competitor was evaluated hands-on (secondary sources only, [UNVERIFIED] beyond
the cited pages). LeadOS does NOT do predictive attrition, sentiment inference,
or communications surveillance — it cannot (and should not) without violating
its local-first/privacy premise. What it CAN do, that the enterprise tools do
not offer a first-time manager for free, is compute **exact, reproducible
network structure from records the leader already owns** and fuse it with the
succession/continuity Bus Factor the app already models.

**Frameworks converted to code this session (`app/core/domain/orgNetwork.js`).**

- **Newman (2001) / Latapy–Magnien–Del Vecchio (2008) bipartite co-affiliation
  projection:** people are linked when they co-appear in a shared work context
  (case, decision, delegation, goal, change, negotiation, dependency, war-room
  game, typed link). Edge weight = number of distinct shared contexts. No
  self-edges; confidential conflict/pulse endpoints are excluded (privacy).
- **Relative strong-tie backbone (this session's modelling choice):** raw
  co-affiliation over many contexts tends toward a complete graph that hides
  structure. A tie must be at least `networkTiePct`% (default 50) as strong as
  the strongest tie. This is a leader-configurable *visualisation threshold*,
  not fabricated data; `networkTiePct = 0` shows every real tie. Documented as
  a management convention, not a statistical law.
- **Freeman (1978/1979) degree & betweenness centralization; Brandes (2001)
  betweenness** (O(V·E), normalised by (n-1)(n-2)/2); **Wasserman–Faust
  normalised closeness** for disconnected graphs; **Page/Brin/Motwani/Winograd
  (1999) weighted PageRank** (damped power iteration) as "influence";
  **Watts–Strogatz (1998) weighted local clustering**; **Burt (1992) network
  constraint** c_ij = (p_ij + Σ_q p_iq·p_qj)² for structural holes (low
  constraint = brokerage); **Tarjan articulation points & bridges** (single
  points of connection); **Latora–Marchiori (2001) global efficiency**
  (Σ 1/shortest-path over all pairs) for the **node-removal key-person stress
  test** — a deterministic what-if on the recorded graph, not a prediction.
- **Simchi-Levi continuity Bus Factor fusion (extends §53):** a structural
  key-person is a load-bearing broker who is ALSO the primary steward of
  operational dependencies without a verified backup. This fuses network
  science with the resilience ledger already shipped in Session 45.

**Converted into shipped automation.** `RULE-ORG-01..05` run inside the store
transaction (ADR-0008) on a network scan or any event declaring
`rules:['network']`: they reconcile typed person↔person collaboration links
(01), open a blameless cross-training delegation + 1:1 prompt for a structural
key-person (02), open a DACI org-design decision for a fragmented team (03),
and queue blameless 1:1 check-ins for isolates (04) and over-loaded brokers
(05) — with idempotent markers and self-cleaning prompts. Read-side
`ORG-01..05` signals feed `buildInsights`, the Today triage card and the nav
badge continuously. CSV scope #31 exports only dimensionless scores and
integer counts keyed by an opaque node index — no names, titles or free text.
All findings are blameless: a structural position is a fact about the recorded
work graph, never a rating of a person.

**Deliberately rejected (recorded, not silently dropped).** Predictive attrition
or turnover probability, sentiment/emotion inference, reading email/chat/
calendar telemetry, scoring/ranking employees, inferring tie strength from job
titles, and any claim that these centralities predict behaviour or performance.
Below `ORG_MIN_TEAM = 2` active people the network is reported as unmeasurable,
counts-only, never a fabricated zero. "Parallel propagation" = multi-target
fan-out in one atomic transaction, not CPU parallelism.

**Verification.** `tests/app/org-network.test.mjs`: exact Brandes/Freeman on
path/star/complete graphs, PageRank summing to 1, Burt constraint 1/k on a
star, Tarjan bridges, node-removal efficiency loss, purity (no state mutation),
idempotent atomic fan-out, pause semantics, self-cleaning prompts, CSV
data-minimisation (no leaked names), and JSDOM+axe across all five tabs.
Full-gate results in the session log.

---

## 57. The Impact Ledger — pre-registered, placebo-checked evaluation of a leader's own interventions (Session 49, 2026-10-27)

### 57.1 The market gap, restated with 2026 evidence

The people-analytics market in 2026 remains arranged around **describing** and
**predicting**, not around **testing**. Three observations, each drawn from
sources read this session:

1. **Practitioner roadmaps still stop at "pilot a predictive model."** The 2026
   people-analytics guides describe four maturity levels — descriptive,
   diagnostic, predictive, prescriptive — and place causal evaluation, if they
   place it at all, in a footnote: *"test interventions using A/B or
   quasi-experimental designs"* (MIHCM, *Predictive HR analytics: ultimate
   guide 2026*, Jan 2026). The measurement advice is real; the product that
   executes it is not.
2. **The research literature says the missing ingredient is causal evidence.**
   A July 2026 review in *IJRSI* closes by naming what people analytics needs
   next: *"firmer theory, causal evidence rather than correlational snapshots,
   governance frameworks built for algorithmic and AI-enabled HRM, and more
   attention to how employees themselves experience being analysed."* That is a
   near-exact description of what no HRIS ships.
3. **The CIPD's evidence-based-HR guidance states the three conditions for a
   causal claim explicitly** — association, temporality, and no other
   explanation (a counterfactual) — and notes that only an RCT or before-after
   design gives the third. Practitioners are told this; nothing in their tools
   enforces it.

Meanwhile the *effect sizes* tell you why tooling matters. Leader-targeted
stress-management interventions pool at **g ≈ 0.13–0.18** across 21–25 studies
(*SJWEH*, 2025); workplace interventions to improve work ability pool at
**0.12** (2018); work-engagement interventions at **g ≈ 0.29**; even coaching,
the best-supported practice, pools at **g ≈ 0.59** with acknowledged publication
bias (*Academy of Management Learning & Education*, 39 RCTs, n = 2,528). A
leadership intervention that genuinely works moves a weekly metric by something
like **a fifth of a standard deviation**. A four-week before/after comparison on
a noisy cadence metric has almost no chance of seeing that — which is precisely
why dashboards report "engagement is up 4%" and nobody can say whether the
intervention caused it.

### 57.2 What the ledger does about it

**Reconstruction without new telemetry.** `app/core/domain/vitals.js` rebuilds
twelve weekly metrics from dated fields the leader already typed —
`delegatedOn`/`completedOn`, `observedOn`/`date`, `openedOn`/`resolvedOn`,
`decidedOn`, 1:1 `date` + `mood`, pulse responses, recognition dates. Three rules
keep it honest, and each is a test:

- **A bucket with no observation is `null`, never `0`.** The chart draws a gap.
- **A closed record with no close date is excluded and counted in `undated`,
  never interpolated.** Interpolating would manufacture the very quantity being
  measured (cycle time).
- **A metric whose underlying record does not reach back far enough is trimmed
  at its coverage frontier**, so a young 1:1 log cannot render fifteen weeks of
  imaginary zeroes. If the log has *no* records of that kind at all, the series
  is empty with a reason rather than twenty-two confident zeroes.

**Pre-registration as a database constraint, not a promise.** A study records
the metric, the direction, the intervention date, the baseline length, the
window, α and optionally a magnitude and confidence. `declaredOn` is stamped by
the action and never supplied by the caller, so the grade is *derived*:
`declaredOn ≤ windowStart` → **confirmatory**; otherwise **retrospective**.
Once the window closes, the predictive fields are rejected by
`updateImpactStudy` with an error; once the study is scored, the evaluation is
frozen and `buildImpactReport` reports the frozen copy rather than recomputing
it. A result that drifts when an unrelated record changes is not a result.

**Inference that can fail loudly.** A segmented interrupted time series
`y = b0 + b1·u + b2·post + b3·u·post` with **Newey–West HAC** errors (Bartlett
kernel, bandwidth `⌊4(n/100)^(2/9)⌋`) because weekly cadence is serially
correlated. Missing periods are **skipped, not zero-filled** — the model is
fitted on observed periods at their true position on the time axis, which is
standard unbalanced-panel practice and measurably changes the answer
(substituting a zero biased a noiseless step from 5.00 to 5.29 and inflated the
standard error from 0 to 0.51).

Then four honesty devices:

- **Minimum detectable effect.** `MDE = (z_α/2 + 0.8416) · SE(b2)` in the
  metric's own units. A result smaller than its own MDE is reported as
  **underpowered**, not as a null finding — the single most common error in
  corporate before/after reporting.
- **In-space placebo (Abadie-style).** Every other vital that is fully measured
  on the same grid is treated in turn; the treated effect is ranked against
  those placebo effects. The code reports the **finest attainable p**
  (`1/(K+1)`) and refuses to use the test as a gate when that floor is above α.
  A rank test that cannot reject must not be allowed to "pass".
- **In-time placebo.** Fake interruption dates inside the pre-period produce a
  distribution of t-statistics; a study whose real t is ordinary for that
  distribution is not evidence.
- **Breakdown trend (Rambachan–Roth style).** How large a differential trend,
  sustained across the post-period, would reproduce the whole estimate — stated
  as a percentage of baseline per week, and flagged *fragile* below 5%.

**A pre-intervention power planner** (`designPower`) uses the metric's own
moving-range noise (σ̂ = mean|Δ|/1.128, the I-MR estimator, so a trend does not
inflate it) and the design matrix implied by the chosen pre/post weeks, and
returns the smallest level shift the design could detect — before any
post-period exists. The declare dialog runs it live and tells the leader when
their intended effect is below their instrument's resolution. This is the
calculation the DiD literature reports is almost never done, and it converts
into a shipped feature here: with 8 pre and 4 post weeks, feedback cadence in
the demo workspace has MDE ≈ 0.91 per-person notes and a predicted effect of
0.30 — the tool says, in the dialog, *this study cannot see what you are hoping
for*.

### 57.3 Cross-module propagation (verified, not asserted)

`RULE-IMP-01..06` run on the ADR-0008 spine before `decisionTempoRule`, in one
store transaction, idempotently. A measured trace on the demo workspace:

- Lock *Weekly feedback ritual* (verdict **supported**, estimate 0.618, MDE
  0.244) → **1 DACI decision** ("Scale or protect: Weekly feedback ritual",
  4 options), **2 typed links** (`impact →decides→ decision`,
  `replication →replicates→ original`), **6 audited events**; a replication
  study is proposed automatically (one positive result is an anecdote with a
  p-value).
- Lock *Ritual makes feedback more timely* (verdict **not-supported**, estimate
  2.99 days worse, MDE 1.11) → **1 DACI stop/redesign decision**, no
  replication, no congratulation.
- `scanImpact()` immediately afterwards → `changed: false`, zero duplicate
  artifacts.

Both studies were declared **before** the same intervention date, which is the
point: one intervention, two metrics, one supported and one contradicted, and a
single-line dashboard could never have told you that.

### 57.4 Deliberately rejected

Causal-claim inflation (no "impact achieved" language anywhere in the surface),
synthetic-control donor weighting fitted on the pre-period (a fitted donor pool
can always be made to look convincing; the shipped composite is equal-weight and
deliberately unfitted), any use of the ledger to rate people rather than
interventions, backdating a declaration to manufacture a confirmatory grade, and
rescoring a locked study.

### 57.5 Verification

`tests/app/impact.test.mjs` (56 tests): exact OLS/Neyman–Scott recovery,
segmented-ITS coefficient recovery, HAC behaviour, MDE arithmetic, gap-skipping
versus zero-substitution, coverage trimming, empty-history honesty, both placebo
families including the resolution floor, every gate that can downgrade a verdict,
the pre-registration firewall (frozen evaluation, refused post-window edits,
refused rescoring), atomic idempotent fan-out with pause semantics, Schema v31
normalisation and migration, signals, CSV data minimisation, and JSDOM + axe
across all five tabs plus the empty state and the route/nav/badge/title wiring.
Full gate: **754/754**.

---

## 58. Stakeholder communication drafts with a closure ledger (Session 50, 2026-10-27)

### 58.1 The market gap, restated

AI status-report tools in 2026 draft stakeholder updates from live project data. Asana's Status
Reporter drafts "stakeholder-ready summaries from live data" [1]. Atlassian Rovo turns recent
activity into "a structured draft status update" [2]. Microsoft Planner's agent generates reports
with audience and tone controls [3]. Practitioner guidance says the same data should produce
different versions for different audiences, and that a person checks each draft before it goes
out [4]. The drafting half of the problem is well served.

The incident-management half asks for something the drafting tools do not model. ITIL 4 guidance
says that when stakeholders were told about an incident, its closure should be communicated to
them too [5]. Incident guidance also says updates should run on a fixed schedule, because silence is read as
"things getting worse" [6], and that a communications lead should own each message [7]. No snippet read this session describes a record
of *who was actually told what*, a closure duty derived from that record, or the withdrawal of
approved text when the facts beneath it change. These claims rest on search snippets and are
**[UNVERIFIED]** against hands-on product trials.

### 58.2 What LeadOS does about it

`RULE-COMMS-01..04` (ADR-0016) generate drafts only from fields recorded on the case. Missing
fields are shown as explicit gaps and gate approval. A sent brief creates a closure duty, and an
unsent brief is withdrawn when the case closes. Reopening withdraws the closure note. A changed
approved text withdraws its approval. Nothing is sent by the app. The design takes the
"never invent progress, dates or percentages" rule that practitioner status-report guidance
states [8], and makes it a property of the code path.

### 58.3 Deliberately rejected

- **Auto-send through email or chat.** Adds egress and a credential surface, against ADR-0006.
- **LLM prose.** A line-by-line audit of a template is possible. A model's prose needs a
  faithfulness check the repository does not have.

### 58.4 Verification

`tests/app/comms.test.mjs` (22 tests): audience selection, fact-only rendering with gaps and
readiness, cascade through the real store, content-addressed idempotence, supersession and
re-approval, the approval and dismissal gates, closed-loop closure after a logged touch, closure
only for the briefed, reopen withdrawal, closure via a plain status edit, the non-case guard, the
v31→v32 migration and normalizer repairs, signals, the demo seed, and JSDOM + axe over the outbox
tabs. Full gate: **776/776**.

### 58.5 Sources

1. Asana Status Reporter, AI-generated stakeholder summaries: https://pmtoolscout.com/best/ai-pm-tools-status-reports.mdx/
2. Atlassian, *Create status updates with Rovo*: https://support.atlassian.com/platform-experiences/docs/create-project-updates-with-rovo/
3. Microsoft Planner Agent, AI-generated status reports with audience and tone controls: https://m365admin.handsontek.net/microsoft-planner-ai-generated-status-reports-planner-agent/
4. Justin McKelvey, *AI for Project Managers* (one data source, several audience versions; human check before sending): https://justinmckelvey.com/blog/ai-for-project-managers
5. AXELOS, *ITIL 4 Practice Guide: Incident Management* (closure communicated to stakeholders previously informed): https://s3.amazonaws.com/thinkific/file_uploads/381835/attachments/aba/2cf/226/Incident-management.pdf
6. IT DevTech, *IT Major Incident Management: A Practical 2025 Guide* (fixed-schedule updates; silence read as worsening): https://itdevtech.com/blog/it-major-incident-management-process-guide
7. Rootly, *Incident communication plans* (a communications lead owns every message; updates on a fixed cadence): https://rootly.com/incident-response/communication
8. AI Agents Library, *Project Status Report skill* (never invent progress, percentages or dates): https://www.aiagentslibrary.com/skills/project-status-report/



## 2026-10-27 — New hunt: decision-network assurance, not black-box action

Fresh web-search findings (vendor statements, not independently validated product tests):

- **Aera** describes a Decision Intelligence Network capturing context and outcomes, with
  Workspaces and agents spanning structured and situational decisions.
  [6](https://www.aeratechnology.com/blogs/the-next-chapter-of-aera-empowering-enterprises-with-people-centric-decision-intelligence/)
- **Orgvue**, 6 October 2026, describes a WebMCP interface with visible agent interactions and
  auditable/reversible human control points for workforce modeling.
  [9](https://www.orgvue.com/news/orgvue-accelerates-ai-powered-workforce-design-with-innovative-webmcp-interface/)
- **Culture Amp AI Coach in Performance** explicitly excludes final performance ratings and
  fully automatic reviews. That is a useful human-authority boundary, not a reason to disguise
  deterministic text as generative coaching.
  [4](https://support.cultureamp.com/en/articles/12331162-ai-coach-in-performance)
- **Betterworks** describes skills inferred from goals, outcomes, feedback and 1:1s with manager
  verification. Treat competitor comparisons as vendor claims, especially privacy comparisons.
  [3](https://www.betterworks.com/magazine/why-growing-companies-switch-from-lattice-to-betterworks)

Conversion to shipped code this session: transactional savepoints (database failure isolation,
implemented without a database), buffered publication of success audit events, disposable
production-rule rehearsal, a per-rule write trace, and BFS shortest evidence trails over the
existing typed graph. This is an automation-assurance capability, not probabilistic prediction,
LLM reasoning or proof that LeadOS is unique in the market.

Underused framework pursued: **transaction savepoints + graph provenance** as a manager-facing
control surface. Rule-level failure containment protects fan-out integrity while preserving the
source action and earlier successful effects. BFS establishes reachability, not causality.

New ideas: historical event sourcing with frozen rule versions; preconditioned repair plans;
worker-backed rehearsal; regression fixtures automatically generated from approved real-world
case snapshots with privacy redaction. Rejected: causal risk percentages from generic links,
automatic repair deletion, covert employee monitoring, and bypassing approval to send drafts.

Research limit: tools were searched and primary vendor excerpts reviewed, not logged into or
benchmarked hands-on. Earlier research sections were not all re-verified this session.

## 59. The Allocation Governor — explore/exploit learning over a leader's own settled evidence (Session 51, 2026-10-27)

### Fresh market hunt, retrieved 2026-10-27 (search snippets; hands-on status [UNVERIFIED])

The October-2026 landscape for leadership/decision tooling clusters into four camps, none of
which runs a learning allocation policy over a single leader's own records:

- **Copilots over existing systems.** Microsoft 365 Copilot and Dynamics 365 Copilot summarise
  meetings, draft documents and surface ERP context in natural language; Workday refactored
  around Illuminate (generative assistant + retention-risk and succession prediction) after
  acquiring HiredScore, Evisort, Paradox and Sana, with a Skills Ontology Engine launched
  2026-07-02. SAP pairs Joule with a Talent Intelligence Hub. Strength: zero migration.
  Weakness for our gap: they retrieve and draft; they do not *learn an allocation policy*.
  ([viewpointanalysis.com HR AI buyer guide](https://www.viewpointanalysis.com/post/hr-ai-software-options-2026),
  [hrleadershipweekly.com HR analytics 2026](https://hrleadershipweekly.com/hr-analytics-2026-descriptive-predictive-prescriptive/))
- **People-analytics platforms going agentic.** Visier (Vee natural-language workforce
  analysis; retention risk, scenario modelling), One Model ("One AI" auto-selects predictive
  models and traces forecasts to source rows), ChartHop (live org model), Windmill (ONA from
  work tools). Phenom acquired Included in 2026 to assemble an "agentic people analytics"
  stack; Beamery shipped an agent ("Ray"). Predictive attrition at 75–85% claimed accuracy is
  the mature use case. All are org-scale, cloud, and trained across customers/workforce
  records — the opposite data posture from LeadOS.
  ([knowlee.ai 2026 buyer's guide](https://www.knowlee.ai/blog/people-analytics-platform-guide),
  [zapier.com predictive analytics 2026](https://zapier.com/blog/predictive-analytics-software/),
  [gowindmill.com people analytics tools](https://gowindmill.com/resources/lists/top-ai-people-analytics-tools-early-stage-companies/))
- **Decision-intelligence surfaces.** Dot (narrative answers from the warehouse into
  Slack/Teams), ThoughtSpot/Tellius (conversational analytics), Tableau+Agentforce, IBM
  watsonx/OpenScale with audit trails for regulated industries, Taktile/Nected/FICO/Pega for
  operational decisioning. These explain business data; none measures a *manager's funding
  behaviour* or learns what their team's work returned.
  ([getdot.ai decision intelligence 2026](https://www.getdot.ai/blog/decision-intelligence-software),
  [viewpointanalysis.com decision intelligence options](https://www.viewpointanalysis.com/post/decision-intelligence-software-options-2026))
- **Regulatory gravity.** The EU AI Act classifies workforce-decision AI as high-risk (Annex
  III); 2026 RFPs now default-require audit trails for predictions about hiring, promotion and
  termination. This validates LeadOS's standing architecture: deterministic rules, append-only
  event log, typed provenance, every number traceable to a record the leader wrote — and it is
  a further argument against shipping black-box scores. ([knowlee.ai](https://www.knowlee.ai/blog/people-analytics-platform-guide))

**The gap LeadOS takes:** allocation is the highest-frequency strategic decision a front-line
leader makes (where does the next person-day go?), and every surveyed tool leaves it to
intuition plus a static ranked list. A governor that (a) measures the explore/exploit mix of
*actual funding behaviour*, (b) learns per-horizon returns from *settled* evidence, and
(c) forces the rebalancing decision — locally, deterministically, auditably — has no direct
analogue in the surveyed set [UNVERIFIED beyond search coverage].

### Frameworks applied, named

- **March (1991), "Exploration and Exploitation in Organizational Learning"** (Organization
  Science): returns to exploitation are more certain and proximate, so adaptive organisations
  systematically under-explore; exploitation "drives out" exploration (success trap / competency
  trap). Design consequence: the Governor measures the exploratory share of *funded effort over
  time* (behaviour), not the count of "innovative" items on a list, and treats a sustained
  shortfall as an event requiring an owned decision.
- **Nagji & Tuff (2012), "Managing Your Innovation Portfolio"** (HBR) / McKinsey Three
  Horizons: total innovation returns correlate with maintaining roughly 70% core / 20% adjacent /
  10% transformational allocation. Design consequence: horizons on every funded item and a
  default 10% exploration floor — presented as a leadership convention to be owned and changed
  explicitly (lowering it is one of the rebalancing decision's four options), never as a law.
- **Auer, Cesa-Bianchi & Fischer (2002) UCB1** (Machine Learning): choose the arm maximising
  mean reward + √(2·ln T / n); optimism in the face of uncertainty yields logarithmic regret
  without priors. LeadOS scales the bonus by the pooled robust dispersion (1.4826·MAD) so the
  bonus is denominated in the same units as the reward and cannot explode on tiny samples. The
  n=5 counts-only floor is stricter than textbook UCB (which needs n≥1) — deliberately, to
  match the house evidence standard (conformal bands, k-anonymity floors) over statistical
  minimalism. Empirical support that this is how good allocators actually behave: UCB variants
  best fit real lab resource-allocation decisions (Zhuo, 2025, "Navigating the
  Exploitation-Exploration Tradeoff") — the terminal therefore formalises expert behaviour
  rather than replacing judgement with an alien optimiser.
  ([en.wikipedia.org/wiki/Multi-armed_bandit](https://en.wikipedia.org/wiki/Multi-armed_bandit),
  [ranzhuo17.github.io ExploitExplore 2025](https://ranzhuo17.github.io/files/ExploitExplore_Sept2025.pdf))
- **Gittins index (1979) — considered and rejected.** Optimal index policy for discounted
  bandits, but it requires a known reward family and a discount factor; a first-time leader
  cannot supply either, and an unauditable index would violate the traceability invariant.
  Recorded as a deliberate rejection in ADR-0017.
  ([fasterthannormal.co explore-exploit](https://fasterthannormal.co/mental-models/explore-exploit-tradeoff))

### Design consequences and boundaries

Rewards are **recorded actuals only** (`actualValue ÷ actualEffortDays`); a settlement without
actuals is excluded and escalated as an evidence debt (RULE-ALLOC-03), never zero-filled —
zero-filling would teach the arms that unmeasured work is worthless, the exact bias March
warns about. Arms are segmented by currency (no FX fiction). The floor measures *chosen*
funding: capacity reserves created from incidents are excluded, because an obligation is not
an allocation choice. The rebalancing decision is the only automatic artefact; funding itself
stays a human DACI call, priced by Decision Tempo. **Rejected this session:** time-decayed /
discounted UCB (needs enough settled history to detect non-stationarity; listed as a second
pass), Thompson sampling (randomised recommendations cannot be rehearsal-tested
deterministically and read as caprice to a first-time leader), contextual bandits (feature
vectors per item would be invented metadata), and inferring horizons from item kinds.

### Research limit

Vendor claims above come from search excerpts and secondary buyer guides retrieved this
session, not hands-on trials; treat named-product capability claims as [UNVERIFIED]. The
framework citations (March 1991; Nagji & Tuff 2012; Auer et al. 2002; Gittins 1979) are the
load-bearing sources; the 70/20/10 split and the 10% floor are reported correlations and
management conventions, not constants validated on a single team — the UI says so.

---

## 60. The Cognitive Load & Attention Governor — measured saturation on a role, queueing theory instead of surveillance (Session 52, 2026-10-27)

### The gap

Every LeadOS engine before this one priced *work* — effort, delay, funding,
resilience, learning return. None measured the person-side constraint that
decides whether any plan survives contact with the week: finite cognitive
capacity. The fresh 2026 hunt found two product categories adjacent to the
gap, neither of which closes it.

**Workload/resource management (the heatmap category).** Toggl 2.0
(toggl.com, 2026-08-17 refresh), Float, Asana workload, Teamwork's AI Smart
Scheduler and Utilization Summaries (teamwork.com, 2026-10-14), Productive
(productive.io capacity metrics), plus Runn, Smartsheet and Visier/One Model
in people analytics. The common shape: booked-hour heatmaps, drag-and-drop
rebalancing, predictive what-if scheduling in the cloud. What they measure
is *time entered against tasks*, not cognitive load; none separates
intrinsic from extraneous or germane load, none models the queueing damage
of near-saturation, and none runs deterministic governance rules over a
single leader's own on-device records. Productive's action convention
(>2 overbooked weeks in 12 for a team, or one person overbooked three weeks
running, before extra hours are approved) is the closest thing to a
threshold policy found; it is adopted as inspiration for the leader-owned
policy dial, labelled a convention, not a validated constant.

**Surveillance-derived collaboration analytics.** Microsoft Viva Insights
uses email, meeting and calendar signals and applies minimum-group sizes —
an implicit admission that the underlying data is sensitive and
identifying. The 2026 ONA/collaboration vendors (covered in §56) inherit
the same model: infer load from communication metadata. LeadOS's ADR-0006
boundary forbids the backend and the telemetry; more importantly, message
volume is not attention consumed. No surveyed product offers a
surveillance-free, queueing-aware, per-role saturation governor with
auditable rules. Vendor claims here rest on search excerpts and buyer
guides retrieved this session, not hands-on trials: **[UNVERIFIED]**.

### The framework chain, and what each piece became in code

- **Sweller's cognitive load theory (1988 onward).** Three load types —
  intrinsic (the work itself), extraneous (how the work is organised;
  switching, coordination, stewardship), germane (schema-building learning).
  Became the four-component index: utilization (intrinsic, weight 0.40),
  WIP switching (extraneous, 0.25), coordination (extraneous, 0.20),
  commitments (extraneous, 0.15), with germane load *excluded from the
  score* and protected instead by `RULE-LOAD-04`. Weights are exported
  constants shown in the policy tab; there is no hidden model.
- **Skelton & Pais, Team Topologies (2019; 2nd edition September 2025).** A
  team fails when responsibility exceeds cognitive capacity; split on load,
  not headcount; team size 5–9; interaction modes should be explicit.
  Became the band vocabulary (headroom / managed / elevated / saturated /
  overloaded), the per-role (never per-person-rating) framing stated on
  every surface, and the Brooks `n(n−1)/2` channel count on the team panel.
  The 80% saturation default and the "load on a role, not a score of the
  human" stance are Team Topologies-flavoured conventions, marked as such in
  the UI. See [martinfowler.com TeamTopologies bliki](https://martinfowler.com/bliki/TeamTopologies.html).
- **Little's Law (`L = λW`) and Kingman's formula (1961).** Congestion is
  non-linear near saturation: expected wait ≈ `(ρ/(1−ρ))·c·cycle`, so the
  marginal thread at ρ=0.99 costs far more than at ρ=0.7. Became the
  per-person queue tab: measured throughput from recorded completions,
  median cycle time, Little expected cycle, Kingman expected wait with
  `c = 1` exported as a house convention, and an explicit *unstable* state
  at ρ≥1 that returns no finite wait rather than fabricating one. The
  Capacity terminal already uses Kingman at team level (§capacity research);
  this is the per-person completion, not a duplicate.
- **Anderson, Kanban (2010).** Cap WIP; stop starting, start finishing.
  Became the shared WIP-limit convention (twice the limit is the index
  saturation point) and `RULE-LOAD-02`, the blameless WIP-breach talking
  point that self-clears when WIP returns.
- **Brooks's Law (1975).** Adding people to a late project adds
  communication channels before output. Became the channel-density panel
  and the coordination score (strong-tie degree via the §56 projection,
  1.5 per direct report, weighted stewardships against a budget of ten).
- **Goldratt, Theory of Constraints.** Optimising anyone but the bottleneck
  cannot raise system throughput. Became the single system-constraint
  (bottleneck) flag, the board brief headline, and the first decision
  option ordering (shed from the constraint first).
- **Reinertsen, CD3 (already implemented in the Decision Tempo engine,
  §52).** Reused, not re-implemented: `RULE-LOAD-01` runs upstream on the
  post-commit spine so the load-shedding DACI decision is priced for delay
  inside the same transaction.
- **PERT Beta-PERT Monte Carlo (existing simulation module, §capacity).**
  Reused for the per-person fit probability against ramp-adjusted supply,
  seeded and reproducible. Unmeasured commitments are counted, never
  sampled as zero — the same anti-fabrication rule as every LeadOS engine.

### Design consequences and boundaries

The index and all queue statistics are **derived, never persisted** — a
stored index would become a stale rating the moment a record changed, which
is precisely the HR-file failure mode the governor exists to avoid. Schema
v34 adds four policy settings and zero data collections. Evidence floors
match the house standard: counts-only below two completions, learned at
five; Monte Carlo probabilities stay `null` when no measured triples exist.
The data-minimised CSV (#34) emits opaque person codes, never names or free
text. An explicit pause (`loadAutoPropagate`) blocks event fan-out while
measurement continues, but a human-triggered scan always runs.

**Rejected this session.** (1) Calendar/email/meeting telemetry in the
Viva style — privacy boundary, no-backend rule, and message volume is the
wrong construct. (2) Utilization percentage alone — blind to switching,
coordination and learning; the market's default metric, deliberately not
LeadOS's. (3) Persisted or trend-graphed personal indexes — stale-rating
and surveillance creep; the terminal recomputes live. (4) Hardcoded
thresholds — replaced by the leader-owned, validated policy dial
(50–100%). (5) Fabricated demo workload: synthetic portfolio items pushed
the demo team to ρ≥1.0 and silenced the existing Capacity Kingman signal
(CAP-02); the released demo instead lowers its own visible threshold to 70
and exercises every path on records that already exist. (6) Effort-weighted
throughput and correlation-aware Monte Carlo — listed on the roadmap as a
second pass once workspaces carry enough dated completions; shipping them
now would mean inventing the weighting.

### Research limit

The saturation weights (0.40/0.25/0.20/0.15), the 80% threshold, WIP
multiple of two, coordination/ten and commitments/six budgets, and Kingman
`c = 1` are transparent engineering conventions synthesised from the
frameworks above, **not** constants validated on LeadOS teams; the policy
tab says so and exposes them. Named-vendor capabilities are from 2026
search coverage only and remain [UNVERIFIED] by hands-on trial. No source
found in this hunt ships the combination: per-role cognitive bands,
Little/Kingman per-person queues, a seeded fit Monte Carlo, and
event-driven governance on-device without surveillance.

---

## 61. The Premise Sentinel — decision continuity, assumption ledgers and sequential evidence (Session 53, 2026-10-27)

### Fresh 2026 competitive/domain hunt

The 2026 decision-intelligence category has become explicit about **closed-loop**
decisions: Gartner's first DIP Magic Quadrant (26 January 2026) covers modeling,
orchestration, monitoring and governance across 17 vendors [2](https://www.gartner.com/en/documents/7363830); Gartner's category definition says DIPs monitor
and assess outcomes, govern and improve decisions [7](https://www.gartner.com/reviews/market/decision-intelligence-platforms); the September 2026 IDC
MarketScape frames decisions as ongoing assets whose outcomes feed the logic that made
them, with deterministic rules, ML and GenAI combined and humans in the loop for
regulated calls [3](https://www.sas.com/content/dam/sasdam/documents/2026-09/idc-marketscape-worldwide-decision-intelligence-platforms-2026-vendor-assessment.pdf) [6](https://www.sas.com/en_us/news/press-releases/2026/september/intelligent-decisioning-idc-marketscape.html). In
parallel, AI-governance writing calls for an **assumption ledger** that captures the
premise, dated evidence, accountable owner, invalidation signal and predefined
response; the point is to change the sentence from "I think the strategy is wrong" to
"the condition we agreed would reopen this decision has occurred" [1](https://www.business-powerhouse.com/ai-agents-need-an-assumption-ledger-before-strategy-moves-at-machine-speed). A second ledger proposal adds confidence, materiality, freshness and a validation
path [2](https://myagents.plus/agent-oracle/blog/the-assumption-ledger-how-ai-detects-what-you-left-unsaid). Continuous-assurance research replaces one-time validation with drift,
calibration, Brier/PSI thresholds, human review, rollback and documentation
[1](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1870819/full) [2](https://pmc.ncbi.nlm.nih.gov/articles/PMC13462453/). Strategy/OKR buyers are offered AI goal drafting, at-risk
flags, QBR prep and "strategy pillars, assumptions, and investment tracking" [12](https://www.okrstool.com/blog/best-okr-software) [13](https://www.tability.io/odt/articles/tability-ai-features-explained). No surveyed source described a local-first,
deterministic assumption ledger with dated provenance, pre-declared invalidation
triggers and **automatic cross-module re-decision** on a typed event spine. Vendor and
analyst capabilities are search excerpts only, **[UNVERIFIED] by hands-on trial**.

### Named frameworks converted into shipped code

- **Dewar, Builder, Hix & Levin (RAND, 1993), Assumption-Based Planning.** A
  load-bearing assumption is one whose failure would change the plan; signposts are
  observable warnings; shaping actions control vulnerability; hedging actions prepare
  the organisation for failure [1](https://catdir.loc.gov/catdir/samples/cam033/2002073460.pdf) [6](https://books.google.com/books/about/Assumption_Based_Planning.html?id=5deOuiMsJYkC&hl=en). Shipped as the premise record
  (`statement`, `signpost`, `criticality`, `ownerId`, `reviewBy`) and the four breach
  options: reaffirm + hedge (shaping), pause/renegotiate (hedging), reverse, or buy
  information.
- **Mitchell, Russo & Pennington (1989) prospective hindsight / Klein's pre-mortem.**
  Imagining a failure as having already happened increases the number of concrete
  reasons people generate; the popular "correctly identify +30%" phrasing overstates
  the original study, which measured reason quantity, not quality [14](https://frameworklist.com/frameworks/premortem) [20](https://hbr.org/2007/09/performing-a-project-premortem). Shipped as
  the register dialog's explicit frame ("assume this premise already failed — which
  dated record would have warned you first?"). The UI says this is a prompt, not proof
  the plan is safer.
- **Bayes in log-odds / Good's weight of evidence / Cromwell's rule.** Priors are
  leader-owned and clamped to 5–95%. Each dated observation contributes
  `±ln(LR)`; the posterior is a sigmoid of prior log-odds plus the cumulative log
  Bayes factor. Evidence older than `halfLifeDays` is discounted by
  `2^(-age/halfLife)` with a 5% floor, so stale evidence weakens without being erased.
- **Wald (1945) Sequential Probability Ratio Test.** Boundaries
  `A = ln((1−β)/α)` and `B = ln(β/(1−α))` label support, challenge and continue
  states [2](https://ucb-stat-159-s21.github.io/site/Notes/sprt.html) [6](https://metricgate.com/docs/sequential-probability-ratio/). Shipped with α=0.10, β=0.20 and an explicit
  warning that heterogeneous leadership evidence is not IID; this is a sequential
  discipline, not a p-value.
- **Kullback–Leibler divergence.** Information gain in bits from prior to posterior is
  shown in the evidence lab and CSV; exposure uses typed Decision Tempo value terms per
  currency (never summed) but is labelled an attention indicator, not a cash forecast.
- **Reinertsen CD3 / Raiffa–Schlaifer EVSI (existing Tempo engine).** A breach rule
  declares `decisionTempo` on the same generalized event; Decision Tempo proposes a
  timebox when the new DACI decision inherits priced links from the original decision.
  The `event.rules` declaration — not a direct cross-module call — is the integration.
- **AIAG-VDA FMEA, Simchi-Levi TTS/TTR, encumbrance accounting, PERT Beta estimates,
  Brier/conformal forecast challenges, Little/Kingman cognitive load.** Eight sensors
  translate these existing engines' dated facts into keyed evidence. Unrated FMEA,
  unpriced budgets and missing actuals produce no fabricated evidence.

### Implemented this session (verified by `tests/app/premises.test.mjs`)

`app/core/domain/premises.js`, `app/views/premises.js`,
`app/ui/premise-modals.js`, Schema v35 `premises` collection and five policy settings,
`premise` link entity type with `tests`/`revisits` relations, `RULE-PREM-01..04` on the
ADR-0008 spine, `PREM-01..05` signals, Today triage card, nav badge, `PREMISE_SENSORS`
registry, two-hop typed scope, reviewed human reaffirmation cycles, explicit scan,
opaque CSV scope #35, board brief, demo premises produced by the real sensor rule,
ADR-0019, and 26 new tests including one priced cross-module cascade that asserts
`RULE-DLY-03` chaining in the same transaction.

### Planned (deliberately not shipped)

1. **Empirical LR calibration.** Once workspaces carry enough reviewed premises with
   known outcomes, score whether "strong" observations actually deserve LR 6 and expose
   a per-sensor reliability table with counts-only below n=5. Shipping calibrated LRs
   now would require invented data.
2. **PSI / Brier drift dashboards for the sensor registry itself.** Continuous-assurance
   research supports monitoring the monitor; this session ships transparent finite-state
   sensing and explicit evidence gaps, not a second statistical control loop.
3. **Board-pack export with redaction profiles.** CSV #35 is already opaque; a richer
   printable board pack needs a purpose/recipient matrix before it can include any
   premise free text.
4. **Effort-weighted, correlation-aware evidence decay.** Half-life is a time convention;
   correlated evidence from the same incident should eventually be clustered so one
   bad week cannot masquerade as ten independent observations.

### Rejected this session

- **LLM-inferred premises or sentiment evidence.** Violates the zero-network canonical
  boundary and confidential-data rules; also makes the likelihood ratio untraceable.
- **Automatic reversal or auto-sending stakeholder messages on a breach.** A belief
  crossing a policy threshold is not authority to act; the engine opens a DACI
  decision, delegation and 1:1 prompt, and never sends anything.
- **Hardcoded per-module `if` chains.** The declarative sensor registry and typed scope
  exist so a new module adds one sensor object with event prefixes and a pure collector.
- **Treating Wald boundaries as statistical significance.** Leadership evidence is
  heterogeneous; the UI states the caveat in the evidence lab and board brief.
- **Defaulting unrated case priority/FMEA to 5.** This was an explicit roadmap hazard;
  the case sensor emits nothing until all three ratings exist.
- **Silently rewriting evidence when a source record changes.** A changed state yields a
  new keyed observation; append-only history plus half-life decay preserves both the old
  and new facts.


## 62. Premise sensor reliability: close the outcome loop without self-grading (2026-10-27)

### Competitive hunt and gap

The market is converging on two adjacent capabilities. Culture Amp's official Perform materials describe AI Coach drafting/refining manager reviews, talk tracks and role-play while leaving the manager in control ([Culture Amp Perform](https://www.cultureamp.com/platform/perform)). Dataiku's 2026 decision-intelligence overview explicitly describes capturing decision outcomes to recalibrate rules/models and continuous monitoring as an operating loop ([Dataiku, 2026-07-10](https://www.dataiku.com/blog/decision-intelligence-platforms)). Metaculus resolves forecasts against outcomes and uses long-run scores to give forecasters feedback; its scoring guide cautions that no one metric alone describes forecasting skill ([FAQ](https://www.metaculus.com/faq/), [scoring primer](https://www.metaculus.com/notebooks/22486/22486/a-primer-on-the-metaculus-scoring-rule/)). This triangulates performance coaching, enterprise decision monitoring and forecast calibration; it does **not** establish a complete feature-by-feature competitor gap. Official pages/search excerpts reviewed 2026-10-27; hands-on product trials and vendor claims are **[UNVERIFIED]**.

**Gap selected:** LeadOS's new premise sensors carried named likelihood ratios, but there was no outcome ledger to test those evidence strengths against later reality. A self-referential score derived from the premise posterior would make the model grade its own inputs. The missing capability was a date-safe, human-owned outcome label with source lineage and small-sample protection.

### Implemented in the same session

- Schema v36 adds an append-only `premiseOutcomes` ledger with human `held`, `failed` and `inconclusive` assessments. No historical outcome is inferred and sensors cannot self-label. A premise accepts one conclusive outcome.
- `RULE-PREM-05` adds idempotent `premiseOutcome --validates--> premise` and `premiseOutcome --revisits--> decision` typed links on the generalized post-commit spine.
- A pure read model scores each sensor/premise only once. Repeated observations from the same typed source collapse to the latest state before the settlement date; post-settlement observations cannot leak into its score. Declared LR is translated to an implied forecast from a neutral 50% prior, then Brier, mean forecast vs held rate, calibration gap and threshold accuracy are computed.
- Performance metrics are counts-only below n=5. PSI compares earlier and recent forecast-probability distributions only when both date-separated cohorts have at least n=10; same-day samples are never split; it is explicitly *forecast-mix shift*, not model-quality degradation. No LR is automatically tuned.
- A keyboard-usable **Sensor calibration** tab, outcome capture dialog, opaque CSV scope #36, point-in-time filtering, demo-clear repair and additive migration ship together.

### Named methods and limitations

Brier (quadratic) score is a proper scoring rule for probability forecasts; calibration gap compares average stated probability with the observed event rate. PSI is used only as a descriptive binned-distribution shift statistic, with a half-count smoothing convention. The LR-to-probability mapping assumes a neutral prior solely to score a directional evidence claim; this does not validate a true likelihood ratio. Source collapse mitigates repeated rows from one source but does not remove correlation across different sensors that read the same incident. Human outcome labels can be wrong or selectively recorded. Small-sample floors do not make dependent samples independent. PSI is not an alarm threshold or causal signal.

### Deliberately rejected

- **Automatic LR recalibration from a handful of outcomes:** rejected because weak, dependent local samples can create unjustified confidence. It remains planned behind correlation clustering, uncertainty intervals and explicit human approval.
- **LLM-generated outcome labels or sentiment-based truth:** rejected because this is a governance-grade ground-truth label and the local-first, non-surveillance boundary matters more than automation theater.
- **Cross-person sensor ranking:** rejected because it could turn an operational evidence aid into a manager/employee ranking system.

### Next research questions

1. How should multiple sensors that read the same incident be clustered so five premise records do not masquerade as five independent tests?
2. What interval estimator or hierarchical model can express uncertainty for per-sensor Brier/gap without hiding small n?
3. After adequate evidence, should a leader be offered a shrinkage-based LR proposal with a side-by-side backtest rather than an automatic policy mutation?
4. Can premise posterior uncertainty widen seeded P80/P90 schedule and cash tails without implying that belief probability is an actuarial frequency?


## §61 Session 55 — Assumption-aware tails & correlated evidence (2026-10-28)
Paired CRN premise-coupled Monte Carlo + leave-one-out attribution shipped (ADR-0021). Practitioner demand confirmed: "look only at runs that missed… rerun with that assumption held at its most likely value… rank assumptions by how much they move the odds" [3](https://profmarkprice.substack.com/p/stop-planning-for-one-future). Correlated-signal aggregation: naive log-odds summation double-counts shared priors/information; influence-aware clustering discounts dependent signals [1](https://arxiv.org/html/2604.24517v1) [8](https://bioengineer.org/ai-systems-can-be-fooled-by-echo-chambers-but-a-new-architecture-fights). LeadOS surfaces concentration (TAIL-03) instead of silently rewriting belief — deliberate divergence, leader decides. Rejected: Gaussian-only tail widening [5](https://alcapitaladvisory.com/research/frameworks/monte-carlo.html) (misses assumption-failure tails by construction).


## 2026-10-28 — Decision intelligence and manager coaching benchmark

- [15Five Kona](https://www.15five.com/blog/leveraging-15five-ai-in-your-performance-management-strategy) describes in-conversation AI coaching and performance context. Product claims, not independently evaluated.
- [Betterworks](https://www.betterworks.com/magazine/best-performance-evaluation-software) describes OKR-to-review alignment and coaching nudges. Vendor comparison, not an independent evaluation.
- [Visier and One Model](https://hrpresso.com/reviews/best-ai-people-analytics-tools) are compared on cross-source people analytics, scenario planning and model ownership. Capabilities not independently tested.
- [Causa Kairos](https://causa.tech/) advertises causal mapping, robustness tests and uncertainty; [@RISK](https://lumivero.com/products/at-risk/) advertises simulation and sensitivity analysis. These are vendor claims, not verified product tests.
- Gap: a link graph is not a causal model. LeadOS can already rehearse case rules, but collection totals hide whether a relationship was removed or redirected. Implemented: identity-free link-type delta and before/after graph diagnostics in the existing disposable production-rule rehearsal. This is an assurance aid, not a competitive claim of causal inference or prediction.
- Planned: explicit causal assumptions with provenance and falsification tests, plus decision-timing counterfactuals linked to actual outcome measurement; deliberately rejected: predicting an individual's attrition from sparse local records (privacy and unvalidated inference).

## 2026-10-28 — Predictive Statistical-Process-Control in Leadership Workspaces
- Lattice / 15Five / Culture Amp / Betterworks / Visier: survey/OKR dashboards, no XmR control charts or calibrated prediction intervals.
- Bloomberg / manufacturing SPC (Shewhart / Wheeler): control charts exist but never integrated into people/decision/stakeholder automation.
- AI coaching (BetterUp, CoachHub): script generation, no statistical detection of operational special-cause signals.
- Decision-intelligence (Causal, Figma): scenario modeling, not predictive anomaly response tied to organizational metrics.
- LeadOS #/anomaly is ahead: pure engine + event-driven propagation + board brief + calibration transparency.

### 2026-10-28 — fresh competitive hunt and correction
- Visier announced its Viva Glint connector in September 2026: survey data transfers into a common workforce model for analysis alongside other metrics. https://www.visier.com/company/news/visier-expands-workforce-intelligence-with-the-launch-of-new-integration-with-microsoft-viva-glint/ — product announcement, not independent evidence of impact.
- Microsoft describes Copilot Highlights summarizing survey scores, changes and benchmarks: https://techcommunity.microsoft.com/blog/viva_glint_blog/news-to-know-%E2%80%93-volume-3-edition-4-april-2026/4513682
- BetterUp describes combined human and AI coaching: https://www.betterup.com/platform-releases/fall-2025 ; Culture Amp describes platform-wide AI coaching: https://www.cultureamp.com/company/announcements/ai-coach-new-leadership-era . These are vendor claims, not head-to-head evaluations.
- Gap: LeadOS has local case automation and descriptive metrics, not enterprise data connectors, validated forecasts or AI coaching comparable to these platforms. The immediately preceding Session 56 claim that LeadOS anomaly automation is ahead is **incorrect**: no downstream records were made and the prediction labels were uncalibrated. This session prioritizes removing misleading signals before building prospective, lineage-backed cross-domain detection. Existing scenario simulation and case automation are separate, not proof of predictive anomaly automation.

## §62 Session 57 — Operating System Dynamics Lab (2026-10-28)

**Market shape.** Stock-and-flow simulation is a mature analyst discipline with mature analyst
tools: Vensim, Stella Architect, Powersim, AnyLogic and the open-source Insight Maker all provide
stock-and-flow diagrams, causal-loop views, parameter sweeps and Monte Carlo sensitivity, and
Vensim/Insight Maker document Euler plus second/fourth-order Runge–Kutta integration
[5](https://analytica.com/blog/best-system-dynamics-simulation-software/). Comparison tables treat
"causal loop diagrams" as a drawing surface distinct from the simulation model — Vensim's own
manual states plainly that CLDs and stock-and-flow diagrams *are not* simulation models until
algebraic relationships are attached [4](https://www.vensim.com/documentation/usr04.html). That is
exactly the gap LeadOS attacks: the algebra is derived from the leader's records, so nobody has to
draw the model before the model can say anything.

**Loop dominance is a research field, not a checkbox.** Hayward (2024) compares Loop Impact, PPM
and Loops That Matter: LTM reports one percentage influence per system per loop and is endogenous
only; Loop Impact measures acceleration imparted, per stock per loop; PPM apportions curvature by
percentage [12](https://onlinelibrary.wiley.com/doi/10.1002/sdr.1757). LTM is implemented in Stella
and in research tools such as LoopX [19](https://arxiv.org/pdf/1909.01138). LeadOS implements a
**gain share** (central-difference elasticity of each loop's own flow with respect to its driving
stock, normalised across loops) and therefore reports "share of measured gain" rather than
"percentage influence". Calling it LTM would be a false claim; the UI and brief say what it is.
This is the most important honesty decision in the module.

**Leverage hierarchy.** Meadows' twelve places to intervene rank parameters lowest and loop
structure highest [13](https://donellameadows.org/archives/leverage-points-places-to-intervene-in-a-system/);
current systemic-design teaching operationalises points 10 (stock/flow structure), 9 (delay
length), 8 (negative-loop strength) and 7 (positive-loop gain) as the tractable structural set
[1](https://www.iseesystems.com/resources/download/scholarship/2025-guzman-abello.pdf). LeadOS
encodes a leverage class on every lever (1 = parameter ... 4 = delay/structure) and uses it to
explain *why* a parameter move is the weakest place to intervene, while still judging the outcome
on the capacity stock rather than on the label.

**Workforce-planning contrast.** Enterprise suites now advertise sandbox organisational modelling
with side-by-side scenario comparison and live cost/headcount recalculation
[10](https://checkthat.ai/answers/what-are-the-best-workforce-planning-software-solutions). Those
are planning surfaces for an analyst holding a headcount plan; they do not model feedback loops,
delays, quality debt or dependency concentration, and they do not derive dynamics from a leader's
own dated operational records. No surveyed product couples (a) derived-not-drawn structure,
(b) per-parameter provenance grading, (c) measured loop dominance, (d) a frozen prediction on
adoption and (e) event-driven propagation into the leader's decision and 1:1 records.

**Frameworks adopted.** Forrester (1961) and Sterman (2000) for stocks/flows and the discipline of
never treating a rate as a level; Senge (1990) archetypes; Meadows (1999) leverage points;
Richardson (1995) loop dominance; Little (1961)/Kingman (1961) for the queue relation reused rather
than re-derived; local stability via a numeric Jacobian, Faddeev–LeVerrier characteristic
polynomial and Durand–Kerner roots; MASE-style skill scoring against naive persistence for the
hindcast.

**Rejected on principle.** LLM-written system diagnoses (unfalsifiable prose that cannot be checked
against a trajectory); auto-adoption of policy experiments (the commitment must be the leader's);
attrition or morale prediction from sparse local records (privacy and unvalidated inference); and
any presentation of a trajectory without the measured/estimated/convention split beside it.

## Session 58 — Structural capital allocation: budgeted mixes, exact Shapley, minimax regret and skill

**What the market actually sells (reviewed 2026-10-28; vendor pages and search excerpts, not hands-on trials — [UNVERIFIED]).**
Strategic portfolio-management suites have converged on three ideas this session needed:
(1) sequencing by value per unit of the *constrained* resource — Epicflow's portfolio optimiser
orders work by "value per constrained hour" and adds RRI, its implementation of Devaux's DIPP
ratio, explicitly to stop sunk cost from dominating the next resource decision
[1](https://www.epicflow.com/blog/strategic-portfolio-management-tools/)
[2](https://www.epicflow.com/blog/portfolio-resource-management-a-complete-guide/);
(2) side-by-side scenario comparison with live reallocation — Planview and ServiceNow both claim
continuous replanning and dynamic reallocation [3](https://www.planview.com/products-solutions/solutions/project-portfolio-management/)
[4](https://www.itonics-innovation.com/blog/best-strategic-portfolio-management-software); and
(3) investment-scenario construction with an efficient frontier — Planisware combines scorecards
with NPV/ECV and builds scenarios against strategic axes, and states that it plans around the real
constraint (scarce specialist expertise) [5](https://planisware.com/resources/strategic-planning-alignment/best-strategic-portfolio-management-software).
Marketing-mix tooling got there earlier on the arithmetic: reallocation by *marginal* return with
saturation curves and staged moves is a template-level practice there
[6](https://metaflow.life/templates/budget-allocation-plan)
[7](https://liftlab.com/solutions/real-time-budget-optimization/).

None of these is the same object. They are analyst surfaces over a *plan document* (initiatives,
headcount, cash) built and maintained outside the file. They do not derive the structure from a
leader's own dated operational records, do not freeze a prediction together with its do-nothing
baseline at the moment of commitment, do not score that frozen prediction out of sample, and do not
grade their own output as *not actionable*. That gap is the module.

**Method: why exact Shapley, and why the weights matter more than the axiom set.**
Exact Shapley attribution costs `2^k − 2` evaluations of the value function and is described in the
2026 production-attribution literature as the preferred benchmark for a small number of input
blocks, with exponential cost as the only reason to approximate
[8](https://arxiv.org/html/2608.04547v1). Six levers is 64 coalitions — the exact number is cheaper
than explaining a sampling error, so LeadOS computes it exactly and prints the efficiency gap.
Shapley values decompose into a main effect plus allocated pairwise interactions
[9](https://arxiv.org/html/2610.15144), which is why the module reports a **pair table** (substitute
vs complement) rather than only a ranking: on the demo, WIP cap at 55% alone gains 47.46 points,
learning protection alone *loses* 20.06, and together they gain 52.47 — an interaction of +25.07.
Reporting the three marginals without that table would hide the only actionable sentence in the
report ("these two must be funded together").

The honest caveat comes from the 2025 critique that Shapley values are one efficient allocation
among many once the value function is fixed, and that the choice of value function is the
load-bearing modelling decision [10](https://pith.science/paper/2506.13900). LeadOS therefore
(a) declares the four objective weights in the UI and the brief, (b) treats them as a leader-owned
value function rather than a discovered truth, (c) renormalises and clamps them and labels the
result "optimal *for these weights*", and (d) refuses to call the plan actionable until the model
behind it has out-of-sample evidence.

**Decision under uncertainty: Savage minimax regret, not expected value.**
Parameters are conventions; pretending they are known would make an expected-value ranking look
more precise than it is. The module draws 32 lognormal perturbations (seed 42, CV 0.25) of the
structural coefficients, evaluates the plan, the six named playbooks and doing nothing in every
draw, and reports P10/mean/P90 per option plus **Savage minimax regret** — minimise the largest gap
to the best option in each world. This is deliberately conservative and it changes the answer: on
the demo the portfolio's mean (52.60) is beaten by nothing, but `cap-wip` alone reaches 33.32 with a
47.16 worst-case regret against the portfolio's **26.93**. A leader who cannot tolerate the bad
world should know that before spending 8.95 effort-weeks, not after.

**Scoring the model against itself: skill, frozen baselines, and a trust ladder.**
The checkpoint score is a MASE-style skill: `1 − model error / naive error`, where the naive
forecast was *frozen beside the prediction at adoption*. Without that frozen baseline a score
measures memory, not skill — so the engine withholds the number (`no-baseline`) instead of
fabricating one. Pooled skill is counts-only below n = 2, and two non-positive checkpoints open
exactly one re-baselining decision (re-measure, shorten the horizon, or stop relying on the model)
rather than an automatic retune. The ladder — `unvalidated → refuted → provisional → backtested →
validated` — makes the demo's own verdict visible: it is **refuted**, its hindcast skill is −5.38,
and the app says the recommendation is comparative. This mirrors the Box (1976) position that a
model is only as good as its record of failed predictions, and Hyndman & Koehler (2006) on
scale-free error measures against a naive benchmark.

**Frameworks adopted.** Bierman & Smidt (1966) capital budgeting and Keeney & Raiffa (1976)
multi-attribute utility for the objective; Shapley (1953) for the allocation; Savage (1951) for
regret; Popperian falsification plus pre-registered expectations for the checkpoint contract;
MASE-style skill for scoring; Meadows (1999) leverage classes carried over from the dynamics lab so
a parameter move is explained as the weakest place to intervene.

**Rejected on principle.** Calling a greedy allocation a global optimum; Monte-Carlo Shapley when
the exact computation is trivially cheap; auto-adopting the recommended portfolio; scoring a
checkpoint against a baseline reconstructed after the observation; ranking individual people by
their share of a lever; and printing a decision-ready number whose model has not beaten persistence.

---

## §63. Early-warning alerting — historical correction

The v39 design used Shewhart rule scores, a BH-style ranking, alert budgets, verdicts and a
forecast ledger. Earlier claims that this achieved repeated-scan FDR control or produced an
expected count `m×q` were unsupported. Reconstructed demo replay did not restore historical
input vintages, and the original case promotion did not run all case subscribers. Those
claims and the prior demo skill figure are withdrawn; the v40 decision is documented below.

## §64. Connected operations, forecast vintages and sequential monitoring (2026-10-28)

### Competitive scan — evidence, not a feature-parity claim

| Area | Public benchmark / observed claim | LeadOS decision and remaining gap |
|---|---|---|
| Performance, 360 and OKRs | [15Five Perform](https://www.15five.com/products/perform) advertises reviews, 360 feedback, a talent matrix and OKR tracking. [Lattice's 2026 announcements](https://lattice.com/blog/everything-we-announced-at-lattiverse-2026) describe AI assistance in 1:1s. | LeadOS uses explicit human-entered context, coaching prompts and linked goals; production multi-rater workflows, collaborative governance and AI assistants are not established here **[UNVERIFIED]**. |
| Succession and team health | [2026 Betterworks review](https://peoplemanagingpeople.com/tools/betterworks-review/) describes reviews, engagement, succession and calibration; [Betterworks' comparison](https://www.betterworks.com/magazine/best-employee-engagement-software) describes survey and pulse tooling. | Existing local succession/pulse paths were not comprehensively audited this session **[UNVERIFIED]**. Do not feed confidential/anonymous records into general relationship automation. |
| People analytics and scenarios | [Visier Workforce Planning](https://www.visier.com/solutions/workforce-planning/) advertises future scenarios and predictive workforce models; [Vee documentation](https://docs.visier.com/visier-people/GenAI/get-started.htm) describes follow-up questions and multistep reasoning. | LeadOS scenarios and aggregate Watch screening are local, not a workforce-prediction or generative-AI service. Historical vintage, calibration and prospective accuracy remain open. |
| Incident / decision intelligence | [incident.io](https://incident.io/solution/ai-sre) markets evidence-linked hypotheses; [Palantir Foundry](https://www.palantir.com/docs/foundry/platform-overview/overview) describes an ontology and sandbox scenarios. | Generalized lifecycle delivery and typed, inspectable relationship trails are implemented; cross-system integrations, model-powered root-cause analysis and enterprise governance are **[UNVERIFIED]/not shipped**. |

Vendor and analyst pages were read as descriptions; products were not trialled, no independent
accuracy or market-wide exclusivity was established, and no external AI/network service was added.

### Methods and conversion to code

1. **Event-driven operations / DACI / Mendelow / PERT / FMEA:** user-confirmed Watch or breached
   continuity drill emits `case.created`; the same case subscriber freezes eligible estimates and
   applies existing case rules. Created case, decision, delegation and portfolio records publish
   lifecycle events. Typed edges carry provenance. Explicit user inputs, not a chart, supply the
   owner, stakeholder, rating and estimates. Individual subscriber failures roll back only their
   own savepoint; queue bounds and audit entries make failure visible. Without a complete FMEA
   rating, cost magnitude can be recorded but probability-based loss, ROI and occurrence skill
   are withheld; later ratings do not backfill the opening snapshot. The existing ordinal
   occurrence ÷ 10 mapping is an unvalidated modelling convention, not measured frequency.
2. **BH is not a sequential warranty.** BH's expected false *proportion* is not `m×q`, and
   valid p-values and dependence assumptions matter. In-sample XmR limits, strongest-rule
   selection, moving-range approximations, correlated 28-day windows and repeated scans mean
   the current nominal scores have no proven FDR/FWER guarantee. Sequential multi-stream work
   treats those guarantees as a separate problem [arXiv 2501.04130](https://arxiv.org/html/2501.04130v3);
   anytime-valid methods require explicit assumptions [arXiv 2602.06379](https://arxiv.org/html/2602.06379v1).
   **Converted:** remove expected-false counts, label the step-up a heuristic and keep visible
   budget/cooldown/suppression accounting. Replacing BH with BY alone is rejected: it does not
   repair invalid inputs or repeated looks.
3. **Real-time vs pseudo-real-time forecasting:** [statsmodels' real-time news example](https://www.statsmodels.org/devel/examples/notebooks/generated/statespace_news.html)
   and [Croushore on data vintages](https://facultystaff.richmond.edu/~dcrousho/docs/Croushore%20Oxford%20Handbook%20paper.pdf)
   distinguish genuine historical vintages from reconstructions over revised data. **Converted:**
   whole future target week, one prediction per series/target, frozen first captured aggregate,
   late-capture exclusion, revision flag, legacy/demo exclusion, and per-series sample floors.
   This still cannot detect pre-capture revisions/backdating and rolling 28-day targets overlap
   previously known history. The resulting scores are descriptive pseudo-real-time evidence.
4. **Counterfactuals ≠ correlation:** [CACM's intervention discussion](https://cacm.acm.org/blogcacm/from-prediction-to-intervention-integrating-counterfactual-reasoning-into-ai-decision-making/)
   emphasizes causal assumptions. Typed relationships and human confirmation preserve context;
   they do not prove a root cause or that an intervention worked.

**Open research:** immutable vintages, prospective controlled evaluation, tested sequential
error control and privacy-preserving collaborative review remain planned, not implemented.

## 2026-10-28 — Action-level rehearsal, not synthetic leadership prediction

### Competitive hunt (new findings; public descriptions, not hands-on trials)
- **Aera** describes an explicit data foundation → risk detection → scenario evaluation → recommendation → action orchestration chain. This session benchmarks that chain, not a claim of market uniqueness. Source: https://www.aeratechnology.com/blogs/demand-planning-transformed-ai-agents-in-action/ (2026-03-09, retrieved 2026-10-28).
- **BetterUp Grow / AI Coach** advertises role-play and a scenario simulator. This establishes rehearsal as a baseline expectation, not an innovation claim by itself. Sources: https://support.betterup.com/hc/en-us/articles/36688702739611-BetterUp-AI-Coach and https://www.betterup.com/products/betterup-ai-coaching (retrieved 2026-10-28). Vendor effectiveness claims were not independently replicated.
- **Lattice, 15Five, Culture Amp, Betterworks** remain comparison targets for feedback, manager enablement, engagement and OKR alignment. A recent secondary inventory contrasts these workflows: https://www.intelogos.com/blog/best-performance-management-software-2026 (2026-09-30). Conflicting secondary pricing/feature claims were deliberately not used as specifications.
- **Visier Vee, Gloat, CoachHub AIMY, Palantir AIP and AnyLogic** remain the broader talent analytics / coaching / decision-simulation watchlist; current detailed feature parity is **[UNVERIFIED]** this session. No absence-of-competitor-capability inference is justified.

### Framework translated into shipped code
**Savage (1951), minimax regret:** for each declared loss scenario compute both alternative costs,
subtract the lower cost, then choose the lower worst regret. No likelihoods are invented for the
three scenarios. Occurrence/10 is a disclosed ordinal-to-cost sensitivity assumption, not a validated
risk model. Break-even loss is incremental mitigation cost divided by the declared occurrence-proxy
reduction. No reduction means no finite break-even threshold.

### Gap → implementation
The old sandbox evaluated post-commit rules only. Source-action fan-out was invisible. The new
lab invokes `createApi(...).updateCase` on two disposable, injected-memory `createStore` instances,
so validation, source automation and registered downstream rules are all production code. It exports
counts, not narratives. This is a deterministic policy rehearsal, **not** a causal digital twin or a
prediction of employee behaviour. The new synthesis is executable governance plus transparent
robust-decision arithmetic; superiority to commercial products remains **[UNVERIFIED]**.

## §65. Measuring and pricing the automation chain — Session 61 (2026-10-28)

**The problem this section answers.** Session 60 filed its own top priority as: *"Instrument
and test remaining entity creation/update producers and action-level fan-out; add
provenance-preserving durable retry/receipts and completeness diagnostics. Profile and
safely reduce per-event savepoint cost: a small synthetic demo-case benchmark rose from
111.8 ms median at the starting commit to 428.4 ms with additional event delivery (n=7)."*

That was a number without a diagnosis. This session measured the diagnosis before changing
anything, and the finding was not what the previous session assumed.

### 65.1 What the measurement actually found

Running the real `runPostCommitRules` on the demo workspace with a single `case.created`
event produces **42 (rule, event) pairs from 3 events and 14 rules**, of which **5 apply**
and **37 decline**. Per-rule time on that one event:

| Rule | Time | Applied | What it did |
|---|---|---|---|
| `earlyWarningRule` | 150.3 ms (3 calls) | 0 | Re-scanned every monitored series, found nothing |
| `premiseRule` | 82.2 ms (3 calls) | 2 | Scanned assumption signposts |
| `dynamicsRule` | 35.1 ms (3 calls) | 0 | Re-integrated the stock/flow model, found nothing |
| `loadRule` | 11.9 ms (3 calls) | 0 | Re-measured per-person saturation, found nothing |
| `decisionTempoRule` | 8.2 ms | 1 | Priced decisions |
| `resilienceRule` | 7.1 ms | 1 | Priced continuity |
| `caseCreatedRule` | 6.0 ms | 1 | Fanned the case out |
| 7 others | ≤ 0.7 ms each | 0 | Guard only |

So **~198 ms of a 305 ms write (65%)** was spent by three rules recomputing full analytical
scans that concluded there was nothing to do. The savepoint was a contributing cost, not
the dominant one — the previous session's framing was incomplete, and the honest correction
is recorded rather than quietly dropped.

### 65.2 Copy-on-write savepoints — and why the first attempt lost

The savepoint (`ADR-0008`) was implemented as `JSON.parse(JSON.stringify(draft))` **per rule
per event**: cost `O(rules × events × |workspace|)`. At 5,792 records one write spent
1.45 s on pure copying.

The replacement materialises a private deep copy of a top-level collection the first time a
rule *reads* it, via an ES6 `Proxy`. This is the classic copy-on-write pattern — "a proxy to
postpone the copying process… pay the price of copying the object only if it's modified"
([Sourcemaking/GoF proxy discussion, Stack Overflow](https://stackoverflow.com/questions/628938/what-is-copy-on-write)) —
and it is the same idea that database snapshots use: the snapshot only has to store the
blocks that change ([TechTarget, snapshot technologies](https://www.techtarget.com/searchdatabackup/tip/Using-different-types-of-storage-snapshot-technologies-for-data-protection)).

**A published caveat that this session then reproduced.** The `proxy-clone` library's own
benchmark notes: *"clone speed is constant, however using the cloned object is slightly
slower"* ([juliangruber/proxy-clone](https://github.com/juliangruber/proxy-clone)). That is
exactly what happened here. A first, unfair measurement (comparing the new engine against a
hand-written single-pass loop) showed COW at **0.7×** — slower. Once both strategies ran
through the *same* engine via a `savepoint: 'clone'` seam, the true figure was **1.4–1.7×**.
The lesson is recorded because the wrong comparison is easy to make and would have justified
abandoning a correct optimisation.

### 65.3 Decline collapse — what durable-execution platforms do, and the smaller version here

Durable execution engines (Temporal, Inngest, Restate, Azure Durable Task) converge on the
same observability model: an **execution journal** of every step's start/complete/fail/retry,
used to replay history and to skip work that already completed
([Temporal workflow execution docs](https://docs.temporal.io/workflow-execution);
[durable-execution survey, 2026](https://zylos.ai/research/2026-04-24-durable-execution-agent-runtimes/)).
The relevant idea for LeadOS is narrower: **a completed step is served from history instead
of executed again.** Temporal can do this because workflow code is required to be
deterministic and side effects are isolated into Activities.

LeadOS is not a workflow engine — the rule chain is synchronous and in-transaction — but the
same principle applies to one specific case: **a scan rule that declined at workspace
version V for event type T will decline again for a later T at the same V.** The engine
therefore records that verdict and skips the re-run.

The honesty problem is that this is a *claim about the rules*, not a fact about the engine.
It is only sound if a rule's decision to decline depends on workspace content and event type
and **not** on which entity the event names. So:

- Membership in `DECLINE_MEMO_RULES` is opt-in per rule; an unlisted rule is never skipped.
- `tests/app/propagation-ledger.test.mjs` probes the property directly: for every declared
  rule it runs two different entities of the same event type at the same version and requires
  an identical verdict. If a rule ever starts branching on the entity, the test fails rather
  than the engine silently dropping its work.
- Collapse is applied **only** to an invocation that produced no write, no emission, no audit
  entry, no warning and no effect list.

Measured effect on a four-event cascade that repeats a type — the shape a case fan-out
actually has, since one case can create several decisions or delegations:

| Workspace | Baseline (eager copy, no collapse) | COW + collapse | Gain |
|---|---|---|---|
| 362 records | 369.6 ms | 54.0 ms | **6.8×** |
| 1,448 records | 1,309.6 ms | 169.5 ms | **7.7×** |
| 5,792 records | 5,532.0 ms | 1,284.4 ms | **4.3×** |

On a single event with no repeated type the gain is only the savepoint's 1.4–1.7×, because
there is nothing to collapse. Both numbers are reported; quoting only the cascade figure
would be the misleading version.

**Limits, stated plainly.** These are timings on one machine with a synthetic demo
workspace, not a general performance guarantee. The remaining dominant cost is real
analytical work in `earlyWarningRule`, `premiseRule` and `dynamicsRule` — collapse removes
*duplicate* scans within a transaction, not the first one, and does nothing for a cascade of
all-distinct event types. No browser-timing or large-Workspace profiling was performed
**[UNVERIFIED]**.

### 65.4 Durable receipts — the part the journal model gets right that LeadOS did not

Every durable-execution reference above treats a failed step as a **first-class record**
with a retry policy, not as a log line. LeadOS did not: a rule that threw was written to the
audit log, shown as a toast, and the transaction moved on. The decisions, delegations and
goals that rule existed to create were simply absent, and there was no way to discover that
after the toast faded or to ask for them again.

Schema v41 adds `propagationReceipts`: the event that triggered the failure (type, entity,
entity id), the rule, the error, and a bounded retry history. The retry re-runs **only the
rule that failed**, against current state — replaying the whole chain would duplicate the
effects that already succeeded, which is the "activity must be idempotent" trap that durable
engines warn about ([Pipecode: Temporal retries and idempotency](https://pipecode.ai/blogs/temporal-data-workflows-durable-execution-retries-long-running-pipelines)).

Receipts are deliberately **content-free**. Temporal's event history stores inputs and
outputs; LeadOS must not, because that would create a second copy of the workspace outside
the export-redaction and conflict-privacy boundaries this product enforces. The receipt
records *that* a propagation was lost and *which* event caused it — enough to re-run it,
not enough to leak a record.

### 65.5 Competitive benchmark (vendor claims, not trials)

Temporal/Inngest/Restate/Azure Durable Task offer durable execution with journals, replay,
per-step retry and OpenTelemetry — far deeper infrastructure than this, but for *engineering
workflows*, not leadership automation, and they require an external service. Performance-
management products (15Five, Lattice, Visier) advertise manager enablement and predictive
analytics but publish no automation-cost accounting. The specific thing shipped here — a
leadership tool that prices its own rule chain, proves which rules may be skipped, and keeps
failed propagations as re-runnable records inside a local-first, no-backend app — was not
found in a competitor, which is a statement about the search performed, **not** evidence that
no product does it **[UNVERIFIED]**.

---

## §66. Strategy coherence — measuring the frame instead of the activity (Session 62, 2026-10-28)

### 66.1 The competitive hunt

The hunt was run this session with live web retrieval. Claims below are **vendor or
third-party published claims**, not trials, and no incumbent was benchmarked head to head.
Parity or superiority is `[UNVERIFIED]`.

| Source | What it claims | What it actually measures |
|---|---|---|
| "Strategy Execution Benchmark 2026" / OKR-tool round-ups ([okrstool](https://www.okrstool.com/blog/strategy-execution-software), [statistics](https://www.okrstool.com/blog/strategy-execution-statistics)) | 7% of leaders say most daily work ladders up to strategy; 83% get no automatic signal when a priority drifts; 60% never cleanly resolve a failing priority; only ~5% of teams sit at 76–100% alignment | Self-reported survey answers, aggregated. Useful as a market signal; not a measurement instrument. |
| Planisware OKR-platform selection guide ([planisware](https://planisware.com/resources/strategic-planning-alignment/okr-platform-selection-strategy-execution)) | "A platform that generates high engagement but does not shift resource allocation is administrative value" — recommends % of projects traceable to a priority and spend on aligned initiatives | Percentage of projects *mapped* by a PMO, and budget on aligned initiatives: both are declarations from the same people who wrote the strategy. |
| "Alignment platforms" position paper ([bastrustdesk](https://bastrustdesk.com/blog/okr-tools-vs-alignment-platforms/)) | Claims effort-allocation measurement and drift detection by connecting execution tools ("31 of 47 tickets… 14% of capacity, down from 22%") | The only category claiming measured effort. Requires multi-tool ingestion — the opposite of LeadOS's zero-network invariant, and a commit count is not effort. |
| Planview / strategy-execution playbooks ([planview](https://www.planview.com/resources/guide/the-strategy-execution-playbook-accelerating-time-to-value/)) | Lists "resource allocation alignment to strategic initiatives" as a leading indicator | Portfolio reporting conventions. |
| Nath & Sudharshan (1994), *Measuring strategy coherence through patterns of strategic choices*, SMJ ([link](https://sms.onlinelibrary.wiley.com/doi/abs/10.1002/smj.4250150104)); 2024 study of 400 firms ([link](https://www.researchgate.net/publication/380583143_Strategic_Coherence_and_Company_Performance_Research_Results)) | Strategy coherence is monotonically related to performance | Survey instruments and researcher-coded choice patterns, not record-derived shares. |
| NIQ "Say–Do Gap" framework ([link](https://nielseniq.com/global/en/landing-page/the-say-do-gap-measurement-framework/)) | Links stated preference to verified purchasing across 25+ markets | Consumer research. LeadOS borrows the **name** from market research; the mechanism here is different and is stated in §66.2. |

**Conclusion of the hunt.** The category is saturated with tools that measure *declared*
alignment (a mapped-project percentage, a PMO convention) and with vendor surveys of the gap.
The one thing almost nobody ships is a **bounded, record-derived distance between a declared
share vector and a funded share vector**, with the vintage rule and measurement basis printed
on screen. That is what Session 62 implements.

### 66.2 The statistical choices, and why they are the honest ones

1. **Total variation distance, not a scored "alignment %".** Declared weights and measured
   shares are both distributions over the same support (the active bets), so the natural
   divergence is ½·Σ|p−q| expressed in percentage points. Exact bounds: 0 (identical) and 100
   (disjoint support). Nothing is normalised by an invented scale, and the same statistic is
   used per bet as a signed gap.
2. **Herfindahl–Hirschman over measured shares.** Reported as a concentration index with three
   *labelled conventions* (<0.15 diffuse, <0.25 balanced, ≥0.25 concentrated). Concentration is
   not good or bad — it distinguishes deliberate focus from unacknowledged lock-in, and the
   stop rule is what tells them apart.
3. **Vintage discipline.** The earliest adoption date defines the strategy era. Work created
   before it is excluded from the denominator, because it was funded before the choice existed.
   This is the same rule LeadOS applies to forecasts (never reconstruct a past prediction) and
   to premise evidence (never backfill an observation): a metric that can be improved by
   relabelling history is not a metric.
4. **Scaffolding exclusion.** Governance records that the terminal itself opens carry
   `[RULE-SCO-…]` markers and are excluded from the denominator. Otherwise one rebalancing
   decision would mechanically worsen the gap it exists to close — a self-referential bias that
   would look like a finding.
5. **Measurement basis is chosen, printed and bounded.** Effort-weeks only when ≥50% of funding
   tags carry an estimate; otherwise record counts. Below five open post-strategy records the
   whole report is `Counts only`. A tag without an estimate is one record, never zero effort.
6. **Falsifiability as six named checks, not a talent label.** The 9-box failure mode is a
   confident category that outlives its evidence. Here the grade *is* the count of checks
   passed, and every missing check is printed by name.

### 66.3 What this session deliberately did not do

- No CSV export scope. A share without the declaration that produced it is a number with the
  evidence stripped off; the terminal exports a plain-text brief that carries both.
- No automatic retirement of a failing bet. The app opens one retire-or-renew decision and
  records the human verdict; deleting a strategy by algorithm would be the exact failure this
  module exists to prevent.
- No ingestion from git, Jira or calendars to "measure" effort. It would break the local-first
  invariant and put an unverifiable inference behind the most persuasive number on the screen.
- No trigger on unrelated events. Running a portfolio scan on every keystroke-committed action
  and opening governance decisions while a leader types a case note is noise, not automation.

### 66.4 Open questions this session created

1. The gap is a cross-sectional distance. Does a *widening* gap predict anything? That needs
   stored periodic snapshots, which do not exist yet.
2. Tag honesty is unenforceable in a single-user local workspace. Is there a diagnostic that
   detects suspiciously tidy tagging (for example, a bet whose tags are all created in one
   sitting days before a review)? `[UNVERIFIED]` idea; not implemented.
3. The 20pp / 40% / 28-day conventions are guesses with stated bounds, not validated constants.
   Field use on a consented workspace is the only way to move them.

## §67. After-action review and the organizational learning loop (Session 63, 2026-10-28)

### 67.1 Evidence status of the citations in this section

**This session had no general web access** (the sandbox could reach package registries only),
so nothing below was re-fetched or verified against the publisher's page in Session 63. The
citations are from prior knowledge and are marked `[NOT RE-FETCHED]`. Where a number is quoted
from memory rather than from a source read in this repository's history, the claim is written as
what the literature *reports*, not as something LeadOS measured.

| Source | What it reports | What it does **not** license | How LeadOS uses it |
|---|---|---|---|
| US Army, *A Leader's Guide to After-Action Reviews* (TC 25-20, 1993) `[NOT RE-FETCHED]` | A four-question structured debrief (what was supposed to happen / what happened / why the difference / what we would do differently), run as soon as possible after the event, on the record, with the leader speaking last | That a debrief improves outcomes by itself, or that the format transfers unchanged from combat units to a product team | The five-question shape of a review (intended, actual, why, sustain, improve) and the ordering rule that the most senior person does not open the conversation |
| Tannenbaum & Cerasoli (2013), *Do team and individual debriefs improve performance? A meta-analysis*, Human Factors `[NOT RE-FETCHED]` | Meta-analysis reporting roughly a 20–25% improvement in team effectiveness for structured debriefs versus no debrief, with the effect larger when the debrief is structured and attended by the team | Any specific multiplier for LeadOS, any causal claim about a particular team, or that frequency alone reproduces the effect | The decision to make a review a **first-class dated record** rather than a document, and to measure *coverage* (how often the loop ran) separately from *applied rate* (what came of it) |
| Di Stefano, Gino, Pisano & Staats (2014), *Learning by thinking: how reflection improves performance*, HBS working paper `[NOT RE-FETCHED]` | Reflection on a completed task improves subsequent performance relative to additional practice without reflection | That reflection must be written by a tool, or that reflections can be scored | Why the *why* question has a character floor and is never inferred: the value is in the human articulation |
| Argyris & Schön, *Organizational Learning* (1978) and *Teaching smart people how to learn* (HBR, 1991) `[NOT RE-FETCHED]` | Single-loop learning corrects an error within existing policy; double-loop learning changes the policy that produced the error; defensive routines block the second | That a taxonomy can classify an individual's reasoning, or that Espoused-theory/Theory-in-use can be inferred from a paragraph of text | The distinction between a lesson that is an **observation** (`changeType: 'none'`) and one that commits to a **change** — stored as different record types so the two rates cannot be quietly conflated |
| Edmondson (1999), psychological safety `[NOT RE-FETCHED]` | Speaking up about error requires interpersonal safety; blame suppresses the disclosure that learning needs | That safety can be measured by counting lessons, or that "blameless" means "no consequence" | Every lesson names a system, a decision or a practice, never a person; the UI states this on every tab, and no field accepts a person as the cause |
| Milton (2010), *The Lessons Learned Handbook*; NASA LLIS and similar corporate lessons databases `[NOT RE-FETCHED]` | Lessons-learned repositories routinely fail because entries are decontextualised, unowned and never re-read | That such repositories are useless — NASA's do get reused | The refusal to build a lessons database: a lesson here is attached to a dated event, has an owner, and is `open` until a human says what changed |
| Ohno, *Toyota Production System* (1988); the andon/kaizen line `[NOT RE-FETCHED]` | Stopping the line to fix the cause is cheap relative to discovering it at the customer; the fix is verified by re-running the condition | That a software team can copy a physical line-stop ritual | The recurrence measure: the same class appearing again after a committed change is the "condition re-ran" test, printed rather than assumed |

### 67.2 The measurement choice, and why it looks weaker than it is

A review ledger could easily become a **"lessons learned" count**, which is a vanity metric:
it rises with the number of things that went wrong. Three deliberate refusals:

1. **Coverage, not volume.** What is measured is the share of *dated closures in the window*
   that carry a held review or a dated, reasoned skip. Closing an event and never looking at it
   is the failure mode; writing longer reviews is not rewarded anywhere in the UI.
2. **Applied rate with a denominator that excludes observations.** Observations are stored, shown
   and counted — but they sit outside the applied-rate fraction, because "we decided nothing
   needed to change" is an answer, not a success, and it must not be able to make the team look
   better at learning.
3. **Recurrence as the only outcome measure.** Every percentage in this module answers "did we
   look?"; only recurrence answers "did it work?". It is reported as a count of distinct events
   and a list of the classes that repeated while their committed change was still open, never as
   a per-person statistic.

Below three dated closures the module prints counts and no percentage, on the same principle
used elsewhere in this codebase: a rate over one or two events is arithmetic, not measurement.

### 67.3 Standing research debts (Session 63)

- **No field trial.** Whether a leader using this ledger applies more changes than a leader using
  a text document is `[UNVERIFIED]`; nothing in Session 63 tests that.
- **Self-report contamination.** "Applied" is a human claim with a date attached. It is auditable
  (the note survives beside the lesson) but not verified against an independent signal. A later
  session could cross-check a subset against a change record, a plan item or a document link, and
  must then say that the check exists rather than implying the claim was verified all along.
- **Classification stability.** Recurrence is only as good as the class taxonomy being applied
  consistently by different people. No inter-rater reliability has been measured for the eleven
  classes, and the UI does not pretend otherwise.


## 2026-10-28 — Robust decisions should commission evidence, not manufacture confidence

**Fresh source hunt.** Public GitHub descriptions/README content fetched with `gh api` in
this session (outbound vendor websites are not available in this environment). These are
vendor/project statements, not independent effectiveness evaluations:

| Freshly inspected source | Verified statement | Product conversion this session |
|---|---|---|
| [Frappe HR](https://github.com/frappe/hrms) README, Performance Management | Goals/KRAs, self-evaluation and appraisal cycles are explicit capabilities | Keep the gate attached to real operational records and existing workflows rather than build another appraisal form |
| [LangGraph](https://github.com/langchain-ai/langgraph) README, Why use LangGraph | Durable execution, human-in-loop state inspection and stateful workflows | Human confirmation plus production event cascade; no new agent runtime needed |
| [Trigger.dev](https://github.com/triggerdotdev/trigger.dev) README, platform/key features | Durable workflows, retries, idempotency, waits and human approval are advertised | Exact numeric replay key, one transaction, observable downstream records; do not pretend localStorage has equivalent durability |
| [Worklytics psoxy](https://github.com/Worklytics/psoxy) repository description | A pseudonymizing compliance proxy for workplace SaaS sources | Evidence request needs denominators and source limitations, not private employee narratives; no connector added |
| [Microsoft TinyTroupe](https://github.com/microsoft/TinyTroupe) README and 2026-02-01 note | Experimental persona simulation for business insights; release note describes an empirical simulation validator | Reject simulated personas as intervention-effect evidence; request actual comparable observations and falsifiers |
| [HumanLayer](https://github.com/humanlayer/humanlayer) current README | Teams steer coding agents through tasks, sessions, plans and reviews | Human review/evidence handoff is useful; this source is **not** treated as a current leadership-coaching product |

**Coverage of the broader hunt:** Lattice/15Five/Culture Amp (performance, 360, engagement),
Betterworks/Mooncamp (OKR), BetterUp/CoachHub (AI coaching), Eightfold/Visier (talent,
succession and predictive people analytics), Aera/causaLens (decision intelligence) remain
on the inherited inventory. Their current releases and detailed capability comparisons
were **[UNVERIFIED]** this session. Public GitHub evidence is insufficient to establish
which is best in each category or that LeadOS is first. Avoid recycling old marketing
claims as fresh research. Newly inspected TinyTroupe and orchestration techniques are
adjacent benchmarks, not substitutes for those categories.

**Framework implemented explicitly:** Savage minimax regret with a set of states rather
than an invented distribution. For conditional loss `L`, current/proposed event probability
`b,p` and incremental cost `C`, saving is `L(b-p)-C`. Because this is multi-affine, extrema
over the rectangular box occur at its eight corners. This remains true when the proposed
intervention can be worse, a case missed by multiplying only the smallest loss and smallest
reduction. The illustrative frontier is not used to estimate a probability of success.

The smaller maximum regret is an upper bound on the benefit of perfect state information
for the selected two-action model. It is **not** an expected value of sample information:
there is no prior distribution, research likelihood or delay-cost model. The product
prints that distinction and commissions a human evidence task rather than automatically
funding either research or mitigation. Do not oversell a decision-theory bound as a forecast.

**Gap → shipped code:** `mitigationRobustness.js` + `mitigationReview.js`, assurance UI and
case-detail entry point implement interval dominance, regret, break-even/information
thresholds and the DACI/delegation/coaching/tempo chain this session. New research targets:
feasible probability-dependence constraints, changing conditional loss, immutable numerical
vintages and prospective evidence-to-outcome scoring. Deliberately rejected: Monte Carlo
cell shares as confidence, FMEA-derived probabilities in the new analysis, and synthetic
employee behavior as causal evidence.

## 2026-10-28 — Robustness must model intervention effects, not just uncertain inputs

### Fresh market hunt (checked today)

- **Lattice, July 2026 product update — Evidence-based Review Drafts and Lattice MCP**
  ([official release](https://lattice.com/blog/july-2026-product-updates), accessed
  2026-10-28): Lattice says its AI Agent drafts performance reviews from existing 1:1s,
  feedback, goals, updates, growth areas and prior reviews, and reports early customers
  completed reviews 47% faster on average. Treat both the product description and result as
  vendor claims; this is not an independent controlled study, and does not prove leadership
  effectiveness. MCP access expands that workflow into external AI clients. **Gap signal:**
  evidence-grounded people-work drafting is now a visible incumbent feature, so generic
  evidence summarization is not a credible differentiator for LeadOS.
- **Gartner, Decision Intelligence Platforms definition**
  ([category description](https://www.gartner.com/reviews/market/decision-intelligence-platforms),
  accessed 2026-10-28): the category description includes decision design/orchestration,
  simulation, optimization, and monitoring/assessment of outcomes. This is a definition of
  the category, not an endorsement or a vendor-by-vendor product audit. **Gap signal:** the
  full decision loop matters; a mathematically careful simulator without captured action and
  outcome follow-through is incomplete.
- **Underused named framework converted:** robust optimization / set-based decision analysis
  plus **Savage minimax regret**. Where the prior model assumed common conditional severity
  and independently varying probability boxes, Advanced mode now accepts explicit linked
  bounds on (a) current-minus-proposed event probability and (b) proposed-minus-current
  conditional severity. The bounded feasible regions are polygons clipped by linear
  constraints; their vertices can be enumerated from boundary intersections. The savings
  objective is bilinear over the product of the two polytopes, so extrema occur at a pair of
  vertices. This is a deterministic exact search (bounded to 6×6 vertices for these clipped
  rectangles), not a Monte Carlo confidence estimate. If severity shifts, a single
  break-even-loss number is withheld rather than misrepresented.
- **Product decision:** implement this as an optional extension of the existing open-case
  decision and evidence workflow, preserving legacy assumptions and replay keys. Every
  assumption remains human-entered; the exact numeric set is captured in the existing DACI
  record, and `RULE-ROB-01` still creates owned verification + coaching + typed links + derived
  Decision Tempo in one production transaction. No new LLM, synthetic-person simulation,
  connector, paid service or schema.

### Claims and limits

The new calculation is exact *conditional on the user's declared bounds*, not calibrated to
an empirical outcome, not causal evidence, and not a substitute for safety/compliance review.
The two within-pair differences are constrained, but the probability-effect and
severity-effect polytopes are combined independently; cross-dependence between them, other
common causes, nonlinearities and shifting horizons are not modeled. The default mode still has a rectangular
probability set and common loss. The search establishes correctness inside its stated set, not
that the set is plausible. Real browser rendering, business adoption, effect calibration and
outcome lift remain [UNVERIFIED]. No claim that LeadOS is first or superior to Lattice, Aera,
o9, or other decision/talent platforms is made.

## §68. 2026-10-28 — Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation & Cross-Silo Benchmark

### 2026 External Market & Academic Hunt (Verified 2026-10-28)

1. **Decision Intelligence Platforms (Inaugural Jan 2026 Gartner Magic Quadrant — Quantexa, IBM, Decisions + ProcessMaker, FlexRule DMN CL3):**
   - Formalizes explicit decision modeling, orchestration, governance, and outcome monitoring, but focuses on enterprise operational/entity rule automation rather than coupling human leadership capacity, 1:1 stewardship load, and operational dependency shocks.
2. **Operational Resilience & EU DORA Platforms (Fusion Risk Management, Fortiv, Cutover, Continuity2 Meridian, Opsbook, ServiceNow ORM — 2026):**
   - Replace static Business Impact Analysis (BIA) binders with dynamic service/Nth-party dependency graphs, EU DORA Art. 26/29 impact-tolerance testing, and failover runbooks — yet remain isolated in GRC/BCM silos without feeding stochastic outage preemption into engineering or operating-plan delivery schedules.
3. **Strategic Portfolio Management (Planview Portfolios/Anvi, Planisware Horizon, Tempus Resource, ServiceNow SPM, Jira Align — 2026):**
   - Provide PERT/Monte Carlo schedule simulation, OKR alignment, and resource capacity planning under a hidden **"fair-weather" assumption**: uninterrupted infrastructure, vendor, and primary-steward availability.
4. **Incident Postmortem / AAR Governance & Forecast Calibration (Rootly, Jeli, incident.io 2026; ForecastBench & Murphy 1973 decomposition):**
   - Confirm that unclosed remediation actions (40–60% industry-wide without structural follow-through) and uncalibrated recovery estimates systematically understate real disruption duration unless empirical drill ratios ($n \ge 5$) adjust declared recovery times.

### Cross-Domain Synthesis Shipped (`continuityCoupling.js` + `continuityCouplingRule.js`, [ADR-0030](docs/adr/0030-coupled-continuity-capacity-simulation.md))

- **Engineering & Operations Research:** Simchi-Levi, Schmidt & Wei (2014) $\text{TTS}/\text{TTR}$ Risk Exposure Index fused with Goldratt (1997) Critical-Chain owner serialization and Hopp & Spearman (2011) preemptive outage queueing over multi-tier Nth-party DAGs.
- **Mathematics & Statistics:** Law (2014) Common Random Numbers (CRN) paired sub-streams (`effortRng` + `shockRng`) guaranteeing pathwise dominance ($\text{coupledDays}^{(k)} \ge \text{fairWeatherDays}^{(k)}$), Knuth/Hörmann PTRS Poisson arrival sampling from annual disruption probabilities, and Vovk et al. (2005) split-conformal drill TTR calibration with an explicit $n = 5$ sample floor (`declared-point-ttr` below 5 drills; `empirical-drill-bootstrap` at $n \ge 5$).
- **Finance & Economics:** Rockafellar & Uryasev (2000) coherent Expected Shortfall ($\text{CVaR}_{90}$) strictly segmented per ISO currency (never summing across currencies), paired with Reinertsen (2009) Cost-of-Delay (`CD3`) chaining (`RULE-CPL-01` $\rightarrow$ `RULE-DLY-03` in the same atomic transaction) and marginal counterfactual hardening ROI (`rankHardeningInterventions`).
- **Political Science, Leadership & Org Design:** Williamson (1985) supplier hold-up & Tsebelis (2002) external gatekeeper warnings surfaced alongside Avelino et al. (2016) Bus-Factor-1 dual-hat contention (`RULE-CPL-02`), queuing blameless Edmondson (1999) 1:1 focus-protection prompts without evicting employee-queued topics.

### Deliberately Rejected
- **Default/synthetic failure probabilities on unestimated dependencies:** rejected because fabricating numbers violates epistemic honesty; unmodeled critical nodes are omitted and surfaced via `CPL-03`.
- **Cross-currency Expected Shortfall aggregation via static FX rates:** rejected to preserve multi-currency accounting integrity.
- **Auto-cutting scope or auto-reassigning stewards without human consent:** rejected; `RULE-CPL-01..02` open undecided DACI trade-offs and `recommend`-level delegations only.


## §69. 2026-10-28 — Practice adoption needs provenance and a later persistence test

### Fresh competitive hunt (official product material inspected 2026-10-28)

- **Lattice, Spring/Summer 2026 product release** ([official](https://lattice.com/blog/lattice-spring-summer-2026-product-release)): Lattice says its AI Agent drafts reviews from 1:1s, prior reviews, growth areas, feedback and related performance data, and has plans for meeting assistance. This is a vendor product description; its reported efficiency claims are not independent evidence of improved performance.
- **15Five, Agents overview updated 2026-10-08** ([official support article](https://success.15five.com/hc/en-us/articles/51450804595483-Agents-Overview)): 15Five describes Focus Briefs, AI-assisted performance-review writing and Meeting Assistant preparation/notes with connected calendar or meeting sources. This is also a vendor description, not a controlled impact evaluation.
- **Gap narrowed:** source-grounded review writing, coaching briefs and meeting action capture are becoming incumbent features. The less integrated problem targeted here is after the manager says “we changed the practice”: whether a *separate dated record* corroborates that claim, whether the artifact later changes, and whether anyone returns to see if the practice persisted. This is a scoped product gap from public descriptions, not a claim no competitor has the feature. Full product trials and exact comparison are [UNVERIFIED].

### What shipped (Schema v44 / ADR-0031)

- Applied lessons may attach up to five dated workspace artifacts from three types only: an anchored organizational change, a completed delegation, or a reviewed decision. The evidence date must be on/after the held review and on/before the human-entered application date. The reviewed subject cannot corroborate itself. Open, undated, out-of-window and unsupported record types are excluded.
- Each attachment stores an explicit human note and a bounded snapshot of the target’s identity/title/status/date/relevant summary. The pure report re-reads the target: any missing, changed or non-qualifying artifact becomes stale. The snapshot is a change detector, not a signature. No NLP or semantic matching is performed.
- `lesson — corroborates → artifact` is a first-class typed graph edge. `RULE-AAR-04` opens one owner-assigned 30-day delegation when an active lesson owner exists. It checks practice persistence and explicitly withholds causal/effect language. No owner means no synthetic assignment.
- Counts remain separate from the composite learning index. The corroboration percentage is withheld below five applied claims; all n<5 reporting is counts-only. Earlier v43 applied claims remain unverified rather than backfilled.

### Framework synthesis, limits, and rejected alternatives

Argyris & Schön’s single-/double-loop distinction motivates separating a claimed change from a repeatable governing practice; Deming’s Plan–Do–Check–Act cycle motivates a later check rather than treating task closure as organizational learning. Engineering provenance contributes a live referential-integrity check; operations management contributes a scheduled sustainment checkpoint; economics says no expected value or ROI can be asserted without a baseline and observed outcomes. The system currently measures only **workspace record corroboration** and schedules a **future human persistence observation**. It does not show independent authorship, implementation quality, semantic relevance, persistence before the due date, causal effect, financial return, or market superiority.

Deliberately rejected: free-text similarity as a relevance classifier; task completion as proof a work practice changed; automatic application status; person-level scoring; treating a linked artifact as causal evidence; and broad exports of sensitive lesson narratives. Prospective effect evaluation with frozen pre-change baselines is the next meaningful extension.
