/**
 * app/core/domain/operatingModelRules.js — post-commit rules for the Operating
 * Model (Schema v91, ADR-0085).
 *
 * RULE-OMD-01 CONGESTION. When a position is committed beyond its own declared
 * week, open ONE governed DACI decision — per span, per ISO week — addressed to
 * the span that can actually author the change (the nearest ancestor at or above
 * the altitude the commitment demands). The subject is the DESIGN: the title
 * names the altitude and the diagnosis, and the options are the three levers the
 * lever engine actually priced, in the order it priced them. Nothing is
 * reassigned, nothing is cut, and no person is named as the cause.
 *
 * RULE-OMD-02 STRUCTURE. The same transaction writes the vertical fan-out: typed
 * `rolls-up-to` edges from the congested span to every leadership ancestor, so a
 * frontline span's displacement is visible at the director and VP altitude
 * without anybody re-typing it. It also writes one `relieves` edge from the
 * decision to the span it is about, so "which decisions were opened because of
 * this design" is answerable from the graph rather than from memory.
 *
 * RULE-OMD-03 CONTINUITY. A span below the declared continuity floor is the trap
 * nobody models: it looks light and every hire-based answer makes it worse. One
 * advisory audit marker is written per distinct set of fragile spans, and ONE
 * governed decision per workspace per ISO week asks whether to add continuity
 * cover or relieve the hours — because a fragile span is a decision, not a note.
 *
 * All three are marker-idempotent, pausable via `omAutoPropagate`, and an
 * explicit `operatingModel.scan` always runs.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildChain, LEADER_ID, escalationTarget } from './chain.js';
import { altitudeByKey, altitudeRank } from './chainRegistry.js';
import {
  operatingModelNorms,
  operatingModelRead,
} from './operatingModel.js';
import {
  OPERATING_MODEL_EVENTS,
  OPERATING_MODEL_LIMITS,
  OPERATING_MODEL_RULES,
  omFingerprint,
} from './operatingModelRegistry.js';

const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'propagation.', 'vault.', 'workspace.',
  'settings.', 'demo.', 'import.', 'export.', 'lock.', 'crypto.',
]);

function isOperationalCommit(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '');
  if (!type) return false;
  // The model's own events are operational: declaring a split or a norm IS the
  // trigger, because it is what turns an unmeasured design into a measured one.
  if (type.startsWith('operatingModel.')) {
    return type === OPERATING_MODEL_EVENTS.NORMS_SET
      || type === OPERATING_MODEL_EVENTS.PORTFOLIO_SET
      || type === OPERATING_MODEL_EVENTS.DECISION_SET;
  }
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

function markers(draft) {
  if (!Array.isArray(draft.omMarkers)) draft.omMarkers = [];
  return draft.omMarkers;
}

function seen(draft, tag) {
  return markers(draft).includes(tag);
}

function addMarker(draft, tag) {
  const list = markers(draft);
  if (list.includes(tag)) return false;
  list.push(tag);
  const cap = OPERATING_MODEL_LIMITS.markers;
  if (list.length > cap) list.splice(0, list.length - cap);
  return true;
}

function ancestorsOf(chain, nodeId) {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < 16) {
    const node = chain.nodes.get(cursor);
    if (!node) break;
    const parent = node.parentId || null;
    if (!parent || parent === cursor) break;
    if (parent !== LEADER_ID && chain.nodes.has(parent)) out.push(parent);
    cursor = parent;
    guard += 1;
  }
  return out;
}

function pctLabel(v) {
  return Number.isFinite(v) ? `${Math.round(v * 1000) / 10}%` : 'an unmeasurable share';
}

/** One governed design decision about one span. The DESIGN is the subject. */
function congestionDecision(ctx, draft, row, norms, chain) {
  const node = chain.nodes.get(row.nodeId);
  const alt = altitudeByKey(node?.altitude);
  const requiredRank = Math.max(row.rank + (row.utilisation !== null && row.utilisation > 1.2 ? 1 : 0), row.rank);
  const target = escalationTarget(chain, row.nodeId, requiredRank);
  const targetNode = chain.nodes.get(target.nodeId);
  const targetAlt = altitudeByKey(targetNode?.altitude);
  const top = row.options.slice(0, 3);
  return {
    id: ctx.idFactory('dec'),
    title: `Redesign the ${alt?.label || 'lead'} span at ${pctLabel(row.utilisation)} of its own week`.slice(0, 180),
    question: [
      `This position is committed to ${row.committed} h/week against a declared ${row.capacity} h design — ${row.overHours} h over, diagnosis: ${row.diagnosis}.`,
      row.continuity
        ? `The span also sits below the ${norms.omContinuityFloor}-report continuity floor, so relieving it with a hire would create a single point of failure.`
        : `The span is above the continuity floor, so a capacity answer is at least available.`,
      top.length
        ? `Priced options, in order of relief per unit of design cost: ${top.map((o) => `${o.leverLabel} (${o.hours} h/week)`).join('; ')}.`
        : 'No lever clears its evidence floor yet, so no option is priced.',
      'Which design change is made, who authors it, and what evidence would show it worked? No person is the subject of this decision.',
    ].join(' ').slice(0, 1400),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: targetNode?.name || 'the workspace leader',
    approver: targetNode?.name || 'the workspace leader',
    contributors: node?.name || '',
    informed: '',
    options: (top.length ? top : [{ leverKey: 'raise-wip', leverLabel: 'Measure the position first', hours: 0, reason: 'No priced lever is available until a work-type split is declared.' }])
      .map((option) => ({
        id: ctx.idFactory('opt'),
        label: option.hours > 0
          ? `${option.leverLabel} — ${option.hours} h/week`
          : option.leverLabel,
        pros: option.reason || '',
        cons: option.leverKey === 'add-lead'
          ? 'Creates a new supervision relationship; only safe above the continuity floor.'
          : 'A design change with a real cost of its own, priced in the Levers panel.',
      })),
    chosen: '',
    rationale: `Opened by ${OPERATING_MODEL_RULES.CONGESTION}: this span is over the declared ${norms.omUtilizationCeilPct}% utilisation ceiling at the ${targetAlt?.label || 'next'} altitude’s authority. The rule rates no person, cuts no commitment and moves no work; it opens the design question for the span that can author it.`,
    reviewOn: dayKey(addDays(ctx.now, norms.omReviewDays)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/** RULE-OMD-01: one governed design decision per over-ceiling span per ISO week. */
function congestionRule(draft, ctx, norms, chain, report) {
  const effects = [];
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  for (const row of report.congestion) {
    const tag = `${OPERATING_MODEL_RULES.CONGESTION}:week:${week}:span:${row.nodeId}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const decision = congestionDecision(ctx, draft, row, norms, chain);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(OPERATING_MODEL_RULES.CONGESTION, 'created', 'decision', decision.id,
      `Opened one governed design decision for a span at ${pctLabel(row.utilisation)} of its own declared week (${row.diagnosis}).`));
    if (link(draft, ctx, 'decision', decision.id, 'person', row.nodeId, 'relieves',
      OPERATING_MODEL_RULES.CONGESTION,
      'The position design this decision was opened to relieve. The subject is the design, never the person holding it.')) {
      effects.push(effect(OPERATING_MODEL_RULES.CONGESTION, 'linked', 'person', row.nodeId,
        'Linked the design decision to the span it relieves.'));
    }
  }
  return effects;
}

/** RULE-OMD-02: vertical fan-out in the same transaction. */
function structureRule(draft, ctx, report, chain) {
  const effects = [];
  for (const row of report.congestion) {
    const tag = `${OPERATING_MODEL_RULES.STRUCTURE}:span:${row.nodeId}:${weekKey(ctx.now) || dayKey(ctx.now)}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const ancestors = ancestorsOf(chain, row.nodeId);
    for (const ancestorId of ancestors) {
      if (link(draft, ctx, 'person', row.nodeId, 'person', ancestorId, 'rolls-up-to',
        OPERATING_MODEL_RULES.STRUCTURE,
        'A position’s displaced hours roll up to this leadership span as a design fact, never as a comment on the person in the position.')) {
        effects.push(effect(OPERATING_MODEL_RULES.STRUCTURE, 'linked', 'person', ancestorId,
          `Rolled a congested span’s displacement up to ${chain.nodes.get(ancestorId)?.name || 'a span'}.`));
      }
    }
    if (!ancestors.length) {
      effects.push(effect(OPERATING_MODEL_RULES.STRUCTURE, 'noted', 'person', row.nodeId,
        'This span sits at the top of the tree: its displacement is an enterprise reading and climbs no further.'));
    }
  }
  return effects;
}

/** One governed continuity decision for the fragile set, at most once per ISO week. */
function continuityDecision(ctx, draft, fragile, norms) {
  return {
    id: ctx.idFactory('dec'),
    title: `${fragile.length} span(s) below the ${norms.omContinuityFloor}-report continuity floor`.slice(0, 180),
    question: [
      `${fragile.length} staffed span(s) hold fewer than ${norms.omContinuityFloor} direct report(s): ${fragile.map((s) => `${s.altitudeLabel} with ${s.directReports}`).join('; ')}.`,
      'Each looks light and cannot be relieved by a hire — below the declared continuity floor, one absence stops the work, so the "obvious" fix creates the risk it was meant to remove.',
      'Which spans get continuity cover (an understudy, a second holder of the decision, or a documented fallback), and which get their hours or their boundary changed? No person is named as the cause.',
    ].join(' ').slice(0, 1400),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: 'the workspace leader',
    approver: 'the workspace leader',
    contributors: fragile.map((s) => s.name).slice(0, 6).join(', '),
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: 'Relieve the hours instead of the span',
        pros: 'Removes the commitment that made the span thin without adding a supervision relationship nobody can cover.',
        cons: 'Requires a real cut or a routing change above this span.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Add a second holder of the decision (documented understudy)',
        pros: 'Directly raises continuity without changing the shape of the tree; the Leadership bench terminal can certify it.',
        cons: 'Costs development time and does not reduce the hours this week.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Document the single point of failure and accept it',
        pros: 'Honest when the span genuinely cannot be changed this quarter.',
        cons: 'Must be written down and re-read at the review date — an undocumented tolerance is how the absence becomes a surprise.',
      },
    ],
    chosen: '',
    rationale: `Opened by ${OPERATING_MODEL_RULES.FLOOR}: ${fragile.length} span(s) sit below the declared ${norms.omContinuityFloor}-report continuity floor. The rule certifies the structural condition and opens the choice; it does not move a person or alter a reporting line.`,
    reviewOn: dayKey(addDays(ctx.now, norms.omReviewDays)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/** RULE-OMD-03: a fragility marker, plus at most one governed choice per ISO week. */
function continuityRule(draft, ctx, norms, report) {
  const effects = [];
  const fragile = report.continuity.fragile;
  if (!fragile.length) return effects;
  // The marker carries a fingerprint of the fragile set, not the set itself: a
  // marker ledger that named spans would be a second, unredacted copy of the
  // reading it exists to make idempotent.
  const signature = omFingerprint(fragile.map((s) => `${s.nodeId}|${s.directReports}`).sort().join(','));
  const markerTag = `${OPERATING_MODEL_RULES.FLOOR}:certified:${signature}`;
  if (addMarker(draft, markerTag)) {
    effects.push(effect(OPERATING_MODEL_RULES.FLOOR, 'audited', 'workspace', '',
      `${fragile.length} span(s) certified below the ${norms.omContinuityFloor}-report continuity floor. Counts only; no person is named in the marker.`));
  }
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const decisionTag = `${OPERATING_MODEL_RULES.FLOOR}:week:${week}`;
  if (seen(draft, decisionTag)) return effects;
  addMarker(draft, decisionTag);
  const decision = continuityDecision(ctx, draft, fragile, norms);
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.unshift(decision);
  effects.push(effect(OPERATING_MODEL_RULES.FLOOR, 'created', 'decision', decision.id,
    `Opened one governed continuity decision covering ${fragile.length} fragile span(s).`));
  return effects;
}

export function operatingModelRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const norms = operatingModelNorms(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const type = String(ctx.event.type || '');
  const explicit = type === OPERATING_MODEL_EVENTS.SCAN || type === OPERATING_MODEL_EVENTS.TRIGGER;
  const automatic = !explicit && norms.omAutoPropagate && isOperationalCommit(ctx.event);
  if (!explicit && !automatic) return [];

  const chain = buildChain(draft, { now, settings: draft.settings });
  const report = operatingModelRead(draft, { now, settings: draft.settings });
  // THE OPT-IN GATE. Until at least one work-type split is declared, this
  // module has exactly one thing to say — "declare a design" — and it says that
  // on the screen, not by opening governed decisions in a workspace that never
  // asked for an operating model. That makes the rule genuinely inert for the
  // ~40 other terminals' workspaces and for every first-run, which is what the
  // no-regression guarantee on a shared spine requires. Note that the
  // CONTINUITY rule is gated too, even though span shape alone could fire it:
  // a decision about a design that has not been declared is noise, not evidence.
  if (report.measuredPositions === 0) return [];
  const scoped = { ...ctx, now };
  const effects = [
    ...congestionRule(draft, scoped, norms, chain, report),
    ...structureRule(draft, scoped, report, chain),
    ...continuityRule(draft, scoped, norms, report),
  ];
  if (Array.isArray(ctx.out)) ctx.out.push(...effects);
  return effects;
}
