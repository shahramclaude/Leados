/**
 * app/core/domain/rqReport.js — the seat-scoped read surface of the Regulator
 * Information-Request & Examination Response Register (ADR-0235/0236, Schema
 * v191, `RULE-RQR-01`, CSV #178).
 *
 * ONE kernel (`buildInformationRequests`) stands behind every state, flag,
 * count, rate and lineage edge this module returns. This layer adds exactly four
 * things and invents none of them:
 *
 *   1. SEAT VISIBILITY. A request names a requester outside the entity, the seat
 *      that recorded it, the producer of every line, the seat that reviewed each
 *      line and the seat that released. A seat reads a request when it is a
 *      PARTY to it or when it holds one of those people on its tree or a declared
 *      line. Anything else is withheld and COUNTED (`hidden`), never printed and
 *      never dropped silently. Where a request is hidden from the seat, the
 *      register-wide rate is withheld whole with a printed reason — a rate built
 *      from part of the population would read as the enterprise's (the ADR-0226
 *      posture).
 *
 *   2. THE ONE RATE, printed with its denominator: of the requests whose
 *      effective reply day has passed, how many carried their release ON OR
 *      BEFORE it. A lapsed request sits in the denominator and never in the
 *      numerator — that is the whole point of the figure. Exact floor basis
 *      points over exact integer counts; blank with its reason when unsupported.
 *
 *   3. THE ATTENTION COUNT — the acts THIS SEAT owes: a completeness review on a
 *      production asserted on a line it may review; a release once every line is
 *      reviewed; the requester's answer on a release it filed; and the unfilled
 *      producer slot on a line of a request it recorded. Never a volume about a
 *      person.
 *
 *   4. FOLLOW-UP LINEAGE — a human-declared edge to one earlier demand. It is
 *      shown only when both linked rows are visible; otherwise the missing side,
 *      supported depth, verdict-dependent flag and whole-register counts are
 *      withheld. The edge never grants access to its parent or child.
 *
 * WHAT THIS MODULE NEVER DOES. It never rates a person, a team, a function or a
 * requester; never computes a cooperation score or a league table; never infers
 * a producer, a privilege basis or a statutory deadline; and never converts a
 * passed reply day into an answered request.
 */

import { buildInformationRequests } from './rqProduction.js';
import {
  RQR_STATE_KEYS,
  RQR_FLAGS,
  RQR_REQUESTER_KINDS,
  RQR_INSTRUMENTS,
  RQR_RIGHTS,
  rqrReviewEligibility,
} from './rqRegistry.js';
import { RQR_WINDOW_BUCKETS } from './rqMath.js';
import { canAct, activeSeat, buildSeats } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';

/** The one identity a seat is judged by on this register: the person it is. */
const seatPerson = (seat) => (seat ? (seat.nodeId || seat.id || null) : null);

/**
 * THE PARTIES OF A REQUEST, read off the derived row. The seat that recorded the
 * demand, every line's producer, and every human hand on the ledger. Membership
 * here is the ONLY conflict test the review key applies — and it is applied to
 * the row the kernel derived, not to a declaration.
 */
export function rqPartiesOf(row) {
  if (!row) return [];
  return [...new Set([
    ...(Array.isArray(row.partyIds) ? row.partyIds : []),
    ...(row.lines || []).map((line) => line.producerId),
    row.receivedById,
  ].filter(Boolean))];
}

/**
 * MAY THIS SEAT REVIEW A LINE OF THIS REQUEST? A thin seat-shaped wrapper over
 * `rqrReviewEligibility` — the ONE test, defined in the registry — so the action,
 * the badge, the panel and the rule cannot drift apart. The only thing added here
 * is the seat→person resolution and the rule that an UNDECLARED operator view
 * cannot review: a completeness certificate is a first-person act with a name on
 * it, and the operator view has no name to give.
 */
export function rqSeatMayReview(matrix, seat, row) {
  if (!seat || seat.fullAccess) return false;
  const self = seatPerson(seat);
  if (!self) return false;
  return rqrReviewEligibility(matrix, self, row).allow;
}

/** The refusal REASON behind a refusal, for the panel and the dialogs to print. */
export function rqSeatReviewRefusal(matrix, seat, row) {
  if (!seat) return { allow: false, reason: 'no-seat' };
  if (seat.fullAccess) return { allow: false, reason: 'operator-view' };
  const self = seatPerson(seat);
  if (!self) return { allow: false, reason: 'no-actor' };
  return rqrReviewEligibility(matrix, self, row);
}

/** The whole-workspace graph, read without a seat — one graph implementation. */
export function buildMatrixForReview(state, now) {
  return buildMatrix(state, { now: now || new Date(), settings: { ...(state?.settings || {}), activeSeatId: null } });
}

/**
 * The seat grant for one derived row. A party always reads it — the receiver, a
 * producer, a reviewer and the releasing seat are parties by definition. A
 * manager reads the requests of the people in their span or declared lines.
 * Nobody else does.
 */
export function rqGrant(seat, row) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  const self = seatPerson(seat);
  if (!self) return 'denied';
  const parties = [
    row.receivedById,
    row.releasedById,
    row.respondedById,
    row.clockRestatedBy,
    row.apexId,
    ...row.lines.flatMap((line) => [line.producerId, line.producedById, line.reviewedById]),
  ].filter(Boolean);
  if (parties.includes(self)) return 'full';
  const reach = (id) => Boolean(id) && ((seat.scope && seat.scope.has(id)) || (seat.lineScope && seat.lineScope.has(id)));
  const held = [row.receivedById, row.apexId, ...row.lines.map((line) => line.producerId)].filter(Boolean);
  if (held.some(reach)) return 'full';
  return 'denied';
}

const seatSummary = (seat) => (seat
  ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess: Boolean(seat.fullAccess) }
  : null);

export function buildInformationRequestReport(state, { now, seat = null } = {}) {
  const kernel = buildInformationRequests(state, { now });

  const visible = [];
  const hidden = [];
  for (const row of kernel.rows) {
    if (!seat || rqGrant(seat, row) === 'full') visible.push(row);
    else hidden.push(row);
  }
  const hiddenN = seat ? hidden.length : 0;
  const wholePopulation = hiddenN === 0;
  const visibleIds = new Set(visible.map((row) => row.id));
  const visibleRows = visible.map((row) => {
    const lineage = row.followUp || { status: 'original', parent: null, children: [], childCount: 0, depth: 0, rootRequestId: row.id, ancestorIds: [] };
    const parentVisible = !lineage.parent || visibleIds.has(lineage.parent.id);
    const parentRow = lineage.parent ? kernel.rows.find((candidate) => candidate.id === lineage.parent.id) : null;
    const parentAncestor = parentRow?.followUp?.parent || null;
    const parentRelationshipWithheld = Boolean(parentAncestor && !visibleIds.has(parentAncestor.id));
    const visibleChildren = (lineage.children || []).filter((child) => visibleIds.has(child.id));
    const childrenWithheld = visibleChildren.length !== (lineage.children || []).length;
    const ancestryVisible = (lineage.ancestorIds || []).every((id) => visibleIds.has(id));
    return {
      ...row,
      // An unsubstantiated flag depends on the hidden parent's verdict. Keep the
      // child read honest without disclosing that parent's state to this seat.
      flags: lineage.parent && !parentVisible
        ? row.flags.filter((flag) => flag !== RQR_FLAGS.followUpUnsubstantiated)
        : row.flags,
      followUp: {
        status: lineage.parent && !parentVisible ? 'parent-withheld' : lineage.status,
        parent: parentVisible && lineage.parent
          ? {
            ...lineage.parent,
            relationshipState: parentRelationshipWithheld ? 'parent-withheld' : lineage.parent.relationshipState,
          }
          : null,
        parentWithheld: Boolean(lineage.parent && !parentVisible),
        children: visibleChildren,
        childCount: visibleChildren.length,
        childrenWithheld,
        depth: ancestryVisible ? lineage.depth : null,
        rootRequestId: ancestryVisible ? lineage.rootRequestId : null,
      },
    };
  });

  const rates = wholePopulation
    ? kernel.counts.rates
    : { releasedInsideWindow: { owed: null, onTime: null, onTimeBp: null } };
  const lineageCounts = wholePopulation ? kernel.lineageCounts : null;
  const lineageCountsWithheldReason = wholePopulation
    ? null
    : `${hiddenN} information request(s) are not visible from this seat. Follow-up counts and lineage depth are withheld whole rather than describing a partial relationship graph.`;

  return {
    engine: kernel.engine,
    adr: kernel.adr,
    lineageAdr: kernel.lineageAdr,
    rule: kernel.rule,
    asOf: kernel.asOf,
    rows: visibleRows,
    lineageCounts,
    lineageCountsWithheld: !wholePopulation,
    lineageCountsWithheldReason,
    counts: {
      ...kernel.counts,
      visible: visible.length,
      hidden: hiddenN,
      rates,
    },
    rates,
    ratesWithheld: !wholePopulation,
    ratesWithheldReason: wholePopulation
      ? null
      : `${hiddenN} information request(s) are not visible from this seat. A rate built from part of the population would be read as the enterprise’s, so no register-wide rate is printed. Ask a seat granted the whole register.`,
    refusals: kernel.warnings,
    markers: kernel.markers,
    partitionReconciles: kernel.partitionReconciles,
    figuresComplete: kernel.figuresComplete,
    warnings: kernel.warnings,
    method: kernel.method,
    seat: seatSummary(seat),
  };
}

/**
 * The nav badge: the acts this seat owes on the record.
 *
 *   A completeness review owed on a production asserted on a line this seat may
 *   review — decided with the SAME predicate the action enforces.
 *   A release owed to the requester once every line is reviewed, for the seat
 *   that recorded the demand.
 *   The requester's answer owed on a release this seat filed.
 *   A production line with no named producer, on a request this seat recorded.
 *
 * Never a volume about a person, and never a count of somebody else's backlog.
 */
export function informationRequestAttentionCount(state, { now, seat = null } = {}) {
  if (!seat) return 0;
  const self = seatPerson(seat);
  // The undeclared operator view is not a person and can perform none of the
  // register's first-person acts, so it owes nothing.
  if (!self && !seat.fullAccess) return 0;
  if (seat.fullAccess) return 0;
  let matrix = null;
  try {
    matrix = buildMatrixForReview(state, now);
  } catch {
    matrix = null;
  }
  const report = buildInformationRequestReport(state, { now, seat });
  const kernel = buildInformationRequests(state, { now });
  let count = 0;
  for (const row of report.rows) {
    const kernelRow = kernel.rows.find((candidate) => candidate.id === row.id);
    if (!kernelRow) continue;
    if (matrix) {
      const mayReview = rqSeatMayReview(matrix, seat, kernelRow);
      if (mayReview) {
        count += kernelRow.lines.filter((line) => line.lineState === 'produced').length;
      }
    }
    // The seat that recorded the demand owes the release, the requester's
    // answer, and the staffing of any line still without a producer.
    if (kernelRow.allReviewed && !kernelRow.released && kernelRow.receivedById === self) count += 1;
    if (kernelRow.released && !kernelRow.respondedOn && kernelRow.receivedById === self) count += 1;
    if (kernelRow.unassignedLineCount > 0 && kernelRow.receivedById === self) count += 1;
  }
  return count;
}

/** Read-right proof used by the view before it renders anything. */
export function informationRequestReadCheck(state, { now } = {}) {
  const lineScope = matrixLineScopeFor(state, { now, settings: state?.settings || {} });
  const built = buildSeats(state, { now, settings: state?.settings || {}, lineScope });
  const seat = activeSeat(built);
  if (!seat || seat.readOnly) return { ok: false, seat: null, reason: 'No seat is resolved.' };
  const verdict = canAct(RQR_RIGHTS.READ, seat);
  return verdict.allow ? { ok: true, seat } : { ok: false, seat, reason: verdict.reason };
}

/* ------------------------------------------------------------------- CSV */

const num = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * CSV scope #178 — aggregate and identity-free, built from the SAME reader the
 * panel renders. The rows carry no request id, requester name, requested scope,
 * search method, transmission reference, privilege basis, producer, reviewer or
 * receiver name: nothing here can be traced back to a person or to a specific
 * demand from the export alone.
 */
export function informationRequestCsvRows(report) {
  const rows = [];
  const asOf = report.asOf;
  const counts = report.counts || {};
  const rates = report.rates || { releasedInsideWindow: {} };
  const rateWithheld = Boolean(report.ratesWithheld);
  const lineage = report.lineageCounts || null;
  const lineageWithheld = Boolean(report.lineageCountsWithheld) || !lineage;
  const lineageReason = lineageWithheld
    ? (report.lineageCountsWithheldReason || 'Follow-up lineage is unavailable; no partial count is exported.')
    : '';
  const withheldReasons = [
    rateWithheld ? (report.ratesWithheldReason || 'the register-wide rate is withheld') : '',
    lineageWithheld ? lineageReason : '',
  ].filter(Boolean);

  const blank = (reason) => ({
    requests: '', open: '', released: '', lapsed: '',
    closing: '', unreleased: '', refused: '', insufficient: '',
    follow_up_requests: '', follow_ups_after_insufficient: '', follow_ups_unsubstantiated: '',
    roots_with_follow_ups: '', max_follow_up_depth: '',
    owed: '', on_time: '', on_time_rate_bp: '', blank_reason: reason,
  });

  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'all', state: '', requester_kind: '',
    requests: num(counts.requests), open: num(counts.open), released: num(counts.released),
    lapsed: num(counts.lapsed),
    closing: num(counts.closing), unreleased: num(counts.unreleased),
    refused: num(counts.refused), insufficient: num(counts.insufficient),
    follow_up_requests: lineage ? num(lineage.followUpRequests) : '',
    follow_ups_after_insufficient: lineage ? num(lineage.followUpsAfterInsufficient) : '',
    follow_ups_unsubstantiated: lineage ? num(lineage.followUpsUnsubstantiated) : '',
    roots_with_follow_ups: lineage ? num(lineage.rootsWithDirectFollowUps) : '',
    max_follow_up_depth: lineage ? num(lineage.maxFollowUpDepth) : '',
    owed: '', on_time: '', on_time_rate_bp: '',
    blank_reason: withheldReasons.join('; '),
  });

  rows.push({
    as_of: asOf, row_kind: 'coverage', key: 'claims', state: '', requester_kind: '',
    ...blank(''),
    requests: num(counts.requests),
    blank_reason: `partitionReconciles=${report.partitionReconciles ? 'true' : 'false'}; figuresComplete=${report.figuresComplete ? 'true' : 'false'}; dropped-rows=${counts.droppedRows || 0}; unassigned-lines=${counts.unassignedLines || 0}; no-authority=${counts.noAuthority || 0}; no-independent-reviewer=${counts.noReviewer || 0}; clock-moves-recorded=${counts.clockMoves || 0}; all-declared-follow-up-links-supported=${lineage ? String(lineage.declaredLinksSupported) : 'withheld'}; follow-up-requests=${lineage ? lineage.followUpRequests : 'withheld'}; follow-ups-after-insufficient=${lineage ? lineage.followUpsAfterInsufficient : 'withheld'}; follow-ups-unsubstantiated=${lineage ? lineage.followUpsUnsubstantiated : 'withheld'}; ${lineageReason || 'lineage-counts=whole-register'}`,
  });

  for (const key of RQR_STATE_KEYS) {
    rows.push({
      as_of: asOf, row_kind: 'state', key, state: key, requester_kind: '',
      ...blank(''),
      requests: String((counts.byState && counts.byState[key]) || 0),
    });
  }
  for (const kind of RQR_REQUESTER_KINDS) {
    const n = (counts.byRequesterKind && counts.byRequesterKind[kind.key]) || 0;
    const belowFloor = n > 0 && n < 3;
    rows.push({
      as_of: asOf, row_kind: 'requester', key: kind.key, state: '', requester_kind: kind.key,
      ...blank(belowFloor ? 'Below the privacy floor of three: a count this small would name a relationship with a specific authority, so it is exported blank rather than as a small number.' : ''),
      requests: belowFloor ? '' : String(n),
    });
  }
  for (const instrument of RQR_INSTRUMENTS) {
    rows.push({
      as_of: asOf, row_kind: 'instrument', key: instrument.key, state: '', requester_kind: '',
      ...blank(''),
      requests: String((counts.byInstrument && counts.byInstrument[instrument.key]) || 0),
    });
  }
  for (const bucket of RQR_WINDOW_BUCKETS) {
    rows.push({
      as_of: asOf, row_kind: 'window', key: bucket.key, state: '', requester_kind: '',
      ...blank(''),
      requests: String((counts.windows && counts.windows[bucket.key]) || 0),
    });
  }

  rows.push({
    as_of: asOf, row_kind: 'rate', key: 'released-inside-window', state: '', requester_kind: '',
    ...blank(''),
    owed: num(rates.releasedInsideWindow?.owed),
    on_time: num(rates.releasedInsideWindow?.onTime),
    on_time_rate_bp: num(rates.releasedInsideWindow?.onTimeBp),
    blank_reason: rateWithheld ? (report.ratesWithheldReason || 'withheld') : '',
  });
  rows.push({
    as_of: asOf, row_kind: 'privilege', key: 'claims-and-review-position', state: '', requester_kind: '',
    ...blank(''),
    requests: num(counts.privilegeClaims),
    blank_reason: `privilege-claims=${counts.privilegeClaims || 0}; unreviewed=${counts.privilegeUnreviewed || 0}; struck-out=${counts.privilegeRefused || 0}; withheld-items-declared=${counts.privilegeItems || 0}; produced-items-declared=${counts.producedItems || 0}. Declared counts only: the register does not hold the material and cannot check these figures.`,
  });
  rows.push({
    as_of: asOf, row_kind: 'release', key: 'reviewed-not-released', state: '', requester_kind: '',
    ...blank(''),
    closing: num(counts.unreleased),
    blank_reason: counts.unreleased
      ? 'Every line of these requests is independently reviewed and the requester has been sent nothing. The duty closes only on the receiving seat’s dated release act.'
      : '',
  });

  return rows;
}
