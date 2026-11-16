/** Exact, integer-only derived arithmetic for ADR-0224. */

import { SWP_HAZARD_KEYS, SWP_STATE_KEYS } from './workStopRegistry.js';

export function swpPartition(stops) {
  const list = Array.isArray(stops) ? stops : [];
  const states = Object.fromEntries(SWP_STATE_KEYS.map((key) => [key, 0]));
  const hazards = Object.fromEntries(SWP_HAZARD_KEYS.map((key) => [key, 0]));
  let overdue = 0;
  let active = 0;
  let unroutable = 0;
  for (const stop of list) {
    if (Object.hasOwn(states, stop.state)) states[stop.state] += 1;
    if (Object.hasOwn(hazards, stop.hazardKind)) hazards[stop.hazardKind] += 1;
    if (stop.state !== 'restarted') active += 1;
    if (stop.overdue) overdue += 1;
    if (stop.state === 'no-independent-authority') unroutable += 1;
  }
  return { states, hazards, overdue, active, unroutable, restarted: states.restarted || 0 };
}

export function swpClaims({ stopsN, states, hazards, actsN, actsReferenced, invalidActN = 0, invalidRestartN, invalidParticipantsN, unroutableN = 0, hiddenStopN = 0, matrixReadable }) {
  const stateSum = Object.values(states || {}).reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
  const hazardSum = Object.values(hazards || {}).reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
  const countsReconcile = Number.isInteger(stopsN) && stateSum === stopsN && hazardSum === stopsN
    && Number.isInteger(actsN) && actsN === actsReferenced;
  const figuresComplete = countsReconcile && invalidActN === 0 && invalidRestartN === 0
    && invalidParticipantsN === 0 && unroutableN === 0 && hiddenStopN === 0 && matrixReadable;
  return { countsReconcile, figuresComplete };
}

export const swpReviewSignature = (stopId, mitigationId) => `swp1:review:${String(stopId || '').trim()}:${String(mitigationId || 'unmitigated').trim()}`;
export const swpMitigationSignature = (stopId) => `swp1:mitigation:${String(stopId || '').trim()}:unmitigated`;

export function parseSwpAskSummary(value) {
  const match = /^Stop-work action: (swp1:(?:review|mitigation):[A-Za-z0-9:_-]{1,120}:[A-Za-z0-9:_-]{1,120})$/.exec(String(value || '').trim());
  return match ? { signature: match[1] } : null;
}

export const swpAskSummary = (signature) => `Stop-work action: ${String(signature || '').trim()}`;
