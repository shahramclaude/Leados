/**
 * app/core/domain/spanCalibrationRules.js — RULE-SPC-01..03 on the shared
 * post-commit spine (ADR-0100, Schema v102).
 *
 *  RULE-SPC-01 REGISTER. A frozen calibration becomes a graph node: one
 *    `calibrates` edge to every leadership span the reading covers (the design
 *    owner and each ancestor), one `rolls-up-to` edge per ancestor, and one
 *    `governs`-style decision only when a rung is falsified. Cross-module
 *    propagation and cross-altitude roll-up in the SAME atomic transaction.
 *    Marker-idempotent.
 *
 *  RULE-SPC-02 FALSIFIED RUNG. When a rung's verdict is `too-narrow` (work runs
 *    past the span it was given) or `too-wide` (the span allows more time than
 *    the work needs), open exactly ONE governed DACI decision per rung per ISO
 *    week, owned by the span above the rung's highest incumbent. The question
 *    carries the interval and the two honest options — re-route the work, or
 *    revise the span — and never names a person. The engine changes no horizon.
 *
 *  RULE-SPC-03 STALENESS AND DRIFT. When the newest reading is older than the
 *    declared review window, open one bounded review task per ISO week; when a
 *    calibrated ladder is in force and the latest reading's proposal no longer
 *    matches it, open one governed re-decision per ISO week. Both are
 *    marker-idempotent, both are pausable, and an explicit scan always runs.
 *
 * What the rules never do: move a horizon, adopt a ladder, close a decision,
 * edit an item, or write a number into a frozen reading other than its once-only
 * grade (RULE-SPC-04, applied below on scan).
 */
import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import { ALTITUDE_KEYS, altitudeByKey, altitudeRank } from './chainRegistry.js';
import {
  SPAN_EVENTS,
  SPAN_LIMITS,
  SPAN_RULE_IDS,
  SPAN_TRIGGER_PREFIX,
} from './spanCalibrationRegistry.js';
import { spanCalibrationConventions } from './spanCalibrationSchema.js';
import {
  buildSpanCalibrationReport,
  buildSpanReading,
  gradeSpanReading,
} from './spanCalibration.js';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

const markerId = (kind, key) => `spc-${kind}-${hash(String(key))}`;

function markersOf(draft) {
  return Array.isArray(draft.spanMarkers) ? draft.spanMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.spanMarkers)) draft.spanMarkers = [];
  if (draft.spanMarkers.some((row) => row && row.id === marker.id)) return false;
  draft.spanMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.spanMarkers.length > SPAN_LIMITS.markers) {
    draft.spanMarkers.splice(0, draft.spanMarkers.length - SPAN_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: String(summary).slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
    });
  }
}

function ancestorsAbove(draft, seatId, now) {
  if (!seatId) return [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== LEADER_ID && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationale }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility: 'reversible',
    driver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: rationale.slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    tags: ['span-calibration'],
    createdAt: ctx.now.toISOString(),
  };
}

/* ------------------------------------------------- RULE-SPC-01: register */

function registerRule(draft, ctx, out, conventions) {
  const readings = Array.isArray(draft.spanReadings) ? draft.spanReadings : [];
  const targets = ctx.event.type === SPAN_EVENTS.FROZEN && ctx.event.entityId
    ? readings.filter((row) => row && row.id === ctx.event.entityId)
    : readings.slice(0, 6);
  let registered = 0;
  for (const reading of targets) {
    const id = markerId('registered', reading.id);
    if (markersOf(draft).some((row) => row && row.id === id)) continue;
    const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
    const leaderAltitude = built.chain.nodes.get(LEADER_ID)?.altitude || 'manager';
    const covered = (reading.rungs || []).filter((rung) => rung.verdict !== 'insufficient');
    addMarker(draft, ctx, {
      id,
      kind: 'registered',
      key: reading.id,
      note: `Calibration ${reading.id} registered with ${covered.length} measurable rung(s).`,
    });
    // The reading calibrates the ladder every leadership span is running on, so
    // it hangs off the spans that own the ladder — never off a person's work.
    const spans = [LEADER_ID, ...ancestorsAbove(draft, LEADER_ID, ctx.now)];
    for (const spanId of [...new Set(spans)]) {
      addLink(draft, ctx, 'spanreading', reading.id, 'person', spanId, 'calibrates',
        SPAN_RULE_IDS.register,
        `Calibration of ${reading.frozenOn}: ${covered.length} measurable rung(s), ${(reading.counterfactual?.riseN || 0)} open item(s) would move up.`);
    }
    for (const spanId of ancestorsAbove(draft, LEADER_ID, ctx.now)) {
      addLink(draft, ctx, 'spanreading', reading.id, 'person', spanId, 'rolls-up-to',
        SPAN_RULE_IDS.register,
        `Span calibration ${reading.frozenOn} rolls up to this span: leader altitude ${leaderAltitude}.`);
    }
    registered += 1;
    note(ctx, out, SPAN_RULE_IDS.register, 'registered', 'spanreading', reading.id,
      `Calibration ${reading.frozenOn} registered as a graph node with ${covered.length} measurable rung(s) and a roll-up edge per leadership ancestor.`);
  }
  return registered;
}

/* --------------------------------------------- RULE-SPC-02: falsified rung */

function falsifiedRule(draft, ctx, out, conventions) {
  const report = buildSpanCalibrationReport(draft, { now: ctx.now, settings: draft.settings || {} });
  if (!report.ok) return 0;
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), Math.max(7, Math.min(45, conventions.reviewDays)));
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  let opened = 0;
  for (const rung of report.rungs) {
    if (opened >= SPAN_LIMITS.decisionsPerScan) break;
    if (rung.verdict !== 'too-narrow' && rung.verdict !== 'too-wide') continue;
    const id = markerId('falsified', `${rung.key}|${wk}`);
    if (markersOf(draft).some((row) => row && row.id === id)) continue;
    // The decision is owned by the span that can actually move work or re-declare
    // a ladder. A rung cannot re-declare its own span, and in a workspace with no
    // rung above the one in question the leader is the honest owner — the page
    // says so rather than inventing a level that does not exist.
    const ownerId = LEADER_ID;
    const ownerAltitude = built.chain.nodes.get(ownerId)?.altitude || 'manager';
    const ownerLabel = altitudeByKey(ownerAltitude)?.label || 'the workspace leader';
    const interval = rung.survivalAtDeclaredLoPct === null || rung.survivalAtDeclaredHiPct === null
      ? 'unbounded'
      : `${rung.survivalAtDeclaredLoPct}–${rung.survivalAtDeclaredHiPct}%`;
    const question = rung.verdict === 'too-narrow'
      ? `The ${rung.label} rung declares a ${rung.declaredDays}-day span, but ${rung.survivalAtDeclaredPct}% of its work (${interval}) is still open at that span, above the ${report.conventions.coveragePct}% coverage promise. Decide which is true: the work belongs a rung higher, or the declared span is wrong. Nothing has been changed automatically.`
      : `The ${rung.label} rung declares a ${rung.declaredDays}-day span, but only ${rung.survivalAtDeclaredPct}% of its work (${interval}) is still open at that span, below the ${report.conventions.coveragePct}% coverage promise. Decide which is true: the work belongs lower than this rung, or the declared span is too generous. Nothing has been changed automatically.`;
    const decision = decisionRecord(ctx, {
      title: `${rung.label} span is falsified by the record (${rung.declaredDays} days declared)`,
      question,
      options: [
        ['Re-route the work at this rung', 'Keeps every declared span and changes what sits at it.', 'Moves ownership, which needs the receiving span to accept it.'],
        ['Revise the declared span', 'A dated adoption from a frozen reading; the before/after is kept.', 'A longer span slows escalation; a shorter one escalates more work.'],
        ['Leave the declaration and record the tension', 'The declaration is a leadership choice, and the reading prints the price.', 'The record and the ladder stay disagreeing on purpose.'],
      ],
      reviewOn,
      rationale: `${SPAN_RULE_IDS.falsified}: measured at #/span-calibration on ${dayKey(ctx.now)} (decided ${rung.decidedN}, censored ${rung.censoredN}, coverage ${report.conventions.coveragePct}%). Owned at ${ownerLabel} because the span under question cannot re-declare its own ladder.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    addMarker(draft, ctx, {
      id,
      kind: 'falsified',
      key: `${rung.key}|${wk}`,
      decisionId: decision.id,
      weekKey: wk,
      note: `${rung.label}: declared ${rung.declaredDays}d, verdict ${rung.verdict}.`,
    });
    addLink(draft, ctx, 'spanreading', ctx.event.entityId || readingIdFor(draft), 'decision', decision.id, 'informs',
      SPAN_RULE_IDS.falsified,
      `${rung.label} rung falsified: ${rung.declaredDays}d declared, ${rung.survivalAtDeclaredPct}% still open at that span.`);
    note(ctx, out, SPAN_RULE_IDS.falsified, 'created', 'decision', decision.id,
      `Falsified ${rung.label} rung opened one governed decision at the span above it.`);
    opened += 1;
  }
  return opened;
}

function readingIdFor(draft) {
  const readings = Array.isArray(draft.spanReadings) ? draft.spanReadings : [];
  return readings[0]?.id || null;
}

/* ------------------------------------ RULE-SPC-03: staleness and drift */

function stalenessRule(draft, ctx, out, conventions) {
  const readings = Array.isArray(draft.spanReadings) ? draft.spanReadings : [];
  const report = buildSpanCalibrationReport(draft, { now: ctx.now, settings: draft.settings || {} });
  const wk = weekKey(ctx.now);
  let opened = 0;
  const latest = readings[0] || null;
  const oldestUseful = latest ? latest.frozenOn : null;
  const ageDays = oldestUseful ? Math.round((Date.parse(`${dayKey(ctx.now)}T00:00:00Z`) - Date.parse(`${oldestUseful}T00:00:00Z`)) / 86400000) : null;
  if (report.totals.measurableRungs > 0 && (ageDays === null || ageDays > conventions.reviewDays)) {
    const id = markerId('stale', wk);
    if (!markersOf(draft).some((row) => row && row.id === id)) {
      const today = dayKey(ctx.now);
      const task = {
        id: ctx.idFactory('dlg'),
        title: 'Re-calibrate the leadership ladder from the record',
        personId: draft.people?.find((person) => person && person.id === LEADER_ID)?.id || null,
        delegatedOn: today,
        dueOn: addDays(today, 7),
        status: 'active',
        notes: `No span calibration has been frozen in ${ageDays === null ? 'this workspace yet' : `${ageDays} days`}; the declared ladder has not been tested against the record since. ${SPAN_RULE_IDS.staleness}.`,
        createdAt: ctx.now.toISOString(),
        completedOn: null,
        returnedOn: null,
      };
      if (task.personId) {
        if (!Array.isArray(draft.delegations)) draft.delegations = [];
        draft.delegations.push(task);
      }
      addMarker(draft, ctx, { id, kind: 'stale', key: wk, weekKey: wk, taskId: task.personId ? task.id : null, note: 'Calibration review task opened.' });
      note(ctx, out, SPAN_RULE_IDS.staleness, 'created', 'delegation', task.personId ? task.id : 'none',
        'The ladder has not been re-measured inside the declared review window; one bounded review task opened.');
      opened += 1;
    }
  }
  // Drift: the ladder in force was adopted from a reading, and the record has
  // since moved. This is a re-decision, not an automatic change. Compared field
  // by field so a rounding coincidence cannot open a decision.
  const drift = report.ladder.source === 'calibrated'
    && report.ladder.effective.map((row) => `${row.key}:${row.days}`).join('|')
      !== report.ladder.proposed.map((row) => `${row.key}:${row.days}`).join('|');
  if (drift) {
    const id = markerId('drift', wk);
    if (!markersOf(draft).some((row) => row && row.id === id)) {
      const adopted = report.ladder.effective.map((row) => `${row.key} ${row.days}d`).join(', ');
      const proposed = report.ladder.proposed.map((row) => `${row.key} ${row.days}d`).join(', ');
      const decision = decisionRecord(ctx, {
        title: 'The adopted ladder and the record disagree',
        question: `The ladder in force was adopted on ${report.ladder.adoptedOn || 'an unrecorded date'} (${adopted}). The record now supports ${proposed}. Decide: re-adopt, restore the declared ladder, or leave the in-force table and record the tension. Nothing changes by itself.`,
        options: [
          ['Adopt the record’s table again', 'Keeps the ladder measured rather than declared.', 'Another adoption is another date in the ledger; two adoptions inside one quarter invites churn.'],
          ['Restore the declared ladder', 'Returns to the convention and keeps both readings.', 'Returns to a table the record has already contradicted.'],
          ['Leave it and record the tension', 'The declaration is a leadership choice.', 'The tension stays on the page, priced, until someone decides.'],
        ],
        reviewOn: addDays(dayKey(ctx.now), Math.max(7, Math.min(45, conventions.reviewDays))),
        rationale: `${SPAN_RULE_IDS.staleness}: adoption drift detected at #/span-calibration.`,
      });
      if (!Array.isArray(draft.decisions)) draft.decisions = [];
      draft.decisions.push(decision);
      addMarker(draft, ctx, { id, kind: 'drift', key: wk, weekKey: wk, decisionId: decision.id, note: 'Adoption drift decision opened.' });
      note(ctx, out, SPAN_RULE_IDS.staleness, 'created', 'decision', decision.id,
        'Adoption drift: one governed re-decision opened for the ladder in force.');
      opened += 1;
    }
  }
  return opened;
}

/* --------------------------------- RULE-SPC-04: grade a due reading once */

/**
 * A frozen calibration quotes a probability per rung — that work is still open
 * at the declared span. When the review date passes, the claim is graded ONCE
 * against items opened after the freeze, and the grade is written onto the
 * reading. No other field of a frozen reading is ever rewritten.
 */
export function gradeDueReadings(draft, ctx) {
  const readings = Array.isArray(draft.spanReadings) ? draft.spanReadings : [];
  const today = dayKey(ctx.now);
  let graded = 0;
  for (const reading of readings) {
    if (!reading || reading.gradedAt || !reading.reviewOn || reading.reviewOn > today) continue;
    const result = gradeSpanReading(reading, draft, { now: ctx.now, settings: draft.settings || {} });
    if (!result.ok) continue;
    reading.gradedAt = result.grade.gradedOn;
    reading.grade = result.grade;
    graded += 1;
  }
  return graded;
}

/* ------------------------------------------------------------------- rule */

export function spanCalibrationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === SPAN_EVENTS.SCAN;
  const own = event.type.startsWith(SPAN_TRIGGER_PREFIX);
  if (!explicit && !own) return [];
  const conventions = spanCalibrationConventions(ctx.settings || draft.settings || {});
  if (!explicit && conventions.autoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const out = [];
  // Grading first: a due reading is closed before a new one is measured, so the
  // ledger never holds two open claims about the same rung.
  const graded = gradeDueReadings(draft, runCtx);
  if (graded) {
    note(runCtx, out, 'RULE-SPC-04', 'graded', 'spanreading', readingIdFor(draft),
      `${graded} due calibration reading(s) graded once against post-freeze work.`);
  }
  registerRule(draft, runCtx, out, conventions);
  falsifiedRule(draft, runCtx, out, conventions);
  stalenessRule(draft, runCtx, out, conventions);
  return out;
}

export { buildSpanReading, SPAN_EVENTS };
export const SPAN_CALIBRATION_RULE_IDS = SPAN_RULE_IDS;
export const SPAN_ALTITUDE_KEYS = ALTITUDE_KEYS;
