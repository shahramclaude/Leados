/**
 * Decision Rights Exchange: routing, explicit acceptance and closed-loop recovery.
 * Reuses the existing work-source registry, reporting tree and measured load.
 * No confidential source, no inferred authority, no silent acceptance.
 */
import { addDays, dayKey } from '../time.js';
import { buildChain, harvestWork, responsibleNodeId, LEADER_ID } from './chain.js';
import { SIGNAL_SOURCES } from './chainRegistry.js';
import { buildSeats, activeSeat, canSee } from './seat.js';
import { buildLoadReport } from './load.js';
import { summarizeBudget } from './finance.js';
import { ensureEntityLink } from './automation.js';
import { ALTITUDE_QUESTIONS, MANDATE_ACTIONS, MANDATE_LIMITS, MANDATE_PREMISE, MANDATE_STATUSES, mandateLabel } from './mandateRegistry.js';

const clean = (v, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const unique = (values) => [...new Set(values.filter(Boolean))];
const fail = (error, field = null) => ({ ok: false, error, field });
export const isOpenMandate = (m) => ['proposed', 'active', 'delivered'].includes(m?.status);
export const sourceFor = (type) => SIGNAL_SOURCES.find((s) => s.key === type && !s.sensitive && s.collection && s.linkType) || null;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Deep link into the source module, never a dead “method” placeholder. */
export function mandateSourceRoute(mandate, restricted = false) {
  if (restricted) return '#/mandates?panel=method';
  const focus = { case: `#/cases/${mandate.sourceId}`, decision: `#/decisions?decision=${mandate.sourceId}`,
    delegation: `#/delegations?delegation=${mandate.sourceId}`, goal: `#/goals?goal=${mandate.sourceId}` };
  return focus[mandate.sourceType] || sourceFor(mandate.sourceType)?.route || '#/today';
}

/** Content fingerprint, not a security signature. Detects edits before acceptance. */
export function sourceFingerprint(item) {
  // requiredRank is age-derived and changes as work sits; it is not a source edit.
  const s = JSON.stringify([item.type, item.entityId, item.title, item.people, item.dueOn, item.severity]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

export function sourceCatalog(state, { now = new Date(), settings = state.settings } = {}) {
  const chain = buildChain(state, { now, settings });
  return harvestWork(state, chain, { now, settings }).filter((i) => sourceFor(i.type) && !i.sensitive);
}

export function capacityEvidence(state, personId, effortDays, now = new Date()) {
  const row = personId && personId !== LEADER_ID ? buildLoadReport(state, now).people.find((p) => p.personId === personId) : null;
  if (!row || !row.effort.measuredItemCount || row.effort.headroomDays === null) {
    return { state: 'unknown', headroomDays: null, measuredItems: row?.effort.measuredItemCount || 0,
      openCommitments: row ? row.commitments.activeDelegations + row.commitments.openCases : 0,
      reason: 'No quantified effort/supply baseline. Unknown is not zero load; the receiver must record a capacity plan.' };
  }
  const headroomDays = row.effort.headroomDays;
  return { state: headroomDays >= effortDays ? 'available' : 'insufficient', headroomDays,
    measuredItems: row.effort.measuredItemCount, openCommitments: row.commitments.activeDelegations + row.commitments.openCases,
    reason: `${headroomDays.toFixed(2)} measured allocatable person-days headroom against ${effortDays} requested; ${row.effort.unquantifiedCount} unquantified commitment(s) excluded, not treated as zero.` };
}

/** Up and down are tree relationships. Cross-span work goes UP to the LCA, never sideways. */
export function routeContract(state, input = {}, { now = new Date(), settings = state.settings } = {}) {
  const built = buildSeats(state, { now, settings });
  const from = activeSeat(built);
  const to = built.byId.get(input.toSeatId);
  const item = sourceCatalog(state, { now, settings }).find((i) => i.type === input.sourceType && i.entityId === input.sourceId);
  if (from.fullAccess || from.readOnly) return fail('Declare a real operating seat before offering authority. The operator view is not an identity.', 'fromSeatId');
  if (!item) return fail('Choose an open, non-confidential source from the shared work registry.', 'sourceId');
  if (!to || to.isLeader && from.isLeader) return fail('Choose a real receiving leadership span.', 'toSeatId');
  if (to.id === from.id) return fail('A handoff needs a different receiving span.', 'toSeatId');
  const record = (state[sourceFor(item.type).collection] || []).find((r) => r.id === item.entityId);
  if (canSee(record, sourceFor(item.type).collection, from, built).allow !== 'full') return fail('This source is outside the acting seat’s detail boundary.', 'sourceId');
  const effortDays = Number(input.effortDays);
  if (!Number.isFinite(effortDays) || effortDays <= 0 || effortDays > 365) return fail('Record expected effort above zero and at most 365 person-days.', 'effortDays');
  const outcome = clean(input.outcome);
  const stopCondition = clean(input.stopCondition);
  if (outcome.length < 8) return fail('Describe the observable outcome, not just “handle this”.', 'outcome');
  if (stopCondition.length < 8) return fail('State the condition that stops the authority and returns the decision.', 'stopCondition');
  const actions = unique(Array.isArray(input.actions) ? input.actions : []);
  if (!actions.length || actions.some((a) => !Object.hasOwn(MANDATE_ACTIONS, a))) return fail('Choose at least one explicit decision right.', 'actions');
  const ceiling = input.spendCeiling === '' || input.spendCeiling === undefined ? null : Number(input.spendCeiling);
  const currency = clean(input.currency, 3).toUpperCase();
  if (actions.includes('spend') && (ceiling === null || !Number.isFinite(ceiling) || ceiling < 0 || !/^[A-Z]{3}$/.test(currency))) return fail('Spending authority needs a non-negative ceiling and a three-letter currency.', 'spendCeiling');
  const due = input.expiresOn || addDays(dayKey(now), Math.min(from.horizonDays || 7, 30));
  if (!isDay(due) || due <= dayKey(now) || due > addDays(dayKey(now), 365)) return fail('Choose a real calendar expiry after today and within one year.', 'expiresOn');
  let budget = null;
  if (actions.includes('spend')) {
    budget = (state.budgets || []).find((b) => b.id === input.budgetId);
    if (!budget || budget.status !== 'active' || budget.currency !== currency) return fail('Spending authority must draw from an active budget in the same currency.', 'budgetId');
    if (canSee(budget, 'budgets', from, built).allow !== 'full') return fail('The sending seat cannot grant authority over this budget.', 'budgetId');
    if (budget.endsOn && budget.endsOn < due) return fail('Authority cannot outlive its budget period.', 'expiresOn');
    const available = summarizeBudget(budget, state, now).evaluation.remainingVsLimit;
    if (available === null || available < ceiling) return fail('The budget has no declared envelope or insufficient unencumbered headroom for this ceiling.', 'spendCeiling');
    if ((budget.lines || []).length >= 120) return fail('This budget already holds its 120-line limit. Close or archive lines before adding authority.', 'budgetId');
  }
  const owner = responsibleNodeId(built.chain, item.people);
  const allInTarget = item.people.every((pid) => to.scope.has(pid));
  const allInSource = item.people.every((pid) => from.scope.has(pid));
  const down = from.scope.has(to.id) && allInTarget;
  const up = to.scope.has(from.id) && allInSource;
  if (!down && !up) {
    const common = built.byId.get(owner);
    return fail(`Cross-span authority must go to the lowest common leader${common ? ` (${common.name})` : ''}, not sideways to a peer.`, 'toSeatId');
  }
  const requiredRank = Math.max(item.requiredRank, actions.includes('spend') ? 3 : actions.includes('commit') ? 2 : 1);
  if (down && to.rank < requiredRank) return fail(`This work requires at least rank ${requiredRank}; the receiving span is rank ${to.rank}.`, 'toSeatId');
  if (up && to.rank < requiredRank) return fail(`Escalate to at least rank ${requiredRank}; this ancestor does not cover the decision horizon.`, 'toSeatId');
  if (item.severity >= 3 && down && to.rank < 3) return fail('High-consequence work cannot be delegated below director altitude under the declared safety convention.', 'toSeatId');
  const capacity = capacityEvidence(state, to.nodeId, effortDays, now);
  return { ok: true, from, to, item, owner, direction: down ? 'down' : 'up', requiredRank,
    fingerprint: sourceFingerprint(item), capacity,
    contract: { sourceType: item.type, sourceId: item.entityId, sourceFingerprint: sourceFingerprint(item),
      title: item.title.slice(0, 200), fromSeatId: from.id, toSeatId: to.id, peopleIds: item.people,
      direction: down ? 'down' : 'up', outcome, actions, spendCeiling: actions.includes('spend') ? ceiling : null,
      currency: actions.includes('spend') ? currency : '', budgetId: budget?.id || null, stopCondition, effortDays, expiresOn: due,
      capacity, capacityNote: clean(input.capacityNote),
    } };
}

export function newMandate(route, ctx, recordId = ctx.idFactory('mnd')) {
  const at = ctx.now.toISOString();
  return { ...route.contract, id: recordId, status: 'proposed', createdAt: at, createdOn: dayKey(ctx.now),
    acceptedAt: null, deliveredAt: null, closedAt: null, evidence: '', evidenceRefs: [], closeNote: '',
    budgetLineId: null, actualSpend: null, taskId: null, decisionId: null, recoveryTaskId: null, recoveryDecisionId: null,
    history: [{ at, status: 'proposed', actorSeatId: route.from.id, note: 'Authority offered; no acceptance assumed.' }],
  };
}

export function transitionMandate(draft, mandate, status, actorSeatId, note, ctx, extra = {}) {
  if (mandate.history.length >= MANDATE_LIMITS.maxTransitions) throw new Error('This mandate’s transition history is full; history is never silently discarded.');
  Object.assign(mandate, extra, { status });
  mandate.history.push({ at: ctx.now.toISOString(), status, actorSeatId, note: clean(note) });
}

/** Only this module's typed edges; no sensitive endpoint can enter. */
export function connectMandate(draft, mandate, ctx) {
  const effects = [];
  const add = (sourceType, sourceId, targetType, targetId, relation) => {
    const r = ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation,
      ruleId: 'RULE-MND-01', summary: 'Decision-rights contract provenance; not an authenticated grant.' },
    { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() });
    if (r.created) effects.push({ ruleId: 'RULE-MND-01', action: 'linked', targetType, targetId, summary: `${relation}: ${sourceType} → ${targetType}` });
  };
  add(sourceFor(mandate.sourceType)?.linkType || mandate.sourceType, mandate.sourceId, 'mandate', mandate.id, 'authorizes');
  if (mandate.toSeatId !== LEADER_ID) add('mandate', mandate.id, 'person', mandate.toSeatId, 'binds-receiver');
  if (mandate.taskId) add('mandate', mandate.id, 'delegation', mandate.taskId, 'tracks-followup');
  if (mandate.decisionId) add('mandate', mandate.id, 'decision', mandate.decisionId, 'decides');
  if (mandate.budgetId) add('budget', mandate.budgetId, 'mandate', mandate.id, 'funds');
  if (mandate.recoveryTaskId) add('mandate', mandate.id, 'delegation', mandate.recoveryTaskId, 'recovers-authority');
  if (mandate.recoveryDecisionId) add('mandate', mandate.id, 'decision', mandate.recoveryDecisionId, 'recovers-authority');
  return effects;
}

export function makeTask(ctx, personId, title, outcome, dueOn, tag) {
  return { id: ctx.idFactory('delegation'), personId, title: title.slice(0, 200), expectedOutcome: outcome.slice(0, 2000),
    authority: 'recommend', support: `[${tag}] Bounded by the linked decision-rights contract. No authority beyond its explicit rights.`,
    delegatedOn: dayKey(ctx.now), dueOn, status: 'active', checkins: [], completedOn: null, completionNote: '',
    returnedOn: null, returnReason: '', createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() };
}

export function makeDecision(ctx, title, question, approver, chosen = '') {
  return { id: ctx.idFactory('dec'), title: title.slice(0, 200), question: question.slice(0, 4000), date: dayKey(ctx.now),
    reversibility: 'reversible', driver: 'Decision Rights Exchange', approver: approver.slice(0, 120), contributors: '', informed: '',
    options: [{ id: 'accept', label: 'Accept the bounded contract', pros: 'Explicit authority and return path', cons: 'Consumes receiving-span capacity' },
      { id: 'return', label: 'Return without acceptance', pros: 'Makes refusal visible', cons: 'Sender must recover the work' }],
    chosen, rationale: chosen ? 'Receiver explicitly accepted the recorded terms. Local declaration, not identity proof.' : '',
    reviewOn: addDays(dayKey(ctx.now), 7), decidedOn: chosen ? dayKey(ctx.now) : null, reviewedOn: null, outcome: 'pending', outcomeNotes: '', forecastProbability: null, portfolioNotes: [] };
}

/** Partition by receiver: child totals sum exactly to parent, without counting a contract at every ancestor. */
export function rollupMandates(state, seatId = LEADER_ID, { now = new Date() } = {}) {
  const built = buildSeats(state, { now });
  const seat = built.byId.get(seatId);
  if (!seat) return { seatId, total: 0, own: 0, children: [], counts: {}, refusal: 'No such leadership span.' };
  const rows = (state.mandates || []).filter((m) => m.toSeatId === seat.id || seat.descendantSeatIds.includes(m.toSeatId));
  const counts = Object.fromEntries(MANDATE_STATUSES.map((s) => [s, rows.filter((m) => m.status === s).length]));
  const expiredOpen = rows.filter((m) => isOpenMandate(m) && m.expiresOn < dayKey(now)).length;
  return { seatId, label: seat.label, rank: seat.rank, total: rows.length, own: rows.filter((m) => m.toSeatId === seat.id).length,
    children: seat.childSeatIds.map((id) => rollupMandates(state, id, { now })), counts, expiredOpen,
    refusal: rows.length < 5 ? 'Fewer than five contracts: counts only, no acceptance rate or performance claim.' : null };
}

export function mandateReport(state, { now = new Date(), settings = state.settings, focusSeatId = null } = {}) {
  const built = buildSeats(state, { now, settings });
  const seat = activeSeat(built);
  const focus = built.byId.get(focusSeatId);
  const scopedFocus = focus && (seat.fullAccess || focus.id === seat.id || seat.descendantSeatIds.includes(focus.id)) ? focus : null;
  const all = state.mandates || [];
  const rows = all.filter((m) => {
    if (seat.fullAccess) return true;
    if (seat.readOnly) return false;
    if (m.fromSeatId !== seat.id && m.toSeatId !== seat.id && !seat.scope.has(m.toSeatId)) return false;
    if (scopedFocus && m.toSeatId !== scopedFocus.id && !scopedFocus.descendantSeatIds.includes(m.toSeatId)) return false;
    return canSee(m, 'mandates', seat, built).allow === 'full';
  }).map((m) => { const restricted = !seat.fullAccess && seat.rank >= 4 && ![m.fromSeatId, m.toSeatId].includes(seat.id); return { ...m,
    fromLabel: built.byId.get(m.fromSeatId)?.label || 'Former span', toLabel: built.byId.get(m.toSeatId)?.label || 'Former span',
    title: restricted ? `${m.sourceType} contract · detail withheld at this altitude` : m.title,
    displayTitle: restricted ? `${m.sourceType} contract · detail withheld at this altitude` : m.title,
    sourceRoute: mandateSourceRoute(m, restricted),
    statusLabel: mandateLabel(m.status), stale: isOpenMandate(m) && m.expiresOn < dayKey(now),
    canAccept: !seat.fullAccess && seat.id === m.toSeatId && m.status === 'proposed',
    canDeliver: !seat.fullAccess && seat.id === m.toSeatId && m.status === 'active',
    canVerify: !seat.fullAccess && seat.id === m.fromSeatId && m.status === 'delivered',
    canReturn: !seat.fullAccess && seat.id === m.toSeatId && ['proposed', 'active'].includes(m.status),
    canRevoke: !seat.fullAccess && seat.id === m.fromSeatId && isOpenMandate(m),
    outcome: restricted ? 'Source detail withheld outside the contract parties.' : m.outcome,
    evidence: restricted ? 'Evidence detail withheld outside the contract parties.' : m.evidence,
    history: restricted ? m.history.map((e) => ({ ...e, note: 'Detail withheld outside the contract parties.' })) : m.history,
    capacityNote: restricted ? 'Capacity plan withheld outside the contract parties.' : m.capacityNote,
    closeNote: restricted ? 'Close note withheld outside the contract parties.' : m.closeNote,
    evidenceRefs: restricted ? [] : m.evidenceRefs,
  }; }).sort((a, b) => Number(b.stale) - Number(a.stale) || a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id));
  const budgets = seat.fullAccess || seat.readOnly ? [] : (state.budgets || []).filter((b) => b.status === 'active' && canSee(b, 'budgets', seat, built).allow === 'full').map((b) => ({ id: b.id, name: b.name, currency: b.currency, headroom: summarizeBudget(b, state, now).evaluation.remainingVsLimit }));
  const catalog = seat.fullAccess || seat.readOnly ? [] : sourceCatalog(state, { now, settings }).filter((i) => {
    const r = (state[sourceFor(i.type).collection] || []).find((x) => x.id === i.entityId);
    return canSee(r, sourceFor(i.type).collection, seat, built).allow === 'full';
  });
  return { now: dayKey(now), seat, rows, catalog, budgets, autoPropagate: settings?.mandateAutoPropagate !== false, seats: built.seats.filter((s) => s.id !== seat.id).map((s) => ({ id: s.id, name: s.name, label: s.label, rank: s.rank })),
    rollup: rollupMandates(state, scopedFocus?.id || (seat.fullAccess ? LEADER_ID : seat.id), { now }),
    focusSeatId: scopedFocus?.id || null,
    question: ALTITUDE_QUESTIONS[seat.altitudeKey] || ALTITUDE_QUESTIONS.chief,
    actions: MANDATE_ACTIONS, premise: MANDATE_PREMISE,
    counts: { open: rows.filter(isOpenMandate).length, awaiting: rows.filter((m) => m.status === 'proposed').length,
      delivered: rows.filter((m) => m.status === 'delivered').length, stale: rows.filter((m) => m.stale).length },
  };
}

export function mandateBrief(report) {
  const c = report.rollup.counts;
  return `LeadOS · Decision Rights Exchange · ${report.now}\n${report.rollup.total} contracts in this hierarchy partition: ${c.proposed || 0} awaiting acceptance; ${c.active || 0} active; ${c.delivered || 0} awaiting verification; ${c.completed || 0} verified; ${c.expired || 0} expired; ${c.returned || 0} returned; ${c.revoked || 0} revoked.\n${report.rollup.refusal || 'Counts are exact; no person is ranked.'}\nNo source titles, person names, private notes or money totals are included. ${MANDATE_PREMISE}`;
}
