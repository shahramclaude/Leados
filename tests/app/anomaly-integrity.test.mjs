import test from 'node:test';
import assert from 'node:assert/strict';
import { extractModuleSeries, assessAnomaly, generateBoardBrief, anomalyRule } from '../../app/core/domain/anomaly.js';

test('case WIP uses dated snapshots, not unrelated or net-change audit events', () => {
  const state = { cases: [{ openedOn: '2026-01-01', status: 'open' }, { openedOn: '2026-01-08', resolvedOn: '2026-02-01', status: 'resolved' }], events: [{ ts: '2026-02-10', type: 'person.updated' }] };
  const points = extractModuleSeries(state, 'openCases', { asOf: new Date('2026-03-01T12:00:00Z') });
  assert.ok(points.length >= 4);
  assert.equal(points.at(-1).value, 1);
  assert.ok(points.every(p => p.value >= 0));
  assert.deepEqual(extractModuleSeries({ ...state, events: [{type:'case.reopened'}] }, 'openCases'), []);
  assert.deepEqual(extractModuleSeries({cases:[{status:'resolved', openedOn:'2026-01-01'}]}), []);
});

test('insufficient and gapped data do not become normal or calibrated forecasts', () => {
  const a = assessAnomaly([{value:1}, {value:null}, {value:2}, {value:3}]);
  assert.equal(a.hasControlLimits, false);
  assert.match(a.recommendation, /Insufficient/);
  assert.deepEqual(a.predictions, []);
  const brief = generateBoardBrief([a]);
  assert.match(brief, /No decisions/);
  assert.ok(brief.includes('\n'));
  assert.deepEqual(anomalyRule({}, {}), []);
});

test('actual SPC rule names and summaries reach the assessment', () => {
  const a = assessAnomaly([1,2,1,2,1,2,1,2,1,2,1,2,20].map(value => ({value})));
  assert.equal(a.latestSignal.type, 'beyond-limit');
  assert.equal(a.latestSignal.polarity, 'adverse');
  assert.match(a.latestSignal.reason, /upper natural/);
});
