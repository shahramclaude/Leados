/** Stored contract for Schema v58. Invalid active definitions fail closed. */
import {
  AUTOPILOT_ACTIONS, AUTOPILOT_ACTION_BY_ID, AUTOPILOT_LIMITS,
  AUTOPILOT_OPERATORS, AUTOPILOT_SOURCE_BY_ID, AUTOPILOT_TOKENS,
} from './autopilotRegistry.js';

export const POLICY_STATUSES = Object.freeze(['draft', 'active', 'paused', 'retired']);
const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const integer = (v, min, max) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
const stamp = (v, fallback) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : fallback;

export function validateTemplate(value, label, max = 1000) {
  const raw = text(value, max + 1);
  if (!raw || raw.length > max) return { ok: false, error: `${label} needs 1–${max} characters.` };
  const stripped = raw.replace(/\{\{([a-z]+)\}\}/g, (match, token) => AUTOPILOT_TOKENS.includes(token) ? '' : match);
  if (/[{}]/.test(stripped)) return { ok: false, error: `${label} contains an unknown or malformed template token. Use only ${AUTOPILOT_TOKENS.map((t) => `{{${t}}}`).join(', ')}.` };
  return { ok: true, value: raw };
}

export function validateConditions(raw, sourceType) {
  const source = AUTOPILOT_SOURCE_BY_ID[sourceType];
  if (!source) return { ok: false, error: 'Choose a supported source module.' };
  if (!Array.isArray(raw) || raw.length > AUTOPILOT_LIMITS.conditions) return { ok: false, error: `Use zero to ${AUTOPILOT_LIMITS.conditions} conditions.` };
  const conditions = [];
  for (const row of raw) {
    if (!object(row)) return { ok: false, error: 'Every condition must be a structured rule.' };
    const field = source.fields.find((f) => f.id === row.field);
    if (!field) return { ok: false, error: `“${text(row.field, 40)}” is not a fact exposed by ${source.label}.` };
    if (!AUTOPILOT_OPERATORS[field.type].some((op) => op.id === row.op)) return { ok: false, error: `That operator cannot be used with ${field.label}.` };
    let value = row.value;
    if (field.type === 'number') {
      if (typeof value !== 'number' && typeof value !== 'string') return { ok: false, error: `${field.label} needs a numeric threshold.` };
      value = Number(value);
      if (!Number.isFinite(value) || value < field.min || value > field.max) return { ok: false, error: `${field.label} must be between ${field.min} and ${field.max}.` };
    } else if (field.type === 'boolean') {
      if (![true, false, 'true', 'false'].includes(value)) return { ok: false, error: `${field.label} must be true or false.` };
      value = value === true || value === 'true';
    } else if (field.type === 'enum') {
      if (!field.values.includes(value)) return { ok: false, error: `Choose a supported value for ${field.label}.` };
    } else {
      value = text(value, 160);
      if (!value) return { ok: false, error: `${field.label} needs a comparison value.` };
    }
    conditions.push({ field: field.id, op: row.op, value });
  }
  return { ok: true, value: conditions };
}

export function validateActions(raw, sourceType) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > AUTOPILOT_LIMITS.actions) return { ok: false, error: 'Choose between one and five actions.' };
  const seen = new Set();
  const actions = [];
  for (const row of raw) {
    if (!object(row) || !AUTOPILOT_ACTION_BY_ID[row.type]) return { ok: false, error: 'Choose a supported action.' };
    if (seen.has(row.type)) return { ok: false, error: 'Use each action type at most once per agreement.' };
    seen.add(row.type);
    const action = { id: row.type, type: row.type };
    if (row.type === 'comms') {
      if (sourceType !== 'case' || row.audience !== 'key') return { ok: false, error: 'Stakeholder briefs are available only for cases, using the key/opposing audience.' };
      action.audience = 'key';
      actions.push(action); continue;
    }
    if (row.type !== 'decision' && !['source', 'fixed'].includes(row.ownerMode)) return { ok: false, error: 'Choose the source owner or a named person.' };
    action.ownerMode = row.ownerMode;
    action.ownerId = text(row.ownerId, 120);
    if (row.ownerMode === 'fixed' && !action.ownerId) return { ok: false, error: 'Name the person who owns this action.' };
    if (row.type === 'decision') {
      for (const [key, label, max] of [['title', 'Decision title', 180], ['question', 'Decision question', 1000]]) {
        const result = validateTemplate(row[key], label, max);
        if (!result.ok) return result;
        action[key] = result.value;
      }
    } else if (row.type === 'delegation') {
      for (const [key, label, max] of [['title', 'Task title', 180], ['outcome', 'Expected outcome', 1000]]) {
        const result = validateTemplate(row[key], label, max);
        if (!result.ok) return result;
        action[key] = result.value;
      }
      if (!['recommend', 'agree', 'act-inform', 'own'].includes(row.authority)) return { ok: false, error: 'Choose an explicit authority level.' };
      action.authority = row.authority;
    } else if (row.type === 'coaching') {
      const result = validateTemplate(row.text, 'Coaching prompt', 155);
      if (!result.ok) return result;
      action.text = result.value;
    } else if (row.type === 'premise') {
      for (const [key, label] of [['statement', 'Assumption'], ['signpost', 'Signpost']]) {
        const result = validateTemplate(row[key], label, key === 'statement' ? 900 : 500);
        if (!result.ok) return result;
        action[key] = result.value;
      }
      if (!integer(row.priorPct, 5, 95)) return { ok: false, error: 'An assumption prior must be a whole percentage from 5 to 95.' };
      action.priorPct = Number(row.priorPct);
      if (!integer(row.reviewDays, 1, 90)) return { ok: false, error: 'Review the assumption within 1–90 days.' };
      action.reviewDays = Number(row.reviewDays);
    }
    if (['decision', 'delegation'].includes(row.type)) {
      if (!integer(row.dueDays, 1, 90)) return { ok: false, error: 'Action due dates must be 1–90 days from the triggering event.' };
      action.dueDays = Number(row.dueDays);
    }
    actions.push(action);
  }
  return { ok: true, value: actions };
}

export function normalizePolicyPayload(raw, state, existing = null) {
  if (!object(raw)) return { ok: false, error: 'An operating agreement needs a definition.' };
  const name = text(raw.name, 120);
  if (!name) return { ok: false, error: 'Name this operating agreement.' };
  const source = AUTOPILOT_SOURCE_BY_ID[raw.sourceType];
  if (!source) return { ok: false, error: 'Choose a source module.' };
  if (!source.events.includes(raw.trigger)) return { ok: false, error: 'Choose an event belonging to that source module.' };
  const conditions = validateConditions(raw.conditions ?? [], source.id);
  if (!conditions.ok) return conditions;
  const actions = validateActions(raw.actions, source.id);
  if (!actions.ok) return actions;
  for (const action of actions.value) {
    if (action.ownerMode === 'fixed' && !(state.people || []).some((p) => p.id === action.ownerId && p.status !== 'archived')) return { ok: false, error: 'The named action owner is not an active person in this workspace.' };
  }
  if (!integer(raw.maxRuns, 1, 100)) return { ok: false, error: 'The activation budget must be 1–100 matched events.' };
  return { ok: true, value: {
    id: existing?.id || '', name, purpose: text(raw.purpose, 600), sourceType: source.id,
    trigger: raw.trigger, conditions: conditions.value, actions: actions.value,
    maxRuns: Number(raw.maxRuns), version: existing ? existing.version + 1 : 1,
    status: 'draft', runCount: existing?.runCount || 0, activationRunCount: 0,
    processedKeys: existing?.processedKeys || [], history: existing?.history || [],
    createdAt: existing?.createdAt || '', updatedAt: '', activatedAt: null,
    rehearsalToken: null, pausedReason: '',
  } };
}

export function normalizeAutopilotPolicies(raw, state, now, warnings) {
  if (!Array.isArray(raw)) { if (raw !== undefined) warnings.push('Autopilot: invalid policy collection replaced by an empty list.'); return []; }
  const seen = new Set();
  let activeCount = 0;
  const out = [];
  for (const item of raw.slice(0, AUTOPILOT_LIMITS.policies)) {
    if (!object(item) || !text(item.id, 120) || seen.has(item.id)) { warnings.push('Autopilot: dropped an invalid or duplicate agreement.'); continue; }
    const result = normalizePolicyPayload(item, state, null);
    if (!result.ok) { warnings.push(`Autopilot: dropped an invalid agreement: ${result.error}`); continue; }
    const policy = { ...result.value, id: text(item.id, 120) };
    policy.version = integer(item.version, 1, 100000) ? Number(item.version) : 1;
    policy.runCount = integer(item.runCount, 0, AUTOPILOT_LIMITS.lifetimeRuns) ? Number(item.runCount) : AUTOPILOT_LIMITS.lifetimeRuns;
    policy.activationRunCount = integer(item.activationRunCount, 0, policy.maxRuns) ? Number(item.activationRunCount) : policy.maxRuns;
    policy.processedKeys = [...new Set((Array.isArray(item.processedKeys) ? item.processedKeys : []).filter((k) => typeof k === 'string' && /^[a-zA-Z0-9:._-]{1,200}$/.test(k)))].slice(0, AUTOPILOT_LIMITS.lifetimeRuns);
    policy.createdAt = stamp(item.createdAt, now); policy.updatedAt = stamp(item.updatedAt, policy.createdAt);
    policy.activatedAt = stamp(item.activatedAt, null);
    policy.rehearsalToken = text(item.rehearsalToken, 80) || null;
    policy.pausedReason = text(item.pausedReason, 300);
    policy.history = (Array.isArray(item.history) ? item.history : []).filter(object).slice(-60).map((h) => ({ at: stamp(h.at, now), type: text(h.type, 40), summary: text(h.summary, 300) }));
    policy.status = POLICY_STATUSES.includes(item.status) ? item.status : 'paused';
    if (policy.status === 'active') {
      activeCount += 1;
      const referencedOwnerMissing = policy.actions.some((a) => a.ownerMode === 'fixed' && !(state.people || []).some((p) => p.id === a.ownerId && p.status !== 'archived'));
      if (referencedOwnerMissing || !policy.rehearsalToken || !policy.activatedAt || policy.runCount >= AUTOPILOT_LIMITS.lifetimeRuns || policy.activationRunCount >= policy.maxRuns || activeCount > AUTOPILOT_LIMITS.active || item.status !== 'active') {
        policy.status = 'paused'; policy.pausedReason = 'The stored approval, owner, or execution budget is no longer valid. Rehearse and reactivate.';
        warnings.push(`Autopilot: paused “${policy.name}” because its activation contract could not be verified.`);
      }
    }
    seen.add(policy.id); out.push(policy);
  }
  if (raw.length > AUTOPILOT_LIMITS.policies) warnings.push(`Autopilot: only the first ${AUTOPILOT_LIMITS.policies} agreements were loaded.`);
  return out;
}

export function normalizeAutopilotRuns(raw, state, now, warnings) {
  if (!Array.isArray(raw)) return [];
  const policies = new Map((state.autopilotPolicies || []).map((p) => [p.id, p]));
  const sourceIds = new Map(Object.values(AUTOPILOT_SOURCE_BY_ID).map((s) => [s.id, new Set((state[s.collection] || []).map((r) => r.id))]));
  const seen = new Set();
  const out = [];
  for (const row of raw.slice(-AUTOPILOT_LIMITS.runs)) {
    if (!object(row) || !policies.has(row.policyId) || !sourceIds.get(row.sourceType)?.has(row.sourceId) || !/^[a-zA-Z0-9:._-]{1,200}$/.test(text(row.key, 201)) || seen.has(row.key)) continue;
    const actions = (Array.isArray(row.actions) ? row.actions : []).filter(object).slice(0, 20).map((a) => ({
      type: AUTOPILOT_ACTIONS.find((spec) => spec.id === a.type)?.id || 'unknown',
      targetType: text(a.targetType, 40), targetId: text(a.targetId, 120),
      status: ['created', 'reused', 'blocked'].includes(a.status) ? a.status : 'blocked', reason: text(a.reason, 200),
    }));
    out.push({ id: text(row.id, 120) || `aprun-${out.length}`, key: row.key, policyId: row.policyId,
      policyVersion: integer(row.policyVersion, 1, 100000) ? Number(row.policyVersion) : 1,
      sourceType: row.sourceType, sourceId: row.sourceId, trigger: text(row.trigger, 60),
      at: stamp(row.at, now), status: ['applied', 'reused', 'blocked'].includes(row.status) ? row.status : 'blocked', actions });
    seen.add(row.key);
  }
  return out;
}
