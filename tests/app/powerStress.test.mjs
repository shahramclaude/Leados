import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePowerStress, powerStressBrief } from '../../app/core/domain/powerStress.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { analyzePowerGame, powerSignals, buildInfluenceScript } from '../../app/core/domain/power.js';
const matrix = [[[8, 4], [-2, 6]], [[2, 1], [0, 0]]];

test('exact transfer interval and break point distinguish nominal from robust feasibility', () => {
  const r = analyzePowerStress(matrix, 1);
  assert.equal(r.minimumTransfer, 4);
  assert.equal(r.maximumTransfer, 4);
  assert.equal(r.transferRadius, 1);
  assert.equal(r.transferFeasible, true);
  assert.equal(analyzePowerStress(matrix, 1.001).transferFeasible, false);
  assert.equal(r.targetGuaranteed, false);
  assert.equal(r.targetRadius, null);
  assert.match(powerStressBrief(r), /not a probability/);
});

test('minimax regret, maximin, ties, and opposition with a fixed electorate', () => {
  const r = analyzePowerStress(matrix, 2, '00', [{ id: 'a', name: 'A', weight: 6, stance: 'ally' }, { id: 'b', name: 'B', weight: 4, stance: 'neutral' }], 6);
  assert.deepEqual(r.strategies, [{ row: 0, worstPayoff: -4, worstRegret: 6 }, { row: 1, worstPayoff: -2, worstRegret: 10 }]);
  assert.deepEqual(r.minimaxRows, [0]);
  assert.deepEqual(r.maximinRows, [1]);
  assert.deepEqual(r.oppositionShocks.map(s => s.blocks), [true, false]);
  assert.equal(r.needsReview, true);
  const ties = analyzePowerStress([[[0,0],[0,0]],[[0,0],[0,0]]], 0);
  assert.deepEqual(ties.minimaxRows, [0,1]);
  assert.equal(ties.targetGuaranteed, true);
});

test('missing uncertainty is not fabricated; invalid numeric bounds and incomplete matrices rejected', () => {
  for (const v of [null, undefined, '']) assert.equal(analyzePowerStress(matrix, v), null);
  for (const v of [-1, 101, NaN, Infinity, '2']) assert.throws(() => analyzePowerStress(matrix, v), RangeError);
  assert.throws(() => analyzePowerStress([], 1), TypeError);
  assert.throws(() => analyzePowerStress(matrix, 1, '22'), RangeError);
});

test('closed form matches exhaustive 256-corner oracle for every target across 40 deterministic matrices', () => {
  let seed = 9321;
  const next = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % 21 - 10; };
  for (let k = 0; k < 40; k++) {
    const cells = Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => [next(), next()]));
    const before = JSON.stringify(cells);
    const d = k % 4;
    for (const target of ['00', '01', '10', '11']) {
      const r = +target[0], c = +target[1];
      const result = analyzePowerStress(cells, d, target);
      let lower = 0, upper = Infinity, guaranteed = true;
      const regrets = [0, 0], security = [Infinity, Infinity];
      for (let mask = 0; mask < 256; mask++) {
        let bit = 0;
        const g = cells.map(row => row.map(cell => cell.map(v => v + ((mask & (1 << bit++)) ? d : -d))));
        const l = g[r][c][0] - g[1-r][c][0], v = g[r][c][1] - g[r][1-c][1];
        lower = Math.max(lower, -v); upper = Math.min(upper, l);
        guaranteed &&= l >= 0 && v >= 0;
        for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
          regrets[row] = Math.max(regrets[row], g[1-row][col][0] - g[row][col][0]);
          security[row] = Math.min(security[row], g[row][col][0]);
        }
      }
      assert.equal(result.minimumTransfer, lower);
      assert.equal(result.maximumTransfer, upper);
      assert.equal(result.targetGuaranteed, guaranteed);
      assert.deepEqual(result.strategies.map(s => s.worstRegret), regrets);
      assert.deepEqual(result.strategies.map(s => s.worstPayoff), security);
    }
    assert.equal(JSON.stringify(cells), before);
  }
});

function harness() {
  const data = new Map(); let seq = 0;
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
  const options = { storage, now: () => new Date('2026-10-27T12:00:00Z'), idFactory: p => `${p}-stress-${++seq}` };
  const store = createStore(options); store.load();
  return { store, api: createApi(store, options), options };
}
const game = { title: 'Release approval under uncertainty', cells: matrix, targetCell: '00', estimateConfidence: 'high', players: [{ id: 'a', name: 'A', weight: 5, stance: 'ally' }, { id: 'b', name: 'B', weight: 5, stance: 'ally' }], quotaPct: 50 };

test('saving uncertainty fans into decision, coaching, typed links, signals and reload without duplication', () => {
  const { store, api, options } = harness();
  const owner = api.addPerson({ name: 'Operations lead' });
  const created = api.addPowerGame({ ...game, ownerId: owner.id, stressRadius: 2 });
  assert.equal(created.ok, true);
  const id = created.id;
  const decisions = () => store.state.decisions.filter(d => d.question.includes(`[RULE-PWR-02:${id}]`));
  assert.equal(decisions().length, 1);
  assert.match(decisions()[0].question, /no feasible transfer/);
  assert.ok(store.state.links.some(l => l.sourceId === id && l.targetId === decisions()[0].id));
  assert.ok(store.state.people[0].talkingPoints.some(t => t.includes(`[RULE-PWR-04:${id}]`)));
  assert.ok(store.state.events.some(e => e.type === 'automation.propagated' && e.summary.includes('RULE-PWR-02')));
  assert.ok(powerSignals(store.state, options.now()).some(s => s.ruleId === 'PWR-07'));
  const analysis = analyzePowerGame(store.state.powerGames[0]);
  assert.match(buildInfluenceScript(analysis, game).ask, /Do not treat/);
  api.reanalyzePowerGame(id); api.reanalyzePowerGame(id);
  assert.equal(decisions().length, 1);
  const reload = createStore(options); reload.load();
  assert.equal(reload.state.powerGames[0].stressRadius, 2);
  assert.equal(reload.state.powerGames[0].derived.stressNeedsReview, true);
  assert.equal(api.updatePowerGame(id, { stressRadius: -1 }).ok, false);
  assert.equal(store.state.powerGames[0].stressRadius, 2);
});

test('blank preserves existing behavior and automation pause is respected', () => {
  const { api, store } = harness();
  const created = api.addPowerGame(game);
  assert.equal(store.state.powerGames[0].stressRadius, null);
  assert.equal(store.state.decisions.length, 0);
  api.updatePowerGame(created.id, { autoPropagate: false, stressRadius: 2 });
  assert.equal(store.state.decisions.length, 0);
  api.updatePowerGame(created.id, { autoPropagate: true });
  assert.equal(store.state.decisions.length, 1);
});
