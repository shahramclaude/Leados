import { buildDemoState } from '../app/core/demo.js';
import { buildInsights } from '../app/core/domain/insights.js';
import { teamHealth } from '../app/core/domain/health.js';
import { cadence } from '../app/core/domain/oneonone.js';
import { aggregate, trend } from '../app/core/domain/pulse.js';
import { assess } from '../app/core/domain/readiness.js';
import { goalsSummary } from '../app/core/domain/goals.js';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const state = buildDemoState(NOW);
console.log('people', state.people.length, '1:1s', state.oneOnOnes.length, 'goals', state.goals.length, 'pulse', state.pulses.length);
console.log('\n--- cadence ---');
for (const p of state.people) {
  const c = cadence(state, p.id, NOW, state.settings);
  console.log(p.name.padEnd(18), c.status.padEnd(8), 'last', c.lastHeldDate, 'days', c.daysSinceHeld, 'streak', c.skippedStreak, 'adherence', c.adherence);
}
console.log('\n--- health ---');
const h = teamHealth(state, NOW);
console.log('overall', h.overall, h.grade, 'trend', JSON.stringify(h.trend));
h.dimensions.forEach(d => console.log(' ', d.key.padEnd(10), String(d.score).padStart(6), d.detail.slice(0,70)));
console.log('\n--- pulse ---', JSON.stringify(aggregate(state, NOW), null, 1).slice(0, 700));
console.log('trend', trend(state, NOW, {weeks:5}).map(w => `${w.weekStart}: n=${w.n} overall=${w.overall} safety=${w.safety}`).join('\n'));
console.log('\n--- goals ---');
const gs = goalsSummary(state, NOW, state.settings);
console.log(gs.rows.map(r => `${r.goal.title.slice(0,40).padEnd(42)} ${r.status.padEnd(9)} prog=${r.progressPct} exp=${r.expectedPct} health=${r.health}`).join('\n'));
console.log('\n--- readiness ---');
for (const p of state.people) {
  const a = assess(state, p.id, NOW, state.settings);
  if (a.record) console.log(p.name, a.rating, 'supported=', a.supported, 'met', a.evidence.metCount, a.warning || '');
}
console.log('\n--- findings ---');
const ins = buildInsights(state, NOW);
ins.findings.forEach(f => console.log(`${f.ruleId.padEnd(9)} sev${f.severity} ${f.confidence.padEnd(6)} ${f.domain.padEnd(14)} ${f.title}`));
console.log('\ncount', ins.findings.length, 'urgent', ins.urgent.length, 'wins', ins.wins.length);
console.log('wins:', ins.wins.map(w => w.title));
console.log('byDomain', JSON.stringify(ins.byDomain));
