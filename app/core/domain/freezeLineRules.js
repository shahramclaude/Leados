/**
 * app/core/domain/freezeLineRules.js — RULE-FRZ-01..03 on the shared post-commit
 * spine (ADR-0099, Schema v101).
 *
 *  RULE-FRZ-01 REGISTER. A committed or reverted structural design is a freeze
 *    line. When a continuity reading is frozen for it (or a scan runs), the
 *    reading becomes a graph node: one `freezes` edge to the design, up to
 *    twelve `re-projects` edges to the pre-freeze federation assessments it
 *    re-projects in aggregate, and one `rolls-up-to` edge to every leadership
 *    ancestor of the design owner's span — cross-module propagation and
 *    cross-altitude roll-up in the SAME atomic transaction. Marker-idempotent.
 *
 *  RULE-FRZ-02 DEGRADED LINE. When a freeze line's reading verdict is
 *    `degraded` (the connected share of declared edges fell beyond the declared
 *    threshold across the line), open exactly ONE governed DACI decision per
 *    line per ISO week, owned at the span ABOVE the design owner (the span that
 *    can author a structural change), naming the line by date and kind — never
 *    a person. The engine changes no reporting line and closes no decision.
 *
 *  RULE-FRZ-03 TIMING GUARD. Scan the frozen federation snapshots for suppressed
 *    rows that still carry a carriage date (legacy leak: a withheld count must
 *    not disclose WHEN it was withheld). For each affected snapshot open at most
 *    one governed redaction decision per snapshot per ISO week. The live view
 *    and CSV already withhold those dates regardless; this rule makes the
 *    stored ledger honest too.
 *
 * All three are bounded, marker-idempotent and pausable by
 * `freezeLineAutoPropagate`; an explicit `freezeline.scan` always runs.
 */
import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';
import { detectFreezeLines, measureContinuity, timingGuardAudit, buildFreezeReading } from './freezeLine.js';
import { freezeLineConventions } from './freezeLineSchema.js';
import {
  FREEZE_EVENTS,
  FREEZE_LIMITS,
  FREEZE_LINE_EVENTS,
  FREEZE_RULE_IDS,
  FREEZE_TRIGGER_PREFIX,
} from './freezeLineRegistry.js';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

const markerId = (kind, key) => `frz-${kind}-${hash(String(key))}`;

function markersOf(draft) {
  return Array.isArray(draft.freezeMarkers) ? draft.freezeMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.freezeMarkers)) draft.freezeMarkers = [];
  if (draft.freezeMarkers.some((row) => row?.id === marker.id)) return false;
  draft.freezeMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.freezeMarkers.length > FREEZE_LIMITS.markers) {
    draft.freezeMarkers.splice(0, draft.freezeMarkers.length - FREEZE_LIMITS.markers);
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
    summary: summary.slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: summary.slice(0, 240) });
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
    createdAt: ctx.now.toISOString(),
  };
}

/* -------------------------------------------------- RULE-FRZ-01: register */

function registerRule(draft, ctx, out, conventions) {
  const readings = Array.isArray(draft.freezeReadings) ? draft.freezeReadings : [];
  const lines = detectFreezeLines(draft, { now: ctx.now });
  const assessments = Array.isArray(draft.federationAssessments) ? draft.federationAssessments : [];
  let registered = 0;
  const targets = ctx.event.type === FREEZE_EVENTS.FROZEN && ctx.event.entityId
    ? readings.filter((row) => row && row.id === ctx.event.entityId)
    : readings.slice(-FREEZE_LIMITS.lines);
  for (const reading of targets) {
    const line = lines.find((entry) => entry.designId === reading.designId) || null;
    const id = markerId('registered', reading.id);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    addMarker(draft, ctx, {
      id,
      kind: 'registered',
      key: reading.id,
      designId: reading.designId,
      note: `Freeze line ${line ? `${line.kind} on ${line.on}` : reading.lineOn} registered with its continuity reading.`,
    });
    // Cross-module: the reading freezes the design's freeze line...
    addLink(draft, ctx, 'freezereading', reading.id, 'orgdesign', reading.designId, 'freezes',
      FREEZE_RULE_IDS.registered,
      `This continuity reading freezes the reporting tree as it stood before the ${reading.kind} line of ${reading.lineOn}.`);
    // ...re-projects the pre-freeze federation assessments in aggregate only...
    const pre = assessments
      .filter((row) => row && row.frozenOn && row.frozenOn < reading.lineOn)
      .sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn)))
      .slice(0, 12);
    for (const assessment of pre) {
      addLink(draft, ctx, 'freezereading', reading.id, 'federationassessment', assessment.id, 're-projects',
        FREEZE_RULE_IDS.registered,
        'A pre-freeze federation reading is re-projected by this line only in aggregate; its span detail is never restated.');
    }
    // ...and rolls up to every leadership ancestor of the design owner's span.
    const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
    const ownerSeat = line?.ownerId ? (built.byId.has(line.ownerId) ? line.ownerId : null) : null;
    const rollTargets = ownerSeat ? [ownerSeat, ...ancestorsAbove(draft, ownerSeat, ctx.now)] : [];
    for (const targetId of rollTargets) {
      addLink(draft, ctx, 'freezereading', reading.id, 'person', targetId, 'rolls-up-to',
        FREEZE_RULE_IDS.registered,
        `Freeze-line reading for ${reading.lineOn}: verdict ${reading.verdict}, connected share ${reading.before?.coveragePct ?? 'refused'}% → ${reading.after?.coveragePct ?? 'refused'}%.`);
    }
    registered += 1;
    note(ctx, out, FREEZE_RULE_IDS.registered, 'registered', 'freezereading', reading.id,
      `Freeze line of ${reading.lineOn} registered: ${pre.length} pre-freeze reading(s) re-projected in aggregate, ${rollTargets.length} ancestor roll-up edge(s).`);
  }
  return registered;
}

/* ------------------------------------------------ RULE-FRZ-02: degraded */

function degradedRule(draft, ctx, out, conventions) {
  const lines = detectFreezeLines(draft, { now: ctx.now });
  const readings = Array.isArray(draft.freezeReadings) ? draft.freezeReadings : [];
  const designs = Array.isArray(draft.orgDesigns) ? draft.orgDesigns : [];
  const wk = weekKey(ctx.now);
  const reviewOn = addDays(dayKey(ctx.now), Math.max(7, Math.min(30, conventions.freezeLineWindowDays)));
  let opened = 0;
  for (const line of lines.slice(-FREEZE_LIMITS.lines)) {
    if (opened >= FREEZE_LIMITS.decisionsPerScan) break;
    const design = designs.find((row) => row && row.id === line.designId) || null;
    if (!design) continue;
    const frozen = readings
      .filter((row) => row && row.designId === line.designId)
      .sort((a, b) => String(b.frozenOn).localeCompare(String(a.frozenOn)))[0] || null;
    const verdict = frozen ? frozen.verdict : measureContinuity(draft, { now: ctx.now, settings: draft.settings, design }).verdict;
    if (verdict !== 'degraded') continue;
    const id = markerId('degraded', `${line.designId}|${wk}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const before = frozen?.before || measureContinuity(draft, { now: ctx.now, settings: draft.settings, design }).before;
    const after = frozen?.after || measureContinuity(draft, { now: ctx.now, settings: draft.settings, design }).after;
    const decision = decisionRecord(ctx, {
      title: `Continuity degraded across the ${line.kind} freeze line of ${line.on}`,
      question: [
        `The ${line.kind} structural design of ${line.on} moved ${line.movesN} reporting line(s). Across that freeze line, the connected share of declared leadership edges fell from ${before?.coveragePct ?? 'refused'}% to ${after?.coveragePct ?? 'refused'}% (Wilson 95% ${before?.wilsonLowPct ?? '—'}–${before?.wilsonHighPct ?? '—'}% → ${after?.wilsonLowPct ?? '—'}–${after?.wilsonHighPct ?? '—'}%), beyond the declared ${conventions.freezeLineDropPct}-point threshold.`,
        'This is a measurement of the STRUCTURE — which measured information channels survived the reorganisation — not a rating of any person, and no reporting line has been changed.',
        'What should change: restore a dated channel on the lost edges, accept and restate the baseline, or amend the structure?',
      ].join(' '),
      options: [
        ['Open a direct, dated channel on each lost edge', 'Restores the measured path between the spans the reorg separated.', 'Costs standing forum slots the new structure may not have budgeted.'],
        ['Restate the baseline and accept the new line', 'Honest when the new structure is the decision and the old series is not comparable.', 'Pre-freeze readings stay non-comparable; the brief must say so.'],
        ['Amend the structural design', 'Reverts or adjusts the freeze line itself.', 'A reorganisation changes accountability; decide it as one, not as a metric fix.'],
      ],
      reviewOn,
      rationale: `RULE-FRZ-02: verdict degraded on the ${line.on} freeze line (${line.movesN} line move(s)); opened for a human decision, owned at the span above the design owner.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    // Owned at the span above the design owner; rolls up from there.
    const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
    const ownerSeat = line.ownerId && built.byId.has(line.ownerId) ? line.ownerId : null;
    const parent = ownerSeat ? (built.chain.nodes.get(ownerSeat)?.parentId || null) : null;
    if (ownerSeat) {
      addLink(draft, ctx, 'decision', decision.id, 'person', ownerSeat, 'informs', FREEZE_RULE_IDS.degraded,
        'The continuity-degradation decision informs the span whose freeze line degraded.');
    }
    const rollTargets = ownerSeat ? ancestorsAbove(draft, ownerSeat, ctx.now) : [];
    for (const targetId of rollTargets) {
      addLink(draft, ctx, 'decision', decision.id, 'person', targetId, 'rolls-up-to', FREEZE_RULE_IDS.degraded,
        `The continuity-degradation decision for the ${line.on} freeze line rolls up to this span.`);
    }
    void parent;
    addMarker(draft, ctx, {
      id,
      kind: 'degraded',
      key: `${line.designId}|${wk}`,
      designId: line.designId,
      decisionId: decision.id,
      weekKey: wk,
      note: `Verdict degraded on the ${line.on} line; one governed decision opened (${decision.id}).`,
    });
    opened += 1;
    note(ctx, out, FREEZE_RULE_IDS.degraded, 'created', 'decision', decision.id,
      `Continuity degraded across the ${line.on} freeze line; one governed decision opened at the owning span's ancestor.`);
  }
  return opened;
}

/* ---------------------------------------------- RULE-FRZ-03: timing guard */

function timingGuardRule(draft, ctx, out) {
  const wk = weekKey(ctx.now);
  const guard = timingGuardAudit(draft);
  if (!guard.suppressedRowsWithDatesN) return 0;
  const assessments = Array.isArray(draft.federationAssessments) ? draft.federationAssessments : [];
  let opened = 0;
  for (const assessment of assessments) {
    if (opened >= FREEZE_LIMITS.decisionsPerScan) break;
    const rows = Array.isArray(assessment?.rows) ? assessment.rows : [];
    const leaks = rows.filter((row) => row && row.suppressed === true && row.lastCarriageOn).length;
    if (!leaks) continue;
    const id = markerId('timing', `${assessment.id}|${wk}`);
    if (markersOf(draft).some((row) => row?.id === id)) continue;
    const reviewOn = addDays(dayKey(ctx.now), 14);
    const decision = decisionRecord(ctx, {
      title: `Legacy snapshot carries dates on ${leaks} suppressed row(s)`,
      question: [
        `Frozen federation snapshot ${assessment.id} (frozen ${assessment.frozenOn || 'unknown'}) marks ${leaks} row(s) suppressed while still storing their last-carriage date. A withheld count must not disclose WHEN it was withheld — that date is a timing side channel on a withheld cell.`,
        'The live view, the CSV and every new freeze already withhold the date. What should happen to this stored snapshot: redact its timing fields in place, or export-and-withdraw it?',
      ].join(' '),
      options: [
        ['Redact the timing fields in the stored snapshot', 'Closes the channel in the ledger itself.', 'Mutates a frozen record; the redaction must be logged, not silent.'],
        ['Export-and-withdraw the snapshot', 'Keeps the frozen record immutable and removes the leaking copy.', 'The backup file may still hold the old copy; state that limit.'],
      ],
      reviewOn,
      rationale: `RULE-FRZ-03: timing-guard audit found ${leaks} suppressed row(s) with dates in snapshot ${assessment.id}; the live projections already withhold them.`,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    addMarker(draft, ctx, {
      id,
      kind: 'timing-guard',
      key: `${assessment.id}|${wk}`,
      decisionId: decision.id,
      weekKey: wk,
      note: `${leaks} suppressed row(s) in snapshot ${assessment.id} still carry a carriage date.`,
    });
    opened += 1;
    note(ctx, out, FREEZE_RULE_IDS.timingGuard, 'created', 'decision', decision.id,
      `Timing guard: ${leaks} suppressed row(s) with dates found in a legacy frozen snapshot; one redaction decision opened.`);
  }
  return opened;
}

/* ------------------------------------------------------------------- rule */

export function freezeLineRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === FREEZE_EVENTS.SCAN;
  const own = event.type.startsWith(FREEZE_TRIGGER_PREFIX);
  const lineEvent = FREEZE_LINE_EVENTS.includes(event.type);
  if (!explicit && !own && !lineEvent) return [];
  const conventions = freezeLineConventions(ctx.settings || draft.settings || {});
  if (!explicit && conventions.freezeLineAutoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const out = [];
  // On a raw orgdesign event there is no reading yet; register nothing until a
  // reading is frozen or a scan runs, but record that the line was seen.
  if (lineEvent && event.entityId) {
    const id = markerId('seen', event.entityId);
    if (!markersOf(draft).some((row) => row?.id === id)) {
      addMarker(draft, runCtx, {
        id,
        kind: 'line-seen',
        key: event.entityId,
        designId: event.entityId,
        note: `Freeze line crossed by ${event.type}; a continuity reading can be frozen from #/freeze-line.`,
      });
      note(runCtx, out, FREEZE_RULE_IDS.registered, 'seen', 'orgdesign', event.entityId,
        'A structural design crossed a freeze line; freeze a continuity reading to register it.');
    }
  }
  registerRule(draft, runCtx, out, conventions);
  degradedRule(draft, runCtx, out, conventions);
  timingGuardRule(draft, runCtx, out);
  return out;
}

/** Re-exported so actions can freeze a reading through the same read model. */
export { buildFreezeReading };
