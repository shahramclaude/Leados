/**
 * Quick search: the index is permission-scoped, refuses private collections,
 * ranks a focused record above a mention, and tolerates one typo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchCatalog, buildRecordIndex, buildToolIndex, searchCatalog,
  normalizeSearchText, withinOneEdit, QUICK_ACTIONS,
} from '../../app/core/domain/quickSearch.js';
import { buildDemoState } from '../../app/core/demo.js';

const GROUPS = [
  { section: 'People', items: [
    { route: 'people', label: 'People', icon: '◍' },
    { route: 'oneonones', label: '1:1s', icon: '❯' },
  ] },
  { section: 'Team', items: [
    { route: 'health', label: 'Health & pulse', icon: '♡' },
    { route: 'cases', label: 'Operational cases', icon: '⊞' },
  ] },
];

test('normalisation folds case, accents and punctuation; one edit is the typo budget', () => {
  assert.equal(normalizeSearchText('  Priya  NATÁRAJAN '), 'priya natarajan');
  assert.equal(withinOneEdit('priya', 'prya'), true, 'deletion');
  assert.equal(withinOneEdit('priya', 'priy'), true, 'truncation');
  assert.equal(withinOneEdit('natraj', 'nataraj'), true, 'insertion');
  assert.equal(withinOneEdit('priya', 'prlya'), true, 'substitution');
  assert.equal(withinOneEdit('priya', 'pirya'), true, 'transposition');
  assert.equal(withinOneEdit('priya', 'alex'), false);
});

test('a source the altitude may not read is not indexed at all', () => {
  const state = buildDemoState();
  const allowed = buildRecordIndex(state, { canReadSource: (route) => route !== 'people' });
  assert.equal(allowed.items.some((item) => item.type === 'person'), false);
  assert.deepEqual(allowed.skippedSources, ['people']);
  assert.equal(allowed.items.some((item) => item.type === 'case'), true);

  const none = buildRecordIndex(state, { canReadSource: () => false });
  assert.equal(none.total, 0);
});

test('private collections are outside the allowlist even when they match the text', () => {
  const state = buildDemoState();
  state.conflicts = [{ id: 'c-secret', title: 'SECRET-CONFLICT-TITLE', status: 'open' }];
  state.pulses = [{ id: 'p-secret', comment: 'SECRET-PULSE-COMMENT', scores: {} }];
  state.leaderStates = [{ id: 'l-secret', note: 'SECRET-LEADER-NOTE' }];
  const index = buildRecordIndex(state);
  const text = JSON.stringify(index.items);
  assert.equal(text.includes('SECRET'), false);
  const results = searchCatalog(buildSearchCatalog({ state, groups: GROUPS }), 'SECRET');
  assert.equal(results.count, 0);
});

test('the focused record outranks a mention, and a one-letter typo still finds it', () => {
  const state = buildDemoState();
  const catalog = buildSearchCatalog({ state, groups: GROUPS, actions: QUICK_ACTIONS });
  const exact = searchCatalog(catalog, 'Priya Natarajan');
  assert.equal(exact.flat[0].type, 'person');
  assert.equal(exact.flat[0].route.includes('#/people/'), true);
  assert.equal(exact.flat[0].label, 'Priya Natarajan');

  const typo = searchCatalog(catalog, 'Prya');
  assert.equal(typo.flat[0].label, 'Priya Natarajan');
  assert.equal(typo.flat[0].type, 'person');
});

test('every query word must match, so two facts do not become either fact', () => {
  const state = buildDemoState();
  const catalog = buildSearchCatalog({ state, groups: GROUPS });
  const both = searchCatalog(catalog, 'billing cutover');
  assert.ok(both.count >= 1);
  assert.ok(both.flat.every((item) => /billing/i.test(`${item.label} ${item.hint}`)
    && /cutover/i.test(`${item.label} ${item.hint}`)));
  assert.equal(searchCatalog(catalog, 'billing zzzznotpresent').count, 0);
});

test('tools and safe actions are searchable, and a withheld tool is not offered', () => {
  const state = buildDemoState();
  const all = buildSearchCatalog({ state, groups: GROUPS, actions: QUICK_ACTIONS });
  const health = searchCatalog(all, 'pulse');
  assert.ok(health.flat.some((item) => item.kind === 'tool' && item.route === '#/health'));

  const oneOnOne = searchCatalog(all, 'one on one');
  assert.ok(oneOnOne.flat.some((item) => item.kind === 'action' && item.route === '#/oneonones'));
  assert.ok(oneOnOne.flat.some((item) => item.kind === 'tool' && item.route === '#/oneonones'));

  const restricted = buildSearchCatalog({
    state, groups: GROUPS, actions: QUICK_ACTIONS,
    canReadRoute: (route) => route !== 'health',
  });
  assert.equal(searchCatalog(restricted, 'pulse').flat.some((item) => item.route === '#/health'), false);
  assert.equal(searchCatalog(restricted, 'export').flat.some((item) => item.route === '#/settings'), true);
});

test('empty search is a shortcut surface, not a dump of every record', () => {
  const state = buildDemoState();
  const catalog = buildSearchCatalog({ state, groups: GROUPS, actions: QUICK_ACTIONS });
  const empty = searchCatalog(catalog, '   ');
  assert.equal(empty.empty, true);
  assert.equal(empty.count, 0);
  assert.equal(empty.flat.length, 0);
});

test('the tool index is de-duplicated and keeps the router route shape', () => {
  const duplicate = [{ section: 'A', items: [{ route: 'cases', label: 'Cases' }, { route: 'cases', label: 'Cases again' }] }];
  const tools = buildToolIndex(duplicate, { canReadRoute: () => true });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].label, 'Cases');
  assert.equal(tools[0].route, '#/cases');
});

test('the index is bounded and counts what it truncated rather than silently dropping it', () => {
  const state = buildDemoState();
  state.cases = Array.from({ length: 30 }, (_, i) => ({ id: `case-bound-${i}`, title: `Bounded case ${i}`, status: 'open' }));
  const limited = buildRecordIndex(state, { maxPerSource: 5, maxTotal: 40 });
  assert.equal(limited.counts.cases, 5);
  assert.ok(limited.truncated >= 25);
  assert.ok(limited.total <= 40);
});

test('candidate results deep-link through their requisition', () => {
  const state = buildDemoState();
  const candidate = state.candidates[0];
  assert.ok(candidate?.reqId);
  const catalog = buildSearchCatalog({ state, groups: GROUPS });
  const result = searchCatalog(catalog, candidate.name).flat.find((item) => item.type === 'candidate');
  assert.ok(result);
  assert.equal(result.route, `#/hiring/${encodeURIComponent(candidate.reqId)}?candidate=${encodeURIComponent(candidate.id)}`);
});
