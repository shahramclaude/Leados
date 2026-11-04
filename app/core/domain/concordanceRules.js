/**
 * app/core/domain/concordanceRules.js — post-commit rules for the Concordance
 * Terminal (Schema v89, ADR-0082).
 *
 * RULE-ECN-01 ROLL-UP. Every closed round writes one `rolls-up-to` edge to each
 * leadership ancestor above the pair's leader, in the SAME atomic transaction in
 * which the second side landed. A frontline pair's two-gauge finding reaches the
 * manager, director, VP and chief spans without anyone re-typing it — cross-
 * altitude roll-up integrated with the shared post-commit spine, not a second
 * system. A later round for a pair that already re-contracted also writes one
 * `re-tests` edge to the decision it is testing, so the closed loop has typed
 *                           provenance instead of a remembered intention.
 * RULE-ECN-02 RE-CONTRACT. When a closed round breaches — weighted κ below the
 * declared floor, or any dimension two whole steps apart — open ONE governed
 * DACI decision per pair per ISO week, addressed to the span that owns the pair.
 * The subject is the EXPECTATION, never the person. The same transaction places
 * a generated agenda line on the pair's most recent 1:1 so the conversation has
 * a place to happen; the rule writes no conclusion into it.
 * RULE-ECN-03 ADVISORY MATURITY. When the workspace first reaches the declared
 * evidence floor of closed rounds, write ONE audit marker. Nothing is decided,
 * graded or reassigned on anyone's behalf by any of the three.
 *
 * Marker-idempotent, pausable by `concordanceAutoPropagate`, and an explicit
 * `concordance.scan` always runs.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { buildChain, LEADER_ID } from './chain.js';
import { altitudeByKey } from './chainRegistry.js';
import {
  breaches,
  concordanceConventions,
  concordanceStats,
  roundsOf,
} from './concordance.js';
import {
  CONCORDANCE_EVENTS,
  CONCORDANCE_LIMITS,
  CONCORDANCE_RULES,
  concordancePairKey,
} from './concordanceRegistry.js';

const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'propagation.', 'vault.', 'workspace.',
  'settings.', 'demo.', 'import.', 'export.', 'lock.', 'crypto.',
]);

function isOperationalCommit(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '');
  if (!type) return false;
  // Concordance's own events ARE operational: closing a round is the trigger.
  if (type.startsWith('concordance.')) return type === CONCORDANCE_EVENTS.ROUND_CLOSED || type === CONCORDANCE_EVENTS.SIDE_SUBMITTED;
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
  if (!Array.isArray(draft.concordanceMarkers)) draft.concordanceMarkers = [];
  return draft.concordanceMarkers;
}

function seen(draft, tag) {
  return markerStore(draft).includes(tag);
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  const cap = CONCORDANCE_LIMITS.markers;
  if (markers.length > cap) markers.splice(0, markers.length - cap);
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

function ownerName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const person = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (person && person.name) || (draft.settings && draft.settings.leaderName) || 'The workspace owner';
}

function personName(draft, id) {
  const person = (draft.people || []).find((p) => p && p.id === id);
  return person ? person.name : 'the report';
}

function leaderNodeOf(chain, round) {
  return chain.nodes.has(round.leaderId) ? round.leaderId : LEADER_ID;
}

/** One governed re-contracting decision. The expectation is the subject. */
function recontractDecision(ctx, draft, round, stats, conv, chain) {
  const nodeId = leaderNodeOf(chain, round);
  const node = chain.nodes.get(nodeId);
  const alt = altitudeByKey(node?.altitude);
  const leader = personName(draft, round.leaderId);
  const member = personName(draft, round.memberId);
  const diverged = stats.divergedDimensions.slice(0, 3);
  const worst = diverged[0] || null;
  const title = worst
    ? `Re-contract “${worst.label.toLowerCase()}”: ${leader} and ${member} are ${worst.absDiff} steps apart`
    : `Re-contract the expectation between ${leader} and ${member}`;
  const gapText = stats.divergedDimensions.length
    ? stats.divergedDimensions.map((d) => `“${d.label}” ${d.leader} vs ${d.member}`).join('; ')
    : 'no dimension is two steps apart, but the chance-corrected agreement is below the floor';
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 180),
    question: `Two gauges read the same expectation differently (${gapText}). Weighted κ ${stats.kappaPct === null ? 'refused' : `${stats.kappaPct}%`} against a ${conv.agreementFloorPct}% floor; exact agreement ${stats.exactPct === null ? 'refused' : `${stats.exactPct}%`}, within one step ${stats.within1Pct === null ? 'refused' : `${stats.within1Pct}%`}. Which sentence becomes the standard, and what evidence settles it? No person is the subject of this decision.`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leader,
    approver: leader,
    contributors: member,
    informed: '',
    options: [
      {
        id: ctx.idFactory('opt'),
        label: `Write the bar as one example (${worst ? worst.label.toLowerCase() : 'the diverged dimension'}), dated, and score the next real piece of work against it before the review`,
        pros: 'Converts a disagreement about a word into a test both people can be wrong about; the cheapest correction available.',
        cons: 'Needs one concrete artefact in the next two weeks or it becomes another document.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Publish the standard for the whole span, not just this pair',
        pros: 'If two people misread it, a third probably does; fixes the instrument instead of one reading.',
        cons: 'Slower, and it exposes a standard the leader may not actually hold consistently.',
      },
      {
        id: ctx.idFactory('opt'),
        label: 'Leave the standard as it is and record that both readings are accepted',
        pros: 'Honest when the work genuinely admits both bars and the difference costs nothing.',
        cons: 'Must be written down and re-tested — an unwritten tolerance is how the surprise review happens next cycle.',
      },
    ],
    chosen: '',
    rationale: `Opened by ${CONCORDANCE_RULES.RECONTRACT}: a closed two-sided round breached the declared floor at ${alt?.label || 'this span'}’s altitude. The rule rates no person and edits no expectation; it opens the question for the span that owns the pair.`,
    reviewOn: dayKey(addDays(ctx.now, conv.reviewDays)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/** RULE-ECN-01: one typed roll-up edge per ancestor per closed round, plus the re-test edge. */
function rollupRule(draft, ctx, chain) {
  const effects = [];
  const closed = roundsOf(draft).filter((r) => r.status === 'closed');
  const links = Array.isArray(draft.links) ? draft.links : [];
  for (const round of closed) {
    const tag = `${CONCORDANCE_RULES.ROLLUP}:round:${round.id}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    const nodeId = leaderNodeOf(chain, round);
    const ancestors = ancestorsOf(chain, nodeId);
    for (const ancestorId of ancestors) {
      if (link(draft, ctx, 'concordance', round.id, 'person', ancestorId, 'rolls-up-to',
        CONCORDANCE_RULES.ROLLUP,
        'A closed two-sided expectation round rolls up to this leadership span as a rate, never as one person’s answers.')) {
        effects.push(effect(CONCORDANCE_RULES.ROLLUP, 'linked', 'person', ancestorId,
          `Rolled a closed concordance round up to ${chain.nodes.get(ancestorId)?.name || 'a span'}.`));
      }
    }
    if (!ancestors.length) {
      effects.push(effect(CONCORDANCE_RULES.ROLLUP, 'noted', 'concordance', round.id,
        'The pair’s leader sits at the top of this tree: the round is an enterprise-level reading and climbs no further.'));
    }
    // Closed loop: this round may be the re-test of an earlier re-contracting
    // decision for the SAME pair. The edge carries the provenance, so "we
    // re-contracted and it moved" is answerable from the graph, not memory.
    const earlierDecision = links.find((l) => {
      if (!l || l.relation !== 're-contracts' || l.sourceType !== 'concordance') return false;
      const source = roundsOf(draft).find((r) => r.id === l.sourceId);
      if (!source) return false;
      if (source.leaderId !== round.leaderId || source.memberId !== round.memberId) return false;
      return String(source.closedOn || '') < String(round.closedOn || '')
        && String(l.targetId || '') !== String(round.id || '');
    });
    if (earlierDecision && link(draft, ctx, 'concordance', round.id, 'decision', earlierDecision.targetId, 're-tests',
      CONCORDANCE_RULES.ROLLUP,
      'This round re-tests the standard set by that re-contracting decision.')) {
      effects.push(effect(CONCORDANCE_RULES.ROLLUP, 'linked', 'decision', earlierDecision.targetId,
        'Linked a re-test round to the decision it tests.'));
    }
  }
  return effects;
}

/** One generated agenda line on the pair's most recent 1:1 — a place to talk, not a verdict. */
function placeOnAgenda(draft, ctx, round, stats) {
  const meetings = (draft.oneOnOnes || []).filter((m) => m && m.personId === round.memberId);
  if (!meetings.length) return false;
  const latest = [...meetings].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  if (!latest) return false;
  const already = (latest.agenda || []).some((a) => a && a.source === `concordance:${round.id}`);
  if (already) return false;
  const worst = stats.divergedDimensions[0];
  latest.agenda = Array.isArray(latest.agenda) ? latest.agenda : [];
  latest.agenda.push({
    id: ctx.idFactory('ag'),
    text: worst
      ? `Check the standard on “${worst.label}”: I said ${worst.leader}, they said ${worst.member}. Ask for their example before giving mine.`.slice(0, 300)
      : `Check the standard: agreement came in at ${stats.kappaPct === null ? 'an unmeasurable level' : `${stats.kappaPct}%`} against a ${stats.floorPct}% floor. Ask what they would have guessed.`.slice(0, 300),
    done: false,
    source: `concordance:${round.id}`,
  });
  return true;
}

/** RULE-ECN-02: one governed re-contracting decision per pair per ISO week. */
function recontractRule(draft, ctx, chain, conv) {
  const effects = [];
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const closed = roundsOf(draft).filter((r) => r.status === 'closed');
  const links = Array.isArray(draft.links) ? draft.links : [];
  for (const round of closed) {
    const stats = concordanceStats(round, conv);
    if (!breaches(round, stats, conv)) continue;
    const pairKey = concordancePairKey(round.leaderId, round.memberId);
    const tag = `${CONCORDANCE_RULES.RECONTRACT}:week:${week}:${pairKey}`;
    if (seen(draft, tag)) continue;
    // One decision per pair per week — a second round on the same pair inside
    // the same week is evidence about a conversation already opened, not a new one.
    addMarker(draft, tag);
    const decision = recontractDecision(ctx, draft, round, stats, conv, chain);
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    effects.push(effect(CONCORDANCE_RULES.RECONTRACT, 'created', 'decision', decision.id,
      `Opened one governed re-contracting decision for a pair ${stats.divergedDimensions.length ? `${stats.divergedDimensions.length} step(s) apart` : 'below the agreement floor'}.`));
    link(draft, ctx, 'concordance', round.id, 'decision', decision.id, 're-contracts',
      CONCORDANCE_RULES.RECONTRACT,
      'The diverged expectation this decision was opened from.');
    if (placeOnAgenda(draft, ctx, round, stats)) {
      effects.push(effect(CONCORDANCE_RULES.RECONTRACT, 'updated', 'oneonone', round.memberId,
        'Placed one agenda line on the pair’s most recent 1:1 so the conversation has a place to happen.'));
    }
    // Unused variable guard: links is read above for the closed-loop edge only.
    void links;
  }
  return effects;
}

/** RULE-ECN-03: advisory maturity once the workspace reaches its evidence floor. */
function maturityRule(draft, ctx, conv) {
  const closed = roundsOf(draft).filter((r) => r.status === 'closed');
  if (closed.length < conv.evidenceFloor) return [];
  const tag = `${CONCORDANCE_RULES.MATURITY}:reached:${conv.evidenceFloor}`;
  if (seen(draft, tag)) return [];
  addMarker(draft, tag);
  return [effect(CONCORDANCE_RULES.MATURITY, 'audited', 'workspace', '',
    `${closed.length} closed rounds reached the ${conv.evidenceFloor}-round evidence floor. Agreement statistics are still conventions on six items, not predictive claims.`)];
}

export function concordanceRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conv = concordanceConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  const type = String(ctx.event.type || '');
  const explicit = type === CONCORDANCE_EVENTS.SCAN || type === CONCORDANCE_EVENTS.TRIGGER;
  const automatic = !explicit && conv.autoPropagate && isOperationalCommit(ctx.event);
  if (!explicit && !automatic) return [];

  const chain = buildChain(draft, { now, settings: draft.settings });
  const built = buildSeats(draft, { now, settings: draft.settings });
  if (!built) return [];
  const effects = [
    ...rollupRule(draft, scoped, chain),
    ...recontractRule(draft, scoped, chain, conv),
    ...maturityRule(draft, scoped, conv),
  ];
  if (Array.isArray(ctx.out)) ctx.out.push(...effects);
  return effects;
}
