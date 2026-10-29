/**
 * app/core/domain/automationLineage.js — bounded, content-free propagation provenance.
 *
 * Successful post-commit effects used to be visible only in the live rule
 * metrics and in the records they produced. This ledger keeps a small, durable
 * account of which rule applied to which typed event, the collections it
 * changed, the IDs of changed records, new typed edges and emitted event types.
 * It deliberately stores no titles, summaries, record bodies, score inputs or
 * free text. Confidential conflicts and anonymous pulse records are excluded.
 */

import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
} from './cases.js';

export const PROPAGATION_LINEAGE_CAP = 250;
export const PROPAGATION_LINEAGE_STEP_CAP = 32;
export const PROPAGATION_LINEAGE_TARGET_CAP = 48;
export const PROPAGATION_LINEAGE_LINK_CAP = 48;
export const PROPAGATION_LINEAGE_EVENT_CAP = 48;

const COLLECTION_ENTITY_TYPES = Object.freeze(Object.fromEntries(
  Object.entries(LINK_ENTITY_COLLECTIONS)
    .filter(([, collection]) => collection)
    .map(([type, collection]) => [collection, type]),
));
const FORBIDDEN_COLLECTIONS = new Set(['conflicts', 'pulses', 'events', 'propagationLineage', 'propagationReceipts']);
const SAFE_EVENT_TOKEN = /^[a-z][a-zA-Z0-9.-]{0,79}$/;
const SAFE_ID = /^[^\u0000-\u001f\u007f]{1,80}$/;
const SAFE_RULE = /^[a-zA-Z0-9_.:-]{1,80}$/;
const SAFE_COLLECTION = /^[a-zA-Z][a-zA-Z0-9]{0,49}$/;

function text(value, limit = 80) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  // Reject overlong IDs rather than truncating them into references that could
  // resolve to the wrong record or survive cleanup as a dangling pointer.
  return id && id.length <= 80 && SAFE_ID.test(id) ? id : null;
}

function forbiddenType(type) {
  return FORBIDDEN_LINK_TYPES.includes(type);
}

function forbiddenEvent(event) {
  const type = text(event?.type, 80);
  return forbiddenType(text(event?.entity, 40))
    || type.startsWith('conflict.')
    || type.startsWith('pulse.');
}

function normalizeEventRef(event) {
  if (!event || typeof event !== 'object' || forbiddenEvent(event)) return null;
  const type = text(event.type, 80);
  const entity = text(event.entity, 40);
  if (!SAFE_EVENT_TOKEN.test(type)) return null;
  if (entity && !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(entity)) return null;
  return {
    type,
    entity,
    entityId: event.cleared === true ? null : safeId(event.entityId),
    ...(event.cleared === true ? { cleared: true } : {}),
  };
}

export function isTraceablePropagationEvent(event) {
  return Boolean(normalizeEventRef(event));
}

function collectionRows(collection, beforeRows, afterRows) {
  if (collection === 'retros') {
    const flatten = (rows) => (Array.isArray(rows) ? rows : [])
      .flatMap((retro) => (Array.isArray(retro?.lessons) ? retro.lessons : []))
      .filter((lesson) => lesson && typeof lesson.id === 'string')
      .map((lesson) => [lesson.id, lesson]);
    return { type: 'lesson', before: flatten(beforeRows), after: flatten(afterRows) };
  }
  const type = COLLECTION_ENTITY_TYPES[collection];
  if (!type || !LINK_ENTITY_TYPES.includes(type) || forbiddenType(type)) return null;
  const flatten = (rows) => (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.id === 'string' && row.id)
    .map((row) => [row.id, row]);
  return { type, before: flatten(beforeRows), after: flatten(afterRows) };
}

function changedTargets(collection, beforeRows, afterRows, remaining) {
  const rows = collectionRows(collection, beforeRows, afterRows);
  if (!rows) return { targets: [], omitted: 0 };
  const before = new Map(rows.before);
  const after = new Map(rows.after);
  const targets = [];
  let omitted = 0;
  const add = (id, change) => {
    if (targets.length >= remaining) { omitted += 1; return; }
    targets.push({ type: rows.type, id, change });
  };

  for (const [id, record] of after) {
    const prior = before.get(id);
    if (!prior) add(id, 'created');
    else if (JSON.stringify(prior) !== JSON.stringify(record)) add(id, 'updated');
  }
  for (const id of before.keys()) {
    if (!after.has(id)) add(id, 'removed');
  }
  return { targets, omitted };
}

function edgeKey(link) {
  return [link?.sourceType, link?.sourceId, link?.relation, link?.targetType, link?.targetId].join('\u0000');
}

function newTypedLinks(beforeRows, afterRows, remaining) {
  const before = new Set((Array.isArray(beforeRows) ? beforeRows : []).map(edgeKey));
  const links = [];
  let omitted = 0;
  for (const link of Array.isArray(afterRows) ? afterRows : []) {
    if (!link || before.has(edgeKey(link))) continue;
    if (!LINK_ENTITY_TYPES.includes(link.sourceType) || !LINK_ENTITY_TYPES.includes(link.targetType)
      || forbiddenType(link.sourceType) || forbiddenType(link.targetType)
      || !LINK_RELATIONS.includes(link.relation)) continue;
    const sourceId = safeId(link.sourceId);
    const targetId = safeId(link.targetId);
    if (!sourceId || !targetId) continue;
    if (links.length >= remaining) { omitted += 1; continue; }
    links.push({
      sourceType: link.sourceType,
      sourceId,
      relation: link.relation,
      targetType: link.targetType,
      targetId,
    });
  }
  return { links, omitted };
}

function emittedEventRefs(events, remaining) {
  const emitted = [];
  let omitted = 0;
  for (const event of Array.isArray(events) ? events : []) {
    const ref = normalizeEventRef(event);
    if (!ref) continue;
    if (emitted.length >= remaining) { omitted += 1; continue; }
    emitted.push(ref);
  }
  return { emitted, omitted };
}

/**
 * Build one successful (rule, event) trace step from the savepoint's before /
 * after collections. `afterOf` is savepoint.peek; it never exposes record text
 * to the durable ledger.
 */
export function makePropagationLineageStep({
  index,
  parentStepId = null,
  depth = 0,
  event,
  rule,
  effects = [],
  collections = [],
  beforeCollections = new Map(),
  afterOf = () => [],
  emittedEvents = [],
  targetBudget = PROPAGATION_LINEAGE_TARGET_CAP,
  linkBudget = PROPAGATION_LINEAGE_LINK_CAP,
  eventBudget = PROPAGATION_LINEAGE_EVENT_CAP,
} = {}) {
  const eventRef = normalizeEventRef(event);
  const ruleName = text(rule, 80);
  if (!eventRef || !SAFE_RULE.test(ruleName)) return null;

  const changedCollections = [...new Set((Array.isArray(collections) ? collections : [])
    .filter((key) => typeof key === 'string' && SAFE_COLLECTION.test(key) && !FORBIDDEN_COLLECTIONS.has(key)))].slice(0, 20);
  const targets = [];
  let omittedTargets = 0;
  for (const collection of changedCollections) {
    const result = changedTargets(collection, beforeCollections.get(collection), afterOf(collection), targetBudget - targets.length);
    targets.push(...result.targets);
    omittedTargets += result.omitted;
  }

  const linkResult = changedCollections.includes('links')
    ? newTypedLinks(beforeCollections.get('links'), afterOf('links'), linkBudget)
    : { links: [], omitted: 0 };
  const eventResult = emittedEventRefs(emittedEvents, eventBudget);
  const ruleIds = [...new Set((Array.isArray(effects) ? effects : [])
    .map((effect) => text(effect?.ruleId, 80))
    .filter((id) => SAFE_RULE.test(id)))].slice(0, 8);

  return {
    stepId: `s${Math.max(1, Math.floor(Number(index) || 1))}`,
    parentStepId: typeof parentStepId === 'string' && /^s\d{1,3}$/.test(parentStepId) ? parentStepId : null,
    depth: Math.max(0, Math.min(64, Math.floor(Number(depth) || 0))),
    event: eventRef,
    rule: ruleName,
    ruleIds,
    changedCollections,
    targets,
    links: linkResult.links,
    emitted: eventResult.emitted,
    omittedTargets,
    omittedLinks: linkResult.omitted,
    omittedEvents: eventResult.omitted,
  };
}

/** Append one transaction record, trimming only the oldest bounded history. */
export function appendPropagationLineage(draft, entry, { idFactory, now = new Date() } = {}) {
  if (!draft || !entry || !normalizeEventRef(entry.rootEvent) || !Array.isArray(entry.steps) || !entry.steps.length) return false;
  if (!Array.isArray(draft.propagationLineage)) draft.propagationLineage = [];
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString();
  let id = '';
  try {
    id = typeof idFactory === 'function' ? safeId(idFactory('trace')) || '' : '';
  } catch {
    id = '';
  }
  if (!id) id = `trace-${at.replace(/[^0-9]/g, '').slice(0, 14)}-${draft.propagationLineage.length + 1}`;
  const usedIds = new Set(draft.propagationLineage.map((row) => row?.id));
  const baseId = id;
  let suffix = 1;
  while (usedIds.has(id)) {
    const suffixText = `-${draft.propagationLineage.length + suffix}`;
    id = `${baseId.slice(0, 80 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  const steps = entry.steps.slice(0, PROPAGATION_LINEAGE_STEP_CAP);
  const normalized = normalizePropagationLineage([{
    id,
    at,
    revision: entry.revision,
    rootEvent: entry.rootEvent,
    steps,
    truncatedSteps: Math.max(0, Math.floor(Number(entry.truncatedSteps) || 0) + Math.max(0, entry.steps.length - steps.length)),
    omittedTargets: Math.max(0, Math.floor(Number(entry.omittedTargets) || 0)),
    omittedLinks: Math.max(0, Math.floor(Number(entry.omittedLinks) || 0)),
    omittedEvents: Math.max(0, Math.floor(Number(entry.omittedEvents) || 0)),
  }]);
  if (!normalized.length) return false;
  draft.propagationLineage.push(normalized[0]);
  if (draft.propagationLineage.length > PROPAGATION_LINEAGE_CAP) {
    draft.propagationLineage.splice(0, draft.propagationLineage.length - PROPAGATION_LINEAGE_CAP);
  }
  return true;
}

function normalizeTarget(target, targetBudget) {
  if (!target || typeof target !== 'object' || targetBudget <= 0) return null;
  const type = text(target.type, 40);
  const id = target.cleared === true ? null : safeId(target.id);
  if (!LINK_ENTITY_TYPES.includes(type) || forbiddenType(type) || (!id && target.cleared !== true)) return null;
  if (!['created', 'updated', 'removed'].includes(target.change)) return null;
  return { type, id, change: target.change, cleared: target.cleared === true };
}

function normalizeLink(link, linkBudget) {
  if (!link || typeof link !== 'object' || linkBudget <= 0) return null;
  const sourceType = text(link.sourceType, 40);
  const targetType = text(link.targetType, 40);
  const sourceCleared = link.sourceCleared === true;
  const targetCleared = link.targetCleared === true;
  const sourceId = sourceCleared ? null : safeId(link.sourceId);
  const targetId = targetCleared ? null : safeId(link.targetId);
  const relation = text(link.relation, 40);
  if (!LINK_ENTITY_TYPES.includes(sourceType) || !LINK_ENTITY_TYPES.includes(targetType)
    || forbiddenType(sourceType) || forbiddenType(targetType)
    || !LINK_RELATIONS.includes(relation)
    || (!sourceId && !sourceCleared) || (!targetId && !targetCleared)) return null;
  return { sourceType, sourceId, relation, targetType, targetId, sourceCleared, targetCleared };
}

function normalizeStep(step, index, limits, seenStepIds) {
  if (!step || typeof step !== 'object') return null;
  const stepId = /^s\d{1,3}$/.test(text(step.stepId, 6)) ? text(step.stepId, 6) : `s${index + 1}`;
  if (seenStepIds.has(stepId)) return null;
  const event = normalizeEventRef(step.event);
  const rule = text(step.rule, 80);
  if (!event || !SAFE_RULE.test(rule)) return null;
  seenStepIds.add(stepId);

  const changedCollections = [...new Set((Array.isArray(step.changedCollections) ? step.changedCollections : [])
    .map((key) => text(key, 50))
    .filter((key) => SAFE_COLLECTION.test(key) && !FORBIDDEN_COLLECTIONS.has(key)))].slice(0, 20);
  const targets = [];
  for (const target of Array.isArray(step.targets) ? step.targets : []) {
    const normalized = normalizeTarget(target, limits.targets - limits.targetCount);
    if (!normalized) continue;
    if (limits.targetCount >= limits.targets) break;
    targets.push(normalized);
    limits.targetCount += 1;
  }
  const links = [];
  for (const link of Array.isArray(step.links) ? step.links : []) {
    const normalized = normalizeLink(link, limits.links - limits.linkCount);
    if (!normalized) continue;
    if (limits.linkCount >= limits.links) break;
    links.push(normalized);
    limits.linkCount += 1;
  }
  const emitted = [];
  for (const eventRef of Array.isArray(step.emitted) ? step.emitted : []) {
    const normalized = normalizeEventRef(eventRef);
    if (!normalized) continue;
    if (limits.eventCount >= limits.events) break;
    emitted.push(normalized);
    limits.eventCount += 1;
  }
  const ruleIds = [...new Set((Array.isArray(step.ruleIds) ? step.ruleIds : [])
    .map((value) => text(value, 80))
    .filter((value) => SAFE_RULE.test(value)))].slice(0, 8);
  const parent = text(step.parentStepId, 6);
  return {
    stepId,
    parentStepId: /^s\d{1,3}$/.test(parent) && parent !== stepId && seenStepIds.has(parent) ? parent : null,
    depth: Math.max(0, Math.min(64, Math.floor(Number(step.depth) || 0))),
    event,
    rule,
    ruleIds,
    changedCollections,
    targets,
    links,
    emitted,
    omittedTargets: Math.max(0, Math.floor(Number(step.omittedTargets) || 0)),
    omittedLinks: Math.max(0, Math.floor(Number(step.omittedLinks) || 0)),
    omittedEvents: Math.max(0, Math.floor(Number(step.omittedEvents) || 0)),
  };
}

/** Normalize imported / persisted lineage without copying arbitrary content. */
export function normalizePropagationLineage(value, now = new Date().toISOString(), warnings = []) {
  const rows = Array.isArray(value) ? value : [];
  const fallbackAt = typeof now === 'string' ? now : now instanceof Date ? now.toISOString() : new Date().toISOString();
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows.slice(-PROPAGATION_LINEAGE_CAP)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { dropped += 1; continue; }
    const rootEvent = normalizeEventRef(row.rootEvent);
    if (!rootEvent) { dropped += 1; continue; }
    let id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id) id = `trace-${out.length + 1}`;
    if (!safeId(id)) { dropped += 1; continue; }
    if (seen.has(id)) { dropped += 1; continue; }
    seen.add(id);
    const limits = {
      targets: PROPAGATION_LINEAGE_TARGET_CAP,
      links: PROPAGATION_LINEAGE_LINK_CAP,
      events: PROPAGATION_LINEAGE_EVENT_CAP,
      targetCount: 0,
      linkCount: 0,
      eventCount: 0,
    };
    const seenStepIds = new Set();
    const rawSteps = Array.isArray(row.steps) ? row.steps : [];
    const steps = [];
    for (const step of rawSteps.slice(0, PROPAGATION_LINEAGE_STEP_CAP)) {
      const normalized = normalizeStep(step, steps.length, limits, seenStepIds);
      if (normalized) steps.push(normalized);
    }
    if (!steps.length) { dropped += 1; continue; }
    out.push({
      id,
      at: typeof row.at === 'string' && Number.isFinite(Date.parse(row.at)) ? new Date(row.at).toISOString() : fallbackAt,
      revision: Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : null,
      rootEvent,
      steps,
      truncatedSteps: Math.max(0, Math.floor(Number(row.truncatedSteps) || 0) + Math.max(0, rawSteps.length - PROPAGATION_LINEAGE_STEP_CAP)),
      omittedTargets: Math.max(0, Math.floor(Number(row.omittedTargets) || 0)),
      omittedLinks: Math.max(0, Math.floor(Number(row.omittedLinks) || 0)),
      omittedEvents: Math.max(0, Math.floor(Number(row.omittedEvents) || 0)),
    });
  }
  if (rows.length > PROPAGATION_LINEAGE_CAP) dropped += rows.length - PROPAGATION_LINEAGE_CAP;
  if (dropped && Array.isArray(warnings)) warnings.push(`Propagation lineage: dropped or capped ${dropped} invalid or excess transaction(s)`);
  return out;
}

function referencesEntity(row, matches) {
  const matchesRef = (type, id) => Boolean(id && matches(type, id));
  if (matchesRef(row?.rootEvent?.entity, row?.rootEvent?.entityId)) return true;
  for (const step of row?.steps || []) {
    if (matchesRef(step?.event?.entity, step?.event?.entityId)) return true;
    if ((step?.targets || []).some((target) => matchesRef(target?.type, target?.id))) return true;
    if ((step?.emitted || []).some((event) => matchesRef(event?.entity, event?.entityId))) return true;
    if ((step?.links || []).some((link) => matchesRef(link?.sourceType, link?.sourceId)
      || matchesRef(link?.targetType, link?.targetId))) return true;
  }
  return false;
}

/** Drop whole transactions that mention an entity class excluded by export. */
export function omitPropagationLineageReferences(rows, matches) {
  if (typeof matches !== 'function') return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((row) => !referencesEntity(row, matches));
}

function scrubEventRef(event, matches) {
  if (!event || !matches(event.entity, event.entityId)) return event;
  return { ...event, entityId: null, cleared: true };
}

/** Keep historical trace rows during clear-demo, but remove pointers to purged IDs. */
export function scrubPropagationLineageReferences(rows, matches) {
  if (typeof matches !== 'function') return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    rootEvent: scrubEventRef(row.rootEvent, matches),
    steps: (row.steps || []).map((step) => ({
      ...step,
      event: scrubEventRef(step.event, matches),
      emitted: (step.emitted || []).map((event) => scrubEventRef(event, matches)),
      targets: (step.targets || []).map((target) => (matches(target.type, target.id)
        ? { ...target, id: null, cleared: true }
        : target)),
      links: (step.links || []).map((link) => ({
        ...link,
        ...(matches(link.sourceType, link.sourceId) ? { sourceId: null, sourceCleared: true } : {}),
        ...(matches(link.targetType, link.targetId) ? { targetId: null, targetCleared: true } : {}),
      })),
    })),
  }));
}
