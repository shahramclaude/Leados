/**
 * tests/app/agenda-provenance.test.mjs — the 1:1 Agenda Provenance Ledger
 * (`#/agenda`, ADR-0113, Session 153, Schema v112).
 *
 * The feature exists because a frontline lead's waiting list is mostly
 * software-written prompts and the person's own topic is buried inside them.
 * These tests pin the four claims that make the ledger trustworthy:
 *
 *   1. PROVENANCE IS DECLARED AND HONEST — every prompt is classified by the
 *      family table; an unclassifiable prompt is `unclassified` and counted,
 *      never credited to the person.
 *   2. A RECEIPT IS DERIVED, NOT TICKED — raised only when a HELD 1:1 on/after
 *      the filing covers the exact prompt; a missing 1:1 is `open`, never a miss.
 *   3. THE CAP IS SURFACED — the queue read names the line the 12-prompt cap is
 *      about to evict, which is the failure nobody could see before.
 *   4. FILING IS A HUMAN COMMAND, APPEND-ONLY — a filed line cannot be edited or
 *      deleted, only withdrawn with a reason, and the engine never writes one.
 *
 * Plus: the schema additivity (v111 → v112 empty, no back-fill), the identity-free
 * roll-up above director rank, and the writer/family parity that stops a new
 * prompt writer landing without a declared family.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, migrate, normalizeState, SCHEMA_VERSION } from '../../app/core/schema.js';
import { createStore } from '../../app/core/store.js';
import { createApi } from '../../app/actions.js';
import {
  buildAgendaLedger, buildAgendaPlan, entryStatus, personQueue, wilsonInterval,
} from '../../app/core/domain/agendaProvenance.js';
import {
  AGENDA_FAMILIES, AGENDA_LIMITS, AGENDA_PROMPT_WRITERS, classifyTopic,
} from '../../app/core/domain/agendaProvenanceRegistry.js';
import { AGENDA_SETTINGS_DEFAULTS } from '../../app/core/domain/agendaProvenanceSchema.js';

const NOW = new Date('2026-11-06T09:00:00.000Z');

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

function harness() {
  let seq = 0;
  const idFactory = (prefix) => `${prefix}-a-${++seq}`;
  const store = createStore({ storage: memoryStorage(), now: () => NOW, idFactory });
  store.load();
  return { store, api: createApi(store, { now: () => NOW, idFactory }) };
}

const CASE_PROMPT = 'Case support (Billing migration; ref case-1): review systemic barriers, capacity trade-offs & air-cover needed';
const LEADER_DUTY = 'Classify “Activation rewrite”: is this Core (optimise what exists), Adjacent (nearby ground) or Exploratory? [RULE-ALLOC-04:pf-1]';
const THEIR_TOPIC = 'Wants a decision on the activation definition';

function seed(h) {
  const person = h.api.addPerson({ name: 'Jordan Alvarez', role: 'Product Manager', level: 'senior', team: 'Platform', startDate: '2025-09-01' });
  assert.ok(person.ok, JSON.stringify(person));
  return person.id;
}

/* ------------------------------------------------------- declared vocabulary */

test('every writer of talkingPoints has a declared family (no silent hole)', () => {
  // The parity floor: a rule that writes a prompt with no family in the table
  // would make an engine prompt read as the person's own topic — the exact
  // confusion this ledger exists to remove.
  const declared = new Set(AGENDA_FAMILIES.map((f) => f.owner));
  const missing = AGENDA_PROMPT_WRITERS.filter((rule) => {
    if (declared.has(rule)) return false;
    // A wildcard family (RULE-PERF-*) covers every numbered member.
    return !AGENDA_FAMILIES.some((f) => f.owner.endsWith('*') && rule.startsWith(f.owner.slice(0, -1)));
  });
  assert.deepEqual(missing, [], `every prompt-writing rule needs a declared family: ${missing.join(', ')}`);
  for (const family of AGENDA_FAMILIES) {
    assert.equal(typeof family.owedTo, 'string', `${family.key} declares who owes it`);
    assert.ok(family.pattern instanceof RegExp, `${family.key} declares a marker grammar`);
    assert.ok(family.framework && family.framework.length > 20, `${family.key} names a real framework, not a gesture`);
  }
});

test('classification is declared, and an unrecognised marker is never credited to the person', () => {
  assert.equal(classifyTopic(THEIR_TOPIC).family, 'person-raised');
  assert.equal(classifyTopic(THEIR_TOPIC).owedTo, 'self');
  assert.equal(classifyTopic(CASE_PROMPT).family, 'case-support');
  assert.equal(classifyTopic(CASE_PROMPT).owedTo, 'self');
  assert.equal(classifyTopic(LEADER_DUTY).family, 'horizon-classification');
  assert.equal(classifyTopic(LEADER_DUTY).owedTo, 'above');

  // A prompt carrying an undeclared marker is engine-authored and UNCLASSIFIED.
  const unknown = classifyTopic('Something the engine wrote [RULE-ZZZ-99:abc]');
  assert.equal(unknown.family, 'unknown-marker');
  assert.equal(unknown.owedTo, 'unclassified');
  assert.equal(unknown.engine, true);

  // A `; ref …)` lineage tail is a marker too, even without a bracket.
  assert.equal(classifyTopic('Something odd ; ref case-9)').engine, true);
});

/* ------------------------------------------------------------- queue reading */

test('the queue separates who owes each line and surfaces the 12-cap eviction', () => {
  const prompts = [THEIR_TOPIC, CASE_PROMPT, LEADER_DUTY, 'Negotiation prep (Vendor renewal; ref neg-1): agree the BATNA first'];
  // Pad to the cap so the eviction risk is live — the writers cap at 12.
  // Fillers carry a LEADER-owned marker, so they must not inflate the count of
  // prompts owed to the person — the exact confusion the ledger removes.
  while (prompts.length < AGENDA_LIMITS.queueCap) prompts.push(`Filler engine prompt ${prompts.length} [RULE-PAR-02:x]`);
  const person = { id: 'p1', name: 'Jordan', status: 'active', talkingPoints: prompts };
  const q = personQueue(person);

  assert.equal(q.total, 12);
  assert.equal(q.personRaised, 1, 'only the untagged prompt is theirs');
  assert.equal(q.engine, 11);
  // `self` counts every prompt owed TO the person: their own topic plus the two
  // engine prompts that are genuinely about them. `personRaised` is the subset
  // they wrote themselves.
  // Their own topic + case support + negotiation prep: three prompts owed to
  // them. The seven filler prompts are leader-owned and must NOT land here.
  assert.equal(q.self, 3);
  assert.equal(q.both, 0);
  assert.equal(q.above, 9, 'the classification duty plus the eight leader-owned filler prompts');
  assert.equal(q.atCap, true);
  assert.equal(q.headroom, 0);
  assert.equal(q.rows[0].evictionRisk, true, 'the oldest line is the one the cap will drop');
  assert.equal(q.rows[1].evictionRisk, false);

  // Shortening the list removes the eviction risk: the wall is real, not a label.
  const short = personQueue({ ...person, talkingPoints: prompts.slice(0, 3) });
  assert.equal(short.atCap, false);
  assert.equal(short.rows.some((r) => r.evictionRisk), false);
});

/* ----------------------------------------------------------------- receipts */

test('a receipt is derived from a held 1:1 and a missing 1:1 is never a miss', () => {
  const entry = { id: 'e1', personId: 'p1', prompt: THEIR_TOPIC, filedOn: '2026-10-01', status: 'filed' };

  // No meeting at all and filed long ago: the drift is named, not invented as a
  // miss (`stale`, which is still awaiting, not `dropped`).
  assert.equal(entryStatus(entry, [], NOW).status, 'stale');

  // A SKIPPED meeting is not a fair chance to keep the promise — but a filing
  // that old with no held conversation behind it reads as STALE, not clean.
  const skipped = [{ id: 'm0', personId: 'p1', date: '2026-10-05', status: 'skipped' }];
  assert.equal(entryStatus(entry, skipped, NOW).status, 'stale', 'skipped is not a receipt, and age surfaces the drift');

  // Freshly filed with no held 1:1 yet: open, never a miss.
  const fresh = { ...entry, filedOn: '2026-11-01' };
  assert.equal(entryStatus(fresh, [], NOW).status, 'open');

  // A held meeting BEFORE the filing cannot grade it.
  const earlier = [{ id: 'm1', personId: 'p1', date: '2026-09-20', status: 'held', resolvedTopics: [THEIR_TOPIC] }];
  assert.equal(entryStatus(entry, earlier, NOW).status, 'stale', 'a pre-filing conversation is not a receipt');

  // A held meeting on/after the filing that covered the EXACT prompt: raised.
  const raised = [{ id: 'm2', personId: 'p1', date: '2026-10-08', status: 'held', resolvedTopics: [THEIR_TOPIC] }];
  const r = entryStatus(entry, raised, NOW);
  assert.equal(r.status, 'raised');
  assert.equal(r.raisedVia, 'resolved-topic');
  assert.equal(r.raisedOn, '2026-10-08');

  // Covered as a discussed agenda line also counts.
  const viaAgenda = [{ id: 'm3', personId: 'p1', date: '2026-10-09', status: 'held', agenda: [{ text: THEIR_TOPIC, done: true }] }];
  assert.equal(entryStatus(entry, viaAgenda, NOW).raisedVia, 'agenda-discussed');

  // An agenda line that was NOT discussed does not count.
  const notDiscussed = [{ id: 'm4', personId: 'p1', date: '2026-10-09', status: 'held', agenda: [{ text: THEIR_TOPIC, done: false }] }];
  assert.equal(entryStatus(entry, notDiscussed, NOW).status, 'dropped');

  // A held meeting happened and did not cover it: dropped (a real miss).
  const missed = [{ id: 'm5', personId: 'p1', date: '2026-10-12', status: 'held', resolvedTopics: ['something else'] }];
  assert.equal(entryStatus(entry, missed, NOW).status, 'dropped');

  // Withdrawn is closed, never counted as a miss or a win.
  assert.equal(entryStatus({ ...entry, status: 'withdrawn' }, raised, NOW).status, 'closed');
});

test('the receipt rate is refused below the declared floor and Wilson-bounded above it', () => {
  assert.equal(wilsonInterval(0, 0), null);
  const tiny = wilsonInterval(3, 4);
  assert.ok(tiny.low < 0.76 && tiny.high <= 1, 'a Wilson interval, not a raw share');

  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'p1', name: 'Jordan', status: 'active', talkingPoints: [THEIR_TOPIC] }];
  // Four filed lines, one raised: below the declared floor of five graded lines.
  state.agendaEntries = [1, 2, 3, 4].map((n) => ({ id: `e${n}`, personId: 'p1', prompt: `Prompt ${n}`, filedOn: '2026-10-01', status: 'filed' }));
  state.oneOnOnes = [{ id: 'm1', personId: 'p1', date: '2026-10-05', status: 'held', resolvedTopics: ['Prompt 1'] }];
  const thin = buildAgendaLedger(state, { now: NOW });
  assert.equal(thin.totals.receiptN, 4);
  assert.equal(thin.totals.receiptRatePct, null, 'refused, not printed on four observations');

  // One more graded line crosses the floor: the rate and both bounds appear.
  state.agendaEntries.push({ id: 'e5', personId: 'p1', prompt: 'Prompt 5', filedOn: '2026-10-01', status: 'filed' });
  const thick = buildAgendaLedger(state, { now: NOW });
  assert.equal(thick.totals.receiptN, 5);
  assert.equal(thick.totals.receiptRatePct, 20);
  assert.ok(thick.totals.receiptLowPct < 20 && thick.totals.receiptHighPct > 20);
});

/* ---------------------------------------------------------- build-the-agenda */

test('the agenda plan puts their topic first and the leader’s own duty last', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{
    id: 'p1', name: 'Jordan', status: 'active',
    talkingPoints: [LEADER_DUTY, CASE_PROMPT, THEIR_TOPIC],
  }];
  const plan = buildAgendaPlan(state, 'p1', { now: NOW });
  assert.equal(plan.missing, undefined);
  const order = plan.ordered.map((r) => r.text);
  assert.equal(order[0], THEIR_TOPIC, 'their agenda comes first');
  assert.equal(order.at(-1), LEADER_DUTY, 'the leader’s own span duty is last and separated');
  const groups = plan.groups.map((g) => g.key);
  assert.deepEqual(groups, ['theirs', 'owed-them', 'yours']);
});

/* --------------------------------------------------------- filing and withdraw */

test('filing is a human command inside the span, idempotent, and append-only', () => {
  const h = harness();
  const personId = seed(h);

  // The prompt is not on their list only by accident: file it, and it survives
  // the list being cleared with no live control — the source can vanish.
  const filed = h.api.agendaFile({ personId, prompt: THEIR_TOPIC });
  assert.ok(filed.ok, filed.error);
  assert.equal(filed.owedTo, 'self');
  assert.equal(filed.family, 'person-raised');
  assert.equal(h.store.state.agendaEntries.length, 1);
  assert.equal(h.store.state.agendaEntries[0].status, 'filed');
  assert.equal(h.store.state.agendaEntries[0].filedOn, '2026-11-06');

  // The lineage edge is written in the SAME transaction, typed, and one only.
  const edges = h.store.state.links.filter((l) => l.sourceType === 'agendaentry' && l.relation === 'prepares-for');
  assert.equal(edges.length, 1);
  assert.equal(edges[0].targetType, 'person');
  assert.equal(edges[0].targetId, personId);

  // Filing the same exact prompt again is refused, not duplicated.
  const dup = h.api.agendaFile({ personId, prompt: THEIR_TOPIC });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already filed/i);

  // A prompt shorter than the guard is refused.
  assert.equal(h.api.agendaFile({ personId, prompt: 'a' }).ok, false);

  // Withdraw requires a reason and is append-only: the row survives.
  assert.equal(h.api.agendaWithdraw({ id: h.store.state.agendaEntries[0].id, reason: '' }).ok, false);
  const withdrawn = h.api.agendaWithdraw({ id: h.store.state.agendaEntries[0].id, reason: 'They raised it in the corridor — no meeting needed.' });
  assert.ok(withdrawn.ok, withdrawn.error);
  const row = h.store.state.agendaEntries[0];
  assert.equal(row.status, 'withdrawn');
  assert.equal(row.withdrawnOn, '2026-11-06');
  assert.match(row.note, /corridor/);
  assert.equal(h.store.state.agendaEntries.length, 1, 'withdrawing never deletes the commitment');
  assert.equal(h.api.agendaWithdraw({ id: row.id, reason: 'again' }).ok, false, 'already withdrawn');
});

test('a logged 1:1 with the covered topic turns a filed line into a receipt — derived, never written', () => {
  const h = harness();
  const personId = seed(h);
  const filed = h.api.agendaFile({ personId, prompt: THEIR_TOPIC });
  assert.ok(filed.ok, filed.error);

  // Filing itself writes NO receipt.
  let ledger = buildAgendaLedger(h.store.state, { now: NOW });
  assert.equal(ledger.entries[0].status, 'open');

  const logged = h.api.logOneOnOne({
    personId,
    date: '2026-11-06',
    status: 'held',
    notes: 'Agreed the activation definition; deferred the design budget.',
    resolvedTalkingPoints: [THEIR_TOPIC],
  });
  assert.ok(logged.ok, logged.error);

  ledger = buildAgendaLedger(h.store.state, { now: NOW });
  assert.equal(ledger.entries[0].status, 'raised');
  assert.equal(ledger.entries[0].raisedVia, 'resolved-topic');
  // The stored row is untouched — the receipt lives in the derived read.
  assert.equal(h.store.state.agendaEntries[0].status, 'filed');
});

/* -------------------------------------------------------------- schema v112 */

test('schema v112 is additive: an existing workspace gets empty ledgers and declared conventions', () => {
  assert.equal(SCHEMA_VERSION, 112);
  const migrated = migrate({ schemaVersion: 111, people: [{ id: 'p1', name: 'A' }], settings: { leaderName: 'Dana' } });
  assert.deepEqual(migrated.applied, ['111 → 112']);
  assert.equal(migrated.raw.schemaVersion, 112);
  assert.deepEqual(migrated.raw.agendaEntries, [], 'no filing is invented at upgrade time');
  assert.deepEqual(migrated.raw.agendaMarkers, []);
  assert.equal(migrated.raw.settings.agendaReceiptFloor, AGENDA_SETTINGS_DEFAULTS.agendaReceiptFloor);
  assert.equal(migrated.raw.settings.agendaAutoPropagate, true);
  assert.equal(migrated.raw.settings.leaderName, 'Dana', 'existing settings survive');

  // A second migrate is a no-op: convergence, not a loop.
  assert.deepEqual(migrate(migrated.raw).applied, []);

  // Normalization drops a malformed filing rather than repairing it into a promise.
  const normalized = normalizeState({
    schemaVersion: 112,
    people: [{ id: 'p1', name: 'A', status: 'active' }],
    agendaEntries: [
      { id: 'ok', personId: 'p1', prompt: 'A real prompt', filedOn: '2026-11-01' },
      { id: 'bad-no-prompt', personId: 'p1', filedOn: '2026-11-01' },
      { id: 'bad-no-day', personId: 'p1', prompt: 'x' },
      'not-an-object',
      { id: 'ok', personId: 'p1', prompt: 'A real prompt', filedOn: '2026-11-01' },
    ],
  }, { now: NOW });
  assert.equal(normalized.state.agendaEntries.length, 1, 'only the well-formed filing survives, deduped');
  assert.equal(normalized.state.agendaEntries[0].id, 'ok');
  assert.ok(normalized.warnings.some((w) => /Agenda ledger/.test(w)));
});

/* ---------------------------------------------------------------- roll-up */

test('the roll-up is identity-free above director rank and named inside the boundary', () => {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{ id: 'p1', name: 'Jordan Alvarez', status: 'active', talkingPoints: [THEIR_TOPIC, LEADER_DUTY] }];
  state.agendaEntries = [{ id: 'e1', personId: 'p1', prompt: THEIR_TOPIC, filedOn: '2026-10-01', status: 'filed' }];
  state.oneOnOnes = [{ id: 'm1', personId: 'p1', date: '2026-10-02', status: 'held', resolvedTopics: [THEIR_TOPIC] }];

  const h = harness();
  h.store.state.people = state.people;
  h.store.state.agendaEntries = state.agendaEntries;
  h.store.state.oneOnOnes = state.oneOnOnes;

  const roll = h.api.agendaRollUp();
  assert.ok(roll.ok, roll.error);
  // The identity guard is a function of RANK, and it is the thing that matters:
  // whatever seat resolves here, the roll-up's disclosure form must follow it.
  assert.equal(typeof roll.roll.rank, 'number');
  assert.equal(roll.roll.identityFree, roll.roll.rank >= 4);
  assert.equal(roll.roll.rows.length, roll.roll.identityFree ? 0 : 1, 'named rows exist only inside the detail boundary');

  const brief = h.api.agendaBriefText();
  assert.ok(brief.ok);
  // The upward brief is identity-free by construction: no prompt, no person name,
  // no conversation detail — only counts, shares and refusals.
  assert.ok(!brief.text.includes(THEIR_TOPIC), 'the brief never carries a prompt');
  assert.ok(!brief.text.includes('Jordan'), 'the brief never carries a person');
  assert.ok(!brief.text.includes('billing') && !brief.text.includes('Case support'), 'no conversation detail travels up');
  assert.match(brief.text, /1:1 agenda discipline/);
});

test('attention counts only what is genuinely drifting: stale lines and lists at the cap', () => {
  const h = harness();
  const personId = seed(h);
  const prompts = [];
  while (prompts.length < AGENDA_LIMITS.queueCap) prompts.push(`Prompt ${prompts.length} [RULE-PERF-01:x]`);
  h.store.update((draft) => { draft.people[0].talkingPoints = prompts; });

  // At the cap only, with nothing filed: one item of attention.
  assert.equal(h.api.agendaAttentionCount(), 1);

  // Filing a prompt today is not drift; the same line filed long ago is.
  const filed = h.api.agendaFile({ personId, prompt: prompts[0] });
  assert.ok(filed.ok, filed.error);
  assert.equal(h.api.agendaAttentionCount(), 1);
  h.store.update((draft) => { draft.agendaEntries[0].filedOn = '2026-09-01'; });
  assert.equal(h.api.agendaAttentionCount(), 2, 'a stale filing plus a capped list');
});
