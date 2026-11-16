/**
 * app/core/domain/rqProduction.js — the pure kernel of the Regulator
 * Information-Request & Examination Response Register (ADR-0235/0236,
 * `RULE-RQR-01`, Schema v191).
 *
 * A demand is RECORDED once by a director seat in their own name and never
 * edited. Seven append-only act kinds move it:
 *
 *   ASSIGN  — name a producer, a subject and a day on one production line that
 *             was recorded without one. The producer is NAMED, never inferred
 *             from org position.
 *   PRODUCE — the line's producer asserts what they searched, over what window,
 *             how many items they found, whether the list is COMPLETE, and
 *             whether the line claims PRIVILEGE over anything it withheld. One
 *             assertion per line; a second is refused while it stands untested.
 *   REVIEW  — a seat that produced NOTHING on this request clears or refuses the
 *             line, and rules on its privilege claim. Conflict, not rank, is the
 *             gate; standing is the floor.
 *   RELEASE — the receiving seat records that the production went to the
 *             requester, in writing, on a day, under a named transmission.
 *             REFUSED until every line has been reviewed.
 *   RESPOND — the requester's own verdict on the production, recorded once.
 *   CLOCK   — the requester's OWN restatement of the reply day, with their dated
 *             reference. This is the only way a deadline moves without an
 *             extension the entity asked for.
 *   EXTEND  — move the reply day. REFUSED outright on a compelled instrument,
 *             refused without the requester's recorded agreement on any other,
 *             refused past the declared horizon, and refused after the day has
 *             passed.
 *
 * THREE FACTS, KEPT APART. `produced`, `reviewed` and `released` are three
 * distinct booleans on every read, and the ONE state is derived from them by the
 * precedence declared in `rqRegistry.js`. `released-answered` is the only state
 * that asserts the requester was answered AND accepted it.
 *
 * THE PRIVILEGE CLAIM IS A FOURTH FACT, AND IT IS THE REASON THIS REGISTER
 * EXISTS. A production line may withhold material it calls privileged. That
 * claim is a producer's assertion, and a producer cannot certify their own
 * withholding — so an uncleared claim is PRINTED (`privilege-claim-unreviewed`)
 * and never allowed to read as a closed line. A claim struck out in review is
 * also printed: the line's withheld material is then unaccounted for, and the
 * register says so rather than quietly releasing.
 *
 * THE MATRIX IS THE POINT. Every line names its own producer; the seat answerable
 * for the WHOLE response is the joint apex above every line's producer, computed
 * from the graph and never chosen by the actor. Where no such seat exists the
 * register prints `no-authority` and asks nobody. Where the graph names no seat
 * OUTSIDE the producers with standing to review, the register prints
 * `no-independent-reviewer` and does not waive the test.
 *
 * THE DAY NEVER DECIDES. A reply day that passes with no release reads
 * `reply-lapsed` — never answered, never closed, never extended by the passage of
 * time.
 *
 * Nothing derived is stored, so a hand-edited file cannot carry a review nobody
 * made, a release that was never sent, or a privilege claim nobody tested.
 */

import { dayKey, daysBetween } from '../time.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { LEADER_ID } from './chain.js';
import {
  RQR_ADR,
  RQR_LINEAGE_ADR,
  RQR_ENGINE_VERSION,
  RQR_FLAGS,
  RQR_LIMITS as L,
  RQR_METHOD,
  RQR_RULE_ID,
  RQR_STATE_KEYS,
  rqrInstrumentIsCompelled,
  rqrReviewEligibility,
} from './rqRegistry.js';
import {
  normalizeRequestActs,
  normalizeRequestMarkers,
  normalizeRequests,
} from './rqSchema.js';
import { rqrBp, rqrWindowBucket, RQR_WINDOW_BUCKETS } from './rqMath.js';

const list = (value) => (Array.isArray(value) ? value : []);
const dayOf = (iso) => String(iso || '').slice(0, 10);

/**
 * Two acts carrying the SAME timestamp are ordered by their position in the
 * ledger, not by their id string: an act written later is later. This matters
 * the moment a review lands in the same instant as the production it answers
 * (a fixture clock, two acts in one commit).
 */
function actOrder(acts) {
  const ord = new Map();
  let i = 0;
  for (const act of acts) ord.set(act, i++);
  return ord;
}

function compareActs(a, b, ord) {
  const byAt = String(a?.at || '').localeCompare(String(b?.at || ''));
  if (byAt !== 0) return byAt;
  return (ord.get(a) ?? 0) - (ord.get(b) ?? 0);
}

/**
 * The manager ids that hold a person on the read day — the home line from the
 * roster plus every active declared line. Deduplicated, and never invented.
 */
function managerIdsFor(state, personId, day) {
  const people = list(state?.people);
  const person = people.find((row) => row && row.id === personId) || null;
  const ids = new Set();
  if (person?.managerId && person.managerId !== LEADER_ID) ids.add(person.managerId);
  for (const raw of list(state?.reportingLines)) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    if (raw.personId !== personId) continue;
    if (raw.status && raw.status !== 'active') continue;
    if (raw.fromISO && String(raw.fromISO).slice(0, 10) > day) continue;
    if (raw.toISO && String(raw.toISO).slice(0, 10) < day) continue;
    if (raw.managerId && raw.managerId !== LEADER_ID) ids.add(raw.managerId);
  }
  return [...ids];
}

/**
 * One line's timeline. The LATEST production and the LATEST review are what
 * speak; every earlier one stays on the record but does not decide the line. A
 * review dated before the current production reviewed a different assertion and
 * does not count for this one — it is reported (`staleReviewCount`), never
 * averaged in. Where more than one review sits on the record the MOST RECENT
 * independent fact governs, so a later refusal can never be buried under an
 * earlier clearance.
 */
function readLineTimeline(request, acts, line, ord) {
  const mine = list(acts)
    .filter((act) => act && act.requestId === request.id && act.lineId === line.lineId)
    .sort((a, b) => compareActs(a, b, ord));
  const produces = mine.filter((act) => act.kind === 'produce');
  const reviews = mine.filter((act) => act.kind === 'review');
  const assigns = mine.filter((act) => act.kind === 'assign');
  const latestProduce = produces.length ? produces[produces.length - 1] : null;
  const latestAssign = assigns.length ? assigns[assigns.length - 1] : null;
  const testable = latestProduce
    ? reviews.filter((act) => String(act.at) >= String(latestProduce.at))
    : [];
  const governingReview = testable.length ? testable[testable.length - 1] : null;
  return { latestProduce, latestAssign, governingReview, produces, reviews, assigns };
}

const CLOSED_STATES = Object.freeze(['released-answered', 'reply-lapsed']);

function deriveRow(state, request, acts, peopleIndex, matrix, today) {
  const requestActs = list(acts).filter((act) => act && act.requestId === request.id);
  const ord = actOrder(requestActs);

  const releases = requestActs.filter((act) => act.kind === 'release');
  const responses = requestActs.filter((act) => act.kind === 'respond');
  const clocks = requestActs.filter((act) => act.kind === 'clock');
  const extends_ = requestActs.filter((act) => act.kind === 'extend');

  /** The clock in force: the requester's own latest restatement, else the day
   * derived at record time from the declared clock. A restatement and an
   * extension are different facts, and the LATER one of the two is in force. */
  const sortedClocks = [...clocks].sort((a, b) => compareActs(a, b, ord));
  const lastClock = sortedClocks.length ? sortedClocks[sortedClocks.length - 1] : null;
  const sortedExtends = [...extends_].sort((a, b) => compareActs(a, b, ord));
  const lastExtension = sortedExtends.length ? sortedExtends[sortedExtends.length - 1] : null;
  const movedClock = [lastClock, lastExtension]
    .filter(Boolean)
    .sort((a, b) => compareActs(a, b, ord))
    .pop() || null;
  const effectiveReplyDay = movedClock
    ? (movedClock.kind === 'clock' ? movedClock.restatedReplyDay : movedClock.newReplyDay)
    : request.replyDay;

  /**
   * THE PARTIES. Everyone whose hand is on this production: the seat that
   * recorded the demand, every line's producer, and every human act on the
   * ledger. A reviewer must be OUTSIDE this set — that is the whole conflict
   * test, and it is computed from the record, never from a checkbox.
   */
  const partyIds = [...new Set([
    request.receivedById,
    ...request.lines.map((line) => line.producerId),
    ...requestActs.map((act) => act.actorId),
  ].filter(Boolean))];

  /** Per-line state, and the privilege position that sits beside it. */
  const lines = request.lines.map((declared) => {
    const timeline = readLineTimeline(request, requestActs, declared, ord);
    const holderId = timeline.latestAssign?.producerId || declared.producerId || null;
    const subject = timeline.latestAssign?.subject || declared.subject;
    const dueOn = timeline.latestAssign?.dueOn || declared.dueOn;
    const holder = holderId ? peopleIndex.get(holderId) || null : null;
    const holderActive = Boolean(holder) && holder.status !== 'archived';
    const produced = Boolean(timeline.latestProduce);
    const reviewed = Boolean(timeline.governingReview);
    const verdict = timeline.governingReview?.verdict || null;
    const privilege = timeline.latestProduce?.privilege
      || { claimed: false, withheldCount: 0, basis: '' };
    const privilegeVerdict = reviewed ? (timeline.governingReview?.privilegeVerdict || null) : null;
    let lineState;
    if (!holderId) lineState = 'unassigned';
    else if (verdict === 'refuse') lineState = 'refused';
    else if (verdict === 'clear') lineState = 'cleared';
    else if (produced) lineState = 'produced';
    else lineState = 'working';
    /** A claim is UNREVIEWED while it stands with no verdict on it. A claim the
     * reviewer struck out leaves the line's withheld material unaccounted for —
     * printed, not repaired, and never silently dropped from the count. */
    const privilegeUnreviewed = privilege.claimed && (!reviewed || privilegeVerdict === null);
    const privilegeRefused = privilege.claimed && privilegeVerdict === 'refuse';
    return {
      lineId: declared.lineId,
      roleLabel: declared.roleLabel,
      subject,
      dueOn,
      producerId: holderId,
      producerName: holder?.name || holderId || null,
      producerRole: holder?.role || holder?.level || '',
      producerActive: holderActive,
      resolved: Boolean(holder),
      lineState,
      produced,
      reviewed,
      verdict,
      itemCount: timeline.latestProduce?.itemCount ?? null,
      complete: timeline.latestProduce?.complete ?? null,
      methodText: timeline.latestProduce?.methodText || null,
      searchWindow: timeline.latestProduce?.searchWindow || null,
      producedOn: timeline.latestProduce ? dayOf(timeline.latestProduce.at) : null,
      producedById: timeline.latestProduce?.actorId || null,
      privilegeClaimed: privilege.claimed,
      privilegeWithheldCount: privilege.claimed ? privilege.withheldCount : 0,
      privilegeBasis: privilege.claimed ? privilege.basis : null,
      privilegeVerdict,
      privilegeUnreviewed,
      privilegeRefused,
      reviewedOn: timeline.governingReview ? dayOf(timeline.governingReview.at) : null,
      reviewedById: timeline.governingReview?.actorId || null,
      reviewMethod: timeline.governingReview?.methodText || null,
      produceCount: timeline.produces.length,
      reviewCount: timeline.reviews.length,
      assignCount: timeline.assigns.length,
      staleReviewCount: timeline.reviews.length - (timeline.governingReview ? 1 : 0),
    };
  });

  const unassignedLines = lines.filter((line) => line.lineState === 'unassigned');
  const refusedLines = lines.filter((line) => line.lineState === 'refused');
  const clearedLines = lines.filter((line) => line.lineState === 'cleared');
  const privilegeLines = lines.filter((line) => line.privilegeClaimed);
  const unreviewedPrivilegeLines = lines.filter((line) => line.privilegeUnreviewed);
  const refusedPrivilegeLines = lines.filter((line) => line.privilegeRefused);
  const allReviewed = lines.length > 0 && clearedLines.length === lines.length;
  const anyProduced = lines.some((line) => line.produced);

  /**
   * THE JOINT APEX. The seat that answers for the WHOLE response is the lowest
   * seat above EVERY production line's manager, computed from the graph. A
   * single line reduces to its producer's manager. Where the graph names no
   * such seat the register prints `no-authority` and promotes nobody.
   */
  const producerIds = lines.map((line) => line.producerId).filter(Boolean);
  const managerIds = [...new Set(producerIds.flatMap((id) => managerIdsFor(state, id, today)))]
    .filter((id) => id && matrix?.nodes?.has(id));
  const apex = managerIds.length
    ? matrixJointApex(matrix, managerIds)
    : { apexIds: [], apexId: null, unique: false, ambiguous: false, disconnected: false, isLeaderOnly: false };
  const apexId = apex.unique ? apex.apexId : null;
  const accountability = lines.length === 1 && lines[0].producerId
    ? 'single-holder'
    : (apexId ? 'joint-apex' : 'no-authority');

  /**
   * CAN ANYBODY REVIEW THIS AT ALL? The SAME predicate the action, the badge and
   * the panel use (`rqrReviewEligibility`, defined in the registry so no surface
   * can carry a second copy). Computed HERE so the register can print
   * `no-independent-reviewer` as a fact about the graph rather than a guess.
   */
  const reviewerCandidates = [...(matrix?.nodes?.keys?.() || [])]
    .filter((id) => rqrReviewEligibility(matrix, id, { partyIds, lines }).allow);
  // A request whose lines are not yet staffed has nothing to review, so the
  // absence of a reviewer is not yet a finding; it becomes one the moment a
  // production stands on any line.
  const needsReviewer = anyProduced;
  const canReview = reviewerCandidates.length > 0;

  /** The one release, and the requester's answer to it. */
  const sortedReleases = [...releases].sort((a, b) => compareActs(a, b, ord));
  const release = sortedReleases.length ? sortedReleases[0] : null;
  const sortedResponses = [...responses].sort((a, b) => compareActs(a, b, ord));
  const response = sortedResponses.length ? sortedResponses[0] : null;
  const releasedOn = release ? dayOf(release.at) : null;
  const respondedOn = response ? dayOf(response.at) : null;
  const responseVerdict = response?.response || null;

  /** The latest review on the record, used to floor the release day. */
  const reviewedDays = clearedLines.map((line) => line.reviewedOn).filter(Boolean).sort();
  const lastReviewedOn = reviewedDays.length ? reviewedDays[reviewedDays.length - 1] : null;

  const daysRemaining = daysBetween(today, effectiveReplyDay);
  const isLapsed = !release && daysRemaining !== null && daysRemaining < 0;
  const closing = !release && daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= L.closingWindowDays;
  const releaseOverdue = Boolean(release && allReviewed && !response
    && daysBetween(releasedOn, today) !== null
    && daysBetween(releasedOn, today) > L.releaseChaseDays);

  const flags = [];
  if (isLapsed) flags.push(RQR_FLAGS.lapsed);
  if (closing) flags.push(RQR_FLAGS.closing);
  if (allReviewed && !release) flags.push(RQR_FLAGS.unreleased);
  if (refusedLines.length) flags.push(RQR_FLAGS.refused);
  if (responseVerdict === 'insufficient') flags.push(RQR_FLAGS.insufficient);
  if (unreviewedPrivilegeLines.length) flags.push(RQR_FLAGS.privilegeUnreviewed);
  if (refusedPrivilegeLines.length) flags.push(RQR_FLAGS.privilegeRefused);
  if (unassignedLines.length) flags.push('line-unassigned');
  if (lines.some((line) => line.producerId && !line.producerActive)) flags.push(RQR_FLAGS.holderUnresolved);
  if (lines.length > 1 && !apexId) flags.push(RQR_FLAGS.noAuthority);
  if (needsReviewer && !canReview) flags.push(RQR_FLAGS.noReviewer);
  /**
   * A compelled instrument's day was moved without the requester's own agreement
   * on the record. PRINTED on the row and counted — never silently accepted and
   * never rewritten.
   */
  if (movedClock && movedClock.kind === 'extend' && rqrInstrumentIsCompelled(request.instrument)
    && !movedClock.requesterAgreementRef) {
    flags.push(RQR_FLAGS.unilateralExtension);
  }

  /**
   * THE PRECEDENCE IS THE REGISTRY'S, NOT THIS FILE'S. Each candidate state is
   * tested in the order `RQR_STATES` declares, so the kernel, the panel, the
   * rule and the CSV cannot disagree about which fact wins. A second
   * hand-written ladder here is how two surfaces drift apart.
   */
  const holds = {
    'reply-lapsed': isLapsed,
    'reply-insufficient': responseVerdict === 'insufficient',
    refused: refusedLines.length > 0,
    'released-answered': Boolean(release) && responseVerdict === 'received-complete',
    'cleared-unreleased': allReviewed,
    'produced-unreviewed': anyProduced,
    // In progress means the lines are STAFFED and at work. A demand with a line
    // nobody produces has not started, and reads `received` — the register never
    // implies work is under way on a line with no named producer.
    working: unassignedLines.length === 0,
    received: true,
  };
  const derivedState = RQR_STATE_KEYS.find((key) => holds[key] === true) || 'working';

  return {
    id: request.id,
    requester: request.requester,
    requesterKind: request.requesterKind,
    instrument: request.instrument,
    instrumentRef: request.instrumentRef,
    scope: request.scope,
    receivedOn: request.receivedOn,
    replyClockDays: request.replyClockDays,
    replyDay: request.replyDay,
    effectiveReplyDay,
    clockRestatedOn: lastClock ? dayOf(lastClock.at) : null,
    clockRestatedBy: lastClock?.actorId || null,
    requesterReference: lastClock?.requesterReference || null,
    extendedOn: lastExtension ? dayOf(lastExtension.at) : null,
    extendCount: sortedExtends.length,
    movedClock,
    receivedById: request.receivedById,
    receiverName: peopleIndex.get(request.receivedById)?.name || request.receivedById,
    createdAt: request.createdAt,
    partyIds,
    lines,
    lineCount: lines.length,
    unassignedLineCount: unassignedLines.length,
    refusedLineCount: refusedLines.length,
    clearedLineCount: clearedLines.length,
    allReviewed,
    privilegeClaimCount: privilegeLines.length,
    privilegeClaimedItems: privilegeLines.reduce((sum, line) => sum + line.privilegeWithheldCount, 0),
    privilegeUnreviewedCount: unreviewedPrivilegeLines.length,
    privilegeRefusedCount: refusedPrivilegeLines.length,
    producedItemCount: lines.reduce((sum, line) => sum + (line.produced ? (line.itemCount || 0) : 0)),
    apexId,
    apexIds: apex.apexIds,
    apexAmbiguous: Boolean(apex.ambiguous),
    accountability,
    canReview,
    reviewerCandidateCount: reviewerCandidates.length,
    state: derivedState,
    flags,
    releasedOn,
    transmissionRef: release?.transmissionRef || null,
    releaseText: release?.releaseText || null,
    releasedItemCount: release?.itemCount ?? null,
    releasedById: release?.actorId || null,
    released: Boolean(release),
    respondedOn,
    response: responseVerdict,
    responseRef: response?.responseRef || null,
    responseText: response?.responseText || null,
    respondedById: response?.actorId || null,
    releaseOverdue,
    lastReviewedOn,
    daysRemaining,
    windowBucket: rqrWindowBucket(daysRemaining),
    lapsed: isLapsed,
    closing,
    closed: CLOSED_STATES.includes(derivedState),
  };
}

const followUpSummary = (row, status) => ({
  id: row.id,
  requester: row.requester,
  requesterKind: row.requesterKind,
  instrument: row.instrument,
  instrumentRef: row.instrumentRef,
  scope: row.scope,
  receivedOn: row.receivedOn,
  respondedOn: row.respondedOn,
  response: row.response,
  state: row.state,
  relationshipState: status,
});

/**
 * Attach request lineage from the immutable `followsUpOn` declaration. The
 * lineage edge is supported only by a real, earlier insufficient response, a
 * child record created on or after that verdict, and a child receipt day on or
 * after it. This is a record-integrity claim,
 * not a semantic claim that two free-text scopes are identical.
 */
function applyFollowUpLineage(rows, requests, acts) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenByParent = new Map(rows.map((row) => [row.id, []]));
  const responseAtByRequest = new Map();
  for (const row of rows) {
    const requestActs = list(acts).filter((act) => act && act.requestId === row.id);
    const ord = actOrder(requestActs);
    const response = requestActs.filter((act) => act.kind === 'respond')
      .sort((a, b) => compareActs(a, b, ord))[0] || null;
    if (response?.response === 'insufficient') responseAtByRequest.set(row.id, response.at);
  }
  for (const row of rows) {
    row.followUp = {
      status: 'original',
      parent: null,
      children: [],
      childCount: 0,
      depth: 0,
      rootRequestId: row.id,
      ancestorIds: [],
    };
  }

  for (const request of requests) {
    if (!request.followsUpOn) continue;
    const child = byId.get(request.id);
    const parent = byId.get(request.followsUpOn);
    if (!child) continue;
    let status = 'parent-unavailable';
    if (parent) {
      const verdictAt = responseAtByRequest.get(parent.id) || null;
      if (parent.response !== 'insufficient' || !parent.respondedOn || !verdictAt) status = 'parent-not-insufficient';
      else if (Date.parse(request.createdAt) < Date.parse(verdictAt)) status = 'recorded-before-parent-verdict';
      else if (child.receivedOn < dayOf(verdictAt)) status = 'received-before-parent-verdict';
      else status = 'follows-up-after-insufficient';
    }
    const parentFollowUp = parent?.followUp || null;
    const ancestorIds = parent
      ? [parent.id, ...(parentFollowUp?.ancestorIds || [])]
      : [];
    const supported = status === 'follows-up-after-insufficient';
    const depth = supported && parentFollowUp?.depth !== null && parentFollowUp?.depth !== undefined
      ? parentFollowUp.depth + 1
      : null;
    child.followUp = {
      status,
      parent: parent ? followUpSummary(parent, parentFollowUp?.status || 'original') : null,
      children: [],
      childCount: 0,
      depth,
      rootRequestId: depth !== null ? (parentFollowUp?.rootRequestId || parent.id) : null,
      ancestorIds,
    };
    if (!supported) child.flags.push(RQR_FLAGS.followUpUnsubstantiated);
    if (parent) childrenByParent.get(parent.id)?.push(child);
  }

  for (const row of rows) {
    const children = childrenByParent.get(row.id) || [];
    row.followUp.children = children.map((child) => followUpSummary(child, child.followUp.status));
    row.followUp.childCount = children.length;
  }

  const followUpRows = rows.filter((row) => row.followUp.status !== 'original');
  const supportedRows = followUpRows.filter((row) => row.followUp.status === 'follows-up-after-insufficient');
  const unsubstantiatedRows = followUpRows.length - supportedRows.length;
  const rootsWithDirectFollowUps = rows.filter((row) => row.followUp.status === 'original' && row.followUp.childCount > 0).length;
  const depths = supportedRows.map((row) => row.followUp.depth).filter((value) => Number.isInteger(value));
  return {
    originalRequests: rows.length - followUpRows.length,
    followUpRequests: followUpRows.length,
    followUpsAfterInsufficient: supportedRows.length,
    followUpsUnsubstantiated: unsubstantiatedRows,
    rootsWithDirectFollowUps,
    maxFollowUpDepth: depths.length ? Math.max(...depths) : (followUpRows.length ? null : 0),
    declaredLinksSupported: unsubstantiatedRows === 0,
  };
}

/**
 * The kernel. `state` is the whole workspace; `now` is injected. Nothing
 * derived is stored and the input is never mutated.
 */
export function buildInformationRequests(state, { now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const warnings = [];

  const requests = normalizeRequests(state?.informationRequests, warnings);
  const acts = normalizeRequestActs(state?.informationRequestActs, requests, warnings);
  const markers = normalizeRequestMarkers(state?.informationRequestMarkers, warnings);
  const peopleIndex = new Map(list(state?.people).filter((row) => row && row.id).map((row) => [row.id, row]));

  let matrix;
  try {
    // The whole-workspace graph, read without a seat. A failure here is not a
    // licence to invent a reviewer or an accountable seat: neither resolves.
    matrix = buildMatrix(state, { now: at, settings: { ...(state?.settings || {}), activeSeatId: null } });
  } catch {
    matrix = { nodes: new Map(), chain: { nodes: new Map() } };
  }

  const rows = requests.map((request) => deriveRow(state, request, acts, peopleIndex, matrix, today));
  const lineageCounts = applyFollowUpLineage(rows, requests, acts);
  rows.sort((a, b) => String(a.effectiveReplyDay).localeCompare(String(b.effectiveReplyDay))
    || String(b.createdAt).localeCompare(String(a.createdAt))
    || String(a.id).localeCompare(String(b.id)));

  const byState = Object.fromEntries(RQR_STATE_KEYS.map((key) => [key, 0]));
  const byRequester = {};
  const byInstrument = {};
  const windowBuckets = Object.fromEntries(RQR_WINDOW_BUCKETS.map((row) => [row.key, 0]));
  let openN = 0;
  let releasedN = 0;
  let lapsedN = 0;
  let closingN = 0;
  let unreleasedN = 0;
  let refusedN = 0;
  let insufficientN = 0;
  let unassignedLinesN = 0;
  let privilegeClaimsN = 0;
  let privilegeUnreviewedN = 0;
  let privilegeRefusedN = 0;
  let privilegeItemsN = 0;
  let producedItemsN = 0;
  let clockMovesN = 0;
  let noAuthorityN = 0;
  let noReviewerN = 0;
  let owedN = 0;
  let onTimeN = 0;

  for (const row of rows) {
    if (byState[row.state] !== undefined) byState[row.state] += 1;
    byRequester[row.requesterKind] = (byRequester[row.requesterKind] || 0) + 1;
    byInstrument[row.instrument] = (byInstrument[row.instrument] || 0) + 1;
    if (row.released) releasedN += 1;
    else openN += 1;
    if (!row.released && row.windowBucket && windowBuckets[row.windowBucket] !== undefined) windowBuckets[row.windowBucket] += 1;
    if (row.lapsed) lapsedN += 1;
    if (row.closing) closingN += 1;
    if (row.flags.includes(RQR_FLAGS.unreleased)) unreleasedN += 1;
    if (row.refusedLineCount) refusedN += 1;
    if (row.response === 'insufficient') insufficientN += 1;
    if (row.accountability === 'no-authority') noAuthorityN += 1;
    if (row.flags.includes(RQR_FLAGS.noReviewer)) noReviewerN += 1;
    unassignedLinesN += row.unassignedLineCount;
    privilegeClaimsN += row.privilegeClaimCount;
    privilegeUnreviewedN += row.privilegeUnreviewedCount;
    privilegeRefusedN += row.privilegeRefusedCount;
    privilegeItemsN += row.privilegeClaimedItems;
    producedItemsN += row.producedItemCount;
    clockMovesN += row.extendCount + (row.clockRestatedOn ? 1 : 0);
    /**
     * The one rate: of the requests whose effective reply day has already
     * passed, how many carried their release ON OR BEFORE it. Lapsed requests
     * sit in the denominator and never in the numerator — that is the whole
     * point of the figure.
     */
    if (row.daysRemaining !== null && row.daysRemaining < 0) {
      owedN += 1;
      if (row.released && row.releasedOn <= row.effectiveReplyDay) onTimeN += 1;
    }
  }

  const counts = {
    requests: rows.length,
    open: openN,
    released: releasedN,
    lapsed: lapsedN,
    closing: closingN,
    unreleased: unreleasedN,
    refused: refusedN,
    insufficient: insufficientN,
    unassignedLines: unassignedLinesN,
    lines: rows.reduce((sum, row) => sum + row.lineCount, 0),
    privilegeClaims: privilegeClaimsN,
    privilegeUnreviewed: privilegeUnreviewedN,
    privilegeRefused: privilegeRefusedN,
    privilegeItems: privilegeItemsN,
    producedItems: producedItemsN,
    clockMoves: clockMovesN,
    noAuthority: noAuthorityN,
    noReviewer: noReviewerN,
    byState,
    byRequesterKind: byRequester,
    byInstrument,
    windows: windowBuckets,
    rates: {
      releasedInsideWindow: {
        owed: owedN,
        onTime: onTimeN,
        onTimeBp: rqrBp(onTimeN, owedN),
      },
    },
    droppedRows: (state?.informationRequests && Array.isArray(state.informationRequests) ? state.informationRequests.length - requests.length : 0)
      + (state?.informationRequestActs && Array.isArray(state.informationRequestActs) ? state.informationRequestActs.length - acts.length : 0),
    markers: markers.length,
  };

  const partitioned = RQR_STATE_KEYS.reduce((sum, key) => sum + (byState[key] || 0), 0);

  return {
    engine: RQR_ENGINE_VERSION,
    adr: RQR_ADR,
    lineageAdr: RQR_LINEAGE_ADR,
    rule: RQR_RULE_ID,
    asOf: today,
    rows,
    counts,
    lineageCounts,
    markers,
    warnings,
    /** The printed state counts add to the request total. */
    partitionReconciles: partitioned === rows.length,
    /** No act, request or line was refused or dropped by the loader, and every
     * line that carries a duty names a producer. Reported APART from
     * `partitionReconciles`: neither implies the other. Follow-up lineage has its
     * own whole-register completeness result and withholding boundary. */
    figuresComplete: counts.droppedRows === 0 && unassignedLinesN === 0,
    method: RQR_METHOD,
  };
}

export default buildInformationRequests;
