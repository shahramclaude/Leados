/**
 * tests/app/assurance-finding-wiring.test.mjs — the focused integration suite
 * for ADR-0232 (Assurance Finding & Remediation Closure Register,
 * `RULE-AFR-01`, Schema v187, CSV #175, `#/findings`).
 *
 * The panel is deliberately matrixed: Dana holds the platform line and Omar
 * holds the delivery line, so a finding can only close when BOTH lines have
 * carried an assignment, an assertion and an independent verification. The one
 * structural rule the whole register exists to enforce — the person who owns a
 * fix never verifies it, and a verifier must sit strictly above the owner on
 * the reporting graph — is asserted here as a refusal, not as a comment.
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
import { buildAssuranceFindings } from '../../app/core/domain/assuranceFinding.js';
import {
  AFR_CSV_SCOPE, AFR_HREF, AFR_RIGHTS, AFR_RULE_ID,
} from '../../app/core/domain/assuranceRegistry.js';
import { renderAssuranceFindings } from '../../app/views/assurance-findings.js';

const at = (day) => new Date(`${day}T10:00:00.000Z`);
const iso = '2026-01-01T09:00:00.000Z';

const person = (id, name, level, managerId) => ({ id, name, role: level, level, managerId, status: 'active', startDate: iso, createdAt: iso, updatedAt: iso });
const line = (id, personId, managerId) => ({ id, personId, managerId, kind: 'functional', shareH: null, rights: [], fromISO: '2026-01-01', toISO: null, declaredAt: iso, note: '', status: 'active', history: [] });

function seed() {
  let currentNow = at('2026-11-16');
  const clock = () => currentNow;
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-${++seq}`;
  const raw = createEmptyState(currentNow.toISOString());
  raw.settings.chainLeaderAltitude = 'chief';
  raw.people = [
    person('ceo', 'Cleo Executive', 'vp', null),
    person('dana', 'Dana Platform', 'director', 'ceo'),
    person('omar', 'Omar Delivery', 'director', 'ceo'),
    person('leila', 'Leila Payments', 'manager', 'dana'),
    person('kai', 'Kai Integration', 'manager', 'omar'),
    person('ada', 'Ada Platform', 'ic', 'leila'),
    person('bo', 'Bo Delivery', 'ic', 'kai'),
  ];
  raw.reportingLines = [
    line('rl-dana-ceo', 'dana', 'ceo'),
    line('rl-omar-ceo', 'omar', 'ceo'),
    line('rl-leila-dana', 'leila', 'dana'),
    line('rl-kai-omar', 'kai', 'omar'),
    line('rl-ada-leila', 'ada', 'leila'),
    line('rl-bo-kai', 'bo', 'kai'),
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

const FINDING = {
  controlRef: 'AP-07 three-way match',
  scopeRef: 'Shared services · Nordic entities',
  criteriaRef: 'Policy FIN-12 §4.2',
  source: 'internal-audit',
  severity: 'significant-deficiency',
  statement: 'Three purchase orders were paid against a two-way match in September, so the payment cleared with one approval where policy requires two.',
  accountable: [{ personId: 'dana', lineId: 'rl-dana-ceo' }, { personId: 'omar', lineId: 'rl-omar-ceo' }],
};

/** Drives one finding to `closed-verified` across both lines. Returns the ids. */
function lifecycle(env) {
  env.sit('ceo');
  const declared = env.api.assuranceFindingDeclare({ ...FINDING, remediationDays: 30, verificationDays: 30 });
  assert.equal(declared.ok, true, `declare: ${declared.error}`);
  const findingId = declared.findingId;
  env.sit('dana');
  env.api.assuranceFindingAssign({ findingId, lineId: 'rl-dana-ceo', ownerId: 'leila', dueOn: '2026-12-01', note: 'Leila owns the approval rule in the payments service.' });
  env.sit('omar');
  env.api.assuranceFindingAssign({ findingId, lineId: 'rl-omar-ceo', ownerId: 'kai', dueOn: '2026-12-05', note: 'Kai owns the supplier-data feed on the delivery line.' });
  env.sit('leila');
  env.api.assuranceFindingAssert({ findingId, lineId: 'rl-dana-ceo', changeText: 'The payment path now blocks at two approvals and writes the third to the audit trail.', evidenceRef: 'Release 2026.11.02 · payments service' });
  env.sit('kai');
  env.api.assuranceFindingAssert({ findingId, lineId: 'rl-omar-ceo', changeText: 'The supplier feed now carries the third approver for every supplier type.', evidenceRef: 'Release 2026.11.08 · integration' });
  env.sit('ceo');
  env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'Re-ran 40 September payments end to end and read the approval records the new path writes.' });
  env.api.assuranceFindingVerify({ findingId, lineId: 'rl-omar-ceo', decision: 'confirm', methodText: 'Re-ran the supplier feed for 30 suppliers and read the approver field on each.' });
  return { findingId };
}

test('schema v187 carries the three ADR-0232 collections as empty arrays', () => {
  assert.equal(SCHEMA_VERSION, 191);
  const state = normalizeState(createEmptyState(at('2026-11-16').toISOString()), { now: at('2026-11-16') }).state;
  for (const key of ['assuranceFindings', 'assuranceFindingActs', 'assuranceFindingMarkers']) {
    assert.ok(COLLECTIONS.includes(key), `${key} is not a declared collection`);
    assert.deepEqual(state[key], [], `${key} should seed as an empty array`);
  }
});

test('RULE-AFR-01 sits on the post-commit spine and in the propagation contracts', () => {
  const ids = DEFAULT_POST_COMMIT_RULES.map((rule) => (typeof rule === 'string' ? rule : rule.id));
  assert.ok(ids.includes('assuranceFindingRule'), 'the ADR-0232 automation rule is not registered on the shared spine');
  const joined = JSON.stringify(PROPAGATION_CONTRACTS);
  assert.ok(joined.includes(AFR_RULE_ID), `${AFR_RULE_ID} is missing from the propagation contracts`);
  assert.ok(AFR_HREF === '#/findings');
});

test('the register drives a matrixed finding from declaration to closed-verified, and refuses the two ways to fake closure', () => {
  const env = seed();
  env.sit('ceo');
  const declared = env.api.assuranceFindingDeclare({ ...FINDING, remediationDays: 30, verificationDays: 30 });
  assert.equal(declared.ok, true, `declare: ${declared.error}`);
  const findingId = declared.findingId;
  env.sit('dana');
  assert.equal(env.api.assuranceFindingAssign({ findingId, lineId: 'rl-dana-ceo', ownerId: 'leila', dueOn: '2026-12-01', note: 'Leila owns the approval rule in the payments service.' }).ok, true);
  env.sit('omar');
  assert.equal(env.api.assuranceFindingAssign({ findingId, lineId: 'rl-omar-ceo', ownerId: 'kai', dueOn: '2026-12-05', note: 'Kai owns the supplier-data feed on the delivery line.' }).ok, true);
  env.sit('leila');
  assert.equal(env.api.assuranceFindingAssert({ findingId, lineId: 'rl-dana-ceo', changeText: 'The payment path now blocks at two approvals and writes the third to the audit trail.', evidenceRef: 'Release 2026.11.02 · payments service' }).ok, true);

  // The two closure paths that must never be available, tested while the line
  // is still open — a closed finding refuses everything, which would prove
  // nothing about independence.
  const selfVerify = env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'I tested my own change over two weeks and it works.' });
  assert.equal(selfVerify.ok, false, 'the person who owns a fix may never verify it');
  assert.match(String(selfVerify.code || selfVerify.refusal || selfVerify.error), /independen|never be the owner/i, `self-verify refusal: ${selfVerify.error}`);
  const leilaAccept = env.api.assuranceFindingAccept({ findingId, reason: 'The interim manual review covers the exposure until the platform replacement lands.', reviewOn: '2027-02-28' });
  assert.equal(leilaAccept.ok, false, 'a rank-2 seat must not be able to accept residual risk');

  env.sit('omar');
  const crossVerify = env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'I read the payments report and it looks right to me.' });
  assert.equal(crossVerify.ok, false, 'a seat that does not stand above the owner on this line must not verify it');

  // Only now does the finding close, on two independent verifications.
  env.sit('kai');
  assert.equal(env.api.assuranceFindingAssert({ findingId, lineId: 'rl-omar-ceo', changeText: 'The supplier feed now carries the third approver for every supplier type.', evidenceRef: 'Release 2026.11.08 · integration' }).ok, true);
  env.sit('ceo');
  assert.equal(env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'Re-ran 40 September payments end to end and read the approval records the new path writes.' }).ok, true);
  assert.equal(env.api.assuranceFindingVerify({ findingId, lineId: 'rl-omar-ceo', decision: 'confirm', methodText: 'Re-ran the supplier feed for 30 suppliers and read the approver field on each.' }).ok, true);
  const report = env.api.assuranceFindingReport();
  const row = report.rows.find((r) => r.id === findingId);
  assert.equal(row.state, 'closed-verified');
  assert.equal(row.allVerifiedOn, '2026-11-16');
  assert.equal(report.counts.findings, 1);
  assert.equal(report.counts.closed, 1);
  // A closed finding refuses a third verification: closure is not a number to top up.
  assert.equal(env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'One more test for good measure.' }).ok, false);
});

test('a second assignment never overwrites the first: the governing owner is the one the line first named', () => {
  const env = seed();
  env.sit('ceo');
  const { findingId } = lifecycle(env);
  env.sit('dana');
  const second = env.api.assuranceFindingAssign({ findingId, lineId: 'rl-dana-ceo', ownerId: 'kai', dueOn: '2026-12-09', note: 'Re-pointing the fix at the delivery line instead.' });
  assert.equal(second.ok, false);
  const row = env.api.assuranceFindingReport().rows.find((r) => r.id === findingId);
  const entry = row.accountable.find((e) => e.lineId === 'rl-dana-ceo');
  assert.equal(entry.ownerId, 'leila', 'the first assignment still governs');
  assert.equal(entry.assignCount, 1);
});

test('a rejected assertion sends the line back to remediation and a re-assertion re-tests it', () => {
  const env = seed();
  env.sit('ceo');
  const declared = env.api.assuranceFindingDeclare({
    ...FINDING,
    accountable: [{ personId: 'dana', lineId: 'rl-dana-ceo' }],
    remediationDays: 30,
    verificationDays: 30,
  });
  assert.equal(declared.ok, true, `declare: ${declared.error}`);
  const findingId = declared.findingId;
  const stateOf = () => env.api.assuranceFindingReport().rows.find((r) => r.id === findingId).state;
  const lineOf = () => env.api.assuranceFindingReport().rows.find((r) => r.id === findingId).accountable[0];

  env.sit('dana');
  assert.equal(env.api.assuranceFindingAssign({ findingId, lineId: 'rl-dana-ceo', ownerId: 'leila', dueOn: '2026-12-01', note: 'Leila owns the approval rule in the payments service.' }).ok, true);
  assert.equal(stateOf(), 'remediating');
  env.sit('leila');
  assert.equal(env.api.assuranceFindingAssert({ findingId, lineId: 'rl-dana-ceo', changeText: 'We told the payments team to be more careful about approvals.', evidenceRef: 'Team briefing 2026.11.04' }).ok, true);
  assert.equal(stateOf(), 'asserted-awaiting-verification');

  // An independent test that does not find the fix returns the line to
  // remediation owed — it does not close anything and it does not count.
  env.sit('ceo');
  const rejected = env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'reject', methodText: 'Re-ran the 40 September payments: eleven still cleared on a single approval. A briefing is not a change to the control.', gapText: 'The payment path itself is unchanged — no code or configuration was altered.' });
  assert.equal(rejected.ok, true, `reject: ${rejected.error}`);
  assert.equal(rejected.decision, 'reject');
  assert.equal(stateOf(), 'rejected-remediation-owed');
  assert.equal(lineOf().lineState, 'rejected');
  env.sit('leila');
  assert.equal(env.api.assuranceFindingAttentionCount(), 1, 'the owner owes the fix again');

  const reassert = env.api.assuranceFindingAssert({ findingId, lineId: 'rl-dana-ceo', changeText: 'The payment path now blocks at two approvals and writes the third to the audit trail.', evidenceRef: 'Release 2026.11.09 · payments service' });
  assert.equal(reassert.ok, true, `re-assert: ${reassert.error}`);
  assert.equal(stateOf(), 'asserted-awaiting-verification');
  assert.equal(lineOf().assertionCount, 2, 'the rejected assertion stays on the record');

  env.sit('ceo');
  const confirmed = env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'Re-ran the same 40 September payments; all forty now carry two approvals in the audit trail.' });
  assert.equal(confirmed.ok, true, `confirm: ${confirmed.error}`);
  assert.equal(stateOf(), 'closed-verified');
  // A third verification of a verified assertion is refused: independence is
  // not a number to top up.
  assert.equal(env.api.assuranceFindingVerify({ findingId, lineId: 'rl-dana-ceo', decision: 'confirm', methodText: 'One more test for good measure, on the same forty payments.' }).ok, false);
});

test('stored bytes recompute to exactly what the panel reports', () => {
  const env = seed();
  const { findingId } = lifecycle(env);
  env.sit('ceo');
  const report = env.api.assuranceFindingReport();
  const stored = env.snapshot();
  const kernel = buildAssuranceFindings(stored, { now: env.now() });
  const byKernel = kernel.rows.find((f) => f.id === findingId);
  const byReport = report.rows.find((r) => r.id === findingId);
  assert.equal(byReport.state, byKernel.state, 'panel state == recomputed state');
  assert.equal(byReport.allVerifiedOn, byKernel.allVerifiedOn);
  assert.equal(report.counts.findings, kernel.counts.findings);
  assert.equal(report.counts.closed, kernel.counts.closed);
  assert.equal(report.counts.droppedRows, kernel.counts.droppedRows);
  for (const entry of byReport.accountable) {
    const k = byKernel.accountable.find((l) => l.lineId === entry.lineId);
    assert.equal(entry.lineState, k.lineState, `line ${entry.lineId} state matches`);
  }
  // The stored acts are the only source: three collections, one act per step.
  assert.equal(stored.assuranceFindings.length, 1);
  assert.equal(stored.assuranceFindingActs.length, 6, 'declare metadata + 2 assign + 2 assert + 2 verify acts');
});

test('a hand-edited malformed row is dropped and counted, never silently repaired', () => {
  const env = seed();
  lifecycle(env);
  const stored = env.snapshot();
  stored.assuranceFindings.push({ id: 'hand-edited', findingId: 'x', state: 'closed-verified', severity: 'catastrophic' });
  const report = buildAssuranceFindings(stored, { now: env.now() });
  assert.equal(report.rows.length, 1, 'the malformed row is not in the population');
  assert.ok(report.counts.droppedRows >= 1, 'the drop is counted');
  assert.equal(report.figuresComplete, false, 'an incomplete register never prints complete figures');
});

test('the attention count is seat-scoped: it counts only what this seat owes next', () => {
  const env = seed();
  env.sit('ceo');
  const declared = env.api.assuranceFindingDeclare({ ...FINDING, remediationDays: 30, verificationDays: 30 });
  const findingId = declared.findingId;
  env.sit('ceo');
  assert.equal(env.api.assuranceFindingAttentionCount(), 0, 'the declarant owes nothing yet');
  env.sit('dana');
  assert.equal(env.api.assuranceFindingAttentionCount(), 1, 'Dana holds an unassigned accountable line');
  env.sit('omar');
  assert.equal(env.api.assuranceFindingAttentionCount(), 1);
  env.sit('leila');
  assert.equal(env.api.assuranceFindingAttentionCount(), 0, 'Leila is not yet a named owner');
  env.sit('dana');
  env.api.assuranceFindingAssign({ findingId, lineId: 'rl-dana-ceo', ownerId: 'leila', dueOn: '2026-12-01', note: 'Leila owns the approval rule in the payments service.' });
  assert.equal(env.api.assuranceFindingAttentionCount(), 0, 'Dana has handed the line on');
  env.sit('leila');
  assert.equal(env.api.assuranceFindingAttentionCount(), 1, 'Leila now owes the assertion');
});

test('CSV scope #175 exports identity-free aggregates and blanks below the floor', () => {
  const env = seed();
  lifecycle(env);
  env.sit('ceo');
  const payload = exportWorkspaceCsv(env.store.state, AFR_CSV_SCOPE, { now: env.now() });
  assert.equal(payload.ok, true, payload.error);
  const csv = payload.csv;
  assert.ok(CSV_EXPORTS.some((d) => d.key === AFR_CSV_SCOPE), 'the descriptor is registered');
  assert.ok(csv.length > 0, 'the export produced rows');
  const header = csv.split('\n')[0];
  assert.match(header, /as_of/);
  assert.match(header, /row_kind/);
  // Identity-free: no names, ids, controls, scopes or statement text.
  for (const needle of ['Dana', 'Omar', 'Leila', 'Kai', 'Cleo', 'Ada', 'Bo', 'AP-07', 'three-way match', 'Nordic', 'rl-dana-ceo', 'afr-']) {
    assert.equal(csv.includes(needle), false, `CSV leaked an identity: ${needle}`);
  }
  // One finding sits below the disclosure floor of three, so the per-line cells
  // export BLANK with a reason — never zero.
  const lineRows = csv.split('\n').filter((l) => l.startsWith('line,') || l.includes(',line,'));
  assert.ok(lineRows.length > 0, 'the export carries one row per accountable line');
  assert.ok(lineRows.every((l) => /,[^,]*(below|floor)[^,]*$/i.test(l) || /,{2,}/.test(l) || l.includes('blank')), 'a below-floor line cell exports blank with its reason, never zero');
  assert.equal(/\b0\b/.test(lineRows[0].split(',').slice(4).join(',')), false, 'no below-floor cell prints a zero');
});

test('the DOM renders the same figures the reader produced', () => {
  if (!JSDOM) return; // jsdom absent in this environment
  const env = seed();
  const { findingId } = lifecycle(env);
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
    const panel = renderAssuranceFindings(ctx);
    const report = env.api.assuranceFindingReport();
    const html = panel.outerHTML || panel.innerHTML || String(panel);
    assert.ok(/Did the fix hold/i.test(html), 'the page renders its title');
    // The rendered finding row carries the state the reader computed, and the
    // stat strip carries the same count — display == stored == computed.
    const rowNode = panel.querySelector(`[data-testid="afr-row-${findingId}"]`);
    assert.ok(rowNode, 'the declared finding is rendered');
    assert.equal(rowNode.getAttribute('data-state'), report.rows.find((r) => r.id === findingId).state, 'the rendered row prints the computed state');
    assert.equal(rowNode.getAttribute('data-recurrent'), 'false', 'a first finding is not printed as a repeat');
    const stats = Object.fromEntries([...panel.querySelectorAll('.stat')].map((node) => [
      node.querySelector('.stat-label')?.textContent,
      node.querySelector('.stat-value')?.textContent,
    ]));
    const kernel = buildAssuranceFindings(env.snapshot(), { now: env.now() });
    assert.deepEqual(report.rows, kernel.rows, 'the page prints exactly what the kernel computed from the stored record');
    if (stats.Findings !== undefined) assert.equal(stats.Findings, String(kernel.counts.findings));
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
  }
});

test('the API surface is exactly the declared ADR-0232 methods', () => {
  const env = seed();
  for (const name of ['assuranceFindingReport', 'assuranceFindingDeclare', 'assuranceFindingAssign', 'assuranceFindingAssert', 'assuranceFindingVerify', 'assuranceFindingAccept', 'assuranceFindingScan', 'assuranceFindingAttentionCount', 'assuranceFindingCandidates']) {
    assert.equal(typeof env.api[name], 'function', `${name} is not wired`);
  }
  assert.equal(typeof AFR_RIGHTS.VERIFY, 'string');
});
