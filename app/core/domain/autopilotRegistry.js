/**
 * LeadOS Autopilot — declarative source/action vocabulary.
 *
 * This is a registry, not module-to-module glue. Adding a source adapter exposes
 * its events and typed facts to the same condition compiler, rehearsal planner,
 * transaction executor and audit ledger. No eval, arbitrary property paths,
 * network requests, or executable user-supplied code.
 */
import { dayKey, daysBetween } from '../time.js';
import { computeFmea, computePertImpact, isFmeaRated } from './cases.js';
import { goalPace } from './goals.js';

export const AUTOPILOT_VERSION = 'autopilot-2026.10-v1';
export const AUTOPILOT_LIMITS = Object.freeze({ policies: 40, conditions: 6, actions: 5, active: 12, rehearsalRecords: 100, runs: 400, lifetimeRuns: 200, newRecordsPerEvent: 24 });
export const AUTOPILOT_EVENTS = Object.freeze([
  'case.created', 'case.updated', 'case.resolved', 'case.reopened',
  'decision.created', 'decision.updated', 'decision.decided',
  'delegation.created', 'delegation.checkin', 'delegation.completed', 'delegation.returned',
  'goal.created', 'goal.updated', 'goal.checkin',
]);
const COMMON_FIELDS = [
  { id: 'title', label: 'Title', type: 'text' },
  { id: 'hasOwner', label: 'Has an active owner', type: 'boolean' },
  { id: 'ageDays', label: 'Age in days', type: 'number', min: 0, max: 36500 },
];
export const AUTOPILOT_SOURCES = Object.freeze([
  {
    id: 'case', label: 'Operational case', collection: 'cases', route: '#/cases',
    events: AUTOPILOT_EVENTS.filter((e) => e.startsWith('case.')),
    fields: [...COMMON_FIELDS,
      { id: 'kind', label: 'Case type', type: 'enum', values: ['incident', 'risk', 'initiative', 'escalation'] },
      { id: 'status', label: 'Status', type: 'enum', values: ['open', 'mitigating', 'monitoring', 'resolved', 'closed'] },
      { id: 'severity', label: 'FMEA severity (1–10)', type: 'number', min: 1, max: 10 },
      { id: 'actionPriority', label: 'FMEA action priority', type: 'enum', values: ['high', 'medium', 'low'] },
      { id: 'exposure', label: 'PERT expected cost (record currency)', type: 'number', min: 0, max: 1e12 },
      { id: 'stakeholderCount', label: 'Recorded stakeholders', type: 'number', min: 0, max: 1000 },
    ],
    facts(record, state, now) {
      const fmea = computeFmea(record.fmea);
      const pert = computePertImpact(record.financial, record.fmea);
      return {
        kind: record.kind, status: record.status,
        severity: isFmeaRated(record.fmea) ? fmea.severity : null,
        actionPriority: isFmeaRated(record.fmea) ? fmea.actionPriority : null,
        exposure: pert.cost.measured ? pert.cost.expected : null,
        currency: pert.currency,
        stakeholderCount: (record.stakeholders || []).length,
        ownerId: record.ownerId || null,
        dueOn: record.reviewOn || null,
        openedOn: record.openedOn || String(record.createdAt || '').slice(0, 10),
      };
    },
  },
  {
    id: 'decision', label: 'Decision', collection: 'decisions', route: '#/decisions',
    events: AUTOPILOT_EVENTS.filter((e) => e.startsWith('decision.')),
    fields: [...COMMON_FIELDS,
      { id: 'status', label: 'Decision state', type: 'enum', values: ['open', 'decided'] },
      { id: 'reversibility', label: 'Reversibility', type: 'enum', values: ['reversible', 'irreversible'] },
      { id: 'optionCount', label: 'Number of options', type: 'number', min: 0, max: 100 },
    ],
    facts(record) {
      return { status: record.chosen ? 'decided' : 'open', reversibility: record.reversibility,
        optionCount: (record.options || []).length, ownerId: null,
        dueOn: record.reviewOn || null, openedOn: record.date || String(record.createdAt || '').slice(0, 10) };
    },
  },
  {
    id: 'delegation', label: 'Delegation', collection: 'delegations', route: '#/delegations',
    events: AUTOPILOT_EVENTS.filter((e) => e.startsWith('delegation.')),
    fields: [...COMMON_FIELDS,
      { id: 'status', label: 'Status', type: 'enum', values: ['active', 'done', 'returned'] },
      { id: 'authority', label: 'Authority level', type: 'enum', values: ['recommend', 'agree', 'act-inform', 'own'] },
      { id: 'overdue', label: 'Past its due date and still active', type: 'boolean' },
    ],
    facts(record, state, now) {
      return { status: record.status, authority: record.authority,
        overdue: record.status === 'active' && Boolean(record.dueOn && record.dueOn < dayKey(now)),
        ownerId: record.personId || null, dueOn: record.dueOn || null, openedOn: record.delegatedOn || null };
    },
  },
  {
    id: 'goal', label: 'Goal / OKR', collection: 'goals', route: '#/goals',
    events: AUTOPILOT_EVENTS.filter((e) => e.startsWith('goal.')),
    fields: [...COMMON_FIELDS,
      { id: 'status', label: 'Status', type: 'enum', values: ['active', 'done', 'dropped'] },
      { id: 'confidence', label: 'Recorded confidence', type: 'enum', values: ['on-track', 'at-risk', 'off-track'] },
      { id: 'progressPct', label: 'Measured key-result progress (%)', type: 'number', min: 0, max: 100 },
      { id: 'paceGap', label: 'Progress minus expected pace (pp)', type: 'number', min: -100, max: 100 },
    ],
    facts(record, state, now) {
      const pace = goalPace(record, now);
      return { status: record.status, confidence: record.confidence, progressPct: pace.progressPct,
        paceGap: pace.progressPct !== null && pace.expectedPct !== null ? pace.progressPct - pace.expectedPct : null,
        ownerId: record.ownerId || null, dueOn: record.dueDate || null,
        openedOn: String(record.createdAt || '').slice(0, 10) || null };
    },
  },
]);
export const AUTOPILOT_SOURCE_BY_ID = Object.freeze(Object.fromEntries(AUTOPILOT_SOURCES.map((s) => [s.id, s])));
export const AUTOPILOT_OPERATORS = Object.freeze({
  number: [{ id: 'gte', label: 'is at least' }, { id: 'lte', label: 'is at most' }, { id: 'eq', label: 'equals' }],
  text: [{ id: 'contains', label: 'contains' }, { id: 'eq', label: 'equals' }],
  enum: [{ id: 'eq', label: 'is' }, { id: 'neq', label: 'is not' }],
  boolean: [{ id: 'eq', label: 'is' }],
});
export const AUTOPILOT_ACTIONS = Object.freeze([
  { id: 'decision', label: 'Open a DACI decision', target: 'decision', route: '#/decisions', description: 'A human choice with options and a review date. Never selects an option.' },
  { id: 'delegation', label: 'Assign owned work', target: 'delegation', route: '#/delegations', description: 'An explicit owner, outcome, authority and due date. Never guesses an owner.' },
  { id: 'coaching', label: 'Prepare a blameless 1:1', target: 'person', route: '#/oneonones', description: 'A support prompt, not a performance rating or a message sent to a person.' },
  { id: 'premise', label: 'Register a testable assumption', target: 'premise', route: '#/premises', description: 'A declared prior and signpost connected to the source. Not inferred evidence.' },
  { id: 'comms', label: 'Ensure stakeholder briefs', target: 'comms', route: '#/comms', description: 'Reuse the communications engine for key or opposing case stakeholders. Drafts only; never sends.' },
]);
export const AUTOPILOT_ACTION_BY_ID = Object.freeze(Object.fromEntries(AUTOPILOT_ACTIONS.map((a) => [a.id, a])));
export const AUTOPILOT_TOKENS = Object.freeze(['title', 'owner', 'source', 'date', 'due', 'exposure', 'currency']);

export function sourceForEvent(type) {
  return AUTOPILOT_SOURCES.find((source) => source.events.includes(type)) || null;
}
export function sourceRecord(state, sourceType, id) {
  const source = AUTOPILOT_SOURCE_BY_ID[sourceType];
  return source ? (state[source.collection] || []).find((r) => r && r.id === id) || null : null;
}
export function sourceFacts(state, sourceType, record, now) {
  const source = AUTOPILOT_SOURCE_BY_ID[sourceType];
  if (!source || !record) return null;
  const base = source.facts(record, state, now);
  const owner = (state.people || []).find((p) => p.id === base.ownerId && p.status !== 'archived');
  const ageDays = base.openedOn ? daysBetween(base.openedOn, dayKey(now)) : null;
  return { ...base, title: String(record.title || ''), ownerId: owner?.id || null,
    owner: owner?.name || 'Unassigned', hasOwner: Boolean(owner),
    ageDays: ageDays === null ? null : Math.max(0, ageDays), source: source.label };
}
export function defaultCondition(sourceType = 'case') {
  const source = AUTOPILOT_SOURCE_BY_ID[sourceType] || AUTOPILOT_SOURCES[0];
  const field = source.fields.find((f) => f.id === 'status') || source.fields[0];
  return { field: field.id, op: 'eq', value: field.values?.[0] ?? (field.type === 'boolean' ? true : field.type === 'number' ? 0 : '') };
}
export function defaultAction(type = 'delegation') {
  const common = { id: type, type, ownerMode: 'source', ownerId: '' };
  if (type === 'decision') return { id: type, type, title: 'Review: {{title}}', question: 'What should we do about {{title}}, and what evidence would change our mind?', dueDays: 7 };
  if (type === 'delegation') return { ...common, title: 'Follow through: {{title}}', outcome: 'Agree the next action for {{title}} with {{owner}} and record the result.', authority: 'recommend', dueDays: 3 };
  if (type === 'coaching') return { ...common, text: 'Ask {{owner}} what support would help with {{title}}. Discuss the system, not blame.' };
  if (type === 'premise') return { ...common, statement: 'The response to {{title}} will resolve the underlying constraint.', signpost: 'Review the source record and record dated evidence for or against this assumption.', priorPct: 70, reviewDays: 14 };
  return { id: type, type, audience: 'key' };
}
