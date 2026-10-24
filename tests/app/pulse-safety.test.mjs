import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { aggregate, aggregateWindow, trend, comments, delta } from '../../app/core/domain/pulse.js';
import { teamHealth } from '../../app/core/domain/health.js';
import { buildInsights } from '../../app/core/domain/insights.js';

const NOW = new Date('2026-10-24T10:00:00Z');
function stateWithScores(scoreRows, date = '2026-10-22') {
  const state = createEmptyState(NOW.toISOString());
  state.pulses = scoreRows.map((scores, i) => ({ id: `pulse-${i}`, date, scores, anonymity: 'anonymous', comment: '' }));
  return state;
}
const varied = Array.from({ length: 5 }, (_, i) => ({ safety: 1 + i, clarity: 1 + i, workload: 1 + i, growth: 1 + i }));

function assertAllHidden(result) {
  assert.equal(result.blocked, true); assert.equal(result.overall, null);
  for (const dimension of Object.values(result.dimensions)) assert.equal(dimension.avg, null);
}

test('an identical dimension suppresses the whole vector so overall/other means cannot reveal it by subtraction', () => {
  const state = stateWithScores(varied.map((s) => ({ ...s, safety: 3 })));
  const result = aggregate(state, NOW); assertAllHidden(result);
  assert.equal(result.blockedReason, 'unanimous'); assert.equal(result.usableResponses, 5);
  assert.equal(trend(state, NOW, { weeks: 1 })[0].overall, null, 'the chart must not bypass the same rule');
  assert.equal(teamHealth(state, NOW).dimensions.find((d) => d.key === 'wellbeing').score, null);
});

test('an identical per-response overall mean is also suppressed even with different answer vectors', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ safety: i + 1, clarity: 5 - i, workload: i + 1, growth: 5 - i }));
  assertAllHidden(aggregate(stateWithScores(rows), NOW));
});

test('sparse imported responses cannot supply a false privacy floor to any released slice', () => {
  const state = stateWithScores([varied[0], ...Array.from({ length: 8 }, (_, i) => ({ safety: i % 5 + 1 }))]);
  const result = aggregate(state, NOW); assertAllHidden(result);
  assert.equal(result.n, 9); assert.equal(result.usableResponses, 1); assert.equal(result.incompleteResponses, 8);
  assert.equal(trend(state, NOW, { weeks: 1 })[0].overall, null);
});

test('complete varied responses release honest means and partial extras do not change them', () => {
  const state = stateWithScores([...varied, { safety: 5 }]);
  const result = aggregate(state, NOW); assert.equal(result.blocked, false);
  assert.equal(result.usableResponses, 5); assert.equal(result.overall, 3); assert.equal(result.dimensions.safety.avg, 3);
  assert.equal(trend(state, NOW, { weeks: 1 })[0].overall, 3);
});

test('comments require their own nonempty cohort instead of borrowing the score response count', () => {
  const state = stateWithScores(varied);
  state.pulses[0].comment = 'One private comment'; assert.deepEqual(comments(state, NOW), []);
  state.pulses.forEach((p, i) => { p.comment = `Different comment ${i}`; });
  assert.equal(comments(state, NOW).length, 5);
  assert.ok(comments(state, NOW).every((c) => !('personId' in c)));
  state.pulses.forEach((p) => { p.comment = 'Identical text'; }); assert.deepEqual(comments(state, NOW), []);
});

test('normalization does not coerce missing pulse scores or booleans into low scores', () => {
  const raw = stateWithScores([{ safety: null, clarity: '', workload: false, growth: undefined }]);
  const { state } = normalizeState(raw); assert.deepEqual(state.pulses[0].scores, {});
  assertAllHidden(aggregate(state, NOW));
});

test('weekly charts exclude future-dated responses and share the window release policy', () => {
  const state = stateWithScores(varied.slice(0, 4), '2026-10-23');
  state.pulses.push({ id: 'future', date: '2026-10-25', scores: varied[4], anonymity: 'anonymous' });
  assert.equal(trend(state, NOW, { weeks: 1 })[0].n, 4); assert.equal(trend(state, NOW, { weeks: 1 })[0].overall, null);
  assertAllHidden(aggregate(state, NOW));
});

test('comparison windows and signals never turn suppression into zero or a negative response request', () => {
  const state = stateWithScores(varied.map((s) => ({ ...s, safety: 3 })));
  state.people.push({ id: 'p1', name: 'A person', status: 'active', startDate: '2026-01-01', createdAt: '2026-01-01T00:00Z' });
  state.pulses.push(...varied.map((scores, i) => ({ id: `previous-${i}`, date: '2026-10-05', scores, anonymity: 'anonymous' })));
  assert.equal(aggregateWindow(state, NOW, 14, 14).blocked, false);
  assert.equal(delta(state, NOW).available, false);
  const finding = buildInsights(state, NOW).findings.find((f) => f.ruleId === 'PULSE-02');
  assert.match(finding.title, /identical/); assert.doesNotMatch(finding.detail, /-\d+ more/);
});

test('pulse API excludes boolean, null and empty scores instead of fabricating answers', async () => {
  const { createStore } = await import('../../app/core/store.js');
  const { createApi } = await import('../../app/actions.js');
  const store = createStore({ storage: null, now: () => NOW }); store.load(); const api = createApi(store, { now: () => NOW });
  assert.equal(api.submitPulse({ scores: { safety: true, clarity: false, workload: null, growth: '' } }).ok, false);
  assert.equal(store.state.pulses.length, 0);
  assert.equal(api.submitPulse({ scores: { safety: true, clarity: '3', workload: null, growth: ' ' } }).ok, true);
  assert.deepEqual(store.state.pulses[0].scores, { clarity: 3 });
});

test('settings, import normalization and reporting agree on a minimum privacy floor of three', async () => {
  const { createStore } = await import('../../app/core/store.js'); const { createApi } = await import('../../app/actions.js');
  const store = createStore({ storage: null, now: () => NOW }); store.load(); const api = createApi(store, { now: () => NOW });
  for (const floor of [1, 2, 26, true, null, 3.5]) assert.equal(api.updateSettings({ pulseMinResponses: floor }).ok, false);
  assert.equal(store.state.settings.pulseMinResponses, 5);
  assert.equal(api.updateSettings({ pulseMinResponses: 3 }).ok, true); assert.equal(store.state.settings.pulseMinResponses, 3);
  const raw = createEmptyState(); raw.settings.pulseMinResponses = 1;
  const { state, warnings } = normalizeState(raw, { now: NOW });
  assert.equal(state.settings.pulseMinResponses, 3); assert.ok(warnings.some((w) => w.includes('privacy floor')));
});
