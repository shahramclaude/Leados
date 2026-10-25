# RESEARCH — what the rules are based on

This file records the leadership frameworks and evidence behind LeadOS, and — more
importantly — what each one turned into in code, or why it was rejected. It is updated
every session. Rules named here are the same ids the app shows on every finding.

Last refreshed: 2026-10-25, session 17. Fresh, pinned-source onboarding/product research
and actionable phase-conversation queues are in §27. Earlier sections preserve prior
research; their external sources were not all refetched this session.

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
