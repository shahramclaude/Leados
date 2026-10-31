import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoState } from '../../app/core/demo.js';
import { normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { addDays, weekStart } from '../../app/core/time.js';
import { buildWatchReport, earlyWarningRule, EW_FORECAST_METHOD, pooledSkill, scanWatch } from '../../app/core/domain/earlyWarning.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';

const NOW = new Date('2026-10-28T10:00:00Z');
function fixture() {
  // The demo is used only as a deterministic source of dated test records.
  // This artificial flag exercises the production prospective path; it is not
  // evidence that demo replay or simulated observations have real skill.
  const state = buildDemoState(NOW);
  state.meta.isDemo = false;
  state.watchAlerts = [];
  state.watchForecasts = [];
  return state;
}
function scanInPlace(state, now) {
  let n = (state.watchForecasts || []).length * 100;
  return earlyWarningRule(state, { event: { type: 'watch.scan' }, now, idFactory: (p) => `${p}-integrity-${now.getTime()}-${++n}` });
}

test('forecasts target a wholly future Monday–Sunday week and are unique per series and target', () => {
  const state = fixture();
  const scan = scanWatch(state, NOW);
  assert.ok(scan.forecasts.length > 0);
  for (const f of scan.forecasts) {
    assert.equal(f.dueOn, '2026-11-08');
    assert.equal(addDays(f.dueOn, -6), '2026-11-02');
    assert.ok(f.issuedOn < addDays(f.dueOn, -6));
    assert.equal(weekStart(addDays(f.dueOn, -6)), addDays(f.dueOn, -6));
    assert.equal(f.method, EW_FORECAST_METHOD);
  }
  scanInPlace(state, NOW);
  const first = state.watchForecasts.filter((f) => f.dueOn === '2026-11-08');
  const keys = new Set(first.map((f) => `${f.seriesId}|${f.dueOn}`));
  assert.equal(keys.size, first.length);
  scanInPlace(state, new Date('2026-10-29T10:00:00Z'));
  assert.equal(state.watchForecasts.filter((f) => f.dueOn === '2026-11-08').length, first.length);
  const sunday = scanWatch(fixture(), new Date('2026-11-01T10:00:00Z'));
  assert.ok(sunday.forecasts.every((f) => f.dueOn === '2026-11-08'));
  const monday = scanWatch(fixture(), new Date('2026-11-02T10:00:00Z'));
  assert.ok(monday.forecasts.every((f) => f.dueOn === '2026-11-15'));
});

test('first observation is frozen, later revisions are flagged and never rewrite the score', () => {
  const state = fixture();
  scanInPlace(state, NOW);
  const forecast = state.watchForecasts.find((f) => f.seriesId === 'open-cases');
  assert.ok(forecast);
  const dueDay = new Date('2026-11-08T12:00:00Z');
  assert.equal(buildWatchReport(state, dueDay).forecasts.find((f) => f.id === forecast.id).scoring.reason, 'pending');
  const captureDay = new Date('2026-11-09T10:00:00Z');
  scanInPlace(state, captureDay);
  const before = buildWatchReport(state, captureDay).forecasts.find((f) => f.id === forecast.id).scoring;
  assert.equal(before.scored, true);
  assert.equal(before.capturedOn, '2026-11-09');
  state.cases.push({ id: 'later-backdated-test-case', title: 'Backdated correction', openedOn: '2026-11-03', resolvedOn: null, status: 'open' });
  const after = buildWatchReport(state, new Date('2026-11-10T10:00:00Z')).forecasts.find((f) => f.id === forecast.id).scoring;
  assert.equal(after.revised, true);
  assert.equal(after.observed, before.observed);
  assert.equal(after.absErrorModel, before.absErrorModel);
  assert.equal(after.absErrorNaive, before.absErrorNaive);
  const reloaded = normalizeState(state, { now: new Date('2026-11-10T10:00:00Z') }).state;
  assert.deepEqual(reloaded.watchForecasts.find((f) => f.id === forecast.id).observation, forecast.observation);
  const csv = exportWorkspaceCsv(state, 'watch', { now: new Date('2026-11-10T10:00:00Z') }).csv;
  assert.match(csv, /forecast_method,issued_on,captured_on,source_revised,scoring_reason/);
  assert.ok(csv.includes('2026-11-09'));
});

test('late captures, legacy/demo replay, and invalid full-week timings are excluded from skill', () => {
  const state = fixture();
  scanInPlace(state, NOW);
  const forecast = state.watchForecasts.find((f) => f.seriesId === 'open-cases');
  const lateDay = new Date('2026-11-10T10:00:00Z');
  scanInPlace(state, lateDay);
  const report = buildWatchReport(state, lateDay);
  const late = report.forecasts.find((f) => f.id === forecast.id).scoring;
  assert.equal(late.reason, 'late-capture');
  assert.equal(late.scored, false);
  assert.ok(report.skill.late > 0);
  const legacy = { ...forecast, id: 'legacy', method: 'xmR-centreline', observation: null };
  const bad = { ...forecast, id: 'bad', issuedOn: '2026-11-05', observation: { value: 1, capturedOn: '2026-11-09' } };
  state.watchForecasts.push(legacy, bad);
  const checked = buildWatchReport(state, lateDay);
  assert.equal(checked.forecasts.find((f) => f.id === 'legacy').scoring.reason, 'legacy');
  assert.equal(checked.forecasts.find((f) => f.id === 'bad').scoring.reason, 'invalid-window');
  const demo = buildWatchReport(buildDemoState(NOW), NOW);
  assert.equal(demo.skill.scored, 0);
  assert.ok(demo.skill.legacy > 0);
});

test('skill requires five timely comparable observations and never averages mixed-unit MAEs', () => {
  const row = (seriesId, model, naive) => ({ seriesId, scored: true, absErrorModel: model, absErrorNaive: naive, directionHit: true });
  const thin = pooledSkill([row('days', 1, 2), row('days', 1, 2), row('cases', 1, 2), row('cases', 1, 2), row('score', 1, 2)]);
  assert.equal(thin.scored, 5);
  assert.equal(thin.reliable, false);
  assert.equal(thin.meanSkill, null);
  const groups = pooledSkill([...Array.from({ length: 5 }, () => row('days', 2, 4)), ...Array.from({ length: 5 }, () => row('cases', 100, 200))]);
  assert.equal(groups.bySeries.length, 2);
  assert.ok(groups.bySeries.every((g) => g.reliable && g.meanSkill === 0.5));
  assert.equal(groups.meanSkill, null);
  assert.equal(groups.maeModel, null);
  assert.equal(groups.maeNaive, null);
  const exact = pooledSkill(Array.from({ length: 5 }, () => row('days', 2, 0)));
  assert.equal(exact.reliable, false);
  assert.equal(exact.bySeries[0].meanSkill, null);
});

test('v39 migration preserves existing legacy forecasts without inventing an outcome', () => {
  assert.equal(SCHEMA_VERSION, 69);
  const old = fixture(); old.schemaVersion = 39;
  old.watchForecasts = [{ id: 'old', seriesId: 'open-cases', issuedOn: '2026-10-26', dueOn: '2026-10-25', point: 1, lo: 0, hi: 2, baselinePoint: 1, sigma: 1 }];
  const migrated = migrate(old);
  assert.deepEqual(migrated.applied, ['39 → 40', '40 → 41', '41 → 42', '42 → 43', '43 → 44', '44 → 45', '45 → 46', '46 → 47', '47 → 48', '48 → 49', '49 → 50', '50 → 51', '51 → 52', '52 → 53', '53 → 54', '54 → 55', '55 → 56', '56 → 57', '57 → 58', '58 → 59', '59 → 60', '60 → 61', '61 → 62', '62 → 63', '63 → 64', '64 → 65', '65 → 66', '66 → 67', '67 → 68', '68 → 69']);
  const { state, warnings } = normalizeState(migrated.raw, { now: NOW });
  assert.equal(state.watchForecasts.length, 1);
  assert.equal(state.watchForecasts[0].observation, null);
  assert.equal(buildWatchReport(state, NOW).forecasts[0].scoring.reason, 'legacy');
  assert.ok(warnings.some((w) => /invalid historical timing window/.test(w)));
});
