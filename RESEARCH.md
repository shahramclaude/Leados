# RESEARCH — what the rules are based on

This file records the leadership frameworks and evidence behind LeadOS, and — more
importantly — what each one turned into in code, or why it was rejected. It is updated
every session. Rules named here are the same ids the app shows on every finding.

Last refreshed: 2026-10-24, session 5. Longitudinal people-analytics bias guards and safe
HR spreadsheet export standards are in §16; conflict-practice research is in §14; earlier
source summaries are retained as earlier research, not claimed to have all been refetched.

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
