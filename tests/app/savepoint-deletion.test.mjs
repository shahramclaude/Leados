import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavepointDraft } from '../../app/core/domain/savepoint.js';
import { runPostCommitRules } from '../../app/core/domain/postCommit.js';

for (const strategy of ['cow', 'clone']) {
  test(`${strategy}: deletion stays deleted after reads, reflection and reassignment`, () => {
    const base = { cases: [{ id: 'c1' }], settings: { enabled: true } };
    const sp = createSavepointDraft(base, { strategy });
    delete sp.draft.cases;
    assert.equal(sp.draft.cases, undefined);
    assert.equal('cases' in sp.draft, false);
    assert.equal(Object.hasOwn(sp.draft, 'cases'), false);
    assert.deepEqual(Object.keys(sp.draft), ['settings']);
    assert.deepEqual(base.cases, [{ id: 'c1' }]);
    sp.commitInto(base);
    assert.equal(Object.hasOwn(base, 'cases'), false);
    const next = createSavepointDraft(base, { strategy });
    delete next.draft.settings;
    next.draft.settings = { enabled: false };
    next.commitInto(base);
    assert.deepEqual(base.settings, { enabled: false });
  });
}

test('a successful rule deletion survives later reads and is observed by subsequent subscribers', () => {
  const draft = { settings: { old: true }, seen: [] };
  const warnings = [];
  runPostCommitRules(draft, {
    event: { type: 'test.changed', entity: 'workspace', entityId: 'w' }, warnings,
    rules: [
      (d) => { delete d.settings; assert.equal(d.settings, undefined); },
      (d) => { d.seen.push(Object.hasOwn(d, 'settings')); },
    ],
  });
  assert.deepEqual(warnings, []);
  assert.equal(Object.hasOwn(draft, 'settings'), false);
  assert.deepEqual(draft.seen, [false]);
});

test('a failed rule deletion does not leak to later subscribers', () => {
  const draft = { settings: { old: true }, seen: [] };
  const warnings = [];
  runPostCommitRules(draft, {
    event: { type: 'test.changed', entity: 'workspace', entityId: 'w' }, warnings,
    rules: [
      (d) => { delete d.settings; assert.equal(d.settings, undefined); throw new Error('failure'); },
      (d) => { d.seen.push(d.settings.old); },
    ],
  });
  assert.equal(warnings.length, 1);
  assert.deepEqual(draft.settings, { old: true });
  assert.deepEqual(draft.seen, [true]);
});
