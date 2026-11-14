import test from 'node:test';
import assert from 'node:assert/strict';
import { createInsightsMemo } from '../../app/core/domain/insightsMemo.js';

test('daily insight memo shares one read for one immutable snapshot', () => {
  const state = { meta: { revision: 4 } };
  let calls = 0;
  const memo = createInsightsMemo((input, now) => {
    calls += 1;
    return { findings: [{ title: `revision ${input.meta.revision}`, createdAt: now.toISOString() }] };
  });

  const first = memo(state, new Date('2026-11-14T09:00:00.000Z'));
  const second = memo(state, new Date('2026-11-14T15:30:00.000Z'));
  assert.equal(calls, 1, 'repeated requests during the same day reuse the expensive report');
  assert.equal(first, second, 'navigation and views consume the same projection');
  assert.equal(second.findings[0].createdAt, '2026-11-14T15:30:00.000Z', 'display timestamp follows the current render');
});

test('insight memo invalidates on a new store snapshot or a new day', () => {
  let calls = 0;
  const memo = createInsightsMemo(() => ({ findings: [], read: ++calls }));
  const firstState = { meta: { revision: 1 } };
  const nextState = { meta: { revision: 2 } };

  assert.equal(memo(firstState, new Date('2026-11-14T10:00:00Z')).read, 1);
  assert.equal(memo(nextState, new Date('2026-11-14T10:00:00Z')).read, 2);
  assert.equal(memo(nextState, new Date('2026-11-15T00:01:00Z')).read, 3);
  assert.equal(calls, 3);
});
