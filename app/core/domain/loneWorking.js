/**
 * app/core/domain/loneWorking.js — the ONE reader of the Lone-Working Welfare
 * Check Register (ADR-0242, Schema v196, `#/lone-working`).
 *
 * Every state, deadline, lateness, overrun, line position and count this module
 * prints is derived here, on read, from stored declarations and the injected
 * clock. Nothing derived is stored anywhere, so the same workspace read twice
 * gives the same answer and a hand-edited file cannot carry a deadline that
 * disagrees with the interval beside it.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER DEPLOYMENT: *at this minute, what does
 * the record actually prove about a person who is working alone?* The answer is
 * one of ten states, and each is a DIFFERENT fact:
 *
 *   concern-unanswered     contact was made and the person raised a concern; the
 *                          clock reset, but nobody has recorded a response. A
 *                          radio check is not an answer to "I do not feel well".
 *   welfare-unconfirmed    the declared interval AND grace passed with no contact
 *                          and no escalation on the record.
 *   escalation-open        the contact is overdue and an escalation exists, but
 *                          no hand has recorded welfare as confirmed.
 *   welfare-confirmed-late overdue past the grace, then confirmed. The exact late
 *                          minutes stay printed — confirmation does not un-late it.
 *   check-due              the interval passed, the deployment is inside its grace.
 *   overran                past the declared end with no close-out recorded.
 *   checked-in             contact inside the interval.
 *   not-yet-due            no contact is expected yet.
 *   closed-out             closed out, with at least one contact ever recorded.
 *   closed-without-contact closed out with NO contact ever recorded — the register
 *                          cannot prove welfare was ever confirmed at any point.
 *
 * WHY `welfare-unconfirmed` AND NOT "missing". A records system cannot know where
 * a human being is. The strongest honest claim is that the record has no contact
 * and nobody has confirmed welfare; asserting more would be the register inventing
 * a fact about the world, which is exactly what the Bulletproof Reliability
 * Mandate forbids. The state is deliberately not called `missing`, and the screen
 * says so in the leader's language.
 *
 * WHY THE TWO CLOCKS ARE BOTH PRINTED. The DECLARED DEADLINE (`last contact +
 * interval`) is when the next check is owed; the GRACE DEADLINE (`+ grace`) is
 * when silence becomes overdue. A supervisor reading only one of them either
 * escalates every ordinary late radio or misses a real one. Both are computed
 * from the LAST CONTACT, or from the declared start when there has never been one,
 * and never from the deployment's creation instant.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). The deployment is declared by ONE line
 * holder, but the person may hold several lines today. The reader resolves every
 * ACTIVE line through the one matrix engine and addresses the rule's asks to
 * `matrixJointApex` over all of them — never to the declaring line on another
 * line's behalf, and never to the person, who is the one the whole register
 * exists to protect. A person is counted ONCE in every people figure.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  LWK_ENGINE_VERSION,
  LWK_STATE_BY_KEY,
  LWK_STATE_KEYS,
} from './loneWorkingRegistry.js';
import {
  normalizeLwkCheckins,
  normalizeLwkDeployments,
  normalizeLwkEscalations,
  normalizeLwkMarkers,
  normalizeLwkSettings,
} from './loneWorkingSchema.js';
import { instantMs, latenessMinutes as lateBy, overrunMinutes as overBy } from './loneWorkingMath.js';
import { auditLwkChronology } from './loneWorkingChronology.js';

const list = (value) => (Array.isArray(value) ? value : []);

export function loneWorkingHoldsPerson(seat, personId) {
  return Boolean(personId && (!seat || seat.fullAccess || (!seat.readOnly && (
    personId === (seat.nodeId || seat.id) || seat.scope?.has(personId) || seat.lineScope?.has(personId)
  ))));
}

export function loneWorkingShowsDetails(seat) {
  return !seat || seat.fullAccess || (!seat.readOnly && Number.isInteger(seat.rank) && seat.rank <= 3);
}

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function lwkPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 *
 * Read from the ONE matrix engine, so this register cannot drift from every other
 * roll-up in the workspace. A line that is not active today creates no welfare
 * duty, because nobody is handing that person work through it.
 */
export function lwkActiveLinesFor(matrix, personId) {
  const lines = matrix?.linesByPerson?.get(personId) || [];
  return lines
    .filter((line) => line && line.active !== false && line.managerId && line.managerId !== personId)
    .map((line) => ({
      lineId: line.id || null,
      managerId: line.managerId,
      kind: line.kind || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
    }))
    .sort((a, b) => String(a.managerId).localeCompare(String(b.managerId)));
}

/**
 * THE STATE KERNEL. Pure over (deployment, its contacts, its escalations, nowMs),
 * exported so the suite can pin every branch without a store and so the rule and
 * the screen cannot disagree about a state.
 *
 * Every figure it returns is an exact whole number of minutes or null; it never
 * returns an approximation, and a null is always accompanied by the reason the
 * figure could not be computed.
 */
export function deriveLwkState({ deployment, checkins = [], escalations = [], nowMs }) {
  const startMs = instantMs(deployment?.startAt);
  const endMs = instantMs(deployment?.expectedEndAt);
  const reportedClose = instantMs(deployment?.closedAt);
  const closedMs = reportedClose !== null && reportedClose <= nowMs ? reportedClose : null;
  const readingMs = closedMs ?? nowMs;
  // Chronology retains contradictory acts as evidence. They cannot reset this clock
  // or turn a close with no in-window contact into a contact-supported close.
  const inWindow = (value) => {
    const ms = instantMs(value);
    return ms !== null && ms >= startMs && ms <= readingMs;
  };

  const sortedContacts = list(checkins)
    .filter((row) => inWindow(row?.at))
    .sort((a, b) => instantMs(a.at) - instantMs(b.at) || String(a.id).localeCompare(String(b.id)));
  const sortedEscalations = list(escalations)
    .filter((row) => inWindow(row?.raisedAt))
    .sort((a, b) => instantMs(a.raisedAt) - instantMs(b.raisedAt) || String(a.id).localeCompare(String(b.id)));

  const lastContact = sortedContacts.length ? sortedContacts[sortedContacts.length - 1] : null;
  const lastEscalation = sortedEscalations.length ? sortedEscalations[sortedEscalations.length - 1] : null;
  const lastContactMs = lastContact ? instantMs(lastContact.at) : startMs;

  const interval = Number.isInteger(deployment?.intervalMinutes) ? deployment.intervalMinutes : null;
  const grace = Number.isInteger(deployment?.graceMinutes) ? deployment.graceMinutes : null;

  const dueAtMs = Number.isFinite(lastContactMs) && interval !== null ? lastContactMs + interval * 60_000 : null;
  const overdueAtMs = Number.isFinite(dueAtMs) && grace !== null ? dueAtMs + grace * 60_000 : null;

  /**
   * A CLOSED DEPLOYMENT IS READ AT ITS CLOSE, NOT AT THIS MINUTE. Reading it
   * against the wall clock would print a lateness that kept growing after a human
   * had ended the deployment — a figure about a period that no longer exists.
   * At the close it is the lateness the record actually carried when somebody
   * ended it, which is the only defensible reading.
   */
  const minutesSinceContact = Number.isFinite(lastContactMs) && Number.isFinite(readingMs) && readingMs >= lastContactMs
    ? Math.floor((readingMs - lastContactMs) / 60_000)
    : null;

  /**
   * A concern is OPEN when the last contact raised one and no escalation has been
   * recorded AT OR AFTER that contact. An escalation recorded before the concern
   * answers something else and cannot answer this.
   */
  const concernOpen = Boolean(lastContact && lastContact.outcome === 'concern'
    && !sortedEscalations.some((row) => instantMs(row.raisedAt) >= instantMs(lastContact.at)));

  const late = Number.isFinite(overdueAtMs) ? lateBy(readingMs, overdueAtMs) : null;

  /**
   * Welfare is CONFIRMED LATE only by an escalation at or after the overdue
   * instant that recorded `welfare-confirmed`. A confirmation recorded while the
   * contact was merely due confirms nothing about a missed check.
   */
  const confirmed = Number.isFinite(overdueAtMs)
    ? [...sortedEscalations].reverse().find((row) => row.outcome === 'welfare-confirmed' && instantMs(row.raisedAt) >= overdueAtMs) || null
    : null;

  const escalatedSinceDue = Number.isFinite(dueAtMs)
    ? sortedEscalations.some((row) => instantMs(row.raisedAt) >= dueAtMs)
    : false;

  const overrun = Number.isFinite(endMs) && Number.isFinite(readingMs) ? overBy(readingMs, endMs) : null;

  const closeOverrunMinutes = closedMs !== null && Number.isFinite(endMs)
    ? Math.max(0, Math.floor((closedMs - endMs) / 60_000))
    : null;

  const base = {
    startMs,
    endMs,
    closedMs,
    dueAtMs,
    overdueAtMs,
    lastContact,
    lastEscalation,
    lastContactAt: lastContact ? lastContact.at : null,
    contactsN: sortedContacts.length,
    escalationsN: sortedEscalations.length,
    minutesSinceContact,
    latenessMinutes: late,
    overrunMinutes: overrun,
    closeOverrunMinutes,
    concernOpen,
    confirmedLate: Boolean(confirmed),
    escalatedSinceDue,
    /** Closed by the person themselves: printed, never hidden, never a defect by itself. */
    selfClosed: Boolean(closedMs !== null && deployment?.closedById && deployment.closedById === deployment.personId),
  };

  const stateFor = (key) => ({ key, ...LWK_STATE_BY_KEY[key] });

  if (closedMs !== null) {
    return { ...base, state: stateFor(sortedContacts.length ? 'closed-out' : 'closed-without-contact') };
  }

  // An unreadable clock is not a licence to print "nothing is wrong".
  if (!Number.isFinite(nowMs) || dueAtMs === null || overdueAtMs === null) {
    return {
      ...base,
      state: stateFor('not-yet-due'),
      unreadableClock: true,
    };
  }

  if (concernOpen) return { ...base, state: stateFor('concern-unanswered') };
  if (late > 0) {
    if (confirmed) return { ...base, state: stateFor('welfare-confirmed-late') };
    if (escalatedSinceDue) return { ...base, state: stateFor('escalation-open') };
    return { ...base, state: stateFor('welfare-unconfirmed') };
  }
  if (nowMs > dueAtMs) return { ...base, state: stateFor('check-due') };
  if (Number.isFinite(endMs) && nowMs > endMs) return { ...base, state: stateFor('overran') };
  if (sortedContacts.length) return { ...base, state: stateFor('checked-in') };
  return { ...base, state: stateFor('not-yet-due') };
}

/**
 * The whole register, one pass.
 *
 * `seat` only narrows disclosure; with no seat the reading is the whole record,
 * exactly as every other register in this workspace behaves, so a headless export
 * and an operator screen cannot disagree about a figure.
 */
export function buildLoneWorking(state, {
  now = new Date(), settings = null, seat = null, chronologyPage = 1, loadWarnings = [],
} = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeLwkSettings(cfg);

  const allDeployments = normalizeLwkDeployments(state?.lwkDeployments, warnings);
  const allCheckins = normalizeLwkCheckins(state?.lwkCheckins, allDeployments, warnings);
  const allEscalations = normalizeLwkEscalations(state?.lwkEscalations, allDeployments, warnings);
  const scoped = Boolean(seat && !seat.fullAccess);
  const deployments = scoped ? allDeployments.filter((row) => loneWorkingHoldsPerson(seat, row.personId)) : allDeployments;
  const deploymentIds = new Set(deployments.map((row) => row.id));
  const checkins = scoped ? allCheckins.filter((row) => deploymentIds.has(row.deploymentId)) : allCheckins;
  const escalations = scoped ? allEscalations.filter((row) => deploymentIds.has(row.deploymentId)) : allEscalations;
  const chronologySourceIncomplete = [...warnings, ...loadWarnings].some((line) =>
    /^\[lone-working\] the (deployment|contact|escalation) ledger|^\[lone-working\] \d+ (deployment|contact|escalation) row/.test(line));
  const markers = scoped ? [] : normalizeLwkMarkers(state?.lwkMarkers, warnings);
  const sourceWarnings = [...new Set([...warnings, ...loadWarnings.filter((line) => line.startsWith('[lone-working] '))])];
  // Rejected source records cannot be attributed to a span. Flag incomplete
  // input without publishing counts or reasons about records on a peer's line.
  const visibleWarnings = scoped && sourceWarnings.length
    ? ['Some lone-working source rows were refused. Their reporting scope is unknown.'] : sourceWarnings;

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = scoped ? 'The reporting graph could not be read.'
      : `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  const contactsByDeployment = new Map();
  for (const row of checkins) {
    const held = contactsByDeployment.get(row.deploymentId) || [];
    held.push(row);
    contactsByDeployment.set(row.deploymentId, held);
  }
  const escalationsByDeployment = new Map();
  for (const row of escalations) {
    const held = escalationsByDeployment.get(row.deploymentId) || [];
    held.push(row);
    escalationsByDeployment.set(row.deploymentId, held);
  }

  /* ------------------------------------------------------------------ rows */

  const rows = [];
  let orphanN = 0;
  for (const deployment of deployments) {
    const orphan = !matrixNodeIds.has(deployment.personId);
    if (orphan) orphanN += 1;
    const lines = orphan ? [] : lwkActiveLinesFor(matrix, deployment.personId);
    const apex = lines.length ? matrixJointApex(matrix, lines.map((line) => line.managerId)) : null;
    const derived = deriveLwkState({
      deployment,
      checkins: contactsByDeployment.get(deployment.id) || [],
      escalations: escalationsByDeployment.get(deployment.id) || [],
      nowMs,
    });
    rows.push({
      deployment,
      person: scoped || orphan ? null : (matrix?.nodes?.get(deployment.personId) || matrix?.roster?.get(deployment.personId) || null),
      personName: orphan ? null : lwkPersonLabel(matrix, deployment.personId),
      orphan,
      lines: lines.map((line) => ({ ...line, name: lwkPersonLabel(matrix, line.managerId), isDeclaring: line.managerId === deployment.lineManagerId })),
      declaringLineName: lwkPersonLabel(matrix, deployment.lineManagerId),
      declaringLineIsActive: lines.some((line) => line.managerId === deployment.lineManagerId),
      apex,
      checkins: derived ? (contactsByDeployment.get(deployment.id) || []) : [],
      escalations: escalationsByDeployment.get(deployment.id) || [],
      ...derived,
    });
  }
  rows.sort((a, b) => String(b.deployment.startAt).localeCompare(String(a.deployment.startAt)) || String(a.deployment.id).localeCompare(String(b.deployment.id)));

  /* -------------------------------------------------------------- states */

  const states = Object.fromEntries(LWK_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const openRows = rows.filter((row) => row.closedMs === null);
  const closedRows = rows.filter((row) => row.closedMs !== null);

  const unconfirmedN = states['welfare-unconfirmed'] || 0;
  const escalationOpenN = states['escalation-open'] || 0;
  const confirmedLateN = states['welfare-confirmed-late'] || 0;
  const concernN = states['concern-unanswered'] || 0;
  const checkDueN = states['check-due'] || 0;
  const overranN = states.overran || 0;
  const closedWithoutContactN = states['closed-without-contact'] || 0;

  const unconfirmedMinutes = rows
    .filter((row) => ['welfare-unconfirmed', 'escalation-open', 'welfare-confirmed-late'].includes(row.state.key))
    .reduce((sum, row) => sum + (Number.isInteger(row.latenessMinutes) ? row.latenessMinutes : 0), 0);
  const overrunMinutes = rows
    .filter((row) => row.state.key === 'overran')
    .reduce((sum, row) => sum + (Number.isInteger(row.overrunMinutes) ? row.overrunMinutes : 0), 0);

  const people = new Set(rows.map((row) => row.deployment.personId));

  /**
   * TWO CLAIMS, PRINTED APART (Bulletproof Reliability Mandate).
   *   `statesReconcile` — every printed state count re-adds to the deployments.
   *   `contactsReconcile` / `escalationsReconcile` — every contact and escalation
   *     is attached to a deployment that is still on the record.
   * `figuresComplete` is a SEPARATE claim about provenance, and neither one is
   * folded into a state or into the other.
   */
  const stateTotal = Object.values(states).reduce((sum, n) => sum + n, 0);
  const balances = {
    statesReconcile: stateTotal === deployments.length,
    contactsReconcile: checkins.every((row) => deploymentIds.has(row.deploymentId)),
    escalationsReconcile: escalations.every((row) => deploymentIds.has(row.deploymentId)),
  };

  const incompleteReasons = [];
  if (visibleWarnings.length) incompleteReasons.push('Some lone-working inputs were refused; see the source warnings. No figures were repaired.');
  if (orphanN) incompleteReasons.push(`${orphanN} deployment(s) name a person who is not on the active reporting graph; their lines cannot be resolved and their joint seat cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the deployments they summarise.');
  if (!balances.contactsReconcile) incompleteReasons.push('A contact is not attached to a deployment on the record.');
  if (!balances.escalationsReconcile) incompleteReasons.push('An escalation is not attached to a deployment on the record.');
  if (deployments.length && rows.every((row) => row.state.key === 'not-yet-due')) {
    incompleteReasons.push('No deployment on this record has ever been contacted or closed out, so no timing figure has yet been proved.');
  }

  /* ---------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const line of row.lines) {
      const entry = byLine.get(line.managerId) || {
        managerId: line.managerId,
        managerName: line.name,
        deploymentsN: 0,
        openN: 0,
        unconfirmedN: 0,
        overranN: 0,
        concernN: 0,
        people: new Set(),
        declaringN: 0,
      };
      entry.deploymentsN += 1;
      if (row.closedMs === null) entry.openN += 1;
      if (row.state.key === 'welfare-unconfirmed') entry.unconfirmedN += 1;
      if (row.state.key === 'overran') entry.overranN += 1;
      if (row.state.key === 'concern-unanswered') entry.concernN += 1;
      if (line.isDeclaring) entry.declaringN += 1;
      entry.people.add(row.deployment.personId);
      byLine.set(line.managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({
      ...entry,
      peopleN: entry.people.size,
      people: [...entry.people].sort(),
    }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  /** Deployments whose DECLARING line has since stopped holding the person. */
  const declaringLineGoneN = openRows.filter((row) => !row.orphan && !row.declaringLineIsActive).length;

  /* ------------------------------------------------------------ disclosure */

  const detailed = loneWorkingShowsDetails(seat);
  const chronology = chronologyPage === null ? null : auditLwkChronology(rows, {
    nowMs, detailed, page: chronologyPage, sourceIncomplete: chronologySourceIncomplete,
  });
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Person-level rows are withheld above rank 3; this reading prints counts and exact minutes. Where a named human being is alone at this minute is individual safety material, not executive reading.',
      rank: seat?.rank ?? null,
    };

  return {
    ok: true,
    engineVersion: LWK_ENGINE_VERSION,
    matrix: scoped ? null : matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    deployments: detailed ? deployments : [],
    checkins: detailed ? checkins : [],
    escalations: detailed ? escalations : [],
    markers: detailed ? markers : [],
    rows: detailed ? rows : [],
    openRows: detailed ? openRows : [],
    closedRows: detailed ? closedRows : [],
    chronology,
    scoped,
    detailed: Boolean(detailed),
    disclosure,
    warnings: visibleWarnings,
    matrixError,
    orphanN,
    declaringLineGoneN,
    states,
    stateTotal,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals: {
      deployments: deployments.length,
      open: openRows.length,
      closed: closedRows.length,
      people: people.size,
      checkins: checkins.length,
      escalations: escalations.length,
      checkDueN,
      unconfirmedN,
      escalationOpenN,
      confirmedLateN,
      concernN,
      overranN,
      closedWithoutContactN,
      selfClosedN: rows.filter((row) => row.selfClosed).length,
      unconfirmedMinutes,
      overrunMinutes,
      linesN: lineRows.length,
    },
    lineRows: detailed ? lineRows : [],
    stateRows: LWK_STATE_KEYS.map((key) => ({ key, label: LWK_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    attention: {
      unconfirmedN,
      concernN,
      overranN,
      checkDueN,
      total: unconfirmedN + concernN + overranN + checkDueN,
    },
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — welfare unconfirmed,
 * a concern nobody answered, a deployment past its declared end, and a check owed
 * inside its grace — and never every open deployment, so the badge reads as "work
 * owed now" rather than "people currently at work".
 */
export function loneWorkingAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    if (!state?.lwkDeployments?.length) return 0;
    const report = buildLoneWorking(state, { now, settings, seat, chronologyPage: null });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Three facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a person.
 */
export function loneWorkingSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildLoneWorking(state, { now, settings, seat: null, chronologyPage: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Lone working', route: '#/lone-working', ...signal });

  if (report.totals.unconfirmedN) {
    add({
      ruleId: 'LWK-01',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.unconfirmedN} lone deployment(s) with welfare unconfirmed`,
      detail: `The declared interval and grace have passed with no contact and no escalation on the record, ${report.totals.unconfirmedMinutes} whole minute(s) past their declared deadlines in total. The register does not know where these people are and does not claim to; it knows nobody has confirmed they are safe.`,
      action: { label: 'Open the lone-working register', route: '#/lone-working' },
      evidence: [
        `${report.totals.open} open deployment(s)`,
        `${report.totals.linesN} reporting line(s) involved`,
      ],
    });
  }

  if (report.totals.concernN) {
    add({
      ruleId: 'LWK-02',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.concernN} concern(s) raised at a check-in and never answered`,
      detail: 'A person made contact and said something was wrong. The clock reset, which is correct, and no escalation has been recorded since — so the record shows contact and no response. A radio check is not an answer.',
      action: { label: 'See the unanswered concerns', route: '#/lone-working?view=now' },
      evidence: [`${report.totals.checkins} contact(s) on the record`],
    });
  }

  if (report.totals.overranN) {
    add({
      ruleId: 'LWK-03',
      severity: 4,
      confidence: 'high',
      title: `${report.totals.overranN} deployment(s) past their declared end and not closed out`,
      detail: `These ran past the end their own declaration set, ${report.totals.overrunMinutes} whole minute(s) in total, and nobody has recorded that the person is off site. Time cannot end a deployment a human did not end.`,
      action: { label: 'See the overruns', route: '#/lone-working?view=lines' },
      evidence: [`${report.totals.closed} deployment(s) closed out`],
    });
  }

  if (report.totals.closedWithoutContactN) {
    add({
      ruleId: 'LWK-04',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.closedWithoutContactN} deployment(s) closed with no contact ever recorded`,
      detail: 'The deployment was closed out and no contact exists at any point in it. The register cannot prove welfare was confirmed once, and a close by the lone worker themselves is printed as exactly that rather than as a supervisor’s confirmation.',
      action: { label: 'Open the history', route: '#/lone-working?view=history' },
      evidence: [`${report.totals.selfClosedN} close-out(s) recorded by the deployed person themselves`],
    });
  }

  return signals;
}
