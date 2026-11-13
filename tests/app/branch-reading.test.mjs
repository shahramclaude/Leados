/**
 * tests/app/branch-reading.test.mjs — ADR-0129, Schema v118, Session 175.
 *
 * THE DUTY A CHIEF ACTUALLY PERFORMS
 * ----------------------------------
 * "Two divisions are on my table. One came back WITHHELD at the disclosure
 * floor, so I am holding no continuity signal for it at all — and I still have
 * to commit capital, people and a board narrative across the whole enterprise."
 *
 * ADR-0126 answered this with a floor, and the floor is right: a rate over two
 * people is a statement about two people. What it left behind is the second
 * half of the problem — a withheld cell is a question nobody has asked. This
 * suite proves the governed hand-off that closes it:
 *
 *   - the ask goes ONE level down, to the branch's own leader, and one open ask
 *     at a time — with the row, the typed edge, the roll-ups and the audit event
 *     in one transaction, and NO decision opened;
 *   - the answer is the branch's own leader's, enforced in the action AND again
 *     by the fail-closed schema on reload (third-party, pre-dated, orphaned,
 *     bandless and band-carrying refusals are all dropped with a printed reason);
 *   - the BAND IS DERIVED inside the publish command and frozen with the day —
 *     a band in the payload is ignored, so no form can type "we are fine";
 *   - asked / overdue / published / declined / lapsed / withdrawn are DERIVED
 *     from the two ledgers and today, never stored: a reading lapses on its own
 *     declared clock and a revoked one falls back to asked;
 *   - the withheld cell, the upward brief, the CSV and the daily badge all carry
 *     the hand-off, and none of them carries a figure or a person;
 *   - a declined reading opens no governed decision, because a refusal that
 *     escalates itself is not a refusal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  createEmptyState, normalizeState, migrate, SCHEMA_VERSION, DEFAULT_SETTINGS,
} from '../../app/core/schema.js';
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildDutyCoverageReport, branchReadingBandFromRows, dutyCoverageBriefText, dutyCoverageCsvRows,
  dutyCoverageAttentionCount,
} from '../../app/core/domain/dutyCoverage.js';
import { DUTY_COVERAGE_DEFAULTS } from '../../app/core/domain/dutyCoverageRegistry.js';
import {
  BRANCH_READING_BANDS, BRANCH_READING_LIMITS,
} from '../../app/core/domain/branchReadingRegistry.js';
import { renderDutyCover } from '../../app/views/dutyCover.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const AXE_SRC = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NOW = new Date('2027-06-30T00:00:00.000Z');
const DAY = 86400000;
const later = (days) => new Date(NOW.getTime() + days * DAY);
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const today = NOW.toISOString().slice(0, 10);

/**
 * leader (chief, rank 5)
 *   ├── dir-narrow → mgr-n1               (2 contributing seats — BELOW the floor)
 *   └── dir-wide   → mgr-w1, mgr-w2       (3 contributing seats — the complementary cell)
 *
 * At the default floor of 3 both direct cells are withheld: one for being small,
 * one so the small one cannot be recovered by subtraction. Both are therefore
 * carrying a question the chief could never ask before ADR-0129.
 */
function roster() {
  return [
    { id: 'dir-narrow', name: 'Nadia Rask', level: 'director' },
    { id: 'mgr-n1', name: 'Ola Berg', level: 'manager', managerId: 'dir-narrow' },
    { id: 'ic-n1', name: 'Pia Lund', level: 'ic', managerId: 'mgr-n1' },
    { id: 'dir-wide', name: 'Kwame Asante', level: 'director' },
    { id: 'mgr-w1', name: 'Ruth Hald', level: 'manager', managerId: 'dir-wide' },
    { id: 'ic-w1', name: 'Sven Ohl', level: 'ic', managerId: 'mgr-w1' },
    { id: 'mgr-w2', name: 'Tess Voll', level: 'manager', managerId: 'dir-wide' },
    { id: 'ic-w2', name: 'Ulf Reyes', level: 'ic', managerId: 'mgr-w2' },
  ].map((p) => ({ status: 'active', createdAt: ago(500), ...p }));
}

function makeState({ activeSeatId = 'leader', floor = undefined, rateFloor = undefined } = {}) {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    leaderName: 'Dana Whitfield',
    chainLeaderAltitude: 'chief',
    activeSeatId,
    ...(floor !== undefined ? { dutyCoverageBranchFloorN: floor } : {}),
    ...(rateFloor !== undefined ? { dutyCoverageBranchRateFloorN: rateFloor } : {}),
  };
  state.people = roster();
  state.cases = [{
    id: 'case-w1', title: 'Supplier recovery', status: 'open', ownerId: 'ic-w1',
    involvedPersonIds: ['ic-w1'], openedOn: ago(4),
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }];
  state.oneOnOnes = [{ id: 'm1', personId: 'ic-w1', date: ago(3), status: 'held', agenda: [], actions: [] }];
  state.dutyCovers = [{
    id: 'cover-1', dutyId: 'mgr-w1|throughput', seatId: 'mgr-w1', dutyKey: 'throughput',
    coverId: 'mgr-w2', note: 'Declared answerable while the holder is absent.',
    decisionId: null, declaredBySeatId: 'dir-wide', declaredOn: ago(6),
    declaredAt: NOW.toISOString(), status: 'active', revokedOn: null, revokedAt: null,
    revokeReason: '', verifiedOn: null, version: 'duty-coverage-2026.11-v1',
  }];
  return normalizeState(state, { now: NOW }).state;
}

function boot(state = makeState()) {
  const map = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  let seq = 0;
  const now = () => NOW;
  const store = createStore({ storage, now, idFactory: (p) => `${p}-t${++seq}` });
  store.load();
  const api = createApi(store, { now, idFactory: (p) => `${p}-t${++seq}` });
  return { store, api, map };
}

const at = (state, when = NOW) => buildDutyCoverageReport(state, { now: when, settings: state.settings });
const withheldCells = (report) => report.branchCoverage.branches.filter((b) => b.suppressed);

/* ------------------------------------------- 1. schema v118 + fail-closed load */

test('schema v118 is additive, convergent, and starts both ledgers EMPTY', () => {
  assert.equal(SCHEMA_VERSION, 155);
  const v117 = { ...makeState(), schemaVersion: 117 };
  delete v117.branchReadingAsks;
  delete v117.branchReadings;
  const migrated = migrate(v117);
  assert.equal(migrated.applied.at(-1), '151 → 152', 'the whole chain runs to the current schema');
  assert.deepEqual(migrated.raw.branchReadingAsks, [], 'no ask is invented at upgrade time');
  assert.deepEqual(migrated.raw.branchReadings, [], 'no disclosure is invented at upgrade time');
  // Nothing is back-filled, so every pre-existing withheld cell opens "not asked".
  const state = normalizeState(migrated.raw, { now: NOW }).state;
  assert.equal(state.schemaVersion, 155);
  assert.ok(Array.isArray(state.branchReadingAsks) && Array.isArray(state.branchReadings));
  // The two conventions exist before anyone re-declares them, and survive normalize.
  assert.equal(state.settings.dutyCoverageReadingResponseDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageReadingResponseDays);
  assert.equal(state.settings.dutyCoverageReadingValidDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageReadingValidDays);
  assert.equal(DEFAULT_SETTINGS.dutyCoverageReadingValidDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageReadingValidDays);
  // Convergent: a second pass changes nothing.
  const again = normalizeState(state, { now: NOW }).state;
  assert.deepEqual(again.branchReadingAsks, []);
  assert.equal(again.schemaVersion, 155);
});

test('the schema drops every forged hand-off on reload, with the reason printed', () => {
  const state = makeState();
  const ask = {
    id: 'ask-good', targetSeatId: 'dir-wide', askedBySeatId: 'leader',
    askedOn: today, askedAt: NOW.toISOString(), note: 'I need the continuity position for the board pack.',
    status: 'open', withdrawnOn: null, withdrawnAt: null, withdrawReason: '', version: 'x',
  };
  const good = {
    id: 'reading-good', askId: 'ask-good', branchSeatId: 'dir-wide', answeredBySeatId: 'dir-wide',
    answer: 'published', band: 'thin', note: 'Two of my lines are declared but unexercised.',
    answeredOn: today, answeredAt: NOW.toISOString(), status: 'active',
    revokedOn: null, revokedAt: null, revokeReason: '', version: 'x',
  };
  state.branchReadingAsks = [
    ask,
    { ...ask, id: 'ask-self', targetSeatId: 'leader', askedBySeatId: 'leader' },
    { ...ask, id: 'ask-second-open' },
    { ...ask, id: 'ask-stranger', targetSeatId: 'ghost-seat' },
  ];
  state.branchReadings = [
    good,
    { ...good, id: 'r-second', askedOn: today }, // second active answer for one ask
    { ...good, id: 'r-third-party', answeredBySeatId: 'mgr-w1', branchSeatId: 'mgr-w1' },
    { ...good, id: 'r-orphan', askId: 'ask-never-made' },
    { ...good, id: 'r-pre-dated', answeredOn: ago(3) },
    { ...good, id: 'r-bandless', band: null },
    { ...good, id: 'r-invented-band', band: 'excellent' },
    { ...good, id: 'r-wordless', note: 'ok' },
    { ...good, id: 'r-decline-with-band', answer: 'declined', band: 'thin' },
  ];
  const normalized = normalizeState(state, { now: NOW });
  const asks = normalized.state.branchReadingAsks;
  const readings = normalized.state.branchReadings;
  assert.deepEqual(asks.map((a) => a.id), ['ask-good'], 'only the well-formed ask survives');
  assert.deepEqual(readings.map((r) => r.id), ['reading-good'], 'only the well-formed answer survives');
  const text = normalized.warnings.join('\n');
  assert.match(text, /a seat addressed to itself/);
  assert.match(text, /second open ask for one branch/);
  assert.match(text, /not on this roster/);
  assert.match(text, /second active answer for one ask/);
  assert.match(text, /given for a branch it was not asked about/);
  assert.match(text, /whose ask no longer exists/);
  assert.match(text, /dated before the ask it answers/);
  assert.match(text, /band is not in the declared vocabulary/);
  assert.match(text, /wordless answer/);
  assert.match(text, /refusal carrying a band/);
  assert.equal(readings[0].band, 'thin');
});

/* --------------------------------------------------------- 2. the ask itself */

test('a chief asks ONE direct branch, in one transaction, and opens no decision', () => {
  const h = boot();
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const decisionsBefore = h.store.state.decisions.length;
  const asked = h.api.branchReadingRequest({
    targetSeatId: 'mgr-w1',
    note: 'Board pack closes Friday and your cell is withheld at the floor.',
  });
  assert.ok(asked.ok, asked.error);
  assert.equal(asked.askedOn, today);
  const row = h.store.state.branchReadingAsks.find((a) => a.id === asked.id);
  assert.ok(row, 'the ask is stored');
  assert.equal(row.status, 'open');
  assert.equal(row.targetSeatId, 'mgr-w1');
  assert.equal(row.askedBySeatId, 'dir-wide');
  assert.equal(row.note, 'Board pack closes Friday and your cell is withheld at the floor.');

  // One transaction: the typed edge to the branch, and a roll-up per span above
  // the ASKER (a director's ask climbs to the chief).
  const edges = h.store.state.links.filter((l) => l.sourceId === asked.id);
  assert.equal(edges.filter((l) => l.relation === 'requests-reading-from').length, 1);
  assert.equal(edges.find((l) => l.relation === 'requests-reading-from').targetId, 'mgr-w1');
  assert.deepEqual(edges.filter((l) => l.relation === 'rolls-up-to').map((l) => l.targetId), ['leader']);
  // The audit event explains the act; no decision was opened against anyone.
  const event = h.store.state.events.find((e) => e.type === 'branchReading.requested');
  assert.ok(event);
  assert.match(event.summary, /no figure is requested or disclosed/i);
  assert.equal(h.store.state.decisions.length, decisionsBefore, 'asking is not a commitment');

  // Refusals, each with the reason a chief can act on.
  assert.match(h.api.branchReadingRequest({ targetSeatId: 'mgr-n1', note: 'let me read it' }).error, /direct branch of this seat, one level down/);
  assert.match(h.api.branchReadingRequest({ targetSeatId: 'ic-w1', note: 'let me read it' }).error, /is not a seat in this roster/);
  assert.match(h.api.branchReadingRequest({ targetSeatId: 'mgr-w2', note: 'why' }).error, /Say why you need the reading/);
  assert.match(h.api.branchReadingRequest({ targetSeatId: 'mgr-w1', note: 'ask again please' }).error, /already carries your open request/);
});

test('the hand-off is refused where there is nothing withheld to ask about', () => {
  const h = boot();
  // A rank-2 manager never sees the branch table, so it can never hold the question.
  assert.ok(h.api.setActiveSeat('mgr-w1', { reason: 'own span' }).ok);
  const asManager = h.api.branchReadingRequest({ targetSeatId: 'ic-w1', note: 'reading please, thanks' });
  assert.equal(asManager.ok, false);
  assert.match(asManager.error, /rank window is 3–5|rank 2/);

  // The undeclared operator view reads every seat directly: no cell is withheld from it.
  assert.ok(h.api.setActiveSeat(null, { reason: 'operator' }).ok);
  const asOperator = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'reading please, thanks' });
  assert.equal(asOperator.ok, false);
  assert.match(asOperator.error, /operator view reads every seat’s register directly/);
});

/* ------------------------------------------------- 3. the answer is the branch's */

test('only the branch the ask named can answer it — no requester, no peer, no operator', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(asked.ok, asked.error);

  const asRequester = h.api.branchReadingPublish({ id: asked.id, note: 'I will answer my own question.' });
  assert.equal(asRequester.ok, false);
  assert.match(asRequester.error, /You asked for this reading/);

  assert.ok(h.api.setActiveSeat('mgr-w1', { reason: 'peer span' }).ok);
  const asPeer = h.api.branchReadingPublish({ id: asked.id, note: 'I will answer for my director.' });
  assert.equal(asPeer.ok, false);
  assert.match(asPeer.error, /Only that branch’s own leader can publish or decline it/);

  assert.ok(h.api.setActiveSeat(null, { reason: 'operator' }).ok);
  const asOperator = h.api.branchReadingPublish({ id: asked.id, note: 'the operator will decide' });
  assert.equal(asOperator.ok, false);
  assert.match(asOperator.error, /operator view reads every seat’s register directly/);
});

/* --------------------------------------------- 4. the band is derived, not typed */

test('the published band is DERIVED from the publisher’s own register — a payload band is ignored', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(asked.ok, asked.error);

  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const own = h.api.dutyCoverageReport().report;
  const expected = branchReadingBandFromRows(own.rows);
  assert.ok(BRANCH_READING_BANDS.includes(expected.band));
  assert.equal(expected.band, 'exposed', 'this fixture declares one cover across fifteen duty lines');

  const published = h.api.branchReadingPublish({
    id: asked.id,
    note: 'One declared cover in the whole branch; the rest is unstaffed on paper.',
    band: 'holding',
  });
  assert.ok(published.ok, published.error);
  assert.equal(published.band, expected.band, 'the register decides the band');
  const row = h.store.state.branchReadings.find((r) => r.id === published.id);
  assert.equal(row.band, 'exposed');
  assert.notEqual(row.band, 'holding', 'a typed band cannot become the disclosure');
  // No count is stored anywhere on the answer row.
  for (const key of ['dutiesN', 'exposedN', 'thinN', 'holdingN', 'rate', 'pct']) {
    assert.equal(key in row, false, `the answer row stores no ${key}`);
  }
  assert.equal(row.answeredOn, today, 'the band is frozen with the day it was given');
});

test('a wordless answer is refused in the action and again by the schema', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const thin = h.api.branchReadingPublish({ id: asked.id, note: 'ok' });
  assert.equal(thin.ok, false);
  assert.match(thin.error, /Put the reading in your own words/);
  assert.ok(BRANCH_READING_LIMITS.minWords >= 8);
});

/* ------------------------------------------------ 5. derived states, never stored */

test('asked → overdue → lapsed is a clock over the two ledgers, with nothing stored', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(asked.ok, asked.error);
  const conv = h.store.state.settings;

  const day0 = at(h.store.state, NOW).branchCoverage.readings;
  assert.equal(day0.askedN, 1);
  assert.equal(day0.publishedN, 0);
  assert.equal(day0.cellsN, 2, 'both cells in this fixture are withheld');
  assert.equal(day0.notAskedN, 1, 'the cell nobody asked about stays "never asked"');

  // Still inside the declared window: not a finding.
  const inside = at(h.store.state, later(2)).branchCoverage.readings;
  assert.equal(inside.askedN, 1);
  assert.equal(inside.overdueN, 0);

  const past = at(h.store.state, later(conv.dutyCoverageReadingResponseDays + 1)).branchCoverage.readings;
  assert.equal(past.overdueN, 1, 'past the response window the ask is overdue');
  assert.equal(past.askedN, 0);
  assert.equal(h.store.state.branchReadingAsks[0].status, 'open', 'nothing was written to make it overdue');

  // Publish, then walk the validity clock.
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  assert.ok(h.api.branchReadingPublish({ id: asked.id, note: 'One declared cover; the rest is unstaffed.' }).ok);
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);
  const fresh = at(h.store.state, later(1)).branchCoverage.readings;
  assert.equal(fresh.publishedN, 1);
  assert.equal(fresh.bands.exposed, 1);
  const stale = at(h.store.state, later(conv.dutyCoverageReadingValidDays + 2)).branchCoverage.readings;
  assert.equal(stale.lapsedN, 1, 'a reading lapses on its own declared clock');
  assert.equal(stale.publishedN, 0);
  assert.equal(h.store.state.branchReadings[0].band, 'exposed', 'the stored band never changed');

  // The chief's cell says what happened, and says it as a sentence.
  const cell = withheldCells(at(h.store.state, later(conv.dutyCoverageReadingValidDays + 2)))
    .find((b) => b.reading && b.reading.state === 'lapsed');
  assert.ok(cell, 'the lapsed cell is the one that was answered');
  assert.match(cell.reading.why, /older than the declared|past the declared/);
  assert.equal(cell.coveredN, null, 'the withheld FIGURE is still withheld after a reading');
});

test('a revoked reading falls back to asked, not to a band nobody stands behind', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const published = h.api.branchReadingPublish({ id: asked.id, note: 'One declared cover; the rest is unstaffed.' });
  assert.ok(published.ok, published.error);
  const revoked = h.api.branchReadingRevoke({ readingId: published.id, reason: 'The cover situation changed this week.' });
  assert.ok(revoked.ok, revoked.error);
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);
  const row = h.store.state.branchReadings[0];
  assert.equal(row.status, 'revoked', 'append-only: the row is marked, never deleted');
  const cell = withheldCells(at(h.store.state, NOW)).find((b) => b.reading && b.reading.askedOn);
  assert.equal(cell.reading.state, 'asked');
  assert.equal(cell.reading.band, null);
});

/* ------------------------------------------------------- 6. a decline is an answer */

test('a decline is recorded, printed with its reason, and opens NO decision', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const before = h.store.state.decisions.length;
  const short = h.api.branchReadingDecline({ id: asked.id, reason: 'no' });
  assert.equal(short.ok, false);
  assert.match(short.error, /Give the refusal words/);
  const declined = h.api.branchReadingDecline({
    id: asked.id,
    reason: 'This is a personnel matter and the two people named would be identifiable.',
  });
  assert.ok(declined.ok, declined.error);
  assert.equal(h.store.state.decisions.length, before, 'a refusal that escalates itself is not a refusal');
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);

  const readings = at(h.store.state, NOW).branchCoverage.readings;
  assert.equal(readings.declinedN, 1);
  assert.equal(readings.publishedN, 0);
  const cell = withheldCells(at(h.store.state, NOW)).find((b) => b.reading && b.reading.state === 'declined');
  assert.ok(cell);
  assert.equal(cell.reading.band, null, 'a refusal states no condition of the branch');
  assert.match(cell.reading.note, /personnel matter/);
  // A declined ask is terminal until someone asks again, and the row still
  // carries no seat or node id — only the asker's own request id.
  assert.ok(cell.reading.askId);
  assert.equal(typeof cell.reading.answeredOn, 'string');
});

/* ---------------------------------------- 7. report, brief, CSV, badge wiring */

test('every withheld cell carries a derived state; a released cell carries none', () => {
  const closed = at(makeState()).branchCoverage;
  assert.equal(closed.branches.every((b) => b.suppressed), true);
  assert.equal(closed.branches.every((b) => b.reading && b.reading.state === 'not-asked'), true);
  assert.equal(closed.readings.notAskedN, 2);
  assert.match(closed.branches[0].reading.why, /silence is not a clean bill of health/);
  // The withheld FIGURE stays null; the reading adds no number to the cell.
  assert.equal(closed.branches[0].coveredN, null);

  // The row carries a table POSITION and never a seat id or node id: the ask is
  // addressed as “branch N of my table” and resolved inside the action.
  const row = JSON.stringify(closed.branches);
  for (const key of ['seatId', 'nodeId', 'targetSeatId']) {
    assert.ok(!row.includes(`"${key}"`), `no ${key} travels on a branch row`);
  }
  assert.equal(closed.branches.every((b) => Number.isInteger(b.pos)), true, 'the table position travels instead');

  const open = at(makeState({ floor: 2, rateFloor: 2 })).branchCoverage;
  assert.equal(open.suppressedN, 0);
  assert.equal(open.branches.every((b) => b.reading === null), true, 'nothing is withheld, so nothing is asked about');
  assert.equal(open.readings.cellsN, 0);
});

test('the brief and the CSV carry the hand-off with no figure and no person', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(h.api.dutyCoverageBriefText().text.includes('Branch readings for withheld cells'));
  assert.match(h.api.dutyCoverageBriefText().text, /1 never asked/);
  assert.match(h.api.dutyCoverageBriefText().text, /a blank cell is not a clean bill of health/);

  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  assert.ok(h.api.branchReadingPublish({ id: asked.id, note: 'One declared cover; the rest is unstaffed.' }).ok);
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);

  const brief = dutyCoverageBriefText(at(h.store.state));
  assert.match(brief, /1 published \(bands: 0 holding, 0 thin, 1 exposed, 0 cannot say\)/);
  for (const name of ['Kwame Asante', 'Nadia Rask', 'Ruth Hald', 'dir-wide']) {
    assert.ok(!brief.includes(name), `the brief must not carry “${name}”`);
  }

  const rows = dutyCoverageCsvRows(at(h.store.state));
  const branchRows = rows.filter((r) => r.row_kind === 'branch');
  const answered = branchRows.find((r) => r.branch_reading_state === 'published');
  assert.ok(answered, 'the answered cell exports its state');
  assert.equal(answered.branch_reading_band, 'exposed');
  assert.equal(answered.branch_covered_n, '', 'the withheld figure is still BLANK in the export');
  const silent = branchRows.find((r) => r.branch_reading_state === 'not-asked');
  assert.ok(silent, 'a cell nobody asked about says so, rather than exporting 0');
  assert.equal(silent.branch_reading_band, '');
  const summary = rows.find((r) => r.row_kind === 'branch-summary');
  assert.equal(summary.branch_reading_published_n, 1);
  assert.equal(summary.branch_reading_declined_n, 0);
  assert.equal(summary.branch_reading_not_asked_n, 1);
  assert.equal(summary.branch_reading_outstanding_n, 0);
  const serialized = JSON.stringify(rows);
  for (const name of ['Kwame', 'Nadia', 'Ruth Hald', 'Sven Ohl']) {
    assert.ok(!serialized.includes(name), `the CSV must not carry “${name}”`);
  }
});

test('an overdue ask reaches the daily badge of the seat that owes it — and only then', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(asked.ok, asked.error);
  const conv = h.store.state.settings;

  const asBranchNow = h.api.branchReadingBoard();
  assert.equal(asBranchNow.askedOfMe.length, 0);

  // The branch's own leader sees the ask, and owes an answer once it is late.
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const board = h.api.branchReadingBoard();
  assert.equal(board.askedOfMe.length, 1);
  assert.equal(board.askedOfMe[0].state, 'asked');
  assert.equal(board.askedOfMe[0].preview.band, 'exposed');
  assert.equal(board.askedOfMe[0].preview.dutiesN, 15, 'the preview shows the publisher their OWN counts');
  assert.match(board.askedOfMe[0].note, /board/);

  // Same day, same workspace, with and without the ask — the only difference is
  // the hand-off, so the delta is the ask and nothing else.
  const late = later(conv.dutyCoverageReadingResponseDays + 2);
  const withAsk = dutyCoverageAttentionCount(h.store.state, { now: late, settings: h.store.state.settings });
  const withoutAsk = dutyCoverageAttentionCount({ ...h.store.state, branchReadingAsks: [], branchReadings: [] }, { now: late, settings: h.store.state.settings });
  assert.equal(withAsk, withoutAsk + 1, 'an ask past its declared window is owed work');
  const inside = later(1);
  assert.equal(
    dutyCoverageAttentionCount(h.store.state, { now: inside, settings: h.store.state.settings }),
    dutyCoverageAttentionCount({ ...h.store.state, branchReadingAsks: [], branchReadings: [] }, { now: inside, settings: h.store.state.settings }),
    'an ask still inside its window is a normal Monday and is not counted',
  );

  // The requester's own badge does not double-count the same ask.
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);
  assert.equal(
    dutyCoverageAttentionCount(h.store.state, { now: late, settings: h.store.state.settings }),
    dutyCoverageAttentionCount({ ...h.store.state, branchReadingAsks: [], branchReadings: [] }, { now: late, settings: h.store.state.settings }),
    'the chief is not billed for the branch’s silence',
  );
});

test('the board shows both chairs and never a peer’s ask', () => {
  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(asked.ok, asked.error);
  assert.ok(h.api.setActiveSeat('dir-narrow', { reason: 'sibling branch' }).ok);
  const sibling = h.api.branchReadingBoard();
  assert.equal(sibling.askedOfMe.length, 0, 'a sibling branch is never told it was not asked');
  assert.equal(sibling.askedOfSpan.length, 0, 'and never sees the outgoing ask');
  assert.ok(h.api.setActiveSeat('leader', { reason: 'chief desk' }).ok);
  const chief = h.api.branchReadingBoard();
  assert.equal(chief.askedOfSpan.length, 1);
  assert.equal(chief.askedOfSpan[0].state, 'asked');
  assert.equal(chief.askedOfSpan[0].canWithdraw, true);
  assert.equal(chief.conventions.dutyCoverageReadingResponseDays, DUTY_COVERAGE_DEFAULTS.dutyCoverageReadingResponseDays);
});

/* ------------------------------------------------------------- 8. the screen */

test('the readings panel renders both chairs, axe-clean, at chief and at branch leader', async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (String(e?.message || '').includes("HTMLCanvasElement's getContext()")) return;
    errors.push(`jsdomError: ${e?.message || e}`);
  });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://leados.test/', virtualConsole });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'getComputedStyle']) {
    globalThis[key] = dom.window[key];
  }

  const h = boot();
  const asked = h.api.branchReadingRequest({ targetSeatId: 'dir-wide', note: 'I need the continuity position for the board.' });
  assert.ok(asked.ok, asked.error);

  // Chief's desk: a withheld cell shows what the hand-off is holding.
  const ctxChief = { api: h.api, query: new URLSearchParams('panel=desk'), navigate() {}, refresh() {} };
  const desk = renderDutyCover(ctxChief);
  dom.window.document.body.append(desk);
  assert.match(desk.textContent, /Reading from the branch/);
  assert.match(desk.textContent, /answer expected by/);
  assert.match(desk.textContent, /never been asked/);

  const ctxReadings = { api: h.api, query: new URLSearchParams('panel=readings'), navigate() {}, refresh() {} };
  const panel = renderDutyCover(ctxReadings);
  dom.window.document.body.append(panel);
  assert.match(panel.textContent, /Readings this seat has asked for/);
  assert.match(panel.textContent, /No reading has been requested of this seat/);
  assert.match(panel.textContent, /The band is derived, never typed/);
  assert.match(panel.textContent, /a refusal that escalates itself is not a refusal/i);

  // The branch's own chair: the ask, the derived preview, both acts.
  assert.ok(h.api.setActiveSeat('dir-wide', { reason: 'own branch' }).ok);
  const asBranch = renderDutyCover(ctxReadings);
  dom.window.document.body.append(asBranch);
  assert.match(asBranch.textContent, /Readings asked of this seat — Director/);
  assert.match(asBranch.textContent, /Publish the branch reading/);
  assert.match(asBranch.textContent, /Decline, with a reason/);
  assert.match(asBranch.textContent, /exposed/, 'the publisher sees the band their own register grades');

  dom.window.eval(AXE_SRC);
  for (const node of [desk, panel, asBranch]) {
    // One surface at a time: three page headers in one document is a duplicate
    // banner landmark, which would be an artefact of the test, not of the screen.
    dom.window.document.body.replaceChildren(node);
    const results = await dom.window.axe.run(node, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(results.violations.map((v) => `${v.id}: ${v.nodes.length}`), [], 'the surface is axe-clean');
  }
  assert.deepEqual(errors, []);
  dom.window.close();
});
