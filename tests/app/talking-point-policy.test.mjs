/**
 * ADR-0134 — one declared retention policy for the 1:1 waiting list.
 *
 * These tests pin the two live defects the session reproduced against the
 * shipped code before any change, and the policy that closes them:
 *
 *  1. WRITE-THEN-DELETE. Rules append at the end and bound themselves with
 *     `.slice(-30)`; `normalizeTalkingPoints` kept the FIRST twelve. So a prompt
 *     a rule wrote today was deleted by the next reload — silently.
 *  2. THE BADGE DESCRIBED THE WRONG LINE. The agenda ledger asserted the queue
 *     "truncates from the OLDEST end" and flagged row 0, which under the real
 *     storage rule always survived.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, normalizeState, applyTalkingPointPolicy, normalizeTalkingPoints } from '../../app/core/schema.js';
import {
  TALKING_QUEUE_CAP, isEngineAuthored, retainQueue, nextEvictedIndex, queueCapSentence,
} from '../../app/core/domain/talkingPointPolicy.js';
import { personQueue, buildAgendaPlan } from '../../app/core/domain/agendaProvenance.js';
import { AGENDA_LIMITS } from '../../app/core/domain/agendaProvenanceRegistry.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');
const ENGINE = (n) => `Engine prompt ${n} [RULE-PAR-02:x]`;
const space = (n) => Array.from({ length: n }, (_, i) => `Personal topic ${i + 1}`);

function workspaceWith(talkingPoints, name = 'Ari Klein') {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{
    id: 'p1', name, role: 'ic', level: 'ic', managerId: null, status: 'active',
    createdAt: NOW.toISOString(), talkingPoints,
  }];
  return normalizeState(state, { now: NOW });
}

/* --------------------------------------------------------- the declared cap */

test('the cap is declared once and read by both storage and the ledger', () => {
  assert.equal(TALKING_QUEUE_CAP, 12);
  assert.equal(AGENDA_LIMITS.queueCap, TALKING_QUEUE_CAP,
    'the ledger must read the same cap the storage layer enforces — one number, one place');
});

test('authorship is detected by the registry grammar, not by heuristics of mood', () => {
  assert.equal(isEngineAuthored('On-call load is not sustainable'), false);
  assert.equal(isEngineAuthored('Case support (Billing) [RULE-COACH-01:c1]'), true);
  assert.equal(isEngineAuthored('Something odd ; ref case-9)'), true);
});

/* ---------------------------------------------------- defect 1: write-then-delete */

test('DEFECT 1: a prompt a rule just wrote is no longer deleted by the next reload', () => {
  // Exactly the reproduction, with the realistic mix: a full list where the
  // newest arrival is a prompt a RULE appended (the writers end with slice(-30)).
  const written = [...Array.from({ length: 12 }, (_, i) => ENGINE(i + 1)), 'Case support (Billing) [RULE-COACH-01:c1]'];
  const { state, warnings } = workspaceWith(written);
  const stored = state.people[0].talkingPoints;

  assert.equal(stored.length, TALKING_QUEUE_CAP, 'the cap still holds');
  assert.ok(stored.includes('Case support (Billing) [RULE-COACH-01:c1]'),
    'the prompt the rule wrote survives the load — this failed before ADR-0134');
  assert.ok(!stored.includes(ENGINE(1)), 'the OLDEST engine prompt paid for it');
  assert.equal(warnings.filter((w) => w.includes('1:1 waiting lists')).length, 1,
    'and the leader was told, rather than losing a line in silence');

  const kept = retainQueue(written);
  assert.equal(kept.keep.length, TALKING_QUEUE_CAP);
  assert.equal(kept.droppedN, written.length - TALKING_QUEUE_CAP);
});

test('DEFECT 1b: newest engine prompts are preserved; the oldest engine prompt is displaced', () => {
  // A realistic queue: one topic of theirs plus a long engine backlog.
  const list = ['Their own topic', ...Array.from({ length: 14 }, (_, i) => ENGINE(i + 1))];
  const { state } = workspaceWith(list);
  const stored = state.people[0].talkingPoints;

  assert.equal(stored.length, TALKING_QUEUE_CAP);
  assert.ok(stored.includes('Their own topic'), 'the person’s own words are never evicted first');
  assert.ok(stored.includes(ENGINE(14)), 'the newest engine prompt survives');
  assert.ok(!stored.includes(ENGINE(1)), 'the oldest engine prompt is the one displaced');
  assert.ok(!stored.includes(ENGINE(3)));
});

test('DEFECT 1c: a person’s own topics claim capacity before any engine prompt', () => {
  // Eight topics of theirs arriving alongside a big engine backlog: all eight
  // must be kept, and engine prompts fill only the remaining slots.
  const topics = Array.from({ length: 8 }, (_, i) => `What I want to raise ${i + 1}`);
  const list = [...topics, ...Array.from({ length: 10 }, (_, i) => ENGINE(i + 1))];
  const kept = retainQueue(list).keep;

  assert.equal(kept.filter((l) => topics.includes(l)).length, 8, 'all eight of theirs survive');
  assert.equal(kept.length, TALKING_QUEUE_CAP);
  assert.ok(!kept.includes(ENGINE(1)), 'the engine backlog pays for them');
});

test('survivors keep their original order — the policy decides membership, never presentation', () => {
  const list = [...space(6), ...Array.from({ length: 6 }, (_, i) => ENGINE(i + 1))];
  const kept = retainQueue(list).keep;
  const indices = kept.map((l) => list.indexOf(l));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b), 'relative order preserved');
});

/* --------------------------------------------- defect 1d: dropped is never silent */

test('DEFECT 1d: what the cap refuses is RETURNED and warned about, never swallowed', () => {
  const many = Array.from({ length: 20 }, (_, i) => `topic ${i + 1}`);
  const policy = applyTalkingPointPolicy(many);
  assert.equal(policy.kept.length, TALKING_QUEUE_CAP);
  assert.equal(policy.droppedN, 20 - TALKING_QUEUE_CAP);
  assert.ok(policy.sentence, 'a sentence is produced when anything is dropped');
  assert.equal(applyTalkingPointPolicy(space(3)).sentence, null, 'nothing dropped, nothing claimed');

  const { warnings } = workspaceWith(many);
  assert.ok(warnings.some((w) => w.includes('1:1 waiting lists')),
    'the reload surfaces the truncation to the leader');
  const warn = warnings.find((w) => w.includes('1:1 waiting lists'));
  assert.match(warn, /declared 12-prompt cap/);
  assert.match(warn, /nothing was removed without this notice/);
});

test('de-duplication happens before the cap, so a repeat never costs a slot', () => {
  const withDupes = ['Topic A', 'topic a', 'Topic B'];
  assert.deepEqual(normalizeTalkingPoints(withDupes), ['Topic A', 'Topic B']);
});

/* ------------------------------------------- defect 2: the badge named the wrong line */

test('DEFECT 2: the eviction badge names the line the reload will actually take', () => {
  // The list AS STORED — the policy has already run, so it is exactly at the cap.
  const stored = ['Their own topic', ...Array.from({ length: 11 }, (_, i) => ENGINE(i + 2))];
  const q = personQueue({ id: 'p1', talkingPoints: stored });

  assert.equal(q.atCap, true);
  assert.equal(q.rows.filter((r) => r.evictionRisk).length, 1, 'exactly one line is next to go');
  assert.equal(q.rows[0].evictionRisk, false, 'row 0 is their own topic and is safe — the old code flagged it');
  const atRisk = q.rows.find((r) => r.evictionRisk);
  assert.equal(atRisk.engine, true);
  assert.equal(atRisk.text, ENGINE(2), 'the oldest engine prompt still on the list');

  // The printed warning must agree with the badge.
  assert.ok(q.nextEvicted);
  assert.equal(q.nextEvicted.index, atRisk.index);
});

test('DEFECT 2b: the cap sentence says something true in both cases', () => {
  const mixed = ['Their own topic', ...Array.from({ length: 12 }, (_, i) => ENGINE(i + 1))];
  const sentence = queueCapSentence(mixed);
  assert.match(sentence, new RegExp(`${TALKING_QUEUE_CAP}-prompt cap`));
  assert.match(sentence, /OLDEST engine prompt/);
  assert.match(sentence, /«|“|"/, 'it names the line at risk');
  assert.doesNotMatch(sentence, /truncates from the OLDEST end/, 'the old false claim is gone');

  // At the cap with nothing but their own topics, no line is at risk and the
  // sentence says an arrival is refused — it does not invent a victim.
  const theirsOnly = space(TALKING_QUEUE_CAP);
  const allTheirs = queueCapSentence(theirsOnly);
  assert.match(allTheirs, /refused/);
  assert.equal(nextEvictedIndex(theirsOnly), null, 'nothing is at risk when every line is theirs');

  // Under the cap: no warning at all.
  assert.equal(queueCapSentence(space(3)), null);
  assert.equal(nextEvictedIndex(space(3)), null);
});

test('DEFECT 2c: the agenda plan prints the corrected warning end to end', () => {
  const list = ['Their own topic', ...Array.from({ length: 12 }, (_, i) => ENGINE(i + 1))];
  const state = { people: [{ id: 'p1', name: 'Ari', status: 'active', talkingPoints: list }], oneOnOnes: [], agendaEntries: [], agendaMarkers: [], settings: {} };
  const plan = buildAgendaPlan(state, 'p1', { now: NOW });

  assert.ok(plan.capWarning, 'a full list produces a warning');
  assert.doesNotMatch(plan.capWarning, /truncates from the OLDEST end/);
  assert.match(plan.capWarning, /OLDEST engine prompt/);
  // The plan's "evictable" list is exactly the badge — one line, engine-authored.
  assert.equal(plan.evictable.length, 1);
  assert.equal(plan.evictable[0].engine, true);
});

/* ------------------------------------------------- non-regression: normal behaviour */

test('an ordinary short list is untouched by the policy', () => {
  const list = ['On-call load is not sustainable', 'Wants a clearer promotion path'];
  assert.deepEqual(normalizeTalkingPoints(list), list);
  const { state, warnings } = workspaceWith(list);
  assert.deepEqual(state.people[0].talkingPoints, list);
  assert.equal(warnings.filter((w) => w.includes('1:1 waiting lists')).length, 0);
  const q = personQueue({ id: 'p1', talkingPoints: list });
  assert.equal(q.atCap, false);
  assert.equal(q.rows.some((r) => r.evictionRisk), false);
});

test('an empty or malformed list is still an empty list', () => {
  assert.deepEqual(normalizeTalkingPoints([]), []);
  assert.deepEqual(normalizeTalkingPoints(null), []);
  assert.deepEqual(normalizeTalkingPoints(['', '   ', 42, null]), []);
});
