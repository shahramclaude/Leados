/**
 * app/core/domain/learning.js — the After-Action Review & Learning Ledger
 * (Schema v43).
 *
 * The gap this module fills
 * -------------------------
 * LeadOS already measures an enormous amount: capacity, load, cases, decisions,
 * delegation, forecasts, premises, capital, strategy. Every one of those engines
 * answers a question about *the work*. None of them answers the question that
 * separates an organisation that compounds from one that simply repeats:
 *
 *   **When something ended, did we find out why — and did anything change?**
 *
 * Every management tool in existence can close a ticket. Almost none of them
 * can tell a leader "you have diagnosed this same failure three times and the
 * change you committed after the second one was never made." That sentence is
 * the whole product of this module, and it is only possible because LeadOS
 * already holds the closing evidence.
 *
 * Named methods, implemented rather than gestured at
 * --------------------------------------------------
 *  1. The After-Action Review (US Army, Training Circular 25-20, *A Leader's
 *     Guide to After-Action Reviews*, 1993): four questions — what was
 *     supposed to happen, what actually happened, why was there a difference,
 *     what would we do differently. The module stores exactly those four, plus
 *     one sustainment answer so a review cannot only be a list of failures.
 *  2. Double-loop learning (Argyris & Schön, *Organizational Learning*, 1978;
 *     Argyris, "Teaching Smart People How to Learn", HBR 1991). Single-loop
 *     learning fixes the error inside the existing policy; double-loop learning
 *     changes the governing policy itself. A lesson with no change attached is
 *     stored as an **observation** and is never counted as learning, because
 *     that is the operational difference between the two loops.
 *  3. Klein's observation that insight is produced by comparing intention with
 *     outcome, not by collecting opinions (*Sources of Power*, 1998). The
 *     "intended" side here is not typed from memory where the workspace already
 *     holds a frozen forecast: for a case it is the snapshot frozen when the
 *     case opened, for a decision the probability recorded when the call was
 *     made. Pre-filling from the frozen record is the mechanism that stops the
 *     review from being a hindsight story.
 *  4. Recurrence as the outcome measure of learning. The unit is the lesson
 *     *class*, because "we learned something" is unmeasurable while "handoffs
 *     broke again after the change we committed for handoffs was never made" is
 *     a fact about two dated records.
 *  5. Coverage and latency, stated with their denominators. A learning system
 *     that reviews one event out of forty is not a learning system; the report
 *     prints both numbers and the window they were measured over.
 *
 * Honesty boundaries enforced in code
 * -----------------------------------
 *  - The cause is never inferred. The app pre-fills what the record says was
 *    expected and what was recorded as actual; the "why" is a human sentence or
 *    it is blank, and a review cannot be held without one.
 *  - A lesson with no change committed stays an observation. It is visible, it
 *    is counted separately, and it cannot inflate the applied-change rate.
 *  - A change is only ever "applied" with a dated note from the leader. Nothing
 *    infers that a change happened because a delegation closed.
 *  - Recurrence requires *distinct* events. Two lessons in the same review are
 *    one event that taught two things, not a pattern.
 *  - Coverage excludes events whose closing date is unknown, and says how many
 *    it excluded and why.
 *  - Nothing here rates a person. A lesson names a system, a decision or a
 *    practice. Owner fields identify who acts on a change, never who is to
 *    blame, and the UI says so.
 *  - Pure module: no DOM, no storage, no clock, no network.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';

export const AAR_ENGINE_VERSION = 'after-action-2026.10-v1';

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * Why the module classifies instead of accepting a free tag: recurrence is the
 * only outcome measure learning has, and recurrence is only countable when two
 * reviews use the same word for the same thing. The list is deliberately short
 * and each entry names a *system* failure mode, not a personal one.
 */
export const LESSON_CLASSES = Object.freeze([
  { key: 'estimate', label: 'Estimation', help: 'The work took materially more or less than the record predicted.' },
  { key: 'scope', label: 'Scope', help: 'What was in or out of the work was wrong, or changed without a decision.' },
  { key: 'dependency', label: 'Dependency & handoff', help: 'Another team, vendor or system gated the outcome and the gate was not visible in time.' },
  { key: 'decision', label: 'Decision quality', help: 'The call itself was made on thin evidence, late, or without the right people.' },
  { key: 'escalation', label: 'Escalation', help: 'A problem was known but reached someone with authority too late.' },
  { key: 'quality', label: 'Quality & rework', help: 'Defects, rework or missing verification consumed the effort.' },
  { key: 'staffing', label: 'Staffing & capacity', help: 'The people or skills needed were not there when the work needed them.' },
  { key: 'communication', label: 'Communication', help: 'People did not know what was happening, decided or expected of them.' },
  { key: 'process', label: 'Process & ritual', help: 'A standing meeting, template or policy helped or hindered the outcome.' },
  { key: 'premise', label: 'Assumption', help: 'A belief the plan rested on turned out to be false.' },
  { key: 'other', label: 'Other', help: 'None of the above — say what it was in the lesson.' },
]);

export const LESSON_CLASS_KEYS = LESSON_CLASSES.map((c) => c.key);

export function lessonClassLabel(key) {
  return LESSON_CLASSES.find((c) => c.key === key)?.label || 'Other';
}

/**
 * What a lesson actually changes. `none` is a first-class answer on purpose: a
 * review that truthfully concludes "nothing should change" is a legitimate
 * review, and labelling it as a lesson would be the exact self-deception this
 * module exists to catch. `none` is stored as an **observation**.
 */
export const CHANGE_TYPES = Object.freeze([
  { key: 'delegation', label: 'A change someone must own', help: 'Opens one owned delegation with the change as its expected outcome.' },
  { key: 'policy', label: 'A standing policy or convention', help: 'A workspace convention changes (threshold, cadence, limit). Record it where it lives — this stores the decision to change it.' },
  { key: 'process', label: 'A process, ritual or template', help: 'A meeting, review, checklist or template changes. Describe the new version in the change note.' },
  { key: 'premise', label: 'An assumption to re-test', help: 'A belief the team was relying on must be re-verified rather than merely noted.' },
  { key: 'decision', label: 'A decision that must be made', help: 'Opens one DACI decision with options, because the change needs a call, not a task.' },
  { key: 'none', label: 'Nothing — an observation', help: 'The review produced insight but no change. Stored honestly as an observation and never counted as learning.' },
]);

export const CHANGE_TYPE_KEYS = CHANGE_TYPES.map((c) => c.key);

export function changeTypeLabel(key) {
  return CHANGE_TYPES.find((c) => c.key === key)?.label || 'Observation';
}

export const LESSON_STATES = Object.freeze(['observation', 'open', 'applied', 'dropped']);

export const LESSON_STATE_LABELS = Object.freeze({
  observation: 'Observation',
  open: 'Change committed',
  applied: 'Applied',
  dropped: 'Dropped',
});

export const RETRO_STATUSES = Object.freeze(['draft', 'held', 'skipped']);

export const RETRO_STATUS_LABELS = Object.freeze({
  draft: 'Awaiting review',
  held: 'Held',
  skipped: 'Skipped',
});

/**
 * The four AAR questions plus one sustainment answer, in the order a review is
 * actually conducted. `min` is the honesty floor: a review whose "why" is three
 * characters is not a review, and the dialog says so instead of accepting it.
 */
export const AAR_QUESTIONS = Object.freeze([
  { key: 'intended', label: 'What was supposed to happen?', help: 'The plan as it stood before the outcome was known.', min: 12, max: 1200 },
  { key: 'actual', label: 'What actually happened?', help: 'The outcome as the record shows it, including what did not happen.', min: 12, max: 1200 },
  { key: 'cause', label: 'Why was there a difference?', help: 'The mechanism, not the mood. "We had no owner for the vendor call" beats "it was chaotic".', min: 12, max: 1200 },
  { key: 'sustain', label: 'What should we keep doing?', help: 'A review that only lists failures teaches people to hide the next one.', min: 0, max: 1200 },
  { key: 'improve', label: 'What will we do differently?', help: 'The change. Leave it blank if the honest answer is nothing — the lessons below are where change is committed.', min: 0, max: 1200 },
]);

export const AAR_QUESTION_BY_KEY = Object.freeze(
  Object.fromEntries(AAR_QUESTIONS.map((q) => [q.key, q])),
);

/* ------------------------------------------------------------------ */
/* Conventional thresholds (stated, editable, never presented as laws) */
/* ------------------------------------------------------------------ */

/** Window in which closed work is expected to have been reviewed, in days. */
export const AAR_DEFAULT_WINDOW_DAYS = 90;

/** Days after an outcome at which an unheld review counts as late. */
export const AAR_DEFAULT_DUE_DAYS = 14;

/** Coverage of reviewable closures, in percent, below which the app complains. */
export const AAR_DEFAULT_COVERAGE_FLOOR_PCT = 60;

/**
 * Below this many dated closures in the window, coverage is arithmetic on a
 * handful of records and is reported as counts-only rather than as a rate.
 */
export const AAR_MIN_CLOSURES = 3;

/** A committed change older than this is reported as an open loop. */
export const AAR_CHANGE_OPEN_DAYS = 30;

/**
 * Composite weight set for the learning index. Only components that can be
 * measured are used; the weights renormalise and the missing parts are printed.
 */
export const AAR_COMPONENT_WEIGHTS = Object.freeze({
  coverage: 0.35,
  closure: 0.35,
  recurrence: 0.3,
});

export const AAR_BANDS = Object.freeze([
  { key: 'compounding', label: 'Compounding', min: 70, tone: 'good', help: 'Most closures are reviewed, committed changes get made, and the same class is not repeating unaddressed. Keep it by reviewing on the cadence, not by celebrating.' },
  { key: 'partial', label: 'Partly closing', min: 45, tone: 'warn', help: 'At least one loop is open: reviews are missed, changes are parked, or a class is repeating. The tab names which.' },
  { key: 'repeating', label: 'Repeating', min: 0, tone: 'bad', help: 'The workspace is accumulating experience without changing behaviour. That is the most expensive state a team can be in.' },
]);

export function bandForLearningIndex(pct) {
  if (pct === null || pct === undefined) return null;
  return AAR_BANDS.find((band) => pct >= band.min) || AAR_BANDS[AAR_BANDS.length - 1];
}

/* ------------------------------------------------------------------ */
/* Subject types — what can be reviewed, and how its close is proven   */
/* ------------------------------------------------------------------ */

/**
 * Every subject type answers four questions from the record itself:
 * is it closed, when did it close, what is it called, and where does the leader
 * go to see it. A subject whose close cannot be dated is *listed* but excluded
 * from latency and coverage arithmetic, with the count printed — inventing a
 * closing date would invent the very gap the module measures.
 */
export const SUBJECT_TYPES = Object.freeze([
  {
    key: 'case',
    collection: 'cases',
    label: 'Operational case',
    route: (row) => `#/cases/${row.id}`,
    title: (row) => row.title || 'Untitled case',
    isClosed: (row) => ['resolved', 'closed'].includes(row.status),
    outcomeOn: (row) => row.resolvedOn || null,
    dateBasis: 'resolution date',
  },
  {
    key: 'change',
    collection: 'changes',
    label: 'Org change',
    route: (row) => `#/changes/${row.id}`,
    title: (row) => row.title || 'Untitled change',
    isClosed: (row) => ['anchored', 'abandoned'].includes(row.status),
    outcomeOn: (row) => row.anchoredOn || (row.status === 'abandoned'
      ? dayKey(row.updatedAt) || null
      : null),
    dateBasis: 'anchoring date (last write for an abandoned change)',
  },
  {
    key: 'decision',
    collection: 'decisions',
    label: 'Decided call',
    route: () => '#/decisions',
    title: (row) => row.title || 'Untitled decision',
    isClosed: (row) => Boolean(row.chosen && row.reviewedOn),
    outcomeOn: (row) => row.reviewedOn || null,
    dateBasis: 'outcome-review date',
  },
  {
    key: 'delegation',
    collection: 'delegations',
    label: 'Delegation',
    route: () => '#/delegations',
    title: (row) => row.title || 'Untitled delegation',
    isClosed: (row) => row.status === 'done',
    outcomeOn: (row) => row.completedOn || null,
    dateBasis: 'completion date',
  },
]);

export const SUBJECT_TYPE_KEYS = ['case', 'change', 'decision', 'delegation', 'other'];

export function subjectTypeSpec(key) {
  return SUBJECT_TYPES.find((s) => s.key === key) || null;
}

export function findSubject(state, subjectType, subjectId) {
  const spec = subjectTypeSpec(subjectType);
  if (!spec || !subjectId) return null;
  return (state[spec.collection] || []).find((row) => row && row.id === subjectId) || null;
}

/**
 * What the record already knows about intention and outcome, so the review does
 * not start from a blank page — and, more importantly, so it starts from the
 * number the leader committed to *before* they knew the answer.
 */
export function subjectEvidence(state, subjectType, subjectId) {
  const row = findSubject(state, subjectType, subjectId);
  if (!row) return null;
  const lines = [];
  let intended = '';
  let actual = '';

  if (subjectType === 'case') {
    const snap = row.forecastSnapshot;
    if (snap) {
      const parts = [];
      if (snap.costExpected > 0) parts.push(`expected exposure ≈ ${snap.costExpected} ${snap.currency}`);
      if (snap.capacityDaysExpected > 0) parts.push(`${snap.capacityDaysExpected} diverted day(s)`);
      if (snap.mitigationCost > 0) parts.push(`${snap.mitigationCost} ${snap.currency} planned mitigation`);
      if (parts.length) {
        intended = `Frozen at opening: ${parts.join(', ')}.`;
        lines.push({ label: 'Opening forecast', value: parts.join(' · '), source: 'case forecast snapshot, frozen when the case opened' });
      }
      if (snap.fmeaProbability !== null && snap.fmeaProbability !== undefined) {
        lines.push({ label: 'Recorded likelihood', value: `${snap.fmeaProbability} / 10`, source: 'FMEA probability at opening' });
      }
    }
    const act = row.actuals;
    if (act) {
      const parts = [];
      if (act.materialised !== null) parts.push(act.materialised ? 'the failure mode materialised' : 'the failure mode did not materialise');
      if (act.realisedExposure !== null) parts.push(`realised exposure ${act.realisedExposure}`);
      if (act.mitigationSpend !== null) parts.push(`mitigation spend ${act.mitigationSpend}`);
      if (act.divertedDays !== null) parts.push(`${act.divertedDays} diverted day(s)`);
      if (parts.length) {
        actual = `Settled: ${parts.join(', ')}.`;
        lines.push({ label: 'Settled actuals', value: parts.join(' · '), source: `recorded on ${act.settledOn || 'settlement'}` });
      }
    }
    if (!actual && row.resolutionNotes) {
      actual = row.resolutionNotes.slice(0, 400);
      lines.push({ label: 'Resolution note', value: row.resolutionNotes.slice(0, 240), source: 'the note written when the case closed' });
    }
    if (row.reviewOn && row.resolvedOn) {
      lines.push({ label: 'Due vs. closed', value: `review due ${row.reviewOn}, closed ${row.resolvedOn}`, source: 'case review and resolution dates' });
    }
  }

  if (subjectType === 'decision') {
    if (row.forecastProbability !== null && row.forecastProbability !== undefined) {
      intended = `Recorded P(this works out well) = ${row.forecastProbability}% when the call was made.`;
      lines.push({ label: 'Forecast at decision time', value: `${row.forecastProbability}%`, source: 'probability frozen when the call was made' });
    }
    if (row.outcome) {
      actual = `Outcome recorded as “${row.outcome}”${row.outcomeNotes ? `: ${row.outcomeNotes.slice(0, 300)}` : '.'}`;
      lines.push({ label: 'Recorded outcome', value: row.outcome, source: `reviewed on ${row.reviewedOn || 'an unrecorded date'}` });
    }
    if (row.decidedOn && row.reviewedOn) {
      lines.push({ label: 'Decision latency', value: `${daysBetween(row.decidedOn, row.reviewedOn)} day(s) to outcome review`, source: 'decided and reviewed dates' });
    }
  }

  if (subjectType === 'delegation') {
    const late = row.completedOn && row.dueOn ? daysBetween(row.dueOn, row.completedOn) : null;
    intended = row.dueOn ? `Due on ${row.dueOn}${row.expectedOutcome ? `; expected outcome: ${row.expectedOutcome.slice(0, 200)}` : '.'}` : (row.expectedOutcome ? `Expected outcome: ${row.expectedOutcome.slice(0, 240)}` : '');
    if (row.completedOn) {
      actual = `Completed ${row.completedOn}${late === null ? '' : late > 0 ? `, ${late} day(s) late` : late === 0 ? ', on the day it was due' : `, ${Math.abs(late)} day(s) early`}${row.completionNote ? `: ${row.completionNote.slice(0, 240)}` : '.'}`;
      lines.push({ label: 'Delivery', value: `${row.completedOn}${late === null ? '' : ` (${late > 0 ? '+' : ''}${late} day(s) vs due)`}`, source: 'delegation dates' });
    }
    const checkins = Array.isArray(row.checkins) ? row.checkins.length : 0;
    lines.push({ label: 'Check-ins logged', value: String(checkins), source: 'delegation checkpoint history' });
  }

  if (subjectType === 'change') {
    const topo = row.topology || {};
    if (topo.cognitiveLoadBefore !== null && topo.cognitiveLoadBefore !== undefined) {
      intended = `Target cognitive load ${topo.cognitiveLoadTarget ?? '—'} against a measured ${topo.cognitiveLoadBefore}.`;
      lines.push({ label: 'Cognitive load target', value: `${topo.cognitiveLoadBefore} → ${topo.cognitiveLoadTarget ?? '—'}`, source: 'change topology baseline and target' });
    }
    if (topo.blockingHandoffsBefore !== null && topo.blockingHandoffsBefore !== undefined) {
      lines.push({ label: 'Blocking handoffs', value: `${topo.blockingHandoffsBefore} → ${topo.blockingHandoffsTarget ?? '—'}`, source: 'change topology baseline and target' });
    }
    actual = row.status === 'anchored'
      ? `Marked anchored${row.anchoredOn ? ` on ${row.anchoredOn}` : ''}.`
      : row.status === 'abandoned' ? 'Recorded as abandoned.' : '';
    if (row.reviewOn) lines.push({ label: 'Review date', value: row.reviewOn, source: 'change review date' });
  }

  return {
    subjectType,
    subjectId,
    label: subjectTypeSpec(subjectType)?.title(row) || 'Record',
    route: subjectTypeSpec(subjectType)?.route(row) || null,
    intended,
    actual,
    lines,
  };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v, max = 400) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function dateOnly(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  return v.trim();
}

function isoOrNull(v) {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function median(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function clampText(value, max) {
  const s = typeof value === 'string' ? value : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function personOnRoster(state, personId) {
  return (state.people || []).some((p) => p && p.id === personId && p.status !== 'archived');
}

/**
 * An owner who has left the roster is cleared, not silently kept: the change is
 * still a commitment, but it needs a new name before anyone can be held to it.
 * When no roster is supplied (payload validation path) the id is preserved and
 * the actions layer has already checked it.
 */
function resolveLessonOwner(ownerId, people) {
  if (!ownerId) return null;
  if (!Array.isArray(people)) return ownerId;
  return people.some((p) => p && p.id === ownerId && p.status !== 'archived') ? ownerId : null;
}

/* ------------------------------------------------------------------ */
/* Record corroboration — a dated artifact, not proof of causation       */
/* ------------------------------------------------------------------ */

export const LESSON_EVIDENCE_SOURCES = Object.freeze([
  { key: 'change', label: 'Anchored organizational change', collection: 'changes', date: (row) => row.anchoredOn, qualifies: (row) => row.status === 'anchored' },
  { key: 'delegation', label: 'Completed delegation', collection: 'delegations', date: (row) => row.completedOn, qualifies: (row) => row.status === 'done' },
  { key: 'decision', label: 'Reviewed decision', collection: 'decisions', date: (row) => row.reviewedOn, qualifies: (row) => Boolean(row.chosen && row.reviewedOn) },
]);

function sourceSpec(type) { return LESSON_EVIDENCE_SOURCES.find((source) => source.key === type) || null; }

function evidenceRecord(state, type, id) {
  const spec = sourceSpec(type);
  if (!spec || !id) return null;
  const row = (state?.[spec.collection] || []).find((item) => item?.id === id);
  if (!row) return null;
  const evidenceOn = spec.date(row);
  const title = text(row.title || row.name || row.label || row.goal || 'Untitled record', 200);
  const status = text(row.status, 40);
  const qualification = Boolean(spec.qualifies(row) && dateOnly(evidenceOn));
  // A bounded snapshot detects later changes; it is not a signature or proof.
  const detail = type === 'delegation' ? text(row.completionNote, 300)
    : type === 'decision' ? text(row.outcome, 80) : text(row.summary || row.description, 300);
  const snapshot = JSON.stringify([type, row.id, title, status, evidenceOn || null, detail]);
  return { type, id: row.id, title, status, evidenceOn: dateOnly(evidenceOn), qualification, snapshot, raw: row };
}

function distinctFromSubject(retro, record) {
  if (!retro || !record) return false;
  const collectionType = { change: 'change', delegation: 'delegation', decision: 'decision' }[record.type];
  return !(retro.subjectId && retro.subjectType === collectionType && retro.subjectId === record.id);
}

function dateFitsLesson(retro, lesson, evidenceOn) {
  return Boolean(evidenceOn && retro?.heldOn && lesson?.appliedOn
    && evidenceOn >= retro.heldOn && evidenceOn <= lesson.appliedOn);
}

/** Eligible completed records for explicit, human-selected corroboration. */
export function lessonEvidenceCandidates(state = {}, retro = {}, lesson = {}) {
  if (lesson.state !== 'applied' || !lesson.appliedOn || !retro.heldOn) return [];
  const out = [];
  for (const source of LESSON_EVIDENCE_SOURCES) {
    for (const row of (state[source.collection] || [])) {
      const record = evidenceRecord(state, source.key, row?.id);
      if (!record?.qualification || !distinctFromSubject(retro, record)
          || !dateFitsLesson(retro, lesson, record.evidenceOn)) continue;
      out.push({ ...record, key: `${record.type}:${record.id}`, label: `${source.label}: ${record.title} · ${record.evidenceOn}` });
    }
  }
  return out.sort((a, b) => a.evidenceOn.localeCompare(b.evidenceOn) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}

/** Re-evaluate links against live records; an edited or invalidated artifact becomes stale. */
export function assessLessonEvidence(state = {}, retro = {}, lesson = {}) {
  const items = Array.isArray(lesson.evidence) ? lesson.evidence : [];
  if (!items.length) return { status: 'unverified', items: [], corroborated: 0, stale: 0 };
  const assessed = items.map((item) => {
    const current = evidenceRecord(state, item.sourceType, item.sourceId);
    const distinct = distinctFromSubject(retro, current);
    const timely = current && dateFitsLesson(retro, lesson, current.evidenceOn);
    const valid = current?.qualification && distinct && timely && current.snapshot === item.snapshot;
    return { ...item, status: valid ? 'record-corroborated' : 'stale',
      staleReason: !current ? 'The linked record is no longer available.'
        : !current.qualification ? 'The linked record is no longer in a qualifying completed state.'
          : !distinct ? 'The linked record is the event being reviewed, not a separate artifact.'
            : !timely ? 'The record date no longer falls between the review and the claimed application.'
              : current.snapshot !== item.snapshot ? 'The linked record changed after it was attached.' : '',
      currentTitle: current?.title || item.sourceTitle, currentEvidenceOn: current?.evidenceOn || item.evidenceOn };
  });
  const corroborated = assessed.filter((item) => item.status === 'record-corroborated').length;
  return { status: corroborated ? 'record-corroborated' : 'stale', items: assessed,
    corroborated, stale: assessed.length - corroborated };
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function normalizeLessonState(changeType, raw) {
  if (changeType === 'none') return 'observation';
  const state = LESSON_STATES.includes(raw) ? raw : 'open';
  return state === 'observation' ? 'open' : state;
}

export function normalizeLesson(raw, { now = new Date(), people = null } = {}) {
  if (!isObject(raw)) return null;
  const lessonText = text(raw.text, 600);
  if (lessonText.length < 10) return null;
  const lessonClass = LESSON_CLASS_KEYS.includes(raw.class) ? raw.class : 'other';
  const changeType = CHANGE_TYPE_KEYS.includes(raw.changeType) ? raw.changeType : 'none';
  const changeNote = text(raw.changeNote, 800);
  const appliedOn = dateOnly(raw.appliedOn);
  const droppedOn = dateOnly(raw.droppedOn);
  const rawState = LESSON_STATES.includes(raw.state) ? raw.state : null;
  let state = normalizeLessonState(changeType, rawState);
  if (changeType !== 'none') {
    // A change cannot be applied without the date it was applied: the whole
    // record is a claim that something happened, so the date is the evidence.
    if (state === 'applied' && !appliedOn) state = 'open';
    if (state === 'dropped' && !droppedOn) state = 'dropped';
    if (state === 'observation') state = 'open';
  } else {
    state = 'observation';
  }
  const nowIso = new Date(now).toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `lesson-${Math.random().toString(36).slice(2, 8)}`,
    class: lessonClass,
    text: lessonText,
    changeType,
    changeNote,
    state,
    ownerId: resolveLessonOwner(raw.ownerId, people),
    committedOn: dateOnly(raw.committedOn),
    appliedOn: state === 'applied' ? appliedOn : null,
    appliedNote: state === 'applied' ? text(raw.appliedNote, 600) : '',
    evidence: state === 'applied' && Array.isArray(raw.evidence) ? raw.evidence
      .filter((item) => isObject(item) && sourceSpec(item.sourceType)
        && typeof item.sourceId === 'string' && item.sourceId
        && typeof item.snapshot === 'string' && item.snapshot.length <= 1200)
      .slice(0, 5).map((item) => ({
        id: text(item.id, 80) || `evidence-${Math.random().toString(36).slice(2, 8)}`,
        sourceType: item.sourceType, sourceId: item.sourceId.slice(0, 80),
        sourceTitle: text(item.sourceTitle, 200), evidenceOn: dateOnly(item.evidenceOn),
        note: text(item.note, 500), snapshot: item.snapshot,
        recordedAt: isoOrNull(item.recordedAt) || nowIso,
      })) : [],
    droppedOn: state === 'dropped' ? droppedOn : null,
    droppedReason: state === 'dropped' ? text(raw.droppedReason, 400) : '',
    createdAt: isoOrNull(raw.createdAt) || nowIso,
  };
}

/**
 * Normalise one review record. Deterministic and total: every field the UI reads
 * is present after this runs, and nothing that would make the ledger lie (a
 * held review with no cause, a change applied without a date, an owner who left)
 * survives it.
 */
export function normalizeRetro(raw, state = {}, now = new Date(), warnings = null) {
  if (!isObject(raw)) return null;
  const people = Array.isArray(state.people) ? state.people : (Array.isArray(raw.__people) ? raw.__people : []);
  const roster = new Set(people.filter((p) => p && p.status !== 'archived').map((p) => p.id));
  const subjectType = SUBJECT_TYPE_KEYS.includes(raw.subjectType) ? raw.subjectType : 'other';
  let subjectId = typeof raw.subjectId === 'string' && raw.subjectId ? raw.subjectId : null;
  let subjectLabel = text(raw.subjectLabel, 200);
  const subject = subjectType !== 'other' ? findSubject(state, subjectType, subjectId) : null;
  if (subjectType !== 'other' && !subject) {
    // A review of a record that has been deleted keeps its own text (the
    // thinking is still evidence) but stops pretending to point at anything.
    if (warnings) warnings.push('After-action: a review pointed at a record that no longer exists and is now detached from it');
    subjectId = null;
    subjectLabel = subjectLabel || 'Record no longer in the workspace';
  } else if (subject) {
    subjectLabel = subjectLabel || subjectTypeSpec(subjectType).title(subject);
  }
  const status = RETRO_STATUSES.includes(raw.status) ? raw.status : 'draft';
  const nowIso = new Date(now).toISOString();
  const createdAt = isoOrNull(raw.createdAt) || nowIso;
  const fields = {};
  for (const question of AAR_QUESTIONS) {
    fields[question.key] = text(raw[question.key], question.max);
  }
  const heldOn = dateOnly(raw.heldOn);
  const outcomeOn = dateOnly(raw.outcomeOn);
  const lessons = (Array.isArray(raw.lessons) ? raw.lessons : [])
    .map((lesson) => normalizeLesson(lesson, { now, people }))
    .filter(Boolean)
    .slice(0, 20);
  const participants = (Array.isArray(raw.participants) ? raw.participants : [])
    .filter((id) => typeof id === 'string' && roster.has(id))
    .slice(0, 20);
  const skipReason = text(raw.skipReason, 400);
  let resolvedStatus = status;
  // A review cannot be "held" before the event it reviews ended, and it cannot
  // be held without an answer to the three questions that make it a review.
  if (resolvedStatus === 'held') {
    if (!heldOn) resolvedStatus = 'draft';
    else if (outcomeOn && heldOn < outcomeOn) resolvedStatus = 'draft';
    else if (fields.cause.length < 12 || fields.intended.length < 12 || fields.actual.length < 12) resolvedStatus = 'draft';
  }
  if (resolvedStatus === 'skipped' && skipReason.length < 10) resolvedStatus = 'draft';
  const effectiveLessons = resolvedStatus === 'held' ? lessons : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : 'retro',
    // A review whose subject vanished keeps its own text and its date, and
    // stops claiming to point at a record that no longer exists.
    subjectType: subjectId ? subjectType : 'other',
    subjectId,
    subjectLabel,
    outcomeOn,
    status: resolvedStatus,
    autoDrafted: raw.autoDrafted === true,
    ...fields,
    skipReason: resolvedStatus === 'skipped' ? skipReason : '',
    heldOn: resolvedStatus === 'held' ? heldOn : null,
    participants: resolvedStatus === 'held' ? participants : [],
    lessons: effectiveLessons,
    createdAt,
    updatedAt: isoOrNull(raw.updatedAt) || createdAt,
    history: normalizeHistory(raw.history, createdAt),
  };
}

function normalizeHistory(raw, fallbackAt) {
  return (Array.isArray(raw) ? raw : [])
    .filter(isObject)
    .map((entry) => ({
      at: isoOrNull(entry.at) || fallbackAt,
      type: text(entry.type, 40) || 'updated',
      summary: text(entry.summary, 300),
    }))
    .slice(-60);
}

/** Collection-level normaliser: dedupe ids and drop the unsalvageable. */
export function normalizeRetros(raw, state, now, warnings = []) {
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of rows) {
    const retro = normalizeRetro(item, state, now, warnings);
    if (!retro) continue;
    let id = retro.id;
    while (seen.has(id)) id = `${id}-${out.length + 1}`;
    seen.add(id);
    out.push({ ...retro, id });
  }
  // One review per subject: a second draft for the same closed case is a
  // duplicate prompt, not a second review.
  const bySubject = new Map();
  const kept = [];
  let duplicates = 0;
  for (const retro of out) {
    if (!retro.subjectId) { kept.push(retro); continue; }
    const key = `${retro.subjectType}:${retro.subjectId}`;
    const existing = bySubject.get(key);
    if (!existing) { bySubject.set(key, retro); kept.push(retro); continue; }
    // Prefer the held record over a draft when a workspace somehow holds both.
    if (existing.status !== 'held' && retro.status === 'held') {
      const index = kept.indexOf(existing);
      kept[index] = retro;
      bySubject.set(key, retro);
      duplicates += 1;
      continue;
    }
    duplicates += 1;
  }
  if (duplicates) warnings.push(`After-action: collapsed ${duplicates} duplicate review(s) of the same record`);
  return kept;
}

/* ------------------------------------------------------------------ */
/* Payload validation (used by the actions layer, not by the store)    */
/* ------------------------------------------------------------------ */

export function normalizeRetroPayload(data = {}, { state = {}, now = new Date() } = {}) {
  const source = isObject(data) ? data : {};
  const nowDate = new Date(now);
  const today = dayKey(nowDate);
  const subjectType = SUBJECT_TYPE_KEYS.includes(source.subjectType) ? source.subjectType : 'other';
  let subjectId = null;
  let subjectLabel = '';
  let outcomeOn = dateOnly(source.outcomeOn);

  if (subjectType === 'other') {
    subjectLabel = text(source.subjectLabel, 200);
    if (subjectLabel.length < 4) return { ok: false, error: 'Name the event or piece of work this review is about.', field: 'subjectLabel' };
  } else {
    subjectId = typeof source.subjectId === 'string' ? source.subjectId : '';
    const row = findSubject(state, subjectType, subjectId);
    if (!row) return { ok: false, error: 'That record no longer exists.', field: 'subjectId' };
    const spec = subjectTypeSpec(subjectType);
    if (!spec.isClosed(row)) {
      return { ok: false, error: `“${spec.title(row)}” has not ended yet. A review before the outcome is a plan, not a lesson.`, field: 'subjectId' };
    }
    const derived = spec.outcomeOn(row);
    if (derived) outcomeOn = derived;
    subjectLabel = spec.title(row);
    const duplicate = (state.retros || []).find((r) => r && r.subjectType === subjectType && r.subjectId === subjectId);
    if (duplicate) return { ok: false, error: 'That record already has a review. Open it rather than starting a second one.', field: 'subjectId' };
  }
  if (!outcomeOn) return { ok: false, error: 'Record the date the event ended — an undated review cannot be measured.', field: 'outcomeOn' };
  if (outcomeOn > today) return { ok: false, error: 'An event cannot end in the future.', field: 'outcomeOn' };
  return {
    ok: true,
    value: { subjectType, subjectId, subjectLabel, outcomeOn },
  };
}

export function normalizeLessonPayload(data = {}, { state = {}, now = new Date() } = {}) {
  const source = isObject(data) ? data : {};
  const lessonText = text(source.text, 600);
  if (lessonText.length < 10) return { ok: false, error: 'Write the lesson in at least 10 characters — "communication" is not a lesson.', field: 'text' };
  const lessonClass = LESSON_CLASS_KEYS.includes(source.class) ? source.class : null;
  if (!lessonClass) return { ok: false, error: 'Choose the class this lesson belongs to. Classes are what make recurrence countable.', field: 'class' };
  const changeType = CHANGE_TYPE_KEYS.includes(source.changeType) ? source.changeType : 'none';
  const changeNote = text(source.changeNote, 800);
  if (changeType !== 'none' && changeNote.length < 10) {
    return { ok: false, error: 'Say what changes. A lesson with an unnamed change is an intention, not a commitment.', field: 'changeNote' };
  }
  const ownerId = typeof source.ownerId === 'string' && source.ownerId ? source.ownerId : null;
  if (ownerId && !personOnRoster(state, ownerId)) return { ok: false, error: 'Choose an owner who is on the active roster.', field: 'ownerId' };
  if (changeType === 'delegation' && !ownerId) return { ok: false, error: 'A change someone must own needs an owner.', field: 'ownerId' };
  return {
    ok: true,
    value: {
      class: lessonClass,
      text: lessonText,
      changeType,
      changeNote,
      ownerId,
      committedOn: dayKey(now),
      state: changeType === 'none' ? 'observation' : 'open',
    },
  };
}

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

function collectClosures(state, { windowStart, today }) {
  const rows = [];
  let undated = 0;
  let outsideWindow = 0;
  for (const spec of SUBJECT_TYPES) {
    for (const record of state[spec.collection] || []) {
      if (!record || !record.id) continue;
      if (!spec.isClosed(record)) continue;
      const on = spec.outcomeOn(record);
      if (!on) { undated += 1; continue; }
      if (on < windowStart || on > today) { outsideWindow += 1; continue; }
      rows.push({
        subjectType: spec.key,
        subjectId: record.id,
        label: spec.title(record),
        typeLabel: spec.label,
        route: spec.route(record),
        outcomeOn: on,
        dateBasis: spec.dateBasis,
        waitingDays: daysBetween(on, today) ?? 0,
      });
    }
  }
  rows.sort((a, b) => (a.outcomeOn < b.outcomeOn ? 1 : a.outcomeOn > b.outcomeOn ? -1 : a.label.localeCompare(b.label)));
  return { rows, undated, outsideWindow };
}

/**
 * Recurrence, measured across *distinct* events.
 *
 * The question this answers is not "how many lessons do we have" but "did a
 * lesson we already wrote change anything". A class counts as recurring when it
 * appears in two or more held reviews. It counts as an *unclosed recurrence*
 * when the earliest review that committed a change for that class is still
 * `open` — that is the sentence no other tool prints.
 */
export function measureRecurrence(retros) {
  const byClass = new Map();
  const held = retros.filter((r) => r.status === 'held');
  for (const retro of held) {
    const when = retro.heldOn || retro.outcomeOn || retro.createdAt.slice(0, 10);
    for (const lesson of retro.lessons || []) {
      const entry = byClass.get(lesson.class) || {
        class: lesson.class,
        label: lessonClassLabel(lesson.class),
        events: new Set(),
        lessons: [],
        firstSeenOn: when,
        lastSeenOn: when,
      };
      entry.events.add(`${retro.subjectType}:${retro.subjectId || retro.id}`);
      entry.lessons.push({ ...lesson, retroId: retro.id, heldOn: when, retroLabel: retro.subjectLabel });
      if (when < entry.firstSeenOn) entry.firstSeenOn = when;
      if (when > entry.lastSeenOn) entry.lastSeenOn = when;
      byClass.set(lesson.class, entry);
    }
  }
  const out = [];
  for (const entry of byClass.values()) {
    const lessons = entry.lessons.slice().sort((a, b) => (a.heldOn < b.heldOn ? -1 : a.heldOn > b.heldOn ? 1 : 0));
    const committed = lessons.filter((l) => l.changeType !== 'none');
    const applied = committed.filter((l) => l.state === 'applied');
    const dropped = committed.filter((l) => l.state === 'dropped');
    const open = committed.filter((l) => l.state === 'open');
    // The earliest commitment for this class that is still open.
    const firstOpen = open[0] || null;
    const laterEventsAfterOpen = firstOpen
      ? lessons.filter((l) => l.heldOn > firstOpen.heldOn && `${l.retroId}` !== `${firstOpen.retroId}`).length
      : 0;
    out.push({
      class: entry.class,
      label: entry.label,
      eventCount: entry.events.size,
      lessonCount: lessons.length,
      committed: committed.length,
      applied: applied.length,
      dropped: dropped.length,
      open: open.length,
      observationsOnly: committed.length === 0,
      firstSeenOn: entry.firstSeenOn,
      lastSeenOn: entry.lastSeenOn,
      spanDays: daysBetween(entry.firstSeenOn, entry.lastSeenOn) ?? 0,
      firstOpen,
      recurred: entry.events.size > 1,
      unclosed: Boolean(firstOpen) && laterEventsAfterOpen > 0,
      laterEventsAfterOpen,
      lessons,
    });
  }
  out.sort((a, b) => {
    if (a.unclosed !== b.unclosed) return a.unclosed ? -1 : 1;
    if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
    return b.lessonCount - a.lessonCount;
  });
  return out;
}

/**
 * The whole terminal as one pure value.
 *
 * Nothing here mutates state, reads the clock except through `now`, or converts
 * a missing date into a number.
 */
export function buildLearningReport(state = {}, now = new Date(), settingsOverride = null) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const today = dayKey(nowDate);
  const settings = settingsOverride || state.settings || {};
  const windowDays = clampInt(settings.retroWindowDays, 14, 365, AAR_DEFAULT_WINDOW_DAYS);
  const dueDays = clampInt(settings.retroDueDays, 1, 60, AAR_DEFAULT_DUE_DAYS);
  const coverageFloorPct = clampInt(settings.learningCoverageFloorPct, 10, 100, AAR_DEFAULT_COVERAGE_FLOOR_PCT);
  const autoDraft = settings.learningAutoDraft !== false;
  const windowStart = addDays(today, -windowDays);

  const retros = (Array.isArray(state.retros) ? state.retros : []).filter((r) => r && r.id);
  const closures = collectClosures(state, { windowStart, today });
  const closureByKey = new Map(closures.rows.map((row) => [`${row.subjectType}:${row.subjectId}`, row]));
  const retroByKey = new Map();
  for (const retro of retros) {
    if (!retro.subjectId) continue;
    retroByKey.set(`${retro.subjectType}:${retro.subjectId}`, retro);
  }

  /* ---- queue: what is waiting for a review -------------------------- */
  const queue = closures.rows
    .filter((row) => {
      const retro = retroByKey.get(`${row.subjectType}:${row.subjectId}`);
      return !retro || retro.status === 'draft';
    })
    .map((row) => {
      const retro = retroByKey.get(`${row.subjectType}:${row.subjectId}`) || null;
      return {
        ...row,
        retroId: retro?.id || null,
        autoDrafted: Boolean(retro?.autoDrafted),
        waitingDays: row.waitingDays,
        due: row.waitingDays >= dueDays,
        overdueDays: Math.max(0, row.waitingDays - dueDays),
      };
    });

  /* ---- coverage ----------------------------------------------------- */
  const datedClosures = closures.rows.length;
  const reviewed = closures.rows.filter((row) => {
    const retro = retroByKey.get(`${row.subjectType}:${row.subjectId}`);
    return retro && (retro.status === 'held' || retro.status === 'skipped');
  });
  const skipped = reviewed.filter((row) => retroByKey.get(`${row.subjectType}:${row.subjectId}`)?.status === 'skipped');
  const held = reviewed.filter((row) => retroByKey.get(`${row.subjectType}:${row.subjectId}`)?.status === 'held');
  const coveragePct = datedClosures >= AAR_MIN_CLOSURES
    ? Math.round((reviewed.length / datedClosures) * 100)
    : null;
  const coverageConfidence = datedClosures < AAR_MIN_CLOSURES ? 'counts-only' : 'measured';

  /* ---- latency ------------------------------------------------------ */
  const heldRetros = retros.filter((r) => r.status === 'held');
  const latencies = heldRetros
    .map((r) => (r.heldOn && r.outcomeOn ? daysBetween(r.outcomeOn, r.heldOn) : null))
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  const latency = {
    measured: latencies.length,
    medianDays: latencies.length >= 2 ? round(median(latencies), 1) : null,
    worstDays: latencies.length ? Math.max(...latencies) : null,
    lateReviews: queue.filter((row) => row.due).length,
  };

  /* ---- lessons ------------------------------------------------------ */
  const allLessons = [];
  for (const retro of heldRetros) {
    for (const lesson of retro.lessons || []) {
      const evidenceAssessment = assessLessonEvidence(state, retro, lesson);
      allLessons.push({ ...lesson, evidenceAssessment, verificationStatus: evidenceAssessment.status,
        retroId: retro.id, heldOn: retro.heldOn, retroLabel: retro.subjectLabel });
    }
  }
  const committed = allLessons.filter((l) => l.changeType !== 'none');
  const applied = committed.filter((l) => l.state === 'applied');
  const corroborated = applied.filter((l) => l.verificationStatus === 'record-corroborated');
  const staleEvidence = applied.filter((l) => l.verificationStatus === 'stale');
  const verificationPct = applied.length >= 5 ? Math.round((corroborated.length / applied.length) * 100) : null;
  const dropped = committed.filter((l) => l.state === 'dropped');
  const openChanges = committed.filter((l) => l.state === 'open');
  const observations = allLessons.filter((l) => l.changeType === 'none');
  const timeToApply = applied
    .map((l) => (l.appliedOn && l.heldOn ? daysBetween(l.heldOn, l.appliedOn) : null))
    .filter((n) => typeof n === 'number' && n >= 0);
  const changeQueue = openChanges
    .map((l) => ({
      ...l,
      ageDays: l.heldOn ? (daysBetween(l.heldOn, today) ?? 0) : null,
      late: l.heldOn ? (daysBetween(l.heldOn, today) ?? 0) >= AAR_CHANGE_OPEN_DAYS : false,
    }))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  const lessons = {
    total: allLessons.length,
    observations: observations.length,
    committed: committed.length,
    applied: applied.length,
    corroborated: corroborated.length,
    uncorroborated: applied.length - corroborated.length,
    staleEvidence: staleEvidence.length,
    verificationPct,
    verificationConfidence: applied.length < 5 ? 'counts-only' : 'measured',
    dropped: dropped.length,
    open: openChanges.length,
    appliedPct: committed.length ? Math.round((applied.length / committed.length) * 100) : null,
    medianTimeToApplyDays: timeToApply.length >= 2 ? round(median(timeToApply), 1) : null,
    lateOpen: changeQueue.filter((l) => l.late).length,
    changeQueue,
    byClass: LESSON_CLASS_KEYS.map((key) => ({
      key,
      label: lessonClassLabel(key),
      observations: observations.filter((l) => l.class === key).length,
      committed: committed.filter((l) => l.class === key).length,
      applied: applied.filter((l) => l.class === key).length,
      open: openChanges.filter((l) => l.class === key).length,
    })).filter((row) => row.observations + row.committed > 0),
  };

  /* ---- recurrence --------------------------------------------------- */
  const classes = measureRecurrence(retros);
  const unclosed = classes.filter((row) => row.unclosed);
  const repeated = classes.filter((row) => row.recurred);
  const recurrence = {
    classes,
    repeatedClasses: repeated.length,
    unclosedCount: unclosed.length,
    unclosed,
    observationsOnlyClasses: classes.filter((row) => row.observationsOnly && row.recurred).length,
  };

  /* ---- reviews that taught nothing ---------------------------------- */
  const heldWithoutLessons = heldRetros.filter((r) => !(r.lessons || []).some((l) => l.changeType !== 'none'));
  const heldWithoutAnyLesson = heldRetros.filter((r) => !(r.lessons || []).length);

  /* ---- the composite ------------------------------------------------ */
  const components = [];
  if (coveragePct !== null) {
    components.push({ key: 'coverage', label: 'Coverage', value: Math.min(100, Math.max(0, coveragePct)), weight: AAR_COMPONENT_WEIGHTS.coverage, detail: `${reviewed.length} of ${datedClosures} dated closures reviewed` });
  }
  if (lessons.appliedPct !== null) {
    components.push({ key: 'closure', label: 'Changes applied', value: lessons.appliedPct, weight: AAR_COMPONENT_WEIGHTS.closure, detail: `${applied.length} of ${committed.length} committed changes applied` });
  }
  components.push({
    key: 'recurrence',
    label: 'Learning carried',
    value: Math.max(0, 100 - unclosed.length * 25),
    weight: AAR_COMPONENT_WEIGHTS.recurrence,
    detail: unclosed.length ? `${unclosed.length} repeated class(es) with the earlier change still open` : 'no repeated class with an open change',
  });
  const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
  const missingComponents = ['coverage', 'closure'].filter((key) => !components.some((c) => c.key === key));
  // Two components or nothing. A composite that is 100% "no repeated class yet"
  // because nothing has ever been reviewed is not a score, it is an empty set
  // wearing a percentage — so below two measurable components there is no index.
  const indexPct = components.length < 2 || !weightSum
    ? null
    : Math.round(components.reduce((sum, c) => sum + c.value * c.weight, 0) / weightSum);

  return {
    engineVersion: AAR_ENGINE_VERSION,
    evaluatedAt: nowDate.toISOString(),
    today,
    settings: { windowDays, dueDays, coverageFloorPct, autoDraft, windowStart },
    hasRetros: retros.length > 0,
    hasHeld: heldRetros.length > 0,
    queue,
    closures: {
      dated: datedClosures,
      reviewed: reviewed.length,
      held: held.length,
      skipped: skipped.length,
      unreviewed: datedClosures - reviewed.length,
      coveragePct,
      coverageFloorPct,
      belowFloor: coveragePct !== null && coveragePct < coverageFloorPct,
      confidence: coverageConfidence,
      undated: closures.undated,
      outsideWindow: closures.outsideWindow,
      byType: SUBJECT_TYPES.map((spec) => ({
        key: spec.key,
        label: spec.label,
        closed: closures.rows.filter((row) => row.subjectType === spec.key).length,
        reviewed: reviewed.filter((row) => row.subjectType === spec.key).length,
      })),
    },
    latency,
    lessons,
    recurrence,
    heldWithoutLessons: heldWithoutLessons.length,
    heldWithoutAnyLesson: heldWithoutAnyLesson.length,
    retros: retros.map((r) => ({ ...r, lessons: r.lessons || [] })),
    heldRetros,
    confidence: {
      level: coverageConfidence,
      reasons: [
        datedClosures < AAR_MIN_CLOSURES
          ? `Only ${datedClosures} dated closure(s) in the ${windowDays}-day window, so the coverage rate is arithmetic on a handful of records and is shown as counts.`
          : null,
        closures.undated
          ? `${closures.undated} closed record(s) have no closing date and are excluded from coverage and latency.`
          : null,
        closures.outsideWindow
          ? `${closures.outsideWindow} closure(s) fall outside the ${windowDays}-day window and are not counted.`
          : null,
      ].filter(Boolean),
    },
    index: {
      pct: indexPct,
      band: bandForLearningIndex(indexPct),
      components,
      missingComponents,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Signals (read-side; LEARN-01..05)                                   */
/* ------------------------------------------------------------------ */

export function learningSignals(state = {}, now = new Date()) {
  const report = buildLearningReport(state, now);
  const signals = [];
  const { closures, latency, lessons, recurrence } = report;

  const overdue = report.queue.filter((row) => row.due);
  if (overdue.length) {
    const worst = [...overdue].sort((a, b) => b.overdueDays - a.overdueDays)[0];
    signals.push({
      ruleId: 'LEARN-01',
      domain: 'Learning',
      title: `${overdue.length} closed event(s) are waiting for an after-action review`,
      detail: 'An event that ended without a review is experience the team paid for and did not collect. The review is four questions, and the first two arrive pre-filled from the frozen record so the answer cannot be rewritten with hindsight.',
      severity: worst.overdueDays >= 30 ? 4 : 3,
      confidence: closures.confidence === 'measured' ? 'high' : 'low',
      evidence: [
        `${overdue.length} of ${closures.dated} dated closure(s) unreviewed (convention: reviewed within ${report.settings.dueDays} days)`,
        `Oldest: “${worst.label}” closed ${worst.outcomeOn}, ${worst.overdueDays} day(s) past the convention`,
        closures.undated ? `${closures.undated} closure(s) have no closing date and cannot be counted` : null,
      ].filter(Boolean),
      action: { label: 'Open the review queue', route: '#/learning' },
    });
  }

  if (recurrence.unclosed.length) {
    const top = recurrence.unclosed[0];
    signals.push({
      ruleId: 'LEARN-02',
      domain: 'Learning',
      title: `“${top.label}” has recurred ${top.eventCount} times and the change committed the first time was never made`,
      detail: 'This is double-loop learning failing: the team keeps diagnosing the same class of failure and keeps not changing the policy that produces it. The app cannot make the change; it can stop the loop from being invisible, and it opens one decision naming the choice between doing it and dropping it honestly.',
      severity: 4,
      confidence: 'high',
      evidence: [
        ...recurrence.unclosed.slice(0, 3).map((row) => `${row.label}: ${row.eventCount} event(s) between ${row.firstSeenOn} and ${row.lastSeenOn}; committed change still open since ${row.firstOpen.heldOn}`),
        `Committed change: ${top.firstOpen.changeNote ? clampText(top.firstOpen.changeNote, 160) : 'no change note recorded'}`,
      ],
      action: { label: 'Open recurrence', route: '#/learning?tab=recurrence' },
    });
  }

  if (lessons.lateOpen) {
    const oldest = report.lessons.changeQueue.find((row) => row.late);
    signals.push({
      ruleId: 'LEARN-03',
      domain: 'Learning',
      title: `${lessons.lateOpen} committed learning change(s) are still open after ${AAR_CHANGE_OPEN_DAYS}+ days`,
      detail: 'A lesson with an unapplied change is a promise the team made to itself in a room. The ledger keeps it visible, and only a dated note from a human can mark it applied — closing the related delegation is not evidence that the practice changed.',
      severity: 3,
      confidence: 'high',
      evidence: [
        `Oldest: “${clampText(oldest?.text || '', 140)}” committed ${oldest?.heldOn || '—'}, ${oldest?.ageDays ?? '—'} day(s) ago`,
        `${lessons.open} of ${lessons.committed} committed change(s) remain open`,
      ],
      action: { label: 'Close or drop the change', route: '#/learning?tab=ledger' },
    });
  }

  if (report.heldWithoutAnyLesson > 0) {
    signals.push({
      ruleId: 'LEARN-04',
      domain: 'Learning',
      title: `${report.heldWithoutAnyLesson} held review(s) produced no lesson at all`,
      detail: 'A review that ends with no lesson, and no honest observation either, is usually a review held to be able to say it was held. That is worth knowing — the count is printed rather than treated as failure.',
      severity: 2,
      confidence: 'high',
      evidence: report.heldRetros
        .filter((r) => !(r.lessons || []).length)
        .slice(0, 4)
        .map((r) => `“${clampText(r.subjectLabel, 100)}” reviewed on ${r.heldOn || r.outcomeOn}`),
      action: { label: 'Open the ledger', route: '#/learning?tab=ledger' },
    });
  }

  if (!report.hasRetros && !overdue.length && closures.dated >= AAR_MIN_CLOSURES) {
    signals.push({
      ruleId: 'LEARN-05',
      domain: 'Learning',
      title: `${closures.unreviewed} closed event(s) and no after-action review on record`,
      detail: 'The workspace holds the closing evidence — forecasts frozen at opening, settled actuals, recorded outcomes — and nothing has compared them. That comparison is the cheapest improvement available to this team and it is not happening.',
      severity: 3,
      confidence: 'high',
      evidence: [
        `${closures.dated} dated closure(s) in the last ${report.settings.windowDays} days, ${closures.reviewed} reviewed`,
        `Coverage ${closures.coveragePct ?? 0}% against a ${closures.coverageFloorPct}% convention`,
      ],
      action: { label: 'Start the first review', route: '#/learning' },
    });
  }

  if (lessons.staleEvidence) {
    signals.push({
      ruleId: 'LEARN-07',
      domain: 'Learning',
      title: `${lessons.staleEvidence} applied lesson artifact link(s) no longer corroborate the current record`,
      detail: 'The linked record was removed, edited, reopened, or no longer meets the date/state contract. The applied claim remains a human claim; repair or replace the artifact if appropriate. This is not evidence that the practice failed.',
      severity: 2,
      confidence: 'high',
      evidence: [`${lessons.staleEvidence} stale artifact link(s) across ${lessons.applied} applied lesson(s)`],
      action: { label: 'Review stale artifacts', route: '#/learning?tab=ledger' },
    });
  }

  if (latency.medianDays !== null && latency.medianDays > report.settings.dueDays) {
    signals.push({
      ruleId: 'LEARN-06',
      domain: 'Learning',
      title: `Reviews are held a median of ${latency.medianDays} days after the event`,
      detail: 'Memory is the cheapest storage and the worst source. The further a review sits from the event, the more it becomes a story about the event rather than a reading of the record — which is why the app pre-fills from the frozen forecast.',
      severity: 2,
      confidence: latency.measured >= 3 ? 'medium' : 'low',
      evidence: [
        `${latency.measured} review(s) with both dates recorded; median ${latency.medianDays} day(s), worst ${latency.worstDays}`,
        `Convention: within ${report.settings.dueDays} day(s) of the close`,
      ],
      action: { label: 'Review the cadence', route: '#/learning?tab=coverage' },
    });
  }

  return signals;
}

export function learningAttentionCount(state = {}, now = new Date()) {
  const report = buildLearningReport(state, now);
  return report.queue.filter((row) => row.due).length
    + report.recurrence.unclosedCount
    + (report.lessons.lateOpen > 0 ? 1 : 0)
    + (report.lessons.staleEvidence > 0 ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/* Brief                                                               */
/* ------------------------------------------------------------------ */

export function learningBrief(state = {}, now = new Date()) {
  const report = buildLearningReport(state, now);
  const lines = [];
  lines.push('LEADOS — AFTER-ACTION & LEARNING BRIEF');
  lines.push(`Generated: ${report.evaluatedAt} (workspace-local, no network)`);
  lines.push(`Engine: ${report.engineVersion}`);
  lines.push('');
  lines.push(`Learning index: ${report.index.pct === null ? 'not measurable yet' : `${report.index.pct}% (${report.index.band.label})`}`);
  if (report.index.missingComponents.length) lines.push(`Components not measurable: ${report.index.missingComponents.join(', ')}`);
  lines.push(`Coverage: ${report.closures.coveragePct === null ? 'counts only' : `${report.closures.coveragePct}%`} — ${report.closures.reviewed} of ${report.closures.dated} dated closure(s) reviewed in ${report.settings.windowDays} days (${report.closures.held} held, ${report.closures.skipped} skipped)`);
  if (report.closures.undated) lines.push(`Excluded: ${report.closures.undated} closure(s) with no closing date`);
  if (report.closures.outsideWindow) lines.push(`Outside the window: ${report.closures.outsideWindow} closure(s)`);
  lines.push(`Awaiting review: ${report.queue.length} (${report.queue.filter((r) => r.due).length} past the ${report.settings.dueDays}-day convention)`);
  lines.push(`Review latency: ${report.latency.medianDays === null ? 'not measurable yet' : `median ${report.latency.medianDays} day(s) over ${report.latency.measured} review(s)`}`);
  lines.push(`Lessons: ${report.lessons.total} (${report.lessons.observations} observation(s), ${report.lessons.committed} change(s) committed, ${report.lessons.applied} applied, ${report.lessons.open} open, ${report.lessons.dropped} dropped)`);
  lines.push(`Applied rate: ${report.lessons.appliedPct === null ? 'not measurable yet' : `${report.lessons.appliedPct}%`}${report.lessons.medianTimeToApplyDays === null ? '' : ` · median ${report.lessons.medianTimeToApplyDays} day(s) from review to application`}`);
  lines.push(`Record corroboration: ${report.lessons.corroborated} of ${report.lessons.applied} applied claim(s)${report.lessons.verificationPct === null ? ' · counts only (sample floor: 5)' : ` · ${report.lessons.verificationPct}%`} · ${report.lessons.staleEvidence} stale artifact link(s); not a measure of effectiveness or causality`);
  lines.push('');
  if (report.queue.length) {
    lines.push('AWAITING REVIEW');
    for (const row of report.queue.slice(0, 10)) {
      lines.push(`- ${row.typeLabel}: ${row.label} — closed ${row.outcomeOn} (${row.waitingDays} day(s) ago)${row.retroId ? ' · draft exists' : ''}`);
    }
    lines.push('');
  }
  if (report.recurrence.unclosedCount) {
    lines.push('UNCLOSED RECURRENCES');
    for (const row of report.recurrence.unclosed.slice(0, 10)) {
      lines.push(`- ${row.label}: ${row.eventCount} event(s), ${row.lessons.length} lesson(s), ${row.open} committed change(s) still open (earliest ${row.firstOpen?.heldOn || '—'})`);
    }
    lines.push('');
  }
  if (report.lessons.changeQueue.length) {
    lines.push('OPEN CHANGES');
    for (const row of report.lessons.changeQueue.slice(0, 10)) {
      lines.push(`- [${lessonClassLabel(row.class)}] ${clampText(row.text, 140)} — committed ${row.heldOn || '—'}, ${row.ageDays ?? '—'} day(s) ago${row.late ? ' (late)' : ''}`);
    }
    lines.push('');
  }
  lines.push('No person is rated by this report. A lesson names a system, a decision or a practice.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Rule ids and the post-commit rule                                   */
/* ------------------------------------------------------------------ */

export const AAR_RULE_IDS = Object.freeze({
  DRAFT: 'RULE-AAR-01',
  ACTION: 'RULE-AAR-02',
  RECURRENCE: 'RULE-AAR-03',
  SUSTAINMENT: 'RULE-AAR-04',
});

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.links.push({
    id: ctx.idFactory('link'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary,
    createdAt: ctx.nowIso,
  });
}

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'learning',
      entityId: targetId || '',
      summary,
      data: { ruleId, action, targetType, targetId },
    });
  }
  out.push({ ruleId, action, targetType, targetId, summary });
}

function markerFor(ruleId, entityId = '') {
  return `[${ruleId}${entityId ? `:${entityId}` : ''}]`;
}

function recordHasMarker(record, marker) {
  if (!record || !marker) return false;
  const haystack = `${record.title || ''} ${record.question || ''} ${record.expectedOutcome || ''} ${record.support || ''} ${record.rationale || ''}`;
  return haystack.includes(marker);
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some((row) => row && recordHasMarker(row, marker));
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((row) => row && recordHasMarker(row, marker));
}

function addDecision(draft, ctx, { title, question, options, reversibility = 'reversible', reviewOn = null }) {
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const record = {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: ctx.todayStr,
    chosen: false,
    rationale: '',
    options: (options || []).map((option, index) => ({
      id: `dopt-${ctx.idFactory('x').split('-').pop()}-${index}`,
      label: option.label.slice(0, 300),
      pros: (option.pros || '').slice(0, 1000),
      cons: (option.cons || '').slice(0, 1000),
    })),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    reversibility,
    createdAt: ctx.nowIso,
  };
  draft.decisions.push(record);
  return record;
}

function addDelegation(draft, ctx, { personId, title, expectedOutcome, support, dueOn, authority = 'recommend' }) {
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const record = {
    id: ctx.idFactory('delegation'),
    personId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 4000),
    authority,
    support: support.slice(0, 4000),
    delegatedOn: ctx.todayStr,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };
  draft.delegations.push(record);
  return record;
}

function personName(draft, personId) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  return person ? person.name : 'someone on the team';
}

/**
 * A draft review is created from the record, not from the leader's memory.
 *
 * This is the only automation in the module that runs on another module's
 * events, and it is deliberately the narrowest possible: it writes one empty
 * review with the two pre-filled questions and the closing date, and nothing
 * else. It never decides the cause, never writes a lesson, and never opens a
 * decision. The cost is paid only on the case/change/decision/delegation close
 * path, and the whole check is an id-aware lookup bounded by that one record.
 */
function autoDraft(draft, ctx, event, out) {
  if (draft.settings?.learningAutoDraft === false) return;
  const targets = {
    'case.resolved': { subjectType: 'case', subjectId: event.entityId },
    'case.updated': { subjectType: 'case', subjectId: event.entityId },
    'change.updated': { subjectType: 'change', subjectId: event.entityId },
    'decision.reviewed': { subjectType: 'decision', subjectId: event.entityId },
    'delegation.completed': { subjectType: 'delegation', subjectId: event.entityId },
    'delegation.updated': { subjectType: 'delegation', subjectId: event.entityId },
  };
  const target = targets[event.type];
  if (!target || !target.subjectId) return;
  const spec = subjectTypeSpec(target.subjectType);
  if (!spec) return;
  const row = (draft[spec.collection] || []).find((r) => r && r.id === target.subjectId);
  if (!row || !spec.isClosed(row)) return;
  const outcomeOn = spec.outcomeOn(row);
  if (!outcomeOn) return; // an undated close cannot be reviewed honestly
  draft.retros = Array.isArray(draft.retros) ? draft.retros : [];
  const existing = draft.retros.find((r) => r && r.subjectType === target.subjectType && r.subjectId === target.subjectId);
  if (existing) return;
  const evidence = subjectEvidence(draft, target.subjectType, target.subjectId);
  const retro = {
    id: ctx.idFactory('retro'),
    subjectType: target.subjectType,
    subjectId: target.subjectId,
    subjectLabel: spec.title(row),
    outcomeOn,
    status: 'draft',
    autoDrafted: true,
    intended: evidence?.intended ? evidence.intended.slice(0, 1200) : '',
    actual: evidence?.actual ? evidence.actual.slice(0, 1200) : '',
    cause: '',
    sustain: '',
    improve: '',
    skipReason: '',
    heldOn: null,
    participants: [],
    lessons: [],
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
    history: [{ at: ctx.nowIso, type: 'created', summary: `Drafted from the closing record (${spec.dateBasis})` }],
  };
  draft.retros.push(retro);
  note(ctx, AAR_RULE_IDS.DRAFT, 'created', 'retro', retro.id,
    `Drafted an after-action review for “${clampText(spec.title(row), 70)}” from its closing record`, out);
}

/**
 * RULE-AAR-01..03 — the post-commit rule.
 *
 * Trigger discipline, learned the hard way in Session 61: the only events that
 * reach the expensive path are `learning.*`. The cheap path — the auto-draft —
 * is an id lookup on the closing record and touches no other collection.
 */
export function learningRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const out = [];

  // Cheap path: a review is drafted the moment work ends. Runs before the
  // learning.* branch and does not scan anything beyond the closing record.
  if (!event.type.startsWith('learning.')) {
    autoDraft(draft, runCtx, event, out);
    return out;
  }

  const force = ctx.force === true || event.force === true;
  if (!force && draft.settings?.learningAutoPropagate === false) return out;

  /* -------- RULE-AAR-02 — committed lessons become real work -------- */
  // Lessons are usually recorded *after* the review is held (the room happens,
  // then the leader writes down what it concluded), so the rule has to fire on
  // both events. Binding it only to `held` would mean the change a review
  // committed never became anything at all — which is exactly the failure this
  // module exists to make visible, and it would have been committed by the
  // module itself.
  const isHeldEvent = event.type === 'learning.retro.held'
    || (event.type === 'learning.lesson.added' && (draft.retros || []).some((row) => row && row.id === event.entityId && row.status === 'held'));
  if (isHeldEvent) {
    const retro = (draft.retros || []).find((row) => row && row.id === event.entityId);
    if (!retro || retro.status !== 'held') return out;
    const lessons = (retro.lessons || []).filter((lesson) => lesson.changeType !== 'none');
    const openLessons = lessons.filter((lesson) => lesson.state === 'open');
    let delegations = 0;
    let decisions = 0;
    for (const lesson of openLessons) {
      if (lesson.changeType === 'delegation' && lesson.ownerId && delegations < 2) {
        const marker = markerFor(AAR_RULE_IDS.ACTION, lesson.id);
        if (delegationExists(draft, marker)) continue;
        if (!(draft.people || []).some((p) => p && p.id === lesson.ownerId && p.status !== 'archived')) continue;
        const delegation = addDelegation(draft, runCtx, {
          personId: lesson.ownerId,
          title: `Make the change: ${clampText(lesson.text, 120)}`.slice(0, 200),
          expectedOutcome: `${clampText(lesson.changeNote, 1600)} ${marker}`.trim(),
          support: `Committed in the after-action review of “${clampText(retro.subjectLabel, 80)}” (${retro.heldOn}). Mark the lesson applied only when the practice has actually changed — closing this delegation is not the evidence. ${marker}`,
          dueOn: addDays(runCtx.todayStr, 14),
          authority: 'act-inform',
        });
        pushLink(draft, {
          sourceType: 'learning', sourceId: retro.id, targetType: 'delegation', targetId: delegation.id,
          relation: 'tracks-followup', ruleId: AAR_RULE_IDS.ACTION,
          summary: `Learning change ${marker}`,
        }, runCtx);
        note(ctx, AAR_RULE_IDS.ACTION, 'created', 'delegation', delegation.id,
          `Opened an owned change delegation for “${clampText(lesson.text, 70)}”`, out);
        delegations += 1;
      }
      if (lesson.changeType === 'decision' && decisions < 1) {
        const marker = markerFor(AAR_RULE_IDS.ACTION, lesson.id);
        if (decisionExists(draft, marker)) continue;
        const decision = addDecision(draft, runCtx, {
          title: `Decide the change: ${clampText(lesson.text, 100)}`.slice(0, 200),
          question: [
            `The after-action review of “${clampText(retro.subjectLabel, 80)}” on ${retro.heldOn} concluded: ${clampText(lesson.text, 300)}.`,
            lesson.changeNote ? `The change it committed: ${clampText(lesson.changeNote, 300)}.` : '',
            'Make the change now, stage it behind a test, or drop it and record that the review changed nothing.',
            marker,
          ].filter(Boolean).join(' '),
          options: [
            { label: 'Make the change now', pros: 'The evidence is fresh and the people are in the room; a lesson acted on in the week it was learned is the only kind that changes a team.', cons: 'A change decided in a review often needs an owner who was not in the room.' },
            { label: 'Stage it: smallest reversible version first', pros: 'Buys evidence before the practice is rewritten everywhere, and limits the cost if the diagnosis was wrong.', cons: 'A staged version can become the whole change if nobody returns to it.' },
            { label: 'Drop it and record why', pros: 'An honestly dropped change is better than an open loop that everyone has quietly abandoned.', cons: 'If the same class recurs, the ledger will show this decision was the turning point that was not taken.' },
          ],
          reversibility: 'reversible',
          reviewOn: addDays(runCtx.todayStr, 21),
        });
        pushLink(draft, {
          sourceType: 'learning', sourceId: retro.id, targetType: 'decision', targetId: decision.id,
          relation: 'decides', ruleId: AAR_RULE_IDS.ACTION,
          summary: `Learning change decision ${marker}`,
        }, runCtx);
        note(ctx, AAR_RULE_IDS.ACTION, 'created', 'decision', decision.id,
          `Opened a decision for the change “${clampText(lesson.text, 70)}”`, out);
        decisions += 1;
      }
      if (lesson.ownerId && lesson.changeType !== 'delegation') {
        const person = (draft.people || []).find((p) => p && p.id === lesson.ownerId && p.status !== 'archived');
        const talkMarker = markerFor(`${AAR_RULE_IDS.ACTION}-talk`, lesson.id);
        if (person) {
          person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
          if (!person.talkingPoints.some((line) => String(line).includes(talkMarker))) {
            person.talkingPoints = [...person.talkingPoints,
              `${talkMarker} Learning follow-up, not a performance point: does the change we agreed after “${clampText(retro.subjectLabel, 60)}” actually exist yet, and what is in its way?`.slice(0, 200)].slice(-12);
            note(ctx, AAR_RULE_IDS.ACTION, 'updated', 'person', person.id,
              'Queued a blameless follow-up talking point for the lesson owner', out);
          }
        }
      }
    }
  }

  /* ----- RULE-AAR-04 — corroborated change gets a sustainment check -- */
    if (event.type === 'learning.lesson.evidence.recorded') {
      const retro = (draft.retros || []).find((row) => row && row.id === event.entityId && row.status === 'held');
      const lesson = retro && (retro.lessons || []).find((row) => row && row.id === event.automationOptions?.lessonId);
      const evidence = lesson && (lesson.evidence || []).find((item) => item.id === event.automationOptions?.evidenceId);
      const owner = lesson?.ownerId && (draft.people || []).find((person) => person?.id === lesson.ownerId && person.status !== 'archived');
      const checked = evidence && assessLessonEvidence(draft, retro, lesson).items.find((item) => item.id === evidence.id);
      if (checked?.status === 'record-corroborated' && owner) {
        const marker = markerFor(AAR_RULE_IDS.SUSTAINMENT, evidence.id);
        if (!delegationExists(draft, marker)) {
          const dueOn = addDays(runCtx.todayStr, 30);
          const delegation = addDelegation(draft, runCtx, {
            personId: owner.id,
            title: `Check practice persistence: ${lessonClassLabel(lesson.class)}`.slice(0, 200),
            expectedOutcome: `On or after ${dueOn}, record whether the practice is still in use, what evidence supports that, and any recurrence. This checks persistence only; it does not establish that the change caused an outcome improvement. ${marker}`,
            support: `Follow-up to an after-action review. A linked ${evidence.sourceType} artifact was dated ${evidence.evidenceOn}. The artifact is linked in the workspace; no lesson narrative is copied into this delegation. No individual rating or causal claim. ${marker}`,
            dueOn,
            authority: 'recommend',
          });
          pushLink(draft, { sourceType: 'lesson', sourceId: lesson.id, targetType: 'delegation', targetId: delegation.id,
            relation: 'tracks-followup', ruleId: AAR_RULE_IDS.SUSTAINMENT,
            summary: `Dated sustainment check for record-corroborated lesson ${marker}` }, runCtx);
          pushLink(draft, { sourceType: evidence.sourceType, sourceId: evidence.sourceId, targetType: 'delegation', targetId: delegation.id,
            relation: 'tracks-followup', ruleId: AAR_RULE_IDS.SUSTAINMENT,
            summary: `Thirty-day practice-persistence check; not a causal test ${marker}` }, runCtx);
          note(ctx, AAR_RULE_IDS.SUSTAINMENT, 'created', 'delegation', delegation.id,
            'Opened a dated practice-persistence check from corroborated evidence', out);
        }
      }
    }

  if (isHeldEvent) {
    /* ----- RULE-AAR-03 — a repeated class with an open change --------- */
    const report = buildLearningReport(draft, now);
    for (const row of report.recurrence.unclosed.slice(0, 2)) {
      const marker = markerFor(AAR_RULE_IDS.RECURRENCE, `${row.class}:${row.firstOpen?.id || ''}`);
      if (decisionExists(draft, marker)) continue;
      const decision = addDecision(draft, runCtx, {
        title: `Close or drop the change for recurring “${clampText(row.label, 80)}”`.slice(0, 200),
        question: [
          `The same class of lesson has appeared in ${row.eventCount} separate reviews between ${row.firstSeenOn} and ${row.lastSeenOn}.`,
          row.firstOpen?.changeNote ? `The change committed the first time was: ${clampText(row.firstOpen.changeNote, 300)} — still open since ${row.firstOpen.heldOn}.` : 'No change has ever been committed for this class, which is why it keeps returning.',
          'Do it, stage it, or drop it and stop treating it as a lesson. Repeating a diagnosis without changing anything is how a team learns to stop diagnosing.',
          marker,
        ].filter(Boolean).join(' '),
        options: [
          { label: 'Do the change now, with a dated owner', pros: 'The recurrence is the evidence that the previous answer was insufficient; acting on it now is the only way to stop the loop.', cons: 'Repeated failures often need more than the change originally proposed.' },
          { label: 'Re-diagnose the class before changing anything', pros: 'Honest when the same class keeps producing different mechanisms, so the committed change was aimed at the wrong cause.', cons: 'A re-diagnosis that produces no change is the same loop with more words.' },
          { label: 'Accept it as a standing cost and stop logging it', pros: 'Some frictions are cheaper to live with than to solve, and saying so is a decision rather than a drift.', cons: 'Accepting a cost is legitimate only when the acceptance is written down here, not inferred later.' },
        ],
        reversibility: 'reversible',
        reviewOn: addDays(runCtx.todayStr, 21),
      });
      pushLink(draft, {
        sourceType: 'learning', sourceId: row.firstOpen?.retroId || '', targetType: 'decision', targetId: decision.id,
        relation: 'decides', ruleId: AAR_RULE_IDS.RECURRENCE,
        summary: `Recurrence decision ${marker}`,
      }, runCtx);
      note(ctx, AAR_RULE_IDS.RECURRENCE, 'created', 'decision', decision.id,
        `Opened a close-or-drop decision for recurring “${row.label}” (${row.eventCount} events)`, out);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Convention totals (used by tests and the UI)                        */
/* ------------------------------------------------------------------ */

export function learningTotals(state = {}, now = new Date()) {
  const report = buildLearningReport(state, now);
  return {
    retros: report.retros.length,
    held: report.heldRetros.length,
    awaiting: report.queue.length,
    coveragePct: report.closures.coveragePct,
    lessons: report.lessons.total,
    committed: report.lessons.committed,
    applied: report.lessons.applied,
    openChanges: report.lessons.open,
    unclosedRecurrences: report.recurrence.unclosedCount,
    indexPct: report.index.pct,
    windowDays: report.settings.windowDays,
    dueDays: report.settings.dueDays,
  };
}

export { median as medianOf };
