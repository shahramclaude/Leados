/**
 * app/core/domain/altitudeRouterRules.js — post-commit rules for the Altitude
 * Router (Schema v88, ADR-0081). Registered on the SAME generalized spine as
 * ADR-0008/0026/0075/0076/0079/0080, immediately BEFORE `seatRule`, so the
 * routing plan's typed edges must be explainable by the seat boundary above
 * them in the same pass. Altitude is a dimension of the propagation engine,
 * not a second system.
 *
 * RULE-AR-01 DISCLOSURE LADDER / VERTICAL ROLL-UP. One confirmed note writes
 *   a `routes-through` edge (case → routingplan), one `discloses-to` edge for
 *   the owning seat (what that altitude may read), and one `rolls-up-to` edge
 *   for EVERY leadership ancestor in the plan's seat path — frontline →
 *   manager → director → executive → enterprise root — in the SAME atomic
 *   transaction as the case and all its cross-module propagation. Summaries
 *   carry the disclosure FORM (names / unit / aggregate), never the note text,
 *   never a person name above the director rank.
 *
 * RULE-AR-02 FLOOR BREACH. A detected-altitude cell whose out-of-sample
 * agreement rate is below the reliability floor at n ≥ evidence floor opens
 * ONE governed DACI decision per cell per ISO week, with `grades-routing` and
 * `rolls-up-to` edges to every leadership ancestor. Marker-idempotent, never
 * auto-applied: no setting, plan or reporting line is changed on anyone's
 * behalf.
 *
 * RULE-AR-03 ADVISORY MATURITY. One audit marker when a cell first reaches the
 * evidence floor.
 *
 * All rules are pausable by `routingAutoPropagate`; an explicit `routing.scan`
 * always runs. Derived events (`automation.`, `seat.`, `propagation.`, …) never
 * trigger an automatic pass, so a rule-generated record cannot cause a second
 * workspace scan.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import { routingCalibration, routingConventions } from './altitudeRouter.js';
import { ROUTER_EVENTS, ROUTER_LIMITS, ROUTER_RULES } from './altitudeRouterRegistry.js';

const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'propagation.', 'vault.', 'workspace.',
  'settings.', 'demo.', 'import.', 'export.', 'lock.', 'crypto.',
]);

function isOperationalCommit(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '');
  if (!type) return false;
  return !DERIVED_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function markerStore(draft) {
  if (!Array.isArray(draft.altitudeRoutingMarkers)) draft.altitudeRoutingMarkers = [];
  return draft.altitudeRoutingMarkers;
}
function seen(draft, tag) { return markerStore(draft).includes(tag); }
function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > ROUTER_LIMITS.markers) markers.splice(0, markers.length - ROUTER_LIMITS.markers);
  return true;
}

function ownerName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const person = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (person && person.name) || (draft.settings && draft.settings.leaderName) || 'The workspace owner';
}

/** Leadership ancestors of a seat that are REAL roster nodes (never synthetic). */
function ancestorsOf(built, seatId) {
  const out = [];
  let cursor = seatId;
  let guard = 0;
  while (cursor && guard < 16) {
    if (built.byId.has(cursor) && cursor !== LEADER_ID) out.push(cursor);
    const parent = built.chain.nodes.get(cursor)?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
    guard += 1;
  }
  return out;
}

function disclosureSummary(row, plan) {
  const alt = altitudeByKey(row.altitudeKey);
  if (row.disclosure === 'names') return `Route disclosed at ${alt?.shortLabel || row.label} altitude: names and item detail. The leader of the week owns the conversation.`;
  if (row.disclosure === 'unit') return `Route disclosed at ${alt?.shortLabel || row.label} altitude: unit leaders and exact counts; individual detail withheld.`;
  return `Route disclosed at ${alt?.shortLabel || row.label} altitude: span aggregate only; no note text, name or item title climbs above the director rank. Detected ${plan.detectedAltitudeKey || 'refused'}.`;
}

/**
 * RULE-AR-01. Reconcile every confirmed plan's ladder edges. Idempotent by
 * exact-edge uniqueness (`ensureEntityLink`); an explicit scan repairs plans
 * whose edges were removed by a hierarchy change without duplicating the rest.
 */
function rollupRule(draft, ctx, built, opts = {}) {
  const effects = [];
  const plans = Array.isArray(draft.altitudeRoutingPlans) ? draft.altitudeRoutingPlans : [];
  const confirmed = plans.filter((p) => p && p.status === 'confirmed' && p.confirmedCaseId);
  const only = opts.onlyId ? confirmed.filter((p) => p.id === opts.onlyId) : confirmed;
  for (const plan of only) {
    if (!(draft.cases || []).some((c) => c.id === plan.confirmedCaseId)) continue;
    if (link(draft, ctx, 'case', plan.confirmedCaseId, 'routingplan', plan.id, 'routes-through',
      ROUTER_RULES.ROLLUP, 'The operational case was created from this reviewed altitude-routing plan.')) {
      effects.push(effect(ROUTER_RULES.ROLLUP, 'linked', 'routingplan', plan.id,
        'Linked the adopted case to the routing plan that classified it.'));
    }
    const path = Array.isArray(plan.seatPath) ? plan.seatPath : [];
    for (let i = 0; i < path.length; i += 1) {
      const row = path[i];
      if (!row || !row.seatId || row.seatId === LEADER_ID) continue; // synthetic root is printed, never a dangling edge
      const relation = i === 0 ? 'discloses-to' : 'rolls-up-to';
      if (link(draft, ctx, 'routingplan', plan.id, 'person', row.seatId, relation,
        ROUTER_RULES.ROLLUP, disclosureSummary(row, plan))) {
        effects.push(effect(ROUTER_RULES.ROLLUP, 'linked', 'person', row.seatId,
          `${i === 0 ? 'Disclosed the route to' : 'Rolled one routing decision up to'} ${row.label || 'a leadership span'} (rank ${row.rank}, ${row.disclosure}).`));
      }
    }
  }
  return effects;
}

function newReroutingDecision(ctx, draft, cell, conv, now) {
  const alt = altitudeByKey(cell.key);
  return {
    id: ctx.idFactory('dec'),
    title: `Should “${alt?.label || cell.label}” notes still be auto-routed there?`,
    question: `The router sent ${cell.n} graded plans to ${alt?.label || cell.label}; ${cell.correctN} were judged correct afterwards (${cell.ratePct}%, Wilson 95% ${cell.wilsonLo}–${cell.wilsonHi}%), below the ${conv.reliabilityFloorPct}% reliability floor. This question belongs to the span that owns this altitude's horizon. No person is the subject of this decision; the subject is a routing rule.`,
    date: dayKey(now),
    reversibility: 'reversible',
    driver: ownerName(draft),
    approver: ownerName(draft),
    contributors: '',
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: 'Tighten the cue lexicon: add or reweight the time-span terms that mis-fired, with the graded examples beside them',
        pros: 'Repairs the classifier where the record says it is wrong, at its own horizon.',
        cons: 'A lexicon is a declared convention; a new term must be argued, not fitted to five rows.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Raise the altitude floor: require human confirmation for every note in this cell',
        pros: 'Stops a low-agreement inference from becoming a case without a person choosing.',
        cons: 'More work lands on the leader at that altitude; the queue is the price of the guard.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Accept the current agreement rate in writing and keep the human override',
        pros: 'Honest when the graded sample is thin or the consequences are mild.',
        cons: 'The rate stays below the floor until more graded plans change it.',
      },
    ],
    chosen: '',
    rationale: `Opened by ${ROUTER_RULES.FLOOR}: ${alt?.label || cell.label} routing holds ${cell.ratePct}% of ${cell.n} graded plans (floor ${conv.reliabilityFloorPct}%). The rule changes no setting, no plan and no reporting line; it opens the question for the span that owns this altitude.`,
    reviewOn: dayKey(addDays(now, conv.reviewDays)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: now.toISOString(),
  };
}

/** RULE-AR-02/03: governed review + advisory marker, both bounded and inert. */
function calibrationRule(draft, ctx, built, conv) {
  const effects = [];
  const report = routingCalibration(draft, { now: ctx.now, settings: draft.settings || {} });
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  for (const cell of report.cells) {
    if (cell.refused) continue;
    const maturityTag = `${ROUTER_RULES.MATURITY}:reached:${cell.key}`;
    if (!seen(draft, maturityTag)) {
      addMarker(draft, maturityTag);
      effects.push(effect(ROUTER_RULES.MATURITY, 'audited', 'cell', cell.key,
        `“${cell.label}” reached the evidence floor (${cell.n}/${cell.floorN}); agreement is now ${cell.ratePct}%. Advisory only.`));
    }
    if (!cell.belowFloor) continue;
    const tag = `${ROUTER_RULES.FLOOR}:week:${week}:${cell.key}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const decision = newReroutingDecision(ctx, draft, cell, conv, ctx.now);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(ROUTER_RULES.FLOOR, 'created', 'decision', decision.id,
      `Opened one governed re-routing decision for ${cell.label} (${cell.ratePct}% held, floor ${conv.reliabilityFloorPct}%).`));
    // Cross-altitude roll-up on the SAME spine: the governed question reaches
    // every leadership ancestor of a mis-routed plan in the breaching cell.
    const members = (draft.altitudeRoutingPlans || []).filter((p) => p && p.status === 'confirmed'
      && p.gradedOn && (p.detectedAltitudeKey || 'refused') === cell.key && p.ownerSeatId);
    for (const plan of members.slice(0, 8)) {
      if (link(draft, ctx, 'routingplan', plan.id, 'decision', decision.id, 'grades-routing',
        ROUTER_RULES.FLOOR, 'This graded plan is evidence in the governed re-routing question.')) {
        effects.push(effect(ROUTER_RULES.FLOOR, 'linked', 'decision', decision.id,
          'Attached one graded plan as evidence to the governed review.'));
      }
      for (const targetId of ancestorsOf(built, plan.ownerSeatId)) {
        if (link(draft, ctx, 'decision', decision.id, 'person', targetId, 'rolls-up-to',
          ROUTER_RULES.FLOOR, 'A below-floor routing cell rolls up to this leadership span.')) {
          effects.push(effect(ROUTER_RULES.FLOOR, 'linked', 'person', targetId,
            `Rolled the re-routing question up to ${built.byId.get(targetId)?.label || 'a span'}.`));
        }
      }
    }
  }
  return effects;
}

export function altitudeRouterRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conv = routingConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now, draft };
  const type = String(ctx.event.type || '');
  const explicit = [ROUTER_EVENTS.SCAN, ROUTER_EVENTS.TRIGGER, ROUTER_EVENTS.PROPAGATE, ROUTER_EVENTS.GRADED].includes(type);
  const adoption = type === 'case.created' && Boolean(ctx.event.routingPlanId);
  const automatic = !explicit && !adoption && conv.autoPropagate && isOperationalCommit(ctx.event);
  if (!explicit && !adoption && !automatic) return [];

  const built = buildSeats(draft, { now, settings: draft.settings });
  const effects = [];
  // RULE-AR-01: on adoption, reconcile exactly the new plan; on a scan, all.
  effects.push(...rollupRule(draft, scoped, built, adoption ? { onlyId: String(ctx.event.routingPlanId) } : {}));
  // RULE-AR-02/03: calibration reads are cheap (bounded ledger), but never run
  // on a derived event and never auto-run when propagation is paused.
  if (explicit || automatic) effects.push(...calibrationRule(draft, scoped, built, conv));
  if (Array.isArray(ctx.out)) ctx.out.push(...effects);
  return effects;
}
