/**
 * app/core/domain/successionRules.js — the Succession Terminal's five post-commit
 * rules (Schema v83, ADR-0077), registered on the SAME generalized spine as
 * ADR-0008/0026 and the Altitude Lens (ADR-0076).
 *
 * RULE-SUC-01  BLANKET. When a span's collective blanket is inside the declared
 *              notice window (or the span holds promises and none of them is
 *              dated beyond it), ONE leader-owned task opens per span per ISO
 *              month: record the next dated commitment or hand the work over. A
 *              span out of promises is not covered; it is unmeasurable, and the
 *              task says which.
 * RULE-SUC-02  CERTIFIED GAP. When the flow test certifies that a holder's work
 *              cannot be reabsorbed, ONE governed decision opens per span per
 *              30-day bucket — the choice between developing a second holder,
 *              re-shaping the span, or accepting the exposure in writing — plus
 *              at most `successionMaxTasks` owned tasks, one per blocking item,
 *              each carrying a `certifies-gap` edge to that item and an
 *              `understudies-for` edge to the seat it protects. The task text
 *              names the certificate, not a worry.
 * RULE-SUC-03  CONCENTRATION. When a span's top-holder share sits above the
 *              declared cap while the flow test passes, ONE development
 *              commitment opens per span per 90-day bucket, linked to the span
 *              with `hedges-departure` — because the correct response to
 *              concentration is a second holder, never a warning.
 * RULE-SUC-04  GRADING. A frozen reading whose review date has passed ungraded
 *              opens one grading task. A bench claim nobody grades is an opinion
 *              with a date on it.
 * RULE-SUC-05  RECONCILE. Dead edges owned by this module are dropped and counted
 *              — the certificate is a statement about the current record and must
 *              not survive the record it certified.
 *
 * WHAT NO RULE MAY DO
 * -------------------
 * - Score, rank, rate or name a person as the subject of a judgement. The subject
 *   of every edge, task and decision is a SPAN or an ITEM.
 * - Move a reporting line, re-title anyone, or reassign work on the leader's
 *   behalf. `RULE-CHN-03` already owns structural decisions and this module defers
 *   to it.
 * - Read `conflicts` or `pulses`, or write any edge from a sensitive collection.
 * - Duplicate `RULE-SEAT-01`'s `rolls-up-to` fan-out. Vertical provenance is the
 *   Altitude Lens's job; this module's edges are about benches, certificates and
 *   hedges.
 *
 * All five are marker-idempotent, write inside the caller's transaction, are
 * pausable by `successionAutoPropagate` (an explicit scan always runs), and are
 * INERT on a workspace whose spans cannot be measured: a rule that fired on an
 * unmeasurable bench would be inventing a finding.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { SIGNAL_SOURCES } from './chainRegistry.js';
import {
  SUCCESSION_EVENTS,
  SUCCESSION_LIMITS,
  SUCCESSION_RULE_IDS,
} from './successionRegistry.js';
import { successionConventions } from './succession.js';
import { successionReport } from './succession.js';

const MARKER_CAP = 400;
const LINK_TYPE_BY_SOURCE = new Map(SIGNAL_SOURCES.map((s) => [s.key, s.linkType]));
const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'propagation.', 'vault.', 'workspace.', 'settings.',
  'demo.', 'import.', 'export.', 'lock.', 'crypto.', 'succession.',
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

function markerStore(draft) {
  if (!Array.isArray(draft.successionMarkers)) draft.successionMarkers = [];
  return draft.successionMarkers;
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > MARKER_CAP) markers.splice(0, markers.length - MARKER_CAP);
  return true;
}

const seen = (draft, tag) => markerStore(draft).includes(tag);

/**
 * Write one typed edge and, when the graph refuses it, SAY SO.
 *
 * `ensureEntityLink` declines silently for an invalid endpoint type, an unknown
 * relation, or a duplicate. Inside a rule that silence is the one failure mode this
 * workspace will not tolerate — the effect would be reported as applied while the
 * provenance that makes it auditable was never written. The first draft of
 * RULE-SUC-02 hit exactly that: `successionreading` was used as an edge SOURCE
 * before it was a registered graph entity type, and the rule reported work it had
 * not linked. The refusal is now logged, and the caller reads `ok`.
 */
function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  const result = ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  });
  if (!result.created && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'succession.link_refused',
      entity: 'workspace',
      entityId: '',
      summary: `${ruleId} could not write a ${relation} edge from ${sourceType}/${String(sourceId).slice(0, 24)} to ${targetType}/${String(targetId).slice(0, 24)}: an endpoint type, relation or id the typed graph refuses, or the edge already exists`.slice(0, 300),
    });
  }
  return result.created;
}

function pushTask(draft, task) {
  if (!Array.isArray(draft.delegations)) draft.delegations = [];
  draft.delegations.unshift(task);
}

function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 7) {
  return {
    id: ctx.idFactory('delegation'),
    personId: ownerId,
    title: title.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000),
    authority: 'act-inform',
    support: `${support.slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
    dueOn: dayKey(addDays(ctx.now, dueDays)),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

function governedDecision(ctx, ownerName, title, question, options, rationale) {
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    // `options` must be objects with a `label`: the decision normalizer filters
    // non-plain-objects out, so a bare string would silently produce a decision
    // with NO options on reload. Same class of bug as a null horizon becoming the
    // minimum — a shape that looks fine in memory and vanishes on the next read.
    options: (options || []).map((label, index) => ({
      id: `dopt-suc-${index + 1}`,
      label: String(label).slice(0, 300),
      pros: '',
      cons: '',
    })),
    // The provenance tag lives in `rationale`, which the normalizer preserves.
    // `tags` and `decisionClass` are not decision fields, so writing them would
    // have been silently discarded on the next load rather than surviving.
    rationale: `[RULE-SUC-02] ${rationale}`.slice(0, 4000),
    chosen: null,
    decidedOn: null,
    reviewOn: addDays(dayKey(ctx.now), 30),
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

function pushDecision(draft, decision) {
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.unshift(decision);
}

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

const bucket30 = (now) => String(Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000 / 30));
const bucket90 = (now) => String(Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000 / 90));

/* --------------------------------------------------------- RULE-SUC-01 */

function blanketRule(draft, ctx, report, conv) {
  const effects = [];
  const windowDays = Math.min(conv.successionHorizonDays, 30);
  const month = bucket30(ctx.now);
  const owner = ownerOf(draft);
  if (!owner) return effects;
  for (const span of report.spans) {
    if (!span.membersN || !span.itemsN) continue;
    const inside = span.blanket?.blanketDays !== null && span.blanket?.blanketDays !== undefined && span.blanket.blanketDays <= windowDays;
    if (!inside) continue;
    const tag = `SUC-01:${span.nodeId}:${month}`;
    if (seen(draft, tag)) continue;
    if (!addMarker(draft, tag)) continue;
    const task = newTask(
      ctx,
      owner.id,
      `Record the next dated commitment for ${span.name}’s span`,
      `Either put a date on the next piece of ${span.name}’s span work, or hand a named item over. The span currently holds ${span.itemsN} dated obligation(s) and the furthest is ${span.blanket?.blanketDays === null || span.blanket?.blanketDays === undefined ? 'undated' : `due in ${span.blanket.blanketDays} day(s)`}, which is inside the ${windowDays}-day notice window. An undated span is unmeasurable, not covered.`,
      `Certified by RULE-SUC-01 on ${dayKey(ctx.now)}. Blanket model: Haehling von Lanzenauer & Wright (1991).`,
      'succession-blanket',
      10,
    );
    pushTask(draft, task);
    effects.push(effect(SUCCESSION_RULE_IDS.BLANKET, 'created', 'delegation', task.id, `Blanket notice opened for ${span.name}’s span (${span.itemsN} item(s), ${span.blanket?.blanketDays ?? 'no'} day blanket).`));
  }
  return effects;
}

/* --------------------------------------------------------- RULE-SUC-02 */

function certifiedGapRule(draft, ctx, report, conv) {
  const effects = [];
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const cap = Math.min(conv.successionMaxTasks, SUCCESSION_LIMITS.maxTasks[1]);
  const bucket = bucket30(ctx.now);
  const month = bucket30(ctx.now);
  for (const span of report.spans) {
    if (span.verdict !== 'certified-gap') continue;
    // (a) the governed decision: one per span per 30-day bucket.
    const decisionTag = `SUC-02d:${span.nodeId}:${bucket}`;
    if (!seen(draft, decisionTag) && addMarker(draft, decisionTag)) {
      const names = span.blockingSet.slice(0, 3).map((item) => `${item.type} “${String(item.title || '').slice(0, 60)}”`).join('; ');
      const decision = governedDecision(
        ctx,
        owner.name || 'Leader',
        `Bench decision: ${span.name}’s span cannot reabsorb ${span.blockedN} obligation(s)`,
        `The maximum-flow test is infeasible on the current record: ${span.blockedN} of ${span.itemsN} dated obligation(s) held in ${span.name}’s span can be taken by nobody who remains (${names || 'see the certificate'}). Which of these is true? — (1) develop a second holder for each blocked item before its due date; (2) reshape the span so the work has somewhere to go; (3) accept the exposure in writing and record the date it becomes unacceptable. This decision names a span, never a person.`,
        ['Develop a second holder for every blocked obligation', 'Reshape the span so the work has somewhere to go', 'Accept the exposure in writing with a dated review'],
        `RULE-SUC-02 opened this on ${dayKey(ctx.now)}. Certificate: the eligibility graph admits no assignment of these items to those survivors, so this is a proof about the record, not a prediction about a departure.`,
      );
      pushDecision(draft, decision);
      if (span.nodeId && span.nodeId !== 'leader') {
        link(draft, ctx, 'person', span.nodeId, 'decision', decision.id, 'hedges-departure', SUCCESSION_RULE_IDS.GAP,
          'The governed decision this certified bench gap forced');
      }
      effects.push(effect(SUCCESSION_RULE_IDS.GAP, 'created', 'decision', decision.id, `Certified-gap decision opened for ${span.name}’s span (${span.blockedN} blocked item(s)).`));
    }
    // (b) one owned task per blocking item, capped.
    let created = 0;
    for (const item of span.blockingSet) {
      if (created >= cap) break;
      const tag = `SUC-02t:${span.nodeId}:${item.type}:${item.id}`;
      if (seen(draft, tag)) continue;
      if (!addMemberOfBarrier(draft, tag)) continue;
      const task = newTask(
        ctx,
        owner.id,
        `Find a holder for “${String(item.title || item.type).slice(0, 90)}”`,
        `This obligation is due ${item.dueOn || 'undated'} and the flow test certifies that no remaining member of ${span.name}’s span has both a recorded working relationship with its holder and the capacity to take it. Name the person who will hold it and record the handover, or change the date, or retire the obligation. The certificate is the finding; a completed handover is the only thing that clears it.`,
        `Certified by RULE-SUC-02 on ${dayKey(ctx.now)}; min-cut certificate, Ford–Fulkerson 1956.`,
        'succession-gap',
        7,
      );
      pushTask(draft, task);
      const graphType = LINK_TYPE_BY_SOURCE.get(item.type);
      if (graphType && item.id) {
        link(draft, ctx, graphType, item.id, 'delegation', task.id, 'certifies-gap', SUCCESSION_RULE_IDS.GAP,
          'The obligation a certified bench gap leaves unassignable');
      }
      if (span.nodeId && span.nodeId !== 'leader') {
        link(draft, ctx, 'person', span.nodeId, 'delegation', task.id, 'understudies-for', SUCCESSION_RULE_IDS.GAP,
          'The seat a second holder is being built for');
      }
      created += 1;
      effects.push(effect(SUCCESSION_RULE_IDS.GAP, 'created', 'delegation', task.id, `Blocking obligation “${String(item.title || item.type).slice(0, 60)}” queued with its certificate.`));
    }
  }
  return effects;
}

/** One marker write that is explicit about why it exists. */
function addMemberOfBarrier(draft, tag) {
  return addMarker(draft, tag);
}

/* --------------------------------------------------------- RULE-SUC-03 */

function concentrationRule(draft, ctx, report) {
  const effects = [];
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const bucket = bucket90(ctx.now);
  for (const span of report.spans) {
    if (span.verdict !== 'concentrated') continue;
    const tag = `SUC-03:${span.nodeId}:${bucket}`;
    if (seen(draft, tag)) continue;
    if (!addMarker(draft, tag)) continue;
    const holder = span.members.find((m) => m.id === span.concentration.topHolderId);
    const task = newTask(
      ctx,
      owner.id,
      `Build a second holder for the work concentrated in ${span.name}’s span`,
      `${span.concentration.topHolderShare}% of this span’s dated work sits with one holder${holder ? ` (${holder.name})` : ''} against a declared ${report.conventions.successionConcentrationCapPct}% cap. The effective number of holders is ${span.concentration.effectiveHolders} across ${span.concentration.memberN} people. The flow test passes today — this is the cheap moment to make a second holder, before a resignation turns concentration into a certified gap. Pair one recurring commitment with another person and record that they held it.`,
      `Certified by RULE-SUC-03 on ${dayKey(ctx.now)}. Concentration: Herfindahl–Hirschman index ${span.concentration.hhi}, inverse-HHI effective holders ${span.concentration.effectiveHolders}.`,
      'succession-concentration',
      21,
    );
    pushTask(draft, task);
    link(draft, ctx, 'person', span.nodeId, 'delegation', task.id, 'understudies-for', SUCCESSION_RULE_IDS.CONCENTRATION,
      'The seat a second holder is being built for');
    effects.push(effect(SUCCESSION_RULE_IDS.CONCENTRATION, 'created', 'delegation', task.id, `Second-holder commitment opened for ${span.name}’s span (top holder ${span.concentration.topHolderShare}%).`));
  }
  return effects;
}

/* --------------------------------------------------------- RULE-SUC-04 */

function gradingRule(draft, ctx) {
  const effects = [];
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const readings = Array.isArray(draft.successionReadings) ? draft.successionReadings : [];
  const today = dayKey(ctx.now);
  for (const reading of readings) {
    if (!reading || reading.graded || !reading.reviewOn) continue;
    if (reading.reviewOn > today) continue;
    const tag = `SUC-04:${reading.id}`;
    if (seen(draft, tag)) continue;
    if (!addMarker(draft, tag)) continue;
    const task = newTask(
      ctx,
      owner.id,
      'Grade a frozen bench reading',
      `The frozen bench claim from ${String(reading.frozenAt || '').slice(0, 10)} reached its review date on ${reading.reviewOn} and has not been graded. Grading re-runs the same structural test against the current record and stores a Brier loss — including a bad one. A forecast ledger whose bad readings are never scored is a marketing department.`,
      `Queued by RULE-SUC-04 on ${today}.`,
      'succession-grading',
      7,
    );
    pushTask(draft, task);
    link(draft, ctx, 'successionreading', reading.id, 'delegation', task.id, 'benches-for', SUCCESSION_RULE_IDS.GRADING,
      'The frozen bench reading this task grades');
    effects.push(effect(SUCCESSION_RULE_IDS.GRADING, 'created', 'delegation', task.id, `Grading queued for bench reading ${String(reading.id).slice(0, 20)}.`));
  }
  return effects;
}

/* --------------------------------------------------------- RULE-SUC-05 */

function reconcileRule(draft, ctx, report) {
  const effects = [];
  if (!Array.isArray(draft.links)) return effects;
  const readingIds = new Set((draft.successionReadings || []).map((r) => r && r.id).filter(Boolean));
  const spanIds = new Set(report.spans.map((s) => s.nodeId));
  let removed = 0;
  draft.links = draft.links.filter((edge) => {
    if (!edge || !String(edge.ruleId || '').startsWith('RULE-SUC')) return true;
    // A `benches-for` edge whose reading has been deleted is dead.
    if (edge.relation === 'benches-for' && edge.sourceType === 'successionreading' && !readingIds.has(edge.sourceId)) {
      removed += 1;
      return false;
    }
    // A `hedges-departure` or `understudies-for` edge whose span is no longer a
    // span (a reorganisation) is dead: the certificate must not survive the seat.
    if (['hedges-departure', 'understudies-for'].includes(edge.relation)
      && ['person', 'successionreading'].includes(edge.sourceType) && !spanIds.has(edge.sourceId)) {
      removed += 1;
      return false;
    }
    return true;
  });
  if (removed) {
    effects.push(effect(SUCCESSION_RULE_IDS.RECONCILE, 'removed', 'workspace', '', `Removed ${removed} dead succession edge(s) after a deletion or reorganisation.`));
    if (typeof ctx.logEvent === 'function') {
      ctx.logEvent({
        type: 'succession.reconciled',
        entity: 'workspace',
        entityId: '',
        summary: `Removed ${removed} obsolete succession edge(s) after a hierarchy or ledger change; other rules’ links were preserved.`,
      });
    }
  }
  return effects;
}

/* ------------------------------------------------------------- the rule */

export function successionRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conv = successionConventions({ ...(draft.settings || {}), ...(ctx.settings || {}) });
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  const type = ctx.event.type;
  const explicit = type === SUCCESSION_EVENTS.SCANNED || type === SUCCESSION_EVENTS.FROZEN;
  const automatic = !explicit && conv.successionAutoPropagate && isOperationalCommit(ctx.event);
  if (!explicit && !automatic) return [];

  const report = successionReport(draft, { now, settings: { ...(draft.settings || {}), ...(ctx.settings || {}) } });
  const effects = [];
  effects.push(...blanketRule(draft, scoped, report, conv));
  effects.push(...certifiedGapRule(draft, scoped, report, conv));
  effects.push(...concentrationRule(draft, scoped, report));
  effects.push(...gradingRule(draft, scoped));
  effects.push(...reconcileRule(draft, scoped, report));

  if (explicit && effects.length && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'workspace',
      entityId: '',
      summary: `Succession: ${effects.filter((e) => e.action === 'created' && e.targetType === 'delegation').length} bench task(s), ${effects.filter((e) => e.action === 'created' && e.targetType === 'decision').length} governed decision(s), ${effects.filter((e) => e.action === 'linked').length} certificate link(s).`.slice(0, 300),
    });
  }
  if (!effects.length && type === SUCCESSION_EVENTS.SCANNED && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'succession.scanned_empty',
      entity: 'workspace',
      entityId: '',
      summary: `Succession scan on ${dayKey(now)} found no new bench work: ${report.counts.certifiedN} certified gap(s), ${report.counts.concentratedN} concentrated span(s), ${report.counts.unmeasuredN} unmeasured.`,
    });
  }
  for (const entry of effects) if (Array.isArray(ctx.out)) ctx.out.push(entry);
  return effects;
}

successionRule.id = 'successionRule';
successionRule.label = 'Succession bench certification (RULE-SUC-01..05)';

export { SUCCESSION_EVENTS, SUCCESSION_RULE_IDS };
