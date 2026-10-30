/**
 * Autopilot Studio — governed operating agreements, not an autonomous manager.
 *
 * The same pure executor powers rehearsal and the post-commit rule. Rehearsal
 * mutates a disposable copy only. Activation binds a human approval to a digest
 * of the definition, workspace revision and current-state rehearsal. A run is
 * all-or-nothing inside the enclosing store transaction; the shared rule spine
 * supplies savepoints, lineage and failure receipts.
 *
 * Frameworks: management by exception; Deming PDCA; RAND assumption-based
 * planning; DACI; Mendelow audience selection; explicit authority delegation.
 * Threshold sensitivity is a policy stress test, NOT a forecast or backtest.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { commsRule } from './comms.js';
import {
  AUTOPILOT_LIMITS, AUTOPILOT_SOURCE_BY_ID, AUTOPILOT_ACTION_BY_ID,
  AUTOPILOT_SOURCES, defaultAction, defaultCondition, sourceForEvent, sourceFacts, sourceRecord,
} from './autopilotRegistry.js';

export const AUTOPILOT_SCAN_EVENT = 'autopilot.scan';
const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const definition = (p) => ({ name: p.name, purpose: p.purpose, sourceType: p.sourceType, trigger: p.trigger, conditions: p.conditions, actions: p.actions, maxRuns: p.maxRuns, version: p.version });

/** Non-cryptographic content digest; an optimistic approval token, not a signature. */
export function digest(value) {
  const text = JSON.stringify(value);
  let a = 0x811c9dc5; let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) { a = Math.imul(a ^ text.charCodeAt(i), 0x01000193); b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
const norm = (v) => String(v).normalize('NFKC').toLocaleLowerCase('en-US').trim();
export function compareCondition(facts, condition) {
  const actual = facts?.[condition.field];
  const expected = condition.value;
  let pass = false;
  if (condition.op === 'eq') pass = typeof expected === 'string' ? norm(actual ?? '') === norm(expected) : actual === expected;
  else if (actual !== null && actual !== undefined) {
    if (condition.op === 'neq') pass = norm(actual) !== norm(expected);
    if (condition.op === 'contains') pass = norm(actual).includes(norm(expected));
    if (condition.op === 'gte') pass = Number(actual) >= Number(expected);
    if (condition.op === 'lte') pass = Number(actual) <= Number(expected);
  }
  return { ...condition, actual: actual ?? null, pass: Boolean(pass), reason: actual === null || actual === undefined ? 'Not recorded; this condition does not match.' : pass ? 'Recorded fact matches.' : 'Recorded fact does not match.' };
}
export function evaluatePolicy(policy, state, record, now) {
  const facts = sourceFacts(state, policy.sourceType, record, now);
  const conditions = (policy.conditions || []).map((c) => compareCondition(facts, c));
  const paused = record?.autoPropagate === false;
  return { facts, conditions, matched: !paused && conditions.every((c) => c.pass), paused };
}
function tokens(facts, now) {
  return { title: facts.title, owner: facts.owner, source: facts.source, date: dayKey(now), due: facts.dueOn || 'not recorded',
    exposure: facts.exposure === null || facts.exposure === undefined ? 'not recorded' : String(facts.exposure), currency: facts.currency || '' };
}
function render(template, facts, now) {
  const values = tokens(facts, now);
  return String(template).replace(/\{\{([a-z]+)\}\}/g, (_, key) => values[key] ?? '');
}
function actionOwner(action, facts, state) {
  const id = action.ownerMode === 'fixed' ? action.ownerId : facts.ownerId;
  return (state.people || []).find((p) => p.id === id && p.status !== 'archived') || null;
}
/**
 * Desired-state marker: one record per (agreement, version, source record,
 * action) — stable across re-fires. The run key (with its facts digest) lives
 * in processedKeys and decides whether a re-fire opens a new run at all; the
 * marker decides whether that run creates or reuses. Changed facts therefore
 * open a new run that reuses the existing response instead of copying it, and
 * a new agreement version starts fresh. Short by construction: talking points
 * are sliced to 200 characters, so a marker that could be truncated would
 * silently break reuse.
 */
function stableToken(policy, record, type) {
  return `[AP:${digest(`${policy.id}|v${policy.version}|${record.id}`).slice(0, 10)}:${type}]`;
}
function hasMarker(rows, field, token) { return (rows || []).find((r) => typeof r?.[field] === 'string' && r[field].includes(token)) || null; }
function link(ctx, draft, policy, sourceType, sourceId, targetType, targetId, relation) {
  ensureEntityLink(draft, { sourceType: 'autopilot', sourceId: policy.id, targetType, targetId, relation: 'automates', ruleId: `RULE-AP-01:${policy.id}`, summary: `Version ${policy.version} operating agreement.` }, ctx);
  ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId: `RULE-AP-01:${policy.id}`, summary: 'Created or reused by a human-approved operating agreement.' }, ctx);
}
function result(type, status, targetId, reason = '', targetType = AUTOPILOT_ACTION_BY_ID[type]?.target) {
  return { type, status, targetType: targetType || '', targetId: targetId || '', reason };
}

/** Prepare every action before writing anything. Missing owners never get guessed. */
export function planActions(policy, state, record, now) {
  const { facts } = evaluatePolicy(policy, state, record, now);
  if (!facts) return { ok: false, error: 'The source record no longer exists.', actions: [] };
  const actions = [];
  for (const action of policy.actions) {
    const owner = action.type === 'comms' || action.type === 'decision' ? null : actionOwner(action, facts, state);
    if (action.ownerMode && !owner) return { ok: false, error: `${AUTOPILOT_ACTION_BY_ID[action.type].label} has no active owner. Assign the source owner or edit the agreement to name someone.`, actions };
    const resolved = { ...action, resolvedOwnerId: owner?.id || null };
    for (const key of ['title', 'question', 'outcome', 'text', 'statement', 'signpost']) if (action[key]) resolved[key] = clean(render(action[key], facts, now), key === 'title' ? 180 : key === 'text' ? 155 : 1000);
    if (action.type === 'comms' && !(record.stakeholders || []).length) return { ok: false, error: 'The case has no stakeholders to brief. Add a stakeholder or remove the briefing action.', actions };
    actions.push(resolved);
  }
  return { ok: true, actions, facts };
}

function executeAction(draft, policy, sourceType, record, action, key, ctx) {
  const token = stableToken(policy, record, action.type);
  const nowIso = ctx.now.toISOString();
  const base = { id: ctx.idFactory('ap'), createdAt: nowIso, updatedAt: nowIso };
  if (action.type === 'decision') {
    const existing = hasMarker(draft.decisions, 'rationale', token);
    if (existing) return result(action.type, 'reused', existing.id);
    const decision = { ...base, id: ctx.idFactory('dec'), title: action.title, question: action.question,
      date: ctx.todayStr, reversibility: 'reversible', driver: clean(draft.settings?.leaderName, 120), approver: '', contributors: '', informed: '',
      options: [
        { id: ctx.idFactory('opt'), label: 'Proceed with a bounded response', pros: 'Acts within an explicit scope.', cons: 'Commits resources before further evidence.' },
        { id: ctx.idFactory('opt'), label: 'Gather evidence first', pros: 'Reduces uncertainty before committing.', cons: 'Waiting has a cost and may close options.' },
        { id: ctx.idFactory('opt'), label: 'Defer with a dated review', pros: 'Makes the tradeoff visible.', cons: 'The underlying issue may worsen.' },
      ], chosen: '', rationale: `${token} Operating agreement: ${policy.name}. A person must choose an option.`,
      reviewOn: addDays(ctx.todayStr, action.dueDays), reviewedOn: null, outcome: 'pending', outcomeNotes: '', forecastProbability: null, decidedOn: null };
    draft.decisions.push(decision);
    link(ctx, draft, policy, sourceType, record.id, 'decision', decision.id, 'decides');
    return result(action.type, 'created', decision.id);
  }
  if (action.type === 'delegation') {
    const existing = hasMarker(draft.delegations, 'support', token);
    if (existing) return result(action.type, 'reused', existing.id);
    const task = { ...base, id: ctx.idFactory('del'), personId: action.resolvedOwnerId, title: action.title,
      expectedOutcome: action.outcome, authority: action.authority,
      support: `${token} Discuss scope and support at the next check-in. Escalate anything outside this authority.`,
      delegatedOn: ctx.todayStr, dueOn: addDays(ctx.todayStr, action.dueDays), status: 'active', checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '' };
    draft.delegations.push(task);
    link(ctx, draft, policy, sourceType, record.id, 'delegation', task.id, 'tracks-followup');
    return result(action.type, 'created', task.id);
  }
  if (action.type === 'coaching') {
    const person = draft.people.find((p) => p.id === action.resolvedOwnerId);
    if (person.talkingPoints.some((t) => t.includes(token))) return result(action.type, 'reused', person.id);
    if (person.talkingPoints.length >= 12) return result(action.type, 'blocked', person.id, 'The 1:1 prompt queue is full; existing prompts were not overwritten.');
    person.talkingPoints.push(`${action.text} ${token}`.slice(0, 200));
    link(ctx, draft, policy, sourceType, record.id, 'person', person.id, 'coaches');
    return result(action.type, 'created', person.id);
  }
  if (action.type === 'premise') {
    const existing = (draft.premises || []).find((p) => p.history?.some((h) => h.summary?.includes(token)));
    if (existing) return result(action.type, 'reused', existing.id);
    const premise = { ...base, id: ctx.idFactory('prem'), title: `Assumption: ${record.title}`.slice(0, 160),
      statement: action.statement, signpost: action.signpost, decisionId: null,
      ownerId: action.resolvedOwnerId, criticality: 'major', priorPct: action.priorPct,
      watchPct: Math.min(55, action.priorPct - 5), breachPct: Math.min(30, action.priorPct - 10), halfLifeDays: 90,
      reviewBy: addDays(ctx.todayStr, action.reviewDays), lastReviewedOn: null, acknowledgedOn: null, acknowledgedAt: null, humanDisposition: null,
      sourceRefs: [{ sourceType, sourceId: record.id }], observations: [],
      history: [{ at: nowIso, type: 'registered', summary: `${token} Declared by an operating agreement; the prior is an assumption, not evidence.` }],
      status: 'unobserved', reviewCycle: 0, posteriorPct: null, logBayesFactor: 0, autoPropagate: true };
    draft.premises.push(premise);
    link(ctx, draft, policy, sourceType, record.id, 'premise', premise.id, 'tests');
    return result(action.type, 'created', premise.id);
  }
  if (action.type === 'comms') {
    // Reuse the production communications compiler, including its approval gate,
    // factual basis fingerprints and supersession logic. Never send a message.
    const effects = commsRule(draft, { ...ctx, event: { type: 'case.updated', entity: 'case', entityId: record.id } });
    if (!effects.length) {
      const existing = (draft.commsDrafts || []).filter((d) => d.caseId === record.id && ['draft', 'approved'].includes(d.status));
      return existing.length ? result(action.type, 'reused', existing[0].id) : result(action.type, 'blocked', '', 'No key or opposing stakeholder is in the briefing audience.');
    }
    for (const effect of effects) if (effect.targetId) link(ctx, draft, policy, sourceType, record.id, 'comms', effect.targetId, 'communicates');
    return effects.map((e) => result(action.type, e.action === 'drafted' ? 'created' : 'reused', e.targetId));
  }
  throw new Error(`Unsupported action: ${action.type}`);
}

function appendRun(draft, run) {
  draft.autopilotRuns = Array.isArray(draft.autopilotRuns) ? draft.autopilotRuns : [];
  draft.autopilotRuns.push(run);
  if (draft.autopilotRuns.length > AUTOPILOT_LIMITS.runs) draft.autopilotRuns.splice(0, draft.autopilotRuns.length - AUTOPILOT_LIMITS.runs);
}
function history(policy, ctx, type, summary) {
  policy.history.push({ at: ctx.now.toISOString(), type, summary: clean(summary, 300) });
  if (policy.history.length > 60) policy.history.splice(0, policy.history.length - 60);
}

/** Shared by the dry-run and real transaction. No storage or DOM dependency. */
export function executePolicy(draft, policy, record, trigger, ctx, { rehearsal = false } = {}) {
  const evaluation = evaluatePolicy(policy, draft, record, ctx.now);
  if (!evaluation.matched) return null;
  const plan = planActions(policy, draft, record, ctx.now);
  const factsDigest = digest({ facts: evaluation.facts, actions: policy.actions, version: policy.version });
  const key = `ap:${policy.id}:v${policy.version}:${policy.sourceType}:${record.id}:${factsDigest}`;
  if (policy.processedKeys.includes(key)) return { key, status: 'reused', actions: [] };
  if (!plan.ok) {
    policy.processedKeys.push(key); policy.runCount += 1; policy.activationRunCount += 1;
    if (!rehearsal) { policy.status = 'paused'; policy.pausedReason = plan.error; history(policy, ctx, 'blocked', plan.error); }
    appendRun(draft, { id: ctx.idFactory('aprun'), key, policyId: policy.id, policyVersion: policy.version, sourceType: policy.sourceType, sourceId: record.id, trigger, at: ctx.now.toISOString(), status: 'blocked', actions: [result('unknown', 'blocked', '', plan.error, policy.sourceType)] });
    return { key, status: 'blocked', actions: [], error: plan.error };
  }
  // Coaching capacity is a preflight too: do not create half an agreement and
  // then discover that its last prompt cannot fit. A refusal is still a run —
  // the ledger records it and the agreement pauses, exactly like any other
  // plan failure, so the event is never silently lost.
  for (const action of plan.actions) {
    if (action.type !== 'coaching') continue;
    const person = draft.people.find((p) => p.id === action.resolvedOwnerId);
    const token = stableToken(policy, record, action.type);
    if (person.talkingPoints.length >= 12 && !person.talkingPoints.some((t) => t.includes(token))) {
      const error = 'The 1:1 prompt queue is full. Clear a prompt before retrying this event.';
      policy.processedKeys.push(key); policy.runCount += 1; policy.activationRunCount += 1;
      if (!rehearsal) { policy.status = 'paused'; policy.pausedReason = error; history(policy, ctx, 'blocked', error); }
      const blocked = [result('coaching', 'blocked', person.id, error)];
      appendRun(draft, { id: ctx.idFactory('aprun'), key, policyId: policy.id, policyVersion: policy.version, sourceType: policy.sourceType, sourceId: record.id, trigger, at: ctx.now.toISOString(), status: 'blocked', actions: blocked });
      return { key, status: 'blocked', actions: blocked, error };
    }
  }
  const actions = plan.actions.flatMap((action) => executeAction(draft, policy, policy.sourceType, record, action, key, ctx));
  // Join the run's premise to the run's decision, if this agreement created
  // both. The premise rule validates decisionId against the decisions table,
  // so the join must reference the created record, not the plan config.
  const decisionTarget = actions.find((a) => a.type === 'decision' && a.targetId)?.targetId || null;
  const premiseTarget = actions.find((a) => a.type === 'premise' && a.status === 'created')?.targetId || null;
  if (decisionTarget && premiseTarget) {
    const premise = (draft.premises || []).find((row) => row && row.id === premiseTarget);
    if (premise) premise.decisionId = decisionTarget;
  }
  const blocked = actions.filter((a) => a.status === 'blocked');
  if (blocked.length) throw new Error(blocked.map((a) => a.reason).join(' '));
  const status = actions.some((a) => a.status === 'created') ? 'applied' : 'reused';
  policy.processedKeys.push(key); policy.runCount += 1; policy.activationRunCount += 1;
  if (policy.processedKeys.length > AUTOPILOT_LIMITS.lifetimeRuns || policy.activationRunCount >= policy.maxRuns) {
    if (!rehearsal) { policy.status = 'paused'; policy.pausedReason = 'Execution budget reached. Rehearse and explicitly reactivate to continue.'; history(policy, ctx, 'budget-paused', policy.pausedReason); }
  }
  appendRun(draft, { id: ctx.idFactory('aprun'), key, policyId: policy.id, policyVersion: policy.version, sourceType: policy.sourceType, sourceId: record.id, trigger, at: ctx.now.toISOString(), status, actions });
  if (!rehearsal) history(policy, ctx, 'executed', `${status}: ${actions.length} action(s) for ${record.title}`);
  return { key, status, actions };
}

export function autopilotRule(draft, ctx) {
  const event = ctx.event;
  const source = sourceForEvent(event?.type);
  if (!source || !event.entityId) return [];
  const record = sourceRecord(draft, source.id, event.entityId);
  if (!record || record.autoPropagate === false) return [];
  // A policy's own output must not start another policy. This deliberately
  // prevents cascading policy loops; built-in domain rules still receive the
  // created-record events and may perform their normal documented propagation.
  if (ctx.derived && (draft.links || []).some((l) => l.sourceType === 'autopilot' && l.targetType === source.id && l.targetId === record.id && l.relation === 'automates')) return [];
  const matched = (draft.autopilotPolicies || []).filter((p) => p.status === 'active' && p.trigger === event.type && evaluatePolicy(p, draft, record, ctx.now).matched);
  if (!matched.length) return [];
  // Preflight the whole batch on a disposable draft. An oversized batch rolls
  // back all custom actions rather than silently executing an arbitrary prefix.
  // The preflight context carries no logger: a dry run must not write audit
  // events into the real transaction it is previewing.
  const preview = clone(draft);
  const preflightCtx = { ...ctx, logEvent: null };
  let newRecords = 0;
  for (const policy of preview.autopilotPolicies.filter((p) => matched.some((m) => m.id === p.id))) {
    const run = executePolicy(preview, policy, preview[source.collection].find((r) => r.id === record.id), event.type, preflightCtx, { rehearsal: true });
    newRecords += (run?.actions || []).filter((a) => a.status === 'created').length;
  }
  if (newRecords > AUTOPILOT_LIMITS.newRecordsPerEvent) throw new Error(`This event would create ${newRecords} records, above the ${AUTOPILOT_LIMITS.newRecordsPerEvent}-record safety ceiling. Pause an agreement or narrow its conditions; no custom action was applied.`);
  const out = [];
  for (const policy of matched) {
    const run = executePolicy(draft, policy, record, event.type, ctx);
    if (!run || run.status === 'reused' && !run.actions.length) continue;
    out.push({ ruleId: 'RULE-AP-01', action: run.status, targetType: 'autopilot', targetId: policy.id, summary: `${policy.name}: ${run.status}${run.error ? ` — ${run.error}` : ''}` });
    for (const action of run.actions) out.push({ ...action, ruleId: 'RULE-AP-01', action: `${action.type}.${action.status}` });
    if (typeof ctx.logEvent === 'function') ctx.logEvent({ type: 'autopilot.executed', entity: 'autopilot', entityId: policy.id, summary: `${policy.name} v${policy.version}: ${run.status} on ${source.label} ${record.id}.` });
  }
  return out;
}

/** Exact current-state rehearsal. This is not a historical replay or a forecast. */
export function rehearsePolicy(state, policy, now = new Date()) {
  const draft = clone(state);
  const source = AUTOPILOT_SOURCE_BY_ID[policy.sourceType];
  const records = [...(draft[source.collection] || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const candidate = { ...clone(policy), processedKeys: [], runCount: 0, activationRunCount: 0 };
  const rows = []; let sequence = 0; let omitted = Math.max(0, records.length - AUTOPILOT_LIMITS.rehearsalRecords);
  const ctx = { now, todayStr: dayKey(now), nowIso: now.toISOString(), idFactory: (prefix) => `${prefix}-rehearsal-${++sequence}` };
  for (const record of records.slice(0, AUTOPILOT_LIMITS.rehearsalRecords)) {
    const evaluation = evaluatePolicy(candidate, draft, record, now);
    const run = evaluation.matched ? executePolicy(draft, candidate, record, policy.trigger, ctx, { rehearsal: true }) : null;
    rows.push({ sourceId: record.id, title: record.title, matched: evaluation.matched, paused: evaluation.paused,
      conditions: evaluation.conditions, status: run?.status || 'skipped', actions: run?.actions || [], error: run?.error || null });
  }
  const matched = rows.filter((r) => r.matched);
  const actions = matched.flatMap((r) => r.actions);
  const blockers = rows.filter((r) => r.error || r.actions.some((a) => a.status === 'blocked'));
  const byTarget = {};
  for (const action of actions) byTarget[action.type] = (byTarget[action.type] || 0) + 1;
  const ownerLoads = {};
  matched.forEach((row) => {
    const record = records.find((r) => r.id === row.sourceId);
    for (const action of policy.actions) {
      if (!action.ownerMode || action.type === 'coaching') continue;
      const facts = sourceFacts(state, source.id, record, now);
      const ownerId = action.ownerMode === 'fixed' ? action.ownerId : facts.ownerId;
      if (ownerId) ownerLoads[ownerId] = (ownerLoads[ownerId] || 0) + 1;
    }
  });
  const stress = [];
  const numeric = policy.conditions.find((c) => typeof c.value === 'number');
  if (numeric) {
    for (const multiplier of [0.8, 1, 1.2]) {
      const variant = { ...policy, conditions: policy.conditions.map((c) => c === numeric ? { ...c, value: Math.round(c.value * multiplier * 100) / 100 } : c) };
      stress.push({ multiplier, threshold: variant.conditions.find((c) => c.field === numeric.field).value,
        matches: records.filter((r) => evaluatePolicy(variant, state, r, now).matched).length });
    }
  }
  const result = { policyId: policy.id, name: policy.name, version: policy.version, asOf: dayKey(now), workspaceRevision: state.meta?.revision || 0,
    examined: rows.length, totalRecords: records.length, omitted, matched: matched.length,
    created: actions.filter((a) => a.status === 'created').length, reused: actions.filter((a) => a.status === 'reused').length,
    blockers, byTarget, ownerLoads, stress, rows,
    caveat: 'Current records under a proposed agreement. Direct custom effects only; built-in module rules may add their normal effects at execution. Not a historical backtest, prediction, or measured time saving.' };
  return { ...result, token: digest({ definition: definition(policy), result: { ...result, token: undefined } }) };
}

export function activationGate(state, policy, token, now) {
  if (!policy || policy.status === 'retired') return { ok: false, error: 'This agreement is not available for activation.' };
  const rehearsal = rehearsePolicy(state, policy, now);
  if (token !== rehearsal.token) return { ok: false, error: 'The workspace or agreement changed since rehearsal. Run a fresh rehearsal before activating.', rehearsal };
  if (rehearsal.blockers.length) return { ok: false, error: 'Rehearsal found a blocked action. Repair the source or agreement before activation.', rehearsal };
  if (rehearsal.omitted) return { ok: false, error: `Rehearsal cannot cover all ${rehearsal.totalRecords} source records. Narrow the source population before activation.`, rehearsal };
  const active = (state.autopilotPolicies || []).filter((p) => p.status === 'active' && p.id !== policy.id).length;
  if (active >= AUTOPILOT_LIMITS.active) return { ok: false, error: `At most ${AUTOPILOT_LIMITS.active} agreements may be active. Pause one first.`, rehearsal };
  if (policy.runCount >= AUTOPILOT_LIMITS.lifetimeRuns) return { ok: false, error: 'This agreement reached its lifetime safety budget. Create a new agreement after reviewing its history.', rehearsal };
  return { ok: true, rehearsal };
}

export function autopilotAttentionCount(state) {
  const ids = new Set((state.autopilotPolicies || []).filter((p) => p.status === 'paused' && p.pausedReason).map((p) => p.id));
  for (const run of (state.autopilotRuns || []).slice(-50)) if (run.status === 'blocked') ids.add(run.policyId);
  return ids.size;
}
export function autopilotSignals(state) {
  const out = [];
  for (const policy of (state.autopilotPolicies || []).filter((p) => p.status === 'paused' && p.pausedReason)) {
    out.push({ ruleId: 'AP-01', domain: 'Autopilot', title: `${policy.name} is paused`, detail: policy.pausedReason,
      severity: 3, severityLabel: 'Review', confidence: 'high', evidence: [`${policy.runCount} matched event(s) recorded`, `Version ${policy.version}`], action: { label: 'Review agreement', route: `#/autopilot?policy=${encodeURIComponent(policy.id)}` } });
  }
  return out;
}
export function autopilotBrief(state, now = new Date()) {
  const policies = state.autopilotPolicies || [];
  const runs = state.autopilotRuns || [];
  return [
    'LEADOS — OPERATING AGREEMENTS', `As of ${dayKey(now)}`, '',
    `${policies.filter((p) => p.status === 'active').length} active agreements; ${runs.length} retained execution records.`,
    'A rule creates work and drafts; people retain ownership, authority and every consequential choice.',
    'No message is sent. No rating, pay, hiring or termination decision is automated.', '',
    ...policies.map((p) => `${p.name} · v${p.version} · ${p.status}\nWhen ${p.trigger}; ${p.conditions.length} condition(s), all must match.\nThen ${p.actions.map((a) => AUTOPILOT_ACTION_BY_ID[a.type]?.label || a.type).join('; ')}.\n${p.runCount} matched events. ${p.pausedReason || ''}\n`),
    'Execution counts are retained history (bounded), not a causal estimate of value or time saved.',
    'Rehearsal uses current records, not historical states. Review the execution ledger and source records before changing an agreement.',
  ].join('\n');
}
export function agreementTemplate(id = 'delay') {
  const base = { name: 'Production delay → coordinated response', purpose: 'Make a material delay trigger one accountable response across decisions, work, coaching, assumptions and stakeholder drafts.', sourceType: 'case', trigger: 'case.created', maxRuns: 25,
    conditions: [{ field: 'kind', op: 'eq', value: 'risk' }, { field: 'status', op: 'eq', value: 'open' }, { field: 'exposure', op: 'gte', value: 10000 }],
    actions: ['decision', 'delegation', 'coaching', 'premise', 'comms'].map(defaultAction) };
  if (id === 'completion') return { name: 'Completed work → learning loop', purpose: 'Turn completion into a dated learning conversation rather than another status report.', sourceType: 'delegation', trigger: 'delegation.completed', conditions: [{ field: 'status', op: 'eq', value: 'done' }], actions: [defaultAction('coaching'), defaultAction('decision')], maxRuns: 25 };
  if (id === 'goal') return { name: 'Off-track goal → evidence before escalation', purpose: 'Test the recovery assumption and agree an owned next move without changing a performance rating.', sourceType: 'goal', trigger: 'goal.checkin', conditions: [{ field: 'confidence', op: 'eq', value: 'off-track' }], actions: [defaultAction('premise'), defaultAction('delegation')], maxRuns: 25 };
  return base;
}
export function autopilotCoverage() {
  return AUTOPILOT_SOURCES.map((s) => ({ source: s.label, events: s.events.length, facts: s.fields.length }));
}
