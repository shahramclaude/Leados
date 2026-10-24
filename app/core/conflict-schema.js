/** Normalisation for the additive conflict collection. Unknown never implies consent. */
import {
  CONFLICT_SAFETY, CONFLICT_STATUS, PARTICIPATION, CONFLICT_OUTCOMES, isConflictDay,
  currentAgreement, latestConflictDay, resolutionReadiness, conflictTextLimitIssue,
} from './domain/conflicts.js';

const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => Array.isArray(v) ? v.filter(obj) : [];
const str = (v, max = 4000) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const day = (v) => isConflictDay(v) ? v : null;
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
function unique(items, warnings) {
  const seen = new Set();
  const kept = items.filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
  if (kept.length !== items.length) warnings.push('Conflicts: duplicate history/record IDs were removed. Review the imported history; no extra consent was inferred.');
  return kept;
}

function participants(value) {
  return list(value).slice(0, 8).map((p) => ({
    name: str(p.name, 120), perspective: str(p.perspective, 2000), interest: str(p.interest, 2000),
    participation: Object.hasOwn(PARTICIPATION, p.participation) ? p.participation : 'unknown',
  })).filter((p) => p.name);
}
function context(value) {
  const source = obj(value) ? value : {};
  return {
    safety: Object.hasOwn(CONFLICT_SAFETY, source.safety) ? source.safety : 'unknown',
    coordinator: str(source.coordinator, 120), summary: str(source.summary), process: str(source.process), sharing: str(source.sharing), participants: participants(source.participants),
  };
}

export function normalizeConflicts(value, warnings, fallbackTimestamp) {
  if (value !== undefined && !Array.isArray(value)) warnings.push('Conflicts: collection was not a list and has been reset to empty');
  const today = fallbackTimestamp.slice(0, 10);
  if (Array.isArray(value) && value.some((item) => !obj(item))) warnings.push('Conflicts: malformed entries were removed; review the original backup.');
  return unique(list(value).map((raw, i) => {
    let repairs = conflictTextLimitIssue(raw) ? 1 : 0;
    for (const key of ['participants', 'agreements', 'followUps', 'transitions']) {
      if (raw[key] !== undefined && (!Array.isArray(raw[key]) || raw[key].some((item) => !obj(item)))) repairs += 1;
    }
    const record = {
      id: str(raw.id, 200) || `conflict-import-${i}`, title: str(raw.title, 200) || 'Untitled conflict record', summary: str(raw.summary),
      ...context(raw), openedOn: day(raw.openedOn) && raw.openedOn <= today ? raw.openedOn : null, nextFollowUpOn: day(raw.nextFollowUpOn),
      status: Object.hasOwn(CONFLICT_STATUS, raw.status) ? raw.status : 'open',
      agreements: [], followUps: [], transitions: [], followUpFloor: 0,
      createdAt: iso(raw.createdAt) || fallbackTimestamp, updatedAt: iso(raw.updatedAt) || iso(raw.createdAt) || fallbackTimestamp,
    };
    if (!record.openedOn || !str(raw.title) || !Object.hasOwn(CONFLICT_SAFETY, raw.safety)) repairs += 1;
    const afterOpening = (date) => date && date <= today && (!record.openedOn || date >= record.openedOn);
    for (const [k, a] of list(raw.agreements).entries()) {
      const date = day(a.date);
      const reviewOn = day(a.reviewOn);
      const actions = unique(list(a.actions).map((action, n) => {
        let completedOn = day(action.completedOn);
        let completionNote = str(action.completionNote);
        if (action.completedOn && (!completedOn || completedOn > today || completedOn < date || !completionNote)) { completedOn = null; completionNote = ''; repairs += 1; }
        return {
          id: str(action.id, 200) || `commitment-import-${k}-${n}`, owner: str(action.owner, 120), text: str(action.text, 1000),
          dueOn: day(action.dueOn), completedOn, completionNote,
        };
      }), warnings);
      if (!afterOpening(date) || !reviewOn || reviewOn < date || !str(a.text) || a.confirmedByAll !== true || !actions.length
        || actions.some((action) => !action.owner || !action.text || !action.dueOn || action.dueOn < date)) { repairs += 1; continue; }
      record.agreements.push({
        id: str(a.id, 200) || `agreement-import-${k}`, date, text: str(a.text), reviewOn, confirmedByAll: true,
        context: context(a.context), actions, createdAt: iso(a.createdAt),
      });
    }
    record.agreements = unique(record.agreements, warnings).sort((a, b) => a.date.localeCompare(b.date));
    for (const [k, f] of list(raw.followUps).entries()) {
      const date = day(f.date);
      if (!afterOpening(date) || !str(f.note)) { repairs += 1; continue; }
      const agreement = record.agreements.find((a) => a.id === f.agreementId && a.date <= date);
      let outcome = Object.hasOwn(CONFLICT_OUTCOMES, f.outcome) ? f.outcome : 'unknown';
      if (outcome === 'holding' && (!agreement || f.confirmedByAll !== true)) { outcome = 'unknown'; repairs += 1; }
      const nextFollowUpOn = day(f.nextFollowUpOn);
      record.followUps.push({
        id: str(f.id, 200) || `conflict-checkin-import-${k}`, date, note: str(f.note), outcome,
        confirmedByAll: outcome === 'holding' && f.confirmedByAll === true, agreementId: agreement?.id || null,
        context: context(f.context), completedActionIds: Array.isArray(f.completedActionIds)
          ? [...new Set(f.completedActionIds.filter((id) => agreement?.actions.some((a) => a.id === id && a.completedOn && a.completedOn <= date)))] : [],
        nextFollowUpOn: nextFollowUpOn && nextFollowUpOn >= date ? nextFollowUpOn : null, createdAt: iso(f.createdAt),
      });
    }
    record.followUps = unique(record.followUps, warnings).sort((a, b) => a.date.localeCompare(b.date));
    record.followUpFloor = Number.isInteger(raw.followUpFloor) ? Math.max(0, Math.min(record.followUps.length, raw.followUpFloor)) : 0;
    for (const [k, t] of list(raw.transitions).entries()) {
      const date = day(t.date);
      if (!afterOpening(date) || !['resolved', 'escalated', 'reopened'].includes(t.type) || !str(t.note) || (t.type === 'escalated' && !str(t.handoffTo))) { repairs += 1; continue; }
      record.transitions.push({
        id: str(t.id, 200) || `conflict-transition-import-${k}`, date, type: t.type, note: str(t.note), handoffTo: str(t.handoffTo, 120),
        followUpId: record.followUps.some((f) => f.id === t.followUpId) ? t.followUpId : null,
        ...(t.type === 'reopened' ? { followUpFloor: Number.isInteger(t.followUpFloor) ? Math.max(0, Math.min(record.followUps.length, t.followUpFloor)) : null } : {}),
        createdAt: iso(t.createdAt),
      });
    }
    record.transitions = unique(record.transitions, warnings).sort((a, b) => a.date.localeCompare(b.date));
    const reopened = record.transitions.filter((entry) => entry.type === 'reopened').at(-1);
    if (reopened) {
      // Two independent copies preserve the append-only verification boundary. If
      // both are missing, all imported checks are treated as pre-reopening: ask
      // for a new check rather than inventing the order of same-day actions.
      const floor = reopened.followUpFloor ?? record.followUps.length;
      if (record.followUpFloor < floor || reopened.followUpFloor === null) repairs += 1;
      record.followUpFloor = Math.max(record.followUpFloor, floor);
      reopened.followUpFloor = floor;
    }
    const lastTransition = record.transitions.at(-1);
    const fallbackStatus = currentAgreement(record) ? 'agreed' : 'open';
    if ((record.status === 'agreed' && !currentAgreement(record))
      || (record.status === 'escalated' && lastTransition?.type !== 'escalated')
      || (record.status === 'resolved' && (lastTransition?.type !== 'resolved' || lastTransition.date < latestConflictDay(record)
        || lastTransition.followUpId !== resolutionReadiness(record).followUp?.id || !resolutionReadiness(record).canResolve))) {
      record.status = fallbackStatus; repairs += 1;
    }
    if (record.status === 'resolved') record.nextFollowUpOn = null;
    else if (!record.nextFollowUpOn || record.nextFollowUpOn < latestConflictDay(record)) repairs += 1;
    if (repairs) warnings.push(`Conflicts: a record needed ${repairs} repair(s); unknown consent stays unknown and unsupported closure is reopened. Check its context/history.`);
    return record;
  }), warnings);
}
