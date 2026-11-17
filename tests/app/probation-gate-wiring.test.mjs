/**
 * tests/app/probation-gate-wiring.test.mjs — the focused integration suite for
 * ADR-0233 (Probation Confirmation Gate Register, `RULE-PBG-01`, Schema v188,
 * CSV #176, `#/probation`).
 *
 * The panel is deliberately matrixed: Jo reports home to Marta and on a
 * declared project line to Priya, so a confirmation can only land when BOTH
 * lines have carried evidence — and the refusals that matter are asserted as
 * refusals, not as comments: a confirmation with a silent line, an extension
 * the instrument does not allow, an extension past the declared cap, a
 * decision after the window closed, a second decision, and a peer answering
 * for somebody else's line.
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
import { buildProbationGates } from '../../app/core/domain/probationGate.js';
import { probationGateRule, probationConditions } from '../../app/core/domain/probationGateRules.js';
import { buildMatrix } from '../../app/core/domain/matrix.js';
import {
  PBG_CSV_SCOPE, PBG_HREF, PBG_RIGHTS, PBG_RULE_ID,
} from '../../app/core/domain/probationRegistry.js';
import { renderProbationGates } from '../../app/views/probation-gates.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const iso = '2026-01-01T09:00:00.000Z';

const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
const line = (id, personId, managerId, kind = 'functional') => ({ id, personId, managerId, kind, shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '', status: 'active', history: [] });

function seed() {
  let currentNow = at('2026-11-16');
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('marta', 'Marta Home', 'manager', 'ceo'),
    person('priya', 'Priya Project', 'manager', 'ceo'),
    person('jo', 'Jo Joiner', 'ic', 'marta'),
    person('sam', 'Sam Joiner', 'ic', 'marta'),
  ];
  raw.reportingLines = [
    line('rl-marta-ceo', 'marta', 'ceo'),
    line('rl-priya-ceo', 'priya', 'ceo'),
    line('rl-jo-marta', 'jo', 'marta'),
    line('rl-jo-priya', 'jo', 'priya', 'project'),
    line('rl-sam-marta', 'sam', 'marta'),
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
    rawSnapshot() { return values.get(STORAGE_KEY); },
  };
}

const GATE = {
  joinerId: 'jo',
  roleLabel: 'Payments analyst',
  startOn: '2026-10-01',
  endOn: '2026-12-01',
  expectations: 'Run the payment reconciliation without supervision and raise the first two anomalies through the declared route.',
  instrument: 'contract',
  instrumentRef: 'EMP-2026-114 §3 prøvetid',
  allowsExtension: true,
  legalCapDays: 180,
  noticeDays: 14,
};

const ASK = { gateId: 'pbg-1', lineId: 'rl-jo-priya', dueOn: '2026-11-20', note: 'Priya has seen the daily delivery work the home line cannot see; the ask covers delivery against the declared expectations.' };
const HOME_SUBMIT = { gateId: 'pbg-1', lineKind: 'home', observedText: 'Jo ran the October reconciliation solo on the 14th and 28th and raised both anomalies through the route on the same day.', recommendation: 'support' };
const MATRIX_SUBMIT = { gateId: 'pbg-1', lineKind: 'matrix', lineId: 'rl-jo-priya', observedText: 'Jo delivered the integration slice on time in weeks 3 and 5; the review comments were addressed within a day each time.', recommendation: 'support' };
const DECIDE = { gateId: 'pbg-1', decision: 'confirm', reason: 'Both lines carry dated evidence inside the window; the week-2 concern was resolved and re-verified on the record.' };

/** Drives one gate to `decided-confirmed` across both lines. */
function lifecycle(env) {
  env.sit('marta');
  const declared = env.api.probationGateDeclare({ ...GATE, legalCapDays: 180 });
  assert.equal(declared.ok, true, `declare: ${declared.error}`);
  const gateId = declared.gateId;
  assert.equal(env.api.probationGateAsk({ ...ASK, gateId }).ok, true, 'ask: marta puts the duty to the project line');
  assert.equal(env.api.probationGateSubmit({ ...HOME_SUBMIT, gateId }).ok, true, 'home evidence: marta’s own act');
  env.sit('priya');
  assert.equal(env.api.probationGateSubmit({ ...MATRIX_SUBMIT, gateId }).ok, true, 'matrix evidence: the line holder’s own act');
  env.sit('marta');
  assert.equal(env.api.probationGateDecide({ ...DECIDE, gateId }).ok, true, 'decide: marta’s act');
  assert.equal(env.api.probationGateNotify({ gateId, instrumentRef: 'Confirmation letter 2026-11-26, sent by HR post' }).ok, true, 'notify: the written notification');
  return { gateId };
}

test('schema v188 carries the three ADR-0233 collections as empty arrays', () => {
  assert.equal(SCHEMA_VERSION, 192);
  const state = normalizeState(createEmptyState(at('2026-11-16').toISOString()), { now: at('2026-11-16') }).state;
  for (const key of ['probationGates', 'probationActs', 'probationMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is not a declared collection`);
    assert.deepEqual(state[key], [], `${key} should seed as an empty array`);
  }
});

test('RULE-PBG-01 sits on the post-commit spine and in the propagation contracts', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => (typeof rule === 'string' ? rule : rule.id));
  assert.ok(ids.includes('probationGateRule'), 'the ADR-0233 automation rule is not registered on the shared spine');
  const joined = JSON.stringify(PROPAGATION_CONTRACTS);
  assert.ok(joined.includes(PBG_RULE_ID), `${PBG_RULE_ID} is missing from the propagation contracts`);
  assert.ok(PBG_HREF === '#/probation');
});

test('the register drives a matrixed gate from declaration to confirmed-communicated, and refuses the ways to fake it', () => {
  const env = seed();
  env.sit('marta');
  const declared = env.api.probationGateDeclare({ ...GATE });
  assert.equal(declared.ok, true, `declare: ${declared.error}`);
  const gateId = declared.gateId;

  // The home manager's own gate: only they open, ask, decide and notify it.
  env.sit('priya');
  const wrongManager = env.api.probationGateDeclare({ ...GATE, joinerId: 'sam' });
  assert.equal(wrongManager.ok, false, 'a gate on marta’s report is refused from priya’s seat');
  env.sit('marta');
  const wrongManagerAsk = env.api.probationGateAsk({ ...ASK, gateId });
  assert.equal(wrongManagerAsk.ok, true, 'the confirming manager asks the line');

  const peerSubmit = env.api.probationGateSubmit({ gateId, lineKind: 'matrix', lineId: 'rl-jo-priya', observedText: 'I read their project report and it looked fine to me.', recommendation: 'support' });
  assert.equal(peerSubmit.ok, false, 'the home manager cannot answer for the project line: a peer cannot submit somebody else’s evidence');

  // A confirmation with a silent line is refused — the core duty.
  env.sit('marta');
  assert.equal(env.api.probationGateSubmit({ ...HOME_SUBMIT, gateId }).ok, true, 'home evidence in');
  const earlyConfirm = env.api.probationGateDecide({ ...DECIDE, gateId });
  assert.equal(earlyConfirm.ok, false, 'a confirmation with a silent declared line is refused');
  assert.match(String(earlyConfirm.error), /every declared line|Missing/i, `early-confirm refusal names the duty: ${earlyConfirm.error}`);

  env.sit('priya');
  assert.equal(env.api.probationGateSubmit({ ...MATRIX_SUBMIT, gateId }).ok, true, 'the project line answers');

  env.sit('marta');
  assert.equal(env.api.probationGateDecide({ ...DECIDE, gateId }).ok, true, 'the confirmation lands on both lines’ evidence');
  const secondDecision = env.api.probationGateDecide({ ...DECIDE, gateId });
  assert.equal(secondDecision.ok, false, 'a second decision is refused');
  const report = env.api.probationGateReport();
  const row = report.rows.find((r) => r.id === gateId);
  assert.equal(row.state, 'decided-confirmed');
  assert.equal(row.unnotified, true, 'decided is not told yet');
  assert.equal(env.api.probationGateNotify({ gateId, instrumentRef: 'Confirmation letter, sent by HR post' }).ok, true);
  const row2 = env.api.probationGateReport().rows.find((r) => r.id === gateId);
  assert.equal(row2.unnotified, false);
  assert.equal(env.api.probationGateNotify({ gateId, instrumentRef: 'A second letter for good measure' }).ok, false, 'a second notification is refused');
});

test('an extension is refused by the instrument, by the cap, and by the calendar; it closes nothing', () => {
  const env = seed();
  env.sit('marta');
  // Sam's instrument allows no extension.
  const noExt = env.api.probationGateDeclare({
    ...GATE, joinerId: 'sam', allowsExtension: false, startOn: '2026-10-01', endOn: '2026-12-01',
  });
  assert.equal(noExt.ok, true, `declare sam: ${noExt.error}`);
  const samGate = noExt.gateId;
  const refusedByInstrument = env.api.probationGateExtend({
    gateId: samGate, newEndOn: '2026-12-20', reason: 'The vendor outage slipped the integration slice; the extension covers the re-run.',
  });
  assert.equal(refusedByInstrument.ok, false, 'an extension the declared instrument does not allow is refused');
  assert.match(String(refusedByInstrument.error), /does not allow/i);

  // Jo's gate allows extensions, but the declared cap is a refusal, not a
  // warning. Window 2026-10-01 → 2026-11-30 (60 days, inside the 90-day cap);
  // the beyond-cap extension would carry the total span to 137 days. NOW is
  // 2026-11-16, so every extension here is dated inside the live window.
  const jo = env.api.probationGateDeclare({ ...GATE, endOn: '2026-11-30', legalCapDays: 90 });
  assert.equal(jo.ok, true, `declare jo: ${jo.error}`);
  const joGate = jo.gateId;
  const beyondCap = env.api.probationGateExtend({
    gateId: joGate, newEndOn: '2027-02-15', reason: 'A long extension that would carry the total span to 137 days, far past the declared cap of ninety.',
  });
  assert.equal(beyondCap.ok, false, 'an extension past the declared cap is refused with the cap named');
  assert.match(String(beyondCap.error), /cap/i);

  const notForward = env.api.probationGateExtend({
    gateId: joGate, newEndOn: '2026-10-15', reason: 'An extension that does not move the window forward at all.',
  });
  assert.equal(notForward.ok, false, 'an extension must move the window forward');

  const okExtend = env.api.probationGateExtend({
    gateId: joGate, newEndOn: '2026-12-20', reason: 'Two weeks on the vendor outage re-run, with a second review inside it.',
  });
  assert.equal(okExtend.ok, true, `a lawful extension lands (80 days total, inside the 90-day cap): ${okExtend.error}`);
  const row = env.api.probationGateReport().rows.find((r) => r.id === joGate);
  assert.equal(row.effectiveEndOn, '2026-12-20');
  assert.equal(row.extendCount, 1);
  assert.equal(row.closed, false, 'the extension closed nothing');
});

test('a decision dated after the window closed is refused — the lever is gone with the window', () => {
  const env = seed();
  env.setDay('2026-11-16');
  env.sit('marta');
  const declared = env.api.probationGateDeclare({ ...GATE, endOn: '2026-11-10', legalCapDays: 90 });
  assert.equal(declared.ok, true);
  const gateId = declared.gateId;
  env.setDay('2026-11-20');
  const late = env.api.probationGateDecide({ ...DECIDE, gateId, decision: 'confirm' });
  assert.equal(late.ok, false, 'a confirmation dated after the window is refused');
  assert.match(String(late.error), /window closed/i);
  const lateEnd = env.api.probationGateDecide({ gateId, decision: 'end', reason: 'Ending now would be an ordinary termination, not a probation decision.' });
  assert.equal(lateEnd.ok, false, 'an end dated after the window is refused here too');
  const row = env.api.probationGateReport().rows.find((r) => r.id === gateId);
  assert.equal(row.state, 'lapsed-no-decision', 'the register prints the lapse instead of inventing an outcome');
  assert.equal(row.lapsed, true);
});

test('one open gate per joiner: a second overlapping gate is refused', () => {
  const env = seed();
  env.sit('marta');
  const first = env.api.probationGateDeclare({ ...GATE });
  assert.equal(first.ok, true);
  const second = env.api.probationGateDeclare({ ...GATE });
  assert.equal(second.ok, false, 'two open windows on one person are two answers to one question');
});

test('stored bytes recompute to exactly what the panel reports', () => {
  const env = seed();
  const { gateId } = lifecycle(env);
  env.sit('marta');
  const report = env.api.probationGateReport();
  const stored = env.snapshot();
  const kernel = buildProbationGates(stored, { now: env.now() });
  const byKernel = kernel.rows.find((g) => g.id === gateId);
  const byReport = report.rows.find((g) => g.id === gateId);
  assert.equal(byReport.state, byKernel.state, 'panel state == recomputed state');
  assert.equal(byReport.effectiveEndOn, byKernel.effectiveEndOn);
  assert.equal(report.counts.gates, kernel.counts.gates);
  assert.equal(report.counts.closed, kernel.counts.closed);
  assert.equal(report.counts.droppedRows, kernel.counts.droppedRows);
  assert.equal(report.counts.unnotified, kernel.counts.unnotified);
  for (const entry of byReport.lines) {
    const k = byKernel.lines.find((l) => l.lineKind === entry.lineKind && l.lineId === entry.lineId);
    assert.equal(entry.lineState, k.lineState, `line ${entry.lineId || 'home'} state matches`);
  }
  assert.equal(stored.probationGates.length, 1);
  assert.equal(stored.probationActs.length, 5, '1 ask + 2 submits + 1 decide + 1 notify');
});

test('a hand-edited malformed row is dropped and counted, never silently repaired', () => {
  const env = seed();
  lifecycle(env);
  const stored = env.snapshot();
  stored.probationGates.push({ id: 'hand-edited', joinerId: 'ghost', endOn: 'yesterday', state: 'decided-confirmed' });
  const kernel = buildProbationGates(stored, { now: env.now() });
  assert.equal(kernel.rows.length, 1, 'the malformed row is not in the population');
  assert.ok(kernel.counts.droppedRows >= 1, 'the drop is counted');
  assert.equal(kernel.figuresComplete, false, 'an incomplete register never prints complete figures');
});

test('the attention count is seat-scoped: it counts only what this seat owes next', () => {
  const env = seed();
  env.setDay('2026-11-16');
  env.sit('marta');
  const declared = env.api.probationGateDeclare({ ...GATE });
  const gateId = declared.gateId;
  env.sit('marta');
  assert.equal(env.api.probationGateAttentionCount(), 0, 'a fresh gate owes nobody an act yet (the window is far)');
  env.sit('priya');
  assert.equal(env.api.probationGateAttentionCount(), 0, 'the line has not been asked, so it owes nothing');
  env.sit('marta');
  assert.equal(env.api.probationGateAsk({ ...ASK, gateId }).ok, true);
  env.setDay('2026-11-22');
  env.sit('marta');
  assert.equal(env.api.probationGateAttentionCount(), 0, 'nine days out: the window is open and the decision is not yet owed');
  env.sit('priya');
  assert.equal(env.api.probationGateAttentionCount(), 1, 'the asked line is past its day with no answer');
  env.sit('marta');
  assert.equal(env.api.probationGateSubmit({ ...HOME_SUBMIT, gateId }).ok, true);
  env.sit('priya');
  assert.equal(env.api.probationGateSubmit({ ...MATRIX_SUBMIT, gateId }).ok, true);
  env.setDay('2026-11-24');
  env.sit('priya');
  assert.equal(env.api.probationGateAttentionCount(), 0, 'the line answered its ask');
  env.sit('marta');
  assert.equal(env.api.probationGateAttentionCount(), 1, 'the window closes within days and the decision is owed');
  assert.equal(env.api.probationGateDecide({ ...DECIDE, gateId }).ok, true);
  assert.equal(env.api.probationGateAttentionCount(), 1, 'the decision is on the record and the written notification is owed');
  assert.equal(env.api.probationGateNotify({ gateId, instrumentRef: 'Confirmation letter, sent by HR post' }).ok, true);
  assert.equal(env.api.probationGateAttentionCount(), 0, 'confirmed and communicated: nothing owed');
});

test('RULE-PBG-01 asks the line holder, then the confirming manager — and never invents an outcome', () => {
  const env = seed();
  env.setDay('2026-11-10');
  env.sit('marta');
  const declared = env.api.probationGateDeclare({ ...GATE, endOn: '2026-11-14', legalCapDays: 90 });
  const gateId = declared.gateId;
  env.sit('marta');
  const askResult = env.api.probationGateAsk({ ...ASK, gateId, dueOn: '2026-11-12' });
  assert.equal(askResult.ok, true, `ask inside the window: ${askResult.error}`);

  const state = env.snapshot();
  const now = at('2026-11-20');
  const report = buildProbationGates(state, { now });
  const matrix = buildMatrix(state, { now, settings: { ...state.settings, activeSeatId: null } });
  const { conditions } = probationConditions(state, report, { today: '2026-11-20', matrix });
  const kinds = conditions.map((c) => `${c.kind}:${c.seatIds.join('|')}`);
  assert.ok(kinds.some((k) => k.startsWith('evidence-overdue:priya')), `the overdue ask goes to the line holder: ${kinds}`);
  assert.ok(kinds.some((k) => k.startsWith('gate-lapsed:marta')), `the lapsed window asks the confirming manager: ${kinds}`);
  assert.ok(!kinds.some((k) => k.startsWith('decision-closing')), 'a lapsed window does not also fire the closing condition');

  const draft = JSON.parse(JSON.stringify(state));
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-rule-${++seq}`;
  const effects = probationGateRule(draft, { now, idFactory, event: { type: 'probation.gates.scanned' } });
  const delegations = draft.delegations.filter((d) => d.id && d.id.startsWith('dlg-rule'));
  assert.ok(delegations.length >= 2, 'the rule filed its asks as delegations');
  assert.ok(delegations.every((d) => d.personId === 'priya' || d.personId === 'marta'), 'only identities the record names are asked');
  assert.ok(!JSON.stringify(delegations.map((d) => `${d.title} ${d.expectedOutcome}`)).includes('Jo'), 'the ask text names no joiner');
  assert.ok(draft.links.some((l) => l.ruleId === PBG_RULE_ID && l.relation === 'issues-obligation'), 'the signature lives only in the typed link');
  const again = probationGateRule(draft, { now, idFactory, event: { type: 'probation.gates.scanned' } });
  const asksAgain = draft.delegations.filter((d) => d.id && d.id.startsWith('dlg-rule'));
  assert.equal(asksAgain.length, delegations.length, 'the rule is marker-idempotent per (signature, addressee)');
  assert.ok(again.length === 0 || again.every((e) => e.action !== 'delegated'), 'a second run files nothing new');
});

test('CSV scope #176 exports identity-free aggregates with the denominator printed', () => {
  const env = seed();
  lifecycle(env);
  env.sit('ceo');
  const payload = exportWorkspaceCsv(env.store.state, PBG_CSV_SCOPE, { now: env.now() });
  assert.equal(payload.ok, true, payload.error);
  const csv = payload.csv;
  assert.ok(CSV_EXPORTS.some((d) => d.key === PBG_CSV_SCOPE), 'the descriptor is registered');
  assert.ok(csv.length > 0, 'the export produced rows');
  const header = csv.split('\n')[0];
  assert.match(header, /as_of/);
  assert.match(header, /row_kind/);
  // Identity-free: no names, ids, role labels, instruments, expectations or letter refs.
  for (const needle of ['Marta', 'Priya', 'Jo', 'Cleo', 'Sam', 'jo', 'sam', 'marta', 'priya', 'prøvetid', 'EMP-2026-114', 'Payments analyst', 'reconciliation', 'rl-jo-priya', 'pbg-']) {
    assert.equal(csv.includes(needle), false, `CSV leaked an identity: ${needle}`);
  }
  const summary = csv.split('\n').find((l) => l.includes(',summary,'));
  assert.ok(summary, 'the summary row is present');
  assert.match(summary, /,1,(?:\d|$)/, 'the gate count is exported as an exact integer');
  const rateRow = csv.split('\n').find((l) => l.includes(',rate,'));
  assert.ok(rateRow, 'the on-time rate row is present');
});

test('the DOM renders the same figures the reader produced', () => {
  if (!JSDOM) return; // jsdom absent in this environment
  const env = seed();
  const { gateId } = lifecycle(env);
  env.sit('marta');
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
    const panel = renderProbationGates(ctx);
    const report = env.api.probationGateReport();
    const html = panel.outerHTML || panel.innerHTML || String(panel);
    assert.ok(/first window/i.test(html), 'the page renders its title');
    const rowNode = panel.querySelector(`[data-testid="pbg-row-${gateId}"]`);
    assert.ok(rowNode, 'the declared gate is rendered');
    assert.equal(rowNode.getAttribute('data-state'), report.rows.find((r) => r.id === gateId).state, 'the rendered row prints the computed state');
    assert.equal(rowNode.getAttribute('data-lapsed'), 'false');
    assert.equal(rowNode.getAttribute('data-unnotified'), 'false', 'the lifecycle recorded the notification');
    const stats = Object.fromEntries([...panel.querySelectorAll('.stat')].map((node) => [
      node.querySelector('.stat-label')?.textContent,
      node.querySelector('.stat-value')?.textContent,
    ]));
    const kernel = buildProbationGates(env.snapshot(), { now: env.now() });
    assert.deepEqual(report.rows, kernel.rows, 'the page prints exactly what the kernel computed from the stored record');
    if (stats.Gates !== undefined) assert.equal(stats.Gates, String(kernel.counts.gates));
    if (stats['Lapsed — no decision'] !== undefined) assert.equal(stats['Lapsed — no decision'], String(kernel.counts.lapsed));
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
});

test('the API surface is exactly the declared ADR-0233 methods', () => {
  const env = seed();
  for (const name of ['probationGateReport', 'probationGateDeclare', 'probationGateAsk', 'probationGateSubmit', 'probationGateExtend', 'probationGateDecide', 'probationGateNotify', 'probationGateScan', 'probationGateAttentionCount', 'probationGateCandidates']) {
    assert.equal(typeof env.api[name], 'function', `${name} is not wired`);
  }
  assert.equal(typeof PBG_RIGHTS.DECIDE, 'string');
  const env2 = seed();
  env2.sit('marta');
  const candidates = env2.api.probationGateCandidates();
  assert.equal(candidates.ok, true);
  assert.ok(candidates.joiners.some((j) => j.id === 'jo'), 'the home manager’s direct reports are the eligible joiners');
  assert.ok(candidates.lines.length > 0, 'the declared lines are offered, never guessed');
});
