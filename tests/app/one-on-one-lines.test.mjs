/**
 * Matrix 1:1 Line Coverage read-model and schema checks. Session 227 wires
 * holder persistence and commands; the interactive coverage panel, reminder
 * rule and export remain unbuilt.
 *
 * Organised around what a per-line 1:1 reading can be betrayed by:
 *
 *  1. THE MASK. One line's meeting must not credit another line — either way.
 *  2. UNKNOWN IS NOT NEVER. A 1:1 with no holder makes a line unreadable only
 *     when it could change the reading; it never proves or hides a silence.
 *  3. ONE SET OF THRESHOLDS. The home line reads exactly as the per-person
 *     engine does, day for day.
 *  4. ARITHMETIC IS PRINTED. Pair states and meeting classes each reconcile to
 *     their total, and the brief and the export carry the board's own figures.
 *  5. NO NEW DISCLOSURE. A seat reads what the existing 1:1 policy lets it read.
 *  6. INERT SINGLE CHAIN, FAIL-CLOSED NORMALIZERS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { addDays } from '../../app/core/time.js';
import { cadence } from '../../app/core/domain/oneonone.js';
import {
  buildOneOnOneLines,
  oneOnOneLineBriefText,
  oneOnOneLineCsvRows,
  oneOnOneLineReading,
} from '../../app/core/domain/oneOnOneLines.js';
import {
  normalizeOneOnOneHolder,
  normalizeOneOnOneLineMarkers,
  normalizeOneOnOneLineSettings,
  validateOneOnOneLineConventions,
} from '../../app/core/domain/oneOnOneLineSchema.js';
import {
  ONE_ON_ONE_LINE_CSV_COLUMNS,
  ONE_ON_ONE_LINE_LIMITS,
  ONE_ON_ONE_LINE_STATE_KEYS,
} from '../../app/core/domain/oneOnOneLineRegistry.js';

const NOW = new Date('2026-11-10T10:00:00.000Z');
const TODAY = '2026-11-10';
const ISO = NOW.toISOString();
const ago = (n) => addDays(TODAY, -n);

/* --------------------------------------------------------------- fixtures */

/**
 * leader ── engdir ─┬─ funcmgr ─┬─ sam   (home line; ALSO 40% on pmdir's programme)
 *                   │           └─ lee   (one line only)
 *                   ├─ pmdir ──── kim
 *                   └─ opsmgr ─── ola    (an unrelated peer span)
 */
function roster() {
  const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, createdAt: '2025-01-01T09:00:00.000Z' });
  return [
    person('engdir', 'Dana Director', 'director', null),
    person('funcmgr', 'Fay Functional', 'manager', 'engdir'),
    person('pmdir', 'Priya Programme', 'manager', 'engdir'),
    person('opsmgr', 'Omar Ops', 'manager', 'engdir'),
    person('sam', 'Sam Shared', 'ic', 'funcmgr'),
    person('lee', 'Lee Single', 'ic', 'funcmgr'),
    person('kim', 'Kim Junior', 'ic', 'pmdir'),
    person('ola', 'Ola Ops', 'ic', 'opsmgr'),
  ];
}

function projectLine(over = {}) {
  return {
    id: 'line-sam-pm', personId: 'sam', managerId: 'pmdir', kind: 'project', shareH: 40, rights: [],
    fromISO: '2026-01-01', toISO: null, declaredAt: '2026-01-01T09:00:00.000Z', declaredBySeatId: null, note: '',
    ...over,
  };
}

let seq = 0;
function held(daysAgo, heldById = null, over = {}) {
  seq += 1;
  return {
    id: `oo-${seq}`, personId: 'sam', date: ago(daysAgo), status: 'held', mood: null,
    agenda: [], resolvedTopics: [], notes: '', actions: [], createdAt: ISO,
    heldById, heldByBasis: heldById ? 'seat' : null, heldByAt: heldById ? ISO : null,
    ...over,
  };
}

/**
 * A normalized workspace with the meetings placed on it exactly as the wired
 * schema will store them. The app's own normalizer does not carry a holder yet
 * (the last test pins that), so they are attached after normalization.
 */
function makeState({ lines = [projectLine()], meetings = [], seatId = null } = {}) {
  const raw = createEmptyState(ISO);
  raw.people = roster();
  raw.reportingLines = lines;
  raw.settings = { ...raw.settings, activeSeatId: seatId };
  const state = normalizeState(raw).state;
  state.oneOnOnes = meetings;
  return state;
}

const read = (state, settings = {}) => buildOneOnOneLines(state, { now: NOW, settings: { ...state.settings, ...settings } });
const sam = (report) => report.persons.find((p) => p.personId === 'sam') || null;
const line = (person, role) => person.lines.find((l) => l.role === role) || null;

function assertReconciles(report) {
  const b = report.board;
  assert.equal(b.okN + b.dueN + b.overdueN + b.neverN + b.newN + b.unprovenN + b.exemptN, b.pairsN, 'pair states add up to the pair total');
  assert.equal(b.homeN + b.lineN + b.otherN + b.danglingN + b.unattributedN, b.heldN, 'meeting classes add up to the held total');
  assert.equal(b.statesReconcile, true);
  assert.equal(b.meetingsReconcile, true);
}

/* ------------------------------------------------------------ 1. the mask */

test('a home-line 1:1 does not credit the project line: the silent line is masked, and the read mutates nothing', () => {
  const state = makeState({ meetings: [held(1, 'funcmgr')] });
  const before = JSON.stringify(state);
  const report = read(state);
  assert.equal(JSON.stringify(state), before, 'a read writes nothing');

  const person = sam(report);
  assert.ok(person, 'a person on two lines is on the register');
  assert.equal(report.persons.length, 1, 'a person on one line is not');
  // What every other screen prints today:
  assert.equal(cadence(state, 'sam', NOW, state.settings).status, 'ok');
  assert.equal(person.legacy.status, 'ok');
  assert.equal(person.legacy.lastHeldDate, ago(1));
  // What each line actually did:
  assert.equal(line(person, 'home').state, 'ok');
  assert.equal(line(person, 'home').intervalDays, 7);
  assert.equal(line(person, 'home').dueOn, addDays(ago(1), 7));
  const project = line(person, 'additional');
  assert.equal(project.state, 'never');
  assert.equal(project.intervalDays, 28);
  assert.equal(project.managerName, 'Priya Programme');
  assert.equal(project.creditedN, 0);
  assert.equal(project.silent, true);
  assert.equal(project.lineKey, 'line|line-sam-pm');
  assert.equal(line(person, 'home').lineKey, 'home|sam|funcmgr');
  assert.equal(person.masked, true);
  assert.equal(person.verdict, 'masked');
  assert.equal(report.board.maskedN, 1);
  assert.equal(report.board.silentPairsN, 1);
  assert.equal(report.board.pairsN, 2);
  assert.equal(report.board.owingN, 2);
  assertReconciles(report);
});

test('the mask runs both ways: a busy project line hides an absent home manager', () => {
  const state = makeState({ meetings: [held(1, 'pmdir'), held(60, 'funcmgr')] });
  const person = sam(read(state));
  assert.equal(person.legacy.status, 'ok', 'the people list is green because the PROJECT line met yesterday');
  assert.equal(line(person, 'additional').state, 'ok');
  const home = line(person, 'home');
  assert.equal(home.state, 'overdue');
  assert.equal(home.daysSince, 60);
  assert.equal(home.lastHeldOn, ago(60));
  assert.equal(person.masked, true);
  assert.equal(person.verdict, 'masked');
});

test('a silent line the people list ALREADY flags is silent, not masked', () => {
  const state = makeState({ meetings: [held(60, 'funcmgr')] });
  const person = sam(read(state));
  assert.equal(person.legacy.status, 'overdue');
  assert.equal(person.masked, false);
  assert.equal(person.verdict, 'silent');
  assert.equal(person.counts.silent, 2);
});

/* --------------------------------------------------- 2. unknown, not never */

test('an unattributed 1:1 that could be a line’s makes that line unreadable — never silent, never on cadence', () => {
  const meeting = held(2, null);
  const report = read(makeState({ meetings: [meeting] }));
  const person = sam(report);
  assert.equal(line(person, 'home').state, 'unproven');
  assert.equal(line(person, 'additional').state, 'unproven');
  assert.equal(line(person, 'home').lastUnattributedOn, ago(2));
  assert.equal(person.masked, false, 'nothing is proven silent, so nothing is called masked');
  assert.equal(person.verdict, 'unproven');
  assert.equal(report.board.unprovenN, 2);
  assert.equal(report.board.silentPairsN, 0);
  assert.equal(report.board.unattributedN, 1);
  // The human remedy is listed with the managers who could have held it.
  assert.equal(report.board.claimableN, 1);
  assert.deepEqual(report.claimable.map((c) => c.meetingId), [meeting.id]);
  assert.deepEqual(report.claimable[0].candidates.map((c) => c.managerId), ['funcmgr', 'pmdir']);
  assertReconciles(report);
});

test('an unattributed 1:1 too old to matter cannot hide a silence, and a later attributed one settles the line', () => {
  // 200 days ago: whoever held it, both lines are overdue or worse.
  const old = read(makeState({ meetings: [held(200, null)] }));
  assert.equal(line(sam(old), 'home').state, 'overdue');
  assert.equal(line(sam(old), 'additional').state, 'overdue');
  assert.equal(old.board.silentPairsN, 2);
  assert.equal(old.board.claimableN, 0, 'claiming it would change no reading');
  assert.match(line(sam(old), 'additional').reason, /would still leave this line overdue/);

  // An unattributed meeting OLDER than the line's own attributed one is irrelevant to that line.
  const settled = read(makeState({ meetings: [held(3, 'pmdir'), held(5, null)] }));
  assert.equal(line(sam(settled), 'additional').state, 'ok');
  assert.equal(line(sam(settled), 'home').state, 'unproven', 'it could still have been the home line’s');
});

test('a share below the floor is exempt; a line with no declared share cannot be exempted; a new line gets one interval of grace', () => {
  const small = sam(read(makeState({ lines: [projectLine({ shareH: 10 })] })));
  assert.equal(line(small, 'additional').state, 'exempt');
  assert.equal(line(small, 'additional').owes, false);
  assert.equal(line(small, 'additional').silent, false);
  assert.equal(small.counts.owing, 1);

  const undeclared = projectLine();
  delete undeclared.shareH;
  const unknown = sam(read(makeState({ lines: [undeclared] })));
  assert.equal(line(unknown, 'additional').shareDeclared, false);
  assert.equal(line(unknown, 'additional').owes, true, 'no evidence the line is small, so no exemption');
  assert.equal(line(unknown, 'additional').state, 'never');

  // The floor is a declared convention, not a constant.
  const raised = sam(read(makeState(), { oneOnOneLineMinSharePct: 50 }));
  assert.equal(line(raised, 'additional').state, 'exempt');

  const fresh = sam(read(makeState({ lines: [projectLine({ fromISO: ago(3) })] })));
  assert.equal(line(fresh, 'additional').state, 'new');
  assert.equal(line(fresh, 'additional').dueOn, addDays(ago(3), 28));
  const aged = sam(read(makeState({ lines: [projectLine({ fromISO: ago(28) })] })));
  assert.equal(line(aged, 'additional').state, 'never', 'grace is strictly less than one interval');
});

/* ------------------------------------------------ 3. one set of thresholds */

test('the home line reads exactly as the per-person engine does, day for day, at two intervals', () => {
  for (const interval of [5, 7]) {
    for (let d = 0; d <= 30; d += 1) {
      const state = makeState({ meetings: [held(d, 'funcmgr')] });
      const settings = { oneOnOneCadenceDays: interval };
      const expected = cadence(state, 'sam', NOW, { ...state.settings, ...settings }).status;
      const home = line(sam(read(state, settings)), 'home');
      assert.equal(home.state, expected, `interval ${interval}, ${d} day(s) since the last 1:1`);
      assert.equal(oneOnOneLineReading(d, interval), expected);
    }
  }
  // The boundary the float form could blur: 7 x 1.5 = 10.5.
  assert.equal(oneOnOneLineReading(10, 7), 'due');
  assert.equal(oneOnOneLineReading(11, 7), 'overdue');
  assert.equal(oneOnOneLineReading(6, 7), 'ok');
  assert.equal(oneOnOneLineReading(null, 7), null);
});

/* --------------------------------------------------- 4. printed arithmetic */

test('every held 1:1 lands in exactly one attribution class; skipped and future-dated meetings land in none', () => {
  const report = read(makeState({
    meetings: [
      held(1, 'funcmgr'),
      held(2, 'pmdir'),
      held(3, 'engdir'), // a skip-level: on the roster, holds no line for Sam
      held(4, 'ghost'), // somebody who is no longer on the roster
      held(5, null),
      held(6, 'pmdir', { status: 'skipped' }),
      held(-2, 'pmdir'), // dated after today: it has not happened
    ],
  }));
  const b = report.board;
  assert.deepEqual(
    { heldN: b.heldN, homeN: b.homeN, lineN: b.lineN, otherN: b.otherN, danglingN: b.danglingN, unattributedN: b.unattributedN },
    { heldN: 5, homeN: 1, lineN: 1, otherN: 1, danglingN: 1, unattributedN: 1 },
  );
  assert.equal(line(sam(report), 'additional').lastHeldOn, ago(2), 'the skipped and the future-dated meeting credit nothing');
  assert.equal(line(sam(report), 'additional').creditedN, 1);
  assertReconciles(report);
});

test('the brief and the export print the board’s own figures and carry no identity', () => {
  // The unattributed meeting is OLDER than each line's own attributed one, so it can change no reading.
  const state = makeState({ meetings: [held(1, 'funcmgr'), held(40, 'pmdir'), held(50, null)] });
  const report = read(state);
  const b = report.board;
  const rows = oneOnOneLineCsvRows(report);

  for (const row of rows) assert.deepEqual(Object.keys(row), [...ONE_ON_ONE_LINE_CSV_COLUMNS], 'every row has exactly the declared columns, in order');
  const summary = rows[0];
  assert.equal(summary.row_type, 'summary');
  assert.deepEqual(
    [summary.people_on_several_lines, summary.masked_people, summary.pairs, summary.pairs_owing, summary.on_cadence, summary.due, summary.overdue, summary.never_held, summary.new_line, summary.cannot_be_read, summary.exempt],
    [b.peopleN, b.maskedN, b.pairsN, b.owingN, b.okN, b.dueN, b.overdueN, b.neverN, b.newN, b.unprovenN, b.exemptN],
  );
  assert.deepEqual(
    [summary.held_meetings, summary.held_by_home_line, summary.held_by_additional_line, summary.held_by_no_line_today, summary.holder_not_on_roster, summary.no_holder_recorded],
    [b.heldN, b.homeN, b.lineN, b.otherN, b.danglingN, b.unattributedN],
  );
  // The per-kind rows are a partition of the summary, state by state.
  const kindRows = rows.slice(1);
  assert.deepEqual(kindRows.map((r) => `${r.line_role}|${r.line_kind}`), ['home|functional', 'additional|project']);
  const column = { ok: 'on_cadence', due: 'due', overdue: 'overdue', never: 'never_held', new: 'new_line', unproven: 'cannot_be_read', exempt: 'exempt' };
  for (const key of ONE_ON_ONE_LINE_STATE_KEYS) {
    assert.equal(kindRows.reduce((sum, r) => sum + r[column[key]], 0), summary[column[key]], `${key} partitions`);
  }
  assert.equal(kindRows.reduce((sum, r) => sum + r.pairs, 0), b.pairsN);
  // The project line was last met 40 days ago: beyond 28 but not beyond 42.
  assert.equal(line(sam(report), 'additional').state, 'due');
  assert.equal(b.dueN, 1);
  assert.equal(b.unattributedN, 1);
  assert.equal(b.unprovenN, 0);

  const brief = oneOnOneLineBriefText(report);
  assert.match(brief, new RegExp(`On cadence ${b.okN}; due ${b.dueN}; overdue ${b.overdueN}; never held ${b.neverN}; new ${b.newN}; cannot be read ${b.unprovenN}; exempt ${b.exemptN} — ${b.pairsN} in all`));
  assert.match(brief, new RegExp(`Of ${b.heldN} held 1:1s: ${b.homeN} by the home line, ${b.lineN} by an additional line`));

  const exported = `${JSON.stringify(rows)} ${brief}`;
  for (const p of state.people) {
    assert.ok(!exported.includes(p.name), `no name in the export or the brief (${p.name})`);
    assert.ok(!new RegExp(`\\b${p.id}\\b`).test(exported), `no person id in the export or the brief (${p.id})`);
  }
  for (const m of state.oneOnOnes) {
    assert.ok(!exported.includes(m.id), 'no meeting id');
    assert.ok(!exported.includes(m.date), 'no meeting date');
  }
  assert.ok(!exported.includes('line-sam-pm'), 'no declaration id');
});

/* ------------------------------------------------------ 5. no new disclosure */

test('a seat reads only what the existing 1:1 policy lets it read: named, counted, or withheld', () => {
  const meetings = [held(1, 'funcmgr')];

  // The project manager reaches Sam through the declared line only.
  const viaLine = read(makeState({ meetings, seatId: 'pmdir' }));
  assert.equal(viaLine.seat.id, 'pmdir');
  assert.equal(viaLine.scope, 'seat');
  assert.equal(viaLine.disclosure, 'detail');
  assert.equal(sam(viaLine).masked, true);
  assert.equal(viaLine.actor.canClaim, true);
  assert.equal(viaLine.actor.canAttribute, false, 'only the undeclared operator view names somebody else as a holder');
  assert.equal(line(sam(viaLine), 'additional').canRelease, false, 'no meeting is credited to this line yet');
  assert.equal(line(sam(viaLine), 'home').canRelease, false, 'another manager’s attribution is not this seat’s to withdraw');

  // A director is above the 1:1 detail ceiling: the span is counted, nobody is named.
  const director = read(makeState({ meetings, seatId: 'engdir' }));
  assert.equal(director.disclosure, 'aggregate');
  assert.deepEqual(director.persons, []);
  assert.deepEqual(director.claimable, []);
  assert.equal(director.board.peopleN, 1);
  assert.equal(director.board.countedOnlyN, 1);
  assert.equal(director.board.maskedN, 1, 'the finding still reaches the director — as a count');
  assert.equal(director.board.silentPairsN, 1);
  assert.equal(director.actor.canClaim, false);
  assertReconciles(director);

  // An unrelated peer manager: outside both the tree and every line.
  const peer = read(makeState({ meetings, seatId: 'opsmgr' }));
  assert.equal(peer.isMatrix, false, 'outside-span existence is not disclosed');
  assert.equal(peer.board.withheldN, null);
  assert.equal(peer.board.peopleN, 0);
  assert.equal(peer.board.pairsN, 0);
  assert.equal(peer.board.heldN, 0, 'a withheld person contributes to no figure at all');
  assert.deepEqual(peer.persons, []);
  assert.match(oneOnOneLineBriefText(peer), /No multi-line person is visible in this scope/);
});

/* ------------------------------------------ 6. inert, and fail-closed input */

test('a single-chain workspace is inert, including one whose only declared line is the home allocation', () => {
  for (const lines of [[], [projectLine({ id: 'home-alloc', managerId: 'funcmgr', kind: 'functional', shareH: 100 })]]) {
    const report = read(makeState({ lines, meetings: [held(1, null)] }));
    assert.equal(report.isMatrix, false);
    assert.deepEqual(report.persons, []);
    assert.deepEqual(report.claimable, []);
    assert.equal(report.board.peopleN, 0);
    assert.equal(report.board.pairsN, 0);
    assert.equal(report.board.heldN, 0);
    assert.equal(oneOnOneLineCsvRows(report).length, 1, 'one summary row of zeros, no kind row');
    assert.match(oneOnOneLineBriefText(report), /existing per-person 1:1 cadence is unchanged/);
    assertReconciles(report);
  }
});

test('normalizers fail closed: an unaccountable holder is cleared and counted, a departed one is kept, conventions are refused not clamped', () => {
  const counters = { cleared: 0 };
  assert.deepEqual(
    normalizeOneOnOneHolder({ personId: 'sam', heldById: ' pmdir ', heldByBasis: 'claimed', heldByAt: ISO }, counters),
    { heldById: 'pmdir', heldByBasis: 'claimed', heldByAt: ISO },
  );
  assert.deepEqual(normalizeOneOnOneHolder({ personId: 'sam', heldById: 'ghost', heldByBasis: 'seat' }, counters),
    { heldById: 'ghost', heldByBasis: 'seat', heldByAt: null }, 'an id that left the roster is history, not an error');
  assert.equal(counters.cleared, 0);
  const none = { heldById: null, heldByBasis: null, heldByAt: null };
  assert.deepEqual(normalizeOneOnOneHolder({ personId: 'sam' }, counters), none);
  assert.equal(counters.cleared, 0, 'an absent holder is not a defect');
  assert.deepEqual(normalizeOneOnOneHolder({ personId: 'sam', heldById: 'pmdir', heldByBasis: 'inferred' }, counters), none);
  assert.deepEqual(normalizeOneOnOneHolder({ personId: 'sam', heldById: 'pmdir' }, counters), none);
  assert.deepEqual(normalizeOneOnOneHolder({ personId: 'sam', heldById: 'sam', heldByBasis: 'seat' }, counters), none, 'nobody is their own manager');
  assert.equal(counters.cleared, 3);

  assert.deepEqual(normalizeOneOnOneLineSettings({}), {
    oneOnOneLineCadenceDays: 28, oneOnOneLineMinSharePct: 20, oneOnOneLineAskDueDays: 7, oneOnOneLineAutoPropagate: true,
  });
  assert.deepEqual(normalizeOneOnOneLineSettings({ oneOnOneLineCadenceDays: 999, oneOnOneLineMinSharePct: -5, oneOnOneLineAskDueDays: 'soon', oneOnOneLineAutoPropagate: false }), {
    oneOnOneLineCadenceDays: 180, oneOnOneLineMinSharePct: 0, oneOnOneLineAskDueDays: 7, oneOnOneLineAutoPropagate: false,
  });

  assert.deepEqual(validateOneOnOneLineConventions({ oneOnOneLineCadenceDays: 14, oneOnOneLineAutoPropagate: false }),
    { ok: true, patch: { oneOnOneLineCadenceDays: 14, oneOnOneLineAutoPropagate: false } });
  for (const [input, field] of [
    [{ oneOnOneLineCadenceDays: 999 }, 'oneOnOneLineCadenceDays'],
    [{ oneOnOneLineCadenceDays: 14.5 }, 'oneOnOneLineCadenceDays'],
    [{ oneOnOneLineMinSharePct: 101 }, 'oneOnOneLineMinSharePct'],
    [{ oneOnOneLineAskDueDays: 0 }, 'oneOnOneLineAskDueDays'],
    [{ oneOnOneLineAutoPropagate: 'yes' }, 'oneOnOneLineAutoPropagate'],
    [{}, 'conventions'],
  ]) {
    const verdict = validateOneOnOneLineConventions(input);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.field, field);
    assert.ok(verdict.error.length > 10, 'a refusal explains itself');
  }

  const markers = normalizeOneOnOneLineMarkers([
    { key: 'ask|line|a|never', kind: 'ask', lineKey: 'line|a', taskId: 'dlg-1', state: 'never', at: ISO },
    { key: 'ask|line|a|never', kind: 'ask', lineKey: 'line|a', taskId: 'dlg-2' },
    { key: 'x', kind: 'guess' },
    { kind: 'ask' },
    null,
  ]);
  assert.deepEqual(markers.map((m) => [m.key, m.taskId]), [['ask|line|a|never', 'dlg-1']]);
  const flood = Array.from({ length: ONE_ON_ONE_LINE_LIMITS.markers + 5 }, (_, i) => ({ key: `k${i}`, kind: 'observation' }));
  const kept = normalizeOneOnOneLineMarkers(flood);
  assert.equal(kept.length, ONE_ON_ONE_LINE_LIMITS.markers);
  assert.equal(kept.at(-1).key, `k${ONE_ON_ONE_LINE_LIMITS.markers + 4}`, 'the oldest markers are displaced first');
});

test('holder fields survive normalisation and support a real masked-line reading', () => {
  const raw = createEmptyState(ISO);
  raw.people = roster();
  raw.reportingLines = [projectLine()];
  raw.oneOnOnes = [held(1, 'funcmgr')];
  const state = normalizeState(raw).state;
  assert.equal(state.oneOnOnes.length, 1);
  assert.equal(state.oneOnOnes[0].heldById, 'funcmgr');
  const report = read(state);
  assert.equal(report.board.unattributedN, 0);
  assert.equal(report.board.homeN, 1);
  assert.equal(report.board.maskedN, 1);
  assert.equal(line(sam(report), 'home').state, 'ok');
});
