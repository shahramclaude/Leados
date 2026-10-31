/**
 * tests/app/drift-transport.test.mjs — transport, decomposed (Session 95,
 * ADR-0058, RULE-SURV-08, SURV-11).
 *
 * Verifies:
 *   1. The generalized landmark cohorts: driftCohortsAt(τ=30) is bit-identical
 *      to the Session-94 cohort definition; the 14/60 flanks cap follow-up at
 *      τ and refuse thin cohorts with counts, never estimates.
 *   2. The multi-landmark profile: the substitution fixture is significant at
 *      day 14 under the profile's own 24-test Holm family, the identity holds
 *      at every assessed landmark, and a late-only fixture (no exits before
 *      day 45) is refused at 14/30 and named at 60.
 *   3. profileShape on fabricated blocks: flat / early-only / late-only /
 *      sustained / crossing / not-assessed.
 *   4. classTransport: substitution → completion-only; timing-only drift →
 *      timing-only; improvement → favorable-shift (never a failure); empty
 *      klass → not-assessed, and the function is total on fabricated input.
 *   5. Downstream consumption: wait-cost row confidence stays evidence-based
 *      under a completion-only failure (basis names the overdue framing) and
 *      caps at low under a timing failure; SURV-11 fires only in the
 *      completion-only case.
 *   6. RULE-SURV-08: a frozen reading gains a challenge note but keeps its
 *      frozen probabilities; a completion-only failure opens no re-freeze
 *      task; a timing failure opens exactly one, linked to the certificate;
 *      replay is empty.
 *   7. Consequence readings stamp both transport axes at freeze and the
 *      stamps survive normalization; an invalid axis string is cleared.
 *   8. CSV #53 transport/profile columns: measured values leave, refusals are
 *      blank, no titles.
 *   9. The classes panel renders the transport card with a labelled,
 *      well-formed landmark table.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { addDays, dayKey, weekKey } from '../../app/core/time.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  SURVIVAL_SIGNAL_IDS,
  classTransport,
  driftCohorts,
  driftCohortsAt,
  driftDecomposition,
  driftLandmarkProfile,
  profileShape,
  survivalReport,
  survivalSignals,
} from '../../app/core/domain/survival.js';
import { survivalRule, SURVIVAL_RULE_IDS } from '../../app/core/domain/survivalRules.js';
import { waitCostReport } from '../../app/core/domain/waitCost.js';
import { buildConsequenceReading } from '../../app/core/domain/consequence.js';
import { normalizeConsequenceReadings } from '../../app/core/domain/consequenceSchema.js';
import { renderSurvival } from '../../app/views/survival.js';

const NOW = new Date('2026-10-31T12:00:00.000Z');
const TODAY = dayKey(NOW);
const dateAgo = (n) => dayKey(addDays(NOW, -n));

/* ------------------------------------------------------------ state fixtures */

function reqRecord(group, i, status, exitDay) {
  const openedOn = dateAgo(group === 'recent' ? 40 + i : 100 + i);
  return {
    id: `${group}-req-${i}`,
    title: `Confidential requisition ${group} ${i}`,
    status,
    openedOn,
    closedOn: exitDay === null ? null : dayKey(addDays(openedOn, exitDay)),
  };
}

/** The Session-94 substitution fixture: prior all filled, recent all cancelled. */
function substitutionState(extra = {}) {
  return {
    settings: { leaderName: 'Leader' },
    people: [{ id: 'p1', name: 'Leader', status: 'active' }],
    requisitions: [
      ...Array.from({ length: 20 }, (_, i) => reqRecord('prior', i, 'filled', 2 + i)),
      ...Array.from({ length: 20 }, (_, i) => reqRecord('recent', i, 'cancelled', 2 + i)),
      { id: 'open-req', title: 'Confidential open requisition', status: 'open', openedOn: dateAgo(5), closedOn: null },
    ],
    decisions: [],
    delegations: [],
    links: [],
    survivalReadings: [],
    survivalMarkers: [],
    ...extra,
  };
}

/** Everyone still finishes by day 30, only slower: timing moves, mix does not. */
function timingOnlyState(extra = {}) {
  return {
    settings: { leaderName: 'Leader' },
    people: [{ id: 'p1', name: 'Leader', status: 'active' }],
    cases: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `prior${i}`, title: `prior${i}`, status: 'resolved',
        openedOn: dateAgo(100 + i), resolvedOn: dayKey(addDays(dateAgo(100 + i), 3)),
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `recent${i}`, title: `recent${i}`, status: 'resolved',
        openedOn: dateAgo(40 + i), resolvedOn: dayKey(addDays(dateAgo(40 + i), 25)),
      })),
      { id: 'open-case', title: 'open case', status: 'open', openedOn: dateAgo(5) },
    ],
    decisions: [],
    delegations: [],
    links: [],
    survivalReadings: [],
    survivalMarkers: [],
    ...extra,
  };
}

/* --------------------------------------------------------- landmark cohorts */

describe('generalized landmark cohorts', () => {
  test('τ = 30 reproduces the Session-94 cohort definition exactly', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'hiring', startedOn: dateAgo(40 + i), elapsedDays: 2 + i, exitType: 'abandoned' })),
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'hiring', startedOn: dateAgo(100 + i), elapsedDays: 2 + i, exitType: 'completed' })),
      { kind: 'hiring', startedOn: dateAgo(10), elapsedDays: 10, exitType: null },
      { kind: 'hiring', startedOn: dateAgo(200), elapsedDays: 50, exitType: 'completed' },
    ];
    assert.deepEqual(driftCohortsAt(items, 'hiring', TODAY, 30), driftCohorts(items, 'hiring', TODAY));
  });

  test('the flanks cap follow-up at τ and keep an exit only inside the window', () => {
    const items = [
      { kind: 'case', startedOn: dateAgo(20), elapsedDays: 20, exitType: 'completed' },
      { kind: 'case', startedOn: dateAgo(20), elapsedDays: 9, exitType: 'abandoned' },
    ];
    const at14 = driftCohortsAt(items, 'case', TODAY, 14);
    assert.equal(at14.recent.length, 2, 'started 20 days ago is in the day-14 recent window');
    assert.equal(at14.recent[0].elapsedDays, 14, 'follow-up is capped at τ');
    assert.equal(at14.recent[0].exitType, null, 'an exit after τ is a censoring at τ, not an event');
    assert.equal(at14.recent[1].exitType, 'abandoned', 'an exit inside the window stays an event');
    const at60 = driftCohortsAt(items, 'case', TODAY, 60);
    assert.equal(at60.recent.length + at60.prior.length, 0, 'too young for the day-60 cohorts: excluded, never extrapolated');
  });

  test('the substitution fixture at day 14 is significant under the profile family; day 60 refuses', () => {
    const report = survivalReport(substitutionState(), NOW);
    const hiring = report.classes.find((r) => r.key === 'hiring');
    const at14 = hiring.profile.landmarks.find((row) => row.horizonDays === 14);
    const at60 = hiring.profile.landmarks.find((row) => row.horizonDays === 60);
    assert.equal(at14.available, true);
    assert.ok(Math.abs(at14.identityResidual) < 1e-5, 'the partition is exact at day 14 too');
    assert.equal(at14.completion.significant, true, 'completions down by day 14');
    assert.equal(at14.completion.direction, 'down');
    assert.equal(at14.abandonment.significant, true, 'abandonments up by day 14');
    assert.equal(at60.available, false, 'no prior cohort exists 120–179 days ago in this fixture');
    assert.match(at60.reason, /at least 8 dated items/);
    assert.equal(hiring.transport.shape, 'multi-landmark', 'significant at 14 and 30, day 60 unassessed');
  });

  test('a late-only shift (no exits before day 45) is silent at 14/30 and named at 60', () => {
    const items = [
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'work', startedOn: dateAgo(70 + i), elapsedDays: 45, exitType: 'abandoned' })),
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'work', startedOn: dateAgo(130 + i), elapsedDays: 45, exitType: 'completed' })),
    ];
    const profile = driftLandmarkProfile(items, TODAY).find((r) => r.key === 'work');
    const at14 = profile.landmarks.find((row) => row.horizonDays === 14);
    const at60 = profile.landmarks.find((row) => row.horizonDays === 60);
    assert.equal(at14.available === false || at14.completion.refused, true,
      'day 14 has nothing to say: thin cohorts or zero events — refused either way');
    const day30 = driftDecomposition(items, TODAY).find((r) => r.key === 'work');
    assert.equal(day30.completion.refused, true, 'no exit of either kind happened by day 30');
    assert.equal(at60.available, true);
    assert.equal(at60.completion.significant, true);
    assert.equal(at60.completion.direction, 'down');
    const shape = profileShape(
      { available: true, completion: { significant: false }, abandonment: { significant: false } },
      profile,
    );
    assert.equal(shape, 'late-only');
  });

  test('profile adjusted p-values are Holm-monotone over the 24-test family', () => {
    const report = survivalReport(substitutionState(), NOW);
    const blocks = report.classes.flatMap((k) => (k.profile?.landmarks || [])
      .flatMap((row) => [row.completion, row.abandonment])
      .filter((b) => b && b.p !== null && !b.refused));
    const byRaw = [...blocks].sort((a, b) => a.p - b.p);
    for (let i = 1; i < byRaw.length; i += 1) {
      assert.ok(byRaw[i].adjustedP >= byRaw[i - 1].adjustedP - 1e-12, 'step-down monotonicity');
    }
    // adjustedP is rounded to 4 dp for display, so a raw p below 5e-5 can
    // print as 0; the inequality holds up to that rounding.
    for (const block of byRaw) assert.ok(block.adjustedP >= block.p - 5e-5, 'never smaller than the raw p (beyond 4 dp rounding)');
  });
});

/* ------------------------------------------------------------------ shape */

describe('profileShape', () => {
  const block = (significant, direction = null) => ({ significant, direction });
  const lm = (tau, c, a) => ({ horizonDays: tau, available: true, completion: c, abandonment: a });
  const day30 = (c, a) => ({ available: true, completion: c, abandonment: a });

  test('flat, early-only, sustained, crossing and not-assessed', () => {
    const flatProfile = { landmarks: [lm(14, block(false), block(false)), lm(60, block(false), block(false))] };
    assert.equal(profileShape(day30(block(false), block(false)), flatProfile), 'flat');
    assert.equal(profileShape(null, { landmarks: [] }), 'not-assessed');
    assert.equal(profileShape(
      day30(block(false), block(false)),
      { landmarks: [lm(14, block(true, 'down'), block(false)), lm(60, block(false), block(false))] },
    ), 'early-only');
    assert.equal(profileShape(
      day30(block(true, 'down'), block(false)),
      { landmarks: [lm(14, block(true, 'down'), block(false)), lm(60, block(true, 'down'), block(false))] },
    ), 'sustained');
    assert.equal(profileShape(
      day30(block(false), block(false)),
      { landmarks: [lm(14, block(true, 'up'), block(false)), lm(60, block(true, 'down'), block(false))] },
    ), 'crossing', 'the same cause in opposite directions at different landmarks');
  });
});

/* --------------------------------------------------------------- transport */

describe('classTransport', () => {
  test('substitution → completion-only: timing supported, completion undermined', () => {
    const report = survivalReport(substitutionState(), NOW);
    const hiring = report.classes.find((r) => r.key === 'hiring');
    assert.equal(hiring.transport.headline, 'completion-only');
    assert.equal(hiring.transport.timing.status, 'supported');
    assert.equal(hiring.transport.completion.status, 'undermined');
    assert.match(hiring.transport.completion.basis, /Abandonments replacing completions/);
  });

  test('timing-only drift → timing-only: completion supported', () => {
    const report = survivalReport(timingOnlyState(), NOW);
    const cases = report.classes.find((r) => r.key === 'case');
    assert.equal(cases.drift.changed, true);
    assert.equal(cases.transport.headline, 'timing-only');
    assert.equal(cases.transport.completion.status, 'supported');
  });

  test('an improvement is a favorable shift, never a failure', () => {
    const state = substitutionState();
    state.requisitions = [
      ...Array.from({ length: 20 }, (_, i) => reqRecord('prior', i, 'cancelled', 2 + i)),
      ...Array.from({ length: 20 }, (_, i) => reqRecord('recent', i, 'filled', 2 + i)),
    ];
    const hiring = survivalReport(state, NOW).classes.find((r) => r.key === 'hiring');
    assert.equal(hiring.transport.completion.status, 'favorable-shift');
    assert.notEqual(hiring.transport.headline, 'completion-only');
    assert.match(hiring.transport.completion.basis, /conservative/);
  });

  test('total on fabricated or empty input', () => {
    for (const klass of [null, undefined, {}, { drift: null, decomp: null }]) {
      const t = classTransport(klass);
      assert.equal(t.headline, 'not-assessed');
      assert.equal(t.timing.status, 'not-assessed');
      assert.equal(t.completion.status, 'not-assessed');
    }
  });
});

/* ------------------------------------------------------- downstream wiring */

describe('downstream consumption', () => {
  test('SURV-11 fires only when completion fails and timing holds', () => {
    const sub = survivalSignals(substitutionState(), NOW).filter((s) => s.ruleId === 'SURV-11');
    assert.equal(sub.length, 1);
    assert.ok(SURVIVAL_SIGNAL_IDS.includes('SURV-11'));
    assert.match(sub[0].detail, /still describe recent work/);
    const timing = survivalSignals(timingOnlyState(), NOW).filter((s) => s.ruleId === 'SURV-11');
    assert.equal(timing.length, 0, 'a timing failure is SURV-08’s sentence, not this one');
  });

  test('wait-cost confidence: completion-only failure keeps the level, names the framing', () => {
    const state = substitutionState({
      settings: { leaderName: 'Leader' },
      waitPrices: [{ id: 'wp-hiring', classKey: 'hiring', weeklyAmount: 500, currency: 'USD' }],
    });
    const report = waitCostReport(state, NOW, state.settings);
    const row = report.rows.find((r) => r.item.sourceId === 'open-req');
    assert.ok(row, 'the open requisition is in the queue');
    assert.match(row.confidence.basis, /completion transport failed/);
    assert.doesNotMatch(row.confidence.basis, /Timing transport failed/);
    assert.equal(row.confidence.transport.headline, 'completion-only');
    assert.notEqual(row.confidence.level, 'low', 'the level is evidence-based: 40 class exits, timing intact');
  });

  test('wait-cost confidence: a timing failure caps the row at low', () => {
    const state = timingOnlyState({
      settings: { leaderName: 'Leader' },
      waitPrices: [{ id: 'wp-case', classKey: 'case', weeklyAmount: 500, currency: 'USD' }],
    });
    const report = waitCostReport(state, NOW, state.settings);
    const row = report.rows.find((r) => r.item.sourceId === 'open-case');
    assert.ok(row);
    assert.equal(row.confidence.level, 'low');
    assert.match(row.confidence.basis, /Timing transport failed/);
    assert.match(row.confidence.basis, /No price or probability has been silently adjusted/);
  });

  test('consequence readings stamp both axes; stamps survive normalization, junk is cleared', () => {
    const focused = {
      decision: { id: 'd1' },
      transport: { timing: { status: 'undermined' }, completion: { status: 'supported' } },
      graph: { direct: [], secondOrder: [], invalidEdges: 0, truncated: false },
      footprint: { fragile: [] },
      conventions: { maxLinks: 12 },
      horizons: [{
        weeks: 2,
        area: { available: true, boundHolds: true, probabilityPct: 40 },
        price: null, expectedCost: null, fullWaitCeiling: null,
        related: { priced: 0 },
      }],
    };
    const reading = buildConsequenceReading(focused, 2, NOW, 'csq-transport-1');
    assert.ok(reading);
    assert.equal(reading.graphSnapshot.transportTiming, 'undermined');
    assert.equal(reading.graphSnapshot.transportCompletion, 'supported');
    const warnings = [];
    const [normalized] = normalizeConsequenceReadings([reading], NOW, warnings);
    assert.equal(normalized.graphSnapshot.transportTiming, 'undermined', 'the stamp survives a reload');
    assert.equal(normalized.graphSnapshot.transportCompletion, 'supported');
    const [junk] = normalizeConsequenceReadings(
      [{ ...reading, graphSnapshot: { ...reading.graphSnapshot, transportTiming: 'bogus-axis' } }],
      NOW, [],
    );
    assert.equal(junk.graphSnapshot.transportTiming, null, 'an unknown axis string is cleared, not trusted');
  });
});

/* ------------------------------------------------------------ RULE-SURV-08 */

function scanCtx() {
  let id = 0;
  const logs = [];
  return {
    ctx: { now: NOW, event: { type: 'survival.scan' }, idFactory: (p) => `${p}${++id}`, logEvent: (e) => logs.push(e) },
    logs,
  };
}

function frozenReading(classKey, id = 'reading-1') {
  return {
    id,
    status: 'frozen',
    label: 'Fixture reading',
    horizonDays: 30,
    reviewOn: dayKey(addDays(NOW, 10)),
    frozenOn: TODAY,
    predictions: [
      { itemKey: 'x', sourceType: 'requisition', sourceId: 'open-req', title: 'open', kind: classKey, classKey, probabilityPct: 42, elapsedDays: 5, atRisk: 12 },
    ],
    notes: [],
    markers: [],
  };
}

describe('RULE-SURV-08 frozen-artefact challenge', () => {
  test('completion-only failure: the reading is challenged, the certificate is left alone', () => {
    const draft = substitutionState({
      survivalReadings: [frozenReading('hiring')],
      waitExposures: [{ id: 'wx-1', week: weekKey(NOW), items: [{ classKey: 'hiring', sourceId: 'open-req' }] }],
    });
    const before = JSON.stringify(draft.survivalReadings[0].predictions);
    const { ctx } = scanCtx();
    const effects = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.TRANSPORT);
    assert.equal(effects.filter((e) => e.targetType === 'reading').length, 1);
    assert.equal(effects.filter((e) => e.targetType === 'delegation').length, 0,
      'timing holds, so the exposure certificate still describes recent work — no re-freeze work');
    const reading = draft.survivalReadings[0];
    assert.equal(JSON.stringify(reading.predictions), before, 'frozen probabilities are never rewritten');
    assert.ok(reading.notes.some((n) => /Transport challenge/.test(n.text) && /completion axis/.test(n.text)));
    const replay = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.TRANSPORT);
    assert.equal(replay.length, 0, 'marker-idempotent per artefact, class, axis and week');
  });

  test('timing failure: exactly one owned re-freeze task, linked to the certificate', () => {
    const draft = timingOnlyState({
      survivalReadings: [frozenReading('case')],
      waitExposures: [{ id: 'wx-9', week: weekKey(NOW), items: [{ classKey: 'case', sourceId: 'open-case' }] }],
    });
    const { ctx } = scanCtx();
    const effects = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.TRANSPORT);
    assert.equal(effects.filter((e) => e.targetType === 'delegation').length, 1);
    assert.ok(draft.delegations.some((row) => String(row.title).startsWith('Re-freeze the cost-of-waiting exposure')));
    assert.ok(draft.links.some((l) => l.targetType === 'exposure' && l.targetId === 'wx-9' && l.relation === 'tracks-followup'),
      'the task is typed-linked to the challenged certificate');
    assert.ok(draft.survivalReadings[0].notes.some((n) => /timing axis/.test(n.text)));
    const replay = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.TRANSPORT);
    assert.equal(replay.length, 0, 'marker-idempotent');
  });

  test('a graded reading and an untouched class are never challenged', () => {
    const graded = { ...frozenReading('hiring'), status: 'graded' };
    const other = frozenReading('delegation', 'reading-2');
    const draft = substitutionState({ survivalReadings: [graded, other] });
    const { ctx } = scanCtx();
    const effects = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.TRANSPORT);
    assert.equal(effects.length, 0);
    assert.equal(graded.notes.length, 0, 'a settled audit record is history, not a live forecast');
    assert.equal(other.notes.length, 0, 'no prediction rides on the challenged class');
  });
});

/* --------------------------------------------------------------------- CSV */

describe('CSV scope #53 transport and profile columns', () => {
  test('measured transport leaves as codes; refused landmarks are blank; no titles', () => {
    const text = exportWorkspaceCsv(substitutionState(), 'survival', { now: NOW });
    const csv = typeof text === 'string' ? text : text.csv || text.text;
    const lines = csv.trim().split('\n');
    const header = lines[0].split(',');
    const at = (name) => header.indexOf(name);
    for (const name of ['transport_timing', 'transport_completion', 'transport_shape',
      'cif_complete_14_delta', 'cif_abandon_14_holm_p', 'cif_complete_60_delta']) {
      assert.ok(at(name) >= 0, `column ${name} exists`);
    }
    const rows = lines.slice(1).map((line) => line.split(','));
    const hiring = rows.find((row) => row[at('decomp_verdict')] === 'substitution');
    assert.ok(hiring);
    assert.equal(hiring[at('transport_timing')], 'supported');
    assert.equal(hiring[at('transport_completion')], 'undermined');
    assert.equal(hiring[at('transport_shape')], 'multi-landmark');
    assert.ok(hiring[at('cif_complete_14_delta')] !== '', 'the day-14 delta is measured');
    assert.equal(hiring[at('cif_complete_60_delta')], '', 'day 60 refused → blank, never zero');
    const empty = rows.find((row) => row[at('decomp_verdict')] === '' && row[at('items')] === '0');
    assert.ok(empty);
    assert.equal(empty[at('transport_timing')], '', 'an unmeasured class exports blanks');
    assert.ok(!csv.includes('Confidential'), 'no record title leaves in the export');
  });
});

/* -------------------------------------------------------------------- view */

describe('the transport card', () => {
  function renderDom(state, hash) {
    const ROOT = path.resolve(import.meta.dirname, '../..');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(html, { url: 'https://leados.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;
    globalThis.MouseEvent = dom.window.MouseEvent;
    globalThis.KeyboardEvent = dom.window.KeyboardEvent;
    const node = renderSurvival({
      state,
      now: NOW,
      query: new URLSearchParams(hash.split('?')[1] || ''),
      navigate: () => {},
      api: { scanSurvival: () => ({ ok: true, changed: false }), survivalBriefText: () => 'brief' },
    });
    dom.window.document.getElementById('view').appendChild(node);
    return dom.window;
  }

  test('renders both axes, the shape and a well-formed landmark table', () => {
    const window = renderDom(substitutionState(), '#/survival?panel=classes&class=hiring');
    const text = window.document.body.textContent;
    assert.match(text, /Transport, decomposed — which numbers may still be read\?/);
    assert.match(text, /Timing:/);
    assert.match(text, /Completion:/);
    assert.match(text, /Landmark shape:/);
    const table = [...window.document.querySelectorAll('table')]
      .find((row) => (row.getAttribute('aria-label') || '').includes('Multi-landmark exit-mix profile'));
    assert.ok(table, 'the landmark table is labelled');
    const headers = table.querySelectorAll('thead th').length;
    assert.equal(table.querySelectorAll('tbody tr').length, 3, 'one row per landmark (14 / 30 / 60)');
    for (const row of table.querySelectorAll('tbody tr')) {
      assert.equal(row.querySelectorAll('td').length, headers, 'one cell per header');
    }
    const method = renderDom(substitutionState(), '#/survival?panel=method');
    assert.match(method.document.body.textContent, /Multi-landmark profile and two-axis transport/);
    assert.match(method.document.body.textContent, /not causal transportability/);
  });
});
