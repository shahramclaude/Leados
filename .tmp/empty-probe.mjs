import { createEmptyState, normalizeState } from '../app/core/schema.js';
import { solvencyReport } from '../app/core/domain/solvency.js';
const NOW = new Date('2026-11-02T10:00:00.000Z');
const s = normalizeState(createEmptyState(NOW.toISOString()), { now: NOW }).state;
const r = solvencyReport(s, NOW, {});
console.log('counts', r.counts);
console.log('exposures', r.exposures.length, r.exposures.map(e=>[e.sourceKey,e.promiseId,e.pdPct]));
console.log('sources', r.sources.map(x=>[x.key,x.settledN,x.verdict,x.pricedBy]));
