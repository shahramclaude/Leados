/**
 * app/core/domain/federationRules.js — RULE-FED-01..03 on the shared post-commit
 * spine (ADR-0090, Schema v95).
 *
 *  RULE-FED-01 MEASURE. A frozen assessment is a first-class node: it writes one
 *    `summarizes-span` edge to the seat it assessed and one to every leadership
 *    ancestor above that seat, in the SAME atomic transaction, plus one
 *    idempotent `measured` marker. The reading therefore rolls up like every
 *    other record instead of being a dashboard nobody above can see.
 *
 *  RULE-FED-02 SILENT EDGE. For every declared edge measured as silent, bypassed
 *    or stale, open exactly ONE governed decision per edge per ISO week, owned at
 *    the span ABOVE the edge (the span that can open a channel), naming the edge
 *    by altitude and typed id — never by a person. The engine sends nothing,
 *    changes no reporting line and rates no one.
 *
 *  RULE-FED-03 RECOVERY. When an edge that once produced a silent-edge finding
 *    is measurably connected again, record one `reconnect` marker and one typed
 *    `reconnects` edge from the assessment to the span below it. The open
 *    decision is deliberately NOT closed here: a measurement recovering is not a
 *    human sign-off, and the engine must not pretend it is.
 *
 * All three are bounded, marker-idempotent and pausable by
 * `federationAutoPropagate`; an explicit scan always runs.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { measureFederation, federationWeekKey } from './federation.js';
import { federationConventions } from './federationSchema.js';
import {
  FEDERATION_EVENTS,
  FEDERATION_LIMITS,
  FEDERATION_RULE_IDS,
  FEDERATION_STATE_META,
  FEDERATION_TRIGGER_PREFIX,
} from './federationRegistry.js';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

const markerId = (kind, key) => `fed-${kind}-${hash(String(key))}`;

function markersOf(draft) {
  return Array.isArray(draft.federationMarkers) ? draft.federationMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.federationMarkers)) draft.federationMarkers = [];
  if (draft.federationMarkers.some((row) => row?.id === marker.id)) return false;
  draft.federationMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.federationMarkers.length > FEDERATION_LIMITS.markers) {
    draft.federationMarkers.splice(0, draft.federationMarkers.length - FEDERATION_LIMITS.markers);
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
    if (cursor !== 'leader' && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

/* --------------------------------------------- RULE-FED-01: measurement roll-up */

function measureRule(draft, ctx, out) {
  const assessments = Array.isArray(draft.federationAssessments) ? draft.federationAssessments : [];
  const target = assessments.find((row) => row?.id === ctx.event.entityId) || null;
  if (!target) return;
  const id = markerId('measured', target.id);
  if (markersOf(draft).some((row) => row?.id === id)) return;
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });

  // Roll-up targets. A declared seat owns its reading, so the reading links to
  // that seat and to every leadership ancestor above it. The local operator
  // view owns no seat at all, so its workspace-wide reading links to every span
  // it actually measured — otherwise it would write an edge to a pseudo-seat
  // that no person and no screen can resolve.
  const targets = new Set();
  if (built.byId.has(target.scopeSeatId)) {
    targets.add(target.scopeSeatId);
    for (const ancestorId of ancestorsAbove(draft, target.scopeSeatId, ctx.now)) targets.add(ancestorId);
  } else {
    for (const row of target.rows) {
      if (row.seatId) targets.add(row.seatId);
      if (row.parentId) targets.add(row.parentId);
    }
  }

  let links = 0;
  for (const targetId of targets) {
    if (links >= FEDERATION_LIMITS.rows) break;
    if (!built.byId.has(targetId)) continue;
    const isOwn = targetId === target.scopeSeatId;
    if (addLink(draft, ctx, 'federationassessment', target.id, 'person', targetId, 'summarizes-span',
      FEDERATION_RULE_IDS.measured,
      isOwn
        ? `A frozen federation reading of the ${target.rows.length} declared edge(s) in this span, measured from carriage.`
        : `The federation reading rolls up to this span: ${target.summary.direct} connected, ${target.summary.silent} silent, coverage ${target.summary.coverage.refused ? 'withheld' : `${target.summary.coverage.pct}%`}.`)) links += 1;
  }
  addMarker(draft, ctx, {
    id,
    kind: 'measured',
    assessmentId: target.id,
    childSeatId: null,
    parentSeatId: null,
    state: null,
    weekKey: null,
    note: `Frozen assessment measured ${target.rows.length} declared edge(s); ${links} typed roll-up edge(s) written.`,
  });
  note(ctx, out, FEDERATION_RULE_IDS.measured, 'rolled-up', 'federationassessment', target.id,
    `Frozen federation reading linked to ${links} leadership span(s) in the same transaction.`);
}

/* ------------------------------------------------ RULE-FED-02: silent edge */

function edgeDecisionId(ctx, childSeatId, parentSeatId, weekKey) {
  return markerId('silent-edge', `${childSeatId}>${parentSeatId}|${weekKey}`);
}

function edgeDecision(ctx, { child, parent, stateKey, evidence, channelText, reviewOn }) {
  const stateMeta = FEDERATION_STATE_META[stateKey] || FEDERATION_STATE_META.silent;
  const childLabel = child ? child.shortLabel : 'a span';
  const parentLabel = parent ? parent.shortLabel : 'the top of the tree';
  const question = [
    `The declared edge from the ${childLabel} span (#${child ? child.id : 'unknown'}) to the ${parentLabel} span (#${parent ? parent.id : 'workspace-root'}) carries no dated artefact inside the window.`,
    `Measured state: ${stateMeta.label.toLowerCase()} — ${stateMeta.meaning}`,
    `Channels checked: ${channelText}.`,
    `What should change: open a direct dated channel to the span below, correct the declared line if it is wrong, or record why this level only needs periodic carriage.`,
    'No message has been sent, no reporting line has been changed, and nobody is being rated: this is a finding about the EDGE.',
  ].join(' ');
  return {
    id: ctx.idFactory('dec'),
    title: `Carriage above the ${childLabel.toLowerCase()} span is ${stateMeta.label.toLowerCase()}`.slice(0, 180),
    question: question.slice(0, 900),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: 'Programme federation reading',
    approver: parent ? `${parentLabel} span owner` : 'Workspace strategy owner',
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Open one direct, dated channel to the span below', pros: 'Restores the declared line as an information path inside its own horizon.', cons: 'Costs a standing forum slot the span may not have free.' },
      { id: ctx.idFactory('opt'), label: 'Correct the declared reporting line', pros: 'Removes a declaration the workspace does not use.', cons: 'A reorganisation changes accountability, not just a drawing.' },
      { id: ctx.idFactory('opt'), label: 'Record why periodic carriage is sufficient', pros: 'Names the honest reason a slower level needs less traffic.', cons: 'A written exemption is not a channel; the edge stays silent.' },
    ],
    chosen: '',
    rationale: `RULE-FED-02: ${evidence} measured carriage event(s) in the window; the edge is ${stateKey}. Opened by the federation engine, resolved only by a human.`,
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/**
 * The seat a rule invocation is allowed to act for.
 *
 * A freeze is scoped to the seat that froze it: a manager's reading must not
 * open governed decisions about a peer manager's edges. The workspace-wide
 * operator view (and an explicit workspace scan) has no seat and covers every
 * edge it measured. Returning `null` means "the whole measured tree".
 */
function actingScope(draft, ctx) {
  if (ctx.event.type === FEDERATION_EVENTS.ASSESSED) {
    const assessment = (Array.isArray(draft.federationAssessments) ? draft.federationAssessments : [])
      .find((row) => row?.id === ctx.event.entityId);
    if (!assessment) return null;
    const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
    return built.byId.has(assessment.scopeSeatId) ? assessment.scopeSeatId : null;
  }
  if (ctx.event.entity === 'workspace') return null;
  const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
  return built.byId.has(ctx.event.entityId) ? ctx.event.entityId : null;
}

function silentRule(draft, ctx, out, conventions) {
  const measurement = measureFederation(draft, { now: ctx.now, settings: draft.settings || {} });
  const built = measurement.built;
  const scopeSeatId = actingScope(draft, ctx);
  const scope = scopeSeatId ? built.byId.get(scopeSeatId)?.scope : null;
  const weekKey = federationWeekKey(ctx.now);
  const channelText = measurement.rows.length
    ? 'packet, renewal, commitment, concordance, cadence'
    : 'no measured channel has produced an artefact in this workspace';
  const actionable = measurement.rows
    .filter((row) => ['silent', 'bypass', 'stale'].includes(row.state))
    // A declared seat only opens findings for edges it holds: its own edge, and
    // the edges of the spans inside it. A peer span is never in scope.
    .filter((row) => !scope || scope.has(row.seatId));
  const capped = actionable.slice(0, FEDERATION_LIMITS.decisionsPerScan);
  const existing = markersOf(draft);
  const reviewOn = addDays(dayKey(ctx.now), Math.max(7, Math.min(30, conventions.federationWindowDays)));
  let opened = 0;
  for (const row of capped) {
    const id = edgeDecisionId(ctx, row.seatId, row.parentId || 'root', weekKey);
    if (existing.some((marker) => marker?.id === id)) continue;
    const child = built.byId.get(row.seatId) || null;
    const parent = row.parentId ? built.byId.get(row.parentId) || null : null;
    const decision = edgeDecision(ctx, {
      child,
      parent,
      stateKey: row.state,
      evidence: row.evidenceN,
      channelText,
      reviewOn,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.push(decision);
    addLink(draft, ctx, 'decision', decision.id, 'person', row.seatId, 'informs', FEDERATION_RULE_IDS.silent,
      `A measured carriage finding informs the span whose edge above it is ${row.state}.`);
    if (row.parentId && built.byId.has(row.parentId)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', row.parentId, 'rolls-up-to', FEDERATION_RULE_IDS.silent,
        'The carriage decision is owned at the span above the edge and rolls up from there.');
    }
    addMarker(draft, ctx, {
      id,
      kind: 'silent-edge',
      childSeatId: row.seatId,
      parentSeatId: row.parentId,
      decisionId: decision.id,
      state: row.state,
      weekKey,
      note: `Edge ${row.seatId} → ${row.parentId || 'root'} measured ${row.state}.`,
    });
    opened += 1;
    note(ctx, out, FEDERATION_RULE_IDS.silent, 'created', 'decision', decision.id,
      `Opened one governed carriage decision for a ${row.state} declared edge (edge only, no person named).`);
  }
  if (actionable.length > capped.length) {
    note(ctx, out, FEDERATION_RULE_IDS.silent, 'bounded', 'decision', null,
      `${actionable.length} edges were actionable and only ${capped.length} decisions were opened in this commit; the rest are carried to the next scan.`);
  }
  return opened;
}

/* ----------------------------------------------- RULE-FED-03: recovery */

function recoveryRule(draft, ctx, out) {
  const measurement = measureFederation(draft, { now: ctx.now, settings: draft.settings || {} });
  const weekKey = federationWeekKey(ctx.now);
  const measured = new Set(measurement.rows.map((row) => `${row.seatId}>${row.parentId || 'root'}`));
  const silentMarkers = markersOf(draft).filter((marker) => marker?.kind === 'silent-edge');
  if (!silentMarkers.length) return 0;
  const latestAssessment = (Array.isArray(draft.federationAssessments) ? draft.federationAssessments : [])[0] || null;
  let recovered = 0;
  const seen = new Set();
  for (const marker of silentMarkers) {
    const edgeKey = `${marker.childSeatId}>${marker.parentSeatId || 'root'}`;
    if (seen.has(edgeKey)) continue;
    seen.add(edgeKey);
    if (!measured.has(edgeKey)) continue;
    const row = measurement.rows.find((entry) => `${entry.seatId}>${entry.parentId || 'root'}` === edgeKey);
    if (!row || row.state !== 'direct') continue;
    const id = markerId('reconnect', `${edgeKey}|${weekKey}`);
    if (markersOf(draft).some((entry) => entry?.id === id)) continue;
    addMarker(draft, ctx, {
      id,
      kind: 'reconnect',
      childSeatId: marker.childSeatId,
      parentSeatId: marker.parentSeatId,
      assessmentId: latestAssessment ? latestAssessment.id : null,
      state: 'direct',
      weekKey,
      reconnected: true,
      note: `Measured carriage resumed on the edge ${edgeKey} ${row.directN} time(s) in the window. The earlier decision stays open for a human.`,
    });
    if (latestAssessment) {
      addLink(draft, ctx, 'federationassessment', latestAssessment.id, 'person', marker.childSeatId, 'reconnects',
        FEDERATION_RULE_IDS.recover,
        'Measured carriage resumed on this span\u2019s declared edge above it; the finding is closed only by a human.');
    }
    recovered += 1;
    note(ctx, out, FEDERATION_RULE_IDS.recover, 'reconnected', 'person', marker.childSeatId,
      'Recorded a measured reconnection. No decision was auto-closed, no message was sent.');
  }
  return recovered;
}

export function federationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === FEDERATION_EVENTS.SCAN;
  const own = event.type.startsWith(FEDERATION_TRIGGER_PREFIX);
  if (!explicit && !own) return [];
  const conventions = federationConventions(ctx.settings || draft.settings || {});
  if (!explicit && conventions.federationAutoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const out = [];
  if (event.type === FEDERATION_EVENTS.ASSESSED) measureRule(draft, runCtx, out);
  // Only a freeze or an explicit scan may open work. A conventions change alters
  // the window and the floors for the NEXT reading; it must not, on its own,
  // create a governed finding for every edge in the tree.
  if (event.type === FEDERATION_EVENTS.SCAN || event.type === FEDERATION_EVENTS.ASSESSED) {
    silentRule(draft, runCtx, out, conventions);
    recoveryRule(draft, runCtx, out);
  }
  return out;
}

export const FEDERATION_SECONDARY_EVENTS = Object.freeze([FEDERATION_EVENTS.SCAN, FEDERATION_EVENTS.CONVENTIONS]);
