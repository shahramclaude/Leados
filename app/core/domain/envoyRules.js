/**
 * app/core/domain/envoyRules.js — post-commit propagation for the Federated
 * Envoy (`#/envoy`, ADR-0085).
 *
 * Three rules, one transaction, no second workflow engine:
 *
 *  RULE-ENV-01 CARRIAGE. Every ingested packet writes one `carries` edge to the
 *  receiving span AND to every leadership ancestor of it. A span's attested
 *  pack is visible at the altitudes above it in the *form that altitude may
 *  hold* — the packet already contains no more than its address allows — and
 *  nobody re-types it. Cross-altitude roll-up on the same spine as every other
 *  module, expressed as a packet instead of a derived rate.
 *
 *  RULE-ENV-02 DIVERGENCE. When the same origin record arrives with different
 *  content, the local copy is NEVER overwritten. Exactly one governed DACI
 *  decision per origin record per ISO week is opened, naming both hashes, so
 *  "these two workspaces disagree" is a question a human answers — with the
 *  record, not with a last-write-wins merge.
 *
 *  RULE-ENV-03 ATTESTED EXPOSURE. A verified packet whose own attested
 *  open-critical share clears the declared floor opens one governed review
 *  decision addressed to the receiving span. Below the floor an advisory marker
 *  records that the evidence exists but does not justify a decision yet.
 *
 * Marker-idempotent, pausable by `envoyAutoPropagate`, and an explicit
 * `envoy.scan` always runs. Nothing here rates a person, edits a foreign
 * record, or fabricates a figure: every number in every decision comes from the
 * packet's own attestation.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import { LEADER_ID } from './chain.js';
import { envoyConventions } from './envoySchema.js';
import {
  ENVOY_CELL_FLOOR,
  ENVOY_EVENTS,
  ENVOY_KIND_LABELS,
  ENVOY_LIMITS,
  ENVOY_RULES,
  ENVOY_TRIGGER_PREFIX,
} from './envoyRegistry.js';
import { divergenceTag } from './envoy.js';

function clampStr(v, max = 280) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function markerList(draft) {
  if (!Array.isArray(draft.exchangeMarkers)) draft.exchangeMarkers = [];
  return draft.exchangeMarkers;
}

function hasMarker(draft, key) {
  return markerList(draft).some((m) => m && m.key === key);
}

function recordMarker(draft, ctx, key, kind, summary) {
  const list = markerList(draft);
  if (list.some((m) => m && m.key === key)) return false;
  list.push({
    id: ctx.idFactory('envm'),
    key,
    kind,
    recordedOn: dayKey(ctx.now),
    summary: clampStr(summary, 240),
  });
  if (list.length > ENVOY_LIMITS.markers) list.splice(0, list.length - ENVOY_LIMITS.markers);
  return true;
}

function linkOnce(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation,
    ruleId, summary: clampStr(summary, 280),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: clampStr(summary, 280) });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampStr(summary, 240)}`.slice(0, 300),
    });
  }
}

function ancestorsOf(built, seatId) {
  const out = [];
  if (!built || !seatId) return out;
  let cursor = built.chain?.nodes?.get(seatId)?.parentId || null;
  const visited = new Set([seatId]);
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (built.byId.has(cursor) && cursor !== LEADER_ID) out.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
  }
  return out;
}

function workspaceLeaderName(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  const root = people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId)));
  return (root && root.name) || draft?.settings?.leaderName || 'Workspace leader';
}

function governedDecision(ctx, { title, question, rationale, options, reviewDays }) {
  const leader = workspaceLeaderName(ctx.draftRef);
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: clampStr(title, 180),
    question: clampStr(question, 900),
    date: today,
    reversibility: 'reversible',
    driver: leader,
    approver: leader,
    contributors: '',
    informed: '',
    options: options.map((opt) => ({
      id: ctx.idFactory('opt'),
      label: clampStr(opt.label, 180),
      pros: clampStr(opt.pros, 240),
      cons: clampStr(opt.cons, 240),
    })),
    chosen: '',
    rationale: clampStr(rationale, 500),
    reviewOn: dayKey(addDays(ctx.now, reviewDays)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* -------------------------------------------------- RULE-ENV-01: carriage */

function carriageRule(draft, ctx, built, out) {
  const packets = Array.isArray(draft.exchangePackets) ? draft.exchangePackets : [];
  for (const packet of packets) {
    if (!packet || packet.direction !== 'inbound' || packet.status !== 'ingested') continue;
    const tag = `${ENVOY_RULES.ROLLUP}:${packet.id}`;
    if (hasMarker(draft, tag)) continue;
    recordMarker(draft, ctx, tag, 'carriage', `Packet ${packet.packetId.slice(0, 8)} carried up the chain.`);
    const seatId = packet.recipientSeatId;
    if (!seatId || seatId === LEADER_ID) {
      note(ctx, out, ENVOY_RULES.ROLLUP, 'noted', 'exchangepacket', packet.id,
        'Packet was addressed to the workspace root, which sits above every span in this tree: it climbs no further.');
      continue;
    }
    const targets = [seatId, ...ancestorsOf(built, seatId)];
    for (const targetId of targets) {
      const seat = built.byId.get(targetId);
      const rank = seat ? seat.rank : 2;
      const disc = rank <= 2 ? 'names' : rank === 3 ? 'unit' : 'aggregate';
      if (linkOnce(draft, ctx, 'exchangepacket', packet.id, 'person', targetId, 'carries', ENVOY_RULES.ROLLUP,
        `Attested packet carried to ${seat?.shortLabel || 'a leadership span'} (rank ${rank}, ${disc} disclosure, ${packet.itemCount} item(s)).`)) {
        note(ctx, out, ENVOY_RULES.ROLLUP, 'rolled-up', 'person', targetId,
          `Carried an ingested packet to span ${seat?.name || targetId} (rank ${rank}).`);
      }
    }
  }
}

/* ------------------------------------------------ RULE-ENV-02: divergence */

function divergenceRule(draft, ctx, out, conv) {
  const packets = Array.isArray(draft.exchangePackets) ? draft.exchangePackets : [];
  const artefacts = Array.isArray(draft.exchangeArtefacts) ? draft.exchangeArtefacts : [];
  // An artefact records the packet's CONTENT id (`packetId`), which is what the
  // sender signed and what a receiver re-derives; the local row has its own id.
  // Index both so a divergence can always name the packet it arrived in.
  const byId = new Map();
  for (const packet of packets) {
    byId.set(packet.id, packet);
    if (packet.packetId) byId.set(packet.packetId, packet);
  }
  const seen = new Set();
  for (const row of artefacts) {
    if (!row || row.status !== 'diverged') continue;
    const key = `${row.originWorkspaceId}:${row.kind}:${row.originId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tag = `${ENVOY_RULES.DIVERGENCE}:${divergenceTag(ctx.now, row.originWorkspaceId, row.kind, row.originId)}`;
    if (hasMarker(draft, tag)) continue;
    recordMarker(draft, ctx, tag, 'divergence', `Divergence on ${row.kind}:${row.originId}.`);
    const packet = byId.get(row.packetId) || null;
    const kindLabel = ENVOY_KIND_LABELS[row.kind] || row.kind;
    const alt = altitudeByKey(packet?.recipientAltitudeKey);
    const decision = governedDecision({ ...ctx, draftRef: draft }, {
      title: `Reconcile a divergent ${kindLabel.toLowerCase()} with ${packet?.originLabel || 'a peer workspace'}`,
      question: `Two workspaces hold different content for the same ${kindLabel.toLowerCase()} (origin ${row.originId.slice(0, 12)}…): this one, and the packet received ${row.ingestedOn || 'today'} from ${packet?.originLabel || 'a peer workspace'} at ${alt?.label || 'this altitude'}. The local record was NOT overwritten. Which version is the record of what happened, and what has to be re-attested upward once it is settled?`,
      rationale: `${ENVOY_RULES.DIVERGENCE}: an ingested artefact hashes to ${row.contentHash.slice(0, 12)}… while this workspace holds a different version of the same origin record. Divergence is information about two records, not a fault in a person; the rule opens one question per record per ISO week and writes no conclusion.`,
      options: [
        {
          label: 'Keep the local version and re-attest it upward with the correction noted',
          pros: 'Preserves the local audit trail and makes the correction visible to the altitude above instead of silent.',
          cons: 'Requires the sending span to re-issue the packet, so the correction costs a second cycle.',
        },
        {
          label: 'Ask the sending span which version is authoritative and re-send the packet',
          pros: 'Puts the decision where the record was originally written, which is usually where the facts are.',
          cons: 'Depends on that span still holding the original; a withdrawn record cannot be recovered from a packet.',
        },
        {
          label: 'Record both versions as a declared disagreement and stop attesting this record upward',
          pros: 'Honest when neither record can be proven — better than publishing one that might be wrong.',
          cons: 'Leaves the altitude above with a hole in its picture; the decision has to name what fills it.',
        },
      ],
      reviewDays: conv.envoyDivergenceReviewDays,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    note(ctx, out, ENVOY_RULES.DIVERGENCE, 'created', 'decision', decision.id,
      `Opened one reconciliation decision for a divergent ${row.kind}.`);
    if (packet && linkOnce(draft, ctx, 'exchangepacket', packet.id, 'decision', decision.id, 'reconciles', ENVOY_RULES.DIVERGENCE,
      'The reconciliation this packet’s divergence forced.')) {
      note(ctx, out, ENVOY_RULES.DIVERGENCE, 'linked', 'exchangepacket', packet.id,
        'Linked the packet to its reconciliation decision.');
    }
  }
}

/* ----------------------------------------------- RULE-ENV-03: attested risk */

function attestationRule(draft, ctx, out, conv) {
  const packets = Array.isArray(draft.exchangePackets) ? draft.exchangePackets : [];
  for (const packet of packets) {
    if (!packet || packet.direction !== 'inbound' || packet.status !== 'ingested') continue;
    const items = Number(packet.attestation?.items) || 0;
    const critical = Number(packet.attestation?.openCritical) || 0;
    const tag = `${ENVOY_RULES.ATTESTATION}:${packet.id}`;
    if (hasMarker(draft, tag)) continue;
    if (items < ENVOY_CELL_FLOOR) {
      recordMarker(draft, ctx, tag, 'attested-floor',
        `Packet carried ${items} attested artefact(s); the ${ENVOY_CELL_FLOOR}-item floor is not met, so no share is published.`);
      note(ctx, out, ENVOY_RULES.ATTESTATION, 'noted', 'exchangepacket', packet.id,
        `Attested exposure refused below the ${ENVOY_CELL_FLOOR}-item floor.`);
      continue;
    }
    const share = Math.round((critical / items) * 1000) / 10;
    recordMarker(draft, ctx, tag, 'attested', `Attested open-critical share ${share}%.`);
    if (share < conv.envoyAttestationRiskFloorPct) {
      note(ctx, out, ENVOY_RULES.ATTESTATION, 'noted', 'exchangepacket', packet.id,
        `Attested share ${share}% sits below the declared ${conv.envoyAttestationRiskFloorPct}% floor; no decision opened.`);
      continue;
    }
    const seat = packet.recipientSeatId && ctx.built.byId.get(packet.recipientSeatId);
    const alt = altitudeByKey(packet.recipientAltitudeKey);
    const decision = governedDecision({ ...ctx, draftRef: draft }, {
      title: `Review the attested exposure from ${String(packet.originLabel || 'a span').slice(0, 60)}`,
      question: `The sending workspace attests ${critical} of ${items} artefacts open and critical (${share}% against a ${conv.envoyAttestationRiskFloorPct}% floor), with the oldest open item at ${packet.attestation?.oldestOpenDays ?? 'an undeclared age'} days. What does ${seat?.name || 'this span'} own before the next exchange, and what does it hand back?`,
      rationale: `${ENVOY_RULES.ATTESTATION}: a verified inbound packet’s own counts cleared the declared floor at ${alt?.label || 'this altitude'}. The figures are the sending span’s declarations, not this workspace’s measurement; the rule opens the question and asserts nothing further.`,
      options: [
        {
          label: 'Accept the attestation and record what this span does with it',
          pros: 'Cheapest honest response when the pack already says what the altitude above needs.',
          cons: 'Accepts a claim that no local record can corroborate; the packet’s own limits say so.',
        },
        {
          label: 'Ask the sending span for a narrower packet at the next altitude down',
          pros: 'Buys detail the receiving span may lawfully hold when a count is not actionable.',
          cons: 'Costs a round trip, and the older altitude may not be allowed to see more.',
        },
        {
          label: 'Escalate: hand the packet up as-is and name the altitude that has to act',
          pros: 'Keeps the record of who knew what and when, which is the point of the seal.',
          cons: 'Moves work one level up without adding evidence; it can become a habit.',
        },
      ],
      reviewDays: conv.envoyDivergenceReviewDays,
    });
    if (!Array.isArray(draft.decisions)) draft.decisions = [];
    draft.decisions.unshift(decision);
    note(ctx, out, ENVOY_RULES.ATTESTATION, 'created', 'decision', decision.id,
      `Opened one review decision at a ${share}% attested open-critical share.`);
    linkOnce(draft, ctx, 'exchangepacket', packet.id, 'decision', decision.id, 'tracks-followup', ENVOY_RULES.ATTESTATION,
      'The review this attested exposure opened.');
  }
}

export function envoyRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const type = event.type;
  const explicit = type === ENVOY_EVENTS.SCAN || type === ENVOY_EVENTS.TRIGGER;
  const own = type.startsWith(ENVOY_TRIGGER_PREFIX);
  if (!explicit && !own) return [];
  const conv = envoyConventions(ctx.settings || draft.settings || {});
  if (!conv.envoyAutoPropagate && !explicit) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  hookCtx.built = built;

  const out = [];
  carriageRule(draft, hookCtx, built, out);
  divergenceRule(draft, hookCtx, out, conv);
  attestationRule(draft, hookCtx, out, conv);
  return out;
}

export const ENVOY_SECONDARY_EVENTS = Object.freeze([ENVOY_EVENTS.SCAN, ENVOY_EVENTS.TRIGGER, ENVOY_EVENTS.INGESTED]);
export const envoyWeekKey = (now) => weekKey(now) || dayKey(now);
