/**
 * Conflict support is a process record, not a diagnosis, blame score or HR case file.
 * Pure rules: no storage, DOM, network or implicit clock. Parties need not be on the roster.
 */
import { dayKey, daysSince } from '../time.js';

export const CONFLICT_SAFETY = {
  unknown: 'Not assessed / unsure — seek appropriate support',
  ordinary: 'Ordinary working disagreement — informal discussion is appropriate',
  support: 'Serious concern / unsafe imbalance — qualified support needed',
};
export const PARTICIPATION = {
  unknown: 'Not yet asked / unknown', willing: 'Willing to take part', declined: 'Does not want to take part',
};
export const CONFLICT_STATUS = {
  open: 'Listening & planning', agreed: 'Agreement in progress', resolved: 'Resolved after follow-up', escalated: 'Support handoff recorded',
};
export const CONFLICT_OUTCOMES = {
  unknown: 'Not yet verified / still exploring', holding: 'Everyone confirms the agreement is holding', 'not-holding': 'Agreement is not holding',
};

/** Shared bounded-text check: writes reject oversize notes; imports report repairs. */
export function conflictTextLimitIssue(data) {
  const limits = { title: 200, name: 120, coordinator: 120, owner: 120, handoffTo: 120, perspective: 2000, interest: 2000,
    summary: 4000, process: 4000, sharing: 4000, text: 4000, note: 4000, completionNote: 4000 };
  const seen = new Set();
  function inspect(value, field = null, parent = '') {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) { const issue = inspect(item, field, parent); if (issue) return issue; }
      return null;
    }
    for (const [key, item] of Object.entries(value)) {
      const limit = key === 'text' && parent === 'actions' ? 1000 : limits[key];
      if (typeof item === 'string' && limit && item.trim().length > limit) {
        return { error: `The ${key} field is limited to ${limit} characters. Shorten it before saving; nothing was changed.`, field: field || key };
      }
      const issue = inspect(item, field || key, key);
      if (issue) return issue;
    }
    return null;
  }
  return inspect(data);
}

export function isConflictDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(value) === value;
}
export function currentAgreement(record) { return (record?.agreements || []).at(-1) || null; }
export function conflictContext(record) {
  return {
    safety: record.safety, coordinator: record.coordinator, summary: record.summary, process: record.process, sharing: record.sharing,
    participants: record.participants.map(({ name, perspective, interest, participation }) => ({ name, perspective, interest, participation })),
  };
}
export function contextMatches(record, agreement = currentAgreement(record)) {
  return Boolean(agreement && JSON.stringify(conflictContext(record)) === JSON.stringify(agreement.context));
}
export function latestConflictDay(record) {
  return [record.openedOn, ...(record.agreements || []).flatMap((a) => [a.date, ...a.actions.map((action) => action.completedOn)]),
    ...(record.followUps || []).map((f) => f.date), ...(record.transitions || []).map((t) => t.date)]
    .filter(isConflictDay).sort().at(-1) || null;
}
export function latestConflictFollowUp(record) {
  const agreement = currentAgreement(record);
  return (record.followUps || []).slice(record.followUpFloor || 0).filter((f) => f.agreementId === agreement?.id).at(-1) || null;
}

export function agreementReadiness(record) {
  const parties = record.participants || [];
  const checks = [
    { field: 'openedOn', label: 'A valid opening date is recorded', met: isConflictDay(record.openedOn) },
    { field: 'safety', label: 'An ordinary working disagreement is explicitly selected', met: record.safety === 'ordinary' },
    { field: 'participants', label: 'At least two distinct participants are recorded', met: parties.length >= 2 && new Set(parties.map((p) => p.name.trim().toLowerCase().replace(/\s+/g, ' '))).size === parties.length },
    { field: 'participants', label: 'Everyone is willing to take part (unknown is not consent)', met: parties.length >= 2 && parties.every((p) => p.participation === 'willing') },
    { field: 'participants', label: 'Each person’s perspective and underlying interest have been heard', met: parties.length >= 2 && parties.every((p) => p.perspective.trim() && p.interest.trim()) },
    { field: 'coordinator', label: 'A process coordinator is named', met: Boolean(record.coordinator?.trim()) },
    { field: 'process', label: 'The discussion process / ground rules are recorded', met: Boolean(record.process?.trim()) },
    { field: 'sharing', label: 'Information-sharing limits are recorded', met: Boolean(record.sharing?.trim()) },
  ];
  return { checks, missing: checks.filter((c) => !c.met), canAgree: checks.every((c) => c.met) };
}

export function resolutionReadiness(record) {
  const agreement = currentAgreement(record);
  const followUp = latestConflictFollowUp(record);
  const actions = agreement?.actions || [];
  const checks = [
    { label: 'The informal process is still appropriate and voluntary', met: agreementReadiness(record).canAgree },
    { label: 'An explicit agreement matches the current situation, participants and process', met: Boolean(agreement?.confirmedByAll && contextMatches(record, agreement)) },
    { label: 'Every agreed commitment has a dated result', met: actions.length > 0 && actions.every((a) => a.completedOn && a.completionNote) },
    { label: 'The latest follow-up confirms the agreement is holding for everyone', met: Boolean(followUp && followUp.outcome === 'holding' && followUp.confirmedByAll && contextMatches(record, { context: followUp.context })) },
    { label: 'That follow-up checked all completed commitments (and occurred after any reopening)', met: Boolean(followUp && actions.length && actions.every((a) => a.completedOn && a.completedOn <= followUp.date && followUp.completedActionIds.includes(a.id))) },
  ];
  return { checks, missing: checks.filter((c) => !c.met), canResolve: checks.every((c) => c.met), agreement, followUp };
}

export function conflictHealth(record, now) {
  const active = record.status !== 'resolved';
  const agreement = currentAgreement(record);
  const followUp = latestConflictFollowUp(record);
  const needsSupport = active && record.status !== 'escalated' && (record.safety !== 'ordinary' || record.participants.some((p) => p.participation === 'declined'));
  const followUpDue = Boolean(active && (!record.nextFollowUpOn || record.nextFollowUpOn <= dayKey(now)));
  const overdueActions = active && record.status !== 'escalated'
    ? (agreement?.actions || []).filter((a) => !a.completedOn && a.dueOn < dayKey(now)) : [];
  const notHolding = Boolean(active && record.status !== 'escalated' && followUp?.outcome === 'not-holding');
  const changedContext = Boolean(active && record.status !== 'escalated' && agreement && !contextMatches(record, agreement));
  const label = !active ? CONFLICT_STATUS.resolved : needsSupport ? 'Check the support route' : notHolding ? 'Agreement needs revisiting'
    : changedContext ? 'Context changed — agree again' : overdueActions.length ? 'Commitments overdue' : followUpDue ? 'Follow-up due' : CONFLICT_STATUS[record.status];
  return {
    active, needsSupport, followUpDue, overdueActions, notHolding, changedContext, label,
    tone: !active ? 'good' : needsSupport || notHolding ? 'bad' : followUpDue || overdueActions.length || changedContext ? 'warn' : 'neutral',
    overdueDays: record.nextFollowUpOn ? Math.max(0, daysSince(record.nextFollowUpOn, now) || 0) : null,
    attention: Boolean(needsSupport || followUpDue || overdueActions.length || notHolding || changedContext),
  };
}
export function conflictSummary(state, now) {
  const rows = (state.conflicts || []).map((record) => ({ record, health: conflictHealth(record, now) }));
  return {
    rows, active: rows.filter((r) => r.health.active).length, resolved: rows.filter((r) => r.record.status === 'resolved').length,
    escalated: rows.filter((r) => r.record.status === 'escalated').length,
    attention: rows.filter((r) => r.health.attention), needsSupport: rows.filter((r) => r.health.needsSupport),
    followUpDue: rows.filter((r) => r.health.followUpDue), overdueActions: rows.filter((r) => r.health.overdueActions.length),
    notHolding: rows.filter((r) => r.health.notHolding || r.health.changedContext),
  };
}
