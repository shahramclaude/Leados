/**
 * app/core/domain/waitCostRules.js — the post-commit side of the Cost of
 * Waiting Terminal (Schema v64) on the shared rule spine (ADR-0008, ADR-0053).
 *
 * A priced wait is a number on a page until the spine turns it into owned,
 * dated work and a decision. Same principle as the survival rules: the
 * escalation is about the work and the system, never about a person.
 *
 *   RULE-WAIT-01  `waitcost.scan` / `waitcost.exposure.frozen` / price events
 *                 Every priced open item past its class median gets a typed
 *                 `prices-delay` edge from the week's exposure certificate to
 *                 the real source record, so the money is navigable from the
 *                 item and from the certificate. Edge creation is idempotent
 *                 by exact-link match.
 *
 *   RULE-WAIT-02  same events
 *                 A currency whose overdue weekly exposure clears the declared
 *                 threshold gets exactly ONE DACI triage decision per week:
 *                 what to expedite, what to defer deliberately. It runs before
 *                 decision tempo, so the decision receives a timing position in
 *                 the same atomic transaction.
 *
 *   RULE-WAIT-03  same events
 *                 The top priced overdue items (declared cap) each get one
 *                 owned, dated task for the item's *recorded* owner — never an
 *                 invented one: expedite, re-scope, or defer with a recorded
 *                 review date. Marker-idempotent per item per week.
 *
 *   RULE-WAIT-04  same events
 *                 Overdue items with NO price get up to the declared cap of
 *                 "declare a price" tasks to the leader. Unpriced is not zero,
 *                 and the only honest fix is a declared number.
 *
 *   RULE-WAIT-05  `waitcost.scan` / price events
 *                 Freezes this week's exposure certificate (one per week,
 *                 marker-idempotent) and reconciles stale `prices-delay` edges
 *                 whose target item has since closed — desired-state
 *                 reconciliation, never a silent dangling edge.
 *
 * `waitAutoPropagate=false` pauses automatic work; an explicit scan always
 * runs and catches up. The rule never rates a person, never reassigns work and
 * never closes an item.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  WAIT_DEFAULTS,
  buildExposureCertificate,
  exposureById,
  waitConventionsFromSettings,
  waitCostReport,
} from './waitCost.js';
import { resolveOwner } from './survival.js';

export const WAIT_RULE_VERSION = 1;

export const WAIT_RULE_IDS = Object.freeze({
  LINK: 'RULE-WAIT-01',
  TRIAGE: 'RULE-WAIT-02',
  TASK: 'RULE-WAIT-03',
  PRICE: 'RULE-WAIT-04',
  FREEZE: 'RULE-WAIT-05',
});

export const WAIT_EVENTS = Object.freeze({
  SCAN: 'waitcost.scan',
  FROZEN: 'waitcost.exposure.frozen',
  PRICE: 'waitcost.price.declared',
  PRICE_REMOVED: 'waitcost.price.removed',
});

function str(value, fallback = '') {
  return typeof value === 'string' && value ? value : fallback;
}

function hasMarker(markers, tag) {
  return markers.some((marker) => typeof marker === 'string' && marker.includes(tag));
}

function addMarker(markers, tag) {
  if (!markers.includes(tag)) markers.push(tag);
  if (markers.length > 400) markers.splice(0, markers.length - 400);
}

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function money(amount, currency) {
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function delegationRecord(ctx, { personId, title, expectedOutcome, support, dueOn, tag }) {
  return {
    id: ctx.idFactory('delegation'),
    personId,
    title: String(title).slice(0, 200),
    expectedOutcome: String(expectedOutcome).slice(0, 2000),
    authority: 'act-inform',
    support: `${String(support).slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
    dueOn,
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

function decisionRecord(ctx, draft, { title, question, options, reviewOn, rationale }) {
  const leader = str(draft.settings && draft.settings.leaderName);
  return {
    id: ctx.idFactory('dec'),
    title: String(title).slice(0, 200),
    question: String(question).slice(0, 2000),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leader.slice(0, 120),
    approver: leader.slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: String(rationale).slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function certificateForWeek(draft, week) {
  return (Array.isArray(draft.waitExposures) ? draft.waitExposures : [])
    .find((row) => row && row.week === week) || null;
}

/* ------------------------------------------------------------- RULE-WAIT-05 */

/**
 * Freeze this week's certificate once per week, and reconcile `prices-delay`
 * edges whose target item has closed since — the edge set should describe the
 * open queue, not history.
 */
function ensureWeeklyCertificate(draft, ctx, report, conventions) {
  const week = report.week;
  draft.waitCostMarkers = Array.isArray(draft.waitCostMarkers) ? draft.waitCostMarkers : [];
  const existing = certificateForWeek(draft, week);
  const tag = `${WAIT_RULE_IDS.FREEZE}:${week}`;
  if (existing) {
    if (!hasMarker(draft.waitCostMarkers, tag)) addMarker(draft.waitCostMarkers, tag);
    return { certificate: existing, created: false, effects: [] };
  }
  if (hasMarker(draft.waitCostMarkers, tag)) {
    // The marker says a certificate was frozen this week but the record is
    // gone (e.g. an import). Do not re-invent it silently; the scan's
    // reconciliation below still runs.
    return { certificate: null, created: false, effects: [] };
  }
  addMarker(draft.waitCostMarkers, tag);
  const record = buildExposureCertificate(report, {
    id: ctx.idFactory('wxp'),
    label: `Exposure certificate, week of ${week}`,
    reviewOn: addDays(dayKey(ctx.now), 7),
    nowIso: ctx.now.toISOString(),
  });
  draft.waitExposures = Array.isArray(draft.waitExposures) ? draft.waitExposures : [];
  draft.waitExposures.unshift(record);
  if (draft.waitExposures.length > conventions.exposureCap) {
    draft.waitExposures.length = conventions.exposureCap;
  }
  return {
    certificate: record,
    created: true,
    effects: [effect(WAIT_RULE_IDS.FREEZE, 'created', 'exposure', record.id,
      `Froze the weekly exposure certificate for ${week}: ${record.items.length} priced item(s), ${record.totals.length} currency bucket(s).`)],
  };
}

function reconcileStaleEdges(draft, report) {
  const openKeys = new Set(report.rows.map((row) => `${row.item.sourceType}:${row.item.sourceId}`));
  const before = Array.isArray(draft.links) ? draft.links.length : 0;
  draft.links = (Array.isArray(draft.links) ? draft.links : []).filter((link) => {
    if (!link || link.relation !== 'prices-delay') return true;
    return openKeys.has(`${link.targetType}:${link.targetId}`);
  });
  const removed = before - draft.links.length;
  return removed > 0
    ? [effect(WAIT_RULE_IDS.FREEZE, 'reconciled', 'links', '', `Removed ${removed} stale prices-delay edge(s) whose item has closed.`)]
    : [];
}

/* ------------------------------------------------------------- RULE-WAIT-01 */

function linkPricedOverdue(draft, ctx, certificate, report, conventions) {
  if (!certificate) return [];
  const effects = [];
  const pressed = report.rows
    .filter((row) => row.price.priced && row.overdue)
    .slice(0, conventions.maxLinks);
  for (const row of pressed) {
    const summary = `${money(row.price.weeklyAmount, row.price.currency)}/week · ${row.item.elapsedDays}d old · past the ${row.klass.label.toLowerCase()} median · confidence ${row.confidence.level}`;
    const { created } = ensureEntityLink(draft, {
      sourceType: 'exposure',
      sourceId: certificate.id,
      targetType: row.item.sourceType,
      targetId: row.item.sourceId,
      relation: 'prices-delay',
      ruleId: WAIT_RULE_IDS.LINK,
      summary,
    }, {
      idFactory: ctx.idFactory,
      todayStr: dayKey(ctx.now),
      nowIso: ctx.now.toISOString(),
    });
    if (created) {
      effects.push(effect(WAIT_RULE_IDS.LINK, 'linked', row.item.sourceType, row.item.sourceId,
        `Linked the weekly certificate to an item whose wait is priced at ${money(row.price.weeklyAmount, row.price.currency)}/week and past its class median.`));
    }
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-WAIT-02 */

function triageDecisions(draft, ctx, report, conventions) {
  const effects = [];
  const week = report.week;
  draft.waitCostMarkers = Array.isArray(draft.waitCostMarkers) ? draft.waitCostMarkers : [];
  for (const bucket of report.totals) {
    if (!(bucket.weeklyExposureOverdue > conventions.triageThreshold)) continue;
    const tag = `${WAIT_RULE_IDS.TRIAGE}:${bucket.currency}:${week}`;
    if (hasMarker(draft.waitCostMarkers, tag)) continue;
    addMarker(draft.waitCostMarkers, tag);
    const top = report.rows.find((row) => row.price.priced && row.overdue && row.price.currency === bucket.currency);
    const decision = decisionRecord(ctx, draft, {
      title: `The waiting is costing ${money(bucket.weeklyExposureOverdue, bucket.currency)}/week — triage the priced queue`,
      question: `${bucket.overduePricedItems} open item(s) are past the point where comparable work in their class finishes, and their declared delay prices sum to ${money(bucket.weeklyExposureOverdue, bucket.currency)} per week in ${bucket.currency} (currencies are never pooled; ${money(bucket.weeklyExposure, bucket.currency)}/week over all priced open items). The largest single wait is ${top ? `${money(top.price.weeklyAmount, top.price.currency)}/week` : 'not priced per item'}. What do we expedite, what do we re-scope, and what do we deliberately defer with a recorded review date?`,
      options: [
        ['Expedite the top priced items', 'The concentration reading says which single item carries the most waiting cost per week; acting there first buys the most per hour spent.', 'It spends leader attention on work that may be big for reasons the price does not capture.'],
        ['Re-sequence or hand off the queue', 'If the wait is structural — the same class keeps exceeding its median — the fix is the process that starts the work, not the items.', 'Slower to land; the weekly cost keeps accruing while it lands.'],
        ['Deliberately defer with a recorded date', 'Some waits are cheap enough to accept consciously; recording the review date makes the deferral a decision instead of a drift.', 'A deferral without a date is how the queue silently becomes the strategy.'],
      ],
      reviewOn: dayKey(addDays(ctx.now, 14)),
      rationale: `Opened by ${WAIT_RULE_IDS.TRIAGE} because overdue priced exposure reached ${money(bucket.weeklyExposureOverdue, bucket.currency)}/week in ${bucket.currency}, above the declared threshold of ${money(conventions.triageThreshold, bucket.currency)}. The decision is about the queue of work and its prices, never about a person. One decision per currency per week, marker-idempotent.`,
    });
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.unshift(decision);
    effects.push(effect(WAIT_RULE_IDS.TRIAGE, 'created', 'decision', decision.id,
      `Opened one triage decision for ${bucket.currency} ${money(bucket.weeklyExposureOverdue, bucket.currency)}/week of priced waiting.`));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-WAIT-03 */

function overdueTasks(draft, ctx, report, conventions) {
  const effects = [];
  const week = report.week;
  draft.waitCostMarkers = Array.isArray(draft.waitCostMarkers) ? draft.waitCostMarkers : [];
  const pressed = report.rows
    .filter((row) => row.price.priced && row.overdue)
    .slice(0, conventions.maxTasksPerScan);
  let opened = 0;
  for (const row of pressed) {
    const tag = `${WAIT_RULE_IDS.TASK}:${row.item.key}:${week}`;
    if (hasMarker(draft.waitCostMarkers, tag)) continue;
    const ownerId = resolveOwner(draft, row.item);
    if (!ownerId) continue; // Never invent an owner; the link still records the price.
    addMarker(draft.waitCostMarkers, tag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Decide on the priced wait on “${String(row.item.title || 'this item').slice(0, 90)}”`,
      expectedOutcome: `This item is ${row.item.elapsedDays} day(s) old — past the ${row.klass.label.toLowerCase()} median of ${row.klass.completionQuantile.reached ? `${row.klass.completionQuantile.days} day(s)` : 'not reached'} — and its wait is priced at ${money(row.price.weeklyAmount, row.price.currency)}/week. Record one of: expedite (with what), re-scope (to what), or a deliberate deferral with a review date. Silence is the one option that keeps costing.`,
      support: `${WAIT_RULE_IDS.TASK} opened this because the item is past its class median and carries a declared (or decision-derived) weekly price. The price attaches to the work, not to the person holding it.`,
      dueOn: dayKey(addDays(ctx.now, 3)),
      tag,
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    opened += 1;
    effects.push(effect(WAIT_RULE_IDS.TASK, 'created', 'delegation', task.id,
      `Opened one owned task for an item whose wait is priced at ${money(row.price.weeklyAmount, row.price.currency)}/week and past its class median.`));
  }
  return effects;
}

/* ------------------------------------------------------------- RULE-WAIT-04 */

function priceTasks(draft, ctx, report, conventions) {
  const effects = [];
  const week = report.week;
  draft.waitCostMarkers = Array.isArray(draft.waitCostMarkers) ? draft.waitCostMarkers : [];
  const unpriced = report.rows.filter((row) => !row.price.priced && row.overdue);
  // One task per class, not per item: the fix for an unpriced wait is one
  // declared number, not one task per row.
  const byClass = new Map();
  for (const row of unpriced) {
    if (!byClass.has(row.item.kind)) byClass.set(row.item.kind, row);
    if (byClass.size >= conventions.maxPriceTasks) break;
  }
  for (const [classKey, row] of byClass.entries()) {
    const tag = `${WAIT_RULE_IDS.PRICE}:${classKey}:${week}`;
    if (hasMarker(draft.waitCostMarkers, tag)) continue;
    const ownerId = resolveOwner(draft, { ownerId: null });
    if (!ownerId) continue;
    addMarker(draft.waitCostMarkers, tag);
    const task = delegationRecord(ctx, {
      personId: ownerId,
      title: `Declare a weekly delay price for ${str(row.klass.label, 60).toLowerCase() || classKey}`,
      expectedOutcome: `One declared weekly price (amount and currency) for ${str(row.klass.label, 60).toLowerCase() || classKey}, or an explicit note that the wait is accepted unpriced. Right now ${unpriced.filter((r) => r.item.kind === classKey).length} overdue item(s) in this class carry an unknown cost — unpriced is not zero, it is unmeasured.`,
      support: `${WAIT_RULE_IDS.PRICE} opened this during a scan. The price is the leader's own declaration about what waiting costs; the app never invents one.`,
      dueOn: dayKey(addDays(ctx.now, 7)),
      tag,
    });
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift(task);
    effects.push(effect(WAIT_RULE_IDS.PRICE, 'created', 'delegation', task.id,
      `Opened one task to declare a weekly price for ${classKey}: the wait is currently unpriced, not zero.`));
  }
  return effects;
}

/* ---------------------------------------------------------------- the rule */

export function waitCostRule(draft, ctx = {}) {
  const { event, now = new Date(), out = [], logEvent } = ctx;
  if (!event || !draft) return [];
  const type = str(event.type);
  if (!Object.values(WAIT_EVENTS).includes(type)) return [];

  const settings = { ...WAIT_DEFAULTS, ...(ctx.settings || {}), ...(draft.settings || {}) };
  const conventions = waitConventionsFromSettings(settings);
  // An explicit scan is a request to catch up and is never suppressed by the
  // pause; automatic work respects it.
  if (!conventions.autoPropagate && type !== WAIT_EVENTS.SCAN) return [];

  const report = waitCostReport(draft, now, settings);
  let effects = [];

  if (type === WAIT_EVENTS.FROZEN) {
    const certificate = event.entityId ? exposureById(draft, event.entityId) : certificateForWeek(draft, report.week);
    effects.push(...linkPricedOverdue(draft, ctx, certificate, report, conventions));
    effects.push(...triageDecisions(draft, ctx, report, conventions));
    effects.push(...overdueTasks(draft, ctx, report, conventions));
    effects.push(...priceTasks(draft, ctx, report, conventions));
  } else {
    // SCAN, PRICE_DECLARED, PRICE_REMOVED: full desired-state pass.
    effects.push(...reconcileStaleEdges(draft, report));
    const { certificate, effects: freezeEffects } = ensureWeeklyCertificate(draft, ctx, report, conventions);
    effects.push(...freezeEffects);
    effects.push(...linkPricedOverdue(draft, ctx, certificate, report, conventions));
    effects.push(...triageDecisions(draft, ctx, report, conventions));
    effects.push(...overdueTasks(draft, ctx, report, conventions));
    effects.push(...priceTasks(draft, ctx, report, conventions));
  }

  for (const entry of effects) {
    if (typeof logEvent === 'function') {
      logEvent({
        type: 'automation.propagated',
        entity: 'waitcost',
        entityId: entry.targetId || '',
        summary: entry.summary,
      });
    }
    out.push(entry);
  }
  return effects;
}

waitCostRule.id = 'waitcost';
waitCostRule.label = 'Cost of waiting propagation (RULE-WAIT-01..05)';
waitCostRule.module = 'waitCostRules.js';
waitCostRule.triggers = Object.values(WAIT_EVENTS);
waitCostRule.effect = (draft, event, context = {}) => waitCostRule(draft, { ...context, event });
Object.freeze(waitCostRule);

export default waitCostRule;
