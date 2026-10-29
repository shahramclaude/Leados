import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../../app/core/schema.js';
import { caseAuditTrail, caseLinkIntegrity, linksForEntity } from '../../app/core/domain/cases.js';
import { propagateCaseEvent, previewCasePropagations } from '../../app/core/domain/automation.js';

const now = new Date('2026-10-29T12:00:00Z');

test('missing decision and mitigation edges do not suppress the case cascade, and reruns are idempotent', () => {
  const state = createEmptyState();
  state.people.push({ id: 'owner', name: 'Owner', talkingPoints: [] });
  const item = { id: 'c1', title: 'Production delay', kind: 'incident', status: 'open', openedOn: '2026-10-29', ownerId: 'owner', fmea: { severity: 9, probability: 5, detectability: 5 }, stakeholders: [], rca: {} };
  state.cases.push(item);
  state.links.push(
    { sourceType: 'case', sourceId: 'c1', targetType: 'decision', targetId: 'missing-decision', relation: 'decides' },
    { sourceType: 'delegation', sourceId: 'missing-delegation', targetType: 'case', targetId: 'c1', relation: 'mitigates' },
  );
  assert.equal(caseLinkIntegrity(state, 'c1').length, 2);
  const preview = previewCasePropagations(item, state, { now, existingCaseId: 'c1' });
  assert.ok(preview.some((p) => p.ruleId === 'RULE-DEC-01'));
  assert.ok(preview.some((p) => p.ruleId === 'RULE-DEL-01'));
  let sequence = 0;
  const opts = { now, idFactory: (type) => `${type}-${++sequence}` };
  propagateCaseEvent(state, item, opts);
  assert.equal(state.decisions.length, 1);
  assert.equal(state.delegations.length, 1);
  const types = linksForEntity(state, 'case', 'c1').map((l) => l.peer.type);
  assert.ok(types.includes('decision') && types.includes('delegation'));
  assert.equal(caseLinkIntegrity(state, 'c1').length, 2, 'broken edges are retained for investigation');
  propagateCaseEvent(state, item, opts);
  assert.equal(state.decisions.length, 1);
  assert.equal(state.delegations.length, 1);
});

test('case audit uses typed links, never title text or private entity IDs', () => {
  const links = [{ peer: { type: 'decision', id: 'shared' } }];
  const state = { events: [
    { type: 'case.created', entity: 'case', entityId: 'c1', summary: 'Case' },
    { type: 'automation.propagated', entity: 'decision', entityId: 'shared', summary: 'Linked' },
    { type: 'automation.propagated', entity: 'person', entityId: 'shared', summary: 'Wrong type' },
    { type: 'conflict.updated', entity: 'conflict', entityId: 'c1', summary: 'Case' },
    { type: 'pulse.created', entity: 'pulse', entityId: 'c1', summary: 'Case' },
    { type: 'person.updated', entity: 'person', entityId: 'other', summary: 'Case' },
  ] };
  assert.deepEqual(caseAuditTrail(state, 'c1', links).map((e) => e.summary), ['Linked', 'Case']);
});
