/**
 * tests/app/undertaking-wiring.test.mjs — the focused integration suite for
 * ADR-0234 (Regulatory Undertaking & Outward-Commitment Closure Register,
 * `RULE-UDT-01`, Schema v189, CSV #177, `#/undertakings`).
 *
 * The panel is deliberately matrixed: the promise to the regulator lands on
 * THREE obligation lines held by three people under TWO different managers, so
 * the whole promise has no single owner — the joint apex above both managers
 * answers, and a report to the counterparty can only land when every line has
 * been independently tested from above its own holder.
 *
 * The suite drives the real guarded API, store and post-commit spine, then
 * reads the SAME stored bytes back through the kernel, the seat-scoped
 * attention count, the CSV and the DOM. No test writes a derived state: every
 * expected state comes from the acts that were declared.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, createEmptyState, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';

let JSDOM = null;
try { JSDOM = (await import('jsdom')).JSDOM; } catch { /* skipped where jsdom is absent */ }
import { createStore, STORAGE_KEY } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { PROPAGATION_CONTRACTS } from '../../app/core/domain/propagationContracts.js';
import { CSV_EXPORTS, exportWorkspaceCsv } from '../../app/core/csv.js';
import { buildUndertakings } from '../../app/core/domain/undertakingClosure.js';
import { undertakingRule, undertakingConditions } from '../../app/core/domain/undertakingRules.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import {
  UDT_CSV_SCOPE, UDT_HREF, UDT_RIGHTS, UDT_RULE_ID, UDT_PAUSE_SWITCH,
} from '../../app/core/domain/undertakingRegistry.js';
import { renderUndertakings } from '../../app/views/undertakings.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const iso = '2026-01-01T09:00:00.000Z';

const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
const line = (id, personId, managerId, kind = 'functional') => ({ id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '', status: 'active', history: [] });

function seed() {
  let currentNow = at('2026-02-01');
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  /**
   * The house seat model gives no operating seat to a person with no span, so
   * the obligation lines are held by MANAGERS — which is also what a licence
   * condition actually lands on: the operations, legal and finance managers,
   * two of them under marta, one under priya, each with a line of their own.
   *
   *        ceo
   *         ├── marta ── yusuf(manager) ── t1
   *         │        └── (marta holds ln-ops)
   *         └── priya  ── (priya holds ln-legal) ── t2
   */
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('marta', 'Marta Home', 'manager', 'ceo'),
    person('priya', 'Priya Project', 'manager', 'ceo'),
    person('yusuf', 'Yusuf Finance', 'manager', 'marta'),
    person('t1', 'Tam Report', 'ic', 'yusuf'),
    person('t2', 'Tao Report', 'ic', 'priya'),
    person('t3', 'Tova Report', 'ic', 'marta'),
  ];
  raw.reportingLines = [
    line('rl-marta-ceo', 'marta', 'ceo'),
    line('rl-priya-ceo', 'priya', 'ceo'),
    line('rl-yusuf-marta', 'yusuf', 'marta'),
    line('rl-t1-yusuf', 't1', 'yusuf'),
    line('rl-t2-priya', 't2', 'priya'),
    line('rl-t3-marta', 't3', 'marta'),
  ];
  const normalized = normalizeState(raw, { now: currentNow }).state;
  const values = new Map([[STORAGE_KEY, JSON.stringify(normalized)]]);
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
  const store = createStore({ storage, now: clock, idFactory });
  store.load();
  const api = createApi(store, { now: clock, idFactory });
  return {
    store,
    api,
    now: () => currentNow,
    setDay(day) { currentNow = at(day); },
    sit(seatId) {
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), activeSeatId: seatId }; }, { type: 'seat.declared', entity: 'settings', entityId: seatId, summary: 'seat switch' });
    },
    snapshot() { return JSON.parse(values.get(STORAGE_KEY)); },
  };
}

const DECLARE = {
  counterparty: 'Financial Supervision Authority',
  counterpartyKind: 'regulator',
  instrument: 'regulatory-undertaking',
  instrumentRef: 'UND-2026-07 §4',
  scope: 'Retail payments processing and the night-shift rota that supports it, including the reconciliation controls.',
  dueOn: '2026-04-30',
  lines: [
    { lineId: 'ln-ops', holderId: 'marta', roleLabel: 'operations', deliverable: 'The night shift rota rebuilt with the agreed rest intervals and published to the floor.', dueOn: '2026-03-15' },
    { lineId: 'ln-legal', holderId: 'priya', roleLabel: 'legal', deliverable: 'The regulator reporting pack updated to the new evidence standard and signed off.', dueOn: '2026-03-20' },
    { lineId: 'ln-fin', holderId: 'yusuf', roleLabel: 'finance', deliverable: 'The remediation spend reconciled against the undertaking and the ledger closed.', dueOn: '2026-03-30' },
  ],
};

const deliver = (lineId, evidenceText) => ({ lineId, evidenceText, referenceRef: 'DRIVE-2026-REF' });
const verify = (lineId, verdict, methodText) => ({ lineId, verdict, methodText });

/** Drives one undertaking from declaration to `reported-met` across two managers. */
function lifecycle(env) {
  env.sit('ceo');
  const declared = env.api.undertakingDeclare(DECLARE);
  assert.equal(declared.ok, true, `declare: ${declared.error}`);
  const undertakingId = declared.undertakingId;

  for (const [id, seat] of [['ln-ops', 'marta'], ['ln-legal', 'priya'], ['ln-fin', 'yusuf']]) {
    env.sit(seat);
    const d = env.api.undertakingDeliver({ undertakingId, ...deliver(id, 'The artefact exists and can be inspected at the reference named on this act today.') });
    assert.equal(d.ok, true, `deliver ${id}: ${d.error}`);
  }
  // Each line is tested from strictly above its own holder: the ceo is above all
  // three holders, marta is above yusuf.
  for (const [id, seat] of [['ln-ops', 'ceo'], ['ln-legal', 'ceo'], ['ln-fin', 'marta']]) {
    env.sit(seat);
    const v = env.api.undertakingVerify({ undertakingId, ...verify(id, 'confirm', 'I inspected the artefact myself and read the evidence against the declared deliverable.') });
    assert.equal(v.ok, true, `verify ${id} from ${seat}: ${v.error}`);
  }
  env.sit('ceo');
  const reported = env.api.undertakingReportClosure({
    undertakingId,
    reportRef: 'FSA-FILING-2026-0412',
    reportText: 'The regulator was told in writing that every obligation line is delivered and independently tested.',
  });
  assert.equal(reported.ok, true, `report: ${reported.error}`);
  return { undertakingId };
}

test('schema v189 carries the three ADR-0234 collections as empty arrays', () => {
  assert.equal(SCHEMA_VERSION, 191);
  const state = normalizeState(createEmptyState(at('2026-02-01').toISOString()), { now: at('2026-02-01') }).state;
  for (const key of ['undertakings', 'undertakingActs', 'undertakingMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is not a declared collection`);
    assert.deepEqual(state[key], [], `${key} should seed as an empty array`);
  }
});

test('RULE-UDT-01 sits on the post-commit spine, in the propagation contracts, and the pause is named', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => (typeof rule === 'string' ? rule : rule.id));
  assert.ok(ids.includes('undertakingRule'), 'the ADR-0234 automation rule is not registered on the shared spine');
  const joined = JSON.stringify(PROPAGATION_CONTRACTS);
  assert.ok(joined.includes(UDT_RULE_ID), `${UDT_RULE_ID} is missing from the propagation contracts`);
  assert.ok(joined.includes(UDT_PAUSE_SWITCH), 'the pause switch is not named in the contract');
  assert.equal(UDT_HREF, '#/undertakings');
});

test('the register refuses to report a promise while any line is untested — the core duty', () => {
  const env = seed();
  env.sit('ceo');
  const declared = env.api.undertakingDeclare(DECLARE);
  assert.equal(declared.ok, true, declared.error);
  const undertakingId = declared.undertakingId;

  // Every line delivered, but only two tested.
  for (const [id, seat] of [['ln-ops', 'marta'], ['ln-legal', 'priya'], ['ln-fin', 'yusuf']]) {
    env.sit(seat);
    assert.equal(env.api.undertakingDeliver({ undertakingId, ...deliver(id, 'The artefact exists and can be inspected at the reference named on this act.') }).ok, true);
  }
  env.sit('ceo');
  assert.equal(env.api.undertakingVerify({ undertakingId, ...verify('ln-ops', 'confirm', 'I inspected the artefact myself against the declared deliverable.') }).ok, true);

  env.sit('ceo');
  const early = env.api.undertakingReportClosure({ undertakingId, reportRef: 'FSA-1', reportText: 'Telling them early that the promise is met.' });
  assert.equal(early.ok, false, 'a report with two untested lines is refused');
  assert.match(String(early.error), /EVERY line|not confirmed|independently/i, `the refusal names the duty: ${early.error}`);
  assert.equal(env.api.undertakingReport().rows.find((r) => r.id === undertakingId).state, 'delivered-untested');
});

test('the person who delivered cannot grade their own work, and an unrelated branch cannot either', () => {
  const env = seed();
  env.sit('ceo');
  const { undertakingId } = { undertakingId: env.api.undertakingDeclare(DECLARE).undertakingId };
  // ln-fin is held by yusuf, who reports to marta and has t1 below him.
  env.sit('yusuf');
  assert.equal(env.api.undertakingDeliver({ undertakingId, ...deliver('ln-fin', 'The artefact exists and can be inspected at the reference named on this act.') }).ok, true);

  // The holder cannot verify their own line.
  const selfTest = env.api.undertakingVerify({ undertakingId, ...verify('ln-fin', 'confirm', 'I looked at my own work and I am satisfied with it.') });
  assert.equal(selfTest.ok, false, 'the deliverer never grades their own delivery');
  assert.match(String(selfTest.error), /strictly above|independent/i);

  // A subordinate of the holder cannot verify either.
  env.sit('t1');
  const below = env.api.undertakingVerify({ undertakingId, ...verify('ln-fin', 'confirm', 'I sit below the holder and I am testing their work today.') });
  assert.equal(below.ok, false, 'a subordinate is not above the holder');

  // A seat on an unrelated branch cannot verify.
  env.sit('priya');
  const unrelated = env.api.undertakingVerify({ undertakingId, ...verify('ln-fin', 'confirm', 'I am on an unrelated branch and I am testing this anyway.') });
  assert.equal(unrelated.ok, false, 'an unrelated branch is not independence');

  // The holder's own manager can.
  env.sit('marta');
  assert.equal(env.api.undertakingVerify({ undertakingId, ...verify('ln-fin', 'confirm', 'I inspected the artefact myself against the declared deliverable.') }).ok, true);
});

test('an external instrument may not be extended without the counterparty’s recorded agreement', () => {
  const env = seed();
  env.sit('ceo');
  const { undertakingId } = { undertakingId: env.api.undertakingDeclare(DECLARE).undertakingId };
  const unilateral = env.api.undertakingExtend({
    undertakingId, newDueOn: '2026-06-30', reason: 'The vendor slipped and we have not yet asked the regulator for more time.',
  });
  assert.equal(unilateral.ok, false, 'a unilateral postponement of a promise to a supervisor is refused');
  assert.match(String(unilateral.error), /not the entity’s alone to move|agreement/i);

  const agreed = env.api.undertakingExtend({
    undertakingId, newDueOn: '2026-06-30', counterpartyAgreementRef: 'FSA-VARIATION-2026-004',
    reason: 'The regulator agreed a variation in writing after the vendor slipped the work.',
  });
  assert.equal(agreed.ok, true, `a documented variation lands: ${agreed.error}`);
  assert.equal(env.api.undertakingReport().rows.find((r) => r.id === undertakingId).effectiveDueOn, '2026-06-30');
});

test('an extension is refused after the due day — a lapsed promise is not un-lapsed by moving the date', () => {
  const env = seed();
  env.sit('ceo');
  const { undertakingId } = { undertakingId: env.api.undertakingDeclare({ ...DECLARE, dueOn: '2026-02-10' }).undertakingId };
  env.setDay('2026-03-01');
  const late = env.api.undertakingExtend({
    undertakingId, newDueOn: '2026-05-01', counterpartyAgreementRef: 'FSA-LATE-1',
    reason: 'We would like to move a date that has already passed and nobody has been told.',
  });
  assert.equal(late.ok, false);
  assert.match(String(late.error), /passed|un-lapsed/i);
  const row = env.api.undertakingReport().rows.find((r) => r.id === undertakingId);
  assert.equal(row.state, 'lapsed-unreported', 'the register prints the lapse');
  assert.equal(row.reported, false, 'and nothing was invented');
});

test('a report is refused from anybody but the declaring executive', () => {
  const env = seed();
  const { undertakingId } = lifecycle(env);
  env.sit('marta');
  const wrong = env.api.undertakingReportClosure({ undertakingId, reportRef: 'X-1', reportText: 'I will report this one on behalf of the executive.' });
  assert.equal(wrong.ok, false, 'the signature belongs to the seat that gave the promise');
});

test('stored bytes recompute to exactly what the panel reports', () => {
  const env = seed();
  const { undertakingId } = lifecycle(env);
  env.sit('ceo');
  const report = env.api.undertakingReport();
  const stored = env.snapshot();
  const kernel = buildUndertakings(stored, { now: env.now() });
  const byKernel = kernel.rows.find((r) => r.id === undertakingId);
  const byReport = report.rows.find((r) => r.id === undertakingId);

  assert.equal(byReport.state, 'reported-met', 'the lifecycle closes the promise');
  assert.deepEqual(byReport, byKernel, 'panel row == recomputed row, field for field');
  assert.equal(report.counts.undertakings, kernel.counts.undertakings);
  assert.equal(report.counts.reported, kernel.counts.reported);
  assert.equal(report.counts.droppedRows, kernel.counts.droppedRows);
  assert.equal(report.partitionReconciles, kernel.partitionReconciles);
  assert.equal(byKernel.lines.length, 3);
  assert.equal(byKernel.allConfirmed, true);
  assert.equal(byKernel.accountability, 'joint-apex');
  assert.equal(byKernel.apexId, 'ceo', 'the joint apex above BOTH managers answers for the whole promise');

  assert.equal(stored.undertakings.length, 1);
  assert.equal(stored.undertakingActs.length, 7, '3 delivers + 3 verifies + 1 report');
});

test('a hand-edited malformed row is dropped and counted, never silently repaired', () => {
  const env = seed();
  const { undertakingId } = lifecycle(env);
  const stored = env.snapshot();
  stored.undertakings.push({ id: 'hand-edited', counterparty: 'x', dueOn: 'nope', state: 'reported-met' });
  stored.undertakingActs.push({ id: 'ghost-act', undertakingId, kind: 'verify', verdict: 'confirm' });
  const kernel = buildUndertakings(stored, { now: env.now() });
  assert.equal(kernel.rows.length, 1, 'the malformed row is not in the population');
  assert.ok(kernel.counts.droppedRows >= 2, 'the drops are counted');
  assert.equal(kernel.figuresComplete, false, 'an incomplete register never prints complete figures');
  assert.equal(kernel.rows[0].id, undertakingId);
});

test('the attention count is seat-scoped and uses the SAME independence predicate as the action', () => {
  const env = seed();
  env.sit('ceo');
  const undertakingId = env.api.undertakingDeclare(DECLARE).undertakingId;
  assert.equal(env.api.undertakingAttentionCount(), 0, 'a fresh undertaking owes the executive nothing yet');

  env.setDay('2026-02-10');
  // ln-fin is held by yusuf, whose manager is marta.
  env.sit('yusuf');
  assert.equal(env.api.undertakingDeliver({ undertakingId, ...deliver('ln-fin', 'The artefact exists and can be inspected at the reference named on this act.') }).ok, true);

  // The holder owes nothing (they may not test their own work); their manager does.
  assert.equal(env.api.undertakingAttentionCount(), 0, 'the deliverer is never badged to grade their own work');
  env.sit('marta');
  assert.equal(env.api.undertakingAttentionCount(), 1, 'the holder’s manager owes the independent test');
  env.sit('priya');
  assert.equal(env.api.undertakingAttentionCount(), 0, 'an unrelated branch owes nothing');

  // Confirm the badge against the action: if it says 1, the action must accept.
  env.sit('marta');
  assert.equal(env.api.undertakingVerify({ undertakingId, ...verify('ln-fin', 'confirm', 'I inspected the artefact myself against the declared deliverable.') }).ok, true);
});

test('RULE-UDT-01 asks the joint apex to test, then the executive to report, and never names the counterparty', () => {
  const env = seed();
  env.sit('ceo');
  const undertakingId = env.api.undertakingDeclare(DECLARE).undertakingId;
  env.sit('yusuf');
  env.api.undertakingDeliver({ undertakingId, ...deliver('ln-fin', 'The artefact exists and can be inspected at the reference named on this act.') });

  const state = env.snapshot();
  const now = at('2026-02-20');
  const report = buildUndertakings(state, { now });
  const matrix = buildMatrix(state, { now, settings: { ...state.settings, activeSeatId: null } });
  const { conditions } = undertakingConditions(state, report, { today: '2026-02-20', matrix });
  const kinds = conditions.map((c) => `${c.kind}:${c.seatIds.join('|')}`);
  assert.ok(kinds.some((k) => k.startsWith('delivery-untested:marta')), `the untested line asks its holder’s manager: ${kinds}`);
  assert.ok(!kinds.some((k) => k.includes('yusuf|')), 'the holder is never asked to test their own work');

  const draft = JSON.parse(JSON.stringify(state));
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-rule-${++seq}`;
  const effects = undertakingRule(draft, { now, idFactory, event: { type: 'undertaking.register.scanned' } });
  const delegations = draft.delegations.filter((d) => d.id && d.id.startsWith('dlg-rule'));
  assert.ok(delegations.length >= 1, 'the rule filed its ask as a delegation');
  const text = JSON.stringify(delegations.map((d) => `${d.title} ${d.expectedOutcome}`));
  for (const leak of ['Financial Supervision Authority', 'UND-2026-07', 'Retail payments', 'night shift rota', 'FSA']) {
    assert.equal(text.includes(leak), false, `the ask text leaked the counterparty or the scope: ${leak}`);
  }
  assert.ok(draft.links.some((l) => l.ruleId === UDT_RULE_ID && l.relation === 'issues-obligation'), 'the signature lives only in the typed link');
  assert.ok(effects.length > 0);

  // Idempotence: a second run files nothing new.
  const before = draft.delegations.filter((d) => d.id && d.id.startsWith('dlg-rule')).length;
  undertakingRule(draft, { now, idFactory, event: { type: 'undertaking.register.scanned' } });
  assert.equal(draft.delegations.filter((d) => d.id && d.id.startsWith('dlg-rule')).length, before, 'the rule is idempotent per (signature, addressee)');
});

test('the pause silences RULE-UDT-01 on every path, including an explicit scan', () => {
  const env = seed();
  env.sit('ceo');
  const undertakingId = env.api.undertakingDeclare(DECLARE).undertakingId;
  env.sit('yusuf');
  env.api.undertakingDeliver({ undertakingId, ...deliver('ln-fin', 'The artefact exists and can be inspected at the reference named on this act.') });

  const state = env.snapshot();
  state.settings[UDT_PAUSE_SWITCH] = false;
  const draft = JSON.parse(JSON.stringify(state));
  const effects = undertakingRule(draft, { now: at('2026-02-20'), idFactory: (p) => `${p}-paused`, event: { type: 'undertaking.register.scanned' } });
  assert.equal(effects.length, 0, 'a paused rule files nothing');
  assert.equal(draft.delegations.filter((d) => d.id && d.id.startsWith('dlg-paused')).length, 0);
});

test('CSV scope #177 exports identity-free aggregates with the denominator printed', () => {
  const env = seed();
  lifecycle(env);
  env.sit('ceo');
  const payload = exportWorkspaceCsv(env.store.state, UDT_CSV_SCOPE, { now: env.now() });
  assert.equal(payload.ok, true, payload.error);
  const csv = payload.csv;
  assert.ok(CSV_EXPORTS.some((d) => d.key === UDT_CSV_SCOPE), 'the descriptor is registered');
  const header = csv.split('\n')[0];
  assert.match(header, /as_of/);
  assert.match(header, /row_kind/);
  assert.match(header, /on_time_rate_bp/);
  // Identity- and relationship-free.
  for (const needle of ['Financial Supervision', 'Cleo', 'Marta', 'Priya', 'Ola', 'Lea', 'Finn', 'ceo', 'marta', 'ops', 'legal', 'UND-2026-07', 'FSA-FILING', 'Retail payments', 'night shift', 'ln-ops', 'udt-']) {
    assert.equal(csv.includes(needle), false, `CSV leaked an identity or a relationship: ${needle}`);
  }
  // The exported integers ARE the kernel's counts — compared, not guessed.
  const kernel = buildUndertakings(env.snapshot(), { now: env.now() });
  const summary = csv.split('\n').find((l) => l.includes(',summary,')).trim().split(',');
  const cols = csv.split('\n')[0].split(',');
  const col = (name) => summary[cols.indexOf(name)];
  for (const key of ['undertakings', 'open', 'reported', 'lapsed', 'closing', 'unreported', 'rejected', 'disputed']) {
    assert.equal(col(key), String(kernel.counts[key]), `the exported ${key} is the computed ${key}`);
  }
  assert.equal(col('undertakings'), '1', 'exactly the one undertaking the lifecycle declared');
  assert.equal(col('reported'), '1', 'and it is reported');
  const rateRow = csv.split('\n').find((l) => l.includes(',rate,'));
  assert.ok(rateRow, 'the closure-rate row is present');
  // The denominator is printed; the due day is in the future here, so the rate is
  // blank-by-denominator, never a manufactured zero.
  const rateCells = rateRow.trim().split(',');
  const rateCol = (name) => rateCells[cols.indexOf(name)];
  assert.equal(rateCol('owed'), '0', 'no due day has passed, so the denominator is honestly zero');
  assert.equal(rateCol('on_time_rate_bp'), '', 'and the rate is BLANK, never zero');
});

test('the DOM renders the same figures the reader produced', () => {
  if (!JSDOM) return; // jsdom absent in this environment
  const env = seed();
  const { undertakingId } = lifecycle(env);
  env.sit('ceo');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const prev = {
    window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node, Event: globalThis.Event, CustomEvent: globalThis.CustomEvent,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    const ctx = { api: env.api, state: env.store.state, query: new URLSearchParams('view=rows'), navigate() {}, refresh() {}, toast() {} };
    const panel = renderUndertakings(ctx);
    const report = env.api.undertakingReport();
    const rowNode = panel.querySelector(`[data-testid="udt-row-${undertakingId}"]`);
    assert.ok(rowNode, 'the declared undertaking is rendered');
    assert.equal(rowNode.getAttribute('data-state'), report.rows.find((r) => r.id === undertakingId).state, 'the rendered row prints the computed state');
    assert.equal(rowNode.getAttribute('data-reported'), 'true');
    const stats = Object.fromEntries([...panel.querySelectorAll('.stat')].map((node) => [
      node.querySelector('.stat-label')?.textContent,
      node.querySelector('.stat-value')?.textContent,
    ]));
    const kernel = buildUndertakings(env.snapshot(), { now: env.now() });
    for (const [label, key] of [['Undertakings', 'undertakings'], ['Open', 'open'], ['Lapsed — no report', 'lapsed'], ['Confirmed, not reported', 'unreported']]) {
      if (stats[label] !== undefined) assert.equal(stats[label], String(kernel.counts[key]), `the page prints the kernel count for ${label}`);
    }
    assert.match(panel.textContent || panel.outerHTML || '', /promise made outward/i, 'the page renders its title');
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
});

test('the API surface is exactly the declared ADR-0234 methods, and the rights are as declared', () => {
  const env = seed();
  for (const name of [
    'undertakingReport', 'undertakingDeclare', 'undertakingAssign', 'undertakingDeliver',
    'undertakingVerify', 'undertakingReportClosure', 'undertakingNotify', 'undertakingExtend',
    'undertakingScan', 'undertakingAttentionCount', 'undertakingCandidates',
  ]) {
    assert.equal(typeof env.api[name], 'function', `${name} is not wired`);
  }
  assert.equal(UDT_RIGHTS.REPORT, 'report-undertaking-closure');
  env.sit('marta');
  const candidates = env.api.undertakingCandidates();
  assert.equal(candidates.ok, true);
  assert.ok(candidates.people.length >= 6, 'the holder vocabulary is offered, never guessed');
  assert.ok(candidates.people.some((p) => p.id === 'yusuf'), 'a line-holding manager appears in the holder vocabulary');
  assert.ok(candidates.instruments.some((i) => i.key === 'regulatory-undertaking'));
  assert.deepEqual([...candidates.acknowledgements], ['acknowledged', 'no-response', 'disputed']);
  assert.ok(candidates.counterpartyKinds.every((row) => typeof row.key === 'string' && typeof row.label === 'string'), 'the vocabulary is offered with its labels');
});

test('the right-capable seat can declare and a frontline seat cannot', () => {
  const env = seed();
  env.sit('t1');
  const refused = env.api.undertakingDeclare(DECLARE);
  assert.equal(refused.ok, false, 'declaring a promise to an outside party is an executive act');
  env.sit('marta');
  const manager = env.api.undertakingDeclare({ ...DECLARE, dueOn: '2026-04-30' });
  assert.equal(manager.ok, false, 'a rank-3 manager does not carry the executive right either');
});
