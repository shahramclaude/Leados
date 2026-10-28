import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import { createEmptyState } from '../../app/core/schema.js';
import { runPostCommitRules, DEFAULT_POST_COMMIT_RULES } from '../../app/core/domain/postCommit.js';
import { mitigationReviewRule } from '../../app/core/domain/mitigationReview.js';
import {
  analyzeMitigationRobustness, normalizeRobustnessInput, robustnessBrief,
  robustnessEvidenceKey, robustnessDecision, ROBUSTNESS_EVENT, ROBUSTNESS_RULE_ID,
} from '../../app/core/domain/mitigationRobustness.js';
import { mitigationRobustnessPanel } from '../../app/views/mitigationRobustness.js';
import { buildAssuranceReport } from '../../app/core/domain/assurance.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const input = { currentLow: 20, currentHigh: 80, proposedLow: 5, proposedHigh: 40, incrementalCost: 500, horizonDays: 30 };
const source = { id: 'case-1', status: 'open', financial: { optimistic: 1000, mostLikely: 4000, pessimistic: 10000, mitigationCost: 900, currency: 'DKK' } };
const clone = (x) => JSON.parse(JSON.stringify(x));
function harness(options = {}) {
  const data = new Map(); let sequence = 0; let writes = 0;
  const storage = { getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { writes++; if (options.failSave?.()) throw new Error('Disk full'); data.set(k, v); },
    removeItem: (k) => data.delete(k) };
  const idFactory = (p) => `${p}-rob-${++sequence}`;
  const store = createStore({ storage, now: () => NOW, idFactory, crypto: webcrypto, kdfIterations: 1000, minKdfIterations: 10, ...(options.rules ? { postCommitRules: options.rules } : {}) });
  store.load();
  const api = createApi(store, { now: () => NOW, idFactory });
  assert.equal(api.addPerson({ name: 'Ada', role: 'Operations' }).ok, true);
  const c = api.addCase({ title: 'Supplier production delay', kind: 'incident', financial: source.financial });
  assert.equal(c.ok, true, c.error);
  const caseId = c.id; const ownerId = store.state.people[0].id;
  const request = (assumptions = input) => {
    const report = analyzeMitigationRobustness(store.state.cases.find((row) => row.id === caseId), assumptions);
    return { caseId, ownerId, input: assumptions, expectedRevision: store.state.meta.revision, evidenceKey: robustnessEvidenceKey(caseId, report, ownerId) };
  };
  return { store, api, data, storage, caseId, ownerId, request, writes: () => writes };
}

test('strict inputs abstain on missing, nonfinite, reversed or ill-typed assumptions; zero is explicit', () => {
  for (const bad of [null, false, [], 'text']) assert.equal(normalizeRobustnessInput(bad).ok, false);
  assert.equal(analyzeMitigationRobustness(null, input).ok, false);
  for (const patch of [{ currentLow: '' }, { currentLow: ' ' }, { currentLow: null }, { currentLow: false },
    { currentLow: [] }, { currentLow: {} }, { currentHigh: Infinity }, { proposedHigh: 101 },
    { currentLow: 90 }, { proposedLow: 50 }, { incrementalCost: -1 }, { incrementalCost: 1e13 },
    { horizonDays: 0 }, { horizonDays: 2.5 }, { horizonDays: 3651 }]) {
    assert.equal(normalizeRobustnessInput({ ...input, ...patch }).ok, false, JSON.stringify(patch));
  }
  assert.equal(normalizeRobustnessInput({ ...input, currentLow: 0, incrementalCost: 0 }).ok, true);
  assert.equal(analyzeMitigationRobustness({}, input).ok, false);
  for (const financial of [{}, { optimistic: 10, mostLikely: 5, pessimistic: 20 }, { optimistic: 0, mostLikely: 0, pessimistic: 0 },
    { optimistic: 0, mostLikely: 1, pessimistic: Infinity }, { optimistic: '0', mostLikely: 1, pessimistic: 2 }]) {
    assert.equal(analyzeMitigationRobustness({ financial }, input).ok, false);
  }
});

test('eight-corner Savage regret is exact when ranges overlap (including an intervention that could worsen events)', () => {
  const r = analyzeMitigationRobustness(source, input);
  assert.equal(r.ok, true);
  assert.equal(r.savingLow, -2500); assert.equal(r.savingHigh, 7000);
  assert.equal(r.holdRegret, 7000); assert.equal(r.proposedRegret, 2500);
  assert.equal(r.preference, 'Proposed mitigation'); assert.equal(r.verdict, 'Evidence-sensitive');
  assert.equal(r.perfectInformationCeiling, 2500);
  assert.equal(r.possibleBreakEvenLoss, 666.67); assert.equal(r.guaranteedBreakEvenLoss, null);
  assert.equal(r.possibleCostCeiling, 7500); assert.equal(r.guaranteedCostCeiling, -2000);
  assert.equal(r.grid.length, 25);
  assert.equal(r.grid[0].current, 20); assert.equal(r.grid.at(-1).proposed, 40);
});

test('constrained effects solve exact feasible probability and conditional-loss polytopes, not their impossible rectangle', () => {
  const effects = { ...input, constrainEffects: true, probabilityReductionLow: 20, probabilityReductionHigh: 50,
    conditionalLossChangeLow: -1000, conditionalLossChangeHigh: 1000 };
  const r = analyzeMitigationRobustness(source, effects);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.feasibleVertexCounts, { probabilities: 5, conditionalLosses: 4 });
  assert.equal(r.proposedLossLow, 0); assert.equal(r.proposedLossHigh, 11000);
  assert.equal(r.savingLow, -700); assert.equal(r.savingHigh, 4800);
  assert.equal(r.holdRegret, 4800); assert.equal(r.proposedRegret, 700);
  assert.equal(r.perfectInformationCeiling, 700);
  assert.equal(r.possibleBreakEvenLoss, null); assert.match(r.breakEvenScope, /severity changes/);
  assert.ok(r.grid.length <= 31);
  for (const row of r.grid) assert.ok(row.current - row.proposed >= 20 - 1e-9 && row.current - row.proposed <= 50 + 1e-9);
  assert.match(robustnessBrief(r), /exact vertex enumeration/);
  assert.match(robustnessBrief(r), /proposed conditional loss/);
  assert.equal(analyzeMitigationRobustness(source, { ...effects, probabilityReductionLow: 90, probabilityReductionHigh: 100 }).ok, false);
  assert.equal(analyzeMitigationRobustness(source, { ...effects, conditionalLossChangeLow: -20000, conditionalLossChangeHigh: -15000 }).ok, false);
});

test('constrained vertex bounds contain dense deterministic samples from feasible dependent effects', () => {
  let seed = 917;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 80; trial++) {
    const reductionLow = -20 + rand() * 60;
    const reductionHigh = reductionLow + rand() * (75 - reductionLow);
    const lossChangeLow = -5000 * rand();
    const lossChangeHigh = 5000 * rand();
    const spec = { ...input, constrainEffects: true, probabilityReductionLow: reductionLow,
      probabilityReductionHigh: reductionHigh, conditionalLossChangeLow: lossChangeLow,
      conditionalLossChangeHigh: lossChangeHigh };
    const r = analyzeMitigationRobustness(source, spec);
    assert.equal(r.ok, true, r.error);
    let accepted = 0;
    for (let n = 0; n < 1000; n++) {
      const current = 20 + rand() * 60; const proposed = 5 + rand() * 35;
      const currentLoss = 1000 + rand() * 9000;
      const deltaLoss = lossChangeLow + rand() * (lossChangeHigh - lossChangeLow);
      if (current - proposed < reductionLow || current - proposed > reductionHigh || currentLoss + deltaLoss < 0) continue;
      accepted++;
      const value = (current * currentLoss - proposed * (currentLoss + deltaLoss)) / 100 - input.incrementalCost;
      assert.ok(value >= r.savingLow - 0.00501 && value <= r.savingHigh + 0.00501,
        `trial ${trial}: ${value} outside ${r.savingLow}..${r.savingHigh}`);
    }
    assert.ok(accepted > 0, 'fixture samples a feasible point');
  }
});

test('basic numeric replay keys preserve their historical format; constrained effects get distinct keys', () => {
  const basic = analyzeMitigationRobustness(source, input);
  const legacy = JSON.stringify(['case-1', 'owner-1', 'DKK', 1000, 4000, 10000, 20, 80, 5, 40, 500, 30]);
  assert.equal(robustnessEvidenceKey('case-1', basic, 'owner-1'), legacy);
  const effects = analyzeMitigationRobustness(source, { ...input, constrainEffects: true,
    probabilityReductionLow: 20, probabilityReductionHigh: 50,
    conditionalLossChangeLow: -1000, conditionalLossChangeHigh: 1000 });
  assert.notEqual(robustnessEvidenceKey('case-1', effects, 'owner-1'), legacy);
});

test('dominance, equality, zero cost, collapsed ranges and unrounded close calls are distinct', () => {
  const r = analyzeMitigationRobustness(source, { ...input, currentLow: 80, proposedHigh: 10, incrementalCost: 100 });
  assert.equal(r.verdict, 'Proposed dominates'); assert.equal(r.savingLow, 600);
  assert.equal(r.guaranteedBreakEvenLoss, 142.86);
  assert.equal(r.perfectInformationCeiling, 0);
  const hold = analyzeMitigationRobustness(source, { ...input, currentLow: 0, currentHigh: 0, proposedLow: 10, proposedHigh: 10 });
  assert.equal(hold.verdict, 'Hold dominates'); assert.equal(hold.grid.length, 1);
  const equal = analyzeMitigationRobustness(source, { ...input, currentLow: 20, currentHigh: 20, proposedLow: 20, proposedHigh: 20, incrementalCost: 0 });
  assert.equal(equal.verdict, 'Equivalent'); assert.equal(equal.preference, 'Tie');
  const tiny = analyzeMitigationRobustness({ financial: { optimistic: 1, mostLikely: 1, pessimistic: 1 } },
    { ...input, currentLow: 50, currentHigh: 50, proposedLow: 49.9, proposedHigh: 49.9, incrementalCost: 0 });
  assert.equal(tiny.savingLow, 0); // shown to cents, but NOT classified as a tie
  assert.equal(tiny.verdict, 'Proposed dominates'); assert.equal(tiny.preference, 'Proposed mitigation');
});

test('corner bounds contain a dense deterministic sample over 100 independent uncertainty boxes', () => {
  let seed = 42;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 100; trial++) {
    const [a, b] = [rand() * 100, rand() * 100].sort((x, y) => x - y);
    const [c, d] = [rand() * 100, rand() * 100].sort((x, y) => x - y);
    const spec = { ...input, currentLow: a, currentHigh: b, proposedLow: c, proposedHigh: d, incrementalCost: rand() * 2000 };
    const r = analyzeMitigationRobustness(source, spec);
    assert.equal(r.ok, true);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 6; k++) {
      const value = (1000 + 9000 * k / 5) * ((a + (b - a) * i / 5 - c - (d - c) * j / 5) / 100) - spec.incrementalCost;
      assert.ok(value >= r.savingLow - 0.00501 && value <= r.savingHigh + 0.00501);
    }
  }
});

test('no FMEA dependency, no sunk-cost reuse, deterministic pure output, narrative-free brief', () => {
  const s = { ...clone(source), title: 'PRIVATE TITLE', summary: 'SECRET NARRATIVE', fmea: { probability: 10 } };
  const before = JSON.stringify(s); const r = analyzeMitigationRobustness(s, input);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(r, analyzeMitigationRobustness({ ...s, fmea: {}, financial: { ...s.financial, mitigationCost: 1e9 } }, input));
  assert.doesNotMatch(robustnessBrief(r), /PRIVATE|SECRET|case-1/);
  assert.match(robustnessBrief(r), /eight corners/);
  assert.match(robustnessBrief(r), /not EVSI|Not EVSI/);
});

test('one human request propagates into DACI + owned evidence task + coaching + typed links + derived decision tempo in one write', () => {
  const h = harness(); const beforeWrites = h.writes();
  const beforeCase = clone(h.store.state.cases[0]);
  const r = h.api.requestMitigationReview(h.request());
  assert.equal(r.ok, true, r.error); assert.equal(r.saved, true); assert.equal(r.existing, false);
  assert.equal(h.writes(), beforeWrites + 1, 'one atomic store write');
  assert.deepEqual(h.store.state.cases[0], beforeCase, 'never apply residuals or spend money');
  const d = h.store.state.decisions.find((row) => row.id === r.id);
  assert.equal(d.driver, 'Ada'); assert.equal(d.chosen, ''); assert.equal(d.options.length, 3);
  assert.match(d.question, /Current event probability 20–80%/);
  assert.match(d.question, /Conditional loss.*1000 \/ 4000 \/ 10000/);
  assert.match(d.question, /no mitigation applied/); assert.ok(d.question.length <= 2000);
  const task = h.store.state.delegations.find((row) => row.title.startsWith('Verify mitigation'));
  assert.equal(task.personId, h.ownerId); assert.equal(task.authority, 'recommend');
  assert.equal(task.dueOn, '2026-11-04'); assert.match(task.expectedOutcome, /exposure denominator/);
  assert.ok(h.store.state.people[0].talkingPoints.some((text) => text.includes(`[ROB:${r.id}]`)));
  assert.equal(h.store.state.links.filter((row) => row.ruleId === ROBUSTNESS_RULE_ID).length, 4);
  const graph = buildAssuranceReport(h.store.state);
  assert.equal(graph.findings.length, 0);
  assert.ok(h.store.state.tempoSchedules.some((row) => row.decisionId === r.id), 'derived decision.created reaches tempo without new glue');
  const metrics = h.store.lastPropagationMetrics;
  assert.ok(metrics.pairs.some((row) => row.rule === 'decisionTempoRule' && row.event === 'decision.created' && row.status === 'applied'));
  assert.equal(h.store.state.propagationReceipts.length, 0);
});

test('constrained assumptions propagate through the existing decision, verifier, coaching and tempo spine', () => {
  const h = harness();
  const assumptions = { ...input, constrainEffects: true, probabilityReductionLow: 20,
    probabilityReductionHigh: 50, conditionalLossChangeLow: -1000, conditionalLossChangeHigh: 1000 };
  const report = analyzeMitigationRobustness(h.store.state.cases[0], assumptions);
  const result = h.api.requestMitigationReview(h.request(assumptions));
  assert.equal(result.ok, true, result.error);
  const question = h.store.state.decisions.find((row) => row.id === result.id).question;
  assert.match(question, /current-minus-proposed event probability 20 to 50 percentage points/);
  assert.match(question, /proposed-minus-current conditional loss -1000 to 1000/);
  assert.match(question, /Feasible proposed conditional loss: 0 to 11000/);
  assert.ok(question.length < 2000);
  assert.equal(h.store.state.delegations.length, 1);
  assert.ok(h.store.state.people[0].talkingPoints.some((text) => text.includes('[ROB:')));
  assert.ok(h.store.state.tempoSchedules.some((row) => row.decisionId === result.id));
  assert.ok(report.feasibleVertexCounts.probabilities > 0);
});

test('captured numeric basis, ownership and idempotence survive normalization/reload without schema changes', () => {
  const h = harness(); const first = h.api.requestMitigationReview(h.request());
  const d = clone(h.store.state.decisions.find((row) => row.id === first.id));
  h.store.load(); assert.deepEqual(h.store.warnings, []);
  assert.deepEqual(h.store.state.decisions.find((row) => row.id === first.id), d);
  const before = JSON.stringify(h.store.state); const writes = h.writes();
  const repeat = h.api.requestMitigationReview(h.request());
  assert.equal(repeat.ok, true); assert.equal(repeat.existing, true); assert.equal(repeat.id, first.id);
  assert.equal(JSON.stringify(h.store.state), before); assert.equal(h.writes(), writes);
  const req = h.request();
  const revisedInput = { ...input, proposedHigh: 30 };
  const report = analyzeMitigationRobustness(h.store.state.cases[0], revisedInput);
  const changed = h.api.requestMitigationReview({ ...req, input: revisedInput, evidenceKey: robustnessEvidenceKey(h.caseId, report, h.ownerId) });
  assert.equal(changed.ok, true); assert.notEqual(changed.id, first.id);
  assert.equal(h.store.state.decisions.find((row) => row.id === first.id).question, d.question, 'new request never rewrites the earlier assumptions');
});

test('stale revision, edited numeric basis, missing/archived owner, paused/closed case fail without writes', () => {
  for (const variant of ['revision', 'basis', 'owner', 'archived', 'paused', 'closed', 'blocked']) {
    const h = harness(); const req = h.request();
    if (variant === 'revision') req.expectedRevision--;
    if (variant === 'basis') req.input = { ...input, incrementalCost: 501 };
    if (variant === 'owner') req.ownerId = 'missing';
    if (variant === 'archived') h.store.state.people[0].status = 'archived';
    if (variant === 'paused') h.store.state.cases[0].autoPropagate = false;
    if (variant === 'closed') h.store.state.cases[0].status = 'resolved';
    if (variant === 'blocked') {
      // An unsupported workspace is deliberately write-blocked by the real store.
      h.data.set(h.store.storageKey, JSON.stringify({ schemaVersion: 99999, people: [] })); h.store.load();
    }
    const before = JSON.stringify(h.store.state); const writes = h.writes();
    assert.equal(h.api.requestMitigationReview(req).ok, false, variant);
    assert.equal(JSON.stringify(h.store.state), before, variant); assert.equal(h.writes(), writes, variant);
  }
});

test('full talking-point queue is preserved; short horizon gives an earlier verification due date', () => {
  const h = harness(); const topics = Array.from({ length: 12 }, (_, i) => `Employee topic ${i}`);
  h.store.state.people[0].talkingPoints = topics.slice();
  const small = { ...input, horizonDays: 2 };
  const report = analyzeMitigationRobustness(h.store.state.cases[0], small);
  const r = h.api.requestMitigationReview({ ...h.request(), input: small, evidenceKey: robustnessEvidenceKey(h.caseId, report, h.ownerId) });
  assert.equal(r.ok, true);
  assert.deepEqual(h.store.state.people[0].talkingPoints, topics);
  assert.ok(r.propagations.some((p) => p.action === 'skipped'));
  assert.equal(h.store.state.delegations.find((d) => d.title.startsWith('Verify mitigation')).dueOn, '2026-10-30');
});

test('save failure is disclosed, not called saved; a failed rule creates a receipt without partial cross-module writes', () => {
  let failed = false;
  const h = harness({ failSave: () => failed }); failed = true;
  const r = h.api.requestMitigationReview(h.request());
  assert.equal(r.ok, true); assert.equal(r.saved, false); assert.match(h.store.persistError, /Disk full/);
  const state = createEmptyState(NOW.toISOString());
  state.cases.push(clone(source)); state.people.push({ id: 'owner', name: 'Ada', status: 'active', talkingPoints: [] });
  const report = analyzeMitigationRobustness(source, input);
  const event = { type: ROBUSTNESS_EVENT, entity: 'case', entityId: source.id,
    automationOptions: { input, ownerId: 'owner', evidenceKey: robustnessEvidenceKey(source.id, report, 'owner') } };
  let count = 0;
  runPostCommitRules(state, { event, now: NOW, rules: [mitigationReviewRule], idFactory: (p) => {
    if (++count === 3) throw new Error('Injected ID failure'); return `${p}-${count}`;
  }, logEvent: (e) => state.events.push(e) });
  assert.equal(state.decisions.length, 0); assert.equal(state.delegations.length, 0);
  assert.equal(state.links.length, 0); assert.equal(state.people[0].talkingPoints.length, 0);
  assert.equal(state.propagationReceipts.length, 1); assert.equal(state.propagationReceipts[0].rule, 'mitigationReviewRule');
  assert.ok(state.events.some((e) => e.type === 'automation.rule_error'));
  assert.equal(state.events.some((e) => e.type === 'automation.propagated'), false);
});

test('registry contains the rule; unrelated events and changed replay evidence cannot commission work', () => {
  assert.ok(DEFAULT_POST_COMMIT_RULES.includes(mitigationReviewRule));
  const state = createEmptyState(NOW.toISOString());
  assert.deepEqual(mitigationReviewRule(state, { event: { type: 'case.updated' } }), []);
  state.cases.push(clone(source)); state.people.push({ id: 'owner', name: 'Ada', status: 'active' });
  assert.throws(() => mitigationReviewRule(state, { event: { type: ROBUSTNESS_EVENT, entityId: source.id,
    automationOptions: { input, ownerId: 'owner', evidenceKey: 'old-numbers' } }, now: NOW }), /evidence changed/);
  assert.equal(state.decisions.length, 0);
  const report = analyzeMitigationRobustness(source, input);
  assert.equal(robustnessDecision(state, robustnessEvidenceKey(source.id, report, 'owner')), null);
});

function mountPanel(h) {
  const dom = new JSDOM('<!doctype html><html lang="en"><head><title>LeadOS</title></head><body><main id="view"></main><div id="modal-root"></div><div id="toast-root"></div></body></html>',
    { url: 'https://leados.test/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const previous = {};
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    previous[key] = globalThis[key]; globalThis[key] = key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key];
  }
  const panel = mitigationRobustnessPanel({ state: h.store.state, api: h.api, now: NOW });
  dom.window.document.querySelector('#view').append(panel);
  const doc = dom.window.document;
  const fill = () => {
    doc.querySelector('#robustness-case').value = h.caseId;
    doc.querySelector('#robustness-owner').value = h.ownerId;
    for (const [key, value] of Object.entries(input)) doc.querySelector(`#robustness-${key}`).value = value;
  };
  const submit = () => doc.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  return { dom, doc, fill, submit, restore: () => { dom.window.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('UI starts blank, analyzes without writes, invalidates export and commissioning on changed inputs', () => {
  const h = harness(); const env = mountPanel(h);
  try {
    const doc = env.doc;
    for (const field of doc.querySelectorAll('input[type="number"]')) assert.equal(field.value, '');
    assert.equal(doc.querySelector('#robustness-constrainEffects').checked, false);
    const named = [...doc.querySelectorAll('input,select')];
    for (const control of named) assert.ok(doc.querySelector(`label[for="${control.id}"]`));
    const before = JSON.stringify(h.store.state);
    env.fill(); env.submit();
    assert.match(doc.querySelector('[data-testid="robustness-output"]').textContent, /Evidence-sensitive/);
    assert.equal(JSON.stringify(h.store.state), before);
    const commission = [...doc.querySelectorAll('button')].find((b) => b.textContent === 'Commission evidence review');
    const exp = [...doc.querySelectorAll('button')].find((b) => b.textContent === 'Export numeric brief');
    assert.equal(commission.disabled, false); assert.equal(exp.disabled, false);
    doc.querySelector('#robustness-currentLow').dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
    assert.equal(commission.disabled, true); assert.equal(exp.disabled, true);
    assert.equal(doc.querySelector('[data-testid="robustness-output"]').textContent, '');
  } finally { env.restore(); }
});

test('UI confirmation commissions real work, exposes working routes, and preserves numeric basis on reload', async () => {
  const h = harness(); const env = mountPanel(h);
  try {
    env.fill(); env.submit();
    [...env.doc.querySelectorAll('button')].find((b) => b.textContent === 'Commission evidence review').click();
    const confirm = [...env.doc.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Create linked review');
    assert.ok(confirm); confirm.click();
    await new Promise((r) => setTimeout(r, 0));
    const link = [...env.doc.querySelectorAll('a')].find((a) => a.textContent === 'Open captured decision');
    assert.ok(link); assert.match(link.getAttribute('href'), /^#\/decisions\?decision=/);
    assert.match(env.doc.querySelector('[data-testid="robustness-output"]').textContent, /Saved locally/);
    h.store.load(); assert.deepEqual(h.store.warnings, []);
    assert.equal(h.store.state.decisions.filter((d) => d.title.startsWith('Evidence gate')).length, 1);
  } finally { env.restore(); }
});

test('UI exposes linked effect bounds accessibly and invalidates stale analysis when toggled', () => {
  const h = harness(); const env = mountPanel(h);
  try {
    env.fill();
    const toggle = env.doc.querySelector('#robustness-constrainEffects');
    toggle.checked = true; toggle.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }));
    for (const [key, value] of Object.entries({ probabilityReductionLow: 20, probabilityReductionHigh: 50,
      conditionalLossChangeLow: -1000, conditionalLossChangeHigh: 1000 })) {
      const field = env.doc.querySelector(`#robustness-${key}`);
      field.value = value; field.dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
    }
    env.submit();
    assert.match(env.doc.querySelector('[data-testid="robustness-output"]').textContent, /Feasible proposed conditional loss range: 0 to 11000/);
    assert.match(env.doc.querySelector('[data-testid="robustness-output"]').textContent, /Not a single-valued threshold/);
    assert.equal([...env.doc.querySelectorAll('button')].find((b) => b.textContent === 'Commission evidence review').disabled, false);
    toggle.checked = false; toggle.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }));
    assert.equal([...env.doc.querySelectorAll('button')].find((b) => b.textContent === 'Commission evidence review').disabled, true);
  } finally { env.restore(); }
});

test('UI populated and sparse states pass axe structural accessibility; no forced owner or invented probabilities', async () => {
  for (const sparse of [false, true]) {
    const h = sparse ? { store: { state: createEmptyState(NOW.toISOString()) }, api: {} } : harness();
    const env = mountPanel(h);
    try {
      if (!sparse) { env.fill(); env.submit(); }
      env.dom.window.eval(fs.readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8'));
      const result = await env.dom.window.axe.run(env.doc.querySelector('#view'), { rules: { 'color-contrast': { enabled: false } } });
      assert.equal(result.violations.length, 0, JSON.stringify(result.violations.map((v) => v.id)));
      if (sparse) assert.match(env.doc.querySelector('#view').textContent, /Add a verification owner/);
    } finally { env.restore(); }
  }
});


test('encrypted commissioning is queued truthfully, persists only ciphertext, and reloads after unlock', async () => {
  const h = harness();
  const password = 'Robustness-test-passphrase-123';
  assert.equal((await h.store.enableEncryption(password)).ok, true);
  const result = h.api.requestMitigationReview(h.request());
  assert.equal(result.ok, true, result.error); assert.equal(result.savePending, true);
  await h.store.flush(); assert.equal(h.store.persistError, null);
  const raw = h.data.get(h.store.storageKey);
  assert.doesNotMatch(raw, /RULE-ROB-01|Supplier production delay|Current event probability/);
  await h.store.lock(); assert.equal(h.store.isLocked, true);
  assert.equal((await h.store.unlock(password)).ok, true);
  assert.ok(h.store.state.decisions.some((d) => d.id === result.id));
  assert.match(h.store.state.decisions.find((d) => d.id === result.id).question, /Current event probability 20–80%/);
});

test('missing automation subscriber cannot return a false commissioning success', () => {
  const h = harness({ rules: [] });
  const result = h.api.requestMitigationReview(h.request());
  assert.equal(result.ok, false); assert.match(result.error, /did not complete/);
  assert.equal(h.store.state.decisions.length, 0); assert.equal(h.store.state.delegations.length, 0);
});

test('UI ignores a confirmation after assumptions change while the modal is open', async () => {
  const h = harness(); const env = mountPanel(h);
  try {
    env.fill(); env.submit(); const before = JSON.stringify(h.store.state);
    [...env.doc.querySelectorAll('button')].find((b) => b.textContent === 'Commission evidence review').click();
    env.doc.querySelector('#robustness-horizonDays').dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
    [...env.doc.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Create linked review').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(JSON.stringify(h.store.state), before);
  } finally { env.restore(); }
});
