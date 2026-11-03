/**
 * app/core/domain/authorityCalibrationRules.js — post-commit rules for the
 * Authority Calibration Ledger (Schema v85, ADR-0079).
 *
 * RULE-ACL-01 FLOOR BREACH. When a cell (action class × receiver altitude)
 * holds below the reliability floor and has reached the evidence floor, open
 * ONE governed DACI decision per cell per ISO week — marker-idempotent,
 * never auto-applied — asking the leadership span what to do about rights it
 * is not reliably holding. The rule writes `rolls-up-to` edges from each
 * breaching mandate to EVERY leadership ancestor of the receiver seat, so a
 * frontline return reaches the manager, director, VP and chief spans in the
 * SAME transaction in which the mandate closed — cross-altitude roll-up
 * integrated with the post-commit spine, no re-entry, no second system.
 * RULE-ACL-02 ADVISORY MATURITY. When a cell reaches the evidence floor for
 * the first time, write ONE audit marker per cell. Calibration is advisory:
 * no setting is touched, no contract is changed, nothing is decided on
 * anyone's behalf.
 *
 * Both rules live on the same generalized spine as ADR-0008/0026/0075/0076:
 * marker-idempotent, pausable by `authorityCalibrationAutoPropagate`, an
 * explicit `calibration.scan` always runs.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { authorityCalibrationConventions, calibrateAuthority } from './authorityCalibration.js';
import { altitudeByKey } from './chainRegistry.js';
import { buildSeats } from './seat.js';
import { ACL_RULE_IDS, ACL_EVENTS } from './authorityCalibrationRegistry.js';

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
  if (!Array.isArray(draft.authorityCalibrationMarkers)) draft.authorityCalibrationMarkers = [];
  return draft.authorityCalibrationMarkers;
}

function seen(draft, tag) {
  return markerStore(draft).includes(tag);
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > 400) markers.splice(0, markers.length - 400);
  return true;
}

function ancestorsOf(built, nodeId) {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < 16) {
    if (built.byId.has(cursor) && cursor !== 'leader') out.push(cursor);
    const parent = built.chain.nodes.get(cursor)?.parentId || null;
    if (!parent || parent === cursor) break;
    cursor = parent;
    guard += 1;
  }
  return out;
}

function ownerName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const person = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (person && person.name) || (draft.settings && draft.settings.leaderName) || 'The workspace owner';
}

function newDecision(ctx, draft, cell, now) {
  const alt = altitudeByKey(cell.altitudeKey);
  return {
    id: ctx.idFactory('dec'),
    title: `What do we do about “${cell.actionLabel}” at ${alt?.label || cell.altitudeLabel}?`,
    question: `Authority in this cell is holding ${cell.holdRatePct}% of ${cell.n} terminal contract(s), below the ${cell.reliabilityFloorPct}% reliability floor — ${cell.completedN} held, ${cell.returnedN + cell.expiredN + cell.revokedN} not held. This question goes to the nearest ancestor span that can answer it at its own horizon. No person is the subject of this decision; the subject is which rights a span reliably holds.`,
    date: dayKey(now),
    reversibility: 'reversible',
    driver: ownerName(draft),
    approver: ownerName(draft),
    contributors: '',
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: 'Clarify the contract: tighten scope, evidence and the “done” bar so “held” means verified',
        pros: 'Most returns come from unclear acceptance criteria, not unwilling receivers.',
        cons: 'Takes time up front; slower offers get accepted less often.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Offer at the level below: hand this kind of right to the nearest span that can hold it',
        pros: 'Moves the authority to where it reliably lands; grows the level below.',
        cons: 'A different altitude’s horizon changes what “done” means.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Stop offering it: withdraw this action class at this altitude until the cause is fixed',
        pros: 'Honest when the span genuinely cannot absorb the work yet.',
        cons: 'Something visible stops happening; the reason must be recorded.',
      },
    ],
    chosen: '',
    rationale: `Opened by RULE-ACL-01: “${cell.actionLabel}” at ${alt?.label || cell.altitudeLabel} holds ${cell.holdRatePct}% of ${cell.n} terminal contract(s), below the ${cell.reliabilityFloorPct}% floor. The rule rates no person and changes no contract; it opens the question for the span that owns this altitude.`,
    reviewOn: dayKey(addDays(now, 14)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: now.toISOString(),
  };
}

/** RULE-ACL-01: floor breach → one governed decision per cell per ISO week. */
function floorBreachRule(draft, ctx, built, conv) {
  const effects = [];
  const report = calibrateAuthority(draft, { now: ctx.now, settings: draft.settings || {}, seatId: null });
  const breaching = report.cells.filter((cell) => !cell.refused && cell.belowFloor);
  if (!breaching.length) return effects;

  const week = weekKey(ctx.now) || dayKey(ctx.now);

  for (const cell of breaching) {
    const tag = `${ACL_RULE_IDS.FLOOR_BREACH}:week:${week}:${cell.actionClass}|${cell.altitudeKey}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);

    const decision = newDecision(ctx, draft, cell, ctx.now);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(ACL_RULE_IDS.FLOOR_BREACH, 'created', 'decision', decision.id,
      `Opened one authority-calibration decision for ${cell.actionLabel} at ${cell.altitudeLabel} (${cell.holdRatePct}% held, floor ${cell.reliabilityFloorPct}%).`));

    // Cross-altitude roll-up: every terminal mandate in the breaching cell
    // rolls up to each leadership ancestor of the receiver seat, in the same
    // transaction, through the generalized graph — not a second system.
    for (const member of cell.members) {
      const targetSeat = built.byId.get(member.toSeatId || '');
      if (!targetSeat) continue;
      const targets = ancestorsOf(built, targetSeat.id);
      for (const targetId of targets) {
        if (link(draft, ctx, 'mandate', member.mandateId, 'person', targetId, 'rolls-up-to',
          ACL_RULE_IDS.FLOOR_BREACH,
          `A ${cell.actionLabel} mandate at ${cell.altitudeLabel} that did not hold rolls up to this leadership span.`)) {
          effects.push(effect(ACL_RULE_IDS.FLOOR_BREACH, 'linked', 'person', targetId,
            `Rolled mandate ${member.mandateId.slice(-6)} up to ${built.byId.get(targetId)?.label || 'a span'}.`));
        }
      }
    }
  }
  return effects;
}

/** RULE-ACL-02: advisory — a cell reaches the evidence floor, audit once. */
function maturityRule(draft, ctx, built, conv) {
  const effects = [];
  const report = calibrateAuthority(draft, { now: ctx.now, settings: draft.settings || {}, seatId: null });
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  for (const cell of report.cells) {
    if (cell.refused || cell.n < cell.floorN) continue;
    const tag = `${ACL_RULE_IDS.ADVISORY}:reached:${cell.actionClass}|${cell.altitudeKey}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    effects.push(effect(ACL_RULE_IDS.ADVISORY, 'audited', 'cell', `${cell.actionClass}|${cell.altitudeKey}`,
      `Cell reached the evidence floor (${cell.n}/${cell.floorN}); hold rate is now ${cell.holdRatePct === null ? 'refused' : cell.holdRatePct}%. Advisory only — nothing changes until a span decides.`));
  }
  return effects;
}

export function authorityCalibrationRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conv = authorityCalibrationConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now, draft };
  const type = ctx.event.type;
  const explicit = type === ACL_EVENTS.SCAN || type === ACL_EVENTS.TRIGGER || type === ACL_EVENTS.PROPAGATE;
  const automatic = !explicit && conv.autoPropagate && isOperationalCommit(ctx.event);
  if (!explicit && !automatic) return [];

  const built = buildSeats(draft, { now, settings: draft.settings });
  const effects = [];
  if (explicit || automatic) {
    effects.push(...floorBreachRule(draft, scoped, built, conv));
    effects.push(...maturityRule(draft, scoped, built, conv));
  }
  if (Array.isArray(ctx.out)) ctx.out.push(...effects);
  return effects;
}
