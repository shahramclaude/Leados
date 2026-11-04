/**
 * tests/app/command-chain.test.mjs — Schema v82, ADR-0075 (the Command Chain).
 *
 * The claims this suite makes, in order:
 *  1. The migration is additive and invents nothing; a reading without a
 *     probability is refused rather than back-filled.
 *  2. The chain is read from person.managerId, and what cannot be repaired is
 *     reported: an orphan pointer, a leadership title with no span.
 *  3. Altitude comes from the recorded level, and a person with reports but no
 *     manager title is escalated to the frontline altitude with a printed reason.
 *  4. Responsibility is the manager of the people an item concerns, and the
 *     lowest common ancestor when it concerns people in two units.
 *  5. The escalation clock is each altitude's own time span: `requiredAltitude`
 *     is the higher of consequence and age, and the crossing date is printable.
 *  6. A rate below the evidence floor is withheld with its reason; a pooled rate
 *     is printed beside the mean of unit rates and flagged when they materially
 *     disagree.
 *  7. Survival and the escalation forecast refuse below the evidence floor, and
 *     the quoted probability is never above the independence value.
 *  8. The disclosure ladder names, leaders-only, or counts — asserted per altitude.
 *  9. A frozen reading is graded once, after its review date, and a reading with
 *     no probability is refused at grading rather than scored as 0%.
 * 10. RULE-CHN-01 escalates with a typed edge and never edits the item; the scan
 *     is marker-idempotent and pausable, and an explicit scan always runs.
 * 11. Signals fire for the states they name and stay silent otherwise.
 * 12. The entity type, relations and post-commit registration exist.
 * 13. CSV scope #72 exports aggregates only — no id, no title, no person.
 * 14. The view renders every panel over the demo and over a two-level fixture,
 *     and a multi-altitude roll-up is an exact sum of the spans below it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

import {
  MIGRATIONS,
  SCHEMA_VERSION,
  createEmptyState,
  migrate,
  normalizeState,
} from '../../app/core/schema.js';
import {
  ALTITUDES,
  CHAIN_LIMITS,
  LEVEL_ALTITUDE,
} from '../../app/core/domain/chainRegistry.js';
import {
  altitudeDrift,
  altitudeForAge,
  buildChain,
  buildChainReading,
  chainAttentionCount,
  chainBrief,
  chainReport,
  chainSignals,
  chainSkill,
  compositeRate,
  discloseItems,
  escalationTarget,
  gradeChainReading,
  harvestWork,
  lowestCommonAncestor,
  managerNodeId,
  responsibleNodeId,
} from '../../app/core/domain/chain.js';
import { chainRule, CHAIN_EVENTS, CHAIN_RULE_IDS } from '../../app/core/domain/chainRules.js';
import { normalizeChainReadings, normalizeChainSettings } from '../../app/core/domain/chainSchema.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS, LINK_RELATION_LABELS, resolveLinkedEntity } from '../../app/core/domain/cases.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildDemoState } from '../../app/core/demo.js';
import { renderChain } from '../../app/views/chain.js';

const NOW = new Date('2027-06-30T00:00:00.000Z');
const TODAY = '2027-06-30';
const ago = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * A two-level roster with the defects a real roster has: a lead with two
 * reports, a manager whose own manager is not on the roster, and — deliberately
 * — no rung above manager, so the top of the ladder is empty.
 */
function fixture() {
  const state = createEmptyState(NOW.toISOString());
  state.settings = {
    ...state.settings,
    chainLeaderAltitude: 'manager',
    oneOnOneCadenceDays: 7,
    leaderName: 'Alex Rivera',
  };
  state.people = [
    { id: 'p-priya', name: 'Priya Raman', role: 'Team lead', team: 'Ops', level: 'lead', managerId: null, status: 'active', createdAt: ago(400) },
    { id: 'p-jordan', name: 'Jordan Lee', role: 'Senior analyst', team: 'Ops', level: 'senior', managerId: 'p-priya', status: 'active', createdAt: ago(400) },
    { id: 'p-mei', name: 'Mei Chen', role: 'Analyst', team: 'Ops', level: 'ic', managerId: 'p-priya', status: 'active', createdAt: ago(400) },
    { id: 'p-samuel', name: 'Samuel Okafor', role: 'Programme manager', team: 'Programmes', level: 'manager', managerId: 'p-gone', status: 'active', createdAt: ago(400) },
  ];
  state.cases = [
    { id: 'case-a', title: 'Vendor outage on the billing path', status: 'open', ownerId: 'p-priya', involvedPersonIds: ['p-jordan'], openedOn: ago(40), fmea: { severity: 6 } },
    { id: 'case-b', title: 'Handover gap between two shifts', status: 'open', ownerId: 'p-jordan', involvedPersonIds: ['p-mei'], openedOn: ago(12), fmea: { severity: 5 } },
    { id: 'case-c', title: 'Closed last month', status: 'resolved', ownerId: 'p-jordan', involvedPersonIds: ['p-mei'], openedOn: ago(60), resolvedOn: ago(20), fmea: { severity: 4 } },
  ];
  state.delegations = [
    { id: 'dg-1', title: 'Rewrite the rolling rota', personId: 'p-jordan', delegatedOn: ago(30), dueOn: ago(10), status: 'done', completedOn: ago(12) },
    { id: 'dg-2', title: 'Clear the supplier backlog', personId: 'p-mei', delegatedOn: ago(25), dueOn: ago(5), status: 'done', completedOn: ago(1) },
    { id: 'dg-3', title: 'Own the Monday review pack', personId: 'p-jordan', delegatedOn: ago(10), dueOn: ago(2), status: 'active' },
    { id: 'dg-4', title: 'Fix the escalation template', personId: 'p-priya', delegatedOn: ago(8), dueOn: ago(1), status: 'active' },
    { id: 'dg-5', title: 'Cancelled hand-off', personId: 'p-mei', delegatedOn: ago(20), dueOn: ago(9), status: 'cancelled' },
  ];
  state.goals = [
    { id: 'goal-1', title: 'Cut handover rework to zero', ownerId: 'p-priya', status: 'active', createdAt: ago(50), dueDate: ago(5), confidence: 'off-track' },
  ];
  state.oneOnOnes = [
    { id: 'oo-1', personId: 'p-jordan', date: ago(25), status: 'held' },
    { id: 'oo-2', personId: 'p-mei', date: ago(3), status: 'held' },
    { id: 'oo-3', personId: 'p-priya', date: ago(2), status: 'held' },
  ];
  state.decisions = [
    { id: 'dec-1', title: 'Sign the three-year warehouse lease', date: ago(45), reviewOn: ago(10), chosen: '', reversibility: 'irreversible' },
  ];
  return state;
}

function ruleContext(event, settings = {}, now = NOW) {
  let counter = 0;
  return {
    event,
    now,
    settings,
    idFactory: (prefix) => `${prefix}-${(counter += 1)}`,
    logEvent: () => {},
    out: [],
  };
}

/* ------------------------------------------------------------------ */
/* 1. Schema                                                          */
/* ------------------------------------------------------------------ */

test('schema v82 is additive: two collections, no rewrite, and a probability-free reading is refused', () => {
  assert.equal(SCHEMA_VERSION, 92);
  assert.equal(typeof MIGRATIONS[81], 'function');

  const v81 = { ...createEmptyState(NOW.toISOString()), schemaVersion: 81 };
  delete v81.chainReadings;
  delete v81.chainMarkers;
  v81.people = [{ id: 'p1', name: 'Existing person', level: 'lead', status: 'active' }];
  const migrated = migrate(v81);
  assert.equal(migrated.applied.at(-1), '91 → 92');
  assert.deepEqual(migrated.raw.chainReadings, []);
  assert.deepEqual(migrated.raw.chainMarkers, []);
  assert.equal(migrated.raw.people.length, 1, 'no existing record is touched');

  const normalized = normalizeState(migrated.raw, { now: NOW });
  assert.equal(normalized.state.schemaVersion, 92);

  const warnings = [];
  const readings = normalizeChainReadings([
    { id: 'chn-1', nodeId: 'leader', frozenAt: NOW.toISOString(), reviewOn: '2027-07-30' },
    {
      id: 'chn-2',
      nodeId: 'leader',
      frozenAt: NOW.toISOString(),
      reviewOn: '2027-07-30',
      predictedAnyBreachPct: 42,
      members: [{ type: 'case', id: 'case-a', pBreachPct: 42, thresholdDays: 30, thresholdOn: '2027-07-30' }],
    },
  ], warnings);
  assert.equal(readings.length, 1, 'a reading with no probability cannot be scored, so it is dropped');
  assert.equal(readings[0].id, 'chn-2');
  assert.match(warnings.join(' '), /probability/i);
});

/* ------------------------------------------------------------------ */
/* 2. The tree                                                        */
/* ------------------------------------------------------------------ */

test('the chain is read from person.managerId and reports what it will not repair', () => {
  const state = fixture();
  const chain = buildChain(state, { now: NOW, settings: state.settings });
  assert.equal(chain.nodes.get('p-priya').parentId, 'leader', 'a person with no manager sits under the workspace leader');
  assert.equal(chain.nodes.get('p-jordan').parentId, 'p-priya');
  assert.equal(chain.nodes.get('p-jordan').depth, 2);
  assert.equal(chain.nodes.get('p-priya').span, 2);
  assert.equal(chain.nodes.get('p-priya').subtreeIds.length, 3, 'the subtree includes its own leader');
  assert.equal(chain.counts.people, 4);
  assert.equal(chain.counts.spanning, 2);

  const keys = chain.findings.map((finding) => finding.key);
  assert.ok(keys.includes('orphan'), 'a pointer at a missing person is reported');
  assert.ok(keys.includes('title-without-span'), 'a manager with no reports is reported');
  const orphan = chain.findings.find((finding) => finding.key === 'orphan');
  assert.equal(orphan.nodeId, 'p-samuel');
  assert.equal(chain.nodes.get('p-samuel').parentId, 'leader', 'an orphan is anchored for aggregation only');
  assert.match(orphan.detail, /anchored to the workspace leader/);
});

test('altitude is read from the recorded level, and reports escalate a titled lead rather than inventing a rung', () => {
  const state = fixture();
  state.people.push({ id: 'p-unmanaged-lead', name: 'Dana Ruiz', role: 'Coordinator', level: 'ic', managerId: null, status: 'active', createdAt: ago(50) });
  state.people.push({ id: 'p-dana-report', name: 'Sam Patel', role: 'Analyst', level: 'ic', managerId: 'p-unmanaged-lead', status: 'active', createdAt: ago(50) });
  const chain = buildChain(state, { now: NOW, settings: state.settings });

  assert.equal(chain.nodes.get('p-priya').altitude, 'frontline');
  assert.equal(chain.nodes.get('p-jordan').altitude, null, 'an IC with no reports has no altitude');
  assert.match(chain.nodes.get('p-priya').altitudeReason, /lead/);
  assert.equal(chain.nodes.get('p-samuel').altitude, 'manager');
  assert.match(chain.nodes.get('p-samuel').altitudeReason, /no direct reports/);

  const dana = chain.nodes.get('p-unmanaged-lead');
  assert.equal(dana.altitude, 'frontline', 'a person with reports is doing a lead’s work whatever the title says');
  assert.match(dana.altitudeReason, /report/i);
  assert.equal(LEVEL_ALTITUDE.lead, 'frontline');
  assert.equal(LEVEL_ALTITUDE.manager, 'manager');
});

/* ------------------------------------------------------------------ */
/* 3. Responsibility                                                  */
/* ------------------------------------------------------------------ */

test('responsibility is the manager of the people concerned, and their lowest common ancestor across units', () => {
  const state = fixture();
  // A second unit under the leader, so a genuine cross-unit item exists.
  state.people.push({ id: 'p-tomas', name: 'Tomas Beck', role: 'Support lead', team: 'Support', level: 'lead', managerId: null, status: 'active', createdAt: ago(400) });
  state.people.push({ id: 'p-ines', name: 'Ines Dahl', role: 'Agent', team: 'Support', level: 'ic', managerId: 'p-tomas', status: 'active', createdAt: ago(400) });
  state.cases.push({
    id: 'case-cross',
    title: 'Ops and Support disagree about the escalation path',
    status: 'open',
    ownerId: 'p-jordan',
    involvedPersonIds: ['p-ines'],
    openedOn: ago(6),
    fmea: { severity: 7 },
  });

  const chain = buildChain(state, { now: NOW, settings: state.settings });
  const items = harvestWork(state, chain, { now: NOW, settings: state.settings });
  const cross = items.find((item) => item.entityId === 'case-cross');
  assert.ok(cross, 'the cross-unit item is harvested');
  assert.equal(cross.ownerNodeId, 'leader', 'the LCA of two units is the workspace leader');
  assert.equal(managerNodeId(chain, 'p-jordan'), 'p-priya');
  assert.equal(responsibleNodeId(chain, ['p-jordan']), 'p-priya');
  assert.equal(lowestCommonAncestor(chain, ['p-jordan', 'p-mei']), 'p-priya');

  // An item that names the lead herself cannot be owned by her: she is inside
  // the span it concerns, so it belongs to the level above her.
  const ownCase = items.find((item) => item.entityId === 'case-a');
  assert.equal(ownCase.ownerNodeId, 'leader');
});

/* ------------------------------------------------------------------ */
/* 4. The clock                                                       */
/* ------------------------------------------------------------------ */

test('the escalation clock is each altitude’s own time span, not one universal SLA', () => {
  const state = fixture();
  const report = chainReport(state, NOW, state.settings);
  const cross = report.items.find((item) => item.entityId === 'case-b');
  assert.equal(cross.ownerNodeId, 'p-priya');
  assert.equal(cross.ownerAltitude, 'frontline');
  assert.equal(cross.ageDays, 12);
  assert.ok(cross.ageDays > 7, 'a frontline span is 7 days');
  assert.equal(cross.requiredAltitude, 'manager', '12 days belongs to the 30-day altitude');

  const young = report.items.find((item) => item.entityId === 'dg-4');
  assert.equal(young.ownerNodeId, 'leader');
  assert.equal(young.requiredAltitude, 'manager', 'the consequence floor is the owner’s own altitude');

  assert.equal(altitudeForAge(3).key, 'frontline');
  assert.equal(altitudeForAge(7).key, 'frontline');
  assert.equal(altitudeForAge(8).key, 'manager');
  assert.equal(altitudeForAge(45).key, 'director');
  assert.equal(altitudeForAge(400).key, 'chief');

  const target = escalationTarget(report.chain, 'p-priya', 2);
  assert.equal(target.nodeId, 'leader');
  const above = escalationTarget(report.chain, 'leader', 4);
  assert.equal(above.aboveTop, true, 'there is nobody above the workspace leader');
});

/* ------------------------------------------------------------------ */
/* 5. Rates                                                           */
/* ------------------------------------------------------------------ */

test('a rate below the evidence floor is withheld with its reason, and material disagreement is flagged', () => {
  const state = fixture();
  const report = chainReport(state, NOW, state.settings);
  const priya = report.dossiers.get('p-priya');
  const withheld = priya.metrics.filter((metric) => metric.rate === null);
  assert.equal(withheld.length, 3, 'every cell on this span is under the floor');
  for (const metric of withheld) {
    assert.ok(metric.refused && metric.refused.length > 10, `${metric.key} must state why it is withheld`);
    assert.match(metric.refused, /floor/);
  }
  assert.match(report.dossiers.get('p-priya').metrics[0].refused, /1 of 2/);
  assert.equal(report.totals.rateRefusals >= 3, true);

  // A span with 4/4 delegations (100%) and 0/8 goals (0%) pools to 33.3% while
  // the mean of the two rates is 50% — a 16.7 pp gap against a 5 pp bar. That
  // disagreement is Simpson's paradox, and the reading must say so.
  const mixed = createEmptyState(NOW.toISOString());
  mixed.settings = { ...mixed.settings, chainFloorN: 4 };
  mixed.people = [
    { id: 'm1', name: 'Morgan Ellis', level: 'manager', managerId: null, status: 'active', createdAt: ago(300) },
    { id: 'm2', name: 'Ari Klein', level: 'ic', managerId: 'm1', status: 'active', createdAt: ago(300) },
    { id: 'm3', name: 'Bo Nilsen', level: 'ic', managerId: 'm1', status: 'active', createdAt: ago(300) },
    { id: 'm4', name: 'Cy Orlov', level: 'ic', managerId: 'm1', status: 'active', createdAt: ago(300) },
    { id: 'm5', name: 'Dee Park', level: 'ic', managerId: 'm1', status: 'active', createdAt: ago(300) },
  ];
  mixed.delegations = [1, 2, 3, 4].map((n) => ({
    id: `md-${n}`, title: `Closed hand-off ${n}`, personId: 'm2', delegatedOn: ago(40), dueOn: ago(20), status: 'done', completedOn: ago(25),
  }));
  mixed.goals = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    id: `mg-${n}`, title: `Dated goal ${n}`, ownerId: 'm2', status: 'active', createdAt: ago(30), dueDate: ago(-10), confidence: 'at-risk',
  }));
  mixed.oneOnOnes = ['m2', 'm3', 'm4', 'm5'].map((pid, index) => ({ id: `mo-${index}`, personId: pid, date: ago(2), status: 'held' }));
  const mixedReport = chainReport(mixed, NOW, mixed.settings);
  const span = mixedReport.spans.find((row) => row.nodeId === 'm1');
  // (4 delegations + 4 cadence + 0 goals) / (4 + 5 + 8) = 47.1% pooled, against
  // a mean of the three unit rates of 60%. The gap is signed: pooled sits 12.9 pp
  // BELOW the mean, because the biggest denominator (8 goals) did worst. The bar
  // test uses the magnitude, so the direction is information rather than a defect.
  assert.equal(span.composite.pooled, 47.1);
  assert.equal(span.composite.meanOfRates, 60);
  assert.equal(span.composite.gapPp, -12.9);
  assert.equal(span.composite.compositionSensitive, true);

  // A higher materiality bar turns the same data into a non-event: the bar is a
  // declaration, and the reading follows the declaration rather than the data.
  const relaxed = chainReport(mixed, NOW, { ...mixed.settings, chainMaterialityPp: 20 });
  assert.equal(relaxed.spans.find((row) => row.nodeId === 'm1').composite.compositionSensitive, false);
});

/* ------------------------------------------------------------------ */
/* 6. Survival & forecast                                             */
/* ------------------------------------------------------------------ */

test('survival and the escalation forecast refuse below the floor, and never quote above independence', () => {
  const state = fixture();
  const report = chainReport(state, NOW, state.settings);
  assert.ok(report.survival.refused, 'three closed items is not a survival curve');
  assert.match(report.survival.refused, /floor/);
  assert.equal(report.survival.n, 3);
  assert.equal(report.survival.quantiles.length, 4);
  const days = report.survival.quantiles.map((row) => row.days);
  assert.deepEqual(days.slice().sort((a, b) => a - b), days, 'quantiles are ordered');
  assert.ok(report.survival.refused);
  assert.equal(report.leader.forecast.predictedAnyBreachPct, null);
  assert.match(report.leader.forecast.refused, /no survival curve/);

  // With enough closed items the forecast quotes, and the assumption-free bound
  // is never above the independence value.
  const rich = createEmptyState(NOW.toISOString());
  rich.settings = { ...rich.settings, chainLeaderAltitude: 'frontline', oneOnOneCadenceDays: 7 };
  rich.people = [
    { id: 'r1', name: 'Rae Iversen', level: 'ic', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'r2', name: 'Nils Berg', level: 'ic', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'r3', name: 'Una Sørensen', level: 'ic', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'r4', name: 'Vik Hansen', level: 'ic', managerId: null, status: 'active', createdAt: ago(500) },
    { id: 'r5', name: 'Wen Lund', level: 'ic', managerId: null, status: 'active', createdAt: ago(500) },
  ];
  rich.cases = [];
  for (let n = 0; n < 12; n += 1) {
    rich.cases.push({
      id: `rc-done-${n}`,
      title: `Closed case ${n}`,
      status: 'resolved',
      ownerId: 'r1',
      involvedPersonIds: ['r2'],
      openedOn: ago(120 - n * 5),
      resolvedOn: ago(120 - n * 5 - (5 + n)),
      fmea: { severity: 3 },
    });
  }
  rich.cases.push({
    id: 'rc-open',
    title: 'Still open, and old',
    status: 'open',
    ownerId: 'r1',
    involvedPersonIds: ['r3'],
    openedOn: ago(3),
    fmea: { severity: 5 },
  });
  const richReport = chainReport(rich, NOW, rich.settings);
  assert.equal(richReport.survival.refused, null);
  assert.ok(richReport.survival.n >= 8);
  const forecast = richReport.leader.forecast;
  assert.ok(forecast.quotedN > 0);
  assert.ok(Number.isFinite(forecast.predictedAnyBreachPct));
  assert.ok(forecast.predictedAnyBreachPct <= forecast.predictedAnyBreachIndependencePct + 1e-9,
    'the Fréchet floor cannot exceed the independence value');
  assert.ok(forecast.predictedAnyBreachPct >= 0 && forecast.predictedAnyBreachPct <= 100);
});

/* ------------------------------------------------------------------ */
/* 7. Disclosure                                                      */
/* ------------------------------------------------------------------ */

test('the disclosure ladder names people at the frontline, only leaders above it, and counts at the top', () => {
  const state = fixture();
  const report = chainReport(state, NOW, state.settings);
  const items = report.items;

  const frontline = discloseItems(items, 'frontline', report.chain, { cap: 50 });
  assert.equal(frontline.mode, 'visible');
  assert.equal(frontline.detail, true);
  assert.ok(frontline.rows.every((row) => row.hiddenDetail === false));
  assert.ok(frontline.rows.some((row) => /Priya|Jordan|Mei|Samuel/.test(row.who)), 'names are shown');

  const director = discloseItems(items, 'director', report.chain, { cap: 50 });
  assert.equal(director.mode, 'leaders');
  assert.equal(director.detail, false);
  assert.ok(director.rows.every((row) => row.title === row.unit), 'no record title is disclosed');
  assert.ok(director.rows.every((row) => row.route === null), 'no route that would reveal the record');
  assert.ok(director.rows.every((row) => !/Jordan Lee|Mei Chen/.test(row.who)), 'individuals inside a unit are not named');

  const chief = discloseItems(items, 'chief', report.chain, { cap: 50 });
  assert.equal(chief.mode, 'none');
  assert.ok(chief.rows.every((row) => /person\(s\)/.test(row.who)), 'the top of the ladder sees counts');

  const capped = discloseItems(items, 'frontline', report.chain, { cap: 2 });
  assert.equal(capped.shownN, 2);
  assert.equal(capped.hiddenN, Math.max(0, items.length - 2));
});

/* ------------------------------------------------------------------ */
/* 8. Freezing and grading                                            */
/* ------------------------------------------------------------------ */

test('a frozen reading is graded once, later, and a probability-free reading is refused rather than scored', () => {
  const state = fixture();
  const report = chainReport(state, NOW, state.settings);
  const built = buildChainReading(report, 'p-priya', { now: NOW, reviewDays: 30, id: 'chn-priya' });
  assert.equal(built.ok, true);
  const record = built.record;
  assert.equal(record.counts.openN, 3);
  assert.equal(record.reviewOn, '2027-07-30');
  assert.equal(record.graded, null);
  assert.equal(record.rates.length, 3);
  assert.ok(record.rates.every((rate) => rate.rate === null ? Boolean(rate.refused) : true), 'a withheld rate carries its reason');

  // This workspace has no survival curve, so the reading froze with a stated
  // refusal and no members. It must not be graded as a 0% claim, and it must
  // not lapse with a story about deleted members that never existed.
  assert.equal(record.predictedAnyBreachPct, null);
  assert.ok(record.quoteRefused);
  const refused = gradeChainReading(record, state, { now: new Date('2027-09-01T00:00:00Z') });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /quoted no probability/);
  assert.match(refused.error, /no survival curve/);

  // A reading with a real probability grades once and then refuses to be rewritten.
  const gradable = {
    ...clone(record),
    id: 'chn-gradable',
    predictedAnyBreachPct: 40,
    predictedBreachN: 1,
    quoteRefused: null,
    members: [
      { type: 'case', id: 'case-b', pBreachPct: 40, thresholdDays: 30, thresholdOn: '2027-07-22' },
      { type: 'delegation', id: 'dg-3', pBreachPct: 30, thresholdDays: 30, thresholdOn: '2027-07-10' },
    ],
  };
  const early = gradeChainReading(gradable, state, { now: NOW });
  assert.equal(early.ok, false);
  assert.match(early.error, /cannot be graded before 2027-07-30/);

  const graded = gradeChainReading(gradable, state, { now: new Date('2027-09-01T00:00:00Z') });
  assert.equal(graded.ok, true);
  assert.equal(graded.grade.lapsed, false);
  // case-b is still open, dg-3 is still active: both crossed their threshold.
  assert.equal(graded.grade.observedBreachN, 2);
  assert.equal(graded.grade.brier, 0.36, '(0.40 − 1)² = 0.36');
  assert.equal(graded.grade.countError, 1);

  gradable.graded = graded.grade;
  const again = gradeChainReading(gradable, state, { now: new Date('2027-10-01T00:00:00Z') });
  assert.equal(again.ok, false);
  assert.match(again.error, /already been graded/);

  // Skill is withheld below five graded readings.
  assert.equal(chainSkill([gradable]).skill, null);
  assert.match(chainSkill([gradable]).refused, /floor/);
});

/* ------------------------------------------------------------------ */
/* 9. Rules                                                           */
/* ------------------------------------------------------------------ */

test('RULE-CHN-01 escalates with a typed edge, never edits the item, and is idempotent per scan', () => {
  const state = fixture();
  const draft = clone(state);
  const ctx = ruleContext({ type: CHAIN_EVENTS.SCAN });
  const effects = chainRule(draft, ctx);
  assert.ok(effects.length > 0, 'the scan produces effects');

  const escalations = effects.filter((effect) => effect.ruleId === CHAIN_RULE_IDS.ESCALATE);
  const escalatedTasks = escalations.filter((effect) => effect.action === 'created');
  assert.ok(escalatedTasks.length > 0, 'escalation debt opens tasks');
  assert.ok(escalatedTasks.length <= CHAIN_LIMITS.maxTasksDefault, 'the per-scan cap is respected');

  const created = draft.delegations.filter((row) => !state.delegations.some((before) => before.id === row.id));
  assert.ok(created.length > 0, 'a task was actually written');
  for (const task of created) {
    assert.match(task.support, /\[RULE-CHN-0\d/, 'every task carries the rule that opened it');
    assert.equal(task.authority, 'act-inform');
  }

  // The escalated item itself is untouched: same status, same dates.
  assert.deepEqual(draft.cases.find((row) => row.id === 'case-b'), state.cases.find((row) => row.id === 'case-b'));

  const edges = draft.links.filter((link) => link.relation === 'escalates-to' || link.relation === 'rolls-up-to');
  assert.ok(edges.length > 0, 'typed edges are written');
  assert.ok(edges.every((edge) => edge.sourceId && edge.targetId));

  // Idempotency is per item, not per scan: the cap defers the backlog, so a
  // repeat scan advances it by at most another cap's worth and never re-opens an
  // item that already has its task. Scans are repeated until the backlog drains,
  // then one more scan must create nothing at all.
  let previous = draft.delegations.length;
  let scans = 0;
  while (scans < 8) {
    chainRule(draft, ruleContext({ type: CHAIN_EVENTS.SCAN }));
    scans += 1;
    if (draft.delegations.length === previous) break;
    previous = draft.delegations.length;
  }
  const drained = draft.delegations.length;
  const afterDrain = chainRule(draft, ruleContext({ type: CHAIN_EVENTS.SCAN }));
  assert.equal(draft.delegations.length, drained, 'once every item is escalated, a repeat scan creates nothing');
  assert.equal(afterDrain.filter((effect) => effect.action === 'created').length, 0);

  const escalationTags = draft.chainMarkers.filter((marker) => marker.startsWith(`${CHAIN_RULE_IDS.ESCALATE}:item:`));
  assert.equal(new Set(escalationTags).size, escalationTags.length, 'no item is ever escalated twice');
  assert.ok(escalationTags.length > 0);

  // Automatic propagation is pausable; an explicit scan always runs.
  const paused = clone(state);
  const frozenOff = chainRule(paused, ruleContext({ type: CHAIN_EVENTS.FROZEN }, { chainAutoPropagate: false }));
  assert.deepEqual(frozenOff, []);
  chainRule(paused, ruleContext({ type: CHAIN_EVENTS.SCAN }, { chainAutoPropagate: false }));
  assert.ok(paused.delegations.length > state.delegations.length, 'the human’s scan is never silenced');
});

test('signals fire on the states they name and stay silent on a chain with nothing wrong', () => {
  const state = fixture();
  const signals = chainSignals(state, NOW, state.settings);
  const ids = signals.map((signal) => signal.ruleId);
  assert.ok(ids.includes('CHN-01'), 'escalation debt is reported');
  assert.ok(ids.includes('CHN-02'), 'items demanding a missing altitude are reported');
  assert.ok(ids.includes('CHN-07'), 'the orphan reporting line is reported');
  for (const signal of signals) {
    assert.ok(signal.action && signal.action.route.startsWith('#/'), 'every signal has a place to go');
    assert.ok(signal.evidence.length > 0, 'every signal carries its evidence');
    assert.ok(['low', 'medium', 'high'].includes(signal.confidence));
  }

  // A virgin workspace is SETUP-01's business, and this module will not say the
  // same sentence twice: it stays silent until there is work with no chain to
  // own it, which is the defect CHN-08 actually names.
  const empty = createEmptyState(NOW.toISOString());
  assert.deepEqual(chainSignals(empty, NOW, empty.settings), []);
  const noRoster = createEmptyState(NOW.toISOString());
  noRoster.decisions = [{ id: 'dec-solo', title: 'A call with nobody attached', date: ago(10), chosen: '', reversibility: 'reversible' }];
  const orphanSignals = chainSignals(noRoster, NOW, noRoster.settings);
  assert.ok(
    orphanSignals.some((signal) => signal.ruleId === 'CHN-08'),
    'work with no chain to own it is reported',
  );
  for (const signal of orphanSignals) assert.match(signal.action.route, /^#\//);

  const report = chainReport(state, NOW, state.settings);
  assert.ok(chainAttentionCount(state, NOW, state.settings) > 0);
  const brief = chainBrief(report);
  assert.match(brief, /Chain: 4 person/);
  assert.match(brief, /5 altitudes|of 5 altitudes/);
  assert.ok(!/Priya|Jordan|Mei|Samuel/.test(brief), 'the brief that goes upward names nobody');
});

/* ------------------------------------------------------------------ */
/* 10. Registration                                                   */
/* ------------------------------------------------------------------ */

test('the entity type, its relations and the post-commit registration exist', () => {
  assert.ok(LINK_ENTITY_TYPES.includes('chainreading'));
  assert.ok(LINK_RELATIONS.includes('escalates-to'));
  assert.ok(LINK_RELATIONS.includes('rolls-up-to'));
  assert.match(LINK_RELATION_LABELS['escalates-to'], /altitude/);
  assert.match(LINK_RELATION_LABELS['rolls-up-to'], /up/i);
  assert.equal(typeof resolveLinkedEntity, 'function');
  assert.ok(DEFAULT_POST_COMMIT_RULES.some((rule) => rule.id === 'chain' || /chain/i.test(String(rule.id))),
    'the chain rule is registered in the post-commit chain');
  assert.ok(CSV_EXPORTS.some((scope) => scope.key === 'command-chain'));
});

/* ------------------------------------------------------------------ */
/* 11. CSV                                                            */
/* ------------------------------------------------------------------ */

test('CSV scope #72 exports aggregates only — no id, no title, no person', () => {
  const state = fixture();
  const result = exportWorkspaceCsv(state, 'command-chain', { now: NOW });
  assert.equal(result.ok, true);
  const csv = result.csv;
  assert.match(csv, /^row_kind,node_kind,altitude/);
  assert.ok(!/Vendor outage|Handover gap|Priya Raman|Jordan Lee|Sign the three-year/.test(csv), 'no title and no name may be exported');
  assert.ok(!/case-b|dg-3|p-priya/.test(csv), 'no record or person id may be exported');
  const rows = csv.trim().split('\n');
  assert.equal(rows.length, 1 + 2, 'one header, one row per span (the leader and one lead)');
  assert.ok(rows.slice(1).every((row) => row.startsWith('span,')));
});

/* ------------------------------------------------------------------ */
/* 12. The view and the roll-up                                       */
/* ------------------------------------------------------------------ */

function bootDocument() {
  const consoleErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>', {
    url: 'https://leados.test/',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Element = window.Element;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.FileReader = window.FileReader;
  globalThis.localStorage = window.localStorage;
  return { window, document: window.document, consoleErrors };
}

function renderPanel(state, panel) {
  const query = new URLSearchParams({ panel });
  const ctx = {
    state,
    now: NOW,
    query,
    navigate: () => {},
    refresh: () => {},
    api: {},
  };
  const node = renderChain(ctx);
  return { node, text: node.textContent };
}

test('every chain panel renders, names the empty rungs and refuses rather than inventing numbers', () => {
  const env = bootDocument();
  const state = fixture();
  for (const panel of ['map', 'altitudes', 'escalation', 'drift', 'frozen', 'about']) {
    const { node, text } = renderPanel(state, panel);
    assert.ok(node.querySelector('h1'), `${panel} renders a page heading`);
    assert.ok(text.length > 200, `${panel} has content`);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(text), `${panel} leaked a placeholder: ${text.slice(0, 300)}`);
  }

  // The default panel is the chain map, and an unknown panel falls back to it.
  assert.ok(renderPanel(state, 'not-a-panel').text.includes('Spans in the chain'));
  assert.ok(renderPanel(state, 'spans').text.includes('Spans in the chain'), 'old signal routes still resolve');

  const altitudes = renderPanel(state, 'altitudes').text;
  assert.match(altitudes, /The roll-up, altitude by altitude/);
  assert.match(altitudes, /of the 5 altitudes have nobody in them/);
  assert.match(altitudes, /will not invent an incumbent/);
  assert.match(altitudes, /Director/);
  assert.match(altitudes, /C-suite/);

  const escalation = renderPanel(state, 'escalation').text;
  assert.match(escalation, /escalation queue|Escalation queue/i);
  assert.match(escalation, /Crossed on|above the top/);

  const drift = renderPanel(state, 'drift').text;
  assert.match(drift, /Work sitting below this altitude/);
  assert.match(drift, /Work sitting above this altitude/);
  assert.match(drift, /Only leaders of units are named|the work at this altitude is the person|No person is named/);

  const frozen = renderPanel(state, 'frozen').text;
  assert.match(frozen, /No reading has been frozen/);
  assert.match(frozen, /withheld|withheld below a floor|skill/i);

  const about = renderPanel(state, 'about').text;
  assert.match(about, /Jaques/);
  assert.match(about, /Simpson/);
  assert.match(about, /Kaplan/);
  assert.match(about, /does not assert access control|rendering contract/);
  assert.equal(env.consoleErrors.length, 0, env.consoleErrors.join('\n'));
});

test('an empty workspace renders every panel without an empty-screen error', () => {
  bootDocument();
  const empty = createEmptyState(NOW.toISOString());
  for (const panel of ['map', 'altitudes', 'escalation', 'drift', 'frozen', 'about']) {
    const { text } = renderPanel(empty, panel);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(text), `${panel} leaked a placeholder on an empty workspace: ${text.slice(0, 300)}`);
  }
  assert.match(renderPanel(empty, 'map').text, /There is no chain to read yet/);
  assert.match(renderPanel(empty, 'frozen').text, /No reading has been frozen/);
});

test('the demo workspace renders the chain, and the roll-up is an exact sum of the spans below it', () => {
  bootDocument();
  const demo = buildDemoState(NOW);
  const report = chainReport(demo, NOW, demo.settings);

  // Altitudes are only claimed where the roster actually has them.
  assert.ok(report.totals.altitudesPresent <= 3, 'a two-level demo cannot claim five altitudes');
  assert.ok(!report.chain.representedAltitudes.includes('chief'));

  // Multi-altitude roll-up: every altitude's open count is the exact sum of the
  // dossiers at that altitude, and the altitude totals sum to the whole cascade.
  let ownSum = 0;
  for (const rung of report.ladder) {
    const spans = report.spans.filter((span) => span.rank === rung.rank);
    assert.equal(
      rung.ownOpenN,
      spans.reduce((total, span) => total + span.dossier.ownOpenN, 0),
      `${rung.key} own count is the exact sum of the spans at that altitude`,
    );
    assert.equal(
      rung.rollupOpenN,
      spans.reduce((total, span) => total + span.dossier.openN, 0),
      `${rung.key} roll-up is the exact sum of the spans' own-and-below counts`,
    );
    assert.ok(rung.rollupOpenN >= rung.ownOpenN, `${rung.key} cannot roll up less than it holds`);
    ownSum += rung.ownOpenN;
  }
  assert.equal(ownSum, report.items.length, 'every open item is owned at exactly one altitude');

  // The top of the chain sees the whole cascade exactly once: its subtree is
  // every person in the roster, so its rolled-up count is the item count itself.
  const leaderSpan = report.spans.find((span) => span.nodeId === 'leader');
  assert.equal(leaderSpan.dossier.openN, report.items.length, 'no item is counted twice or lost on the way up');
  // And a lower altitude's work is a strict subset of the cascade above it.
  const below = report.spans.filter((span) => span.nodeId !== 'leader');
  for (const span of below) {
    assert.ok(leaderSpan.dossier.openN >= span.dossier.openN);
    assert.ok(leaderSpan.dossier.peopleN >= span.dossier.peopleN);
  }

  for (const panel of ['map', 'altitudes', 'escalation', 'drift', 'frozen', 'about']) {
    const { text } = renderPanel(demo, panel);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(text), `${panel} leaked a placeholder on the demo: ${text.slice(0, 400)}`);
  }
  const demoMap = renderPanel(demo, 'map').text;
  assert.match(demoMap, /Spans in the chain/);
});

test('the view module is wired into the app’s router and navigation', () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, '../../app/main.js'), 'utf8');
  assert.match(main, /import \{ renderChain \} from '\.\/views\/chain\.js';/);
  assert.match(main, /chain: \(ctx\) => renderChain\(ctx\)/);
  assert.match(main, /route: 'chain'/);
  assert.match(main, /chainAttentionCount/);
});
