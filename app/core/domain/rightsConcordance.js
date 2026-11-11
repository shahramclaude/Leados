/**
 * app/core/domain/rightsConcordance.js — the Matrix Decision-Right Execution
 * Concordance's pure read model (ADR-0145, Schema v121 unchanged,
 * `#/matrix?panel=concordance`, CSV scope #108).
 *
 * THE QUESTION, ASKED PER COMPLETED DECISION
 * -------------------------------------------
 * The Matrix Accountability Ledger declares which decision rights each line
 * holds over the people on it. The decision log records who actually decided
 * and who was consulted. This module joins the two, date by date:
 *
 *     A completed decision names its approver.
 *     The subject — whose lines' rights govern — is resolved ONLY through
 *     typed provenance edges the workspace already writes: a link to a
 *     person, or a link to a case whose owner is a person. A decision with
 *     no such edge is counted UNSCOPED, never guessed.
 *
 *     On the decision date, the subject's ACTIVE lines (re-derived by the
 *     real `buildMatrix` at that date) attribute six RAPID rights to named
 *     managers. The concordance then asks four things:
 *       1. did the recorded decider hold ANY declared right on those lines?
 *          (no → `bypass`)
 *       2. was any right the decider held also held by a second manager?
 *          (yes → `contested-decided`, the duplicate-approval risk)
 *       3. was any right on those lines held by NOBODY? (yes →
 *          `unresolved-authority`: the decision filled the gap)
 *       4. was every manager holding an OPERATIONAL right consulted?
 *          (no → `consult-gap`)
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - It never rates, ranks or scores a person. A bypass is a statement about
 *    a decision against a declared line structure, and the fix is a line
 *    declaration — the module says so instead of moving the argument to the
 *    person.
 *  - It never guesses a subject. A decision with no typed link to a person or
 *    a case is counted as unscoped and printed; it is never attributed to the
 *    approver's own span or to a plausible person.
 *  - It never treats a missing figure as a zero. An approver name that does
 *    not resolve to the roster is a LIMIT of the comparison, counted under
 *    `unresolved-decider`, never mapped to a person and never silently
 *    dropped.
 *  - It never writes. Every figure is derived on read from the decision
 *    records, the typed graph and the declared lines; nothing is stored, so
 *    a printed finding cannot drift from the rows it describes.
 *
 * Pure module: no DOM, no storage, no implicit clock beyond the injected
 * `now` and each decision's own `decidedOn` date.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { linksForEntity } from './cases.js';
import { MATRIX_OPERATIONAL_RIGHTS, MATRIX_RIGHTS } from './matrixRegistry.js';
import {
  RIGHTS_CONCORDANCE_ENGINE_VERSION,
  RIGHTS_CONCORDANCE_FINDINGS,
  RIGHTS_CONCORDANCE_LIMITS,
  RIGHTS_CONCORDANCE_METHOD,
  RIGHTS_CONCORDANCE_SCOPE_LABELS,
} from './rightsConcordanceRegistry.js';

const FINDING_META = new Map(RIGHTS_CONCORDANCE_FINDINGS.map((f) => [f.key, f]));

/* ------------------------------------------------------------- name lookup */

/**
 * Roster name → person ids, exact and case-insensitive.
 *
 * The workspace leader holds no roster record: their name comes from the
 * settings (or the convention 'You') and maps to `LEADER_ID`, so a decision
 * recorded with the leader's own name still resolves — the leader holds the
 * home line's rights over their direct reports like any other manager.
 */
function buildNameIndex(state) {
  const index = new Map();
  const add = (name, personId) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    if (!index.get(key).includes(personId)) index.get(key).push(personId);
  };
  for (const person of Array.isArray(state?.people) ? state.people : []) {
    if (!person || person.status === 'archived') continue;
    add(person.name, person.id);
  }
  const leaderName = state?.settings?.leaderName || 'You';
  add(leaderName, LEADER_ID);
  return index;
}

/**
 * Resolve one free-text participant name to a roster person.
 * `{ resolved: true, personId }` or `{ resolved: false, reason }` where the
 * reason is `not-on-roster` or `ambiguous` — the two honest failure modes.
 */
function resolveParticipant(nameIndex, rawName) {
  const key = String(rawName || '').trim().toLowerCase();
  if (!key) return { resolved: false, reason: 'not-on-roster' };
  const ids = nameIndex.get(key);
  if (!ids || !ids.length) return { resolved: false, reason: 'not-on-roster' };
  if (ids.length > 1) return { resolved: false, reason: 'ambiguous' };
  return { resolved: true, personId: ids[0] };
}

/**
 * Split a free-text DACI field into participant names, the same grammar the
 * decision log itself uses (`decisions.js: splitParticipants`): commas,
 * semicolons, ampersands and the word "and".
 */
function splitParticipants(value) {
  return String(value || '')
    .split(/[,;&]|\band\b/i)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------- subject resolution */

/**
 * The person(s) a decision concerned, resolved ONLY through typed graph edges.
 *
 * Two routes, both written by existing engines:
 *  - a link between the decision and a `person` entity (any relation — the
 *    graph is curated provenance, not a guess);
 *  - a link between the decision and a `case` entity, whose recorded
 *    `ownerId` is the person whose work the case is about.
 *
 * Subjects not on the roster are dropped and counted as `dangling-subject`.
 * A decision with no usable subject returns `{ subjects: [] }` and is counted
 * as `unscoped` by the caller.
 */
function resolveSubjects(state, decisionId, rosterIds) {
  const subjects = [];
  const seen = new Set();
  let danglingN = 0;
  for (const item of linksForEntity(state, 'decision', decisionId)) {
    const peer = item.peer;
    if (!peer) continue;
    let personId = null;
    if (peer.type === 'person') {
      personId = peer.id;
    } else if (peer.type === 'case') {
      personId = peer.raw?.ownerId || null;
    }
    if (!personId || !rosterIds.has(personId)) {
      danglingN += 1;
      continue;
    }
    if (seen.has(personId)) continue;
    seen.add(personId);
    subjects.push(personId);
  }
  return { subjects, danglingN };
}

/* ---------------------------------------------------------- line rights at a date */

/**
 * The decision rights in force on one person's lines on one calendar date.
 *
 * Re-derives the matrix AT THE DECISION DATE through the shared engine —
 * `buildMatrix` already filters every declared line by its own window at the
 * injected date, so a line declared after the decision, or ended before it,
 * is excluded by the same code the rest of the workspace uses. The home line
 * is the roster edge and is always active; it carries the three presumed
 * stewardship rights plus whatever its declared allocation row holds inside
 * its own window.
 *
 * Returns `{ lines, rightsByManager, holdersByRight, managerIds, multiLine }`.
 */
function lineRightsAtDate(matrixAtDate, personId) {
  const lines = matrixAtDate.linesByPerson.get(personId) || [];
  const rightsByManager = new Map(); // managerId → Set(rightKey)
  const holdersByRight = new Map(); // rightKey → Set(managerId)
  for (const key of MATRIX_RIGHTS.map((r) => r.key)) holdersByRight.set(key, new Set());
  for (const line of lines) {
    const held = new Set([...(line.rights || []), ...(line.presumedRights || [])]);
    if (!rightsByManager.has(line.managerId)) rightsByManager.set(line.managerId, new Set());
    for (const right of held) {
      rightsByManager.get(line.managerId).add(right);
      holdersByRight.get(right)?.add(line.managerId);
    }
  }
  return {
    lines,
    rightsByManager,
    holdersByRight,
    managerIds: lines.map((l) => l.managerId),
    multiLine: lines.length > 1,
  };
}

/* ------------------------------------------------------------------- read model */

/**
 * THE READ. Everything is derived from the record; nothing is stored.
 *
 * @param {object} state   the workspace state (people, decisions, cases,
 *                         links, reportingLines, settings)
 * @param {object} opts    { now, settings, seat, scope } — the seat and its
 *                         scope set may be injected by `buildMatrixReport`;
 *                         when absent they are computed exactly as the matrix
 *                         report computes them.
 */
export function buildRightsConcordance(state, {
  now = new Date(),
  settings = null,
  seat = null,
  scope = undefined,
} = {}) {
  const effectiveSettings = settings || state?.settings || null;
  const today = dayKey(now);

  /* The seat and its scope, computed the same way the matrix report does —
     so a line manager's concordance is scoped to the people their line
     carries, and a full-access seat sees the workspace. */
  let seatRow = seat;
  let scopeSet = scope;
  if (scopeSet === undefined) {
    if (!seatRow) {
      const lineScope = matrixLineScopeFor(state, { now, settings: effectiveSettings });
      const built = buildSeats(state, { now, settings: effectiveSettings, lineScope });
      seatRow = activeSeat(built);
    }
    scopeSet = seatRow?.fullAccess ? null : new Set([
      ...(seatRow?.scope || []),
      ...(seatRow?.lineScope || []),
    ]);
  }
  const inScope = (personId) => !scopeSet || scopeSet.has(personId);

  const rosterIds = new Set(
    (Array.isArray(state?.people) ? state.people : [])
      .filter((p) => p && p.status !== 'archived')
      .map((p) => p.id),
  );
  rosterIds.add(LEADER_ID);
  const rosterName = (personId) => {
    if (personId === LEADER_ID) return state?.settings?.leaderName || 'You';
    return (Array.isArray(state?.people) ? state.people : [])
      .find((p) => p && p.id === personId)?.name || null;
  };
  const nameIndex = buildNameIndex(state);

  const decisionsAll = Array.isArray(state?.decisions) ? state.decisions : [];
  const completed = decisionsAll.filter((d) => d && d.chosen && d.decidedOn);

  /* One matrix per distinct decision date — the shared engine, re-run at the
     date the decision was made, never a second window implementation. */
  const matrixCache = new Map();
  const matrixAtDate = (dateStr) => {
    if (!matrixCache.has(dateStr)) {
      matrixCache.set(dateStr, buildMatrix(state, {
        now: new Date(`${dateStr}T00:00:00.000Z`),
        settings: effectiveSettings,
      }));
    }
    return matrixCache.get(dateStr);
  };

  const counts = {
    bypass: 0,
    contestedDecided: 0,
    unresolvedAuthority: 0,
    consultGap: 0,
  };
  const scopeCounts = {
    'unresolved-decider': 0,
    'unscoped-decision': 0,
    'single-line-subject': 0,
    'dangling-subject': 0,
  };
  const findingRows = [];
  const decisionRows = [];
  let auditedN = 0;
  let withFindingsN = 0;
  let cleanN = 0;
  let singleLineDecisionN = 0;
  let danglingTotal = 0;
  let shownFindingsN = 0;
  let withheldFindingsN = 0;

  for (const decision of completed) {
    const dateStr = String(decision.decidedOn);
    const { subjects, danglingN } = resolveSubjects(state, decision.id, rosterIds);
    danglingTotal += danglingN;
    if (danglingN) scopeCounts['dangling-subject'] += danglingN;

    if (!subjects.length) {
      // The record names a decider but no subject: the audit refuses to
      // guess whose lines govern.
      scopeCounts['unscoped-decision'] += 1;
      continue;
    }

    const approver = resolveParticipant(nameIndex, decision.approver);
    const contributorIds = new Set();
    for (const raw of splitParticipants(decision.contributors)) {
      const resolved = resolveParticipant(nameIndex, raw);
      if (resolved.resolved) contributorIds.add(resolved.personId);
    }

    const matrixAtDate_ = matrixAtDate(dateStr);
    const multiLineSubjects = [];
    for (const subjectId of subjects) {
      const rights = lineRightsAtDate(matrixAtDate_, subjectId);
      if (!rights.multiLine) {
        scopeCounts['single-line-subject'] += 1;
        continue;
      }
      multiLineSubjects.push({ subjectId, rights });
    }

    if (!multiLineSubjects.length) {
      // Every subject is on a single line: the rights question does not
      // exist for them (the matrix module's own scope), so the decision is
      // counted and nothing is audited.
      singleLineDecisionN += 1;
      continue;
    }

    auditedN += 1;
    if (!approver.resolved) scopeCounts['unresolved-decider'] += 1;

    const decisionKinds = new Set();
    let decisionHasFinding = false;
    for (const { subjectId, rights } of multiLineSubjects) {
      const holdersByRight = rights.holdersByRight;
      const lineKinds = [...new Set(rights.lines.map((line) => line.kind).filter(Boolean))].sort();
      const approverRights = approver.resolved
        ? (rights.rightsByManager.get(approver.personId) || new Set())
        : new Set();

      /* 1. Did the decider hold any declared right on the subject's lines? */
      if (approver.resolved && approverRights.size === 0) {
        counts.bypass += 1;
        decisionKinds.add('bypass');
        decisionHasFinding = true;
        const isManagerOfSubject = rights.managerIds.includes(approver.personId);
        findingRows.push(makeFinding(decision, subjectId, rosterName, inScope, 'bypass', {
          detail: `The recorded decider held no declared right on any of the ${rights.lines.length} active line(s) of this person on ${dateStr}`
            + `${isManagerOfSubject ? ' — they manage this person, but the declared lines give them none of the six rights' : ' — they hold no governance route to this person at all'}.`,
          rightKeys: [],
          lineKinds,
        }, approver));
      } else if (approver.resolved) {
        /* 2. Was any right the decider held also held by a second manager? */
        const contested = [...approverRights].filter((right) => (holdersByRight.get(right)?.size || 0) >= 2);
        if (contested.length) {
          counts.contestedDecided += 1;
          decisionKinds.add('contested-decided');
          decisionHasFinding = true;
          findingRows.push(makeFinding(decision, subjectId, rosterName, inScope, 'contested-decided', {
            detail: `The decider held ${contested.length} right(s) that two or more managers hold on this person's lines on ${dateStr} — the structure duplicated the authority and this decision picked one holder.`,
            rightKeys: contested,
            lineKinds,
          }, approver));
        }
      }

      /* 3. Was any right on the subject's lines held by nobody? */
      const unowned = MATRIX_RIGHTS.map((r) => r.key)
        .filter((right) => (holdersByRight.get(right)?.size || 0) === 0);
      if (unowned.length) {
        counts.unresolvedAuthority += 1;
        decisionKinds.add('unresolved-authority');
        decisionHasFinding = true;
        findingRows.push(makeFinding(decision, subjectId, rosterName, inScope, 'unresolved-authority', {
          detail: `Right(s) ${unowned.join(', ')} on this person's active lines were held by nobody on ${dateStr} — the decision itself supplied the authority the declared structure did not have.`,
          rightKeys: unowned,
          lineKinds,
        }, approver));
      }

      /* 4. Was every operational right-holder consulted? */
      for (const [managerId, heldRights] of rights.rightsByManager) {
        if (managerId === approver.personId) continue;
        const operational = [...heldRights].filter((right) => MATRIX_OPERATIONAL_RIGHTS.includes(right));
        if (!operational.length) continue;
        if (contributorIds.has(managerId)) continue;
        counts.consultGap += 1;
        decisionKinds.add('consult-gap');
        decisionHasFinding = true;
        findingRows.push(makeFinding(decision, subjectId, rosterName, inScope, 'consult-gap', {
          detail: `The manager holding ${operational.join(', ')} on this person's lines was not recorded among the decision's contributors.`,
          rightKeys: operational,
          lineKinds,
        }, approver));
      }
    }

    if (decisionHasFinding) {
      withFindingsN += 1;
      decisionRows.push({
        decisionId: decision.id,
        title: String(decision.title || 'Untitled decision').slice(0, RIGHTS_CONCORDANCE_LIMITS.titleChars),
        decidedOn: dateStr,
        approverName: approver.resolved ? rosterName(approver.personId) : null,
        approverResolved: approver.resolved,
        approverReason: approver.resolved ? null : approver.reason,
        subjectN: multiLineSubjects.length,
        kinds: [...decisionKinds].sort(),
        inScope: multiLineSubjects.some((s) => inScope(s.subjectId)),
      });
    } else {
      cleanN += 1;
    }
  }

  /* Scope the display: findings about people outside the seat's span are
     counted as withheld, never shown — the audit widens a seat to its own
     people, never sideways. */
  const shownRows = [];
  for (const row of findingRows) {
    if (row.subjectInScope) {
      shownRows.push(row);
      shownFindingsN += 1;
    } else {
      withheldFindingsN += 1;
    }
  }

  // Aggregate repeated structural configurations, not repeated people. A
  // pattern is the finding kind + the kinds of lines in force + the affected
  // rights. One decision contributes at most once to a pattern even if its
  // provenance links the same configuration to several people. The output is
  // identity-free and seat-scoped: no manager, person, decision or line id is
  // carried into this systemic CEO reading.
  const recurrenceGroups = new Map();
  const seenDecisionPatterns = new Set();
  for (const row of shownRows) {
    const lineKinds = [...new Set(row.lineKinds || [])].sort();
    const rightKeys = [...new Set(row.rightKeys || [])].sort();
    const signature = JSON.stringify([row.kind, lineKinds, rightKeys]);
    const observation = `${row.decisionId}|${signature}`;
    if (seenDecisionPatterns.has(observation)) continue;
    seenDecisionPatterns.add(observation);
    if (!recurrenceGroups.has(signature)) {
      recurrenceGroups.set(signature, {
        kind: row.kind,
        lineKinds,
        rightKeys,
        decisionIds: new Set(),
        dates: [],
      });
    }
    const group = recurrenceGroups.get(signature);
    group.decisionIds.add(row.decisionId);
    group.dates.push(row.decidedOn);
  }
  const recurrenceAll = [...recurrenceGroups.values()]
    .map((group) => ({
      kind: group.kind,
      lineKinds: group.lineKinds,
      rightKeys: group.rightKeys,
      decisionN: group.decisionIds.size,
      firstOn: [...group.dates].sort()[0] || null,
      lastOn: [...group.dates].sort().at(-1) || null,
    }))
    .filter((row) => row.decisionN >= 2)
    .sort((a, b) => b.decisionN - a.decisionN
      || a.kind.localeCompare(b.kind)
      || a.lineKinds.join('|').localeCompare(b.lineKinds.join('|'))
      || a.rightKeys.join('|').localeCompare(b.rightKeys.join('|')));
  const recurrenceObservationN = [...recurrenceGroups.values()]
    .reduce((n, group) => n + group.decisionIds.size, 0);
  const recurringObservationN = recurrenceAll.reduce((n, row) => n + row.decisionN, 0);
  const oneOffObservationN = [...recurrenceGroups.values()]
    .filter((group) => group.decisionIds.size < 2)
    .reduce((n, group) => n + group.decisionIds.size, 0);
  const recurrenceShown = recurrenceAll.slice(0, RIGHTS_CONCORDANCE_LIMITS.recurrencePatterns);
  const recurrence = {
    observationN: recurrenceObservationN,
    recurringPatternN: recurrenceAll.length,
    recurringObservationN,
    oneOffObservationN,
    rows: recurrenceShown,
    remainderN: recurrenceAll.length - recurrenceShown.length,
    /* ADR-0170: every recurring-or-not structural signature with the dated
       decisions behind it — identity-free (no decision, person or line id).
       The remedy register reads these dates for its before/after check. */
    signatures: [...recurrenceGroups.entries()].map(([signatureKey, group]) => ({
      signatureKey,
      kind: group.kind,
      lineKinds: group.lineKinds,
      rightKeys: group.rightKeys,
      decisionN: group.decisionIds.size,
      decidedOns: [...group.dates].sort(),
    })).sort((a, b) => a.signatureKey.localeCompare(b.signatureKey)),
    identity: {
      observations: recurrenceObservationN === recurringObservationN + oneOffObservationN,
      queue: recurrenceShown.length + (recurrenceAll.length - recurrenceShown.length) === recurrenceAll.length,
    },
  };

  const order = { bypass: 0, 'contested-decided': 1, 'unresolved-authority': 2, 'consult-gap': 3 };
  shownRows.sort((a, b) => {
    const kindDiff = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
    if (kindDiff !== 0) return kindDiff;
    return String(b.decidedOn).localeCompare(String(a.decidedOn));
  });
  const shown = shownRows.slice(0, RIGHTS_CONCORDANCE_LIMITS.findings);
  const remainderN = shownRows.length - shown.length;

  decisionRows.sort((a, b) => String(b.decidedOn).localeCompare(String(a.decidedOn)));
  const decisionsShown = decisionRows.slice(0, RIGHTS_CONCORDANCE_LIMITS.decisions);
  const decisionsRemainderN = decisionRows.length - decisionsShown.length;

  const totalFindingsN = counts.bypass + counts.contestedDecided + counts.unresolvedAuthority + counts.consultGap;

  return {
    engineVersion: RIGHTS_CONCORDANCE_ENGINE_VERSION,
    readOn: today,
    seat: {
      id: seatRow?.id || null,
      label: seatRow?.label || 'Undeclared operator view',
      rank: seatRow?.rank ?? null,
      fullAccess: Boolean(seatRow?.fullAccess),
    },
    decisions: {
      totalN: decisionsAll.length,
      /* ADR-0170: the dates of audited decisions in scope (identity-free). */
      auditedDates: decisionRows.map((r) => r.decidedOn),
      completedN: completed.length,
      auditedN,
      withFindingsN,
      cleanN,
      unscopedN: scopeCounts['unscoped-decision'],
      singleLineN: singleLineDecisionN,
      unresolvedDeciderN: scopeCounts['unresolved-decider'],
      danglingSubjectN: danglingTotal,
    },
    findings: {
      counts: { ...counts },
      totalN: totalFindingsN,
      shownN: shownFindingsN,
      withheldN: withheldFindingsN,
      rows: shown,
      remainderN,
    },
    decisionRows: decisionsShown,
    decisionsRemainderN,
    recurrence,
    scopeCounts: { ...scopeCounts },
    conventions: {
      consultRequiredRights: [...MATRIX_OPERATIONAL_RIGHTS],
      findingsCap: RIGHTS_CONCORDANCE_LIMITS.findings,
      decisionsCap: RIGHTS_CONCORDANCE_LIMITS.decisions,
    },
    method: RIGHTS_CONCORDANCE_METHOD,
    limits: RIGHTS_CONCORDANCE_LIMITS,
    scopeLabels: RIGHTS_CONCORDANCE_SCOPE_LABELS,
    identity: {
      audited: auditedN === withFindingsN + cleanN,
      findings: totalFindingsN === shownFindingsN + withheldFindingsN,
      queue: shown.length + remainderN === shownFindingsN,
      completed: completed.length === auditedN + scopeCounts['unscoped-decision'] + singleLineDecisionN,
    },
  };
}

/**
 * One finding row. Names are withheld exactly the way the matrix report
 * withholds them: a subject outside the seat's span prints as a count, and
 * an approver outside the span (or unresolved) prints without a name — the
 * right keys and the arithmetic always survive.
 */
function makeFinding(decision, subjectId, rosterName, inScope, kind, detail, approver) {
  const subjectInScope = inScope(subjectId);
  const approverInScope = approver.resolved ? inScope(approver.personId) : false;
  return {
    kind,
    kindLabel: FINDING_META.get(kind)?.label || kind,
    tone: FINDING_META.get(kind)?.tone || 'warn',
    decisionId: decision.id,
    title: String(decision.title || 'Untitled decision').slice(0, RIGHTS_CONCORDANCE_LIMITS.titleChars),
    decidedOn: String(decision.decidedOn),
    subjectId,
    subjectName: subjectInScope ? rosterName(subjectId) : null,
    subjectWithheld: !subjectInScope,
    approverName: approver.resolved && approverInScope ? rosterName(approver.personId) : null,
    approverResolved: approver.resolved,
    approverReason: approver.resolved ? null : approver.reason,
    contributorsN: splitParticipants(decision.contributors).length,
    rightKeys: detail.rightKeys || [],
    lineKinds: detail.lineKinds || [],
    detail: String(detail.detail).slice(0, RIGHTS_CONCORDANCE_LIMITS.detailChars),
    subjectInScope,
  };
}

/* ------------------------------------------------------------------- csv */

/**
 * CSV scope #108 (ADR-0145). Aggregate-only and identity-free: one workspace
 * row carrying every count the panel prints, one row per finding kind, and
 * NO person, NO name, NO decision id, NO decision title and NO line id. A
 * refusal or an unscoped count is a number with its label, never a zero.
 */
export function rightsConcordanceCsvRows(report) {
  const c = report?.decisions || {};
  const f = report?.findings || {};
  const recurrence = report?.recurrence || {};
  // The finding rows carry the kebab-case keys of the declared vocabulary;
  // the counts object carries the module's own camelCase accumulators. The
  // mapping is declared once, here, so the export can never silently print a
  // zero for a kind that fired.
  const countKey = {
    bypass: 'bypass',
    'contested-decided': 'contestedDecided',
    'unresolved-authority': 'unresolvedAuthority',
    'consult-gap': 'consultGap',
  };
  const rows = [];
  rows.push({
    row_kind: 'workspace',
    scope: 'workspace',
    kind: '',
    count: 1,
    decisions_read_n: c.completedN ?? 0,
    decisions_audited_n: c.auditedN ?? 0,
    decisions_with_findings_n: c.withFindingsN ?? 0,
    decisions_clean_n: c.cleanN ?? 0,
    decisions_unscoped_n: c.unscopedN ?? 0,
    decisions_single_line_n: c.singleLineN ?? 0,
    decisions_unresolved_decider_n: c.unresolvedDeciderN ?? 0,
    dangling_subject_n: c.danglingSubjectN ?? 0,
    withheld_findings_n: f.withheldN ?? 0,
    recurrence_observations_n: recurrence.observationN ?? 0,
    recurring_observations_n: recurrence.recurringObservationN ?? 0,
    one_off_observations_n: recurrence.oneOffObservationN ?? 0,
    recurring_patterns_n: recurrence.recurringPatternN ?? 0,
    recurrence_patterns_withheld_n: recurrence.remainderN ?? 0,
  });
  for (const finding of RIGHTS_CONCORDANCE_FINDINGS) {
    rows.push({
      row_kind: 'finding',
      scope: 'workspace',
      kind: finding.key,
      count: f.counts?.[countKey[finding.key]] ?? 0,
    });
  }
  for (const pattern of recurrence.rows || []) {
    rows.push({
      row_kind: 'recurrence',
      scope: 'seat',
      kind: pattern.kind,
      line_kinds: pattern.lineKinds.join('|'),
      right_keys: pattern.rightKeys.join('|'),
      decisions_n: pattern.decisionN,
      first_decision_on: pattern.firstOn,
      last_decision_on: pattern.lastOn,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ brief */

/**
 * The identity-free one-liner the matrix brief carries. Counts only: no
 * person, no decision, no line.
 */
export function rightsConcordanceBriefText(report) {
  if (!report || !report.decisions) return '';
  const c = report.decisions;
  const f = report.findings;
  if (!c.auditedN) {
    return c.completedN
      ? `Concordance: ${c.completedN} completed decision(s) read, none with a multi-line subject in the record.`
      : 'Concordance: no completed decisions in the record.';
  }
  const recurrence = report.recurrence || { recurringPatternN: 0 };
  return `Concordance: ${c.completedN} completed decision(s), ${c.auditedN} audited against the declared line rights — `
    + `${f.counts.bypass} outside the declared rights, ${f.counts.contestedDecided} on contested rights, `
    + `${f.counts.unresolvedAuthority} filling unowned right(s), ${f.counts.consultGap} right-holder(s) not consulted; `
    + `${recurrence.recurringPatternN} recurring structural pattern(s), `
    + `${c.unscopedN} unscoped, ${c.unresolvedDeciderN} decider(s) not on the roster.`;
}
