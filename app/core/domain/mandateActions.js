/** Composable action boundary for ADR-0078; mounted by createApi, not a second store. */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct, canSee } from './seat.js';
import { MANDATE_EVENTS, MANDATE_LIMITS } from './mandateRegistry.js';
import { summarizeBudget } from './finance.js';
import { mandateReport, mandateBrief, routeContract, newMandate, transitionMandate, makeTask, makeDecision, capacityEvidence, sourceCatalog, sourceFingerprint, sourceFor, isOpenMandate } from './mandates.js';
import { recoverAuthority, reconcileBudget } from './mandateRules.js';

const fail = (error, field = null) => ({ ok: false, error, field });
const clean = (v, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export function createMandateActions(store, { now: clock, idFactory: id }) {
  const context = (logEvent) => ({ now: clock(), idFactory: id, logEvent, settings: store.state.settings });
  const read = (options = {}) => mandateReport(store.state, { now: clock(), focusSeatId: options?.seatId || null });
  const actor = () => activeSeat(buildSeats(store.state, { now: clock() }));
  const result = () => ({ ok: true, propagations: store.lastPropagations || [], saved: !store.persistError, warning: store.persistError || null });
  function get(mandateId) {
    const m = (store.state.mandates || []).find((r) => r.id === mandateId);
    if (!m) return { error: fail('That authority contract no longer exists.') };
    const seat = actor();
    if (seat.fullAccess || seat.readOnly) return { error: fail('Declare the sender or receiver seat to act. The operator view cannot accept authority for someone else.') };
    if (![m.fromSeatId, m.toSeatId].includes(seat.id)) return { error: fail('Only the sending or receiving seat may act on this contract.') };
    const right = { proposed: 'accept-authority', active: 'accept-authority', delivered: 'verify-authority' }[m.status] || 'offer-authority';
    const verdict = canAct(right, seat);
    if (!verdict.allow) return { error: fail(verdict.reason) };
    return { m, seat };
  }
  function commit(id, type, mutator, summary) {
    store.update((draft, { logEvent }) => { const ctx = context(logEvent); const m = draft.mandates.find((m) => m.id === id); mutator(m, ctx, draft); reconcileBudget(draft, m, ctx); }, { type, entity: 'mandate', entityId: id, summary });
    return result();
  }
  return {
    mandateRead: read,
    mandateBriefText: () => mandateBrief(read()),
    previewMandate: (input) => {
      const permission = canAct('offer-authority', actor());
      if (!permission.allow) return fail(permission.reason);
      const route = routeContract(store.state, input, { now: clock() });
      if (!route.ok) return route;
      return { ok: true, route: route.contract, from: route.from.name, to: route.to.name, direction: route.direction, requiredRank: route.requiredRank, capacity: route.capacity };
    },
    proposeMandate(input) {
      const permission = canAct('offer-authority', actor());
      if (!permission.allow) return fail(permission.reason);
      const route = routeContract(store.state, input, { now: clock() });
      if (!route.ok) return route;
      if ((store.state.mandates || []).length >= MANDATE_LIMITS.maxRecords) return fail('Contract ledger is full. Export history; it is never silently discarded.');
      if ((store.state.mandates || []).some((m) => isOpenMandate(m) && m.sourceType === input.sourceType && m.sourceId === input.sourceId && m.toSeatId === input.toSeatId)) return fail('An open contract already covers this source and receiving span.');
      if (route.capacity.state !== 'available' && clean(input.capacityNote).length < 8) return fail('Capacity is unknown or insufficient. Record how the receiver will make room before offering the contract.', 'capacityNote');
      const mandateId = id('mnd');
      let record;
      store.update((draft, { logEvent }) => {
        record = newMandate(route, context(logEvent), mandateId); draft.mandates.unshift(record);
      }, { type: MANDATE_EVENTS.PROPOSE, entity: 'mandate', entityId: mandateId, summary: `Bounded authority offered for ${route.item.type}/${route.item.entityId}; acceptance required.` });
      return { ...result(), id: record.id };
    },
    acceptMandate(mandateId, { note = '', capacityNote = '' } = {}) {
      const found = get(mandateId); if (found.error) return found.error;
      const { m, seat } = found;
      if (seat.id !== m.toSeatId || m.status !== 'proposed') return fail('Only the receiver can accept a proposed contract.');
      if (m.expiresOn <= dayKey(clock())) return fail('This offer expired. Ask for a new contract; silence cannot extend it.');
      const item = sourceCatalog(store.state, { now: clock() }).find((i) => i.type === m.sourceType && i.entityId === m.sourceId);
      if (!item || sourceFingerprint(item) !== m.sourceFingerprint || !item.people.every((pid) => seat.scope.has(pid))) return fail('The source changed since this offer. Refuse it and request a fresh contract.');
      const capacity = capacityEvidence(store.state, seat.id, m.effortDays, clock());
      if (capacity.state !== 'available' && clean(capacityNote).length < 8) return fail('Record a capacity plan before accepting unknown or insufficient headroom.', 'capacityNote');
      if (m.actions.includes('spend')) {
        const budget = (store.state.budgets || []).find((b) => b.id === m.budgetId);
        const available = budget ? summarizeBudget(budget, store.state, clock()).evaluation.remainingVsLimit : null;
        if (!budget || budget.status !== 'active' || budget.currency !== m.currency || (budget.endsOn && budget.endsOn < m.expiresOn) || available === null || available < m.spendCeiling) return fail('The budget changed before acceptance; it is no longer active, same-currency, long enough, or sufficiently unencumbered.');
        if (!m.budgetLineId && (budget.lines || []).length >= 120) return fail('The budget reached its 120-line limit before acceptance.');
      }
      if (clean(note).length < 8) return fail('Acknowledge the outcome, limits and return trigger in your own words.', 'note');
      return commit(mandateId, MANDATE_EVENTS.ACCEPT, (target, ctx, draft) => {
        const decision = makeDecision(ctx, `Authority accepted: ${m.title}`, `${note}\nContract ${m.id}; expiry ${m.expiresOn}.`, seat.name, 'Accept the bounded contract');
        draft.decisions.unshift(decision);
        const task = seat.isLeader ? null : makeTask(ctx, seat.id, m.title, `${m.outcome}\nRights: ${m.actions.join(', ')}. Stop: ${m.stopCondition}`, m.expiresOn, `mandate:${m.id}`);
        if (task) draft.delegations.unshift(task);
        transitionMandate(null, target, 'active', seat.id, note, ctx, { acceptedAt: ctx.now.toISOString(), taskId: task?.id || null, decisionId: decision.id, capacity, capacityNote: clean(capacityNote) || target.capacityNote });
      }, 'Receiver explicitly accepted bounded authority; a DACI record and owned follow-through were opened.');
    },
    deliverMandate(mandateId, { evidence = '', evidenceRefs = [], actualSpend } = {}) {
      const found = get(mandateId); if (found.error) return found.error;
      const { m, seat } = found;
      if (seat.id !== m.toSeatId || m.status !== 'active') return fail('Only the receiver can deliver an active contract.');
      const actual = actualSpend === '' || actualSpend === undefined ? null : Number(actualSpend);
      if (m.actions.includes('spend') && (actual === null || !Number.isFinite(actual) || actual < 0 || actual > m.spendCeiling)) return fail('Record actual spend between zero and the accepted ceiling. Unknown is not zero.', 'actualSpend');
      if (clean(evidence).length < 12) return fail('Describe the observable outcome and what changed.', 'evidence');
      if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 20) return fail('Evidence references must be a list of at most 20 existing records.', 'evidenceRefs');
      const built = buildSeats(store.state, { now: clock() });
      const allowed = new Map(sourceCatalog(store.state, { now: clock() }).filter((i) => {
        const spec = sourceFor(i.type); const record = (store.state[spec.collection] || []).find((r) => r.id === i.entityId);
        return canSee(record, spec.collection, seat, built).allow === 'full';
      }).map((i) => [`${i.type}:${i.entityId}`, i.type]));
      const refs = [];
      const seen = new Set();
      const addRef = (type, refId) => { const key = `${type}:${refId}`; if (!allowed.has(key) || seen.has(key)) return false; seen.add(key); refs.push({ type: allowed.get(key), id: refId }); return true; };
      if (m.taskId && (store.state.delegations || []).some((d) => d.id === m.taskId)) { allowed.set(`delegation:${m.taskId}`, 'delegation'); addRef('delegation', m.taskId); }
      for (const ref of evidenceRefs) {
        if (!ref || typeof ref !== 'object' || !addRef(ref.type, ref.id)) return fail('An evidence reference is missing, outside this seat’s detail boundary, or duplicated. Link existing visible records only.', 'evidenceRefs');
      }
      if (!refs.length) return fail('Link at least one existing operational record as evidence; a self-certification alone is not enough.', 'evidenceRefs');
      return commit(mandateId, MANDATE_EVENTS.DELIVER, (target, ctx, draft) => {
        const task = draft.delegations.find((d) => d.id === target.taskId);
        if (task?.status === 'active') Object.assign(task, { status: 'done', completedOn: dayKey(ctx.now), completionNote: clean(evidence), updatedAt: ctx.now.toISOString() });
        transitionMandate(null, target, 'delivered', seat.id, clean(evidence), ctx, { deliveredAt: ctx.now.toISOString(), evidence: clean(evidence), evidenceRefs: refs, actualSpend: m.actions.includes('spend') ? actual : null });
      }, 'Receiver delivered evidence; sending-seat verification is still required.');
    },
    verifyMandate(mandateId, { note = '', accepted = true } = {}) {
      const found = get(mandateId); if (found.error) return found.error;
      const { m, seat } = found;
      if (seat.id !== m.fromSeatId || m.status !== 'delivered') return fail('Only the sender can verify delivered evidence.');
      if (clean(note).length < 8) return fail('Record why the evidence does or does not meet the contracted outcome.', 'note');
      return commit(mandateId, accepted ? MANDATE_EVENTS.COMPLETE : MANDATE_EVENTS.RETURN, (target, ctx, draft) => {
        transitionMandate(null, target, accepted ? 'completed' : 'returned', seat.id, clean(note), ctx, { closedAt: ctx.now.toISOString(), closeNote: clean(note) });
        const decision = draft.decisions.find((d) => d.id === target.decisionId);
        if (decision) { decision.reviewedOn = dayKey(ctx.now); decision.outcome = accepted ? 'good' : 'bad'; decision.outcomeNotes = clean(note); }
        if (!accepted) recoverAuthority(draft, target, ctx, clean(note));
      }, accepted ? 'Sender verified the outcome against the original contract.' : 'Sender rejected the evidence; recovery is owned, not dropped.');
    },
    returnMandate(mandateId, { note = '' } = {}) {
      const found = get(mandateId); if (found.error) return found.error;
      const { m, seat } = found;
      if (seat.id !== m.toSeatId || !['proposed', 'active'].includes(m.status)) return fail('Only the receiver can return an open offer or active contract.');
      if (clean(note).length < 8) return fail('A return needs a reason so the sender can recover the work.', 'note');
      return commit(mandateId, MANDATE_EVENTS.RETURN, (target, ctx, draft) => {
        transitionMandate(null, target, 'returned', seat.id, clean(note), ctx, { closedAt: ctx.now.toISOString(), closeNote: clean(note) });
        recoverAuthority(draft, target, ctx, clean(note));
      }, 'Receiver returned authority with a reason; recovery opened at the sending span.');
    },
    revokeMandate(mandateId, { note = '' } = {}) {
      const found = get(mandateId); if (found.error) return found.error;
      const { m, seat } = found;
      if (seat.id !== m.fromSeatId || !isOpenMandate(m)) return fail('Only the sender can revoke an open contract.');
      if (clean(note).length < 8) return fail('Record why authority is being withdrawn.', 'note');
      return commit(mandateId, MANDATE_EVENTS.REVOKE, (target, ctx, draft) => {
        transitionMandate(null, target, 'revoked', seat.id, clean(note), ctx, { closedAt: ctx.now.toISOString(), closeNote: clean(note) });
        recoverAuthority(draft, target, ctx, clean(note));
      }, 'Sender revoked authority; the linked task and recovery path were reconciled.');
    },
    scanMandates() {
      store.update(() => {}, { type: MANDATE_EVENTS.SCAN, entity: 'workspace', entityId: '', summary: 'Explicit decision-rights reconciliation: expiry, source closure, scope drift and recovery.' });
      return result();
    },
  };
}
