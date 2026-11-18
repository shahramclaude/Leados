import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const header = 'hazard\tcontrol\tfromUTC\tuntilUTC\tcreditRef\timpairmentRef';
const row = (c, a, b) => ['H', c, `2026-11-18T00:00:00.${a}Z`, `2026-11-18T00:00:00.${b}Z`, 'credit-' + c, 'log-' + c].join('\t');
const review = (...rows) => spawnSync(process.execPath, ['scripts/review-control-overlap.mjs', '-'], { input: [header, ...rows].join('\r\n'), encoding: 'utf8' });
const a = row('A', '001', '003'), b = row('B', '002', '004');
test('source receipt and exact intersections survive duplicate matrix evidence and abutting bounds', () => {
  for (const duplicates of [[], [a]]) {
    const r = review(a, b, row('C', '004', '005'), ...duplicates);
    assert.equal(r.status, 0, r.stderr);
    const receipt = JSON.parse(r.stdout);
    assert.equal(receipt.duplicateRows, duplicates.length);
    assert.equal(receipt.intersectionCount, 1);
    assert.deepEqual(receipt.intersections, [{ lines: [2, 3], fromUTC: b.split('\t')[2], untilUTC: a.split('\t')[3], milliseconds: 1 }]);
    for (const [i, item] of receipt.evidence.entries()) assert.equal([item.hazard, item.control, item.fromUTC, item.untilUTC, item.creditRef, item.impairmentRef].join('\t'), [a, b, row('C', '004', '005')][i]);
  }
});
test('ambiguous, missing, reversed, invalid or cross-hazard evidence refuses the entire receipt', () => {
  for (const bad of [a + 'x', a.replace('003Z', '000Z'), a.replace('003Z', 'Z'), a.replace('-18T', '-31T'), b.replace(/^H/, 'J'), b.replace(/log-B$/, '')]) {
    const r = review(a, bad); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /Line/);
  }
});
