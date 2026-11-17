/**
 * app/core/domain/mutualAid.js — the ONE reader of the Mutual-Aid Activation &
 * Resource-Commitment Register (ADR-0244, Schema v198, `#/mutual-aid`).
 *
 * Every state, validity, days-overdue figure, days-late figure, coverage
 * verdict, shortfall and count this module prints is derived here, on read,
 * from stored declarations and the injected clock. Nothing derived is stored
 * anywhere, so the same workspace read twice gives the same answer and a
 * hand-edited file cannot carry an arrival that disagrees with the promise
 * beside it.
 *
 * THE ONE QUESTION THIS READER ANSWERS PER REQUEST: *did the partner actually
 * accept, promise what was asked, and deliver — and is the commitment closed in
 * the right order?* The answer is one of fourteen states, and each is a
 * DIFFERENT fact:
 *
 *   breach-agreement-lapsed      the request was made under an agreement whose
 *                                declared term had already ended. Unreachable
 *                                through the door; kept when imported, printed
 *                                permanently.
 *   breach-release-before-withdrawal  the commitment was released before the
 *                                withdrawal that ends it.
 *   breach-cancelled-after-acceptance  the request was cancelled after the
 *                                partner accepted.
 *   cancelled                    the requesting side cancelled before any
 *                                acceptance. No commitment was ever created.
 *   not-arrived-overdue          the partner accepted, the promised arrival day
 *                                passed, and nothing arrived. The exact days
 *                                stay printed.
 *   withdrawn                    the help left and the release is still owed.
 *   arrived-late                 the help arrived after the promised day. The
 *                                exact days late stay printed.
 *   arrived-partial              the help arrived short of the promise. The
 *                                exact shortfall per line stays printed.
 *   arrived-complete             the help arrived in full, on or before the
 *                                promised day.
 *   accepted-differently         the partner accepted, but the promise does not
 *                                cover the ask. The exact shortfall stays
 *                                printed.
 *   awaiting-arrival             the promise is made and its day has not passed.
 *   request-lapsed               the declared validity ran out with no
 *                                acceptance. A request nobody answered is not a
 *                                promise.
 *   awaiting-acceptance          the request is open, inside its validity.
 *   requested                    the request is open, nothing promised yet.
 *
 * WHY THE BREACHES SURVIVE. The commands refuse to create a release before a
 * withdrawal, a cancellation after an acceptance, or a request under an expired
 * agreement — that is the point of the register. But an imported or hand-edited
 * workspace can carry one, and a reader that quietly dropped it would hide the
 * exact fact the screen exists to show. So the loader keeps it, the reader
 * prints it with the exact days, and the rule asks a seat to answer for it.
 * Refusing to create a breach and refusing to hide one are the same discipline.
 *
 * WHY A REQUEST IS NEVER A PROMISE. `requested`, `awaiting-acceptance` and
 * `request-lapsed` are printed as their own states. A request that was sent,
 * that nobody answered, and whose window closed is `request-lapsed` — never
 * `awaiting-arrival`, never a clean "in progress". A register that reads a
 * silence as a promise would manufacture the one fact a commander most wants to
 * hear.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A request names the reporting lines it is
 * made from. The seat answerable for the request is the JOINT APEX above those
 * lines, computed through the one matrix engine — never the requesting line on
 * another line's behalf, and never the partner, which is not a person on this
 * graph. A person is counted ONCE in every people figure.
 */

import { dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  MAA_ENGINE_VERSION,
  MAA_REQUEST_KIND_BY_KEY,
  MAA_SETTING_KEYS,
  MAA_STATE_BY_KEY,
  MAA_STATE_KEYS,
} from './mutualAidRegistry.js';
import {
  normalizeMutualAidAcceptances,
  normalizeMutualAidAgreements,
  normalizeMutualAidArrivals,
  normalizeMutualAidMarkers,
  normalizeMutualAidReleases,
  normalizeMutualAidRequests,
  normalizeMutualAidSettings,
  normalizeMutualAidWithdrawals,
} from './mutualAidSchema.js';
import {
  arrivalCoverage,
  coverageOf,
  daysUntil,
  lateDays,
  overdueDays,
  releaseDueOn,
  validityClosesOn,
} from './mutualAidMath.js';

const list = (value) => (Array.isArray(value) ? value : []);

/** A readable label for a hand. The raw id `leader` never reaches a screen. */
export function maaPersonLabel(matrix, personId) {
  if (personId === LEADER_ID) return 'Workspace leader';
  const node = matrix?.nodes?.get(personId);
  if (node?.name) return node.name;
  const person = matrix?.roster?.get(personId);
  return person?.name || personId;
}

/**
 * THE REQUEST KERNEL. Pure over (request, agreement, acceptance, arrival,
 * withdrawal, release, nowDay, graceDays), exported so the suite can pin every
 * branch without a store and so the rule and the screen cannot disagree about a
 * state.
 *
 * `breaches` is ALWAYS returned as a list, even when `state` names only the
 * gravest one: a row that breaches two duties must not hide the second.
 */
export function deriveMutualAidRequest({
  request,
  agreement = null,
  acceptance = null,
  arrival = null,
  withdrawal = null,
  release = null,
  nowDay,
  graceDays = 7,
}) {
  const kind = MAA_REQUEST_KIND_BY_KEY[request?.kind] || null;
  const closesOn = validityClosesOn(request?.openedOn, request?.validityDays);
  const breaches = [];

  // The partner is entitled to the whole of the agreement's last day: an
  // agreement "expired" for a request opened on its last day is still live.
  const agreementLapsed = Boolean(agreement?.expiresOn && request?.openedOn
    && daysBetween(agreement.expiresOn, request.openedOn) > 0);
  // Release dated before the withdrawal that ends it: the exact negative offset
  // from the withdrawal day is the breach figure.
  const releasedEarly = Boolean(release?.releasedOn && withdrawal?.withdrawnOn
    && daysBetween(withdrawal.withdrawnOn, release.releasedOn) < 0);
  // Cancellation dated after the acceptance that made the commitment: the
  // cancellation can only close a request that was still awaiting an answer.
  const cancelledAfterAcceptance = Boolean(request?.cancelledOn && acceptance?.acceptedOn
    && daysBetween(acceptance.acceptedOn, request.cancelledOn) > 0);

  if (agreementLapsed) breaches.push({ key: 'agreement-lapsed', afterDays: daysBetween(agreement.expiresOn, request.openedOn) });
  if (releasedEarly) breaches.push({ key: 'release-before-withdrawal', earlyDays: daysBetween(release.releasedOn, withdrawal.withdrawnOn) });
  // The cancellation followed the acceptance by this many days: the figure is
  // the distance FORWARD from the acceptance to the cancellation.
  if (cancelledAfterAcceptance) breaches.push({ key: 'cancelled-after-acceptance', earlyDays: daysBetween(acceptance.acceptedOn, request.cancelledOn) });

  // The promise compared against the ask. Printed on the row whether or not it
  // is the gravest fact: a commander must see what was promised in full.
  const coverage = acceptance ? coverageOf(request.askedLines, acceptance.promisedLines) : null;

  // The arrival compared against the promise.
  const arrivalVerdict = arrival ? arrivalCoverage(acceptance.promisedLines, arrival.arrivedLines) : null;

  const promisedOverdue = acceptance?.promisedArrivalOn
    && !arrival ? overdueDays(nowDay, acceptance.promisedArrivalOn) : null;
  const arrivalLate = arrival?.arrivedOn && acceptance?.promisedArrivalOn
    ? lateDays(arrival.arrivedOn, acceptance.promisedArrivalOn) : null;
  const releaseDue = withdrawal ? releaseDueOn(withdrawal.withdrawnOn, graceDays) : null;
  const releaseOverdue = withdrawal && !release ? overdueDays(nowDay, releaseDue) : null;
  const validityRemaining = closesOn ? daysUntil(nowDay, closesOn) : null;
  const validityLapsed = acceptance === null && closesOn ? overdueDays(nowDay, closesOn) : null;

  const base = {
    closesOn,
    validityRemaining,
    validityLapsed,
    agreementLapsed,
    releasedEarly,
    cancelledAfterAcceptance,
    promisedOverdue,
    arrivalLate,
    releaseDueOn: releaseDue,
    releaseOverdue,
    coverage,
    arrivalVerdict,
    breaches,
    kind,
  };
  const stateFor = (key) => ({ key, ...MAA_STATE_BY_KEY[key] });

  // Breaches are printed before every other state, because an act dated out of
  // order is the fact the register exists to surface.
  if (agreementLapsed) return { ...base, state: stateFor('breach-agreement-lapsed') };
  if (releasedEarly) return { ...base, state: stateFor('breach-release-before-withdrawal') };
  if (cancelledAfterAcceptance) return { ...base, state: stateFor('breach-cancelled-after-acceptance') };

  if (request?.cancelledOn) return { ...base, state: stateFor('cancelled') };

  if (acceptance && !arrival) {
    // A withdrawal ends the commitment: when the partner has pulled the help
    // back, the state is `withdrawn` and the release is owed — the promised day
    // no longer frames the position, because the commitment no longer stands.
    if (withdrawal) return { ...base, state: stateFor('withdrawn') };
    if (promisedOverdue > 0) return { ...base, state: stateFor('not-arrived-overdue') };
    if (coverage && !coverage.covered) return { ...base, state: stateFor('accepted-differently') };
    return { ...base, state: stateFor('awaiting-arrival') };
  }

  if (acceptance && arrival) {
    if (arrivalLate > 0) return { ...base, state: stateFor('arrived-late') };
    if (arrivalVerdict && !arrivalVerdict.covered) return { ...base, state: stateFor('arrived-partial') };
    return { ...base, state: stateFor('arrived-complete') };
  }

  if (acceptance && withdrawal) return { ...base, state: stateFor('withdrawn') };

  // No acceptance. The request either closed inside its validity or lapsed.
  if (validityLapsed > 0) return { ...base, state: stateFor('request-lapsed') };
  if (validityRemaining === null) {
    // An unreadable validity is not a licence to print "nothing is wrong".
    return { ...base, state: stateFor('awaiting-acceptance'), unreadableValidity: true };
  }
  return { ...base, state: stateFor('awaiting-acceptance') };
}

/**
 * The whole register, read once. `seat` narrows the disclosure ladder; `now` is
 * injected; nothing is read from the ambient clock.
 */
export function buildMutualAid(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const asOf = dayKey(at);
  const cfg = normalizeMutualAidSettings(settings || state.settings || {});
  const graceDays = cfg[MAA_SETTING_KEYS.releaseGraceDays];
  const warnings = [];

  const agreements = normalizeMutualAidAgreements(state.mutualAidAgreements, warnings);
  const requests = normalizeMutualAidRequests(state.mutualAidRequests, agreements, warnings);
  const acceptances = normalizeMutualAidAcceptances(state.mutualAidAcceptances, requests, warnings);
  const arrivals = normalizeMutualAidArrivals(state.mutualAidArrivals, acceptances, warnings);
  const withdrawals = normalizeMutualAidWithdrawals(state.mutualAidWithdrawals, acceptances, warnings);
  const releases = normalizeMutualAidReleases(state.mutualAidReleases, acceptances, withdrawals, warnings);
  const markers = normalizeMutualAidMarkers(state.mutualAidMarkers, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...(state.settings || {}), activeSeatId: null } });
  } catch (error) {
    matrixError = `The reporting graph could not be read (${error?.message || 'unknown error'}), so no requesting line and no joint seat can be resolved.`;
  }

  const agreementById = new Map(agreements.map((row) => [row.id, row]));
  const acceptanceByRequest = new Map(acceptances.map((row) => [row.requestId, row]));
  const arrivalByAcceptance = new Map(arrivals.map((row) => [row.acceptanceId, row]));
  const withdrawalByAcceptance = new Map(withdrawals.map((row) => [row.acceptanceId, row]));
  const releaseByAcceptance = new Map(releases.map((row) => [row.acceptanceId, row]));

  const roster = new Set(list(state.people).filter((row) => row && row.id).map((row) => row.id));
  const graphIds = matrix?.nodes ? new Set(matrix.nodes.keys()) : new Set();
  const resolveHand = (personId) => (graphIds.has(personId) || personId === LEADER_ID || roster.has(personId)
    ? maaPersonLabel(matrix, personId)
    : null);

  /* -------------------------------------------------------------- requests */

  const rows = [];
  let unresolvedLineN = 0;
  for (const request of requests) {
    const agreement = agreementById.get(request.agreementId) || null;
    const acceptance = acceptanceByRequest.get(request.id) || null;
    const arrival = acceptance ? arrivalByAcceptance.get(acceptance.id) || null : null;
    const withdrawal = acceptance ? withdrawalByAcceptance.get(acceptance.id) || null : null;
    const release = acceptance ? releaseByAcceptance.get(acceptance.id) || null : null;
    const derived = deriveMutualAidRequest({
      request,
      agreement,
      acceptance,
      arrival,
      withdrawal,
      release,
      nowDay: asOf,
      graceDays,
    });
    const lines = request.requestingLineIds.map((lineId) => {
      const name = resolveHand(lineId);
      if (!name) unresolvedLineN += 1;
      return { id: lineId, name, resolved: Boolean(name) };
    });
    let apex = { apexIds: [], ambiguous: false };
    if (matrix) {
      try {
        apex = matrixJointApex(matrix, request.requestingLineIds.filter((lineId) => graphIds.has(lineId)));
      } catch {
        apex = { apexIds: [], ambiguous: false, error: true };
      }
    }
    const apexNames = list(apex?.apexIds).map((apexId) => maaPersonLabel(matrix, apexId));
    rows.push({
      request,
      agreement,
      acceptance,
      arrival,
      withdrawal,
      release,
      state: derived.state,
      closesOn: derived.closesOn,
      validityRemaining: derived.validityRemaining,
      validityLapsed: derived.validityLapsed,
      promisedOverdue: derived.promisedOverdue,
      arrivalLate: derived.arrivalLate,
      releaseDueOn: derived.releaseDueOn,
      releaseOverdue: derived.releaseOverdue,
      coverage: derived.coverage,
      arrivalVerdict: derived.arrivalVerdict,
      breaches: derived.breaches,
      kind: derived.kind,
      lines,
      linesResolved: lines.every((line) => line.resolved),
      apex,
      apexNames,
      ambiguousApex: Boolean(apex?.ambiguous),
    });
  }

  /* ------------------------------------------------------------ agreements */

  const agreementRows = agreements.map((agreement) => {
    const agreementRequests = rows.filter((row) => row.request.agreementId === agreement.id);
    const liveState = !agreement.expiresOn
      ? 'open-term'
      : (asOf && daysBetween(agreement.expiresOn, asOf) > 0 ? 'expired' : 'open-term');
    return {
      agreement,
      requestsN: agreementRequests.length,
      acceptancesN: agreementRequests.filter((row) => row.acceptance).length,
      lapsedN: agreementRequests.filter((row) => row.state.key === 'request-lapsed').length,
      overdueN: agreementRequests.filter((row) => row.state.key === 'not-arrived-overdue').length,
      termState: liveState,
      termDaysLeft: agreement.expiresOn && asOf ? daysBetween(asOf, agreement.expiresOn) : null,
    };
  });

  /* ---------------------------------------------------------------- states */

  const states = {};
  for (const key of MAA_STATE_KEYS) states[key] = 0;
  for (const row of rows) states[row.state.key] = (states[row.state.key] || 0) + 1;
  const stateTotal = Object.values(states).reduce((sum, n) => sum + n, 0);

  const requestIds = new Set(requests.map((row) => row.id));
  const acceptanceIds = new Set(acceptances.map((row) => row.id));
  const balances = {
    statesReconcile: stateTotal === requests.length,
    acceptancesReconcile: acceptances.every((row) => requestIds.has(row.requestId)),
    arrivalsReconcile: arrivals.every((row) => acceptanceIds.has(row.acceptanceId)),
    withdrawalsReconcile: withdrawals.every((row) => acceptanceIds.has(row.acceptanceId)),
    releasesReconcile: releases.every((row) => acceptanceIds.has(row.acceptanceId)),
  };

  const breaches = rows.filter((row) => row.state.key.startsWith('breach'));
  const incompleteReasons = [];
  if (warnings.length) incompleteReasons.push(`${warnings.length} stored row(s) were unreadable and were refused with a count; no figure was repaired.`);
  if (unresolvedLineN) incompleteReasons.push(`${unresolvedLineN} requesting line(s) name a hand that is not on the active reporting graph; their joint seat cannot be resolved and their duty cannot be asked.`);
  if (matrixError) incompleteReasons.push(matrixError);
  if (!balances.statesReconcile) incompleteReasons.push('The printed state counts do not re-add to the requests they summarise.');
  if (!balances.acceptancesReconcile) incompleteReasons.push('An acceptance is not attached to a request on the record.');
  if (!balances.arrivalsReconcile) incompleteReasons.push('An arrival is not attached to an acceptance on the record.');
  if (!balances.withdrawalsReconcile) incompleteReasons.push('A withdrawal is not attached to an acceptance on the record.');
  if (!balances.releasesReconcile) incompleteReasons.push('A release is not attached to an acceptance on the record.');

  /* -------------------------------------------------------------- line view */

  const byLine = new Map();
  for (const row of rows) {
    for (const line of row.lines) {
      const entry = byLine.get(line.id) || {
        lineId: line.id,
        name: line.name,
        requestsN: 0,
        openN: 0,
        lapsedN: 0,
        overdueN: 0,
        acceptedN: 0,
        arrivedN: 0,
        breachN: 0,
        partners: new Set(),
      };
      entry.requestsN += 1;
      if (row.state.key === 'awaiting-acceptance' || row.state.key === 'requested') entry.openN += 1;
      if (row.state.key === 'request-lapsed') entry.lapsedN += 1;
      if (row.state.key === 'not-arrived-overdue') entry.overdueN += 1;
      if (row.acceptance) entry.acceptedN += 1;
      if (row.arrival) entry.arrivedN += 1;
      if (row.state.key.startsWith('breach')) entry.breachN += 1;
      if (row.agreement) entry.partners.add(row.agreement.partnerOrg);
      byLine.set(line.id, entry);
    }
  }
  const lineRows = [...byLine.values()]
    .map((entry) => ({ ...entry, partnersN: entry.partners.size, partners: [...entry.partners].sort() }))
    .sort((a, b) => String(a.name || a.lineId).localeCompare(String(b.name || b.lineId)) || String(a.lineId).localeCompare(String(b.lineId)));

  /* ---------------------------------------------------------------- totals */

  const totals = {
    agreements: agreements.length,
    liveAgreements: agreementRows.filter((row) => row.termState === 'open-term').length,
    expiredAgreements: agreementRows.filter((row) => row.termState === 'expired').length,
    requests: requests.length,
    requestedN: states.requested || 0,
    awaitingAcceptanceN: states['awaiting-acceptance'] || 0,
    requestLapsedN: states['request-lapsed'] || 0,
    cancelledN: states.cancelled || 0,
    acceptances: acceptances.length,
    acceptedAsAskedN: rows.filter((row) => row.acceptance && row.coverage?.covered).length,
    acceptedDifferentlyN: rows.filter((row) => row.acceptance && !row.coverage?.covered).length,
    awaitingArrivalN: states['awaiting-arrival'] || 0,
    notArrivedOverdueN: states['not-arrived-overdue'] || 0,
    arrivals: arrivals.length,
    arrivedCompleteN: states['arrived-complete'] || 0,
    arrivedPartialN: states['arrived-partial'] || 0,
    arrivedLateN: states['arrived-late'] || 0,
    withdrawals: withdrawals.length,
    withdrawnN: states.withdrawn || 0,
    releases: releases.length,
    breachesN: breaches.length,
    linesN: lineRows.length,
  };

  const detailed = !seat || seat.fullAccess || (Number.isInteger(seat.rank) ? seat.rank <= 3 : true);
  const disclosure = detailed
    ? { level: 'detail', reason: null, rank: seat?.rank ?? null }
    : {
      level: 'aggregate',
      reason: 'Partner names, agreement references, request subjects, confirmations, external hands and notes are withheld above rank 3. What an outside organisation was asked and promised is material belonging to the relationship, not executive reading.',
      rank: seat?.rank ?? null,
    };

  return {
    ok: true,
    engineVersion: MAA_ENGINE_VERSION,
    asOf,
    nowIso: at.toISOString(),
    matrix,
    matrixError,
    conventions: cfg,
    detailed: Boolean(detailed),
    disclosure,
    agreements,
    requests,
    acceptances,
    arrivals,
    withdrawals,
    releases,
    markers,
    rows,
    agreementRows,
    warnings,
    unresolvedLineN,
    states,
    stateTotal,
    balances,
    figuresComplete: incompleteReasons.length === 0,
    incompleteReasons,
    breaches,
    totals,
    lineRows,
    stateRows: MAA_STATE_KEYS.map((key) => ({ key, label: MAA_STATE_BY_KEY[key].label, count: states[key] || 0 })),
    attention: {
      requestLapsedN: totals.requestLapsedN,
      notArrivedOverdueN: totals.notArrivedOverdueN,
      withdrawnN: totals.withdrawnN,
      breachesN: totals.breachesN,
      total: totals.requestLapsedN + totals.notArrivedOverdueN + totals.withdrawnN + totals.breachesN,
    },
    seat: seat
      ? { rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess), label: seat.label || '' }
      : { rank: null, fullAccess: true, label: 'whole register (no seat)' },
  };
}

/**
 * The navigation badge count. Counts DUTY-SHAPED states — a request window that
 * closed with no answer, promised help whose day passed, a withdrawal whose
 * release is owed, and an ordering breach — never every open request, so the
 * badge reads as "work owed now" rather than "things happening".
 */
export function mutualAidAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  try {
    const report = buildMutualAid(state, { now, settings, seat });
    if (!report?.ok) return 0;
    return report.attention.total;
  } catch {
    return 0;
  }
}

/**
 * Insights signals. Four facts worth a leader's attention, each with the
 * printed evidence and a route — and none of them a score on a partner, an
 * external hand or a requesting line.
 */
export function mutualAidSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = buildMutualAid(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report?.ok) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Mutual aid', route: '#/mutual-aid', ...signal });

  if (report.totals.notArrivedOverdueN) {
    add({
      ruleId: 'MAA-01',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.notArrivedOverdueN} acceptance(s) whose promised arrival day has passed with no arrival on the record`,
      detail: 'The partner accepted and named a day. That day has passed and nothing arrived. The register prints the exact days past the promise and asks the joint seat above the requesting lines — never the partner, which is not a person on this graph.',
      action: { label: 'Open the mutual-aid register', route: '#/mutual-aid?panel=requests' },
      evidence: [`${report.totals.acceptances} acceptance(s) on the record`, `${report.totals.arrivals} arrival(s) recorded`],
    });
  }

  if (report.totals.requestLapsedN) {
    add({
      ruleId: 'MAA-02',
      severity: 4,
      confidence: 'high',
      title: `${report.totals.requestLapsedN} request(s) whose declared validity closed with no acceptance`,
      detail: 'The request was sent, the declared window ran out, and the partner never accepted. A request nobody answered is not a promise, and the register prints it as lapsed rather than reading the silence as an answer.',
      action: { label: 'Open the mutual-aid register', route: '#/mutual-aid?panel=requests' },
      evidence: [`${report.totals.requests} request(s) on the record`, `${report.totals.awaitingAcceptanceN} still awaiting an answer`],
    });
  }

  if (report.totals.withdrawnN) {
    add({
      ruleId: 'MAA-03',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.withdrawnN} withdrawal(s) whose release is still owed`,
      detail: 'The partner’s help has left and the release that ends the commitment has not been recorded. A commitment that dangles after the help leaves is exactly the state this register exists to notice, and the exact days past the declared grace stay printed.',
      action: { label: 'Open the mutual-aid register', route: '#/mutual-aid?panel=requests' },
      evidence: [`${report.totals.releases} release(s) recorded`, `${report.totals.withdrawals} withdrawal(s) on the record`],
    });
  }

  if (report.totals.breachesN) {
    add({
      ruleId: 'MAA-04',
      severity: 5,
      confidence: 'high',
      title: `${report.totals.breachesN} request(s) carry an act dated out of order`,
      detail: 'A request opened under an agreement that had expired, a release dated before the withdrawal that ends it, or a cancellation dated after the acceptance. The commands cannot create these; they arrived in the record and the register keeps them rather than hiding them, with the exact days by which the act preceded the duty.',
      action: { label: 'See the breaches', route: '#/mutual-aid?panel=requests' },
      evidence: [`${report.totals.requests} request(s) on the record`],
    });
  }

  return signals;
}
