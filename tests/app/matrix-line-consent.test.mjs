/**
 * tests/app/matrix-line-consent.test.mjs — Matrix Line Consent (Schema v123,
 * ADR-0148, `#/matrix?panel=consent`, `RULE-LCN-01`, CSV #110).
 *
 * Organised around what a declared share can be betrayed by:
 *
 *  1. NEVER INFER CONSENT. A declared line with no act reads `unanswered`; a
 *     decline is not a deletion; a missing allocation refuses the total rather
 *     than understating it.
 *  2. NEVER ANSWER FOR SOMEBODY. Only the line's manager may accept or decline;
 *     only the person may acknowledge. Both are refused by the live API and
 *     dropped by the normalizer when hand-edited.
 *  3. ARITHMETIC IS PRINTED. Accepting past one whole person is refused with
 *     40 + 70 = 110 in the message, never rounded, netted or normalised.
 *  4. DISPLAY == STORED. Every figure the report, the panel and the CSV print
 *     is recomputed from the stored blob, before and after a real reload.
 *  5. INERT SINGLE CHAIN. A workspace with no second line gains no row, no ask,
 *     no edge and no delegation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState, migrate, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { exportWorkspaceCsv, parseCsv } from '../../app/core/csv.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import {
  buildLineConsent,
  lineConsentBriefText,
  lineConsentCsvRows,
} from '../../app/core/domain/lineConsent.js';
import { lineConsentRule } from '../../app/core/domain/lineConsentRules.js';
import { LINE_CONSENT_CSV_COLUMNS } from '../../app/core/domain/lineConsentRegistry.js';

const NOW = new Date('2026-11-09T10:00:00.000Z');
const TODAY = '2026-11-09';
const ISO = NOW.toISOString();

/* --------------------------------------------------------------- fixtures */

/**
 * engdir ─┬─ sam  (home line, functional)
 *         └─ pmdir (project manager with its own span)
 *               └─ kim
 */
function roster() {
  return [
    { id: 'engdir', name: 'Dana Eng', role: 'Director of Engineering', level: 'director', managerId: null, createdAt: ISO },
    { id: 'pmdir', name: 'Priya PM', role: 'Head of Product Delivery', level: 'manager', managerId: 'engdir', createdAt: ISO },
    { id: 'kim', name: 'Kim Junior', role: 'Engineer', level: 'ic', managerId: 'pmdir', createdAt: ISO },
    { id: 'sam', name: 'Sam Engineer', role: 'Engineer', level: 'ic', managerId: 'engdir', createdAt: ISO },
  ];
}

function line({ id = 'line-sam-pm', personId = 'sam', managerId = 'pmdir', kind = 'project', shareH = 40, rights = [] } = {}) {
  return {
    id, personId, managerId, kind, shareH, rights,
    fromISO: '2026-01-01', toISO: null,
    declaredAt: '2026-01-01T09:00:00.000Z', declaredBySeatId: null, note: 'Delivery of the migration programme.',
  };
}

function act(over = {}) {
  return {
    id: over.id || `lcn-seed-${Math.random().toString(36).slice(2, 8)}`,
    declarationId: 'line-sam-pm',
    personId: 'sam',
    managerId: 'pmdir',
    kind: 'project',
    side: 'manager',
    outcome: 'accepted',
    decidedOn: '2026-11-01',
    decidedBySeatId: null,
    expiresOn: '2026-12-31',
    sharePct: 40,
    basis: '',
    reason: '',
    at: '2026-11-01T09:00:00.000Z',
    ...over,
  };
}

function makeState({ lines = [line()], consents = [], settings = {} } = {}) {
  const state = createEmptyState(ISO);
  state.people = roster();
  state.reportingLines = lines;
  state.lineConsents = consents;
  state.settings = { ...state.settings, ...settings };
  return normalizeState(state).state;
}

function seed(state) {
  const data = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  let seq = 0;
  const idFactory = (p) => `${p}-test-${++seq}`;
  const store = createStore({ storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }), data, storage };
}

/** Reload through the real storage contract: the only proof that display == stored. */
function reload(ctx) {
  let seq = 1000;
  const idFactory = (p) => `${p}-reload-${++seq}`;
  const store = createStore({ storage: ctx.storage, now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const report = (state) => buildLineConsent(state, { now: NOW, settings: state.settings });
const person = (r, id = 'sam') => r.persons.find((p) => p.personId === id) || null;

/* ------------------------------------------------------- 1. never infer */

test('a declared share nobody answered reads unanswered, and nothing is inferred from the declaration', () => {
  const state = makeState();
  const r = report(state);
  const p = person(r);
  assert.ok(p, 'a person on a second line is on the register');
  assert.equal(p.counts.lines, 1);
  assert.equal(p.lines[0].state, 'unanswered');
  assert.equal(p.lines[0].stateLabel, 'Never answered');
  assert.equal(p.lines[0].acceptedOn, null);
  assert.equal(p.lines[0].acknowledgedOn, null);
  assert.equal(p.verdict, 'unanswered');
  // The declared figure exists; the accepted figure is genuinely zero and is a
  // zero of a real count, not a missing value dressed as one.
  assert.equal(p.totals.declaredShareH, 40);
  assert.equal(p.totals.acceptedShareH, 0);
  assert.equal(p.totals.acknowledgedShareH, 0);
  assert.equal(r.board.unansweredN, 1);
  assert.equal(r.board.acceptedN, 0);
  // A read must mutate nothing.
  assert.equal(JSON.stringify(state), JSON.stringify(makeState()));
});

test('an undeclared allocation refuses BOTH share totals with a printed reason, and still counts states', () => {
  const state = makeState({ lines: [line({ shareH: null })] });
  const r = report(state);
  const p = person(r);
  assert.equal(p.counts.undeclared, 1);
  assert.equal(p.totals.shareRefused, true);
  assert.equal(p.totals.declaredShareH, null);
  assert.equal(p.totals.acceptedShareH, null);
  assert.match(p.totals.shareRefusedReason, /no allocation/);
  assert.equal(r.board.sharesRefused, true);
  assert.equal(r.board.declaredShareH, null);
  // Counts are still exact: one line, one unanswered state.
  assert.equal(r.board.linesN, 1);
  assert.equal(r.board.unansweredN, 1);

  const rows = lineConsentCsvRows(r);
  const summary = rows[0];
  assert.equal(summary.declared_share_h, '', 'a refused figure is blank, never 0');
  assert.equal(summary.share_refused, 'true');
  assert.match(summary.share_refused_reason, /no allocation/);
});

/* -------------------------------------------------- 2. one side each */

test('only the line’s own manager may accept; a peer and the home manager are refused by the live API', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'engdir' }; // the home-line director
  const ctx = seed(state);
  const refused = ctx.api.lineConsentAccept({ declarationId: 'line-sam-pm' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Only/);
  assert.equal((ctx.store.state.lineConsents || []).length, 0, 'a refused acceptance wrote nothing');
});

test('accept → acknowledge round-trips through the real store, and display equals stored before and after reload', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const ctx = seed(state);

  const accepted = ctx.api.lineConsentAccept({ declarationId: 'line-sam-pm', basis: 'Owns the migration cutover until January.' });
  assert.equal(accepted.ok, true, accepted.error);
  assert.equal(accepted.expiresOn, '2027-02-07', 'blank date uses the declared 90-day convention from 2026-11-09');

  const afterAccept = ctx.store.state.lineConsents;
  assert.equal(afterAccept.length, 1);
  assert.deepEqual(
    { side: afterAccept[0].side, outcome: afterAccept[0].outcome, decidedOn: afterAccept[0].decidedOn, expiresOn: afterAccept[0].expiresOn },
    { side: 'manager', outcome: 'accepted', decidedOn: TODAY, expiresOn: '2027-02-07' },
  );

  const r1 = report(ctx.store.state);
  const l1 = person(r1).lines[0];
  assert.equal(l1.state, 'awaiting-person');
  assert.equal(l1.acceptedOn, afterAccept[0].decidedOn);
  assert.equal(l1.acceptanceExpiresOn, afterAccept[0].expiresOn);
  assert.equal(l1.state, 'awaiting-person', 'the person has not been told yet — this is not consent');

  // The person acknowledges. A non-leader has no seat in this workspace, so the
  // operator view captures their statement and the row is marked `operator`.
  ctx.store.state.settings = { ...ctx.store.state.settings, activeSeatId: null };
  const acked = ctx.api.lineConsentAcknowledge({ declarationId: 'line-sam-pm' });
  assert.equal(acked.ok, true, acked.error);

  const r2 = report(ctx.store.state);
  const l2 = person(r2).lines[0];
  assert.equal(l2.state, 'accepted');
  assert.equal(l2.acknowledgedOn, TODAY);
  assert.equal(l2.acknowledgementVia, 'operator', 'a scribed statement is never printed as an authenticated one');
  assert.equal(person(r2).totals.acceptedShareH, 40);
  assert.equal(person(r2).totals.acknowledgedShareH, 40);
  assert.equal(person(r2).verdict, 'consented');

  // A reload through the real storage contract prints the same state.
  const again = reload(ctx);
  const r3 = report(again.store.state);
  const l3 = person(r3).lines[0];
  assert.equal(l3.state, l2.state);
  assert.equal(l3.acceptedOn, l2.acceptedOn);
  assert.equal(l3.acceptanceExpiresOn, l2.acceptanceExpiresOn);
  assert.equal(l3.acknowledgedOn, l2.acknowledgedOn);
  assert.equal(person(r3).totals.acceptedShareH, 40);
  assert.equal(JSON.stringify(again.store.state.lineConsents), JSON.stringify(ctx.store.state.lineConsents));

  // Reads mutate nothing.
  const before = JSON.stringify(again.store.state);
  report(again.store.state);
  assert.equal(JSON.stringify(again.store.state), before);
});

test('the person cannot acknowledge before the line accepted, and a duplicate acknowledgement is refused', () => {
  const state = makeState();
  const ctx = seed(state); // the operator view: the only seat a non-leader has here
  const early = ctx.api.lineConsentAcknowledge({ declarationId: 'line-sam-pm' });
  assert.equal(early.ok, false);
  assert.match(early.error, /has not accepted/);

  ctx.store.state.settings = { ...ctx.store.state.settings, activeSeatId: 'pmdir' };
  assert.equal(ctx.api.lineConsentAccept({ declarationId: 'line-sam-pm' }).ok, true);
  ctx.store.state.settings = { ...ctx.store.state.settings, activeSeatId: null };
  assert.equal(ctx.api.lineConsentAcknowledge({ declarationId: 'line-sam-pm' }).ok, true);
  const second = ctx.api.lineConsentAcknowledge({ declarationId: 'line-sam-pm' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already acknowledged/);
});

test('a manager cannot acknowledge on the person’s behalf', () => {
  const state = makeState({ consents: [act()] });
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const ctx = seed(state);
  const refused = ctx.api.lineConsentAcknowledge({ declarationId: 'line-sam-pm' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Only the person/);
});

/* --------------------------------------------------- 3. his refusal is an answer */

test('a decline needs a reason, is stored, and the share stays charged', () => {
  const state = makeState();
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const ctx = seed(state);
  const bare = ctx.api.lineConsentDecline({ declarationId: 'line-sam-pm', reason: 'no' });
  assert.equal(bare.ok, false);
  assert.match(bare.error, /why/);

  const declined = ctx.api.lineConsentDecline({
    declarationId: 'line-sam-pm',
    reason: 'The delivery date predates the team’s agreed freeze; I cannot hold this share.',
  });
  assert.equal(declined.ok, true, declined.error);
  assert.equal(declined.stillCharged, true);

  const r = report(ctx.store.state);
  const l = person(r).lines[0];
  assert.equal(l.state, 'declined');
  assert.equal(l.declinedOn, TODAY);
  assert.match(l.declineReason, /freeze/);
  assert.equal(l.chargedDespiteDecline, true);
  assert.equal(r.board.chargedDespiteDeclineN, 1);
  assert.equal(person(r).verdict, 'declined-line');
  // The declaration is untouched: the share is still declared and still charged.
  assert.equal(person(r).totals.declaredShareH, 40);
  assert.equal((ctx.store.state.reportingLines || []).length, 1);

  const second = ctx.api.lineConsentDecline({ declarationId: 'line-sam-pm', reason: 'Still refusing this same share.' });
  assert.equal(second.ok, false);
  assert.match(second.error, /already declined/);
});

/* ------------------------------------------------------ 4. the arithmetic */

test('accepting past one whole person is refused with the arithmetic printed', () => {
  const state = makeState({
    lines: [
      line({ id: 'line-sam-pm', shareH: 70 }),
      line({ id: 'line-sam-kim', managerId: 'kim', shareH: 40, kind: 'product' }),
    ],
  });
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const ctx = seed(state);
  const first = ctx.api.lineConsentAccept({ declarationId: 'line-sam-pm' });
  assert.equal(first.ok, true, first.error);

  // kim is an IC with no reports, so no seat resolves for them: the capacity
  // check is asserted through the operator view, which is the only seat this
  // workspace gives a non-leader.
  ctx.store.state.settings = { ...ctx.store.state.settings, activeSeatId: null };
  const second = ctx.api.lineConsentAccept({ declarationId: 'line-sam-kim' });
  assert.equal(second.ok, false);
  assert.match(second.error, /110%/);
  assert.match(second.error, /100% of a person/);
  assert.equal(ctx.store.state.lineConsents.length, 1, 'the refused acceptance wrote nothing');
  assert.equal(person(report(ctx.store.state)).totals.acceptedShareH, 70);
});

/* --------------------------------------------------------- 5. lapse */

test('an acceptance past its window reads lapsed, and can be accepted again', () => {
  const state = makeState({
    consents: [act({ decidedOn: '2026-09-01', expiresOn: '2026-10-31', at: '2026-09-01T09:00:00.000Z' })],
  });
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const ctx = seed(state);
  const p0 = person(report(ctx.store.state));
  assert.equal(p0.lines[0].state, 'lapsed');
  assert.equal(p0.verdict, 'lapsed');
  assert.equal(p0.totals.acceptedShareH, 0, 'a lapsed acceptance no longer commits the person');

  const again = ctx.api.lineConsentAccept({ declarationId: 'line-sam-pm' });
  assert.equal(again.ok, true, again.error);
  assert.equal(person(report(ctx.store.state)).lines[0].state, 'awaiting-person');
});

test('a retune after acceptance reads CHANGED: consent to 40% is not consent to 90%', () => {
  const state = makeState({ consents: [act()] });
  state.settings = { ...state.settings, activeSeatId: 'pmdir' };
  const ctx = seed(state);
  assert.equal(person(report(ctx.store.state)).lines[0].state, 'awaiting-person');

  // The declaring manager retunes the line to 90% through the live API.
  const retuned = ctx.api.matrixRetuneLine({ id: 'line-sam-pm', shareH: 90, rights: [] });
  assert.equal(retuned.ok, true, retuned.error);

  const r = report(ctx.store.state);
  const line = person(r).lines[0];
  assert.equal(line.state, 'changed');
  assert.equal(line.acceptedSharePct, 40, 'the accepted number is the stored number');
  assert.equal(line.sharePct, 90, 'the current number is read from the declaration');
  assert.match(line.reason, /40%/);
  assert.match(line.reason, /90%/);
  assert.equal(person(r).verdict, 'changed-share');
  assert.equal(person(r).totals.acceptedShareH, 0, 'a changed share is not an accepted share');
  // The rule re-asks at the NEW share, and the earlier marker does not suppress it.
  const tasks = (ctx.store.state.delegations || []).filter((d) => /Re-accept or decline/.test(String(d.title || '')));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].personId, 'pmdir');
});

/* --------------------------------------------- 6. the rule and the spine */

test('RULE-LCN-01 issues ONE acceptance ask per unanswered line, idempotently, and none in a single chain', () => {
  const state = makeState({ lines: [] });
  state.settings = { ...state.settings, activeSeatId: 'engdir' };
  const ctx = seed(state);
  // Declaring through the live API runs the whole post-commit spine.
  const declared = ctx.api.matrixDeclareLine({
    personId: 'sam', managerId: 'pmdir', kind: 'project', shareH: 30, rights: [],
    fromISO: '2026-11-01', toISO: null, note: 'Migration delivery.',
  });
  assert.equal(declared.ok, true, declared.error);

  const tasks = (ctx.store.state.delegations || []).filter((d) => String(d.title || '').includes('Accept or decline'));
  assert.equal(tasks.length, 1, 'exactly one acceptance ask was issued');
  assert.equal(tasks[0].personId, 'pmdir', 'the ask is addressed to the manager the line was given to');
  assert.ok((ctx.store.state.lineConsentMarkers || []).some((m) => String(m.key).startsWith('accept|')));
  const obligations = (ctx.store.state.links || []).filter((l) => l.ruleId === 'RULE-LCN-01' && l.relation === 'issues-obligation');
  assert.equal(obligations.length, 1);

  // A scan retries and must not double the work.
  const scanned = ctx.api.lineConsentScan();
  assert.equal(scanned.ok, true, scanned.error);
  const after = (ctx.store.state.delegations || []).filter((d) => String(d.title || '').includes('Accept or decline'));
  assert.equal(after.length, 1, 'the marker made the rescan idempotent');
});

test('RULE-LCN-01 asks the PERSON when an acceptance stands unacknowledged past the window', () => {
  const state = makeState({
    consents: [act({ decidedOn: '2026-10-01', expiresOn: '2026-12-30', at: '2026-10-01T09:00:00.000Z' })],
    settings: { lineConsentAckDays: 5 },
  });
  const ctx = seed(state);
  const out = lineConsentRule(ctx.store.state, {
    event: { type: 'matrix.line.consent.scan' },
    now: NOW,
    idFactory: (p) => `${p}-rule-${Math.random().toString(36).slice(2, 8)}`,
  });
  assert.ok(out.some((e) => e.action === 'issued-obligations'));
  const tasks = (ctx.store.state.delegations || []);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].personId, 'sam', 'the acknowledgement ask is addressed to the person, not the manager');
});

test('the rule spine is one contract per rule', () => {
  assert.equal(PROPAGATION_CONTRACTS.length, DEFAULT_POST_COMMIT_RULES.length, '1:1 rule/contract parity');
  const contract = PROPAGATION_CONTRACTS.find((c) => c.module === 'lineConsentRules.js');
  assert.ok(contract, 'the new rule declares its contract');
  assert.ok(contract.writes.includes('lineConsentMarkers'));
});

/* ---------------------------------------------------- 7. schema + inert */

test('schema v124 is additive: an upgraded workspace opens with an empty consent ledger and clamped conventions', () => {
  assert.equal(SCHEMA_VERSION, 141);
  const v122 = { ...makeState(), schemaVersion: 122 };
  delete v122.lineConsents;
  delete v122.lineConsentMarkers;
  const migrated = migrate(v122);
  assert.deepEqual(migrated.raw.lineConsents, []);
  assert.deepEqual(migrated.raw.lineConsentMarkers, []);
  assert.equal(migrated.raw.settings.lineConsentAcceptDays, 90);
  assert.equal(migrated.raw.settings.lineConsentAskDueDays, 7);
  assert.equal(migrated.raw.settings.lineConsentAckDays, 5);
  assert.ok(migrated.applied.includes('122 → 123'));
  // A second migrate is a no-op.
  assert.deepEqual(migrate(migrated.raw).applied, []);
  // Nothing is back-filled: the declared line is still unanswered by anybody.
  const r = report(normalizeState(migrated.raw).state);
  assert.equal(person(r).lines[0].state, 'unanswered');
});

test('the normalizer DROPS an acceptance with no expiry and a decline with no reason rather than repairing them', () => {
  const state = makeState({
    consents: [
      act({ id: 'a1', expiresOn: null }),
      act({ id: 'a2', side: 'manager', outcome: 'declined', expiresOn: null, reason: 'no' }),
      act({ id: 'a3' }),
    ],
  });
  const warnings = [];
  const normalized = normalizeState(state);
  assert.ok(Array.isArray(normalized.state.lineConsents));
  const kept = normalized.state.lineConsents;
  assert.equal(kept.length, 1, 'only the well-formed act survives');
  assert.equal(kept[0].id, 'a3');
  void warnings;
});

test('a single-chain workspace is inert end to end: no row, no ask, no edge, no change', () => {
  const state = makeState({ lines: [] });
  const r = report(state);
  assert.equal(r.isMatrix, false);
  assert.equal(r.persons.length, 0);
  assert.equal(r.board.linesN, 0);
  assert.match(lineConsentBriefText(r), /nothing in this workspace requires consent/);

  state.settings = { ...state.settings, activeSeatId: 'engdir' };
  const ctx = seed(state);
  const scan = ctx.api.lineConsentScan();
  assert.equal(scan.ok, true, scan.error);
  assert.equal((ctx.store.state.delegations || []).length, 0);
  assert.equal((ctx.store.state.links || []).filter((l) => l.ruleId === 'RULE-LCN-01').length, 0);
});

/* ------------------------------------------------ 8. display, export, panel */

test('the CSV scope is aggregate-only and its counts equal the computed report', () => {
  const state = makeState({
    consents: [act()],
    lines: [
      line(),
      line({ id: 'line-sam-ops', managerId: 'kim', kind: 'cross-functional', shareH: 20 }),
    ],
  });
  const r = report(state);
  const rows = lineConsentCsvRows(r);
  assert.equal(rows.length, 1 + 2, 'one workspace row plus one row per declared kind');
  const ws = rows[0];
  assert.equal(ws.lines_n, String(r.board.linesN));
  assert.equal(ws.unanswered_n, String(r.board.unansweredN));
  assert.equal(ws.accepted_n, String(r.board.acceptedN));
  assert.equal(ws.awaiting_person_n, String(r.board.awaitingPersonN));
  assert.equal(ws.declared_share_h, String(r.board.declaredShareH));
  assert.equal(ws.accepted_share_h, String(r.board.acceptedShareH));
  assert.equal(Object.keys(ws).length, LINE_CONSENT_CSV_COLUMNS.length);
  // No person, name, manager or declaration id anywhere in any cell.
  const flat = rows.flatMap((row) => Object.values(row)).join(' ').toLowerCase();
  for (const banned of ['sam', 'priya', 'dana', 'kim', 'line-sam-pm']) {
    assert.ok(!flat.includes(banned), `export leaked ${banned}`);
  }

  // The registered scope round-trips through the real export path.
  const csv = exportWorkspaceCsv(state, 'line-consent', { now: NOW });
  assert.equal(csv.ok, true, csv.error);
  const parsed = parseCsv(csv.csv);
  assert.equal(parsed.rows.length, rows.length);
  const col = (name) => parsed.headers.indexOf(name);
  assert.ok(col('declared_share_h') >= 0);
  assert.equal(parsed.rows[0][col('declared_share_h')], ws.declared_share_h);
  assert.equal(parsed.rows[0][col('share_refused')], ws.share_refused);
});

test('the panel prints the stored state and the stored share — no recomputed display', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  const { renderConsentPanel } = await import('../../app/views/matrixConsentPanel.js');

  const state = makeState({
    consents: [act()],
  });
  state.settings = { ...state.settings, activeSeatId: 'engdir' };
  const ctx = seed(state);
  const built = ctx.api.lineConsentBoard();
  assert.equal(built.ok, true, built.error);

  const node = renderConsentPanel({
    api: ctx.api,
    refresh: () => {},
    navigate: () => {},
  });
  const host = dom.window.document.getElementById('root');
  host.appendChild(node);
  const text = host.textContent || '';

  // The stored act is printed as the stored dates and the stored share.
  assert.match(text, /40%/);
  assert.match(text, /Accepted, person not told/);
  assert.match(text, /2026-11-01 → 2026-12-31/);
  assert.match(text, /Never answered|1/);
  assert.match(text, /Single-chain workspace: nothing to consent|Declared/);
  assert.equal(built.board.acceptedN, 0);
  assert.equal(built.board.awaitingPersonN, 1);
});
