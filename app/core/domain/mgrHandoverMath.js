/** Exact, integer-only derived arithmetic for ADR-0225. */

import { MHH_PORTFOLIO_KEYS, MHH_STATE_KEYS } from './mgrHandoverRegistry.js';

export function mhhPartition(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const states = Object.fromEntries(MHH_STATE_KEYS.map((key) => [key, 0]));
  const categories = Object.fromEntries(MHH_PORTFOLIO_KEYS.map((key) => [key, 0]));
  let portfolioItems = 0;
  let overdue = 0;
  let disputed = 0;
  let lapsed = 0;
  let unreadableMatrix = 0;
  for (const row of list) {
    if (Object.hasOwn(states, row.state)) states[row.state] += 1;
    for (const key of MHH_PORTFOLIO_KEYS) {
      const value = row.portfolio?.[key];
      if (Number.isInteger(value)) categories[key] += value;
    }
    const total = row.portfolioTotal;
    if (Number.isInteger(total)) portfolioItems += total;
    if (row.overdue) overdue += 1;
    if (row.state === 'disputed') disputed += 1;
    if (row.state === 'lapsed') lapsed += 1;
    if (row.state === 'record-integrity-defect' && row.matrixUnreadable) unreadableMatrix += 1;
  }
  return { states, categories, portfolioItems, overdue, disputed, lapsed, unreadableMatrix };
}

export function mhhClaims({
  handoversN, states, categories, portfolioItems, actsN, actsReferenced,
  integrityDefectN = 0, refusedCategoryN = 0, shortfallN = 0, crossLineN = 0,
  matrixReadable = true, hiddenHandoverN = 0,
}) {
  const stateSum = Object.values(states || {}).reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
  const categorySum = Object.values(categories || {}).reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
  const countsReconcile = Number.isInteger(handoversN) && stateSum === handoversN
    && Number.isInteger(portfolioItems) && portfolioItems === categorySum
    && Number.isInteger(actsN) && actsN === actsReferenced;
  const figuresComplete = countsReconcile && integrityDefectN === 0 && refusedCategoryN === 0
    && shortfallN === 0 && crossLineN === 0 && matrixReadable && hiddenHandoverN === 0;
  return { countsReconcile, figuresComplete };
}

export const mhhBriefSignature = (handoverId) => `mhh1:brief:${String(handoverId || '').trim()}`;
export const mhhAcceptSignature = (handoverId) => `mhh1:accept:${String(handoverId || '').trim()}`;
export const mhhReleaseSignature = (handoverId) => `mhh1:release:${String(handoverId || '').trim()}`;
export const mhhDisputeSignature = (handoverId) => `mhh1:dispute:${String(handoverId || '').trim()}`;

export function parseMhhAskSummary(value) {
  const match = /^Managerial handover action: (mhh1:(?:brief|accept|release|dispute):[A-Za-z0-9:_-]{1,120})$/.exec(String(value || '').trim());
  return match ? { signature: match[1] } : null;
}

export const mhhAskSummary = (signature) => `Managerial handover action: ${String(signature || '').trim()}`;
