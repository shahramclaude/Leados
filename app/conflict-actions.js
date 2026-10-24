/** Validated conflict lifecycle writes. Sensitive content stays out of the general event log. */
import { dayKey } from './core/time.js';
import {
  CONFLICT_SAFETY, PARTICIPATION, CONFLICT_OUTCOMES, isConflictDay, currentAgreement,
  conflictContext, contextMatches, latestConflictDay, agreementReadiness, resolutionReadiness, conflictTextLimitIssue,
} from './core/domain/conflicts.js';

const text = (v, max = 4000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const fail = (error, field = null) => ({ ok: false, error, field });
const editable = (record) => ['open', 'agreed'].includes(record.status);

function participantsFrom(value) {
  return Array.isArray(value) ? value.map((p) => ({
    name: text(p?.name, 120), perspective: text(p?.perspective, 2000), interest: text(p?.interest, 2000),
    participation: Object.hasOwn(PARTICIPATION, p?.participation) ? p.participation : 'unknown',
  })) : [];
}
function validateBase(record, today) {
  if (!record.title) return fail('Use a neutral reference for this disagreement.', 'title');
  if (!record.summary) return fail('Describe the observable situation without assigning blame.', 'summary');
  if (!record.coordinator) return fail('Name who is responsible for the next step.', 'coordinator');
  if (!isConflictDay(record.openedOn) || record.openedOn > today) return fail('Choose a real opening date, not in the future.', 'openedOn');
  if (!isConflictDay(record.nextFollowUpOn) || record.nextFollowUpOn < record.openedOn) return fail('Set a follow-up date on or after the opening date.', 'nextFollowUpOn');
  if (!Object.hasOwn(CONFLICT_SAFETY, record.safety)) return fail('Choose the support-route assessment, or leave it unsure.', 'safety');
  if (record.participants.length < 2 || record.participants.length > 8 || record.participants.some((p) => !p.name)) return fail('Record between two and eight participants, with a name or agreed identifier for each.', 'participants');
  const names = record.participants.map((p) => p.name.toLowerCase().replace(/\s+/g, ' '));
  if (new Set(names).size !== names.length) return fail('Use distinct participant identifiers; do not count the same person twice.', 'participants');
  return null;
}

export function createConflictActions(store, { now, idFactory }) {
  const stamp = () => now().toISOString();
  const today = () => dayKey(now());
  const id = (prefix) => idFactory(prefix);
  const find = (conflictId) => (store.state.conflicts || []).find((r) => r.id === conflictId);
  const validDate = (date, record, field = 'date') => {
    if (!isConflictDay(date) || date > today()) return fail('Choose a valid date that is not in the future.', field);
    if (latestConflictDay(record) && date < latestConflictDay(record)) return fail('This entry cannot predate the latest recorded activity.', field);
    return null;
  };
  function write(record, type, change) {
    store.update((draft) => {
      const target = draft.conflicts.find((r) => r.id === record.id);
      change(target);
      target.updatedAt = stamp();
    }, { type: `conflict.${type}`, entity: 'conflict', entityId: record.id, summary: `Conflict record: ${type.replaceAll('-', ' ')} (details in the conflict workspace)` });
    return { ok: true, id: record.id, warning: store.persistError || null };
  }

  const actions = {
    addConflict(data) {
      const record = {
        id: id('conflict'), title: text(data.title, 200), summary: text(data.summary), coordinator: text(data.coordinator, 120),
        openedOn: data.openedOn || today(), safety: data.safety || 'unknown', process: text(data.process), sharing: text(data.sharing),
        participants: participantsFrom(data.participants), nextFollowUpOn: data.nextFollowUpOn || null,
        status: 'open', agreements: [], followUps: [], transitions: [], followUpFloor: 0, createdAt: stamp(), updatedAt: stamp(),
      };
      const invalid = validateBase(record, today());
      if (invalid) return invalid;
      store.update((draft) => { draft.conflicts.push(record); }, {
        type: 'conflict.created', entity: 'conflict', entityId: record.id, summary: 'Conflict record created (details in the conflict workspace)',
      });
      return { ok: true, id: record.id, warning: store.persistError || null };
    },

    updateConflict(conflictId, patch) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (!editable(record)) return fail('Reopen this record before changing the discussion context.');
      const next = { ...record };
      for (const key of ['title', 'summary', 'coordinator', 'process', 'sharing']) if (patch[key] !== undefined) next[key] = text(patch[key], key === 'title' ? 200 : key === 'coordinator' ? 120 : 4000);
      for (const key of ['openedOn', 'safety', 'nextFollowUpOn']) if (patch[key] !== undefined) next[key] = patch[key];
      if (patch.participants !== undefined) next.participants = participantsFrom(patch.participants);
      const invalid = validateBase(next, today());
      if (invalid) return invalid;
      const historyDates = [...record.agreements, ...record.followUps, ...record.transitions].map((entry) => entry.date).filter(Boolean);
      if (historyDates.some((date) => date < next.openedOn)) return fail('The opening date cannot be after existing history.', 'openedOn');
      if (next.nextFollowUpOn < latestConflictDay(next)) return fail('The next follow-up cannot predate existing activity.', 'nextFollowUpOn');
      return write(record, 'context-updated', (target) => {
        for (const key of ['title', 'summary', 'coordinator', 'process', 'sharing', 'openedOn', 'safety', 'nextFollowUpOn', 'participants']) target[key] = next[key];
      });
    },

    agreeConflict(conflictId, data) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (!editable(record)) return fail('Reopen this record before making an agreement.');
      const readiness = agreementReadiness(record);
      if (!readiness.canAgree) return fail(`Before agreement: ${readiness.missing.map((c) => c.label).join('; ')}.`, 'agreement');
      const date = data.date || today();
      const invalid = validDate(date, record);
      if (invalid) return invalid;
      if (!text(data.text)) return fail('Write the agreement in observable terms.', 'text');
      if (data.confirmedByAll !== true) return fail('Explicit confirmation from everyone is required. A manager’s proposal is not an agreement.', 'confirmedByAll');
      if (!isConflictDay(data.reviewOn) || data.reviewOn < date) return fail('Set a review date on or after the agreement.', 'reviewOn');
      if (!Array.isArray(data.actions) || !data.actions.length || data.actions.length > 12) return fail('Record at least one commitment (up to twelve).', 'actions');
      const actions = data.actions.map((a) => ({ id: id('commitment'), owner: text(a?.owner, 120), text: text(a?.text, 1000), dueOn: a?.dueOn, completedOn: null, completionNote: '' }));
      if (actions.some((a) => !a.owner || !a.text || !isConflictDay(a.dueOn) || a.dueOn < date)) return fail('Every commitment needs an owner, observable action and a due date on or after the agreement.', 'actions');
      const agreement = { id: id('agreement'), date, text: text(data.text), reviewOn: data.reviewOn, confirmedByAll: true, actions, context: conflictContext(record), createdAt: stamp() };
      return write(record, 'agreement-recorded', (target) => {
        target.agreements.push(agreement); target.status = 'agreed'; target.nextFollowUpOn = agreement.reviewOn;
      });
    },

    completeConflictAction(conflictId, actionId, data) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (!editable(record)) return fail('Reopen this record before recording a commitment result.');
      const agreement = currentAgreement(record);
      const action = agreement?.actions.find((a) => a.id === actionId);
      if (!action) return fail('That commitment is not in the current agreement.');
      if (action.completedOn) return fail('This result is already recorded. A changed commitment needs a new agreement.');
      const completedOn = data.completedOn || today();
      if (!isConflictDay(completedOn) || completedOn > today() || completedOn < agreement.date) return fail('Choose a result date on or after the agreement, not in the future.', 'completedOn');
      if (!text(data.completionNote)) return fail('Record what was actually done; a checkbox alone is not a result.', 'completionNote');
      return write(record, 'commitment-completed', (target) => {
        Object.assign(currentAgreement(target).actions.find((a) => a.id === actionId), { completedOn, completionNote: text(data.completionNote) });
      });
    },

    followUpConflict(conflictId, data) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (record.status === 'resolved') return fail('Reopen the record before logging a new follow-up.');
      const date = data.date || today();
      const invalid = validDate(date, record);
      if (invalid) return invalid;
      if (!text(data.note)) return fail('Record what you checked and what changed. Keep unnecessary sensitive detail out.', 'note');
      if (!Object.hasOwn(CONFLICT_OUTCOMES, data.outcome)) return fail('Choose what this follow-up actually established.', 'outcome');
      if (!isConflictDay(data.nextFollowUpOn) || data.nextFollowUpOn < date) return fail('Set the next follow-up on or after this check-in.', 'nextFollowUpOn');
      const agreement = currentAgreement(record);
      if (data.outcome === 'holding' && (record.status === 'escalated' || !agreement || !contextMatches(record) || !agreementReadiness(record).canAgree)) return fail('A current, appropriate agreement is needed before recording that it is holding.', 'outcome');
      if (data.outcome === 'holding' && data.confirmedByAll !== true) return fail('Check with everyone before recording that the agreement is holding.', 'confirmedByAll');
      const followUp = {
        id: id('conflict-checkin'), date, note: text(data.note), outcome: data.outcome,
        confirmedByAll: data.outcome === 'holding' && data.confirmedByAll === true,
        agreementId: agreement?.id || null, context: conflictContext(record),
        completedActionIds: (agreement?.actions || []).filter((a) => a.completedOn && a.completedOn <= date).map((a) => a.id),
        nextFollowUpOn: data.nextFollowUpOn, createdAt: stamp(),
      };
      return write(record, 'follow-up-recorded', (target) => { target.followUps.push(followUp); target.nextFollowUpOn = followUp.nextFollowUpOn; });
    },

    resolveConflict(conflictId, data) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (!editable(record)) return fail('Only an open agreement can be resolved.');
      const readiness = resolutionReadiness(record);
      if (!readiness.canResolve) return fail(`Not resolved yet: ${readiness.missing.map((c) => c.label).join('; ')}.`, 'resolution');
      const date = data.date || today();
      const invalid = validDate(date, record);
      if (invalid) return invalid;
      if (!text(data.note)) return fail('Record why the loop can now be closed.', 'note');
      return write(record, 'resolved', (target) => {
        target.transitions.push({ id: id('conflict-transition'), type: 'resolved', date, note: text(data.note), handoffTo: '', followUpId: readiness.followUp.id, createdAt: stamp() });
        target.status = 'resolved'; target.nextFollowUpOn = null;
      });
    },

    escalateConflict(conflictId, data) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (!editable(record)) return fail('This record is already resolved or handed off. Reopen it to change the route.');
      const date = data.date || today();
      const invalid = validDate(date, record);
      if (invalid) return invalid;
      if (!text(data.handoffTo)) return fail('Name the appropriate support contact or role you will contact yourself.', 'handoffTo');
      if (!text(data.note)) return fail('Record the next step, not detailed allegations. This app does not send the handoff.', 'note');
      if (!isConflictDay(data.nextFollowUpOn) || data.nextFollowUpOn < date) return fail('Set a date to check that the handoff was received.', 'nextFollowUpOn');
      return write(record, 'support-handoff-recorded', (target) => {
        target.transitions.push({ id: id('conflict-transition'), type: 'escalated', date, note: text(data.note), handoffTo: text(data.handoffTo, 120), followUpId: null, createdAt: stamp() });
        target.status = 'escalated'; target.nextFollowUpOn = data.nextFollowUpOn;
      });
    },

    reopenConflict(conflictId, data) {
      const record = find(conflictId);
      if (!record) return fail('That conflict record no longer exists.');
      if (editable(record)) return fail('This conflict is already open.');
      const date = data.date || today();
      const invalid = validDate(date, record);
      if (invalid) return invalid;
      if (!text(data.note)) return fail('Say what changed and why a new check is needed.', 'note');
      if (!isConflictDay(data.nextFollowUpOn) || data.nextFollowUpOn < date) return fail('Set the next follow-up on or after reopening.', 'nextFollowUpOn');
      return write(record, 'reopened', (target) => {
        target.transitions.push({ id: id('conflict-transition'), type: 'reopened', date, note: text(data.note), handoffTo: '', followUpId: null, followUpFloor: target.followUps.length, createdAt: stamp() });
        target.status = currentAgreement(target) ? 'agreed' : 'open';
        target.followUpFloor = target.followUps.length; target.nextFollowUpOn = data.nextFollowUpOn;
      });
    },
  };
  return Object.fromEntries(Object.entries(actions).map(([name, action]) => [name, (...args) => {
    if (store.writeBlockReason) return fail(store.writeBlockReason);
    const data = args.at(-1);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('Enter valid conflict fields before saving.');
    const issue = conflictTextLimitIssue(data);
    return issue ? fail(issue.error, issue.field) : action(...args);
  }]));
}
