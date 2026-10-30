/**
 * app/core/domain/performance.js — the Performance Recovery Terminal (Schema v62).
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * Every other module in LeadOS prices a decision, a queue, a portfolio or a
 * structure. This one prices the hardest conversation a new manager has to have
 * and usually avoids for months: *someone on my team is not delivering, and I
 * do not know whether the problem is them, me, the role, or the system — and I
 * am afraid of getting it wrong.*
 *
 * Two failures dominate, and they are opposites:
 *
 *   1. **Acting on a feeling.** A manager who has one irritating incident, no
 *      recorded expectation, no two-way conversation and no support decides the
 *      person is a "performance problem". That is how quiet firing starts, and
 *      it is indefensible both ethically and procedurally.
 *   2. **Acting on nothing.** The same gap is visible for nine months, nobody
 *      says anything, the team absorbs the work, and the eventual conversation
 *      arrives as a surprise. That is how good people are lost and how the
 *      manager's own credibility quietly dies.
 *
 * The module is built so the first failure is *hard* (the formal plan is
 * refused until the record can support it) and the second is *visible* (the
 * cost of waiting is arithmetic, not a vibe).
 *
 * NAMED, CITABLE METHODS (product doctrine §0.2)
 * ----------------------------------------------
 *  - **Mager & Pipe (1970, 3rd ed. 1997), *Analyzing Performance Problems***:
 *    before treating a gap as a people problem, answer whether the person
 *    *could* do it if their life depended on it, and whether they *know* what
 *    is expected and when. A "no" points at skill or clarity; a "yes" points at
 *    consequences, obstacles or capacity. The module implements the decision
 *    logic as a declared questionnaire — it never guesses an answer.
 *  - **Leventhal (1980) procedural justice**, with the empirical programme
 *    summarised by **Colquitt et al. (2001)**: consistency, accuracy,
 *    correctability/voice, bias suppression, representativeness (notice) and
 *    ethicality. Each rule is mapped to a fact the record either contains or
 *    does not. A missing fact is a *gap*, not a negative judgement about the
 *    person.
 *  - **Locke & Latham (1990, 2002) goal-setting theory**: a recovery plan is
 *    specific, measurable, time-bounded, and paired with feedback — vague
 *    "step it up" objectives are the reason most improvement plans fail.
 *  - **Bies & Moag (1986) interactional justice / Edmondson (1999)
 *    psychological safety**: the plan is designed around a two-way
 *    conversation, because a plan the person has not been heard in is a plan
 *    they will comply with until they leave.
 *  - **Real options / cost of delay (Reinertsen 2009)**: waiting is not free.
 *    The carrying cost is derived from recorded pay and a declared share of
 *    output, and the cost of acting is the standard replacement-cost
 *    convention already used by the merit module. The break-even is printed as
 *    arithmetic, never as a recommendation to exit.
 *  - **Brier (1950)**: the plan's own written probability of success is frozen
 *    at adoption and scored at review. The module grades *the leader's plan*,
 *    which is the only claim it is entitled to grade.
 *
 * HONESTY BOUNDARIES, ENFORCED IN CODE
 * ------------------------------------
 *  - **No person is scored, rated or profiled.** There is no performance
 *    rating, no potential rating, no nine-box, no ranking, no sentiment or
 *    language analysis. The record measures the leader's evidence and the
 *    situation's economics.
 *  - **The app never takes an adverse action.** It cannot terminate, demote,
 *    dock pay or change a role. It opens a *process* decision with options and
 *    an owner.
 *  - **A formal plan is refused** while a procedural-justice blocker is
 *    unresolved. The leader can override, but only by writing why, and the
 *    override is stored verbatim and displayed beside the plan.
 *  - **Unknown is not zero.** An unanswered question is `null`; an unpriced
 *    cost is `unpriced`; a record with no pay row produces no money figure at
 *    all rather than a plausible default.
 *  - **No legal advice.** The audit is a procedural-fairness checklist, not a
 *    compliance opinion, and the page says so.
 *
 * Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { addDays, dayKey, daysBetween, isOverdue, round } from '../time.js';
import { validateSBI } from './feedback.js';
import { payIndex } from './orgDesign.js';

export const PERFORMANCE_ENGINE_VERSION = 'performance-2026.10-v1';

/* ------------------------------------------------------------------ */
/* 0. Vocabulary and conventions                                       */
/* ------------------------------------------------------------------ */

export const PERFORMANCE_DEFAULTS = Object.freeze({
  // How many dated, specific observations the record needs before a formal
  // plan can be adopted. Three is the floor used by most HR practice; it is a
  // convention, printed beside the refusal it causes.
  perfMinObservations: 3,
  // Observations older than this are not evidence of a current pattern; they
  // are history. They remain visible and are excluded from the live count.
  perfEvidenceWindowDays: 90,
  // Default review horizon for an adopted plan, in days.
  perfReviewHorizonDays: 45,
  // A concern still `assessing` after this many days is drifting.
  perfStaleDays: 14,
  // Replacement-cost convention (months of pay), reused from the merit model.
  perfReplacementMonths: 4,
  // Employer load on recorded base pay, used to turn salary into a daily cost.
  perfEmployerLoadPct: 25,
  perfWorkdaysPerYear: 220,
  // A declared hour of team time. Only used when the leader declares spillover.
  perfHourValue: 250,
  // Minimum SBI quality for an observation to count as specific. The scale is
  // the feedback module's 0–4 (0 empty, 4 specific and repeatable); a floor of
  // 3 means "solid" — all three fields present and answerable.
  perfSbiFloor: 3,
  perfAutoPropagate: true,
});

export function conventionsFromSettings(settings = {}) {
  const s = settings || {};
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const int = (value, fallback, min, max) => Math.min(max, Math.max(min, Math.round(num(value, fallback))));
  return {
    minObservations: int(s.perfMinObservations, PERFORMANCE_DEFAULTS.perfMinObservations, 1, 20),
    evidenceWindowDays: int(s.perfEvidenceWindowDays, PERFORMANCE_DEFAULTS.perfEvidenceWindowDays, 7, 730),
    reviewHorizonDays: int(s.perfReviewHorizonDays, PERFORMANCE_DEFAULTS.perfReviewHorizonDays, 7, 365),
    staleDays: int(s.perfStaleDays, PERFORMANCE_DEFAULTS.perfStaleDays, 1, 180),
    replacementMonths: Math.min(24, Math.max(0, num(s.perfReplacementMonths, PERFORMANCE_DEFAULTS.perfReplacementMonths))),
    employerLoadPct: Math.min(100, Math.max(0, num(s.perfEmployerLoadPct, PERFORMANCE_DEFAULTS.perfEmployerLoadPct))),
    workdaysPerYear: int(s.perfWorkdaysPerYear, PERFORMANCE_DEFAULTS.perfWorkdaysPerYear, 100, 366),
    hourValue: Math.min(100000, Math.max(0, num(s.perfHourValue, PERFORMANCE_DEFAULTS.perfHourValue))),
    sbiFloor: int(s.perfSbiFloor, PERFORMANCE_DEFAULTS.perfSbiFloor, 0, 4),
    autoPropagate: s.perfAutoPropagate !== false,
  };
}

/** Signal ids, stable so the same finding is recognisable across sessions. */
export const PERFORMANCE_SIGNAL_IDS = Object.freeze([
  'PERF-01', // no recorded expectation
  'PERF-02', // formal plan on evidence below the floor
  'PERF-03', // remedy does not match the diagnosed cause
  'PERF-04', // no recorded two-way conversation
  'PERF-05', // review passed without an outcome
  'PERF-06', // concern drifting in assessing
  'PERF-07', // plan prediction resolved badly with no next step
  'PERF-08', // live concern resting on stale evidence
]);

/**
 * The Mager–Pipe causes. Each carries the question that distinguishes it and
 * the remedies the evidence says should exist before a formal plan does.
 */
export const CAUSE_DEFINITIONS = Object.freeze({
  'skill-gap': {
    label: 'Skill or knowledge gap',
    question: 'Could they do it if their life depended on it?',
    reading: 'The leader declared they could not. That points at skill or knowledge, and the matching remedy is practice, training or coaching — not a formal warning.',
    remedies: ['training', 'coaching', 'feedback'],
    expectedSupport: ['training', 'coaching'],
  },
  'expectation-unclear': {
    label: 'Unclear expectation',
    question: 'Do they know exactly what is expected, and by when?',
    reading: 'The leader declared they do not know what "good" looks like or when it is due. The gap may be in the instruction, not the person.',
    remedies: ['clarity', 'feedback'],
    expectedSupport: ['clarity'],
  },
  obstacle: {
    label: 'Obstacle in the way',
    question: 'Is something or someone blocking the work?',
    reading: 'The leader declared an obstacle. Removing it is usually cheaper than replacing the person, and no amount of effort fixes a blocked path.',
    remedies: ['tooling', 'workload', 'clarity'],
    expectedSupport: ['tooling', 'workload'],
  },
  capacity: {
    label: 'Capacity and priorities',
    question: 'Do they have the time, given everything else they own?',
    reading: 'The leader declared the person is over-committed. The gap is a portfolio problem before it is a performance problem.',
    remedies: ['workload', 'clarity'],
    expectedSupport: ['workload'],
  },
  consequence: {
    label: 'Consequences not aligned',
    question: 'Does good work here go unnoticed — or cost them?',
    reading: 'The leader declared that doing the work well brings no benefit, or costs something. That is an incentive design question, and the matching remedy is a visible consequence, not a warning.',
    remedies: ['feedback', 'clarity'],
    expectedSupport: ['feedback'],
  },
  'feedback-gap': {
    label: 'No feedback loop',
    question: 'Have they been told, close enough to the event to act on it?',
    reading: 'The leader declared they have not had a usable feedback loop. People cannot correct what they have never been shown.',
    remedies: ['feedback', 'coaching'],
    expectedSupport: ['feedback'],
  },
  'no-deficit': {
    label: 'No cause found in the answers',
    question: 'Every declared cause is ruled out — is this the right role?',
    reading: 'The leader declared that the person could do it, knows what and when, faces no obstacle, has capacity, sees the consequence and gets feedback. That combination is not a performance problem the person can fix; it is a role, assignment or expectation question for the leader.',
    remedies: ['clarity'],
    expectedSupport: [],
  },
  unknown: {
    label: 'Not yet diagnosed',
    question: 'The analysis questions have not been answered',
    reading: 'The record has not answered enough of the analysis questions to name a cause. A formal plan adopted here would be an action without a diagnosis.',
    remedies: [],
    expectedSupport: [],
  },
});

export const JUSTICE_RULE_IDS = Object.freeze([
  'notice',
  'accuracy',
  'consistency',
  'voice',
  'bias-suppression',
  'support',
]);

export const JUSTICE_RULES = Object.freeze({
  notice: {
    label: 'Notice — the expectation came first',
    detail: 'Leventhal’s representativeness rule: a person can only be held to a standard they were told about before the gap appeared.',
  },
  accuracy: {
    label: 'Accuracy — specific, dated observations',
    detail: 'Specific instances (situation, behaviour, impact) with dates. Not a general impression, and not one bad afternoon.',
  },
  consistency: {
    label: 'Consistency — a pattern, not a moment',
    detail: 'At least two distinct dates inside the evidence window. One incident is an incident.',
  },
  voice: {
    label: 'Voice — they were heard',
    detail: 'Correctability: a recorded two-way conversation on or after the first observation, where the person could respond.',
  },
  'bias-suppression': {
    label: 'Bias suppression — behaviour, not character',
    detail: 'No character labels (“lazy”, “difficult”, “bad attitude”). Labels are not observable and cannot be answered.',
  },
  support: {
    label: 'Support — something was actually tried',
    detail: 'At least one remedy matching the diagnosed cause was provided before a formal plan. A plan without support is a trap with a calendar.',
  },
});

const CHARACTER_LABELS = [
  { re: /\b(lazy|sloppy|careless|difficult|negative|toxic|unmotivated)\b/i, tip: 'character label' },
  { re: /\b(attitude|personality|not a team player|bad fit)\b/i, tip: 'personality judgement' },
  { re: /\b(always|never|constantly|every single time)\b/i, tip: 'generalisation' },
  { re: /\b(everyone|the team|people)\s+(thinks|feels|says)\b/i, tip: 'unnamed others' },
];

function characterLabelHit(text) {
  const value = String(text || '');
  const hits = [];
  for (const pattern of CHARACTER_LABELS) {
    if (pattern.re.test(value)) hits.push(pattern.tip);
  }
  return [...new Set(hits)];
}

/* ------------------------------------------------------------------ */
/* 1. Evidence                                                         */
/* ------------------------------------------------------------------ */

function sortedObservations(concern) {
  return (Array.isArray(concern?.observations) ? concern.observations : [])
    .filter((row) => row && row.date)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Count what the record actually contains. Nothing here is a judgement about
 * the person: these are counts of the leader's own entries.
 */
export function evidenceAudit(concern, now = new Date(), conventions = conventionsFromSettings({})) {
  const conv = { ...PERFORMANCE_DEFAULTS, ...(conventions || {}) };
  const today = dayKey(now);
  const all = sortedObservations(concern);
  const rows = all.map((row) => {
    const age = daysBetween(row.date, today);
    const sbi = validateSBI({ situation: row.situation, behavior: row.behavior, impact: row.impact });
    return {
      ...row,
      ageDays: age,
      inWindow: age !== null && age >= 0 && age <= conv.evidenceWindowDays,
      sbiQuality: sbi.quality,
      sbiComplete: sbi.complete,
      specific: sbi.complete && sbi.quality >= conv.sbiFloor,
      tips: sbi.tips,
    };
  });
  const live = rows.filter((row) => row.inWindow);
  const dates = [...new Set(live.map((row) => row.date))].sort();
  const first = rows.length ? rows[0] : null;
  const last = rows.length ? rows[rows.length - 1] : null;
  return {
    rows,
    total: rows.length,
    liveCount: live.length,
    staleCount: rows.length - live.length,
    distinctDates: dates.length,
    firstDate: first ? first.date : null,
    lastDate: last ? last.date : null,
    specificCount: live.filter((row) => row.specific).length,
    completeCount: live.filter((row) => row.sbiComplete).length,
    averageQuality: live.length ? round(live.reduce((sum, row) => sum + row.sbiQuality, 0) / live.length, 1) : null,
    sourceCount: new Set(live.map((row) => row.source)).size,
    windowDays: conv.evidenceWindowDays,
    floor: conv.minObservations,
    meetsFloor: live.length >= conv.minObservations,
    meetsDateFloor: dates.length >= 2,
    // Human-readable counts, used by the view and the brief.
    summary: live.length
      ? `${live.length} live observation(s) on ${dates.length} distinct date(s); ${live.filter((row) => row.specific).length} specific.`
      : 'No live observations inside the evidence window.',
  };
}

/* ------------------------------------------------------------------ */
/* 2. Procedural justice                                               */
/* ------------------------------------------------------------------ */

function recordedConversationAfter(concern, day) {
  const conversations = (Array.isArray(concern?.conversations) ? concern.conversations : [])
    .filter((row) => row && row.kind === 'two-way' && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return conversations.find((row) => !day || row.date >= day) || null;
}

function heldOneOnOneAfter(state, personId, day) {
  if (!personId) return null;
  const meetings = (Array.isArray(state?.oneOnOnes) ? state.oneOnOnes : [])
    .filter((row) => row && row.personId === personId && row.status === 'held' && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return meetings.find((row) => !day || row.date >= day) || null;
}

/**
 * Map the six procedural-justice rules onto checkable facts.
 *
 * `blocking: true` means a formal plan cannot be adopted without an explicit,
 * written override. Every rule reports the fix, not just the failure.
 */
export function proceduralJustice(state, concern, now = new Date(), conventions = conventionsFromSettings({}), evidence = null) {
  const conv = { ...PERFORMANCE_DEFAULTS, ...(conventions || {}) };
  const audit = evidence || evidenceAudit(concern, now, conv);
  const today = dayKey(now);
  const rules = [];

  // 1. Notice -------------------------------------------------------------
  const expectation = concern?.standard || {};
  const noticeDate = expectation.recordedOn || null;
  const firstDate = audit.firstDate;
  let notice;
  if (!expectation.expectation || expectation.source === 'none') {
    notice = {
      status: 'gap',
      detail: 'No expectation is recorded at all, so nothing was ever stated to hold anyone to.',
      fix: 'Write the expectation down and record the date you communicate it. The clock on everything else starts there.',
    };
  } else if (!noticeDate) {
    notice = {
      status: 'unknown',
      detail: 'An expectation exists but has no recorded date, so notice cannot be established either way.',
      fix: 'Record the date the expectation was communicated. Without it this rule is unknowable, not satisfied.',
    };
  } else if (firstDate && noticeDate > firstDate) {
    notice = {
      status: 'gap',
      detail: `The expectation is dated ${noticeDate}, after the first observation (${firstDate}). The person was being measured against a standard they had not yet been given.`,
      fix: 'Record the expectation you can honestly defend as prior, or treat the observations before it as coaching rather than evidence.',
    };
  } else {
    notice = {
      status: 'met',
      detail: `The expectation is dated ${noticeDate}, on or before the first observation (${firstDate || 'none yet'}).`,
      fix: '',
    };
  }
  rules.push({ id: 'notice', ...JUSTICE_RULES.notice, status: notice.status, detail: notice.detail, fix: notice.fix, blocking: true });

  // 2. Accuracy -----------------------------------------------------------
  const accuracy = audit.liveCount === 0
    ? {
        status: 'gap',
        detail: 'There are no observations inside the evidence window.',
        fix: 'Record the specific instances you actually remember, with dates. Nothing else can be audited.',
      }
    : audit.specificCount >= Math.min(audit.floor, audit.liveCount)
      ? {
          status: 'met',
          detail: `${audit.specificCount} of ${audit.liveCount} live observation(s) are specific enough to be answered (average quality ${audit.averageQuality}/4).`,
          fix: '',
        }
      : {
          status: 'gap',
          detail: `Only ${audit.specificCount} of ${audit.liveCount} live observation(s) are specific enough to be answered (average quality ${audit.averageQuality}/4, floor ${conv.sbiFloor}).`,
          fix: 'Rewrite the vague entries as situation → behaviour → impact. A person cannot respond to an impression.',
        };
  rules.push({ id: 'accuracy', ...JUSTICE_RULES.accuracy, status: accuracy.status, detail: accuracy.detail, fix: accuracy.fix, blocking: true });

  // 3. Consistency --------------------------------------------------------
  const consistency = audit.distinctDates >= 2
    ? {
        status: 'met',
        detail: `${audit.distinctDates} distinct dates inside the ${audit.windowDays}-day window.`,
        fix: '',
      }
    : {
        status: 'gap',
        detail: audit.distinctDates === 1
          ? 'Every observation is on the same day. That is one incident, not a pattern.'
          : 'No dated observations, so there is no pattern to establish.',
        fix: 'Either wait for a second dated instance or reframe this as immediate coaching, which needs no pattern.',
      };
  rules.push({ id: 'consistency', ...JUSTICE_RULES.consistency, status: consistency.status, detail: consistency.detail, fix: consistency.fix, blocking: true });

  // 4. Voice --------------------------------------------------------------
  const conversation = recordedConversationAfter(concern, firstDate);
  const meeting = conversation ? null : heldOneOnOneAfter(state, concern?.personId, firstDate);
  const voice = conversation || meeting
    ? {
        status: 'met',
        detail: conversation
          ? `A recorded two-way conversation on ${conversation.date} came after the first observation (${firstDate}).`
          : `A held 1:1 on ${meeting.date} came after the first observation (${firstDate}).`,
        fix: '',
      }
    : {
        status: 'gap',
        detail: 'No recorded two-way conversation after the first observation. The person has not had a chance to answer.',
        fix: 'Hold the conversation and record it — their view, in their words, not your summary of it.',
      };
  rules.push({ id: 'voice', ...JUSTICE_RULES.voice, status: voice.status, detail: voice.detail, fix: voice.fix, blocking: true });

  // 5. Bias suppression ---------------------------------------------------
  const texts = [
    concern?.standard?.expectation,
    concern?.gap?.observed,
    concern?.gap?.impact,
    ...(concern?.observations || []).flatMap((row) => [row.situation, row.behavior, row.impact, row.note]),
  ];
  const labelHits = [...new Set(texts.flatMap((text) => characterLabelHit(text)))];
  const bias = labelHits.length
    ? {
        status: 'gap',
        detail: `Character language found: ${labelHits.join(', ')}. These are judgements about a person, not observable behaviour.`,
        fix: 'Replace each label with what someone could have filmed, and what changed as a result.',
      }
    : {
        status: 'met',
        detail: 'No character labels or generalisations detected in the expectation, gap or observations.',
        fix: '',
      };
  rules.push({ id: 'bias-suppression', ...JUSTICE_RULES['bias-suppression'], status: bias.status, detail: bias.detail, fix: bias.fix, blocking: true });

  // 6. Support ------------------------------------------------------------
  // The adequacy reading is supplied by the caller (it depends on diagnosis);
  // here we only ask whether anything was tried at all.
  const supports = (concern?.supports || []).filter((row) => row && row.kind && row.kind !== 'none');
  const support = supports.length
    ? {
        status: 'met',
        detail: `${supports.length} recorded support action(s): ${[...new Set(supports.map((row) => row.kind))].join(', ')}.`,
        fix: '',
      }
    : {
        status: 'gap',
        detail: 'No support action is recorded. Nothing has been changed to make the expectation achievable.',
        fix: 'Provide the remedy the diagnosis implies, record the date, and give it a fair window before escalating.',
      };
  rules.push({ id: 'support', ...JUSTICE_RULES.support, status: support.status, detail: support.detail, fix: support.fix, blocking: supports.length === 0 });

  const blockers = rules.filter((rule) => rule.blocking && rule.status !== 'met');
  const metCount = rules.filter((rule) => rule.status === 'met').length;
  return {
    rules,
    blockers,
    metCount,
    total: rules.length,
    canFormalPlan: blockers.length === 0,
    verdict: blockers.length === 0
      ? 'The record can support a formal plan.'
      : `${blockers.length} due-process gap(s) remain — a formal plan cannot be supported by this record yet.`,
    checkedOn: today,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Cause analysis (Mager–Pipe)                                      */
/* ------------------------------------------------------------------ */

const QUESTION_ORDER = [
  'couldDoIfTried',
  'knowsWhat',
  'knowsWhen',
  'obstacle',
  'consequenceMissing',
  'capacity',
  'feedbackLoop',
];

export function analyseCause(concern) {
  const answers = concern?.answers || {};
  const answered = QUESTION_ORDER.filter((key) => answers[key] === true || answers[key] === false);
  const missing = QUESTION_ORDER.filter((key) => answers[key] !== true && answers[key] !== false);
  const reasons = [];
  let primary = 'unknown';

  if (answers.couldDoIfTried === false) {
    primary = 'skill-gap';
    reasons.push('Could not do it even if their life depended on it — a skill or knowledge deficiency.');
  } else if (answers.knowsWhat === false || answers.knowsWhen === false) {
    primary = 'expectation-unclear';
    if (answers.knowsWhat === false) reasons.push('Does not know what "good" looks like.');
    if (answers.knowsWhen === false) reasons.push('Does not know when it is due.');
  } else if (answers.couldDoIfTried === true) {
    // A performance deficiency: the person can do it. Ask what is in the way.
    if (answers.obstacle === true) {
      primary = 'obstacle';
      reasons.push('Could do it, but something is in the way.');
    } else if (answers.capacity === true) {
      primary = 'capacity';
      reasons.push('Could do it, but does not have the time given everything else.');
    } else if (answers.consequenceMissing === true) {
      primary = 'consequence';
      reasons.push('Could do it, but doing it well brings no visible consequence (or costs something).');
    } else if (answers.feedbackLoop === false) {
      primary = 'feedback-gap';
      reasons.push('Could do it, but has had no usable feedback loop close enough to act on.');
    } else if (missing.length === 0) {
      primary = 'no-deficit';
      reasons.push('Every declared cause is ruled out. That is a role, assignment or expectation question for the leader, not a person defect.');
    }
  }

  const secondary = [];
  const pushSecondary = (cause, condition, text) => {
    if (!condition) return;
    if (cause === primary) return;
    secondary.push({ cause, text });
  };
  pushSecondary('obstacle', answers.obstacle === true, 'An obstacle is also recorded.');
  pushSecondary('capacity', answers.capacity === true, 'Capacity is also constrained.');
  pushSecondary('consequence', answers.consequenceMissing === true, 'The consequence structure is also misaligned.');
  pushSecondary('feedback-gap', answers.feedbackLoop === false, 'The feedback loop is also missing.');
  pushSecondary('expectation-unclear', answers.knowsWhat === false || answers.knowsWhen === false, 'Expectations are also unclear.');

  const definition = CAUSE_DEFINITIONS[primary] || CAUSE_DEFINITIONS.unknown;
  const confidence = primary === 'unknown'
    ? 'none'
    : missing.length === 0 ? 'high' : missing.length <= 2 ? 'medium' : 'low';

  return {
    primary,
    label: definition.label,
    question: definition.question,
    reading: definition.reading,
    remedies: definition.remedies,
    expectedSupport: definition.expectedSupport,
    secondary,
    reasons,
    answeredCount: answered.length,
    missing,
    confidence,
    diagnosed: primary !== 'unknown',
    // The diagnosis is of the SITUATION the leader described. It is not a
    // measurement of the person and the UI says so.
    basis: 'Answers the leader declared. The model names the most likely class of cause; it does not measure a person.',
  };
}

/* ------------------------------------------------------------------ */
/* 4. Support adequacy                                                 */
/* ------------------------------------------------------------------ */

export function supportAdequacy(concern, diagnosis) {
  const given = [...new Set((concern?.supports || [])
    .filter((row) => row && row.kind && row.kind !== 'none')
    .map((row) => row.kind))];
  const expected = [...new Set(diagnosis?.expectedSupport || [])];
  if (!diagnosis?.diagnosed) {
    return {
      status: 'unknown',
      given,
      expected,
      missing: [],
      detail: 'The cause is not diagnosed, so no remedy can be judged as matching or mismatched.',
    };
  }
  if (!expected.length) {
    return {
      status: 'not-applicable',
      given,
      expected,
      missing: [],
      detail: 'This cause class has no remedy of its own — the question is the role or the assignment, not the support.',
    };
  }
  const missing = expected.filter((kind) => !given.includes(kind));
  const status = missing.length === 0 ? 'matched' : given.some((kind) => expected.includes(kind)) ? 'partial' : 'mismatch';
  return {
    status,
    given,
    expected,
    missing,
    detail: status === 'matched'
      ? `Every remedy this cause implies is recorded (${expected.join(', ')}).`
      : status === 'partial'
        ? `Some matching remedy is recorded, but ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} missing.`
        : `None of the remedies this cause implies (${expected.join(', ')}) is recorded. The support does not match the diagnosis.`,
  };
}

/* ------------------------------------------------------------------ */
/* 5. Economics: cost of waiting, cost of acting                       */
/* ------------------------------------------------------------------ */

function currencyForCycle(state, cycleId) {
  const cycle = (state?.meritCycles || []).find((row) => row && row.id === cycleId);
  return cycle && /^[A-Z]{3}$/.test(String(cycle.currency || '')) ? String(cycle.currency) : null;
}

/**
 * Price the gap. Every input is either a recorded pay figure or a declared
 * convention; an absent input produces `unpriced`, never a default salary.
 */
export function costOfInaction(state, concern, now = new Date(), conventions = conventionsFromSettings({})) {
  const conv = { ...PERFORMANCE_DEFAULTS, ...(conventions || {}) };
  const pay = concern?.personId ? payIndex(state, now).get(concern.personId) : null;
  const currency = concern?.gap?.currency || (pay ? currencyForCycle(state, pay.cycleId) : null) || 'USD';
  const annual = pay ? Number(pay.annual) : null;
  const loadedDaily = annual
    ? round((annual * (1 + conv.employerLoadPct / 100)) / conv.workdaysPerYear, 2)
    : null;
  const gapShare = typeof concern?.gap?.gapSharePct === 'number' ? concern.gap.gapSharePct / 100 : null;
  const carryDaily = loadedDaily !== null && gapShare !== null ? round(loadedDaily * gapShare, 2) : null;
  const spillDaily = typeof concern?.gap?.teamHoursPerWeek === 'number' && concern.gap.teamHoursPerWeek > 0
    ? round((concern.gap.teamHoursPerWeek / 5) * conv.hourValue, 2)
    : null;
  const totalDaily = carryDaily !== null || spillDaily !== null
    ? round((carryDaily || 0) + (spillDaily || 0), 2)
    : null;
  const replacementCost = annual ? round((annual * conv.replacementMonths) / 12, 2) : null;
  const breakEvenDays = replacementCost !== null && totalDaily !== null && totalDaily > 0
    ? Math.ceil(replacementCost / totalDaily)
    : null;

  const terms = [];
  if (annual !== null) {
    terms.push({
      label: 'Recorded annual pay (merit cycle)',
      value: annual,
      basis: `Merit cycle ${pay.cycleId}${pay.effectiveOn ? ` effective ${pay.effectiveOn}` : ''}`,
    });
    terms.push({
      label: `Loaded daily cost at ${conv.employerLoadPct}% employer load over ${conv.workdaysPerYear} working days`,
      value: loadedDaily,
      basis: 'A declared convention, not payroll data',
    });
    terms.push({
      label: 'Daily carrying cost of the gap',
      value: carryDaily,
      basis: `Declared ${Math.round((gapShare || 0) * 100)}% of expected output is missing`,
    });
  }
  if (spillDaily !== null) {
    terms.push({
      label: 'Team time absorbed per day',
      value: spillDaily,
      basis: `${concern.gap.teamHoursPerWeek} declared team hours/week at ${conv.hourValue}/hour`,
    });
  }
  if (replacementCost !== null) {
    terms.push({
      label: 'Replacement cost convention',
      value: replacementCost,
      basis: `${conv.replacementMonths} months of pay — the merit module’s convention, not a quote`,
    });
  }

  return {
    priced: totalDaily !== null,
    currency,
    annual,
    loadedDaily,
    carryDaily,
    spillDaily,
    totalDaily,
    replacementCost,
    breakEvenDays,
    terms,
    gapSharePct: concern?.gap?.gapSharePct ?? null,
    // The honest sentence. This is arithmetic about a record, not advice about
    // a person, and the tool never recommends an exit.
    note: totalDaily === null
      ? 'No recorded pay row and no declared spillover, so this gap is unpriced. It is not zero — the cost is simply unknown here.'
      : breakEvenDays === null
        ? 'A daily carrying cost is priced, but no replacement cost is available to compare it with.'
        : `At the declared gap the carrying cost equals the replacement-cost convention after ${breakEvenDays} working day(s). This is arithmetic on declared inputs; it is not a recommendation to exit and the app takes no adverse action.`,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Plan and prediction                                              */
/* ------------------------------------------------------------------ */

export function planReadiness(concern, now = new Date()) {
  const plan = concern?.plan || null;
  if (!plan) return { state: 'none', overdue: false, daysToReview: null, detail: 'No plan has been adopted.' };
  const outcome = concern?.outcome || null;
  if (outcome && outcome.verdict) {
    return { state: 'reviewed', overdue: false, daysToReview: null, detail: `Reviewed ${outcome.reviewedOn || 'without a date'}: ${outcome.verdict}.` };
  }
  const daysToReview = plan.reviewOn ? daysBetween(dayKey(now), plan.reviewOn) : null;
  const overdue = plan.reviewOn ? isOverdue(plan.reviewOn, now) : false;
  return {
    state: overdue ? 'overdue' : 'active',
    overdue,
    daysToReview,
    detail: plan.reviewOn
      ? overdue
        ? `The review date (${plan.reviewOn}) has passed without an outcome.`
        : `Review due ${plan.reviewOn} (${daysToReview} day(s)).`
      : 'The plan has no review date, so it cannot come due.',
  };
}

/** Score the plan's frozen prediction. Withheld below the cohort floor. */
export const PERFORMANCE_MIN_RESOLVED = 5;

export function predictionOutcome(concern) {
  const prediction = concern?.plan?.prediction || null;
  const verdict = concern?.outcome?.verdict || null;
  if (!prediction || prediction.probabilityPct === null || prediction.probabilityPct === undefined) return null;
  if (!verdict) return null;
  const actual = verdict === 'met' ? 1 : verdict === 'partial' ? 0.5 : 0;
  const p = prediction.probabilityPct / 100;
  return {
    probability: p,
    actual,
    brier: round((p - actual) ** 2, 4),
    verdict,
  };
}

export function performanceCalibration(concerns = []) {
  const rows = concerns.map(predictionOutcome).filter(Boolean);
  if (rows.length < PERFORMANCE_MIN_RESOLVED) {
    return {
      ready: false,
      n: rows.length,
      floor: PERFORMANCE_MIN_RESOLVED,
      brier: null,
      note: `Scored plans are withheld below ${PERFORMANCE_MIN_RESOLVED} resolved outcomes (${rows.length} so far). An average over four cases is an anecdote with a decimal point.`,
    };
  }
  const brier = round(rows.reduce((sum, row) => sum + row.brier, 0) / rows.length, 4);
  return {
    ready: true,
    n: rows.length,
    floor: PERFORMANCE_MIN_RESOLVED,
    brier,
    note: `Brier score ${brier} over ${rows.length} resolved plans (lower is better; 0.25 is the score of always saying 50%).`,
  };
}

/* ------------------------------------------------------------------ */
/* 7. The full assessment                                              */
/* ------------------------------------------------------------------ */

export function assessConcern(state, concern, now = new Date(), settings = {}) {
  const conventions = conventionsFromSettings(settings);
  const evidence = evidenceAudit(concern, now, conventions);
  const diagnosis = analyseCause(concern);
  const support = supportAdequacy(concern, diagnosis);
  const justice = proceduralJustice(state, concern, now, conventions, evidence);
  // A cause the record cannot name is a due-process blocker in its own right:
  // a plan without a diagnosis is an action without a reason.
  const plan = planReadiness(concern, now);
  const economics = costOfInaction(state, concern, now, conventions);
  const person = (state?.people || []).find((row) => row && row.id === concern?.personId) || null;
  const blockers = [...justice.blockers];
  if (!diagnosis.diagnosed) {
    blockers.push({
      id: 'diagnosis',
      label: 'Diagnosis — the cause has not been named',
      status: 'gap',
      detail: `Unanswered: ${diagnosis.missing.length ? diagnosis.missing.join(', ') : 'the analysis questions'}. A formal plan adopted without a cause is an action looking for a reason.`,
      fix: 'Answer the performance-analysis questions. If you cannot, the honest next step is a conversation, not a plan.',
      blocking: true,
    });
  }
  const warnings = [];
  if (support.status === 'mismatch') {
    warnings.push({
      id: 'remedy-mismatch',
      detail: `The support on record does not match the diagnosed cause. Expected: ${support.expected.join(', ') || 'none'}. Recorded: ${support.given.join(', ') || 'nothing'}.`,
    });
  }
  const open = ['assessing', 'plan', 'monitoring'].includes(concern?.status);
  return {
    concernId: concern?.id || null,
    label: concern?.label || 'Performance concern',
    status: concern?.status || 'assessing',
    person: person ? { id: person.id, name: person.name, role: person.role || '' } : null,
    evidence,
    diagnosis,
    support,
    justice,
    plan,
    economics,
    blockers,
    warnings,
    canFormalPlan: blockers.length === 0,
    open,
    attention: open && (blockers.length > 0 || plan.overdue || evidence.staleCount > 0 || (concern?.status === 'assessing' && daysBetween(concern?.openedOn, dayKey(now)) > conventions.staleDays)),
    prediction: predictionOutcome(concern),
  };
}

/* ------------------------------------------------------------------ */
/* 8. Portfolio report and signals                                     */
/* ------------------------------------------------------------------ */

export function performanceReport(state, now = new Date(), settings = {}) {
  const conventions = conventionsFromSettings(settings);
  const concerns = (Array.isArray(state?.performanceConcerns) ? state.performanceConcerns : [])
    .map((concern) => ({ concern, assessment: assessConcern(state, concern, now, settings) }));
  const open = concerns.filter((row) => row.assessment.open);
  const byStatus = {};
  for (const row of concerns) byStatus[row.concern.status] = (byStatus[row.concern.status] || 0) + 1;
  const priced = open.filter((row) => row.assessment.economics.priced);
  const dailyCarryByCurrency = new Map();
  for (const row of priced) {
    const { currency, totalDaily } = row.assessment.economics;
    dailyCarryByCurrency.set(currency, round((dailyCarryByCurrency.get(currency) || 0) + totalDaily, 2));
  }
  return {
    concerns,
    open,
    counts: {
      total: concerns.length,
      open: open.length,
      byStatus,
      blocked: open.filter((row) => !row.assessment.canFormalPlan).length,
      overdueReviews: open.filter((row) => row.assessment.plan.overdue).length,
      unpriced: open.length - priced.length,
    },
    exposure: [...dailyCarryByCurrency.entries()]
      .map(([currency, perDay]) => ({ currency, perDay, perWeek: round(perDay * 5, 2) }))
      .sort((a, b) => b.perDay - a.perDay),
    calibration: performanceCalibration(concerns.map((row) => row.concern)),
    conventions,
  };
}

export function performanceSignals(state, now = new Date(), settings = {}) {
  const report = performanceReport(state, now, settings);
  const signals = [];
  const route = (id) => `#/performance?tab=concerns&concern=${encodeURIComponent(id)}`;
  for (const { concern, assessment } of report.open) {
    const firstObservation = assessment.evidence.firstDate;
    if (!concern.standard?.recordedOn || concern.standard?.source === 'none') {
      signals.push({
        ruleId: 'PERF-01',
        domain: 'Performance recovery',
        severity: 4,
        title: `“${concern.label}” has no recorded expectation behind it`,
        detail: 'Nothing was ever written down, so there is no standard the person can be held to and no date that establishes notice. Write it, communicate it, and date it before treating anything as a formal gap.',
        evidence: [`${assessment.evidence.total} observation(s) on record`, `Expectation source: ${concern.standard?.source || 'none'}`],
        action: { label: 'Open the evidence audit', route: route(concern.id) },
      });
    }
    if (['plan', 'monitoring'].includes(concern.status) && !assessment.canFormalPlan && !concern.plan?.overrideReason) {
      signals.push({
        ruleId: 'PERF-02',
        domain: 'Performance recovery',
        severity: 4,
        title: `“${concern.label}” is under a formal plan the record cannot support`,
        detail: assessment.justice.verdict,
        evidence: assessment.blockers.map((b) => `${b.label}: ${b.detail}`).slice(0, 4),
        action: { label: 'Open the evidence audit', route: route(concern.id) },
      });
    }
    if (assessment.support.status === 'mismatch') {
      signals.push({
        ruleId: 'PERF-03',
        domain: 'Performance recovery',
        severity: 3,
        title: `The support for “${concern.label}” does not match its diagnosed cause`,
        detail: assessment.support.detail,
        evidence: [`Diagnosed cause: ${assessment.diagnosis.label}`, `Expected remedy: ${assessment.support.expected.join(', ') || 'none'}`],
        action: { label: 'Open the diagnosis', route: `${route(concern.id)}&panel=diagnosis` },
      });
    }
    if (assessment.justice.rules.find((r) => r.id === 'voice')?.status !== 'met' && firstObservation) {
      signals.push({
        ruleId: 'PERF-04',
        domain: 'Performance recovery',
        severity: 4,
        title: `Nobody has heard “${concern.label}” since the first observation`,
        detail: 'No two-way conversation is recorded after the first dated observation. A concern the person has never been invited to answer is a decision made about them, not with them.',
        evidence: [`First observation ${firstObservation}`, `${assessment.evidence.liveCount} live observation(s)`],
        action: { label: 'Open the conversation plan', route: `${route(concern.id)}&panel=conversation` },
      });
    }
    if (assessment.plan.overdue) {
      signals.push({
        ruleId: 'PERF-05',
        domain: 'Performance recovery',
        severity: 4,
        title: `The review for “${concern.label}” has passed without an outcome`,
        detail: 'An improvement plan with no review is a hope. Record what actually happened — met, partial or not met — so the frozen prediction can be scored.',
        evidence: [`Review due ${concern.plan?.reviewOn}`, `Adopted ${concern.plan?.adoptedOn || 'without a date'}`],
        action: { label: 'Record the review', route: `${route(concern.id)}&panel=plan` },
      });
    }
    if (concern.status === 'assessing' && assessment.plan.state === 'none') {
      const age = daysBetween(concern.openedOn, dayKey(now));
      if (age !== null && age > report.conventions.staleDays) {
        signals.push({
          ruleId: 'PERF-06',
          domain: 'Performance recovery',
          severity: 3,
          title: `“${concern.label}” has been assessing for ${age} days`,
          detail: 'A concern that stays in assessment becomes a story the team tells instead of a conversation the leader has. Either take the next step or withdraw it with a reason.',
          evidence: [`Opened ${concern.openedOn}`, `Threshold ${report.conventions.staleDays} days`],
          action: { label: 'Open the concern', route: route(concern.id) },
        });
      }
    }
    if (concern.outcome?.verdict === 'not-met' && !(concern.plan?.overrideReason && concern.status === 'plan')) {
      signals.push({
        ruleId: 'PERF-07',
        domain: 'Performance recovery',
        severity: 3,
        title: `“${concern.label}” was not met — the next step is a decision, not a drift`,
        detail: 'The plan has been reviewed as not met. Record the next step as a decision with options and an owner. The app does not recommend an outcome and takes no adverse action.',
        evidence: [`Reviewed ${concern.outcome?.reviewedOn || 'without a date'}`],
        action: { label: 'Open the plan', route: `${route(concern.id)}&panel=plan` },
      });
    }
    if (assessment.evidence.staleCount > 0) {
      signals.push({
        ruleId: 'PERF-08',
        domain: 'Performance recovery',
        severity: 2,
        title: `${assessment.evidence.staleCount} observation(s) behind “${concern.label}” are outside the evidence window`,
        detail: `Only observations inside ${assessment.evidence.windowDays} days count as evidence of a current pattern. Older entries are history and are excluded from the live count.`,
        evidence: [`${assessment.evidence.liveCount} live · ${assessment.evidence.staleCount} stale`],
        action: { label: 'Open the evidence audit', route: route(concern.id) },
      });
    }
  }
  return signals;
}

export function performanceAttentionCount(state, now = new Date(), settings = {}) {
  return performanceSignals(state, now, settings).filter((signal) => signal.severity >= 3).length;
}

/* ------------------------------------------------------------------ */
/* 9. Deterministic brief (no names)                                   */
/* ------------------------------------------------------------------ */

export function performanceBrief(state, now = new Date(), settings = {}) {
  const report = performanceReport(state, now, settings);
  const lines = [];
  lines.push('PERFORMANCE RECOVERY — INTERNAL PROCESS BRIEF');
  lines.push(`Generated ${dayKey(now)} · ${report.counts.open} open concern(s) of ${report.counts.total}`);
  lines.push('');
  if (!report.counts.total) {
    lines.push('No performance concern is recorded. That is not evidence that none exists — it is evidence that none was recorded.');
    return lines.join('\n');
  }
  lines.push(`Open: ${report.counts.open} · awaiting evidence: ${report.counts.blocked} · overdue reviews: ${report.counts.overdueReviews} · unpriced: ${report.counts.unpriced}`);
  for (const currencyRow of report.exposure) {
    lines.push(`Carrying cost of open gaps: ${currencyRow.currency} ${currencyRow.perDay}/working day (${currencyRow.perWeek}/week), declared inputs only.`);
  }
  lines.push('');
  for (const { concern, assessment } of report.concerns) {
    lines.push(`- ${concern.label} [${concern.status}]`);
    lines.push(`  Cause: ${assessment.diagnosis.label} (${assessment.diagnosis.confidence} confidence) · Evidence: ${assessment.evidence.summary}`);
    lines.push(`  Due process: ${assessment.justice.metCount}/${assessment.justice.total} rules met${assessment.blockers.length ? ` · ${assessment.blockers.length} blocker(s)` : ''}`);
    lines.push(`  Plan: ${assessment.plan.detail}`);
    lines.push(`  Cost: ${assessment.economics.note}`);
  }
  lines.push('');
  lines.push('Names are deliberately omitted from this brief. The record is about the leader’s process, not a case file on a person. This brief is not a rating of anyone. This is not legal advice.');
  return lines.join('\n');
}
