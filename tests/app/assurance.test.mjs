import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { runPostCommitRules } from '../../app/core/domain/postCommit.js';
import { buildAssuranceReport, evidenceTrails, previewCaseAutomation, assuranceBrief, compareAutomationGraphs } from '../../app/core/domain/assurance.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { buildDemoState } from '../../app/core/demo.js';
import { renderAssurance } from '../../app/views/assurance.js';

const now = new Date('2026-10-27T12:00:00Z');
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) }; };

function successful(draft, ctx) {
  draft.values.push('success'); ctx.logEvent({ type: 'automation.propagated', summary: 'good' });
  return [{ targetId: 'good' }];
}
function broken(draft, ctx) {
  draft.values.push('partial'); draft.bad = true; delete draft.keep;
  ctx.logEvent({ type: 'automation.propagated', summary: 'false success' });
  ctx.warnings.push('discard me'); throw new Error('injected failure');
}

test('rule savepoints discard failed writes, deletions, warnings and success logs; subsequent rules see last successful state', () => {
  const draft = { values: [], keep: true }; const events = []; const warnings = [];
  const results = runPostCommitRules(draft, { rules: [successful, broken, (d) => {
    assert.deepEqual(d.values, ['success']); assert.equal(d.keep, true); assert.equal(d.bad, undefined);
    d.values.push('continued');
  }], logEvent: (e) => events.push(e), warnings });
  assert.deepEqual(draft, { values: ['success', 'continued'], keep: true });
  assert.deepEqual(results, [{ targetId: 'good' }]);
  assert.deepEqual(events.map((e) => e.type), ['automation.propagated', 'automation.rule_error']);
  assert.match(events[1].summary, /broken rolled back/);
  assert.equal(warnings.length, 1); assert.doesNotMatch(warnings[0], /discard me/);
});

test('real store persists the source action but never a failed rule partial fan-out', () => {
  const storage = memory(); let seq = 0;
  const store = createStore({ storage, now: () => now, idFactory: (p) => `${p}-${++seq}`, postCommitRules: [
    (draft, ctx) => { if (ctx.event?.type !== 'test.source') return; draft.goals.push({ id: 'partial' }); ctx.logEvent({ type: 'automation.propagated', summary: 'not real' }); throw Error('stop'); },
    (draft, ctx) => { if (ctx.event?.type !== 'test.source') return; assert.equal(draft.goals.length, 0); draft.decisions.push({ id: 'survivor' }); },
  ] });
  store.load(); store.update((d) => { d.settings.teamName = 'Source preserved'; }, { type: 'test.source' });
  assert.equal(store.state.settings.teamName, 'Source preserved');
  assert.equal(store.state.goals.length, 0); assert.equal(store.state.decisions[0].id, 'survivor');
  assert.equal(store.state.events.some((e) => e.summary === 'not real'), false);
  assert.equal(store.state.events.filter((e) => e.type === 'automation.rule_error').length, 1);
  const loaded = createStore({ storage, now: () => now }); loaded.load();
  assert.equal(loaded.state.goals.length, 0);
});

function graphFixture() {
  return { cases: [{ id: 'c', title: 'Incident' }], decisions: [{ id: 'd', title: 'Trade-off' }], goals: [{ id: 'g', title: 'Recovery' }], links: [
    { id: 'l1', sourceType: 'case', sourceId: 'c', targetType: 'decision', targetId: 'd', relation: 'decides', ruleId: 'RULE-TEST' },
    { id: 'l2', sourceType: 'goal', sourceId: 'g', targetType: 'decision', targetId: 'd', relation: 'impacts-goal' },
  ] };
}

test('BFS traces multi-module shortest paths and identifies reversed traversal', () => {
  const r = buildAssuranceReport(graphFixture());
  const paths = evidenceTrails(r, JSON.stringify(['case', 'c']));
  assert.equal(paths.length, 2); assert.equal(paths[1].node.type, 'goal');
  assert.equal(paths[1].distance, 2); assert.equal(paths[1].path[1].reverse, true);
  assert.deepEqual(evidenceTrails(r, 'missing'), []);
});

test('cycles terminate, parallel relationships survive, exact duplicates are diagnosed', () => {
  const s = graphFixture(); s.links.push({ ...s.links[0], id: 'duplicate' }, { ...s.links[0], id: 'parallel', relation: 'tracks-followup' });
  const r = buildAssuranceReport(s);
  assert.equal(r.edges.length, 3); assert.equal(r.findings[0].kind, 'duplicate');
  assert.equal(evidenceTrails(r, JSON.stringify(['case', 'c'])).length, 2);
});

test('dangling and unregistered operational links are diagnosed; confidential links and log text never leak', () => {
  const s = graphFixture(); s.events = [{ id: 'f', ts: now.toISOString(), type: 'automation.rule_error', summary: 'SECRET' }];
  s.links.push({ ...s.links[0], id: 'bad', targetId: 'deleted' }, { ...s.links[0], id: 'unknown', relation: 'magic' },
    { sourceType: 'conflict', sourceId: 'SECRET', targetType: 'case', targetId: 'c' },
    { sourceType: 'case', sourceId: 'c', targetType: 'pulse', targetId: 'SECRET' });
  const r = buildAssuranceReport(s);
  assert.deepEqual(r.findings.map((f) => f.kind), ['dangling', 'unknown-relation']);
  assert.doesNotMatch(JSON.stringify(r), /SECRET/); assert.doesNotMatch(assuranceBrief(r), /SECRET/);
});

test('relationship delta detects replacements, excludes private links, and reports invalid graph changes without identities', () => {
  const before = graphFixture();
  const after = JSON.parse(JSON.stringify(before));
  after.decisions.push({ id: 'secret-record', title: 'SECRET' });
  after.links = after.links.filter((l) => l.id !== 'l1');
  after.links.push({ id: 'new', sourceType: 'case', sourceId: 'c', targetType: 'decision', targetId: 'secret-record', relation: 'decides' },
    { id: 'bad', sourceType: 'case', sourceId: 'c', targetType: 'decision', targetId: 'missing', relation: 'decides' },
    { id: 'private', sourceType: 'conflict', sourceId: 'SECRET', targetType: 'case', targetId: 'c', relation: 'decides' });
  const diff = compareAutomationGraphs(before, after);
  assert.deepEqual(diff.relationships, [{ sourceType: 'case', relation: 'decides', targetType: 'decision', added: 1, removed: 1 }]);
  assert.equal(diff.diagnosticsBefore.dangling, 0); assert.equal(diff.diagnosticsAfter.dangling, 1);
  assert.doesNotMatch(JSON.stringify(diff), /SECRET|secret-record/);
});

test('production replay is deterministic, creates real cross-module deltas and never mutates source', () => {
  const s = buildDemoState(now); const before = JSON.stringify(s);
  const a = previewCaseAutomation(s, s.cases[0].id, { now });
  assert.equal(a.ok, true); assert.equal(a.warnings.length, 0);
  assert.ok(a.changes.some((c) => c.collection === 'links' && c.created > 0));
  assert.ok(a.changes.some((c) => c.collection !== 'links'));
  assert.deepEqual(a, previewCaseAutomation(s, s.cases[0].id, { now }));
  assert.equal(JSON.stringify(s), before);
  assert.equal(previewCaseAutomation(s, 'unknown', { now }).ok, false);
});

test('sandbox rule failure is contained and reported without exposing error free text', () => {
  const s = { cases: [{ id: 'c' }], goals: [], events: [] };
  const p = previewCaseAutomation(s, 'c', { now, rules: [(d) => { d.goals.push({ id: 'bad' }); throw Error('SECRET'); }] });
  assert.deepEqual(p.changes, []); assert.equal(p.warnings.length, 1);
  assert.equal(s.goals.length, 0);
  // The UI only renders warning count, never raw rule-error messages.
  assert.deepEqual(p.events, [{ type: 'automation.rule_error', entity: 'workspace' }]);
});

test('explicit refresh uses the actual store and fans a case into comms and graph, repeat converges', () => {
  let seq = 0; const store = createStore({ storage: memory(), now: () => now, idFactory: (p) => `${p}-assure-${++seq}` });
  store.load(); const api = createApi(store, { now: () => now, idFactory: (p) => `${p}-assure-${++seq}` });
  const added = api.addCase({ title: 'Release blocked', kind: 'incident', openedOn: '2026-10-26', reviewOn: '2026-10-30', fmea: { severity: 8, probability: 6, detectability: 7 }, stakeholders: [{ name: 'Sponsor', power: 5, interest: 5, stance: 'skeptical' }] });
  assert.equal(added.ok, true, added.error);
  // Remove derived drafts to model a missing follow-through; refresh reconstructs them.
  store.update((d) => { d.commsDrafts = []; d.links = d.links.filter((l) => l.targetType !== 'comms'); });
  const preview = previewCaseAutomation(store.state, added.id, { now });
  assert.ok(preview.changes.some((c) => c.collection === 'commsDrafts' && c.created));
  assert.ok(preview.graphDelta.relationships.some((r) => r.relation === 'communicates' && r.added > 0));
  assert.equal(api.refreshCaseAutomation(added.id).ok, true);
  assert.ok(store.state.commsDrafts.length > 0);
  assert.ok(store.state.links.some((l) => l.relation === 'communicates'));
  const count = store.state.commsDrafts.length;
  assert.equal(api.refreshCaseAutomation(added.id).ok, true);
  assert.equal(store.state.commsDrafts.length, count);
  assert.equal(api.refreshCaseAutomation('missing').ok, false);
});

test('control room DOM renders empty and real graphs; sandbox button changes no source records', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const oldDocument = globalThis.document; const oldNode = globalThis.Node;
  globalThis.document = dom.window.document; globalThis.Node = dom.window.Node;
  try {
    const s = buildDemoState(now); const before = JSON.stringify(s);
    let refreshed = 0;
    const modalRoot = document.createElement('div'); modalRoot.id = 'modal-root'; document.body.append(modalRoot);
    const view = renderAssurance({ state: s, now, api: { refreshCaseAutomation: () => { refreshed += 1; return { ok: true }; } } }); document.body.append(view);
    assert.equal(view.querySelector('h1').textContent, 'Automation control room');
    const select = view.querySelector('#assurance-case'); select.value = s.cases[0].id;
    [...view.querySelectorAll('button')].find((b) => b.textContent === 'Preview in sandbox').click();
    assert.match(view.textContent, /Preview wrote nothing/);
    assert.ok(view.querySelector('[aria-label="Cross-module relationship changes"]'));
    assert.ok(view.querySelector('[aria-label="Graph diagnostics before and after"]'));
    assert.equal(JSON.stringify(s), before);
    const refresh = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Refresh current case');
    refresh.click(); assert.equal(refreshed, 0);
    [...modalRoot.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
    assert.equal(refreshed, 0);
    refresh.click();
    [...modalRoot.querySelectorAll('button')].find((b) => b.textContent === 'Refresh automation').click();
    assert.equal(refreshed, 1);
    const nodes = view.querySelector('#assurance-record'); nodes.selectedIndex = 1;
    nodes.dispatchEvent(new dom.window.Event('change'));
    assert.ok(view.querySelector('[aria-label="Shortest evidence trails"]'));
    const empty = renderAssurance({ state: { cases: [], links: [] }, now, api: {} });
    assert.match(empty.textContent, /No linked operational records yet/);
    dom.window.eval(fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8'));
    const result = await dom.window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.equal(result.violations.length, 0, result.violations.map((v) => v.id).join(', '));
  } finally { globalThis.document = oldDocument; globalThis.Node = oldNode; dom.window.close(); }
});
