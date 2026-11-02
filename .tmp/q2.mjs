import { buildDemoState } from '../app/core/demo.js';
import { buildInsights } from '../app/core/domain/insights.js';
const NOW = new Date('2026-11-02T10:00:00.000Z');
const ins = buildInsights(buildDemoState(NOW), NOW);
const b = ins.byDomain.find(d=>d.domain==='Promise solvency');
console.log(JSON.stringify(b, null, 1).slice(0,800));
console.log('counts', b && Object.keys(b));
