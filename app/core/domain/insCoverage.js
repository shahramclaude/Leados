/**
 * app/core/domain/insCoverage.js — the ONE reader of the Insurance Notification
 * & Recovery Register (ADR-0249, Schema v203, `#/insurance`).
 *
 * Every state, deadline, day count, cover verdict, recovery total and net cost
 * this module prints is derived here, on read, from stored declarations and the
 * injected clock. Nothing derived is stored anywhere, so the same workspace read
 * twice gives the same answer and a hand-edited file cannot carry a green
 * "notified in time" over a policy window it disagrees with.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER COVERAGE: *at this instant, what does
 * the record prove about whether the insurer was told in time, and what is the
 * net cost the organisation actually carries?* The notification answer is one of
 * ten states, and each is a DIFFERENT fact:
 *
 *   no-cover                   the trigger day falls outside the policy period;
 *                              the policy does not respond.
 *   notification-late          the deadline passed with no notification, or the
 *                              notification was recorded after the derived
 *                              deadline. The exact days over are printed.
 *   notification-urgent        inside the narrowest warning band, unnotified.
 *   unnotified                 covered, deadline future, not yet notified.
 *   notification-unprovable    the trigger day or the declared window cannot be
 *                              read, so NO deadline is derivable. No day count.
 *   notified-in-time           told inside the window; no recovery yet.
 *   recovery-pending           claimed, awaiting the insurer's answer.
 *   recovery-denied            the insurer refused, with the reason on record.
 *   recovered                  paid in full; the net cost is derived.
 *   partially-recovered        paid less than claimed; the shortfall is printed.
 *
 * WHY `notification-late` DOES NOT SAY "COVER WAS LOST". The record proves the
 * deadline passed with nothing on file, or that the notification was late. It
 * holds no insurer feed, no broker acknowledgement and no coverage opinion, so it
 * cannot say whether the insurer accepted the late notice. The reader prints the
 * exact days it ran over and says plainly what it cannot prove; a record gap is
 * never upgraded into an allegation. This is the same refusal the claim register
 * makes about a passed limitation deadline.
 *
 * WHY THE DEADLINE IS DERIVED FROM THE POLICY'S OWN WINDOW AND NOT FROM A TYPED
 * DATE. A notification window belongs to the policy and the insurer — "within 30
 * days of the occurrence", "as soon as practicable and in any event within 90
 * days of the claim". The coverage record therefore carries a link to a policy
 * with a DECLARED window, and the reader derives the deadline from the trigger
 * day and that window. Where the window cannot be read the reader refuses a
 * deadline rather than falling back on the opening date, because that fallback
 * is a missed notification carrying a green tick.
 *
 * WHY COVER IS TESTED AGAINST THE PERIOD AND NOT ASSUMED. An occurrence policy
 * answers for an occurrence during its period; a claims-made policy answers only
 * for a claim made during its period. A coverage link is therefore tested: the
 * trigger day must fall inside the policy period, both ends inclusive. Where it
 * does not, the reader prints `no-cover` with the reason. A human linked the
 * policy; the record tests the link.
 *
 * WHY THE NET COST IS DERIVED AND PRINTED APART. The gross exposure is the
 * provision (IAS 37 / ASC 450); the recovery is the insurance asset; the net
 * cost is the figure finance carries. The three are printed apart so a provision
 * is never confused with money spent and a recovery is never confused with cover.
 * A mixed-currency register prints no net total, because a rate it does not hold
 * would have to be invented.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A policy names one to four responsible
 * hands. The reader resolves every ACTIVE line that holds each of them through
 * the ONE matrix engine, prints each hand's line position, counts a person ONCE,
 * and exposes the joint apex over every manager of every holder. Where a hand is
 * off the graph the row is printed as an orphan rather than dropped, because
 * deleting it would erase live cover from the record.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildClaims } from './lfgClaims.js';
import {
  INS_POLICY_CLASS_BY_KEY,
  INS_STATE_BY_KEY,
  INS_STATE_KEYS,
} from './insRegistry.js';
import {
  normalizeInsCoverages,
  normalizeInsMarkers,
  normalizeInsNotifications,
  normalizeInsPolicies,
  normalizeInsRecoveries,
  normalizeInsSettings,
} from './insSchema.js';
import {
  daysOver,
  daysRemaining,
  instantMs,
  netCostMinor,
  notificationDeadline,
  notificationDaysOver,
  sumMinor,
  utcDayMs,
  withinPeriod,
} from './insMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function insPersonLabel(matrix, personId) {
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
export function insActiveLinesFor(matrix, personId) {
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
 * THE NOTIFICATION KERNEL. Pure over (policy, coverage, notification, recoveries,
 * trigger, nowMs), exported so the suite can pin every branch without a store and
 * so the rule and the screen cannot disagree about a state.
 */
export function deriveInsNotification({ policy, notification = null, recoveries = [], triggerMs = null, nowMs, warningHorizonDays = 90 }) {
  const classDefinition = policy?.policyClass ? INS_POLICY_CLASS_BY_KEY[policy.policyClass] || null : null;
  const unsupportedClass = !classDefinition;

  const windowDays = policy && Number.isInteger(policy.notificationWindowDays) ? policy.notificationWindowDays : null;
  const periodStartMs = policy?.periodStartDay ? utcDayMs(`${policy.periodStartDay}T00:00:00.000Z`) : null;
  const periodEndMs = policy?.periodEndDay ? utcDayMs(`${policy.periodEndDay}T00:00:00.000Z`) : null;

  // COVER IS TESTED, NOT ASSUMED. The trigger day must fall inside the policy
  // period, both ends inclusive. Where it does not, the policy does not respond
  // and the reader prints `no-cover` with the reason.
  const coverTest = withinPeriod({ triggerMs, periodStartMs, periodEndMs });
  const hasCover = coverTest === true;

  const deadlineMs = Number.isFinite(triggerMs) && Number.isInteger(windowDays)
    ? notificationDeadline({ triggerMs, windowDays })
    : null;

  const notifiedMs = notification?.notifiedDay ? utcDayMs(`${notification.notifiedDay}T00:00:00.000Z`) : null;
  const remaining = Number.isFinite(deadlineMs) ? daysRemaining(nowMs, deadlineMs) : null;
  const overdue = Number.isFinite(deadlineMs) ? daysOver(nowMs, deadlineMs) : null;
  const lateBy = Number.isFinite(notifiedMs) && Number.isFinite(deadlineMs)
    ? notificationDaysOver(notifiedMs, deadlineMs)
    : null;

  const horizon = Number.isInteger(warningHorizonDays) ? warningHorizonDays : 90;
  const urgentBand = Math.max(1, Math.floor(horizon / 2));
  const criticalBand = Math.max(1, Math.floor(horizon / 6));

  const mine = list(recoveries);
  const claimedMinor = sumMinor(mine, (row) => (row.kind === 'claimed' ? row.amountMinor : 0));
  const recoveredMinor = sumMinor(mine, (row) => (row.kind === 'recovered' || row.kind === 'interim' ? row.amountMinor : 0));
  const deniedRows = mine.filter((row) => row.kind === 'denied');
  const denied = deniedRows.length > 0;
  const hasClaimed = mine.some((row) => row.kind === 'claimed');
  const hasRecovered = mine.some((row) => row.kind === 'recovered' || row.kind === 'interim');

  const stateFor = (key) => ({ key, ...INS_STATE_BY_KEY[key] });
  let state;
  if (!hasCover && coverTest === false) state = stateFor('no-cover');
  else if (!Number.isFinite(deadlineMs)) state = stateFor('notification-unprovable');
  else if (denied) state = stateFor('recovery-denied');
  else if (hasRecovered && hasClaimed && recoveredMinor < claimedMinor) state = stateFor('partially-recovered');
  else if (hasRecovered) state = stateFor('recovered');
  else if (hasClaimed) state = stateFor('recovery-pending');
  else if (notification && lateBy !== null && lateBy > 0) state = stateFor('notification-late');
  else if (notification) state = stateFor('notified-in-time');
  else if (Number.isFinite(remaining) && remaining < 0) state = stateFor('notification-late');
  else if (Number.isFinite(remaining) && remaining <= criticalBand) state = stateFor('notification-urgent');
  else if (Number.isFinite(remaining) && remaining <= urgentBand) state = stateFor('notification-urgent');
  else state = stateFor('unnotified');

  return {
    classDefinition,
    unsupportedClass,
    policy,
    windowDays,
    periodStartMs,
    periodEndMs,
    coverTest,
    hasCover,
    triggerMs,
    deadlineMs,
    notifiedMs,
    notification,
    daysRemaining: Number.isFinite(remaining) ? remaining : null,
    daysOver: Number.isFinite(overdue) ? overdue : null,
    lateBy,
    warningHorizonDays: horizon,
    urgentBand,
    criticalBand,
    recoveries: mine,
    claimedMinor,
    recoveredMinor,
    deniedRows,
    denied,
    hasClaimed,
    hasRecovered,
    state,
    deadlineProvable: Boolean(Number.isFinite(deadlineMs)),
  };
}

/**
 * THE READER. Builds the whole register from stored declarations and the injected
 * clock. Every count it prints is recomputed here; nothing is cached.
 *
 * The gross exposure for each coverage is read from the claim register (ADR-0248):
 * the resolution amount where one is recorded, otherwise the sum claimed. The
 * net cost is that gross less what the insurer actually paid.
 */
export function buildInsurance(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const asOf = dayKey(at) || at.toISOString().slice(0, 10);
  const cfg = { ...(state?.settings || {}), ...(settings || {}) };
  const conventions = normalizeInsSettings(cfg);

  const policies = normalizeInsPolicies(state?.insPolicies, warnings);
  const coverages = normalizeInsCoverages(state?.insCoverages, state?.lfgMatters || [], policies, warnings);
  const notifications = normalizeInsNotifications(state?.insNotifications, coverages, warnings);
  const recoveries = normalizeInsRecoveries(state?.insRecoveries, coverages, warnings);
  const markers = normalizeInsMarkers(state?.insMarkers, warnings);

  // The gross exposure and the trigger days come from the claim register. The
  // claim register is the ONE reader of matters and accruals; this register
  // reads its output rather than re-deriving a matter's exposure.
  let claimReport = null;
  let claimError = null;
  try {
    claimReport = buildClaims(state, { now: at, settings: cfg, seat: null });
  } catch (error) {
    claimError = `The claim register could not be read, so no gross exposure and no trigger day can be derived: ${error?.message || 'unknown error'}.`;
  }
  const claimRowsById = new Map();
  if (claimReport?.ok) {
    for (const row of claimReport.rows || []) {
      if (row?.matter?.id) claimRowsById.set(row.matter.id, row);
    }
  }

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read, so no line can be resolved and no joint seat can be asked: ${error?.message || 'unknown error'}.`;
  }
  const matrixNodeIds = new Set([...(matrix?.nodes?.keys?.() || []), ...(matrix?.roster?.keys?.() || []), LEADER_ID]);

  const policiesById = new Map(policies.map((row) => [row.id, row]));
  const notificationByCoverage = new Map(notifications.map((row) => [row.coverageId, row]));
  const recoveriesByCoverage = new Map();
  for (const row of recoveries) {
    const held = recoveriesByCoverage.get(row.coverageId) || [];
    held.push(row);
    recoveriesByCoverage.set(row.coverageId, held);
  }

  /* ---------------------------------------------------------------------- rows */

  const rows = [];
  let orphanHolderN = 0;
  let orphanPolicyN = 0;
  for (const coverage of coverages) {
    const policy = policiesById.get(coverage.policyId) || null;
    const claimRow = claimRowsById.get(coverage.matterId) || null;
    if (!policy) continue;

    const holderRows = policy.responsibleIds.map((personId) => {
      const onGraph = matrixNodeIds.has(personId);
      const lines = onGraph ? insActiveLinesFor(matrix, personId) : [];
      return {
        personId,
        name: onGraph ? insPersonLabel(matrix, personId) : null,
        onGraph,
        lines: lines.map((line) => ({ ...line, name: insPersonLabel(matrix, line.managerId) })),
      };
    });
    const orphanHolders = holderRows.filter((row) => !row.onGraph);
    orphanHolderN += orphanHolders.length;
    const orphan = holderRows.every((row) => !row.onGraph);
    if (orphan) orphanPolicyN += 1;

    const managerIds = [...new Set(holderRows.flatMap((row) => row.lines.map((line) => line.managerId)))].sort();
    const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : null;
    const apexIds = list(apex?.apexIds).filter(Boolean);
    const apexId = apexIds.length === 1 ? apexIds[0] : null;
    const apexName = apexId ? insPersonLabel(matrix, apexId) : null;

    // THE TRIGGER DAY. An occurrence policy runs from the occurrence day (the
    // accrual day on the claim register); a claims-made policy runs from the
    // claim-made day (the day the matter was opened). The register reads both
    // from the claim register rather than inventing either.
    const isClaimsMade = policy.basis === 'claims-made';
    const occurrenceMs = claimRow?.accrual?.accrualDay ? utcDayMs(`${claimRow.accrual.accrualDay}T00:00:00.000Z`) : null;
    const claimMadeMs = claimRow?.matter?.openedAt ? instantMs(claimRow.matter.openedAt) : null;
    const triggerMs = isClaimsMade ? claimMadeMs : occurrenceMs;
    const triggerDay = Number.isFinite(triggerMs) ? new Date(triggerMs).toISOString().slice(0, 10) : null;

    const notification = notificationByCoverage.get(coverage.id) || null;
    const mineRecoveries = recoveriesByCoverage.get(coverage.id) || [];

    const derived = deriveInsNotification({
      policy,
      notification,
      recoveries: mineRecoveries,
      triggerMs,
      nowMs,
      warningHorizonDays: conventions.insWarningHorizonDays,
    });

    // THE NET COST. Gross exposure (from the claim register) less what the
    // insurer actually paid. Both must be integers; otherwise the net cost is
    // refused with its reason rather than printed as a plausible figure.
    const grossMinor = claimRow && Number.isInteger(claimRow.exposureMinor) ? claimRow.exposureMinor : null;
    const netMinor = netCostMinor({ grossMinor, recoveredMinor: derived.recoveredMinor });

    rows.push({
      coverage,
      policy,
      claimRow,
      holderRows,
      orphan,
      orphanHolders: orphanHolders.map((row) => row.personId),
      managerIds,
      managerRows: managerIds.map((managerId) => ({ managerId, name: insPersonLabel(matrix, managerId) })),
      apex,
      apexIds,
      apexId,
      apexName,
      apexAmbiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
      triggerDay,
      triggerIsClaimMade: isClaimsMade,
      deadlineDay: derived.deadlineMs ? new Date(derived.deadlineMs).toISOString().slice(0, 10) : null,
      grossMinor,
      netMinor,
      ...derived,
    });
  }
  rows.sort((a, b) => {
    // Order by urgency of the notification clock first, then net cost, then
    // policy reference. A register sorted alphabetically buries the notification
    // that runs out tomorrow.
    const urgency = [INS_STATE_KEYS.indexOf(a.state.key), INS_STATE_KEYS.indexOf(b.state.key)];
    if (urgency[0] !== urgency[1]) return urgency[0] - urgency[1];
    const netDiff = (b.netMinor || 0) - (a.netMinor || 0);
    if (netDiff !== 0) return netDiff;
    return String(a.policy.policyRef).localeCompare(String(b.policy.policyRef));
  });

  /* -------------------------------------------------------------------- totals */

  const states = Object.fromEntries(INS_STATE_KEYS.map((key) => [key, 0]));
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;

  const openRows = rows.filter((row) => !['recovered', 'recovery-denied', 'no-cover'].includes(row.state.key));
  const daysRemainingValues = rows.map((row) => row.daysRemaining).filter((value) => Number.isInteger(value) && value >= 0);
  const daysOverValues = rows.map((row) => row.daysOver).filter((value) => Number.isInteger(value) && value > 0);
  const lateNotificationN = notifications.filter((row) => {
    const coverage = coverages.find((candidate) => candidate.id === row.coverageId);
    const derived = rows.find((candidate) => candidate.coverage.id === row.coverageId);
    return derived && derived.lateBy !== null && derived.lateBy > 0;
  }).length;

  const currency = rows.length ? rows[0].policy.currency : null;
  const mixedCurrencyN = rows.filter((row) => currency && row.policy.currency !== currency).length;

  const totals = {
    coverages: rows.length,
    open: openRows.length,
    unnotified: states.unnotified || 0,
    notificationUrgent: states['notification-urgent'] || 0,
    notificationLate: states['notification-late'] || 0,
    notificationUnprovable: states['notification-unprovable'] || 0,
    noCover: states['no-cover'] || 0,
    notifiedInTime: states['notified-in-time'] || 0,
    recoveryPending: states['recovery-pending'] || 0,
    recoveryDenied: states['recovery-denied'] || 0,
    recovered: states.recovered || 0,
    partiallyRecovered: states['partially-recovered'] || 0,
    notifications: notifications.length,
    notificationsLate: lateNotificationN,
    holders: new Set(rows.flatMap((row) => row.policy.responsibleIds)).size,
    linesN: new Set(rows.flatMap((row) => row.managerIds)).size,
    daysRemainingMin: daysRemainingValues.length ? Math.min(...daysRemainingValues) : null,
    daysOverTotal: daysOverValues.reduce((sum, value) => sum + value, 0),
    // Money totals are summed only over rows in the register's declared currency
    // when every row shares it. A mixed-currency register prints NO total and
    // says so, because adding across currencies needs a rate this record does
    // not hold.
    grossTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.grossMinor),
    recoveredTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.recoveredMinor),
    deniedTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => (row.denied ? row.claimedMinor : 0)),
    netTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.netMinor),
    claimedTotalMinor: mixedCurrencyN ? null : sumMinor(rows, (row) => row.claimedMinor),
    recoveryRows: recoveries.length,
    currencies: [...new Set(rows.map((row) => row.policy.currency))].sort(),
    currency,
    mixedCurrencyN,
  };

  /* ------------------------------------------------------------- reconciliation */

  const coverageIds = new Set(coverages.map((row) => row.id));
  const balances = {
    // The FIRST claim: the printed state counts re-add to the coverages they
    // summarise.
    statesReconcile: Object.values(states).reduce((sum, value) => sum + value, 0) === rows.length,
    // The SECOND claim, held apart: every child row ties to a coverage on the
    // record.
    notificationsReconcile: notifications.every((row) => coverageIds.has(row.coverageId)),
    recoveriesReconcile: recoveries.every((row) => coverageIds.has(row.coverageId)),
    // A coverage with two notifications would make a printed deadline ambiguous.
    oneNotificationPerCoverage: notifications.length === new Set(notifications.map((row) => row.coverageId)).size,
  };

  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (orphanHolderN) incompleteReasons.push(`${orphanHolderN} responsible hand(s) are not on the reporting graph; their line position cannot be resolved and the joint seat above them cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (claimError) incompleteReasons.push(claimError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the coverages they summarise.');
  if (!balances.notificationsReconcile || !balances.recoveriesReconcile) {
    incompleteReasons.push('A child row does not tie to a coverage on the record.');
  }
  if (!balances.oneNotificationPerCoverage) incompleteReasons.push('A coverage carries more than one notification, so its deadline is ambiguous.');
  if (mixedCurrencyN) incompleteReasons.push(`${mixedCurrencyN} coverage(s) are declared in a currency other than the register's first, so no cross-currency money total is printed.`);
  const unresolvableNet = rows.filter((row) => row.grossMinor === null);
  if (unresolvableNet.length) incompleteReasons.push(`${unresolvableNet.length} coverage(s) have no readable gross exposure on the claim register, so no net cost is derived for them.`);

  /* ----------------------------------------------------------------- line roll-up */

  const byLine = new Map();
  for (const row of rows) {
    for (const managerId of row.managerIds) {
      const entry = byLine.get(managerId) || {
        managerId,
        managerName: insPersonLabel(matrix, managerId),
        coveragesN: 0,
        openN: 0,
        urgentN: 0,
        lateN: 0,
        noCoverN: 0,
        netMinor: 0,
        holders: new Set(),
        coverageIds: new Set(),
      };
      if (!entry.coverageIds.has(row.coverage.id)) {
        entry.coverageIds.add(row.coverage.id);
        entry.coveragesN += 1;
        if (['unnotified', 'notification-urgent', 'notified-in-time', 'recovery-pending'].includes(row.state.key)) entry.openN += 1;
        if (['notification-urgent'].includes(row.state.key)) entry.urgentN += 1;
        if (row.state.key === 'notification-late') entry.lateN += 1;
        if (row.state.key === 'no-cover') entry.noCoverN += 1;
        if (Number.isInteger(row.netMinor)) entry.netMinor += row.netMinor;
      }
      for (const holder of row.holderRows) {
        if (holder.lines.some((line) => line.managerId === managerId)) entry.holders.add(holder.personId);
      }
      byLine.set(managerId, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({ ...entry, holdersN: entry.holders.size, holders: [...entry.holders].sort() }))
    .sort((a, b) => String(a.managerName).localeCompare(String(b.managerName)) || String(a.managerId).localeCompare(String(b.managerId)));

  /* ------------------------------------------------------------------ disclosure */

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Responsible hands are withheld above rank 3; the insurer, the policy reference, the matter reference and the amounts are organisational facts and stay printed. Which named individual is answerable for a particular policy is individual material, not executive reading.',
      rank: seat?.rank ?? null,
    };

  const attention = {
    notificationLateN: states['notification-late'] || 0,
    notificationUrgentN: states['notification-urgent'] || 0,
    notificationUnprovableN: states['notification-unprovable'] || 0,
    noCoverN: states['no-cover'] || 0,
    recoveryDeniedN: states['recovery-denied'] || 0,
    total: (states['notification-late'] || 0) + (states['notification-urgent'] || 0)
      + (states['notification-unprovable'] || 0) + (states['no-cover'] || 0)
      + (states['recovery-denied'] || 0),
  };

  return {
    ok: true,
    engineVersion: 'insurance-notification-recovery-2026.11-v1',
    matrix,
    asOf,
    nowIso: at.toISOString(),
    conventions,
    policies,
    coverages,
    notifications,
    recoveries,
    markers,
    policiesById,
    rows,
    detailed: Boolean(detailed),
    disclosure,
    warnings,
    matrixError,
    claimError,
    orphanHolderN,
    orphanPolicyN,
    states,
    stateTotal: Object.values(states).reduce((sum, value) => sum + value, 0),
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    totals,
    lineRows,
    stateRows: INS_STATE_KEYS.map((key) => ({ key, label: INS_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    attention,
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DECISION-SHAPED duty — a coverage past its
 * notification deadline, inside the urgent band, with an unprovable deadline,
 * with no cover, or with a denied recovery — and never every coverage on the
 * register, so the badge reads as "work owed now" rather than "how many policies
 * we have".
 */
export function insuranceAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildInsurance(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Five facts worth a leader's attention, each with the printed
 * evidence and a route — and none of them a score on a person, a line or a broker.
 */
export function insuranceSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildInsurance(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Insurance & recovery', route: '#/insurance', ...signal });
  const t = report.totals;

  if (t.notificationLate) {
    add({
      ruleId: 'INS-01',
      severity: 5,
      confidence: 'high',
      title: `${t.notificationLate} coverage(s) past their notification deadline with no timely notice on the record`,
      detail: `Their derived deadlines passed ${t.daysOverTotal} whole day(s) over in total. The register derives the deadline from the trigger day and the window the policy itself declares — and it holds no insurer feed, so it cannot say whether the insurer accepted the late notice. A record gap is not an allegation that cover was lost.`,
      action: { label: 'Open the insurance register', route: '#/insurance' },
      evidence: [
        `${t.coverages} coverage(s) on the register`,
        `${t.holders} responsible hand(s) across ${t.linesN} reporting line(s)`,
      ],
    });
  }

  if (t.notificationUrgent) {
    add({
      ruleId: 'INS-02',
      severity: 5,
      confidence: 'high',
      title: `${t.notificationUrgent} coverage(s) inside the urgent notification band`,
      detail: `Their derived deadlines sit inside half the declared warning horizon, or the narrowest band. The insurer has not been told yet, and the window is running.`,
      action: { label: 'Open the notification clocks', route: '#/insurance?view=notifications' },
      evidence: [`${t.unnotified} further coverage(s) unnotified`, `${conventionsLabel(report)}`],
    });
  }

  if (t.notificationUnprovable) {
    add({
      ruleId: 'INS-03',
      severity: 5,
      confidence: 'high',
      title: `${t.notificationUnprovable} coverage(s) with an unprovable notification deadline`,
      detail: 'The trigger day or the policy’s declared window cannot be read, so NO deadline is derivable and the register prints no day count. It refuses to fall back on the opening date, because that fallback is how a notification is missed with a green tick on it.',
      action: { label: 'Declare the policy window', route: '#/insurance' },
      evidence: [`${t.coverages} coverage(s) on the register`],
    });
  }

  if (t.noCover) {
    add({
      ruleId: 'INS-04',
      severity: 5,
      confidence: 'high',
      title: `${t.noCover} coverage(s) where the policy does not respond`,
      detail: 'The trigger day falls outside the policy period, so the linked policy does not cover this matter. The register prints the reason rather than pretending a linked policy covers a claim it does not.',
      action: { label: 'Open the coverages', route: '#/insurance?view=coverages' },
      evidence: [`${t.coverages} coverage(s) on the register`],
    });
  }

  if (t.recoveryDenied) {
    add({
      ruleId: 'INS-05',
      severity: 4,
      confidence: 'high',
      title: `${t.recoveryDenied} recovery(ies) denied by the insurer`,
      detail: `The net cost moves back to the gross exposure for those coverages. The denials are kept on the record with their reasons — deleting them would leave the recovery ledger reading as though nothing was ever claimed.`,
      action: { label: 'Open the recoveries', route: '#/insurance?view=recoveries' },
      evidence: [`${t.recovered} recovered in full`, `${t.partiallyRecovered} partially recovered`],
    });
  }

  return signals;
}

function conventionsLabel(report) {
  return `declared warning horizon ${report.conventions.insWarningHorizonDays} day(s)`;
}
