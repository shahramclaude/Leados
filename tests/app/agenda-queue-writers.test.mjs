/**
 * ADR-0138 — one writer for the 1:1 waiting list.
 *
 * ADR-0134 declared the retention policy and wired the STORAGE layer and the
 * LEDGER to it, but every rule that writes a prompt still opened its own door:
 * `person.talkingPoints = [...pts, prompt].slice(-30)`. That local cap is a
 * blind newest-wins cut at a number no reader has ever seen, and because a
 * person's own topics sit at the FRONT of the list they are the first thing it
 * deletes. The refusal the policy promises was replaced by a silent deletion.
 *
 * The first test below is the reproduction, run against the real `loadRule`.
 * Before the fix it destroyed "My mother is ill and I need to talk about leave"
 * — the most important line a person can raise — and recorded a queued prompt
 * in the findings as if nothing had happened.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEmptyState, normalizeState } from '../../app/core/schema.js';
import { loadRule } from '../../app/core/domain/load.js';
import {
  TALKING_QUEUE_CAP,
  appendTalkingPoint,
  recordQueueRefusal,
  QUEUE_REFUSAL_WARNING_CAP,
  isEngineAuthored,
} from '../../app/core/domain/talkingPointPolicy.js';
import { personQueue } from '../../app/core/domain/agendaProvenance.js';

const NOW = new Date('2026-11-08T12:00:00.000Z');
const THEIR_FIRST = 'My mother is ill and I need to talk about leave';
const THEIR_SECOND = 'I want a clearer promotion path';
const THEIR_THIRD = 'The on-call rotation is not sustainable';
const engine = (n) => `Engine prompt ${n} [RULE-PAR-02:x]`;

/** A draft with one person carrying four open funded commitments (WIP breach). */
function workspace(commitments = 4) {
  const state = createEmptyState(NOW.toISOString());
  state.people = [{
    id: 'p1', name: 'Ari Klein', role: 'Engineer', level: 'ic', team: 'Platform',
    managerId: null, startDate: '2025-01-01', focus: '', talkingPoints: [],
    status: 'active', createdAt: '2025-01-01T00:00:00.000Z', archivedAt: null,
  }];
  state.portfolio = Array.from({ length: commitments }, (_, i) => ({
    id: `pf-${i + 1}`, title: `Item ${i + 1}`, kind: 'project', horizon: 'core',
    status: 'open', sourceType: 'manual', sourceId: null, ownerId: 'p1',
    effortDays: { optimistic: 5, mostLikely: 8, pessimistic: 12 },
    value: { optimistic: 0, mostLikely: 0, pessimistic: 0 }, currency: 'USD',
    decision: 'funded', decisionOn: '2026-10-01', rationale: '', targetOn: null,
    createdOn: '2026-09-15', completedOn: null, releasedOn: null, actualEffortDays: null,
    actualValue: null, forecastSnapshot: null,
    createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z',
  }));
  return normalizeState(state, NOW).state;
}

/** Fire the real RULE-LOAD-02 writer through the real rule entry point. */
function runLoadScan(draft) {
  const warnings = [];
  const findings = loadRule(draft, {
    event: { type: 'load.scan', entity: 'workspace', entityId: '' },
    now: NOW,
    idFactory: (prefix) => `${prefix}-1`,
    logEvent: () => {},
    warnings,
  });
  return { findings, warnings };
}

/* ------------------------------------------------------------------ the writer */

test('the shared writer appends under the declared cap and reports the outcome', () => {
  const write = appendTalkingPoint(['Their topic', engine(1)], engine(2));
  assert.equal(write.appended, true);
  assert.equal(write.refused, false);
  assert.equal(write.cap, TALKING_QUEUE_CAP);
  assert.deepEqual(write.points, ['Their topic', engine(1), engine(2)]);
  assert.equal(write.displacedN, 0);
});

test('at the cap the write displaces the OLDEST engine prompt, not their words', () => {
  const lines = ['Their A', 'Their B', ...Array.from({ length: 10 }, (_, i) => engine(i + 1))];
  assert.equal(lines.length, TALKING_QUEUE_CAP);
  const write = appendTalkingPoint(lines, engine(99));

  assert.equal(write.appended, true);
  assert.equal(write.points.length, TALKING_QUEUE_CAP, 'the in-memory list never exceeds the cap');
  assert.ok(write.points.includes('Their A') && write.points.includes('Their B'));
  assert.ok(write.points.includes(engine(99)), 'the prompt just raised survives');
  assert.ok(!write.points.includes(engine(1)), 'the oldest engine prompt pays for it');
  assert.equal(write.displacedN, 1);
  assert.equal(write.displacedEngineN, 1);
  assert.equal(write.displacedPersonN, 0);
});

test('a queue held by their own topics refuses the write and changes nothing', () => {
  const theirs = Array.from({ length: TALKING_QUEUE_CAP }, (_, i) => `Topic ${i + 1} they raised`);
  const write = appendTalkingPoint(theirs, engine(1));

  assert.equal(write.appended, false);
  assert.equal(write.refused, true);
  assert.equal(write.reason, 'queue-held-by-person-raised');
  assert.equal(write.points, theirs, 'a refusal is a true no-op: nothing added AND nothing removed');
  assert.equal(write.points.length, TALKING_QUEUE_CAP);
  assert.equal(write.displacedN, 0);
});

test('an empty line is refused, a repeated line is a duplicate, neither writes', () => {
  const base = ['Their topic', engine(1)];
  assert.equal(appendTalkingPoint(base, '   ').reason, 'empty');
  assert.equal(appendTalkingPoint(base, '   ').appended, false);

  const dup = appendTalkingPoint(base, `  ${engine(1).toUpperCase()}  `);
  assert.equal(dup.appended, false);
  assert.equal(dup.duplicate, true);
  assert.equal(dup.points, base, 'a duplicate must not churn the queue or evict anything');
});

test('a corrupt in-memory tail cannot make the writer unstable', () => {
  const lines = ['Their topic', null, 42, engine(1)];
  const write = appendTalkingPoint(lines, engine(2));
  assert.equal(write.appended, true);
  assert.deepEqual(write.points, ['Their topic', engine(1), engine(2)]);
});

/* --------------------------------------------------------------- the channel */

test('refusals are reported once per person, bounded, with the remainder counted', () => {
  const warnings = [];
  for (let i = 1; i <= QUEUE_REFUSAL_WARNING_CAP + 2; i += 1) {
    assert.equal(recordQueueRefusal(warnings, `Person ${i}`), true);
  }
  assert.equal(warnings.length, QUEUE_REFUSAL_WARNING_CAP + 1);
  assert.match(warnings[QUEUE_REFUSAL_WARNING_CAP], /^1:1 waiting list: 2 further people/, 'the remainder is counted, not dropped');

  const again = recordQueueRefusal(warnings, 'Person 1');
  assert.equal(again, false, 'the same person is never named twice in one transaction');
  assert.equal(warnings.filter((w) => w.includes('Person 1')).length, 1);
  assert.equal(recordQueueRefusal(null, 'Person 1'), false, 'no warnings channel is not a crash');
});

/* --------------------------------------------------- the reproduction, end to end */

test('REPRODUCTION: an engine cascade can no longer delete a topic the person raised', () => {
  const draft = workspace(4);
  // A long session: their topics sit at the front, then a backlog of engine
  // prompts. 30 lines — exactly what the seven `.slice(-30)` writers allowed.
  draft.people[0].talkingPoints = [
    THEIR_FIRST, THEIR_SECOND, THEIR_THIRD,
    ...Array.from({ length: 27 }, (_, i) => engine(i + 1)),
  ];

  const { findings, warnings } = runLoadScan(draft);
  const stored = draft.people[0].talkingPoints;

  assert.equal(findings.length, 1, 'the rule still raises its prompt');
  for (const line of [THEIR_FIRST, THEIR_SECOND, THEIR_THIRD]) {
    assert.ok(stored.includes(line), `their own topic survived: ${line}`);
  }
  assert.ok(stored.some((t) => t.includes('[RULE-LOAD-02:')), 'and the prompt raised this pass is on the list');
  assert.equal(stored.length, TALKING_QUEUE_CAP, 'the in-memory list is bounded by the declared policy, not by 30');
  assert.equal(warnings.length, 0, 'nothing had to be refused');

  // The reading a lead works from shows the same lines — no memory/storage split.
  const rows = personQueue({ id: 'p1', talkingPoints: stored }).rows;
  assert.equal(rows.length, TALKING_QUEUE_CAP);
  assert.ok(rows.some((r) => r.text.startsWith('My mother is ill') && r.family === 'person-raised'),
    'the agenda ledger files their topic as theirs, not as an engine prompt');
});

test('a refused write is not claimed as a queued prompt, and is printed', () => {
  const draft = workspace(4);
  const theirs = Array.from({ length: TALKING_QUEUE_CAP }, (_, i) => `Topic ${i + 1} they raised`);
  draft.people[0].talkingPoints = [...theirs];

  const { findings, warnings } = runLoadScan(draft);

  assert.equal(findings.length, 0, 'the rule must not report a write it did not make');
  assert.deepEqual(draft.people[0].talkingPoints, theirs, 'and must not remove one of their topics to make room');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^1:1 waiting list: Ari Klein — /);
  assert.match(warnings[0], /Nothing was removed/);
});

test('the written list survives the reload unchanged (no write-then-delete)', () => {
  const draft = workspace(4);
  draft.people[0].talkingPoints = [
    THEIR_FIRST, THEIR_SECOND,
    ...Array.from({ length: 28 }, (_, i) => engine(i + 1)),
  ];
  runLoadScan(draft);
  const inMemory = [...draft.people[0].talkingPoints];

  const reloaded = normalizeState(
    { ...draft, meta: { ...draft.meta, revision: (draft.meta.revision || 0) + 1 } },
    { now: NOW },
  ).state;

  assert.deepEqual(reloaded.people[0].talkingPoints, inMemory,
    'what the rule wrote in memory is what the next load stores — byte for byte');
});

/* ---------------------------------------------------------------- the invariant */

test('no module may bound a talking-point write with its own slice literal', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      // Prose is not code: the ADR comments name the old idiom on purpose.
      const code = lines.map((line) => (/^\s*(\*|\/\/|\/\*)/.test(line) ? '' : line));
      code.forEach((line, i) => {
        if (!/talkingPoints/.test(line)) return;
        // The idiom spans lines in several files (`[\n ... \n].slice(-12)`), so
        // judge the statement, not the line.
        const statement = code.slice(i, i + 4).join('\n');
        if (/\.slice\(\s*-\s*\d+\s*\)/.test(statement)) offenders.push(`${path.relative(root, full)}:${i + 1}`);
      });
    }
  };
  walk(root);
  assert.deepEqual(offenders, [],
    'every write must go through appendTalkingPoint, which applies the one declared policy');
});

test('every writer that reaches the shared door keeps the marker grammar intact', () => {
  // ADR-0134's parity list still names the rules; ADR-0138 only changed the door.
  assert.equal(isEngineAuthored(`${'x '.repeat(0)}Prompt [RULE-LOAD-02:p1]`), true);
  const write = appendTalkingPoint([], `WIP check text [RULE-LOAD-02:p1]`);
  assert.equal(isEngineAuthored(write.points[0]), true, 'a prompt written through the door is still engine-authored');
});
