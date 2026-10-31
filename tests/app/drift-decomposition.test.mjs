/**
 * tests/app/drift-decomposition.test.mjs — competing-risk drift decomposition
 * (Session 94, ADR-0057, RULE-SURV-07, SURV-09/10).
 *
 * Verifies:
 *   1. The Kaplan–Meier partition: survival + completion incidence +
 *      abandonment incidence = 1 at every step, with the abandonment
 *      incidence hand-checked on a six-item fixture.
 *   2. The headline case: completions silently replaced by abandonments at
 *      identical exit times — any-exit drift stays silent, the decomposition
 *      names a substitution, and the identity holds with zero residual.
 *   3. Component verdicts: completion-decline, abandonment-rise, improvement,
 *      no-attributable-shift, and the sparse-cause refusal.
 *   4. Report wiring, SURV-09/10 signals and the brief (no titles).
 *   5. RULE-SURV-07 fan-out: one component-framed DACI decision per class per
 *      week, exhibits linked, SURV-06 precedence in both directions, the
 *      improvement learning task, marker idempotency, and a real store/API
 *      scan that persists across reload.
 *   6. CSV scope #53 decomposition columns: present when measured, blank when
 *      refused, never carrying a title or a name.
 *   7. The view: decomposition card, verdict, one cell per header, and the
 *      method panel's named non-claims.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import { normalizeState } from '../../app/core/schema.js';
import { addDays, dayKey, weekKey } from '../../app/core/time.js';
import { exportWorkspaceCsv } from '../../app/core/csv.js';
import {
  DRIFT_MIN_CAUSE_EVENTS,
  SURVIVAL_SIGNAL_IDS,
  calendarDrift,
  driftDecomposition,
  fisherExactTwoSided,
  kaplanMeier,
  survivalAttentionCount,
  survivalBrief,
  survivalReport,
  survivalSignals,
} from '../../app/core/domain/survival.js';
import { survivalRule, SURVIVAL_RULE_IDS } from '../../app/core/domain/survivalRules.js';
import { renderSurvival } from '../../app/views/survival.js';

const NOW = new Date('2026-10-31T12:00:00.000Z');
const TODAY = dayKey(NOW);
const dateAgo = (n) => dayKey(addDays(NOW, -n));

/* ------------------------------------------------------------ item fixtures */

/** 20 items per cohort, exits spread over days 2..21. */
function itemCohort(group, kind, exitType, exitDays = null) {
  return Array.from({ length: 20 }, (_, i) => ({
    key: `${group}${kind}${i}`,
    kind,
    startedOn: dateAgo(group === 'recent' ? 40 + i : 100 + i),
    elapsedDays: exitDays ? exitDays(i) : 2 + i,
    exitType,
  }));
}

function substitutionItems(kind = 'hiring') {
  return [
    ...itemCohort('prior', kind, 'completed'),
    ...itemCohort('recent', kind, 'abandoned'),
  ];
}

/* ------------------------------------------------------------- KM partition */

describe('the two-cause partition inside kaplanMeier', () => {
  test('survival + completion incidence + abandonment incidence = 1 at every step', () => {
    const curve = kaplanMeier([
      { elapsedDays: 5, exitType: 'completed' },
      { elapsedDays: 5, exitType: 'abandoned' },
      { elapsedDays: 10, exitType: 'completed' },
      { elapsedDays: 10, exitType: null },
      { elapsedDays: 20, exitType: 'abandoned' },
      { elapsedDays: 20, exitType: 'completed' },
    ]);
    for (const step of curve.steps) {
      assert.ok(Math.abs(step.survival + step.cif + step.cifA - 1) < 2e-6, `step ${step.time} partitions`);
      assert.ok(step.cifAse >= 0, 'abandonment standard error is never negative');
    }
    // Hand check: F_a(5)=1/6; at day 20 the risk set is 2 with S=1/2, so one
    // abandonment adds 1/4 → 5/12.
    assert.equal(curve.cifAbandonAt(30), 0.416667);
    assert.equal(curve.cifAt(30), 0.583333);
    assert.ok(curve.steps[curve.steps.length - 1].cifAse > 0);
  });

  test('the empty curve answers zero abandonment incidence, never a guess', () => {
    assert.equal(kaplanMeier([]).cifAbandonAt(30), 0);
    assert.equal(kaplanMeier().cifAbandonAt(30), 0);
  });

  test('the incidence variance collapses to the multinomial F(1−F)/n without censoring', () => {
    // The anchor case for the delta-method variance (ADR-0057): with nobody
    // censored before the end, the Aalen–Johansen estimator is a multinomial
    // proportion, so its variance must be F(1−F)/n = 0.4·0.6/20 = 0.012 —
    // lumped or spread, the answer may not depend on event-time spacing.
    // The pre-Session-94 transcription answered 0.0048 lumped and 0.0344
    // spread for this same data; this test is what catches a return.
    const lumped = kaplanMeier([
      ...Array.from({ length: 12 }, () => ({ elapsedDays: 5, exitType: 'completed' })),
      ...Array.from({ length: 8 }, () => ({ elapsedDays: 20, exitType: 'abandoned' })),
    ]);
    const spread = kaplanMeier([
      ...Array.from({ length: 12 }, (_, i) => ({ elapsedDays: 2 + i, exitType: 'completed' })),
      ...Array.from({ length: 8 }, (_, i) => ({ elapsedDays: 15 + i, exitType: 'abandoned' })),
    ]);
    for (const curve of [lumped, spread]) {
      const last = curve.steps[curve.steps.length - 1];
      assert.ok(Math.abs(last.cifAse ** 2 - 0.012) < 1e-6, `abandonment variance ${last.cifAse ** 2}`);
      assert.ok(Math.abs(last.cifSe ** 2 - 0.012) < 1e-6, `completion variance ${last.cifSe ** 2}`);
    }
  });
});

/* --------------------------------------------------------- the decomposition */

describe('driftDecomposition', () => {
  test('silent substitution: any-exit drift is blind, the decomposition is not', () => {
    const items = substitutionItems();
    const drift = calendarDrift(items, TODAY).find((r) => r.key === 'hiring');
    assert.equal(drift.changed, false, 'identical exit times: the pooled test cannot see it');
    const d = driftDecomposition(items, TODAY).find((r) => r.key === 'hiring');
    assert.equal(d.available, true);
    assert.equal(d.verdict, 'substitution');
    assert.equal(d.adverse, true);
    assert.equal(d.completion.prior, 1);
    assert.equal(d.completion.recent, 0);
    assert.equal(d.completion.delta, -1);
    assert.equal(d.abandonment.delta, 1);
    assert.equal(d.stillOpen.delta, 0);
    assert.ok(Math.abs(d.identityResidual) < 1e-6, 'the partition identity holds exactly');
    assert.ok(d.completion.adjustedP < 0.05 && d.abandonment.adjustedP < 0.05);
    assert.equal(d.completion.integratedDelta, -18.5, 'Pepe–Mori area: exits at 2..21 days → 30 − 11.5');
    assert.equal(d.abandonment.integratedDelta, 18.5);
    assert.ok(d.completion.lo >= -1 && d.completion.hi <= 1, 'the interval stays inside [-1, 1]');
  });

  test('completion-decline: work that used to finish now sits past day 30', () => {
    const items = [
      ...itemCohort('prior', 'hiring', 'completed'),
      ...itemCohort('recent', 'hiring', 'completed', (i) => 45 + i),
    ];
    const d = driftDecomposition(items, TODAY).find((r) => r.key === 'hiring');
    assert.equal(d.verdict, 'completion-decline');
    assert.equal(d.completion.recent, 0, 'every recent exit is censored at the day-30 landmark');
    assert.equal(d.stillOpen.recent, 1);
    assert.equal(d.abandonment.refused, true, 'zero abandonments is a refusal, not a 0% drift');
    assert.match(d.abandonment.reason, /floor/);
    assert.equal(d.abandonment.prior, null, 'a refused cause prints no share');
  });

  test('abandonment-rise alone: finishing holds, giving up grows', () => {
    const finishers = (group) => Array.from({ length: 12 }, (_, i) => ({
      key: `${group}f${i}`, kind: 'hiring',
      startedOn: dateAgo(group === 'recent' ? 40 + i : 100 + i),
      elapsedDays: 3 + i, exitType: 'completed',
    }));
    const priorRest = Array.from({ length: 8 }, (_, i) => ({
      key: `priorx${i}`, kind: 'hiring', startedOn: dateAgo(112 + i), elapsedDays: 80, exitType: null,
    }));
    const recentRest = Array.from({ length: 8 }, (_, i) => ({
      key: `recentx${i}`, kind: 'hiring', startedOn: dateAgo(52 + i), elapsedDays: 20 + i, exitType: 'abandoned',
    }));
    const d = driftDecomposition([...finishers('prior'), ...priorRest, ...finishers('recent'), ...recentRest], TODAY)
      .find((r) => r.key === 'hiring');
    assert.equal(d.completion.delta, 0);
    assert.equal(d.completion.significant, false);
    assert.equal(d.abandonment.delta, 0.4);
    assert.equal(d.verdict, 'abandonment-rise');
    assert.equal(d.adverse, true);
  });

  test('sparse causes refuse; thin cohorts refuse; equality claims nothing', () => {
    const sparse = [
      ...itemCohort('prior', 'hiring', 'completed'),
      ...itemCohort('recent', 'hiring', 'completed').map((row, i) => (i < 3 ? { ...row, exitType: 'abandoned' } : row)),
    ];
    const s = driftDecomposition(sparse, TODAY).find((r) => r.key === 'hiring');
    assert.equal(s.abandonment.events.pooled, 3);
    assert.ok(3 < DRIFT_MIN_CAUSE_EVENTS);
    assert.equal(s.abandonment.refused, true);
    assert.equal(s.abandonment.adjustedP, null);

    const thin = driftDecomposition(itemCohort('prior', 'hiring', 'completed').slice(0, 5), TODAY)
      .find((r) => r.key === 'hiring');
    assert.equal(thin.available, false);
    assert.equal(thin.verdict, 'refused');
    assert.match(thin.reason, /at least 8/);

    const equal = driftDecomposition([
      ...itemCohort('prior', 'hiring', 'completed'),
      ...itemCohort('recent', 'hiring', 'completed'),
    ], TODAY).find((r) => r.key === 'hiring');
    assert.equal(equal.verdict, 'no-attributable-shift');
    assert.equal(equal.adverse, false);
    assert.equal(equal.favorable, false);
  });

  test('the mirror image is an improvement, flagged favourable and never adverse', () => {
    const items = [
      ...itemCohort('prior', 'hiring', 'abandoned'),
      ...itemCohort('recent', 'hiring', 'completed'),
    ];
    const d = driftDecomposition(items, TODAY).find((r) => r.key === 'hiring');
    assert.equal(d.verdict, 'broad-improvement');
    assert.equal(d.favorable, true);
    assert.equal(d.adverse, false);
  });

  test('Holm: adjusted p never beats the raw p and preserves their order', () => {
    const items = [...substitutionItems('hiring'), ...substitutionItems('case')];
    const blocks = driftDecomposition(items, TODAY)
      .filter((r) => r.available)
      .flatMap((r) => [r.completion, r.abandonment])
      .filter((b) => !b.refused);
    assert.equal(blocks.length, 4);
    const byRaw = [...blocks].sort((a, b) => a.p - b.p);
    // adjustedP is rounded to 4dp for printing; the comparison tolerates that
    // rounding and nothing larger.
    for (const block of blocks) assert.ok(block.adjustedP >= Math.min(1, block.p) - 5e-5, 'Holm never shrinks a p-value');
    for (let i = 1; i < byRaw.length; i += 1) {
      assert.ok(byRaw[i].adjustedP >= byRaw[i - 1].adjustedP - 1e-12, 'step-down monotonicity');
    }
  });

  test('the Wald boundary falls back to Fisher exact, pinned to published values', () => {
    assert.ok(Math.abs(fisherExactTwoSided(4, 0, 0, 4) - 0.0285714) < 1e-6, 'the tea-tasting table');
    assert.ok(Math.abs(fisherExactTwoSided(3, 1, 1, 3) - 0.485714) < 1e-6);
    assert.ok(Math.abs(fisherExactTwoSided(1, 9, 11, 3) - 0.002759) < 1e-6, 'the R fisher.test textbook table');
    assert.equal(fisherExactTwoSided(10, 10, 10, 10) > 0.999999, true);
    // The substitution fixture sits exactly on the boundary (100% vs 0%), so
    // its p-values must come from the exact test, named as such.
    const d = driftDecomposition(substitutionItems(), TODAY).find((r) => r.key === 'hiring');
    assert.equal(d.completion.test, 'fisher');
    assert.equal(d.abandonment.test, 'fisher');
    assert.ok(d.completion.p < 1e-9);
    // Identical boundary shares are p = 1, not a refusal.
    const equal = driftDecomposition([
      ...itemCohort('prior', 'hiring', 'completed'),
      ...itemCohort('recent', 'hiring', 'completed'),
    ], TODAY).find((r) => r.key === 'hiring');
    assert.equal(equal.completion.test, 'boundary-equal');
    assert.equal(equal.completion.p, 1);
    assert.equal(equal.completion.refused, false);
  });
});

/* ----------------------------------------------------------- state fixtures */

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

function substitutionState() {
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
  };
}

function scanCtx() {
  let id = 0;
  const logs = [];
  return {
    ctx: { now: NOW, event: { type: 'survival.scan' }, idFactory: (p) => `${p}${++id}`, logEvent: (e) => logs.push(e) },
    logs,
  };
}

/* ----------------------------------------------------- report & signals */

describe('report wiring, signals and brief', () => {
  test('the report carries the decomposition and SURV-10 names the silent swap', () => {
    const state = substitutionState();
    const report = survivalReport(state, NOW);
    const hiring = report.classes.find((r) => r.key === 'hiring');
    assert.equal(hiring.decomp.verdict, 'substitution');
    assert.equal(hiring.drift.changed, false);
    const signals = survivalSignals(state, NOW);
    const mine = signals.filter((s) => s.ruleId === 'SURV-10');
    assert.equal(mine.length, 1);
    assert.match(mine[0].title, /quietly replacing completions/);
    assert.ok(signals.every((s) => SURVIVAL_SIGNAL_IDS.includes(s.ruleId)));
    assert.equal(signals.filter((s) => s.ruleId === 'SURV-09').length, 0, 'no double signal for one attribution');
    assert.ok(survivalAttentionCount(state, NOW) >= 1);
  });

  test('a completion-led shift fires SURV-09, and the brief attributes without titles', () => {
    const state = substitutionState();
    state.requisitions = [
      ...Array.from({ length: 20 }, (_, i) => reqRecord('prior', i, 'filled', 2 + i)),
      ...Array.from({ length: 20 }, (_, i) => reqRecord('recent', i, 'filled', 45 + i)),
    ];
    const signals = survivalSignals(state, NOW);
    assert.ok(signals.some((s) => s.ruleId === 'SURV-09'));
    const brief = survivalBrief(substitutionState(), NOW);
    assert.match(brief, /EXIT-MIX ATTRIBUTION/);
    assert.match(brief, /Abandonments replacing completions/);
    assert.ok(!brief.includes('Confidential requisition'), 'the brief never carries a record title');
  });
});

/* ------------------------------------------------------------------ the rule */

describe('RULE-SURV-07 on the spine', () => {
  test('scan opens one intake-framed decision with exhibits; SURV-06 stands down; replay is empty', () => {
    const draft = substitutionState();
    const { ctx, logs } = scanCtx();
    const effects = survivalRule(draft, ctx);
    const mine = effects.filter((e) => e.ruleId === SURVIVAL_RULE_IDS.DECOMP);
    assert.ok(mine.some((e) => e.targetType === 'decision'));
    assert.ok(mine.some((e) => e.targetType === 'delegation'));
    const decisions = draft.decisions.filter((row) => String(row.title).includes('Intake review'));
    assert.equal(decisions.length, 1, 'exactly one component-framed decision');
    assert.ok(!draft.decisions.some((row) => String(row.title).includes('Revalidate')), 'the generic SURV-06 review did not also open');
    assert.ok(draft.links.some((l) => l.targetId === 'open-req'), 'open work is linked');
    assert.ok(draft.links.some((l) => /^recent-req-/.test(l.targetId)), 'a recent abandonment is linked as an exhibit');
    assert.ok(logs.length >= mine.length, 'every effect is audited');
    const replay = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.DECOMP || e.ruleId === SURVIVAL_RULE_IDS.DRIFT);
    assert.equal(replay.length, 0, 'marker-idempotent');
    const { state: normalized } = normalizeState(draft);
    assert.ok(normalized.decisions.some((row) => String(row.title).includes('Intake review')), 'survives normalization');
    assert.ok(normalized.delegations.some((row) => String(row.title).includes('abandonments for the intake review')));
  });

  test('when SURV-06 already opened the week’s review, SURV-07 attaches work instead of a second decision', () => {
    const draft = substitutionState();
    const week = weekKey(NOW);
    const genericTag = `${SURVIVAL_RULE_IDS.DRIFT}:hiring:${week}`;
    draft.survivalMarkers.push(genericTag);
    draft.decisions.push({
      id: 'generic-1', title: 'Revalidate hiring requisitions forecasts after calendar drift',
      rationale: `Frozen transport diagnostic [${genericTag}].`, options: [], chosen: '',
    });
    const { ctx } = scanCtx();
    const effects = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.DECOMP);
    assert.equal(effects.filter((e) => e.targetType === 'decision').length, 0, 'SURV-07 opens no second decision (SURV-03’s separate class decision is pre-existing behaviour)');
    assert.ok(!draft.decisions.some((row) => String(row.title).includes('Intake review')));
    assert.ok(effects.some((e) => e.targetType === 'delegation'), 'the owned investigation still opens');
    assert.ok(draft.links.some((l) => l.sourceId === 'generic-1'), 'work hangs off the existing review');
  });

  test('timing-only drift still gets the generic SURV-06 review (no regression)', () => {
    const draft = {
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
      ],
      decisions: [], delegations: [], links: [], survivalReadings: [], survivalMarkers: [],
    };
    const { ctx } = scanCtx();
    const effects = survivalRule(draft, ctx);
    assert.ok(effects.some((e) => e.ruleId === SURVIVAL_RULE_IDS.DRIFT && e.targetType === 'decision'), 'SURV-06 fires: everyone still finishes by day 30, only slower');
    assert.ok(!effects.some((e) => e.ruleId === SURVIVAL_RULE_IDS.DECOMP && e.targetType === 'decision'), 'SURV-07 stays silent: the exit mix did not move');
  });

  test('a significant improvement opens one learning task and no decision', () => {
    const draft = substitutionState();
    draft.requisitions = [
      ...Array.from({ length: 20 }, (_, i) => reqRecord('prior', i, 'cancelled', 2 + i)),
      ...Array.from({ length: 20 }, (_, i) => reqRecord('recent', i, 'filled', 2 + i)),
    ];
    const { ctx } = scanCtx();
    const effects = survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.DECOMP);
    assert.equal(effects.filter((e) => e.targetType === 'decision').length, 0);
    assert.equal(effects.filter((e) => e.targetType === 'delegation').length, 1);
    assert.ok(draft.delegations.some((row) => String(row.title).startsWith('Capture what changed')));
    assert.equal(survivalRule(draft, ctx).filter((e) => e.ruleId === SURVIVAL_RULE_IDS.DECOMP).length, 0, 'idempotent');
  });

  test('the real API scan commits the fan-out atomically and it persists on reload', async () => {
    const { createStore } = await import('../../app/core/store.js');
    const { createApi } = await import('../../app/actions.js');
    const data = new Map();
    const storage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
    let id = 0;
    const idFactory = (p) => `${p}-decomp-${++id}`;
    const store = createStore({ storage, now: () => NOW, idFactory });
    store.load();
    store.update((draft) => Object.assign(draft, substitutionState()), { type: 'fixture.loaded', entity: 'workspace' });
    const api = createApi(store, { now: () => NOW, idFactory });
    api.scanSurvival();
    assert.ok(store.state.decisions.some((row) => String(row.title).includes('Intake review')));
    const restored = createStore({ storage, now: () => NOW, idFactory });
    restored.load();
    assert.ok(restored.state.decisions.some((row) => String(row.title).includes('Intake review')));
    assert.ok(restored.state.links.some((l) => l.targetId === 'open-req'));
  });
});

/* --------------------------------------------------------------------- CSV */

describe('CSV scope #53 decomposition columns', () => {
  test('measured classes export the verdict and incidences; refused classes export blanks; no titles', () => {
    const text = exportWorkspaceCsv(substitutionState(), 'survival', { now: NOW });
    const csv = typeof text === 'string' ? text : text.csv || text.text;
    assert.match(csv, /decomp_verdict/);
    assert.match(csv, /cif_complete_30_delta/);
    const lines = csv.trim().split('\n');
    const header = lines[0].split(',');
    const verdictAt = header.indexOf('decomp_verdict');
    const codeAt = header.indexOf('class_code');
    const hiring = lines.slice(1).map((line) => line.split(',')).find((row) => row[codeAt] === 'C03');
    assert.equal(hiring[verdictAt], 'substitution', 'hiring is the third class code');
    const work = lines.slice(1).map((line) => line.split(',')).find((row) => row[codeAt] === 'C01');
    assert.equal(work[verdictAt], '', 'an unmeasured class exports a blank, not a verdict');
    assert.ok(!csv.includes('Confidential'), 'no record title leaves in the export');
  });
});

/* -------------------------------------------------------------------- view */

describe('the classes panel', () => {
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

  test('the decomposition card renders the verdict, the table and the refusal language', () => {
    const window = renderDom(substitutionState(), '#/survival?panel=classes&class=hiring');
    const text = window.document.body.textContent;
    assert.match(text, /Exit-mix decomposition/);
    assert.match(text, /Abandonments replacing completions/);
    const table = [...window.document.querySelectorAll('table')]
      .find((row) => (row.getAttribute('aria-label') || '').includes('exit-mix decomposition'));
    assert.ok(table, 'the decomposition table is labelled');
    const headers = table.querySelectorAll('thead th').length;
    for (const row of table.querySelectorAll('tbody tr')) {
      assert.equal(row.querySelectorAll('td').length, headers, 'one cell per header');
    }
    const method = renderDom(substitutionState(), '#/survival?panel=method');
    assert.match(method.document.body.textContent, /Gray’s \(1988\)/);
    assert.match(method.document.body.textContent, /Landmark incidence comparison/);
  });
});
