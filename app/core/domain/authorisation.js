/**
 * app/core/domain/authorisation.js — the ONE reader of the Statutory Authorisation
 * & Licence-to-Operate Register (ADR-0247, Schema v201, `#/authorisations`).
 *
 * Every state, effective expiry, lapsed minute, day to expiry, condition verdict,
 * action verdict, line position and count this module prints is derived here, on
 * read, from stored declarations and the injected clock. Nothing derived is stored
 * anywhere, so the same workspace read twice gives the same answer and a
 * hand-edited file cannot carry a green tick that disagrees with the expiry beside
 * it.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER AUTHORITY: *at this instant, what does
 * the record actually prove about our power to operate?* The answer is one of nine
 * states, and each is a DIFFERENT fact:
 *
 *   revoked                  a revocation stands; only a new declaration restores a
 *                            power to operate.
 *   suspended                suspended and no lifting act is recorded.
 *   prohibited               a prohibition notice stands against the activity. The
 *                            licence may still be in force; the ACTIVITY is stopped.
 *   lapsed-awaiting-decision the expiry passed and a renewal is submitted but
 *                            undecided. A submission is not a grant.
 *   lapsed                   the expiry passed with neither a renewal nor a stop on
 *                            the record.
 *   not-yet-granted          the declared grant instant is still ahead.
 *   renewal-in-flight        in force, with a submitted undecided renewal.
 *   expiring                 in force, inside the renewal lead time it declared.
 *   in-force                 in force, outside its renewal window.
 *
 * WHY `lapsed` DOES NOT SAY "OPERATING WITHOUT A LICENCE". The record proves the
 * authority lapsed. It cannot prove whether lorries were loaded afterwards; the
 * register holds no operating log. The flag `noStopRecorded` is printed with the
 * exact wording that says what the record lacks, and the screen never upgrades it
 * into an allegation.
 *
 * WHY THE EFFECTIVE EXPIRY IS DERIVED. A granted renewal carries a new expiry; the
 * authority is in force to the LATEST granted expiry, from the recorded decision
 * instant. The reader prints the declared expiry, the grant that moved it and the
 * effective one, so nobody has to guess which date the screen means.
 *
 * WHY CLOSED ACTIONS ARE READ AT THIS INSTANT, NOT AT THEIR CLOSE. A notice that
 * was complied with last year did what it did; the reader prints it in the history
 * and stops treating it as standing. A closure dated in the future is not yet a
 * closure: the notice stands until the instant the close names.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). An authority names one to four accountable
 * hands. The reader resolves every ACTIVE line that holds each of them through the
 * one matrix engine, prints each hand’s line position, counts a person ONCE, and
 * exposes the joint apex over every manager of every holder for the rule. It never
 * picks one holder as “the owner”; where the record names several, the duty sits
 * above all of them, and the screen says so.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  LTO_CONDITION_STATE_BY_KEY,
  LTO_ENGINE_VERSION,
  LTO_STATE_BY_KEY,
  LTO_STATE_KEYS,
  LTO_ACTION_KIND_BY_KEY,
  LTO_CLOSE_KIND_BY_KEY,
} from './authorisationRegistry.js';
import {
  normalizeLtoActions,
  normalizeLtoAuthorisations,
  normalizeLtoConditions,
  normalizeLtoEvidence,
  normalizeLtoMarkers,
  normalizeLtoRenewals,
  normalizeLtoSettings,
} from './authorisationSchema.js';
import { daysToExpiry, instantMs, lapsedMinutes, renewalWindowOpensMs } from './authorisationMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function ltoPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * Every ACTIVE line that holds a person, as `{ managerId, kind, shareH, lineId }`.
 * Read from the ONE matrix engine, so this register cannot drift from every other
 * roll-up in the workspace.
 */
export function ltoActiveLinesFor(matrix, personId) {
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
 * THE STATE KERNEL. Pure over (authority, its conditions, evidence, actions,
 * renewals, nowMs), exported so the suite can pin every branch without a store and
 * so the rule and the screen cannot disagree about a state.
 */
export function deriveLtoState({ authorisation, conditions = [], evidence = [], actions = [], renewals = [], nowMs }) {
  const grantedMs = instantMs(authorisation?.grantedAt);
  const declaredExpiresMs = instantMs(authorisation?.expiresAt);
  const leadDays = Number.isInteger(authorisation?.renewalLeadDays) ? authorisation.renewalLeadDays : null;

  const grantedRenewals = list(renewals)
    .filter((row) => row?.decision === 'granted' && instantMs(row.grantedExpiresAt) !== null)
    .sort((a, b) => instantMs(a.decidedAt) - instantMs(b.decidedAt) || String(a.id).localeCompare(String(b.id)));
  const latestGrant = grantedRenewals.length ? grantedRenewals[grantedRenewals.length - 1] : null;

  const expiresMs = Number.isFinite(declaredExpiresMs)
    ? Math.max(declaredExpiresMs, ...grantedRenewals.map((row) => instantMs(row.grantedExpiresAt)))
    : null;

  const undecided = list(renewals)
    .filter((row) => row?.decision === null || row?.decision === undefined)
    .sort((a, b) => instantMs(b.submittedAt) - instantMs(a.submittedAt) || String(a.id).localeCompare(String(b.id)));
  const renewalInFlight = undecided.length ? undecided[0] : null;
  const refusedN = list(renewals).filter((row) => row?.decision === 'refused').length;

  const today = Number.isFinite(nowMs) ? dayKey(new Date(nowMs)) : null;
  const actionsActive = list(actions).filter((row) => {
    const effectiveMs = instantMs(row?.effectiveFrom);
    if (!Number.isFinite(effectiveMs) || !Number.isFinite(nowMs) || effectiveMs > nowMs) return false;
    const closedMs = row?.closedAt ? instantMs(row.closedAt) : null;
    return closedMs === null || closedMs > nowMs;
  });
  const revocation = actionsActive.find((row) => row.kind === 'revocation') || null;
  const suspension = actionsActive.find((row) => row.kind === 'suspension') || null;
  const prohibition = actionsActive.find((row) => row.kind === 'prohibition-notice') || null;
  const improvementOpen = actionsActive.filter((row) => row.kind === 'improvement-notice');
  const improvementOverdue = improvementOpen.filter((row) => row.dueOn && today && row.dueOn < today);
  const variationOnRecordN = list(actions).filter((row) => row.kind === 'condition-variation').length;
  const closeIgnoredN = list(actions).filter((row) => row.closeIgnored).length;

  const conditionRows = list(conditions).map((condition) => {
    const mine = list(evidence)
      .filter((row) => row?.conditionId === condition.id && instantMs(row.at) !== null)
      .sort((a, b) => instantMs(b.at) - instantMs(a.at) || String(a.id).localeCompare(String(b.id)));
    const latest = mine.length ? mine[0] : null;
    let key = 'unevidenced';
    let ageDays = null;
    if (latest) {
      ageDays = Number.isFinite(nowMs) ? daysToExpiry(nowMs, instantMs(latest.at)) * -1 : null;
      if (ageDays === null) key = 'unevidenced';
      else if (condition.maxAgeDays > 0 && ageDays > condition.maxAgeDays) key = 'stale';
      else key = 'current';
    }
    return {
      condition,
      latestEvidence: latest,
      evidenceN: mine.length,
      ageDays,
      state: { key, ...LTO_CONDITION_STATE_BY_KEY[key] },
    };
  });
  const unevidencedN = conditionRows.filter((row) => row.state.key === 'unevidenced').length;
  const staleN = conditionRows.filter((row) => row.state.key === 'stale').length;
  const currentN = conditionRows.filter((row) => row.state.key === 'current').length;

  const lapsedMin = Number.isFinite(expiresMs) && Number.isFinite(nowMs) ? lapsedMinutes(nowMs, expiresMs) : null;
  const daysLeft = Number.isFinite(expiresMs) && Number.isFinite(nowMs) ? daysToExpiry(nowMs, expiresMs) : null;
  const windowOpensMs = Number.isFinite(expiresMs) && leadDays !== null ? renewalWindowOpensMs(expiresMs, leadDays) : null;

  const lapsed = Number.isFinite(expiresMs) && Number.isFinite(nowMs) ? nowMs >= expiresMs : false;
  const notYet = Number.isFinite(grantedMs) && Number.isFinite(nowMs) ? nowMs < grantedMs : false;
  const inForce = Number.isFinite(grantedMs) && Number.isFinite(expiresMs) && Number.isFinite(nowMs)
    ? nowMs >= grantedMs && nowMs < expiresMs
    : false;
  const insideWindow = inForce && Number.isInteger(daysLeft) && leadDays !== null && daysLeft <= leadDays;

  const stateFor = (key) => ({ key, ...LTO_STATE_BY_KEY[key] });
  let state;
  if (revocation) state = stateFor('revoked');
  else if (suspension) state = stateFor('suspended');
  else if (prohibition) state = stateFor('prohibited');
  else if (notYet) state = stateFor('not-yet-granted');
  else if (lapsed) state = stateFor(renewalInFlight ? 'lapsed-awaiting-decision' : 'lapsed');
  else if (renewalInFlight) state = stateFor('renewal-in-flight');
  else if (insideWindow) state = stateFor('expiring');
  else state = stateFor('in-force');

  return {
    grantedMs,
    declaredExpiresAt: authorisation?.expiresAt || null,
    declaredExpiresMs,
    effectiveExpiresAt: Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null,
    expiresMs,
    renewalLeadDays: leadDays,
    renewalWindowOpensAt: Number.isFinite(windowOpensMs) ? new Date(windowOpensMs).toISOString() : null,
    latestGrant,
    grantedRenewalN: grantedRenewals.length,
    renewalInFlight,
    refusedN,
    lapsed,
    notYet,
    inForce,
    insideWindow,
    lapsedMinutes: lapsedMin,
    daysToExpiry: daysLeft,
    conditionRows,
    conditionsN: conditionRows.length,
    unevidencedN,
    staleN,
    currentN,
    actionRows: list(actions).map((row) => ({
      action: row,
      definition: LTO_ACTION_KIND_BY_KEY[row.kind] || null,
      standing: actionsActive.includes(row),
      closeDefinition: row.closeKind ? (LTO_CLOSE_KIND_BY_KEY[row.closeKind] || null) : null,
    })),
    actionsN: list(actions).length,
    activeActionsN: actionsActive.length,
    revocation,
    suspension,
    prohibition,
    improvementOpen,
    improvementOpenN: improvementOpen.length,
    improvementOverdueN: improvementOverdue.length,
    variationOnRecordN,
    closeIgnoredN,
    /** The record proves the lapse. Nothing in it proves the activity stopped. */
    noStopRecorded: lapsed && !revocation && !suspension,
    state,
  };
}

/**
 * The whole register, one pass.
 *
 * `seat` only narrows disclosure; with no seat the reading is the whole record,
 * exactly as every other register in this workspace behaves, so a headless export
 * and an operator screen cannot disagree about a figure.
 */
export function buildAuthorisations(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeLtoSettings(cfg);

  const authorisations = normalizeLtoAuthorisations(state?.ltoAuthorisations, warnings);
  const conditions = normalizeLtoConditions(state?.ltoConditions, authorisations, warnings);
  const evidence = normalizeLtoEvidence(state?.ltoEvidence, conditions, warnings);
  const actions = normalizeLtoActions(state?.ltoActions, authorisations, warnings);
  const renewals = normalizeLtoRenewals(state?.ltoRenewals, authorisations, warnings);
  const markers = normalizeLtoMarkers(state?.ltoMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  const conditionsByAuthority = new Map();
  for (const row of conditions) {
    const held = conditionsByAuthority.get(row.authorisationId) || [];
    held.push(row);
    conditionsByAuthority.set(row.authorisationId, held);
  }
  const evidenceByCondition = new Map();
  for (const row of evidence) {
    const held = evidenceByCondition.get(row.conditionId) || [];
    held.push(row);
    evidenceByCondition.set(row.conditionId, held);
  }
  const actionsByAuthority = new Map();
  for (const row of actions) {
    const held = actionsByAuthority.get(row.authorisationId) || [];
    held.push(row);
    actionsByAuthority.set(row.authorisationId, held);
  }
  const renewalsByAuthority = new Map();
  for (const row of renewals) {
    const held = renewalsByAuthority.get(row.authorisationId) || [];
    held.push(row);
    renewalsByAuthority.set(row.authorisationId, held);
  }

  /* -------------------------------------------------------------------- rows */

  const rows = [];
  let orphanHolderN = 0;
  let orphanAuthorityN = 0;
  for (const authorisation of authorisations) {
    const holderRows = authorisation.accountableIds.map((personId) => {
      const onGraph = matrixNodeIds.has(personId);
      const lines = onGraph ? ltoActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? ltoPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, name: ltoPersonLabel(matrix, line.managerId) })),
      };
    });
    const orphanHolders = holderRows.filter((row) => !row.onGraph);
    orphanHolderN += orphanHolders.length;
    const orphan = holderRows.every((row) => !row.onGraph);
    if (orphan) orphanAuthorityN += 1;

    const managerIds = [...new Set(holderRows.flatMap((row) => row.lines.map((line) => line.managerId)))].sort();
    const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;

    const mineConditions = conditionsByAuthority.get(authorisation.id) || [];
    const mineEvidence = mineConditions.flatMap((condition) => evidenceByCondition.get(condition.id) || []);
    const derived = deriveLtoState({
      authorisation,
      conditions: mineConditions,
      evidence: mineEvidence,
      actions: actionsByAuthority.get(authorisation.id) || [],
      renewals: renewalsByAuthority.get(authorisation.id) || [],
      nowMs,
    });

    rows.push({
      authorisation,
      holderRows,
      orphan,
      orphanHolders: orphanHolders.map((row) => row.personId),
      managerIds,
      managerRows: managerIds.map((managerId) => ({ managerId, name: ltoPersonLabel(matrix, managerId) })),
      apex,
      ...derived,
    });
  }
  rows.sort((a, b) => String(a.authorisation.siteRef).localeCompare(String(b.authorisation.siteRef))
    || String(a.authorisation.activityRef).localeCompare(String(b.authorisation.activityRef))
    || String(a.authorisation.id).localeCompare(String(b.authorisation.id)));

  /* ------------------------------------------------------------------ states */

  const states = Object.fromEntries(LTO_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const conditionStateRows = rows.flatMap((row) => row.conditionRows);
  const conditionStates = { current: 0, stale: 0, unevidenced: 0 };
  for (const row of conditionStateRows) conditionStates[row.state.key] += 1;

  const totals = {
    authorisations: rows.length,
    inForce: states['in-force'] || 0,
    expiring: states.expiring || 0,
    lapsed: states.lapsed || 0,
    lapsedAwaiting: states['lapsed-awaiting-decision'] || 0,
    suspended: states.suspended || 0,
    revoked: states.revoked || 0,
    prohibited: states.prohibited || 0,
    notYetGranted: states['not-yet-granted'] || 0,
    renewalInFlight: rows.filter((row) => row.renewalInFlight).length,
    renewalSubmitted: renewals.length,
    renewalGranted: renewals.filter((row) => row.decision === 'granted').length,
    renewalRefused: renewals.filter((row) => row.decision === 'refused').length,
    conditions: conditionStateRows.length,
    conditionsCurrent: conditionStates.current,
    conditionsStale: conditionStates.stale,
    conditionsUnevidenced: conditionStates.unevidenced,
    actions: actions.length,
    improvementOpen: rows.reduce((sum, row) => sum + row.improvementOpenN, 0),
    improvementOverdue: rows.reduce((sum, row) => sum + row.improvementOverdueN, 0),
    variationOnRecord: rows.reduce((sum, row) => sum + row.variationOnRecordN, 0),
    closeIgnored: rows.reduce((sum, row) => sum + row.closeIgnoredN, 0),
    holders: new Set(rows.flatMap((row) => row.authorisation.accountableIds)).size,
    linesN: new Set(rows.flatMap((row) => row.managerIds)).size,
    lapsedMinutesTotal: rows.reduce((sum, row) => sum + (Number.isInteger(row.lapsedMinutes) ? row.lapsedMinutes : 0), 0),
    noStopRecordedN: rows.filter((row) => row.noStopRecorded).length,
  };

  /**
   * TWO CLAIMS, PRINTED APART (Bulletproof Reliability Mandate).
   *   `statesReconcile` — every printed state count re-adds to the authorities.
   *   the four `*Reconcile` flags — every child row is attached to a parent that
   *     is still on the record.
   * `figuresComplete` is a SEPARATE claim about provenance, and neither one is
   * folded into a state or into the other.
   */
  const stateTotal = Object.values(states).reduce((sum, n) => sum + n, 0);
  const authorityIds = new Set(authorisations.map((row) => row.id));
  const conditionIds = new Set(conditions.map((row) => row.id));
  const balances = {
    statesReconcile: stateTotal === authorisations.length,
    conditionsReconcile: conditions.every((row) => authorityIds.has(row.authorisationId)),
    evidenceReconcile: evidence.every((row) => conditionIds.has(row.conditionId)),
    actionsReconcile: actions.every((row) => authorityIds.has(row.authorisationId)),
    renewalsReconcile: renewals.every((row) => authorityIds.has(row.authorisationId)),
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanHolderN) incompleteReasons.push(`${orphanHolderN} accountable hand(s) are not on the reporting graph; their line position cannot be resolved and the joint seat above them cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the authorities they summarise.');
  if (!balances.conditionsReconcile) incompleteReasons.push('A condition is not attached to an authority on the record.');
  if (!balances.evidenceReconcile) incompleteReasons.push('An evidence row is not attached to a condition on the record.');
  if (!balances.actionsReconcile) incompleteReasons.push('A regulator action is not attached to an authority on the record.');
  if (!balances.renewalsReconcile) incompleteReasons.push('A renewal is not attached to an authority on the record.');
  if (conditions.length && !evidence.length) incompleteReasons.push('Conditions are declared and no evidence has been recorded against any of them, so no condition is proved met.');

  /* ------------------------------------------------------------ line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const managerId of row.managerIds) {
      const entry = byLine.get(managerId) || {
        managerId,
        managerName: ltoPersonLabel(matrix, managerId),
        authoritiesN: 0,
        lapsedN: 0,
        expiringN: 0,
        prohibitedN: 0,
        suspendedN: 0,
        revokedN: 0,
        unevidencedN: 0,
        improvementOverdueN: 0,
        holders: new Set(),
        authorityIds: new Set(),
      };
      if (!entry.authorityIds.has(row.authorisation.id)) {
        entry.authorityIds.add(row.authorisation.id);
        entry.authoritiesN += 1;
        if (row.state.key === 'lapsed' || row.state.key === 'lapsed-awaiting-decision') entry.lapsedN += 1;
        if (row.state.key === 'expiring') entry.expiringN += 1;
        if (row.state.key === 'prohibited') entry.prohibitedN += 1;
        if (row.state.key === 'suspended') entry.suspendedN += 1;
        if (row.state.key === 'revoked') entry.revokedN += 1;
        entry.unevidencedN += row.unevidencedN;
        entry.improvementOverdueN += row.improvementOverdueN;
      }
      for (const holder of row.holderRows) {
        if (holder.lines.some((line) => line.managerId === managerId)) entry.holders.add(holder.personId);
      }
      byLine.set(managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({
      ...entry,
      holdersN: entry.holders.size,
      holders: [...entry.holders].sort(),
    }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  /* -------------------------------------------------------------- disclosure */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Accountable hands are withheld above rank 3; the site, the activity, the issuing body and the instrument are organisational facts and stay printed. Which named individual holds which consent is individual material, not executive reading.',
      rank: seat?.rank ?? null,
    };

  const attention = {
    lapsedN: totals.lapsed + totals.lapsedAwaiting,
    suspendedN: totals.suspended,
    revokedN: totals.revoked,
    prohibitedN: totals.prohibited,
    expiringN: totals.expiring,
    improvementOverdueN: totals.improvementOverdue,
    total: totals.lapsed + totals.lapsedAwaiting + totals.suspended + totals.revoked + totals.prohibited + totals.expiring + totals.improvementOverdue,
  };

  return {
    ok: true,
    engineVersion: LTO_ENGINE_VERSION,
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    authorisations,
    conditions,
    evidence,
    actions,
    renewals,
    markers,
    rows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    orphanHolderN,
    orphanAuthorityN,
    states,
    stateTotal,
    conditionStates,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals,
    lineRows,
    stateRows: LTO_STATE_KEYS.map((key) => ({ key, label: LTO_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    conditionStateRows: ['current', 'stale', 'unevidenced'].map((key) => ({ key, label: LTO_CONDITION_STATE_BY_KEY[key].label, count: conditionStates[key] || 0 })),
    attention,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — a lapsed authority, a
 * suspension, a revocation, a standing prohibition, an authority inside its renewal
 * window and an improvement notice past its day — and never every authority held,
 * so the badge reads as "work owed now" rather than "how many licences we own".
 */
export function authorisationAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildAuthorisations(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Five facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a person, a site or a line.
 */
export function authorisationSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildAuthorisations(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Statutory authorisations', route: '#/authorisations', ...signal });
  const t = report.totals;

  if (t.lapsed || t.lapsedAwaiting) {
    add({
      ruleId: 'LTO-01',
      severity: 5,
      confidence: 'high',
      title: `${t.lapsed + t.lapsedAwaiting} statutory authorisation(s) lapsed`,
      detail: `Their own expiry passed ${t.lapsedMinutesTotal} whole minute(s) ago in total. ${t.lapsedAwaiting} of them have a renewal submitted but undecided — a submission is not a grant. ${t.noStopRecordedN} carry no suspension or revocation either: the record proves the authority lapsed and cannot prove the activity stopped.`,
      action: { label: 'Open the authorisation register', route: '#/authorisations' },
      evidence: [
        `${t.authorisations} authorit(ies) held`,
        `${t.holders} accountable hand(s) across ${t.linesN} reporting line(s)`,
      ],
    });
  }

  if (t.suspended || t.revoked) {
    add({
      ruleId: 'LTO-02',
      severity: 5,
      confidence: 'high',
      title: `${t.suspended + t.revoked} authorit(ies) suspended or revoked`,
      detail: 'A suspension is not in force until a recorded lifting act; a revocation is terminal in the record and only a new declaration restores a power to operate. Neither is a status somebody can type back to green.',
      action: { label: 'See the regulator actions', route: '#/authorisations?view=actions' },
      evidence: [`${t.actions} regulator action(s) on the record`],
    });
  }

  if (t.prohibited) {
    add({
      ruleId: 'LTO-03',
      severity: 5,
      confidence: 'high',
      title: `${t.prohibited} authority(ies) carry a standing prohibition notice`,
      detail: 'A prohibition notice stops the activity it names. The licence may still be in force — the register prints the licence state and the prohibition apart, because collapsing them is how an organisation reads a live licence and misses a stopped activity.',
      action: { label: 'See the standing notices', route: '#/authorisations?view=actions' },
      evidence: [`${t.improvementOpen} improvement notice(s) open`, `${t.improvementOverdue} past their compliance day`],
    });
  }

  if (t.expiring) {
    const soonest = report.rows
      .filter((row) => row.state.key === 'expiring' && Number.isInteger(row.daysToExpiry))
      .reduce((min, row) => (min === null || row.daysToExpiry < min ? row.daysToExpiry : min), null);
    add({
      ruleId: 'LTO-04',
      severity: 3,
      confidence: 'high',
      title: `${t.expiring} authority(ies) inside their declared renewal window`,
      detail: `The lead time each declaration set has arrived${Number.isInteger(soonest) ? `; the nearest expires in ${soonest} whole day(s)` : ''}. No renewal is submitted on any of them, so the next responsible start is owed now rather than at expiry.`,
      action: { label: 'Open the register', route: '#/authorisations' },
      evidence: [`${t.renewalSubmitted} renewal(s) submitted`, `${t.renewalGranted} granted`, `${t.renewalRefused} refused`],
    });
  }

  if (t.conditionsUnevidenced || t.conditionsStale) {
    add({
      ruleId: 'LTO-05',
      severity: 4,
      confidence: 'high',
      title: `${t.conditionsUnevidenced + t.conditionsStale} declared condition(s) unevidenced or stale`,
      detail: `${t.conditionsUnevidenced} have no evidence at all and ${t.conditionsStale} are older than the re-evidence window their condition declared. A condition nobody evidenced is never “met”, and a live licence is not evidence of compliance with its conditions.`,
      action: { label: 'Open the conditions', route: '#/authorisations?view=conditions' },
      evidence: [`${t.conditions} condition(s) declared`, `${t.conditionsCurrent} current`],
    });
  }

  return signals;
}
