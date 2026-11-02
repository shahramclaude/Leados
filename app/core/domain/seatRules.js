/**
 * app/core/domain/seatRules.js — the Operating Seat's three post-commit rules
 * (ADR-0076). Registered on the SAME generalized spine as ADR-0008/0026, so
 * altitude is another dimension of the existing event-driven architecture
 * rather than a second automation system bolted beside it (§3).
 *
 * RULE-SEAT-01 ROLLUP. On ANY committed operational event, for every open work
 *   record harvested by the generalized SIGNAL_SOURCES registry, write a typed
 *   `rolls-up-to` edge from that record to EACH leadership ancestor in the
 *   reporting tree whose span contains the work. A frontline conflict log
 *   therefore reaches the manager, director, VP and chief spans in the SAME
 *   transaction in which it was logged — with no re-entry, no status update and
 *   no per-module glue. Idempotency is the graph's own exact-edge uniqueness,
 *   not a bespoke marker array.
 * RULE-SEAT-02 HANDOVER. Declaring a seat opens ONE owned hand-up task at the
 *   parent span carrying the boundary disclosure: what the outgoing view could
 *   see that the incoming one cannot. One per seat per ISO week, tag-idempotent.
 * RULE-SEAT-03 BOUNDARY. An explicit scan records ONE audit event naming how
 *   many records were withheld and why, so an enforced refusal is traceable
 *   instead of invisible. It never logs on the automatic pass — a derived
 *   digest is not a human action.
 *
 * THE INERTNESS CONTRACT. `activeSeatId` defaults to null (the undeclared
 * operator view). The automatic pass is gated on a declared seat, so on every
 * workspace and every fixture that predates ADR-0076 this rule writes nothing,
 * creates no link and appends no event: the existing 2,178-test suite sees the
 * same transaction it always saw. Explicit `seat.scan` / `seat.switched`
 * events always run — pausing automation silences the automatic pass, never
 * the human's request to look now.
 */

import { dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { SIGNAL_SOURCES } from './chainRegistry.js';
import { harvestWork } from './chain.js';
import { GOVERNED_COLLECTIONS, SEAT_EVENTS, SEAT_RULE_IDS, SEAT_LIMITS } from './seatRegistry.js';
import { seatConventions } from './seatSchema.js';
import { activeSeat, buildSeats, canSee, projectForSeat } from './seat.js';

const LINK_TYPE_BY_SOURCE = new Map(SIGNAL_SOURCES.map((s) => [s.key, s.linkType]));
const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'propagation.', 'vault.', 'workspace.',
  'settings.', 'demo.', 'import.', 'export.', 'lock.', 'crypto.',
]);

/** Generalized predicate: any committed record event from any module. */
export function isOperationalCommit(event) {
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

/** RULE-SEAT-01: the generalized vertical fan-out. */
function rollUpRule(draft, ctx, built, conv) {
  const effects = [];
  const items = harvestWork(draft, built.chain, { now: ctx.now, settings: draft.settings });
  let created = 0;
  const cap = Math.min(conv.seatMaxLinks, SEAT_LIMITS.maxLinks[1]);
  for (const item of items) {
    if (created >= cap) break;
    const sourceType = LINK_TYPE_BY_SOURCE.get(item.type);
    if (!sourceType) continue;
    // Cadence items are derived per person, not stored records; a link to a
    // synthetic id would be dropped on the next normalize pass.
    if (!item.entityId || String(item.entityId).startsWith('cadence-')) continue;
    // A typed edge from a SENSITIVE individual record (a performance concern)
    // to a VP node would reveal that the record exists for that person, even
    // though the edge carries no text. Counts must survive upward; identifying
    // links must not. Sensitive work still contributes to every ancestor's
    // aggregate digest — this guard is about the graph, not the reading.
    if (item.sensitive === true) continue;
    const targets = ancestorsOf(built, item.ownerNodeId);
    for (const targetId of targets) {
      if (created >= cap) break;
      if (link(draft, ctx, sourceType, item.entityId, 'person', targetId, 'rolls-up-to',
        SEAT_RULE_IDS.ROLLUP, 'The leadership span this work rolls up to, derived from the reporting tree')) {
        created += 1;
        effects.push(effect(SEAT_RULE_IDS.ROLLUP, 'linked', 'person', targetId,
          `Rolled one ${item.typeLabel} up to ${built.byId.get(targetId)?.label || 'a span'}.`));
      }
    }
  }
  return { effects, created };
}

/** RULE-SEAT-02: one auditable hand-up on a seat declaration. */
function handoverRule(draft, ctx, built, conv) {
  const effects = [];
  const seat = activeSeat(built);
  if (seat.fullAccess || seat.isLeader) return effects;
  const week = weekKey(ctx.now) || dayKey(ctx.now);
  const tag = `${SEAT_RULE_IDS.HANDOVER}:week:${week}:${seat.id}`;
  const already = (draft.delegations || []).some((d) => d && typeof d.support === 'string' && d.support.includes(`[${tag}]`));
  if (already) return effects;
  const parent = built.byId.get(seat.parentId) || built.byId.get('leader');
  const holder = parent && parent.id !== 'leader'
    ? (draft.people || []).find((p) => p && p.id === parent.id && p.status !== 'archived')
    : null;
  if (!holder) return effects;
  const withheld = [];
  for (const collection of GOVERNED_COLLECTIONS) {
    for (const record of (Array.isArray(draft[collection]) ? draft[collection] : [])) {
      const verdict = canSee(record, collection, seat, built);
      if (verdict.allow !== 'full') withheld.push(verdict.classLabel);
    }
  }
  const classes = [...new Set(withheld)];
  const task = {
    id: ctx.idFactory('delegation'),
    personId: holder.id,
    title: `Seat handover: ${seat.label} assumed at rank ${seat.rank}`,
    expectedOutcome: `Confirm the ${seat.label} hand-up: ${classes.length} record class(es) are intentionally withheld from this seat. No individual detail crossed the boundary.`,
    authority: 'act-inform',
    support: `${SEAT_RULE_IDS.HANDOVER}: one handover per seat per ISO week. Withheld classes: ${classes.join(', ') || 'none'}. ${tag && `[${tag}]`}`,
    delegatedOn: dayKey(ctx.now),
    dueOn: dayKey(new Date(ctx.now.getTime() + 7 * 86400000)),
    status: 'active', checkins: [], completedOn: null, completionNote: '',
    returnedOn: null, returnReason: '',
    createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString(),
  };
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  draft.delegations.unshift(task);
  effects.push(effect(SEAT_RULE_IDS.HANDOVER, 'created', 'delegation', task.id,
    `Opened the auditable seat handover at ${parent.label}.`));
  if (link(draft, ctx, 'delegation', task.id, 'person', seat.id, 'rolls-up-to',
    SEAT_RULE_IDS.HANDOVER, 'The seat whose boundary this handover declares')) {
    effects.push(effect(SEAT_RULE_IDS.HANDOVER, 'linked', 'person', seat.id,
      'Linked the handover to the seat it declares.'));
  }
  return effects;
}

/** RULE-SEAT-03: the transparent, traceable boundary (explicit pass only). */
function boundaryRule(draft, ctx, built) {
  const seat = activeSeat(built);
  const projection = projectForSeat(draft, seat, built, { cap: SEAT_LIMITS.ledgerCap });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'seat.access_denied',
      entity: 'workspace',
      entityId: '',
      summary: `Operating seat ${seat.label}: ${projection.counts.full} record(s) readable, ${projection.counts.aggregate} aggregate-only, ${projection.counts.denied} denied. Every refusal carries its reason on the Altitude Lens.`.slice(0, 300),
    });
  }
  return [effect(SEAT_RULE_IDS.BOUNDARY, 'audited', 'workspace', '',
    `${projection.counts.aggregate} aggregate-only and ${projection.counts.denied} denied record(s) explained.`)];
}

export function seatRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conv = seatConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  const type = ctx.event.type;
  const explicit = type === SEAT_EVENTS.SCAN || type === SEAT_EVENTS.SWITCH || type === SEAT_EVENTS.PROPAGATE;
  const automatic = !explicit && conv.seatAutoPropagate && Boolean(conv.activeSeatId)
    && isOperationalCommit(ctx.event);
  if (!explicit && !automatic) return [];

  const built = buildSeats(draft, { now, settings: draft.settings });
  const effects = [];

  if (explicit || automatic) {
    const rolled = rollUpRule(draft, scoped, built, conv);
    effects.push(...rolled.effects);
  }
  if (type === SEAT_EVENTS.SWITCH) effects.push(...handoverRule(draft, scoped, built, conv));
  if (explicit && type !== SEAT_EVENTS.PROPAGATE) effects.push(...boundaryRule(draft, scoped, built));

  if (explicit && effects.length && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'workspace',
      entityId: '',
      summary: `Operating seat: ${effects.filter((e) => e.action === 'linked').length} typed roll-up edge(s), ${effects.filter((e) => e.action === 'created').length} handover task(s).`.slice(0, 300),
    });
  }
  for (const entry of effects) {
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

seatRule.id = 'seatRule';
seatRule.label = 'Operating seat vertical roll-up (RULE-SEAT-01..03)';

export { SEAT_EVENTS, SEAT_RULE_IDS };
