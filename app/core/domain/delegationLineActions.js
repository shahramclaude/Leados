/** Reviewed API doors for ADR-0178. */
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildDelegationLines } from './delegationLines.js';
import { DELEGATION_LINE_EVENTS, DELEGATION_LINE_LIMITS, DELEGATION_LINE_RIGHTS, DELEGATION_LINE_RULE_ID } from './delegationLineRegistry.js';
const fail = (error, field = 'scope') => ({ ok: false, error, field });
function seatAndMatrix(state, at) { const settings = state.settings || {}; const matrix = buildMatrix(state, { now: at, settings }); const scope = matrixLineScope(matrix); return { matrix, seat: activeSeat(buildSeats(state, { now: at, settings, lineScope: scope.byManager })) }; }
function saved(store, extra = {}) { return { ok: true, ...extra, saved: store.isEncrypted ? null : !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] }; }
export function createDelegationLineActions(store, { now = () => new Date(), idFactory = null } = {}) {
 const clock = () => { const x = now(); return x instanceof Date ? x : new Date(x); }; const id = (p) => idFactory ? idFactory(p) : `${p}-${Math.random().toString(36).slice(2, 10)}`;
 return {
  delegationLineReport() { const report = buildDelegationLines(store.state, { now: clock() }); return report.seat.readOnly ? fail('The operating seat is unresolved; the cross-line ask register cannot be read.') : { ok: true, report }; },
  delegationLineAttribute(delegationId, lineId) {
   const at = clock(); const { matrix, seat } = seatAndMatrix(store.state, at); if (seat.readOnly) return fail('Resolve the operating seat before attributing an ask.');
   const ask = (store.state.delegations || []).find((d) => d.id === delegationId && d.status === 'active'); if (!ask) return fail('Choose an active delegation.', 'delegationId');
   const node = matrix.nodes.get(ask.personId); const line = (node?.lines || []).find((l) => l.id === lineId && l.active !== false); if (!line) return fail('Choose one of the person’s active reporting lines.', 'lineId');
   if (!seat.fullAccess && seat.id !== line.managerId) return fail('Only the manager holding this line can place the ask on it.', 'lineId');
   if ((store.state.delegationLineActs || []).length >= DELEGATION_LINE_LIMITS.acts) return fail('The attribution ledger is full; export it before recording more.');
   const act = { id: id('dla'), delegationId, personId: ask.personId, lineId: line.id, managerId: line.managerId, lineKind: line.kind || '', basis: 'declared', byId: seat.fullAccess ? null : seat.id, at: at.toISOString() };
   store.update((draft) => { draft.delegationLineActs = Array.isArray(draft.delegationLineActs) ? draft.delegationLineActs : []; draft.delegationLineActs.push(act); }, { type: DELEGATION_LINE_EVENTS.ATTRIBUTED, entity: 'delegation', entityId: delegationId, summary: `Attributed delegation ${delegationId} to reporting line ${line.id}; the prior acts remain in history.` });
   return saved(store, { id: act.id });
  },
  delegationLineScan() { const { seat } = seatAndMatrix(store.state, clock()); const right = canAct(DELEGATION_LINE_RIGHTS.GOVERN, seat); if (seat.readOnly || (!seat.fullAccess && !right.allow)) return fail(right.reason || 'Scanning cross-line asks requires director rank.'); store.update(() => {}, { type: DELEGATION_LINE_EVENTS.SCAN, entity: 'workspace', entityId: 'delegation-lines', summary: `Scanned shared-contributor overload (${DELEGATION_LINE_RULE_ID}).` }); return saved(store, { effects: (store.lastPropagations || []).filter((x) => x?.ruleId === DELEGATION_LINE_RULE_ID) }); },
 };
}
