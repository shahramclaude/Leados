/**
 * tests/app/coverage-record-focus.test.mjs — ADR-0131, Session 177.
 *
 * Exact-record focus for the coverage family. Session 176 (ADR-0130) gave all
 * thirteen missing link types a resolver case but deliberately refused to
 * invent a focus the terminals could not honour: the duty register, absence
 * plan, acknowledgement board and reading panel accepted a panel but no record
 * id, so a director following a governed decision's edge landed at the top of
 * a table and hunted for the row by eye.
 *
 * What this suite proves, against the REAL store, resolver and views:
 *   1. Every coverage-family resolver route carries its encoded focus id and
 *      still projects no protected content (no note, no reason, no seat id on
 *      a branch row).
 *   2. Each destination view marks EXACTLY the named row `lineage-selected`
 *      with its data anchor — at the manager altitude (names visible) and at
 *      the director altitude (names withheld): focus never becomes a
 *      disclosure channel.
 *   3. A focus id outside the seat's scope prints the honest absent note,
 *      highlights nothing, and widens nothing.
 *   4. The standby answer's two chairs: the holder's board focuses the row;
 *      the cover's own chair is pointed to with the same id and focuses there.
 *   5. A rehearsal older than the printed 40 rows is brought into view.
 *   6. Opening a deep link mutates nothing (ledgers and links unchanged).
 *   7. The focused panels render axe-clean.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { SCHEMA_VERSION, createEmptyState, normalizeState } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { RECORD_FOCUS_PARAMS } from '../../app/ui/recordFocus.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';
import { renderStandby } from '../../app/views/standby.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'app/styles.css'), 'utf8');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const NOW = new Date('2027-06-30T00:00:00.000Z');
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const plus = (days) => new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10);

/**
 * leader (chief) → vp1 → dir1 → mgr1 → lead1/lead2 → ics.
 * lead1 holds `coach` with mgr1 declared cover; lead2 holds `clarity` with
 * dir1 declared cover — two rows, so "exactly one row selected" is a real
 * assertion. mgr1 has a declared absence; the answers and rehearsals ride the
 * same rows the module suites use.
 */
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = { ...state.settings, leaderName: 'Dana Whitfield', chainLeaderAltitude: 'chief', activeSeatId: null };
  state.people = [
    { id: 'vp1', name: 'Rina Okafor', role: 'VP Operations', level: 'vp', managerId: null, status: 'active', createdAt: ago(600) },
    { id: 'dir1', name: 'Samuel Park', role: 'Director', level: 'director', managerId: 'vp1', status: 'active', createdAt: ago(600) },
    { id: 'mgr1', name: 'Mei Chen', role: 'Manager', level: 'manager', managerId: 'dir1', status: 'active', createdAt: ago(600) },
    { id: 'lead1', name: 'Priya Raman', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'lead2', name: 'Jordan Lee', role: 'Shift lead', level: 'lead', managerId: 'mgr1', status: 'active', createdAt: ago(500) },
    { id: 'ic1', name: 'Ari Klein', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic2', name: 'Bo Nilsen', role: 'Analyst', level: 'ic', managerId: 'lead1', status: 'active', createdAt: ago(400) },
    { id: 'ic3', name: 'Cy Orlov', role: 'Analyst', level: 'ic', managerId: 'lead2', status: 'active', createdAt: ago(400) },
  ];
  state.oneOnOnes = [
    { id: 'oo1', personId: 'ic1', date: ago(3), status: 'held', notes: 'Weekly cadence held.', agenda: [], actions: [] },
  ];
  state.cases = [
    { id: 'case1', title: 'Night-shift handover blocker', status: 'open', ownerId: 'ic2', openedOn: ago(11), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), involvedPersonIds: ['ic2'] },
  ];
  state.dutyCovers = [
    {
      id: 'cover-a', dutyId: 'lead1|coach', seatId: 'lead1', dutyKey: 'coach', coverId: 'mgr1',
      note: 'Named as the stand-in while the holder is away.', decisionId: null, declaredBySeatId: 'lead1',
      declaredOn: ago(6), declaredAt: `${ago(6)}T09:00:00.000Z`, status: 'active',
      revokedOn: null, revokedAt: null, revokeReason: '', verifiedOn: null, version: 'duty-coverage-2026.11-v1',
    },
    {
      id: 'cover-b', dutyId: 'lead2|clarity', seatId: 'lead2', dutyKey: 'clarity', coverId: 'dir1',
      note: 'Second declaration so focus must pick one row.', decisionId: null, declaredBySeatId: 'lead2',
      declaredOn: ago(5), declaredAt: `${ago(5)}T09:00:00.000Z`, status: 'active',
      revokedOn: null, revokedAt: null, revokeReason: '', verifiedOn: null, version: 'duty-coverage-2026.11-v1',
    },
  ];
  state.absencePlans = [{
    id: 'abs-mgr', seatId: 'mgr1', from: plus(10), to: plus(17),
    reason: 'Leave planned with the family.', note: '', decisionId: null, declaredBySeatId: 'mgr1',
    declaredOn: ago(2), declaredAt: `${ago(2)}T09:00:00.000Z`, status: 'active',
  }];
  state.dutyStandbyAnswers = [{
    id: 'ans-a', coverId: 'cover-a', dutyId: 'lead1|coach', seatId: 'lead1', answeredBySeatId: 'mgr1',
    answer: 'accepted', windowFrom: ago(0), windowTo: plus(14), note: 'I can take the cadence.',
    answeredOn: ago(1), answeredAt: `${ago(1)}T10:00:00.000Z`, status: 'active',
  }];
  state.dutyRehearsals = [{
    id: 'reh-a', coverRowId: 'cover-a', dutyId: 'lead1|coach', dutyKey: 'coach', seatId: 'lead1',
    coverSeatId: 'mgr1', recordedBySeatId: 'lead1', rehearsedOn: ago(2), recordedOn: ago(2),
    recordedAt: `${ago(2)}T12:00:00.000Z`, mode: 'walkthrough', outcome: 'ready',
    note: 'Walked the cadence end to end.', decisionId: null, status: 'active',
  }];
  state.branchReadingAsks = [{
    id: 'ask-a', targetSeatId: 'mgr1', askedBySeatId: 'dir1', askedOn: ago(3),
    askedAt: `${ago(3)}T09:00:00.000Z`, note: 'How is your branch holding for the leave week?', status: 'open',
  }];
  state.branchReadings = [{
    id: 'reading-a', askId: 'ask-a', branchSeatId: 'mgr1', answeredBySeatId: 'mgr1', answer: 'published',
    band: 'holding', note: 'Holding for now; one duty line is thin.', answeredOn: ago(1),
    answeredAt: `${ago(1)}T11:00:00.000Z`, status: 'active',
  }];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const store = createStore({ storage, now: () => NOW, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api };
}

const asSeat = (state, seatId) => normalizeState(
  { ...state, settings: { ...state.settings, activeSeatId: seatId } },
  { now: NOW },
).state;

function routeQuery(route) {
  return new URLSearchParams(route.slice(1).split('?')[1] || '');
}

/* ------------------------------------------------------- 1. resolver routes */

test('every coverage-family route carries its encoded focus id and no protected content', () => {
  assert.equal(SCHEMA_VERSION, 156, 'no schema bump: this is a view/route contract');
  const state = fixture();
  const cases = [
    ['dutycover', 'cover-a', 'cover', '/duty-cover', 'register'],
    ['absenceplan', 'abs-mgr', 'plan', '/duty-cover', 'plan'],
    ['standbyanswer', 'ans-a', 'answer', '/standby', 'asked'],
    ['rehearsal', 'reh-a', 'rehearsal', '/duty-cover', 'plan'],
    ['branchask', 'ask-a', 'ask', '/duty-cover', 'readings'],
    ['branchreading', 'reading-a', 'reading', '/duty-cover', 'readings'],
  ];
  for (const [type, id, param, routePath, panel] of cases) {
    assert.equal(RECORD_FOCUS_PARAMS[type], param, `${type} declares its focus parameter once`);
    const resolved = resolveLinkedEntity(state, type, id);
    assert.ok(resolved, `${type}:${id} resolves`);
    const [pathPart] = resolved.route.slice(1).split('?');
    assert.equal(pathPart, routePath, `${type} keeps its owning terminal`);
    const query = routeQuery(resolved.route);
    assert.equal(query.get('panel'), panel, `${type} keeps its owning panel`);
    assert.equal(query.get(param), id, `${type} carries the exact focus id`);
    assert.equal(resolved.route.includes('seatId'), false, `${type} puts no seat id in the URL`);
  }
  // The disclosure wall is unchanged: no note, no reason, no answerer words.
  const cover = resolveLinkedEntity(state, 'dutycover', 'cover-a');
  assert.equal(JSON.stringify(cover).includes('Named as the stand-in'), false);
  const absence = resolveLinkedEntity(state, 'absenceplan', 'abs-mgr');
  assert.equal(JSON.stringify(absence).includes('Leave planned'), false);
  const answer = resolveLinkedEntity(state, 'standbyanswer', 'ans-a');
  assert.equal(JSON.stringify(answer).includes('I can take the cadence'), false);
  const ask = resolveLinkedEntity(state, 'branchask', 'ask-a');
  assert.equal(JSON.stringify(ask).includes('mgr1'), false, 'the branch ask carries no seat id even in raw');
  assert.equal(JSON.stringify(ask).includes('leave week'), false);
  const reading = resolveLinkedEntity(state, 'branchreading', 'reading-a');
  assert.equal(JSON.stringify(reading).includes('one duty line is thin'), false);
  // Session-176 defect fixed at the source: the ledger stores `answeredOn`,
  // so the label must print the day, never `published undefined`.
  assert.match(reading.status, new RegExp(`published ${ago(1)}`));
  assert.equal(reading.raw.publishedOn, ago(1));
  // URL-encoding contract: an id with reserved characters round-trips. The
  // schema deliberately restricts stored ids to [a-zA-Z0-9_-], so this is
  // tested against the resolver directly (as the lineage sweep does) — the
  // resolver must encode whatever id it is handed, not assume the vocabulary.
  const odd = { ...fixture(), dutyCovers: [{ ...fixture().dutyCovers[0], id: 'cover x/&?=1' }] };
  const oddResolved = resolveLinkedEntity(odd, 'dutycover', 'cover x/&?=1');
  assert.ok(oddResolved, 'the resolver resolves the odd id');
  assert.equal(routeQuery(oddResolved.route).get('cover'), 'cover x/&?=1');
});

/* ------------------------------------------------- 2. focused view rendering */

test('each destination view selects exactly the named row, at manager and director altitudes', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
  })) globalThis[k] = v;

  const base = fixture();
  const renderRoute = (seatId, type, id, render) => {
    const scoped = asSeat(base, seatId);
    const { store, api } = boot(scoped);
    const resolved = resolveLinkedEntity(store.state, type, id);
    assert.ok(resolved, `${type}:${id} resolves for ${seatId}`);
    const ctx = { state: store.state, store, api, now: NOW, query: routeQuery(resolved.route), navigate: () => {}, refresh: () => {}, warnings: [] };
    const root = window.document.getElementById('view');
    root.replaceChildren(render(ctx));
    return { root, resolved, store };
  };

  const assertSelected = (root, selector, attr, id, label) => {
    const matches = [...root.querySelectorAll(selector)].filter((n) => n.getAttribute(attr) === id);
    assert.equal(matches.length, 1, `${label}: exactly one row carries ${attr}=${id}`);
    assert.ok(matches[0].classList.contains('lineage-selected'), `${label}: the named row is visibly selected`);
    const selected = root.querySelectorAll('.lineage-selected');
    assert.equal(selected.length, 1, `${label}: nothing else is selected`);
  };

  // The manager reads names; the director does not — the SAME id focuses both.
  for (const seatId of ['mgr1', 'dir1']) {
    const cover = renderRoute(seatId, 'dutycover', 'cover-a', renderDutyCover);
    assertSelected(cover.root, 'tr[data-cover-id]', 'data-cover-id', 'cover-a', `${seatId} cover`);
    assert.equal(cover.root.querySelector('tr[data-cover-id="cover-b"]')?.classList.contains('lineage-selected') ?? false, false);

    const rehearsal = renderRoute(seatId, 'rehearsal', 'reh-a', renderDutyCover);
    assertSelected(rehearsal.root, 'tr[data-rehearsal-id]', 'data-rehearsal-id', 'reh-a', `${seatId} rehearsal`);

    const answer = renderRoute(seatId, 'standbyanswer', 'ans-a', renderStandby);
    assertSelected(answer.root, 'tr[data-answer-id]', 'data-answer-id', 'ans-a', `${seatId} answer`);
  }

  // The absence is mgr1's own; the director sees it as a rolled-up row.
  const ownPlan = renderRoute('mgr1', 'absenceplan', 'abs-mgr', renderDutyCover);
  const ownCard = ownPlan.root.querySelector('#absence-plan-abs-mgr');
  assert.ok(ownCard?.classList.contains('lineage-selected'), 'the seat\u2019s own absence card is selected');
  const dirPlan = renderRoute('dir1', 'absenceplan', 'abs-mgr', renderDutyCover);
  assertSelected(dirPlan.root, 'tr[data-plan-id]', 'data-plan-id', 'abs-mgr', 'director rollup plan');

  // The branch exchange: the asker's table row and the answerer's card.
  const askerView = renderRoute('dir1', 'branchask', 'ask-a', renderDutyCover);
  assertSelected(askerView.root, 'tr[data-ask-id]', 'data-ask-id', 'ask-a', 'asker ask row');
  const answererView = renderRoute('mgr1', 'branchask', 'ask-a', renderDutyCover);
  assertSelected(answererView.root, '[data-ask-id]', 'data-ask-id', 'ask-a', 'answerer ask card');
  const readingAsker = renderRoute('dir1', 'branchreading', 'reading-a', renderDutyCover);
  assertSelected(readingAsker.root, 'tr[data-reading-id]', 'data-reading-id', 'reading-a', 'asker reading row');
  const readingAnswerer = renderRoute('mgr1', 'branchreading', 'reading-a', renderDutyCover);
  assertSelected(readingAnswerer.root, '[data-reading-id]', 'data-reading-id', 'reading-a', 'answerer reading card');

  // Above the manager altitude the focus row still prints no person name.
  const dirCover = renderRoute('dir1', 'dutycover', 'cover-a', renderDutyCover);
  const selectedRow = dirCover.root.querySelector('tr[data-cover-id="cover-a"]');
  assert.equal(selectedRow.textContent.includes('Mei Chen'), false, 'focus does not un-redact a cover name');

  // The cover's own chair honours the same id. (mgr1's asked board ALSO carries
  // the row — the holder lead1 is inside mgr1's scope — and the loop above
  // already proved it focuses there. The For-me chair is the second home.)
  const scoped = asSeat(base, 'mgr1');
  const { store: s2, api: a2 } = boot(scoped);
  const forMeCtx = { state: s2.state, store: s2, api: a2, now: NOW, query: new URLSearchParams('panel=for-me&answer=ans-a'), navigate: () => {}, refresh: () => {}, warnings: [] };
  const forMeRoot = window.document.getElementById('view');
  forMeRoot.replaceChildren(renderStandby(forMeCtx));
  const forMeCard = forMeRoot.querySelector('[data-answer-id="ans-a"]');
  assert.ok(forMeCard?.classList.contains('lineage-selected'), 'For me focuses the cover\u2019s own answer card');

  dom.window.close();
});

/* --------------------------------------------------- 3. absent focus, honestly */

test('a focus id outside scope prints the absent note, selects nothing, and mutates nothing', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
  })) globalThis[k] = v;

  // lead2 cannot see lead1's cover declaration answer or rehearsal rows.
  const scoped = asSeat(fixture(), 'lead2');
  const { store, api } = boot(scoped);
  const before = JSON.stringify({
    covers: store.state.dutyCovers, answers: store.state.dutyStandbyAnswers,
    rehearsals: store.state.dutyRehearsals, plans: store.state.absencePlans,
    asks: store.state.branchReadingAsks, readings: store.state.branchReadings, links: store.state.links,
  });
  const root = window.document.getElementById('view');
  const attempts = [
    [renderStandby, 'panel=asked&answer=ans-a'],
    [renderDutyCover, 'panel=plan&rehearsal=reh-a'],
    [renderDutyCover, 'panel=plan&plan=abs-mgr'],
    [renderDutyCover, 'panel=readings&ask=ask-a'],
    [renderDutyCover, 'panel=register&cover=no-such-cover'],
  ];
  for (const [render, query] of attempts) {
    const ctx = { state: store.state, store, api, now: NOW, query: new URLSearchParams(query), navigate: () => {}, refresh: () => {}, warnings: [] };
    root.replaceChildren(render(ctx));
    assert.equal(root.querySelectorAll('.lineage-selected').length, 0, `${query}: nothing is selected`);
    assert.match(root.textContent, /The linked record is not here|it lives in your own chair/, `${query}: the miss is printed, not silent`);
  }
  const after = JSON.stringify({
    covers: store.state.dutyCovers, answers: store.state.dutyStandbyAnswers,
    rehearsals: store.state.dutyRehearsals, plans: store.state.absencePlans,
    asks: store.state.branchReadingAsks, readings: store.state.branchReadings, links: store.state.links,
  });
  assert.equal(after, before, 'opening deep links wrote nothing');
  dom.window.close();
});

/* ---------------------------------------- 4. an old rehearsal is brought in */

test('a rehearsal older than the printed 40 rows is brought into view and focused', async () => {
  const dom = new JSDOM('<!doctype html><html><body><main id="view"></main></body></html>', {
    url: 'https://leados.test/', pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
  })) globalThis[k] = v;

  const base = fixture();
  // 45 newer rehearsals on the same cover row; the linked one is the oldest.
  const newer = Array.from({ length: 45 }, (_, i) => ({
    ...base.dutyRehearsals[0],
    id: `reh-new-${i}`,
    rehearsedOn: ago(1),
    recordedOn: ago(1),
    recordedAt: `${ago(1)}T12:${String(i).padStart(2, '0')}:00.000Z`,
  }));
  const state = normalizeState({ ...base, dutyRehearsals: [...newer, ...base.dutyRehearsals] }, { now: NOW }).state;
  const scoped = asSeat(state, 'mgr1');
  const { store, api } = boot(scoped);
  assert.ok(store.state.dutyRehearsals.some((r) => r.id === 'reh-a'), 'the old rehearsal survives normalization');
  const resolved = resolveLinkedEntity(store.state, 'rehearsal', 'reh-a');
  const ctx = { state: store.state, store, api, now: NOW, query: routeQuery(resolved.route), navigate: () => {}, refresh: () => {}, warnings: [] };
  const root = window.document.getElementById('view');
  root.replaceChildren(renderDutyCover(ctx));
  const row = root.querySelector('tr[data-rehearsal-id="reh-a"]');
  assert.ok(row, 'the linked row is printed even though it is outside the 40 newest');
  assert.ok(row.classList.contains('lineage-selected'), 'and it is the selected row');
  assert.match(root.textContent, /older than the 40 most recent/, 'the bring-in is explained, not silent');
  dom.window.close();
});

/* ------------------------------------------------------------ 5. axe render */

test('the focused panels render axe-clean at the director seat', async () => {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    consoleErrors.push(e.message);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));
  const dom = new JSDOM(HTML, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.__LEADOS_TEST__ = true;
  const styleEl = window.document.createElement('style');
  styleEl.textContent = CSS;
  window.document.head.appendChild(styleEl);
  for (const [k, v] of Object.entries({
    window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent,
    FileReader: window.FileReader, localStorage: window.localStorage,
  })) globalThis[k] = v;

  const view = window.document.querySelector('#view') || (() => {
    const main = window.document.createElement('main');
    main.id = 'view';
    window.document.body.appendChild(main);
    return main;
  })();
  if (!window.axe) window.eval(AXE_SRC);

  const scoped = asSeat(fixture(), 'dir1');
  const { store, api } = boot(scoped);
  const routes = [
    [renderDutyCover, 'dutycover', 'cover-a'],
    [renderDutyCover, 'absenceplan', 'abs-mgr'],
    [renderDutyCover, 'branchask', 'ask-a'],
    [renderStandby, 'standbyanswer', 'ans-a'],
  ];
  for (const [render, type, id] of routes) {
    const resolved = resolveLinkedEntity(store.state, type, id);
    const ctx = { state: store.state, store, api, now: NOW, query: routeQuery(resolved.route), navigate: () => {}, refresh: () => {}, warnings: [] };
    view.replaceChildren(render(ctx));
    assert.ok(view.querySelector('h1'), `${type}: the page has an h1`);
    assert.ok(!/undefined|\[object Object\]/.test(view.textContent), `${type}: no placeholder leaked into the DOM`);
    const res = await window.axe.run(view, { rules: { 'color-contrast': { enabled: false } } });
    assert.deepEqual(Array.from(res.violations).map((v) => `${v.id}: ${v.help}`), [], `axe violations following ${type}:${id}`);
  }
  assert.deepEqual(consoleErrors, [], 'no console errors during focused renders');
  dom.window.close();
});
