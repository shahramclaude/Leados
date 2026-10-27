/**
 * app/core/domain/vitals.js — longitudinal workspace vitals.
 *
 * THE PROBLEM THIS SOLVES
 * Every other surface in LeadOS answers a question about *now*. A leader
 * cannot ask "was my team in better shape before I ran that intervention?"
 * because nothing in the product has ever reconstructed what the workspace
 * looked like on a past date. This module does exactly that, and it does it
 * without adding a single new piece of telemetry: each vital is re-derived
 * from the dated lifecycle fields the leader already typed (`delegatedOn`,
 * `completedOn`, `resolvedOn`, `observedOn`, `decidedOn`, …).
 *
 * THREE RULES THAT MAKE THE HISTORY HONEST
 *  1. No fabricated points. A bucket with no contributing record is `null`,
 *     never `0`. The UI draws a gap, not a flat line at zero.
 *  2. No invented close dates. A record that is closed but has no close date
 *     is excluded from latency vitals and reported in `undated`, because
 *     interpolating it would manufacture the very quantity being measured.
 *  3. No backdating. The series starts at the first dated record in the
 *     workspace, so an empty workspace does not render 26 weeks of zeroes
 *     that look like a collapse in performance.
 *
 * A count of zero *is* a real measurement (`0 feedback this month` is a fact),
 * while a mean over zero observations is not (`no feedback, so no latency`).
 * Those two cases are deliberately separated.
 *
 * Pure module: no storage access, no DOM, no clock (the caller supplies
 * `asOf`). Deterministic.
 */

import { addDays, dayKey, daysBetween, mean, round, toDate, weekStart } from '../time.js';
import { aggregate } from './pulse.js';

/* --------------------------------------------------------------- constants */

/** Default trailing window for rate/mean vitals, in days. */
export const VITAL_WINDOW_DAYS = 28;
/** Default evaluation grid: weekly buckets. */
export const VITAL_GRAIN = 'week';
/** A vital needs at least this many measured buckets to be worth estimating on. */
export const VITAL_MIN_POINTS = 6;

export const VITAL_DIRECTIONS = {
  'up-good': 'Higher is better',
  'down-good': 'Lower is better',
};

export const VITAL_UNITS = {
  'per-person': 'per person / 4 wk',
  days: 'days',
  count: 'count',
  score: 'score / 5',
  index: 'index 0–100',
  ratio: 'share',
};

/* ----------------------------------------------------------------- helpers */

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Records whose day field falls in the half-open window (from, to]. */
function inWindow(items, field, from, to) {
  const out = [];
  for (const item of items || []) {
    if (!item) continue;
    const day = dayKey(item[field]);
    if (day && day > from && day <= to) out.push(item);
  }
  return out;
}

/**
 * People who were on the team on `day`.
 *
 * `archivedAt` is a timestamp, so it is compared as a day. A person with no
 * start date is treated as always present: the roster is the leader's record
 * of who is on the team, and refusing to compute a denominator because one
 * start date is blank would silently disable every per-person vital.
 */
function activePeopleOn(state, day) {
  const people = (state.people || []).filter((p) => {
    if (!p) return false;
    const start = dayKey(p.startDate);
    if (start && start > day) return false;
    const archived = dayKey(p.archivedAt);
    if (archived && archived <= day) return false;
    if (p.status === 'archived' && !archived) return false;
    return true;
  });
  return people;
}

/** The earliest dated record in the workspace, so history starts where data starts. */
export function firstRecordDay(state) {
  let earliest = null;
  const consider = (value) => {
    const day = dayKey(value);
    if (!day) return;
    if (!earliest || day < earliest) earliest = day;
  };
  for (const key of ['people', 'onboarding', 'oneOnOnes', 'feedback', 'goals', 'delegations', 'pulses', 'decisions', 'cases', 'changes', 'negotiations', 'recognition']) {
    for (const record of state?.[key] || []) {
      if (!record) continue;
      for (const field of ['createdAt', 'startDate', 'date', 'openedOn', 'delegatedOn', 'observedOn', 'dueDate', 'sentOn', 'dueOn']) {
        consider(record[field]);
      }
    }
  }
  return earliest;
}

/* ------------------------------------------------------------ the catalog */

/**
 * Each vital declares:
 *  - `kind: 'rate' | 'mean'` — `rate` legitimately reads 0 with no events;
 *    `mean` returns null when nothing was observed.
 *  - `denominator` for per-person rates.
 *  - `sample(state, ctx)` where `ctx = { from, to }` is a HALF-OPEN event
 *    window `(from, to]`, returning `{ value, n, ... }`.
 *
 * Why a range and not a trailing window: an evaluation grid must not let the
 * first "post" bucket contain days from before the intervention. Anchoring the
 * buckets on the treatment date and giving each sampler an exact range makes
 * that impossible by construction rather than by convention. Exploratory
 * series simply pass `from = to - windowDays`, which reproduces a trailing
 * window.
 *
 * Named frameworks are cited inline because the choice of measure is a
 * modelling decision, not a neutral one.
 */
/**
 * When did this vital's underlying record-keeping actually begin?
 *
 * A series that starts at the first *workspace* record still lies when only one
 * module has any history: fifteen leading zeroes on 1:1 cadence read as fifteen
 * weeks in which nobody met, when the truth is that the 1:1 log only reaches
 * back eight weeks. So each vital declares the first dated record it can draw
 * on, and buckets whose whole sampling window predates it are dropped instead of
 * being drawn as absence.
 *
 * This is the difference between "we measured zero" and "we were not measuring
 * yet", and conflating them is how a dashboard makes a manager look negligent.
 */
function earliestDay(list, field) {
  let earliest = null;
  for (const row of Array.isArray(list) ? list : []) {
    const day = dayKey(row && row[field]);
    if (day && (!earliest || day < earliest)) earliest = day;
  }
  return earliest;
}

const VITAL_COVERAGE = {
  'feedback-cadence': (state) => earliestDay(state.feedback, 'date'),
  'feedback-latency': (state) => earliestDay(state.feedback, 'date'),
  'oneoneone-cadence': (state) => earliestDay(state.oneOnOnes, 'date'),
  'oneoneone-mood': (state) => earliestDay(state.oneOnOnes, 'date'),
  'delegation-cycle': (state) => earliestDay(state.delegations, 'delegatedOn'),
  'delegation-throughput': (state) => earliestDay(state.delegations, 'delegatedOn'),
  'decision-latency': (state) => earliestDay(state.decisions, 'date'),
  'case-open': (state) => earliestDay(state.cases, 'openedOn'),
  'case-cycle': (state) => earliestDay(state.cases, 'openedOn'),
  'pulse-index': (state) => earliestDay(state.pulses, 'date'),
  'recognition-cadence': (state) => earliestDay(state.recognition, 'date'),
  'negotiation-cycle': (state) => earliestDay(state.negotiations, 'openedOn'),
};

export const VITALS = Object.freeze([
  {
    id: 'feedback-cadence',
    label: 'Feedback given',
    short: 'Feedback',
    unit: 'per-person',
    direction: 'up-good',
    kind: 'rate',
    framework: 'SBI cadence (Centre for Creative Leadership)',
    description: 'Specific feedback entries per active person in the trailing four weeks. A leading indicator of whether behavioural information is moving at all.',
    sample(state, ctx) {
      const people = activePeopleOn(state, ctx.to);
      const rows = inWindow(state.feedback, 'date', ctx.from, ctx.to);
      if (!people.length) return { value: null, n: rows.length };
      return { value: round(rows.length / people.length, 3), n: rows.length };
    },
  },
  {
    id: 'feedback-latency',
    label: 'Observation→feedback latency',
    short: 'FB latency',
    unit: 'days',
    direction: 'down-good',
    kind: 'mean',
    framework: 'Feedback half-life',
    description: 'Mean days between when something was observed and when it was said. Long latency is how an incident becomes a surprise at review time.',
    sample(state, ctx) {
      const rows = inWindow(state.feedback, 'date', ctx.from, ctx.to);
      const gaps = [];
      let undated = 0;
      for (const row of rows) {
        const observed = dayKey(row.observedOn);
        const said = dayKey(row.date);
        if (!observed || !said) { undated += 1; continue; }
        const gap = daysBetween(observed, said);
        if (gap !== null && gap >= 0) gaps.push(gap);
        else undated += 1;
      }
      if (!gaps.length) return { value: null, n: 0, undated };
      return { value: round(mean(gaps), 2), n: gaps.length, undated };
    },
  },
  {
    id: 'oneoneone-cadence',
    label: '1:1 cadence',
    short: '1:1s',
    unit: 'per-person',
    direction: 'up-good',
    kind: 'rate',
    framework: 'High-quality 1:1s (Grove / Horowitz)',
    description: 'Held 1:1s per active person in the trailing four weeks. Skipped and moved sessions are excluded — this measures conversations that actually happened.',
    sample(state, ctx) {
      const people = activePeopleOn(state, ctx.to);
      const rows = inWindow(state.oneOnOnes, 'date', ctx.from, ctx.to)
        .filter((r) => r.status === 'held' || r.status === undefined || r.status === null);
      if (!people.length) return { value: null, n: rows.length };
      return { value: round(rows.length / people.length, 3), n: rows.length };
    },
  },
  {
    id: 'oneoneone-mood',
    label: 'Recorded 1:1 mood',
    short: 'Mood',
    unit: 'score',
    direction: 'up-good',
    kind: 'mean',
    framework: 'Single-item affect probe',
    description: 'Mean of the 1:1 mood you recorded (1–5). This is the leader’s own reading of the room, not an employee survey — it is a prompt for a conversation, never a performance rating.',
    sample(state, ctx) {
      const rows = inWindow(state.oneOnOnes, 'date', ctx.from, ctx.to);
      const moods = rows.map((r) => num(r.mood)).filter((m) => m !== null && m >= 1 && m <= 5);
      if (!moods.length) return { value: null, n: 0 };
      return { value: round(mean(moods), 2), n: moods.length };
    },
  },
  {
    id: 'delegation-cycle',
    label: 'Delegation cycle time',
    short: 'Del cycle',
    unit: 'days',
    direction: 'down-good',
    kind: 'mean',
    framework: 'Little’s Law flow time',
    description: 'Mean days from delegated to completed, for delegations completed in the window. The flow-time half of Little’s Law.',
    sample(state, ctx) {
      const rows = inWindow(state.delegations, 'completedOn', ctx.from, ctx.to);
      const gaps = [];
      let undated = 0;
      for (const row of rows) {
        const from = dayKey(row.delegatedOn);
        const to = dayKey(row.completedOn);
        if (!from || !to) { undated += 1; continue; }
        const gap = daysBetween(from, to);
        if (gap !== null && gap >= 0) gaps.push(gap);
        else undated += 1;
      }
      if (!gaps.length) return { value: null, n: 0, undated };
      return { value: round(mean(gaps), 2), n: gaps.length, undated };
    },
  },
  {
    id: 'delegation-throughput',
    label: 'Delegations completed',
    short: 'Del done',
    unit: 'count',
    direction: 'up-good',
    kind: 'rate',
    framework: 'Throughput (Kanban)',
    description: 'Delegations recorded complete in the trailing four weeks — capacity actually handed over, not merely assigned.',
    sample(state, ctx) {
      const rows = inWindow(state.delegations, 'completedOn', ctx.from, ctx.to);
      return { value: rows.length, n: rows.length };
    },
  },
  {
    id: 'decision-latency',
    label: 'Decision latency',
    short: 'Dec latency',
    unit: 'days',
    direction: 'down-good',
    kind: 'mean',
    framework: 'Decision tempo (Reinertsen CD3)',
    description: 'Mean days from a decision being framed to `decidedOn`. Decisions made before Schema v28 have no stamp and are counted as unmeasured, never inferred.',
    sample(state, ctx) {
      const rows = inWindow(state.decisions, 'decidedOn', ctx.from, ctx.to);
      const gaps = [];
      let undated = 0;
      for (const row of rows) {
        const from = dayKey(row.date);
        const to = dayKey(row.decidedOn);
        if (!from || !to) { undated += 1; continue; }
        const gap = daysBetween(from, to);
        if (gap !== null && gap >= 0) gaps.push(gap);
        else undated += 1;
      }
      if (!gaps.length) return { value: null, n: 0, undated };
      return { value: round(mean(gaps), 2), n: gaps.length, undated };
    },
  },
  {
    id: 'case-open',
    label: 'Open operational cases',
    short: 'Open cases',
    unit: 'count',
    direction: 'down-good',
    kind: 'rate',
    framework: 'WIP (Little’s Law)',
    description: 'Operational cases open on this date, reconstructed from open/resolved dates. Work in progress, not a quality judgment.',
    sample(state, ctx) {
      const end = ctx.to;
      let open = 0;
      for (const record of state.cases || []) {
        if (!record) continue;
        const opened = dayKey(record.openedOn);
        if (!opened || opened > end) continue;
        const resolved = dayKey(record.resolvedOn);
        if (resolved && resolved <= end) continue;
        open += 1;
      }
      return { value: open, n: open };
    },
  },
  {
    id: 'case-cycle',
    label: 'Case resolution time',
    short: 'Case cycle',
    unit: 'days',
    direction: 'down-good',
    kind: 'mean',
    framework: 'Time-to-recover',
    description: 'Mean days from opening to resolution for cases resolved in the window.',
    sample(state, ctx) {
      const rows = inWindow(state.cases, 'resolvedOn', ctx.from, ctx.to);
      const gaps = [];
      for (const row of rows) {
        const from = dayKey(row.openedOn);
        const to = dayKey(row.resolvedOn);
        if (!from || !to) continue;
        const gap = daysBetween(from, to);
        if (gap !== null && gap >= 0) gaps.push(gap);
      }
      if (!gaps.length) return { value: null, n: 0 };
      return { value: round(mean(gaps), 2), n: gaps.length };
    },
  },
  {
    id: 'pulse-index',
    label: 'Team pulse index',
    short: 'Pulse',
    unit: 'index',
    direction: 'up-good',
    kind: 'mean',
    framework: 'Anonymised pulse (floor on every window)',
    description: 'Mean pulse score rescaled to 0–100. Computed with the same anonymity floor, unanimity suppression and complete-response rule as the Health view — a window that cannot be released safely reports a gap.',
    sample(state, ctx) {
      const result = aggregate(state, ctx.to, { windowDays: ctx.windowDays, minRequired: ctx.minRequired });
      if (result.overall === null || result.overall === undefined) {
        return { value: null, n: result.usableResponses || 0, privacy: result.blockedReason || null };
      }
      return { value: round(((result.overall - 1) / 4) * 100, 1), n: result.usableResponses };
    },
  },
  {
    id: 'recognition-cadence',
    label: 'Recognition given',
    short: 'Recognition',
    unit: 'per-person',
    direction: 'up-good',
    kind: 'rate',
    framework: 'Strengths spotting (Buckingham)',
    description: 'Recognition entries per active person in the trailing four weeks. Weak but early — it moves before a retention signal does.',
    sample(state, ctx) {
      const people = activePeopleOn(state, ctx.to);
      const rows = inWindow(state.recognition, 'date', ctx.from, ctx.to);
      if (!people.length) return { value: null, n: rows.length };
      return { value: round(rows.length / people.length, 3), n: rows.length };
    },
  },
  {
    id: 'negotiation-cycle',
    label: 'Negotiation cycle time',
    short: 'Neg cycle',
    unit: 'days',
    direction: 'down-good',
    kind: 'mean',
    framework: 'BATNA-to-close cycle',
    description: 'Mean days from open to close for negotiations closed in the window. Slow cycles leak value through the implementation-shortfall effect.',
    sample(state, ctx) {
      const rows = inWindow(state.negotiations, 'closedOn', ctx.from, ctx.to);
      const gaps = [];
      for (const row of rows) {
        const from = dayKey(row.openedOn);
        const to = dayKey(row.closedOn);
        if (!from || !to) continue;
        const gap = daysBetween(from, to);
        if (gap !== null && gap >= 0) gaps.push(gap);
      }
      if (!gaps.length) return { value: null, n: 0 };
      return { value: round(mean(gaps), 2), n: gaps.length };
    },
  },
]);

export const VITAL_BY_ID = Object.freeze(Object.fromEntries(VITALS.map((v) => [v.id, v])));

/** Vitals whose movement is a *good* thing when `direction` is satisfied. */
export function isImprovement(vital, delta) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return null;
  if (delta === 0) return null;
  return vital.direction === 'up-good' ? delta > 0 : delta < 0;
}

/**
 * Signed movement expressed so that positive always means "the leader's stated
 * direction was right". Used by the study evaluator so a `down-good` vital is
 * never accidentally rewarded for going up.
 */
export function signedTowardHypothesis(vital, delta) {
  if (delta === null || !Number.isFinite(delta)) return null;
  return vital.direction === 'up-good' ? delta : -delta;
}

/* ------------------------------------------------------------ the series */

/**
 * Bucket end dates, newest last, never starting before the workspace's first
 * dated record.
 */
function bucketEnds(state, { asOf, buckets, grain }) {
  // The grid ends at the last COMPLETE period. Emitting the current, partly
  // elapsed week would put a 1–3 day bucket next to seven-day buckets, which
  // reads as a sudden collapse or spike at "today" and is the single easiest
  // way to make a change-point detector cry wolf.
  const endOfLastComplete = addDays(weekStart(asOf), -1);
  if (!endOfLastComplete) return [];
  const step = grain === 'month' ? 28 : 7;
  const earliest = firstRecordDay(state);
  const ends = [];
  for (let i = buckets - 1; i >= 0; i -= 1) {
    const end = addDays(endOfLastComplete, -step * i);
    if (!end) continue;
    if (earliest && end < earliest) continue;
    ends.push(end);
  }
  return ends;
}

/**
 * Build one vital's time series.
 *
 * @param {object} state workspace state
 * @param {string} vitalId catalog id
 * @param {{asOf?:Date|string, buckets?:number, grain?:'week'|'month',
 *          windowDays?:number, minRequired?:number}} options
 */
export function buildVitalSeries(state, vitalId, options = {}) {
  const vital = VITAL_BY_ID[vitalId];
  const empty = {
    id: vitalId, ok: false, label: vital ? vital.label : vitalId,
    unit: vital ? vital.unit : null, direction: vital ? vital.direction : null,
    points: [], n: 0, measured: 0, reason: null,
  };
  if (!vital) return { ...empty, reason: 'Unknown vital.' };
  if (!state || typeof state !== 'object') return { ...empty, reason: 'No workspace loaded.' };

  const asOf = toDate(options.asOf) || new Date();
  const grain = options.grain === 'month' ? 'month' : VITAL_GRAIN;
  const buckets = Math.max(4, Math.min(104, Math.round(Number(options.buckets)) || 26));
  const windowDays = Math.max(7, Math.min(180, Math.round(Number(options.windowDays)) || VITAL_WINDOW_DAYS));
  const minRequired = options.minRequired ?? state.settings?.pulseMinResponses ?? 5;

  const ends = Array.isArray(options.ends) && options.ends.length
    ? options.ends
    : bucketEnds(state, { asOf, buckets, grain });
  if (ends.length < 2) {
    return { ...empty, reason: 'There is not yet enough dated record to reconstruct a history.' };
  }

  // Anchored grids are a study's own design and are never trimmed: if the
  // window predates the record, the study must report that it could not be
  // measured rather than silently shortening the window to fit.
  let grid = ends;
  if (!options.anchored && typeof VITAL_COVERAGE[vitalId] === 'function') {
    const coverage = VITAL_COVERAGE[vitalId](state);
    // No record of this kind has ever existed. A run of zeroes here would be the
    // most confident lie in the product: it would say "you gave no feedback for
    // twenty-two weeks" about a workspace that has simply never recorded any.
    if (!coverage) {
      return {
        ...empty,
        reason: 'There is no dated record of this kind yet, so there is nothing to reconstruct.',
      };
    }
    // A bucket is kept once at least half of its sampling window falls after the
    // record-keeping began. Requiring the whole window is statistically tidier
    // but throws away the first month of a young workspace; requiring only that
    // the bucket ends after it re-creates the fake-zero problem this exists to
    // prevent. Half a window is the honest compromise, and it is stated here so
    // nobody has to guess why the first point looks slightly low.
    const slack = Math.floor(windowDays / 2);
    if (coverage) grid = ends.filter((end) => addDays(end, -windowDays) >= addDays(coverage, -slack));
  }

  const points = [];
  let undated = 0;
  let privacyBlocked = 0;
  for (const end of grid) {
    // Half-open (from, to]. Exploratory mode is a trailing window; an anchored
    // study grid passes explicit non-overlapping ranges from `buildAnchoredGrid`.
    const from = options.anchored && options.fromFor ? options.fromFor(end) : addDays(end, -windowDays);
    const ctx = { from, to: end, windowDays, minRequired };
    let result;
    try {
      result = vital.sample(state, ctx);
    } catch {
      result = { value: null, n: 0 };
    }
    if (result && result.undated) undated += result.undated;
    if (result && result.privacy) privacyBlocked += 1;
    const value = result && result.value !== null && Number.isFinite(result.value) ? round(result.value, 3) : null;
    points.push({ date: end, value, n: result?.n ?? 0 });
  }

  const measured = points.filter((p) => p.value !== null).length;
  return {
    id: vital.id,
    ok: measured >= 2,
    label: vital.label,
    short: vital.short,
    unit: vital.unit,
    direction: vital.direction,
    kind: vital.kind,
    framework: vital.framework,
    description: vital.description,
    grain,
    windowDays,
    points,
    n: points.length,
    measured,
    undated,
    privacyBlocked,
    reason: measured >= 2 ? null : 'Fewer than two measurable buckets — this vital cannot be reconstructed from the recorded dates yet.',
  };
}

/**
 * Every reconstructable vital, with a one-line summary the Studies tab uses to
 * offer a metric picker that only lists metrics the workspace can actually
 * measure.
 */
export function buildVitalPanel(state, options = {}) {
  const rows = VITALS.map((vital) => buildVitalSeries(state, vital.id, options));
  const usable = rows.filter((row) => row.measured >= VITAL_MIN_POINTS);
  return {
    asOf: dayKey(options.asOf || new Date()),
    rows,
    usable,
    usableIds: usable.map((row) => row.id),
    unavailable: rows.filter((row) => row.measured < VITAL_MIN_POINTS).map((row) => ({
      id: row.id, label: row.label, measured: row.measured, reason: row.reason,
    })),
  };
}

/* --------------------------------------------------- anchored study grids */

/**
 * Build a non-overlapping grid anchored on an intervention date.
 *
 * Pre bucket j covers the 7 (or `bucketDays`) days immediately before the
 * intervention; post bucket k covers the days immediately after. Day `T`
 * itself is the first post day, so no bucket ever mixes pre- and post-days.
 * This is the single most important design choice in the evaluator: a trailing
 * window on the treatment date would silently import contamination into the
 * first "after" measurement and bias every estimate towards zero.
 *
 * Returns `{ ends, fromFor, treatmentIndex, preCount, postCount }` ready to
 * hand to `buildVitalSeries({ ends, fromFor, anchored: true })`.
 */
export function buildAnchoredGrid(treatmentDate, { preBuckets = 12, postBuckets = 6, bucketDays = 7 } = {}) {
  const treatment = dayKey(treatmentDate);
  if (!treatment) return null;
  const pre = Math.max(2, Math.min(52, Math.round(preBuckets) || 12));
  const post = Math.max(1, Math.min(26, Math.round(postBuckets) || 6));
  const step = Math.max(7, Math.min(35, Math.round(bucketDays) || 7));

  const ends = [];
  const starts = [];
  for (let j = pre; j >= 1; j -= 1) {
    // Days (T - step*j) .. (T - step*j + step - 1)
    const start = addDays(treatment, -step * j);
    starts.push(start);
    ends.push(addDays(start, step - 1));
  }
  for (let k = 0; k < post; k += 1) {
    const start = addDays(treatment, step * k);
    starts.push(start);
    ends.push(addDays(start, step - 1));
  }
  const byEnd = new Map(ends.map((end, i) => [end, starts[i]]));
  return {
    ends,
    fromFor: (end) => (byEnd.has(end) ? addDays(byEnd.get(end), -1) : addDays(end, -step)),
    treatmentIndex: pre,
    preCount: pre,
    postCount: post,
    bucketDays: step,
    treatmentDate: treatment,
    firstDay: starts[0],
    lastDay: ends[ends.length - 1],
  };
}

/* ------------------------------------------------- change-point detection */

export const CUSUM_K = 0.5;
export const CUSUM_H = 4;

/**
 * Two-sided tabular CUSUM over the measured points (Page, 1954).
 *
 * Deviation from the series mean, standardised by the pooled short-term
 * standard deviation (mean absolute successive difference, which is robust to
 * the very level shifts we are trying to find — a plain sample SD is inflated
 * by them and hides the break).
 *
 * k = 0.5σ is the conventional half-sigma slack; h = 4σ trades a little
 * sensitivity for far fewer false alarms than the classic 5σ. Both are
 * conventions, not constants, and are reported to the caller.
 *
 * This is the module's *proactive* half: it finds a structural break the
 * leader has not written down, so the Studies tab can say "something changed
 * around 12 May — did you run an intervention then?".
 */
export function cusumChangepoints(points, { k = CUSUM_K, h = CUSUM_H } = {}) {
  const measured = (points || []).filter((p) => p && p.value !== null && Number.isFinite(p.value));
  if (measured.length < 6) {
    return { ok: false, breaks: [], sigma: null, reason: 'At least six measured buckets are needed to look for a structural break.' };
  }
  const values = measured.map((p) => p.value);
  const target = mean(values);
  // Mean absolute successive difference / 1.128 is the d2 constant for the
  // moving-range estimator of sigma. It survives level shifts that a raw SD
  // would absorb, which is the whole point of using it here.
  let sumAbs = 0;
  for (let i = 1; i < values.length; i += 1) sumAbs += Math.abs(values[i] - values[i - 1]);
  const sigmaRaw = (sumAbs / (values.length - 1)) / 1.128;
  const sigma = sigmaRaw > 0 ? sigmaRaw : (Math.max(...values) - Math.min(...values)) > 0 ? (Math.max(...values) - Math.min(...values)) / 3 : 0;
  if (!(sigma > 0)) {
    return { ok: false, breaks: [], sigma: 0, reason: 'The series is flat, so no change point can be located.' };
  }

  const breaks = [];
  let sHigh = 0;
  let sLow = 0;
  for (let i = 0; i < measured.length; i += 1) {
    const z = (measured[i].value - target) / sigma;
    sHigh = Math.max(0, sHigh + z - k);
    sLow = Math.max(0, sLow - z - k);
    if (sHigh > h) {
      breaks.push({ date: measured[i].date, index: i, side: 'up', statistic: round(sHigh, 2) });
      sHigh = 0;
    } else if (sLow > h) {
      breaks.push({ date: measured[i].date, index: i, side: 'down', statistic: round(sLow, 2) });
      sLow = 0;
    }
  }

  return {
    ok: true,
    breaks,
    sigma: round(sigma, 4),
    target: round(target, 4),
    k, h,
    note: `Tabular CUSUM, target ${round(target, 2)}, σ̂ ${round(sigma, 3)} (moving-range estimator), slack k=${k}σ, decision h=${h}σ.`,
  };
}

/**
 * The most recent structural break across every usable vital — the single
 * "when did something change?" answer the Today card and the IMP-05 signal
 * are built from.
 */
export function detectStructuralBreaks(state, options = {}) {
  const panel = buildVitalPanel(state, options);
  const out = [];
  for (const row of panel.usable) {
    const result = cusumChangepoints(row.points);
    for (const brk of result.breaks || []) {
      out.push({
        vitalId: row.id,
        vitalLabel: row.label,
        direction: row.direction,
        unit: row.unit,
        ...brk,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
