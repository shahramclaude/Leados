// ADR-0228 — Decision-Domain Sensing Register (Cynefin, RULE-DSN-01).
//
// The claims this suite exists to prove:
//
//   1. a domain is stated only when quorum is met (two readings from two distinct
//      lines) AND every counted reading names the same domain; a split is printed
//      as contested and nobody is picked; majority is never used;
//   2. a reading counts only from a declared panel member, on the line declared for
//      them, once, and never from the owner; each refusal is printed with its reason;
//   3. a reading whose evidence basis does not support its domain is refused, not
//      counted (complex needs dated probes; a precedent cannot prove complexity);
//   4. one mode commitment per decision, by the owner only; a second is refused;
//   5. fit is judged only against an agreed domain, and a mismatch is printed with
//      the mode that fits — it is never enforced;
//   6. malformed rows are dropped and counted; nothing is repaired;
//   7. overdue and stale flags never change a domain or a fit;
//   8. the derived output is a pure function of the stored record and the injected
//      clock: input order does not change it and the input is never mutated;
//   9. the printed counts are re-derived here, independently, from fixtures.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDomainSense } from '../../app/core/domain/domainSense.js';
import { DSN_ADR, DSN_DOMAIN_KEYS, DSN_FIT, DSN_LIMITS, DSN_REFUSALS, DSN_RULE_ID } from '../../app/core/domain/domainSenseRegistry.js';

const NOW = '2026-11-16T12:00:00.000Z';
const OPENED = '2026-11-01T09:00:00.000Z';
const SENSE_BY = '2026-11-20T09:00:00.000Z';
const READ_AT = '2026-11-05T10:00:00.000Z';

const PRECEDENT = { kind: 'precedent', cases: 5, note: 'Five dated comparable rollouts, same outcome each time.' };
const ANALYSIS = { kind: 'analysis', analysisRef: 'capacity model CM-2026-11' };
const PROBE = { kind: 'probe', probes: 2, observed: 'Two pilot cohorts read; outcomes diverged after week one.' };
const ONSET = { kind: 'onset', onsetAt: '2026-11-04T06:00:00.000Z', note: 'Outage across two lines; no repeatable pattern in the record.' };
const UNSORTED = { kind: 'unsorted', note: 'The panel could not name a basis for its reading yet.' };

function decision(id, panel, extra = {}) {
  return {
    id,
    title: `Decision ${id} — a cross-line matter needing a sensed domain`,
    ownerId: 'dir-ops',
    panel,
    openedAt: OPENED,
    senseByAt: SENSE_BY,
    ...extra,
  };
}

const PANEL_TWO_LINES = [
  { memberId: 'lead-fin', lineId: 'finance' },
  { memberId: 'lead-plat', lineId: 'platform' },
  { memberId: 'lead-sales', lineId: 'sales' },
];

function reading(id, decisionId, actorId, lineId, domain, basis, at = READ_AT) {
  return { id, decisionId, actorId, lineId, kind: 'assess', domain, basis, assessedAt: at };
}

function commitment(id, decisionId, mode, at = '2026-11-10T10:00:00.000Z', actorId = 'dir-ops') {
  return { id, decisionId, actorId, kind: 'commit', mode, rationale: 'Committed to the mode on the record as it stood at the date.', committedAt: at };
}

const rowOf = (out, id) => out.rows.find((row) => row.id === id);

test('quorum is two readings from two distinct lines; one person reading twice counts once', () => {
  const met = buildDomainSense({
    domainDecisions: [decision('D-TWO-LINES', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('a1', 'D-TWO-LINES', 'lead-plat', 'platform', 'clear', PRECEDENT),
      reading('a2', 'D-TWO-LINES', 'lead-sales', 'sales', 'clear', PRECEDENT),
    ],
  }, { now: NOW });
  assert.equal(rowOf(met, 'D-TWO-LINES').state, 'domain-agreed');
  assert.equal(rowOf(met, 'D-TWO-LINES').quorum.met, true);

  const samePerson = buildDomainSense({
    domainDecisions: [decision('D-SAME', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('b1', 'D-SAME', 'lead-plat', 'platform', 'clear', PRECEDENT),
      reading('b2', 'D-SAME', 'lead-plat', 'platform', 'clear', PRECEDENT),
    ],
  }, { now: NOW });
  assert.equal(rowOf(samePerson, 'D-SAME').state, 'awaiting-quorum');
  assert.equal(rowOf(samePerson, 'D-SAME').reason, 'too-few-readings');
  assert.equal(rowOf(samePerson, 'D-SAME').domain, null);
});

test('readings from one line only print every-reading-from-one-line and state no domain', () => {
  const panel = [
    { memberId: 'p1', lineId: 'platform' },
    { memberId: 'p2', lineId: 'platform' },
    { memberId: 'p3', lineId: 'sales' },
  ];
  const out = buildDomainSense({
    domainDecisions: [decision('D-PLAT', panel)],
    domainSenseActs: [
      reading('c1', 'D-PLAT', 'p1', 'platform', 'clear', PRECEDENT),
      reading('c2', 'D-PLAT', 'p2', 'platform', 'clear', PRECEDENT),
    ],
  }, { now: NOW });
  const row = rowOf(out, 'D-PLAT');
  assert.equal(row.state, 'awaiting-quorum');
  assert.equal(row.reason, 'every-reading-from-one-line');
  assert.equal(row.quorum.lines, 1);
  assert.equal(row.quorum.met, false);
  assert.equal(row.fit, 'not-readable');
});

test('a panel declared on a single line can never reach quorum, and says so', () => {
  const panel = [{ memberId: 'x1', lineId: 'ops' }, { memberId: 'x2', lineId: 'ops' }];
  const out = buildDomainSense({
    domainDecisions: [decision('D-SINGLE', panel)],
    domainSenseActs: [reading('d1', 'D-SINGLE', 'x1', 'ops', 'clear', PRECEDENT), reading('d2', 'D-SINGLE', 'x2', 'ops', 'clear', PRECEDENT)],
  }, { now: NOW });
  const row = rowOf(out, 'D-SINGLE');
  assert.equal(row.state, 'awaiting-quorum');
  assert.match(row.reason, /^panel-single-line/);
});

test('a split across the panel is printed as contested, with no winner and no domain', () => {
  const state = {
    domainDecisions: [decision('D-SPLIT', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('e1', 'D-SPLIT', 'lead-fin', 'finance', 'clear', PRECEDENT),
      reading('e2', 'D-SPLIT', 'lead-plat', 'platform', 'complex', PROBE),
      reading('e3', 'D-SPLIT', 'lead-sales', 'sales', 'clear', PRECEDENT),
    ],
  };
  const out = buildDomainSense(state, { now: NOW });
  const row = rowOf(out, 'D-SPLIT');
  assert.equal(row.state, 'domain-contested');
  assert.equal(row.domain, null);
  assert.equal(row.domainCounts.clear, 2);
  assert.equal(row.domainCounts.complex, 1);
  assert.equal(row.fit, 'not-readable');
  assert.equal(row.commit, null);
  // a majority (2 of 3 say clear) is NOT adopted
  assert.equal(out.counts.agreedDomains.clear, 0);
});

test('every reading must name the SAME domain for the domain to be stated', () => {
  const out = buildDomainSense({
    domainDecisions: [decision('D-AGREE', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('f1', 'D-AGREE', 'lead-fin', 'finance', 'complicated', ANALYSIS),
      reading('f2', 'D-AGREE', 'lead-plat', 'platform', 'complicated', ANALYSIS),
    ],
  }, { now: NOW });
  const row = rowOf(out, 'D-AGREE');
  assert.equal(row.state, 'domain-agreed');
  assert.equal(row.domain, 'complicated');
  assert.equal(row.expectedMode, DSN_FIT.complicated);
  assert.equal(row.fit, 'owed');
});

test('a reading whose basis does not support its domain is refused and not counted', () => {
  const out = buildDomainSense({
    domainDecisions: [decision('D-BASIS', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('g1', 'D-BASIS', 'lead-fin', 'finance', 'complex', PRECEDENT),
      reading('g2', 'D-BASIS', 'lead-plat', 'platform', 'clear', PRECEDENT),
    ],
  }, { now: NOW });
  const row = rowOf(out, 'D-BASIS');
  assert.equal(row.readings.length, 1, 'the unsupported complex reading must not be counted');
  assert.equal(row.state, 'awaiting-quorum');
  assert.equal(row.reason, 'too-few-readings');
  assert.ok(out.refusals.some((r) => r.actId === 'g1' && r.reason === DSN_REFUSALS.basisNotSupportingDomain));
});

test('complex requires dated probe results, and a probe basis supports complex', () => {
  const out = buildDomainSense({
    domainDecisions: [decision('D-PROBE', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('h1', 'D-PROBE', 'lead-fin', 'finance', 'complex', PROBE),
      reading('h2', 'D-PROBE', 'lead-sales', 'sales', 'complex', PROBE),
    ],
  }, { now: NOW });
  assert.equal(rowOf(out, 'D-PROBE').state, 'domain-agreed');
  assert.equal(rowOf(out, 'D-PROBE').domain, 'complex');
  assert.equal(rowOf(out, 'D-PROBE').expectedMode, 'safe-to-fail-probe');
});

test('an onset-based chaotic reading must not claim an onset after its own assessment time', () => {
  const futureOnset = { kind: 'onset', onsetAt: '2026-11-15T06:00:00.000Z', note: 'Declared onset later than the reading it supports.' };
  const out = buildDomainSense({
    domainDecisions: [decision('D-FUTURE', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('i1', 'D-FUTURE', 'lead-fin', 'finance', 'chaotic', futureOnset, '2026-11-04T08:00:00.000Z'),
      reading('i2', 'D-FUTURE', 'lead-plat', 'platform', 'chaotic', ONSET, '2026-11-04T08:00:00.000Z'),
    ],
  }, { now: NOW });
  // i1 is malformed (onset after assessment) → dropped and counted, not repaired
  assert.equal(rowOf(out, 'D-FUTURE').readings.length, 1);
  assert.equal(out.figuresComplete, false);
  assert.ok(out.warnings.some((w) => /acts: refused 1/.test(w)));
});

test('a chaotic agreed domain fits stabilise-first, and a committed mismatch is printed, not blocked', () => {
  const state = {
    domainDecisions: [decision('D-CHAOS', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('j1', 'D-CHAOS', 'lead-fin', 'finance', 'chaotic', ONSET, '2026-11-04T08:00:00.000Z'),
      reading('j2', 'D-CHAOS', 'lead-plat', 'platform', 'chaotic', ONSET, '2026-11-04T08:30:00.000Z'),
      commitment('j3', 'D-CHAOS', 'expert-analysis'),
    ],
  };
  const row = rowOf(buildDomainSense(state, { now: NOW }), 'D-CHAOS');
  assert.equal(row.domain, 'chaotic');
  assert.equal(row.fit, 'mismatch');
  assert.equal(row.expectedMode, 'stabilise-first');
  assert.equal(row.commit.mode, 'expert-analysis', 'the committed mode is printed as committed');
});

test('a committed mode that fits the agreed domain reads as fit', () => {
  const state = {
    domainDecisions: [decision('D-FIT', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('k1', 'D-FIT', 'lead-fin', 'finance', 'clear', PRECEDENT),
      reading('k2', 'D-FIT', 'lead-sales', 'sales', 'clear', PRECEDENT),
      commitment('k3', 'D-FIT', 'standard-practice'),
    ],
  };
  const row = rowOf(buildDomainSense(state, { now: NOW }), 'D-FIT');
  assert.equal(row.fit, 'fit');
  assert.equal(row.fitReason, '');
});

test('only the owner may commit, and a second commitment is refused while the first stands', () => {
  const out = buildDomainSense({
    domainDecisions: [decision('D-COMMIT', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('l1', 'D-COMMIT', 'lead-fin', 'finance', 'clear', PRECEDENT),
      reading('l2', 'D-COMMIT', 'lead-sales', 'sales', 'clear', PRECEDENT),
      { ...commitment('l3', 'D-COMMIT', 'expert-analysis', '2026-11-10T10:00:00.000Z', 'lead-fin') },
      commitment('l4', 'D-COMMIT', 'standard-practice', '2026-11-11T10:00:00.000Z'),
      commitment('l5', 'D-COMMIT', 'safe-to-fail-probe', '2026-11-12T10:00:00.000Z'),
    ],
  }, { now: NOW });
  const row = rowOf(out, 'D-COMMIT');
  assert.equal(row.commit.mode, 'standard-practice', 'the first owner commitment stands');
  assert.equal(row.fit, 'fit');
  const reasons = out.refusals.filter((r) => r.decisionId === 'D-COMMIT').map((r) => [r.actId, r.reason]);
  assert.deepEqual(reasons, [['l3', DSN_REFUSALS.notOwner], ['l5', DSN_REFUSALS.alreadyCommitted]]);
});

test('the owner cannot assess their own decision, even when listed on the panel', () => {
  const panel = [...PANEL_TWO_LINES, { memberId: 'dir-ops', lineId: 'operations' }];
  const out = buildDomainSense({
    domainDecisions: [decision('D-SELF', panel)],
    domainSenseActs: [
      reading('m1', 'D-SELF', 'dir-ops', 'operations', 'clear', PRECEDENT),
      reading('m2', 'D-SELF', 'lead-fin', 'finance', 'clear', PRECEDENT),
    ],
  }, { now: NOW });
  const row = rowOf(out, 'D-SELF');
  assert.equal(row.readings.length, 1);
  assert.equal(row.state, 'awaiting-quorum');
  assert.ok(out.refusals.some((r) => r.actId === 'm1' && r.reason === DSN_REFUSALS.ownerSelfAssessment));
  // the owner's seat is still shown on the panel, unread
  assert.equal(row.panel.find((seat) => seat.memberId === 'dir-ops').read, false);
});

test('readings from outside the panel, on the wrong line, a second time, or before opening are refused', () => {
  const out = buildDomainSense({
    domainDecisions: [decision('D-GATE', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('n1', 'D-GATE', 'stranger', 'finance', 'clear', PRECEDENT),
      reading('n2', 'D-GATE', 'lead-fin', 'sales', 'clear', PRECEDENT),
      reading('n3', 'D-GATE', 'lead-fin', 'finance', 'clear', PRECEDENT, '2026-11-02T10:00:00.000Z'),
      reading('n4', 'D-GATE', 'lead-fin', 'finance', 'clear', PRECEDENT, '2026-10-30T10:00:00.000Z'),
    ],
  }, { now: NOW });
  const byAct = Object.fromEntries(out.refusals.map((r) => [r.actId, r.reason]));
  assert.equal(byAct.n1, DSN_REFUSALS.notOnPanel);
  assert.equal(byAct.n2, DSN_REFUSALS.lineMismatch);
  assert.equal(byAct.n3, undefined, 'the first in-window reading is counted');
  assert.equal(byAct.n4, DSN_REFUSALS.beforeOpened);
  assert.equal(rowOf(out, 'D-GATE').readings.length, 1);
});

test('a second reading by the same panel member is refused and the first stands', () => {
  const out = buildDomainSense({
    domainDecisions: [decision('D-TWICE', PANEL_TWO_LINES)],
    domainSenseActs: [
      reading('o1', 'D-TWICE', 'lead-fin', 'finance', 'clear', PRECEDENT, '2026-11-05T10:00:00.000Z'),
      reading('o2', 'D-TWICE', 'lead-fin', 'finance', 'complex', PROBE, '2026-11-06T10:00:00.000Z'),
    ],
  }, { now: NOW });
  const row = rowOf(out, 'D-TWICE');
  assert.equal(row.readings[0].domain, 'clear');
  assert.ok(out.refusals.some((r) => r.actId === 'o2' && r.reason === DSN_REFUSALS.alreadyAssessed));
});

test('malformed decisions and acts are dropped and counted; nothing is repaired', () => {
  const state = {
    domainDecisions: [
      decision('D-OK', PANEL_TWO_LINES),
      decision('D-OK', PANEL_TWO_LINES),                                  // duplicate id
      decision('D-ONEMEMBER', [{ memberId: 'lone', lineId: 'a' }]),        // panel below minimum
      decision('D-LONG', PANEL_TWO_LINES, { senseByAt: '2027-06-01T09:00:00.000Z' }), // window too long
      decision('leader', PANEL_TWO_LINES),                                 // reserved seat as id
      decision('D-NOOWNER', PANEL_TWO_LINES, { ownerId: undefined }),
    ],
    domainSenseActs: [
      reading('p1', 'D-OK', 'lead-fin', 'finance', 'clear', { kind: 'precedent', cases: 2, note: 'Only two cases — below the precedent minimum.' }),
      reading('p2', 'D-GHOST', 'lead-fin', 'finance', 'clear', PRECEDENT),  // orphaned
      { id: 'p3', decisionId: 'D-OK', actorId: 'leader', kind: 'assess', lineId: 'finance', domain: 'clear', basis: PRECEDENT, assessedAt: READ_AT }, // reserved actor
    ],
  };
  const out = buildDomainSense(state, { now: NOW });
  assert.deepEqual(out.rows.map((r) => r.id), ['D-OK']);
  assert.equal(out.figuresComplete, false);
  assert.equal(out.warnings.length, 2, 'one decision warning and one act warning');
  assert.match(out.warnings[0], /refused 5 unreadable.*decision row/);
  assert.match(out.warnings[1], /acts: refused 3/);
  assert.equal(rowOf(out, 'D-OK').readings.length, 0);
});

test('an overdue sensing window and a stale reading are flagged, and neither changes the domain', () => {
  const panel = PANEL_TWO_LINES;
  const late = '2026-11-25T12:00:00.000Z'; // after SENSE_BY, so overdue
  const out = buildDomainSense({
    domainDecisions: [decision('D-LATE', panel, { openedAt: '2026-09-25T09:00:00.000Z' })],
    domainSenseActs: [
      reading('q1', 'D-LATE', 'lead-fin', 'finance', 'clear', PRECEDENT, '2026-10-02T10:00:00.000Z'),
      reading('q2', 'D-LATE', 'lead-plat', 'platform', 'complicated', ANALYSIS, '2026-10-03T10:00:00.000Z'),
    ],
  }, { now: late });
  const row = rowOf(out, 'D-LATE');
  assert.equal(row.state, 'domain-contested', 'a stale split is still a split — the flags decide nothing');
  assert.equal(row.domain, null);
  assert.deepEqual(row.flags.sort(), ['reading-stale', 'sense-overdue']);
});

test('the output is independent of act input order and never mutates the input', () => {
  const acts = [
    reading('r1', 'D-ORDER', 'lead-fin', 'finance', 'clear', PRECEDENT, '2026-11-05T10:00:00.000Z'),
    reading('r2', 'D-ORDER', 'lead-sales', 'sales', 'clear', PRECEDENT, '2026-11-05T11:00:00.000Z'),
    commitment('r3', 'D-ORDER', 'standard-practice', '2026-11-08T10:00:00.000Z'),
  ];
  const state = { domainDecisions: [decision('D-ORDER', PANEL_TWO_LINES)], domainSenseActs: acts };
  const snapshot = JSON.stringify(state);
  const forward = buildDomainSense(state, { now: NOW });
  const reversed = buildDomainSense({ domainDecisions: state.domainDecisions, domainSenseActs: [...acts].reverse() }, { now: NOW });
  assert.equal(JSON.stringify(forward), JSON.stringify(reversed));
  assert.equal(JSON.stringify(state), snapshot, 'the input must not be mutated');
});

test('an invalid clock fails loudly rather than producing a reading', () => {
  assert.throws(() => buildDomainSense({ domainDecisions: [], domainSenseActs: [] }, { now: 'not-a-time' }), TypeError);
});

test('an empty workspace reads with zero decisions and reconciles', () => {
  const out = buildDomainSense({}, { now: NOW });
  assert.equal(out.counts.decisions, 0);
  assert.equal(out.stateCountsReconcile, true);
  assert.equal(out.fitCountsReconcile, true);
  assert.equal(out.figuresComplete, true);
  assert.equal(out.rule, DSN_RULE_ID);
  assert.equal(out.method.adr, DSN_ADR);
});

test('printed counts are re-derived independently from hand-built fixtures', () => {
  // Known by construction:
  //   D-A  agreed clear, committed standard-practice            → domain-agreed, fit
  //   D-B  agreed complex, no commitment                        → domain-agreed, owed
  //   D-C  contested clear vs complicated, committed analysis   → domain-contested, not-readable
  //   D-D  one reading only                                     → awaiting-quorum, not-readable
  //   D-E  no readings                                          → awaiting-readings, not-readable
  //   D-F  agreed chaotic, committed expert-analysis            → domain-agreed, mismatch
  const state = {
    domainDecisions: ['D-A', 'D-B', 'D-C', 'D-D', 'D-E', 'D-F'].map((id) => decision(id, PANEL_TWO_LINES)),
    domainSenseActs: [
      reading('s01', 'D-A', 'lead-fin', 'finance', 'clear', PRECEDENT),
      reading('s02', 'D-A', 'lead-sales', 'sales', 'clear', PRECEDENT),
      commitment('s03', 'D-A', 'standard-practice'),
      reading('s04', 'D-B', 'lead-fin', 'finance', 'complex', PROBE),
      reading('s05', 'D-B', 'lead-plat', 'platform', 'complex', PROBE),
      reading('s06', 'D-C', 'lead-fin', 'finance', 'clear', PRECEDENT),
      reading('s07', 'D-C', 'lead-plat', 'platform', 'complicated', ANALYSIS),
      commitment('s08', 'D-C', 'expert-analysis'),
      reading('s09', 'D-D', 'lead-fin', 'finance', 'clear', PRECEDENT),
      reading('s10', 'D-F', 'lead-fin', 'finance', 'chaotic', ONSET, '2026-11-04T08:00:00.000Z'),
      reading('s11', 'D-F', 'lead-sales', 'sales', 'chaotic', ONSET, '2026-11-04T08:30:00.000Z'),
      commitment('s12', 'D-F', 'expert-analysis'),
    ],
  };
  const out = buildDomainSense(state, { now: NOW });
  const stateOf = Object.fromEntries(out.rows.map((r) => [r.id, r.state]));
  const fitOf = Object.fromEntries(out.rows.map((r) => [r.id, r.fit]));
  assert.deepEqual(stateOf, {
    'D-A': 'domain-agreed', 'D-B': 'domain-agreed', 'D-C': 'domain-contested',
    'D-D': 'awaiting-quorum', 'D-E': 'awaiting-readings', 'D-F': 'domain-agreed',
  });
  assert.deepEqual(fitOf, {
    'D-A': 'fit', 'D-B': 'owed', 'D-C': 'not-readable', 'D-D': 'not-readable', 'D-E': 'not-readable', 'D-F': 'mismatch',
  });
  assert.equal(out.counts.states['domain-agreed'], 3);
  assert.equal(out.counts.states['domain-contested'], 1);
  assert.equal(out.counts.states['awaiting-quorum'], 1);
  assert.equal(out.counts.states['awaiting-readings'], 1);
  assert.equal(out.counts.fit.fit, 1);
  assert.equal(out.counts.fit.owed, 1);
  assert.equal(out.counts.fit.mismatch, 1);
  assert.equal(out.counts.fit['not-readable'], 3);
  assert.equal(out.counts.agreedDomains.clear, 1);
  assert.equal(out.counts.agreedDomains.complex, 1);
  assert.equal(out.counts.agreedDomains.chaotic, 1);
  assert.equal(out.counts.readings, 9);
  assert.equal(out.counts.commitments, 3);
  assert.equal(out.stateCountsReconcile, true);
  assert.equal(out.fitCountsReconcile, true);
  // one refusal is expected: none in this fixture
  assert.equal(out.refusals.length, 0);
  assert.equal(out.figuresComplete, true);
});

test('the domain-to-mode map is one-to-one, covers every domain, and matches the registry limits', () => {
  assert.deepEqual(Object.keys(DSN_FIT).sort(), [...DSN_DOMAIN_KEYS].sort());
  assert.equal(new Set(Object.values(DSN_FIT)).size, DSN_DOMAIN_KEYS.length, 'no mode may fit two domains');
  assert.equal(DSN_LIMITS.quorumAssessors, 2);
  assert.equal(DSN_LIMITS.quorumLines, 2);
});
