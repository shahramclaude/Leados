/**
 * app/core/domain/changeImpact.js — Matrix Change-Impact Line Review
 * (ADR-0185, Schema v147, `#/matrix?panel=change-impacts`).
 *
 * The register stores only dated requests, a frozen material/line snapshot for
 * each requested line, and first-person responses. Currentness, expiry, overdue
 * state, coverage and all counts are derived from those records and the live
 * change + Matrix graph. This is a review record, never approval, consent, or
 * permission to proceed.
 */

import { dayKey, daysBetween } from '../time.js';
import { buildMatrix } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { canonicalJson } from './sealCrypto.js';
import { CHANGE_IMPACT_LABELS, isChangeOpen, STAR_PILLARS } from './changes.js';
import {
  changeImpactState,
  CHANGE_IMPACT_ENGINE_VERSION,
  CHANGE_IMPACT_LIMITS,
  CHANGE_IMPACT_RULE_ID,
} from './changeImpactRegistry.js';

const clean = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => (typeof value === 'string' ? value.trim() : '');
const day = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

function sortedText(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))]
    .sort((a, b) => a.localeCompare(b));
}

/**
 * The exact human-visible change/impact/line facts whose material movement
 * invalidates a response. This deliberately excludes unrelated metrics,
 * coalition updates and force-field observations.
 */
export function changeImpactSnapshot(state, change, impact, matrix) {
  if (!change || !impact || !matrix) return { ok: false, reason: 'The change, impact or live Matrix graph cannot be read.' };
  const person = (state?.people || []).find((row) => row && row.id === impact.personId) || null;
  if (!person || person.status === 'archived') {
    return { ok: false, reason: 'The impacted person is no longer on the active roster.' };
  }
  const personDefects = (matrix.defects || []).filter((defect) => defect?.personId === person.id);
  if (personDefects.length) {
    return { ok: false, reason: 'The Matrix cannot verify every active line for this impacted person; resolve the named line defect before requesting or counting review.' };
  }
  const active = matrix.linesByPerson?.get?.(person.id) || [];
  if (active.length === 0) {
    return { ok: false, reason: 'The impacted person has no readable active Matrix line; applicability cannot be established.' };
  }
  if (active.length === 1) {
    return { ok: false, reason: 'The impacted person no longer has two verifiable active Matrix lines.', singleLine: true };
  }
  if (active.length > CHANGE_IMPACT_LIMITS.snapshotLines) {
    return { ok: false, reason: `The active line set exceeds the ${CHANGE_IMPACT_LIMITS.snapshotLines}-line snapshot limit.` };
  }

  const lines = active.map((line) => {
    const manager = matrix.nodes?.get?.(line.managerId) || null;
    return {
      lineKey: String(line.id || ''),
      role: line.role === 'primary' ? 'primary' : 'secondary',
      managerId: id(line.managerId),
      managerName: clean(manager?.name || line.managerId, 120),
      managerRole: clean(manager?.role, 120),
      managerAltitude: clean(manager?.altitude, 32) || null,
      kind: clean(line.kind, 48),
      // The raw declaration is frozen as context, but allocation never decides
      // who must review and no effective share is inferred from matrixAllocations.
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
      rights: sortedText(line.rights),
      presumedRights: sortedText(line.presumedRights),
      fromISO: day(line.fromISO),
      toISO: day(line.toISO),
      note: clean(line.note, 500),
    };
  }).sort((a, b) => a.lineKey.localeCompare(b.lineKey));
  if (lines.some((line) => !line.lineKey || !line.managerId || !line.managerName)) {
    return { ok: false, reason: 'At least one active Matrix line is incomplete; the full review set is not verifiable.' };
  }

  const snapshot = {
    version: 1,
    change: {
      id: id(change.id),
      title: clean(change.title, 200),
      kind: clean(change.kind, 40),
      summary: clean(change.summary, 2000),
      vision: clean(change.vision, 2000),
      nonGoals: clean(change.nonGoals, 1200),
      targetOn: day(change.targetOn),
      targetStructure: {
        teamName: clean(change.topology?.teamName, 120),
        currentType: clean(change.topology?.currentType, 48),
        targetType: clean(change.topology?.targetType, 48),
        interactionMode: clean(change.topology?.interactionMode, 48),
        collaboratingTeamsCount: Number.isInteger(change.topology?.collaboratingTeamsCount)
          ? Math.max(0, Math.min(20, change.topology.collaboratingTeamsCount))
          : 0,
      },
      star: Object.fromEntries(STAR_PILLARS.map((pillar) => [pillar, clean(change.star?.[pillar], 600)])),
    },
    impact: {
      id: id(impact.id),
      personId: id(impact.personId),
      impactKind: clean(impact.impactKind, 40),
      newRoleLabel: clean(impact.newRoleLabel, 160),
      createTransitionPlan: impact.createTransitionPlan === true,
    },
    person: {
      id: id(person.id),
      name: clean(person.name, 120),
      role: clean(person.role, 120),
      level: clean(person.level, 32),
      team: clean(person.team, 80),
      managerId: id(person.managerId) || LEADER_ID,
    },
    lines,
  };
  if (!snapshot.change.id || !snapshot.change.title || !snapshot.impact.id || !snapshot.impact.personId) {
    return { ok: false, reason: 'The change or impact row has no stable identity.' };
  }
  return { ok: true, snapshot, lines };
}

function findChange(state, changeId) {
  return (Array.isArray(state?.changes) ? state.changes : []).find((change) => change && change.id === changeId) || null;
}

function findImpact(change, personId, impactId = null) {
  return (Array.isArray(change?.impacts) ? change.impacts : []).find((impact) => impact
    && impact.personId === personId
    && (!impactId || impact.id === impactId)) || null;
}

function latestFirst(left, right) {
  return String(right.requestedOn || '').localeCompare(String(left.requestedOn || ''))
    || String(right.requestedAt || '').localeCompare(String(left.requestedAt || ''))
    || String(right.id || '').localeCompare(String(left.id || ''));
}

function requestKey(request) {
  return `${request?.changeId || ''}|${request?.personId || ''}|${request?.lineKey || ''}`;
}

function currentForRequest(state, request, matrix) {
  const change = findChange(state, request.changeId);
  if (!change) return { same: false, unverifiable: false, reason: 'The change record no longer exists; this request remains history.' };
  const impact = findImpact(change, request.personId, request.snapshot?.impact?.id);
  if (!impact) return { same: false, unverifiable: false, reason: 'The impacted-person row changed or was removed after this request.' };
  const live = changeImpactSnapshot(state, change, impact, matrix);
  if (!live.ok) {
    return {
      same: false,
      unverifiable: !live.singleLine,
      reason: live.reason,
      singleLine: Boolean(live.singleLine),
    };
  }
  const same = canonicalJson(live.snapshot) === canonicalJson(request.snapshot);
  return {
    same,
    unverifiable: false,
    reason: same ? '' : 'The material change, impacted-person detail or active Matrix line set changed after this request. The response remains history and no longer counts as current.',
    live,
  };
}

function responseFor(state, request) {
  return (Array.isArray(state?.changeImpactResponses) ? state.changeImpactResponses : [])
    .find((response) => response && response.requestId === request.id) || null;
}

function deriveRequestState(state, request, response, { today, matrix, superseded = false } = {}) {
  const current = currentForRequest(state, request, matrix);
  if (!current.same) {
    return {
      state: current.unverifiable ? 'unverifiable' : 'stale',
      stateLabel: changeImpactState(current.unverifiable ? 'unverifiable' : 'stale')?.label || 'Stale',
      stateTone: current.unverifiable ? 'bad' : 'bad',
      current: false,
      reason: current.reason,
      response,
    };
  }
  const change = findChange(state, request.changeId);
  if (!change || !isChangeOpen(change)) {
    return {
      state: 'historical',
      stateLabel: changeImpactState('historical')?.label || 'Closed — history',
      stateTone: 'neutral',
      current: false,
      reason: 'The change is closed; this dated review is retained as history and is not in current open-change coverage.',
      response,
    };
  }
  if (superseded) {
    return {
      state: 'superseded',
      stateLabel: 'Superseded request — history',
      stateTone: 'neutral',
      current: false,
      reason: 'A later request for this same change impact and line is the current obligation. The earlier request and response remain history.',
      response,
    };
  }
  if (!response) {
    const overdue = today > request.dueOn;
    const key = overdue ? 'overdue' : 'pending';
    return {
      state: key,
      stateLabel: changeImpactState(key)?.label || key,
      stateTone: 'warn',
      current: false,
      reason: overdue ? `No response was recorded by ${request.dueOn}.` : `The line was asked by ${request.dueOn}.`,
      response: null,
      overdueDays: overdue ? Math.max(0, daysBetween(request.dueOn, today) || 0) : null,
    };
  }
  if (response.outcome === 'declined') {
    return {
      state: 'declined',
      stateLabel: changeImpactState('declined')?.label || 'Declined',
      stateTone: 'bad',
      current: false,
      reason: 'The line recorded a reasoned decline; silence is never a decline or approval.',
      response,
      late: response.respondedOn > request.dueOn,
    };
  }
  if (!response.validThrough || today > response.validThrough) {
    return {
      state: 'expired',
      stateLabel: changeImpactState('expired')?.label || 'Review expired',
      stateTone: 'warn',
      current: false,
      reason: response.validThrough
        ? `The line response was valid through ${response.validThrough}; a refresh is required.`
        : 'The line response has no readable valid-through date; it cannot count as current.',
      response,
      late: response.respondedOn > request.dueOn,
    };
  }
  return {
    state: 'reviewed',
    stateLabel: changeImpactState('reviewed')?.label || 'Reviewed',
    stateTone: 'good',
    current: true,
    reason: response.respondedOn > request.dueOn
      ? `Reviewed late on ${response.respondedOn}; current through ${response.validThrough}.`
      : `Reviewed on ${response.respondedOn}; current through ${response.validThrough}.`,
    response,
    late: response.respondedOn > request.dueOn,
  };
}

function reachesPerson(seat, personId) {
  if (!seat || seat.fullAccess) return true;
  return Boolean(seat.scope?.has?.(personId) || seat.lineScope?.has?.(personId));
}

function canSeeTarget(seat, personId, request = null) {
  if (!seat || seat.fullAccess) return true;
  if (seat.id === request?.requestedBySeatId || seat.id === request?.managerId) return true;
  return reachesPerson(seat, personId);
}

function fullSpanAccess(seat, personId) {
  if (!seat || seat.fullAccess) return true;
  return seat.rank >= 3 && Boolean(seat.scope?.has?.(personId));
}

function canSeeLine(seat, personId, line, request) {
  if (!seat || seat.fullAccess) return true;
  if (seat.id === line?.managerId || seat.id === request?.requestedBySeatId) return true;
  return fullSpanAccess(seat, personId);
}

function canRequestForPerson(seat, personId) {
  if (!seat || seat.fullAccess) return true;
  if (seat.readOnly || seat.id === personId) return false;
  return reachesPerson(seat, personId);
}

function currentTargets(state, matrix, today) {
  const targets = [];
  const singleLineTargets = [];
  const changes = Array.isArray(state?.changes) ? state.changes : [];
  for (const change of changes) {
    if (!change || !change.id || !isChangeOpen(change)) continue;
    for (const impact of Array.isArray(change.impacts) ? change.impacts : []) {
      if (!impact?.personId) continue;
      const live = changeImpactSnapshot(state, change, impact, matrix);
      if (!live.ok) {
        if (live.singleLine) singleLineTargets.push({ change, impact, live, today });
        else targets.push({ change, impact, live, lines: [], snapshot: null, unverifiable: true, today });
        continue;
      }
      targets.push({ change, impact, live, lines: live.lines, snapshot: live.snapshot, unverifiable: false, today });
    }
  }
  return { targets, singleLineTargets };
}

function summarizeRows(rows, { singleLineExcludedN = 0, incompletePeopleN = 0, truncatedN = 0 } = {}) {
  const counts = {
    requiredLineReviewsN: rows.filter((row) => row.isRequiredLine).length,
    reviewedN: 0,
    unrequestedN: 0,
    pendingN: 0,
    overdueN: 0,
    declinedN: 0,
    expiredN: 0,
    staleN: 0,
    unverifiableN: 0,
    historicalN: 0,
    supersededN: 0,
    singleLineExcludedN,
    incompletePeopleN,
    withheldRowsN: truncatedN,
  };
  for (const row of rows) {
    // An unreadable active-line set is one affected change/person target, not a
    // guessed number of line reviews. Keep it visible as an issue while refusing
    // to add it to the line denominator.
    if (row.state === 'unverifiable') counts.unverifiableN += 1;
    if (!row.isRequiredLine) continue;
    if (Object.hasOwn(counts, `${row.state}N`)) counts[`${row.state}N`] += 1;
  }
  counts.attentionN = Math.max(0, counts.requiredLineReviewsN - counts.reviewedN) + counts.unverifiableN;
  return counts;
}

/**
 * Seat-scoped live report. Rank 1–2 seats see their own line and any request
 * they issued; rank 3+ seats see complete rows for people in their tree; the
 * operator sees the workspace. No raw request/response collection is projected.
 */
export function buildChangeImpactReviewReport(state, { now = new Date(), settings = null, seat = null } = {}) {
  const effective = settings || state?.settings || {};
  const today = dayKey(now);
  const matrix = buildMatrix(state, { now, settings: effective });
  const { targets, singleLineTargets } = currentTargets(state, matrix, today);
  const requests = Array.isArray(state?.changeImpactRequests) ? state.changeImpactRequests : [];
  const allLatest = new Map();
  for (const request of requests) {
    if (!request || !request.id) continue;
    const key = requestKey(request);
    const previous = allLatest.get(key);
    if (!previous || latestFirst(request, previous) < 0) allLatest.set(key, request);
  }

  const targetByKey = new Map(targets.map((target) => [`${target.change.id}|${target.impact.personId}`, target]));
  const currentRows = [];
  const candidates = [];
  const incompleteKeys = new Set();
  let hiddenCurrentRowsN = 0;

  for (const target of targets) {
    const { change, impact, live, lines, snapshot, unverifiable } = target;
    const personId = impact.personId;
    if (!canRequestForPerson(seat, personId) && !requests.some((request) => canSeeTarget(seat, personId, request))) continue;
    const visibleLineRows = [];
    if (unverifiable) {
      incompleteKeys.add(personId);
      const requestHistory = requests.filter((request) => request.changeId === change.id && request.personId === personId);
      const visibleRequest = requestHistory.find((request) => canSeeTarget(seat, personId, request));
      if (!seat || seat.fullAccess || reachesPerson(seat, personId) || visibleRequest) {
        currentRows.push({
          rowKey: `${change.id}|${personId}|unverifiable`,
          changeId: change.id,
          changeTitle: clean(change.title, 200),
          changeKind: clean(change.kind, 40),
          personId,
          personName: clean(state.people?.find?.((person) => person.id === personId)?.name || 'Impacted person', 120),
          impactKind: impact.impactKind,
          impactLabel: CHANGE_IMPACT_LABELS[impact.impactKind] || impact.impactKind,
          newRoleLabel: clean(impact.newRoleLabel, 160),
          lineKey: null,
          managerId: null,
          managerName: null,
          requestId: null,
          requestedOn: null,
          dueOn: null,
          requesterSeatId: null,
          prompt: '',
          response: null,
          state: 'unverifiable',
          stateLabel: changeImpactState('unverifiable')?.label || 'Line state unreadable',
          stateTone: 'bad',
          current: false,
          reason: live.reason,
          isRequiredLine: false,
          canRequest: false,
        });
      }
      continue;
    }

    for (const line of lines) {
      const key = `${change.id}|${personId}|${line.lineKey}`;
      const request = allLatest.get(key) || null;
      const response = request ? responseFor(state, request) : null;
      const derived = request
        ? deriveRequestState(state, request, response, { today, matrix })
        : {
          state: 'unrequested',
          stateLabel: changeImpactState('unrequested')?.label || 'Not yet requested',
          stateTone: 'warn',
          current: false,
          reason: 'No dated line-review request exists for this current change impact.',
          response: null,
        };
      const canSee = canSeeLine(seat, personId, line, request);
      const requiredForScope = !seat || seat.fullAccess || fullSpanAccess(seat, personId)
        || line.managerId === seat.id
        || request?.requestedBySeatId === seat.id;
      const row = {
        rowKey: key,
        changeId: change.id,
        changeTitle: clean(change.title, 200),
        changeKind: clean(change.kind, 40),
        personId,
        personName: clean(state.people?.find?.((person) => person.id === personId)?.name || 'Impacted person', 120),
        impactKind: impact.impactKind,
        impactLabel: CHANGE_IMPACT_LABELS[impact.impactKind] || impact.impactKind,
        newRoleLabel: clean(impact.newRoleLabel, 160),
        lineKey: line.lineKey,
        lineRole: line.role,
        lineKind: line.kind,
        lineNote: line.note,
        managerId: line.managerId,
        managerName: line.managerName,
        managerRole: line.managerRole,
        managerAltitude: line.managerAltitude,
        shareH: line.shareH,
        requestId: request?.id || null,
        requestedOn: request?.requestedOn || null,
        dueOn: request?.dueOn || null,
        requesterSeatId: request?.requestedBySeatId || null,
        prompt: request?.prompt || '',
        response: response && canSee ? {
          id: response.id,
          outcome: response.outcome,
          respondedOn: response.respondedOn,
          validThrough: response.validThrough,
          responderSeatId: response.responderSeatId,
          via: response.via,
          basis: response.basis,
          reason: response.reason,
        } : (response ? {
          id: response.id,
          outcome: response.outcome,
          respondedOn: response.respondedOn,
          validThrough: response.validThrough,
          via: response.via,
        } : null),
        state: derived.state,
        stateLabel: derived.stateLabel,
        stateTone: derived.stateTone,
        current: derived.current,
        reason: derived.reason,
        late: Boolean(derived.late),
        overdueDays: derived.overdueDays ?? null,
        isRequiredLine: requiredForScope,
        canRequest: Boolean(canRequestForPerson(seat, personId)
          && (!seat || seat.fullAccess || line.managerId !== seat.id)
          && !['pending', 'reviewed'].includes(derived.state)),
        canRespond: Boolean(request && request.managerId === line.managerId
          && !seat?.fullAccess && seat?.id === line.managerId
          && !response && derived.state !== 'stale' && derived.state !== 'unverifiable'),
      };
      if (canSee) visibleLineRows.push(row);
      if (requiredForScope) {
        if (canSee) currentRows.push(row);
        else hiddenCurrentRowsN += 1;
      }
    }

    if (canRequestForPerson(seat, personId)) {
      const eligible = lines.map((line) => {
        const lineKey = `${change.id}|${personId}|${line.lineKey}`;
        const request = allLatest.get(lineKey) || null;
        const response = request ? responseFor(state, request) : null;
        const derived = request
          ? deriveRequestState(state, request, response, { today, matrix })
          : { state: 'unrequested', stateLabel: changeImpactState('unrequested')?.label || 'Not yet requested' };
        const mayReadLine = canSeeLine(seat, personId, line, request);
        const stateLabel = mayReadLine || !request
          ? derived.stateLabel
          : 'Existing line activity; details restricted';
        return {
          lineKey: line.lineKey,
          role: line.role,
          kind: line.kind,
          managerId: line.managerId,
          managerName: line.managerName,
          managerRole: line.managerRole,
          // Do not leak the line's pending/reviewed/declined/expired/stale state
          // through the machine-readable field after masking its display label.
          state: mayReadLine || !request ? derived.state : 'restricted',
          stateLabel,
          canRequest: Boolean((!seat || seat.fullAccess || line.managerId !== seat.id)
            && !['pending', 'reviewed'].includes(derived.state)),
        };
      });
      candidates.push({
        changeId: change.id,
        changeTitle: clean(change.title, 200),
        changeKind: clean(change.kind, 40),
        personId,
        personName: clean(state.people?.find?.((person) => person.id === personId)?.name || 'Impacted person', 120),
        impactId: impact.id,
        impactKind: impact.impactKind,
        impactLabel: CHANGE_IMPACT_LABELS[impact.impactKind] || impact.impactKind,
        newRoleLabel: clean(impact.newRoleLabel, 160),
        lines: eligible,
        requestableN: eligible.filter((line) => line.canRequest).length,
        canRequest: eligible.some((line) => line.canRequest),
      });
    }
  }

  // Preserve every request that is not attached to one of this seat's visible
  // current line rows. This includes prior requests, removed lines, changed
  // impacts, closed changes and unreadable live line sets. No response is
  // rewritten or allowed to count through a later snapshot.
  const currentRequestIds = new Set(currentRows.map((row) => row.requestId).filter(Boolean));
  const historyRows = [];
  for (const request of requests) {
    if (currentRequestIds.has(request.id)) continue;
    const latest = allLatest.get(requestKey(request));
    const response = responseFor(state, request);
    const change = findChange(state, request.changeId);
    const impact = findImpact(change, request.personId, request.snapshot?.impact?.id);
    const current = currentForRequest(state, request, matrix);
    if (!canSeeTarget(seat, request.personId, request)) continue;
    const target = targetByKey.get(`${request.changeId}|${request.personId}`);
    const frozenLine = request.snapshot?.lines?.find?.((candidate) => candidate.lineKey === request.lineKey) || null;
    const currentLine = (target?.lines || []).find((candidate) => candidate.lineKey === request.lineKey) || null;
    // If the live target is unreadable or this line has since disappeared, use
    // the frozen request line to enforce visibility. An empty live line array
    // must never disable the seat check for retained history.
    const line = currentLine || frozenLine;
    if (!line && seat && !seat.fullAccess) continue;
    if (line && !canSeeLine(seat, request.personId, line, request)) continue;
    const derived = deriveRequestState(state, request, response, {
      today,
      matrix,
      superseded: Boolean(latest && latest.id !== request.id && current.same),
    });
    const person = state.people?.find?.((candidate) => candidate.id === request.personId) || null;
    const canReadResponse = canSeeLine(seat, request.personId, line || frozenLine, request);
    historyRows.push({
      rowKey: `${requestKey(request)}|history|${request.id}`,
      changeId: request.changeId,
      changeTitle: clean(change?.title || request.snapshot?.change?.title, 200),
      changeKind: clean(change?.kind || request.snapshot?.change?.kind, 40),
      personId: request.personId,
      personName: clean(person?.name || request.snapshot?.person?.name || 'Impacted person', 120),
      impactKind: impact?.impactKind || request.snapshot?.impact?.impactKind || '',
      impactLabel: CHANGE_IMPACT_LABELS[impact?.impactKind || request.snapshot?.impact?.impactKind]
        || impact?.impactKind || request.snapshot?.impact?.impactKind || '',
      newRoleLabel: clean(impact?.newRoleLabel || request.snapshot?.impact?.newRoleLabel, 160),
      lineKey: request.lineKey,
      lineRole: line?.role || frozenLine?.role || '',
      lineKind: line?.kind || frozenLine?.kind || '',
      managerId: request.managerId,
      managerName: line?.managerName || frozenLine?.managerName || request.managerId,
      requestId: request.id,
      requestedOn: request.requestedOn,
      dueOn: request.dueOn,
      requesterSeatId: request.requestedBySeatId,
      prompt: request.prompt,
      response: response ? {
        id: response.id,
        outcome: response.outcome,
        respondedOn: response.respondedOn,
        validThrough: response.validThrough,
        responderSeatId: response.responderSeatId,
        via: response.via,
        ...(canReadResponse ? { basis: response.basis, reason: response.reason } : {}),
      } : null,
      state: derived.state,
      stateLabel: derived.stateLabel,
      stateTone: derived.stateTone,
      current: false,
      reason: derived.reason,
      isRequiredLine: false,
      canRequest: false,
      canRespond: false,
    });
  }

  const singleLineExcludedN = singleLineTargets.filter(({ change, impact }) => (
    canRequestForPerson(seat, impact.personId)
    || requests.some((request) => request.changeId === change.id
      && request.personId === impact.personId
      && canSeeTarget(seat, impact.personId, request))
  )).length;
  const currentChangeIds = new Set(currentRows.map((row) => row.changeId));
  const peopleN = new Set(currentRows.filter((row) => row.isRequiredLine).map((row) => row.personId)).size;
  const allCurrentN = currentRows.filter((row) => row.isRequiredLine).length;
  const truncatedN = Math.max(0, currentRows.length + historyRows.length - CHANGE_IMPACT_LIMITS.reportRows);
  const shownCurrent = currentRows.slice(0, CHANGE_IMPACT_LIMITS.reportRows);
  const availableHistory = Math.max(0, CHANGE_IMPACT_LIMITS.reportRows - shownCurrent.length);
  const shownHistory = historyRows.slice(0, availableHistory);
  const incompletePeopleN = incompleteKeys.size;
  const totals = summarizeRows(shownCurrent, {
    singleLineExcludedN,
    incompletePeopleN,
    truncatedN,
  });
  totals.requiredLineReviewsN = allCurrentN;
  // Counters above are from displayed rows; when the bounded panel truncates,
  // coverage is refused rather than printing an incomplete fraction as complete.
  if (truncatedN) {
    const full = summarizeRows(currentRows, {
      singleLineExcludedN,
      incompletePeopleN,
      truncatedN,
    });
    Object.assign(totals, full);
  }
  const rowsReconcile = totals.requiredLineReviewsN === totals.reviewedN + totals.unrequestedN
    + totals.pendingN + totals.overdueN + totals.declinedN + totals.expiredN + totals.staleN;
  const coverageWithheldReason = incompletePeopleN
    ? `${incompletePeopleN} impacted person(s) have an unreadable live Matrix line set. The denominator is incomplete.`
    : totals.requiredLineReviewsN < 3
      ? `Only ${totals.requiredLineReviewsN} in-scope line review(s) are in the denominator; the declared small-cell floor is 3.`
      : hiddenCurrentRowsN
        ? `${hiddenCurrentRowsN} in-scope line row(s) could not be disclosed in this seat's view.`
        : truncatedN
          ? `${truncatedN} report row(s) exceed the declared display cap; coverage is withheld rather than computed from a partial display.`
          : !rowsReconcile
            ? 'The current line states do not reconcile to the required-line denominator.'
            : null;
  const coverageWithheld = Boolean(coverageWithheldReason);
  const coveragePct = coverageWithheld || !totals.requiredLineReviewsN
    ? null
    : Math.round((totals.reviewedN / totals.requiredLineReviewsN) * 1000) / 10;
  const clearanceState = coverageWithheld ? 'withheld'
    : totals.reviewedN === totals.requiredLineReviewsN ? 'covered'
      : 'gaps';

  return {
    engineVersion: CHANGE_IMPACT_ENGINE_VERSION,
    ruleId: CHANGE_IMPACT_RULE_ID,
    today,
    scope: !seat || seat.fullAccess ? 'workspace' : seat.rank >= 3 ? 'span' : 'line',
    seatId: seat?.id || null,
    seatLabel: seat?.label || 'Workspace operator',
    floorN: 3,
    rows: shownCurrent,
    historyRows: shownHistory,
    candidates: candidates.slice(0, CHANGE_IMPACT_LIMITS.reportRows),
    changesN: currentChangeIds.size,
    multiLinePeopleN: peopleN,
    totals: {
      ...totals,
      rowsReconcile,
      coveragePct,
      coverageWithheld,
      coverageWithheldReason,
      clearanceState,
      visibleRowsN: shownCurrent.length,
      historyRowsN: shownHistory.length,
      truncatedN,
      hiddenCurrentRowsN,
      singleLineExcludedN,
      incompletePeopleN,
      multiLineTargetsN: new Set(currentRows.map((row) => `${row.changeId}|${row.personId}`)).size,
    },
    method: 'A current review is a first-person line response to a dated request, on the same material change / impact / active-line snapshot, whose explicit valid-through date has not passed. Silence, a manager response from another line, an expired response and any response to a changed snapshot do not count. A review is not an approval, employee consent or permission to proceed.',
  };
}

export function changeImpactCsvRows(report) {
  const totals = report?.totals || {};
  return [{
    row_kind: 'workspace',
    as_of: report?.today || '',
    changes_n: report?.changesN ?? 0,
    multi_line_people_n: report?.multiLinePeopleN ?? 0,
    required_line_reviews_n: totals.requiredLineReviewsN ?? 0,
    reviewed_n: totals.reviewedN ?? 0,
    unrequested_n: totals.unrequestedN ?? 0,
    pending_n: totals.pendingN ?? 0,
    overdue_n: totals.overdueN ?? 0,
    declined_n: totals.declinedN ?? 0,
    expired_n: totals.expiredN ?? 0,
    stale_n: totals.staleN ?? 0,
    unverifiable_n: totals.unverifiableN ?? 0,
    single_line_excluded_n: totals.singleLineExcludedN ?? 0,
    withheld_rows_n: (totals.withheldRowsN || 0) + (totals.hiddenCurrentRowsN || 0),
    coverage_pct: totals.coverageWithheld ? '' : (totals.coveragePct ?? ''),
    coverage_withheld: totals.coverageWithheld === true,
    coverage_withheld_reason: totals.coverageWithheldReason || '',
    clearance_state: totals.clearanceState || 'withheld',
  }];
}

export function changeImpactBriefText(report) {
  const totals = report?.totals || {};
  if (!totals.requiredLineReviewsN) {
    if (totals.incompletePeopleN) {
      return `Matrix change-impact line reviews — ${report?.today || 'today'}: ${totals.incompletePeopleN} impacted person(s) have an unreadable active Matrix line set. The required-line denominator is incomplete and coverage is withheld; no review, consent or permission to proceed is inferred.`;
    }
    return `Matrix change-impact line reviews — ${report?.today || 'today'}: no in-scope active multi-line impact review is currently required. A single-line person is excluded, not counted as reviewed.`;
  }
  const coverage = totals.coverageWithheld
    ? `Coverage withheld: ${totals.coverageWithheldReason}`
    : `Current coverage ${totals.reviewedN}/${totals.requiredLineReviewsN} (${totals.coveragePct}%).`;
  return [
    `Matrix change-impact line reviews — ${report.today}.`,
    `${report.changesN} open change(s), ${report.multiLinePeopleN} in-scope multi-line person(s), ${totals.requiredLineReviewsN} required line review(s).`,
    coverage,
    `${totals.unrequestedN} unrequested, ${totals.pendingN} pending, ${totals.overdueN} overdue, ${totals.declinedN} declined, ${totals.expiredN} expired, ${totals.staleN} stale, and ${totals.unverifiableN} unverifiable.`,
    'A line review is not approval, consent or permission to proceed; no silence counts as a response.',
  ].join(' ');
}
