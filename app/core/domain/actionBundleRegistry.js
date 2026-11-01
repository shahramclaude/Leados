/** Closed, reviewed command vocabulary. One adapter per module; no eval or arbitrary API names. */
import { addDays, dayKey } from '../time.js';

export const BUNDLE_LIMITS = Object.freeze({ commands: 8, bundles: 80, targets: 40, bytes: 8_000_000 });
export const BUNDLE_KINDS = Object.freeze(['decision', 'delegation', 'premise', 'budget', 'comms', 'coaching']);
export const BUNDLE_LABELS = Object.freeze({ decision: 'Governed decision', delegation: 'Owned work', premise: 'Testable assumption', budget: 'Budget commitment', comms: 'Stakeholder briefs', coaching: '1:1 coaching prompt' });
export const BUNDLE_EVENTS = Object.freeze({ CREATED: 'bundle.created', UPDATED: 'bundle.updated', REHEARSED: 'bundle.rehearsed', COMMITTED: 'bundle.committed', ARCHIVED: 'bundle.archived', WITHDRAWN: 'bundle.withdrawn', SCAN: 'bundle.scan' });
export const BUNDLE_RULES = Object.freeze({ LINK: 'RULE-BND-01', FOLLOWUP: 'RULE-BND-02', RECONCILE: 'RULE-BND-03' });
const text = (v, max = 1000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const activeOwner = (state, id) => (state.people || []).some((p) => p.id === id && p.status !== 'archived');
const need = (condition, error, field) => condition ? null : { ok: false, error, field };

/** The same registry drives validation, execution, target resolution and compensation. */
export const BUNDLE_ADAPTERS = Object.freeze({
  decision: {
    collection: 'decisions', type: 'decision', reversible: 'Remove only an untouched, unchosen decision',
    validate(a, s) { return need(text(a.title), 'Name the decision.', 'title'); },
    execute(a, api, s, now) { return api.addDecision({ title: a.title, question: text(a.question) || `What should we do about ${a.title}?`,
      date: dayKey(now), reviewOn: a.dueOn, reversibility: 'reversible', driver: s.settings?.leaderName || 'Workspace leader', approver: '',
      options: [{ label: 'Proceed with the reviewed response', pros: 'Coordinated action', cons: 'Uses resources' }, { label: 'Gather evidence first', pros: 'Reduces uncertainty', cons: 'Waiting has a cost' }], chosen: '' }); },
    target: (s, id) => (s.decisions || []).find((r) => r.id === id),
    untouched: (r) => !r.chosen && !r.reviewedOn && r.outcome === 'pending',
    compensate(api, r) { return api.withdrawBundleDecision(r.id); },
  },
  delegation: {
    collection: 'delegations', type: 'delegation', reversible: 'Return untouched work to the leader; keep its history',
    validate(a, s) { return need(activeOwner(s, a.ownerId), 'Choose an active accountable owner.', 'ownerId') || need(text(a.title), 'Name the delegated outcome.', 'title'); },
    execute(a, api, s, now) { return api.addDelegation({ personId: a.ownerId, title: a.title, expectedOutcome: text(a.outcome) || 'Record the result, remaining blockers and the next checkpoint.',
      authority: 'recommend', support: 'Use the agreed scope. Return anything outside your authority; no message has been sent.', delegatedOn: dayKey(now), dueOn: a.dueOn }); },
    target: (s, id) => (s.delegations || []).find((r) => r.id === id),
    untouched: (r) => r.status === 'active' && !(r.checkins || []).length,
    compensate(api, r, now, reason) { return api.returnDelegation(r.id, { returnedOn: dayKey(now), returnReason: reason }); },
  },
  premise: {
    collection: 'premises', type: 'premise', reversible: 'Remove only an untouched assumption; recorded evidence protects it',
    validate(a, s) { return need(text(a.title), 'Name the assumption.', 'title') || need(activeOwner(s, a.ownerId), 'Choose an active assumption owner.', 'ownerId')
      || need((s.cases || []).some((c) => c.id === a.sourceId), 'The source case no longer exists.', 'sourceId')
      || need(Number.isFinite(Number(a.priorPct)) && Number(a.priorPct) >= 5 && Number(a.priorPct) <= 95, 'Use a prior from 5 to 95%.', 'priorPct'); },
    execute(a, api) { const priorPct = Number(a.priorPct); return api.addPremise({ title: a.title,
      statement: text(a.statement) || `${a.title} will hold through the next review. This is a declaration, not evidence.`,
      signpost: 'Compare the promised recovery checkpoint with dated delivery evidence; record what would disprove this assumption.',
      ownerId: a.ownerId, priorPct, watchPct: Math.max(10, priorPct - 15), breachPct: Math.max(5, priorPct - 30),
      criticality: 'major', reviewBy: a.dueOn, sourceRefs: [{ sourceType: 'case', sourceId: a.sourceId }] }); },
    target: (s, id) => (s.premises || []).find((r) => r.id === id),
    untouched: (r) => !r.lastReviewedOn && !r.humanDisposition && !(r.history || []).some((h) => h.type === 'outcome'),
    compensate(api, r) { return api.withdrawBundlePremise(r.id); },
  },
  budget: {
    collection: 'budgets', type: 'budget', reversible: 'Release an unspent commitment; never erase recorded spend',
    validate(a, s) { return need((s.budgets || []).some((b) => b.id === a.budgetId && b.status === 'active'), 'Choose an active budget envelope.', 'budgetId')
      || need(text(a.title), 'Name the commitment.', 'title') || need(Number.isFinite(Number(a.amount)) && Number(a.amount) > 0 && Number(a.amount) <= 1e12, 'Enter a positive, finite commitment amount.', 'amount'); },
    execute(a, api, s, now) { const result = api.addBudgetLine(a.budgetId, { title: a.title, category: 'other', status: 'committed', committedAmount: Number(a.amount),
      committedOn: dayKey(now), expectedOn: a.dueOn, sourceType: 'case', sourceId: a.sourceId, note: 'Reviewed action-bundle commitment; not actual spend.' });
      return result.ok ? { ...result, id: result.lineId, budgetId: a.budgetId } : result; },
    target: (s, id, output) => (s.budgets || []).find((b) => b.id === output.budgetId)?.lines.find((l) => l.id === id),
    untouched: (r) => ['planned', 'committed'].includes(r.status) && r.actualAmount == null,
    compensate(api, r, now, reason, output) { return api.releaseBudgetLine(output.budgetId, r.id, { releasedOn: dayKey(now), reason }); },
  },
  comms: {
    collection: 'commsDrafts', type: 'comms', reversible: 'Dismiss only untouched, unsent drafts',
    validate(a, s) { const c = (s.cases || []).find((r) => r.id === a.sourceId);
      return need(c && c.autoPropagate !== false && ['open', 'mitigating', 'monitoring'].includes(c.status), 'Choose an open case with automation enabled.', 'sourceId')
        || need((c.stakeholders || []).some((p) => p.power >= 4 || ['blocker', 'skeptical'].includes(p.stance)), 'No key or opposing stakeholder qualifies for a brief. Add one on the case first.', 'sourceId'); },
    execute(a, api, s) { const beforeIds = (s.commsDrafts || []).filter((d) => d.caseId === a.sourceId).map((d) => d.id);
      const result = api.refreshCaseAutomation(a.sourceId); return result.ok ? { ...result, id: a.sourceId, beforeIds } : result; },
    targets: (s, a, result) => (s.commsDrafts || []).filter((d) => d.caseId === a.sourceId && !result.beforeIds.includes(d.id) && ['draft', 'approved'].includes(d.status)).map((d) => ({ id: d.id, type: 'comms', collection: 'commsDrafts' })),
    target: (s, id) => (s.commsDrafts || []).find((r) => r.id === id),
    untouched: (r) => r.status === 'draft' && !r.sentOn,
    compensate(api, r, now, reason) { return api.dismissCommsDraft(r.id, { reason }); },
  },
  coaching: {
    collection: 'people', type: 'person', reversible: 'Remove the exact prompt only while the person record is otherwise unchanged',
    validate(a, s) { return need(activeOwner(s, a.ownerId), 'Choose an active person for the coaching prompt.', 'ownerId'); },
    execute(a, api, s) { const p = s.people.find((r) => r.id === a.ownerId); const prompt = text(a.prompt, 180) || `Ask what support would help with ${a.title}. Discuss the system, not blame.`;
      if ((p.talkingPoints || []).includes(prompt)) return { ok: false, error: 'That exact coaching prompt is already queued; it must not be duplicated.' };
      if ((p.talkingPoints || []).length >= 12) return { ok: false, error: 'The 1:1 prompt queue is full. Resolve an existing prompt first.' };
      const result = api.updatePerson(p.id, { talkingPoints: [...(p.talkingPoints || []), prompt] }); return result.ok ? { ...result, id: p.id, prompt } : result; },
    target: (s, id) => (s.people || []).find((r) => r.id === id),
    untouched: (r, output) => (r.talkingPoints || []).includes(output.prompt),
    compensate(api, r, now, reason, output) { return api.updatePerson(r.id, { talkingPoints: r.talkingPoints.filter((p) => p !== output.prompt) }); },
  },
});

export function validateBundleCommands(commands, state, now = new Date()) {
  if (!Array.isArray(commands) || !commands.length || commands.length > BUNDLE_LIMITS.commands) return { ok: false, error: `Choose between 1 and ${BUNDLE_LIMITS.commands} actions.` };
  const seen = new Set();
  const value = [];
  for (const raw of commands) {
    const adapter = BUNDLE_ADAPTERS[raw?.kind];
    if (!adapter || seen.has(raw.kind)) return { ok: false, error: 'Each action type may appear at most once in a bundle.' };
    const a = { kind: raw.kind, title: text(raw.title, 180), ownerId: text(raw.ownerId, 80) || null,
      sourceId: text(raw.sourceId, 80) || null, budgetId: text(raw.budgetId, 80) || null,
      dueOn: text(raw.dueOn, 10), priorPct: raw.priorPct, amount: raw.amount,
      question: text(raw.question), outcome: text(raw.outcome), statement: text(raw.statement), prompt: text(raw.prompt, 180) };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueOn) || !Number.isFinite(Date.parse(a.dueOn)) || new Date(a.dueOn).toISOString().slice(0, 10) !== a.dueOn || a.dueOn < dayKey(now) || a.dueOn > addDays(dayKey(now), 365)) return { ok: false, error: 'Every action needs a valid review/due date within the next year.', field: 'dueOn' };
    const invalid = adapter.validate(a, state, now);
    if (invalid) return invalid;
    if (a.kind !== 'premise') delete a.priorPct;
    if (a.kind !== 'budget') delete a.amount;
    seen.add(a.kind); value.push(a);
  }
  return { ok: true, value };
}

/** A reversible operating loop, not a claim that these actions cause recovery. */
export function proposeBundle(state, sourceId, now = new Date()) {
  const source = (state.cases || []).find((c) => c.id === sourceId);
  if (!source) return { ok: false, error: 'Choose an operational case.' };
  const owner = activeOwner(state, source.ownerId) ? source.ownerId : '';
  const dueOn = source.reviewOn && source.reviewOn >= dayKey(now) ? source.reviewOn : addDays(dayKey(now), 7);
  const common = { ownerId: owner, sourceId, dueOn };
  const budget = (state.budgets || []).find((b) => b.status === 'active' && b.currency === source.financial?.currency);
  const amount = Number(source.financial?.mitigationCost);
  const actions = [
    { ...common, kind: 'decision', title: `Choose the recovery path: ${source.title}`.slice(0, 180) },
    { ...common, kind: 'delegation', title: `Verify the recovery checkpoint: ${source.title}`.slice(0, 180) },
    { ...common, kind: 'premise', title: `Recovery holds: ${source.title}`.slice(0, 180), priorPct: 70 },
    ...(budget && Number.isFinite(amount) && amount > 0 ? [{ ...common, kind: 'budget', title: 'Reviewed mitigation commitment', budgetId: budget.id, amount }] : []),
    ...(BUNDLE_ADAPTERS.comms.validate({ sourceId }, state) ? [{ ...common, kind: 'comms', title: 'Prepare stakeholder briefs' }] : []),
    ...(owner ? [{ ...common, kind: 'coaching', title: source.title, prompt: `What support would help with ${source.title}? Discuss the system, not blame.`.slice(0, 180) }] : []),
  ];
  return { ok: true, name: `Recovery control loop · ${source.title}`.slice(0, 180), sourceType: 'case', sourceId, reviewOn: dueOn, commands: actions,
    missing: owner ? [] : ['Choose an accountable owner for work, assumptions and coaching.'],
    scope: 'A proposed PDCA / assumption-based planning loop. Every action is editable and optional. No money is spent, message sent or decision chosen by adoption.' };
}