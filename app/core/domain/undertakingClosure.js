/**
 * app/core/domain/undertakingClosure.js — the pure kernel of the Regulatory
 * Undertaking & Outward-Commitment Closure Register (ADR-0234, `RULE-UDT-01`).
 *
 * An undertaking is DECLARED once by an executive in their own name and never
 * edited. Six append-only act kinds move it:
 *
 *   ASSIGN  — name a holder, a deliverable and a day on one obligation line
 *             that was declared without one. The holder is NAMED, never
 *             inferred from org position.
 *   DELIVER — the line's holder asserts the deliverable exists, in their own
 *             name, with dated evidence and a reference. One assertion per
 *             line; a second is refused while the first stands untested.
 *   VERIFY  — a seat STRICTLY ABOVE the holder on the reporting graph confirms
 *             or rejects. The deliverer never grades their own work.
 *   REPORT  — the accountable executive records that the counterparty was told,
 *             in writing, on a day, under a named instrument. REFUSED until
 *             every line is confirmed: reporting a promise as met while one
 *             line is untested is the substitution this register exists to
 *             prevent.
 *   NOTIFY  — the counterparty's acknowledgement, recorded once, after a
 *             report, from a closed list.
 *   EXTEND  — move the due day. REFUSED on an external instrument without the
 *             counterparty's recorded agreement, refused if it does not move
 *             the day forward, refused past the declared horizon, and refused
 *             after the day has passed.
 *
 * THE THREE FACTS STAY APART. `delivered`, `confirmed` and `reported` are three
 * distinct booleans on every read, and the ONE state is derived from them by a
 * precedence declared in `undertakingRegistry.js`. `reported-met` is the only
 * state that asserts the promise was done and the counterparty told.
 *
 * THE MATRIX IS THE POINT. Every line names its own holder; the seat answerable
 * for the WHOLE promise is the joint apex above every accountable line's
 * manager, computed from the graph and never chosen by the actor. Where no such
 * seat exists the register prints `no-authority` and asks nobody.
 *
 * THE DAY NEVER DECIDES. A due day that passes with no report reads
 * `lapsed-unreported` — never met, never closed, never extended by the passage
 * of time.
 *
 * Nothing derived is stored, so a hand-edited file cannot carry a confirmation
 * nobody made, a report nobody sent, or a promise the counterparty accepted.
 */

import { dayKey, daysBetween } from '../time.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { LEADER_ID } from './chain.js';
import {
  UDT_ADR,
  UDT_ENGINE_VERSION,
  UDT_FLAGS,
  UDT_LIMITS as L,
  UDT_METHOD,
  UDT_RULE_ID,
  UDT_STATE_KEYS,
  udtInstrumentIsExternal,
} from './undertakingRegistry.js';
import {
  normalizeUndertakingActs,
  normalizeUndertakings,
  normalizeUndertakingMarkers,
} from './undertakingSchema.js';
import { udtBp, udtWindowBucket, UDT_WINDOW_BUCKETS } from './undertakingMath.js';

const list = (value) => (Array.isArray(value) ? value : []);
const dayOf = (iso) => String(iso || '').slice(0, 10);

/**
 * Two acts carrying the SAME timestamp are ordered by their position in the
 * ledger, not by their id string: an act written later is later. This matters
 * the moment an assertion lands in the same instant as the assignment that
 * demanded it (a fixture clock, two acts in one commit).
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
 * One line's timeline. The LATEST assertion and the LATEST test are what speak;
 * every earlier one stays on the record but does not decide the line. A test
 * dated before the latest assertion tested a different fix and does not count
 * for the current one — it is reported, never averaged in.
 */
function readLineTimeline(undertaking, acts, line, ord) {
  const mine = list(acts)
    .filter((act) => act && act.undertakingId === undertaking.id && act.lineId === line.lineId)
    .sort((a, b) => compareActs(a, b, ord));
  const delivers = mine.filter((act) => act.kind === 'deliver');
  const verifies = mine.filter((act) => act.kind === 'verify');
  const assigns = mine.filter((act) => act.kind === 'assign');
  const latestDeliver = delivers.length ? delivers[delivers.length - 1] : null;
  const latestAssign = assigns.length ? assigns[assigns.length - 1] : null;
  /**
   * The governing test is the LATEST verify on or after the latest assertion's
   * instant. Two rules are being kept at once here:
   *   - a test dated BEFORE the current assertion tested a different
   *     deliverable and cannot speak to this one (so the assertion is a floor);
   *   - where more than one test sits on the record, the most RECENT independent
   *     fact governs. A later rejection must never be hidden behind an earlier
   *     confirmation: printing the reassuring word over the newest tested fact
   *     is exactly the substitution this register exists to refuse.
   * The action refuses a second test on a confirmed line, so this ordering is
   * reached only by a hand-edited file — which is precisely when the reader must
   * be strict rather than convenient.
   */
  const testable = latestDeliver
    ? verifies.filter((act) => String(act.at) >= String(latestDeliver.at))
    : [];
  const governingVerify = testable.length ? testable[testable.length - 1] : null;
  return { latestDeliver, latestAssign, governingVerify, delivers, verifies, assigns };
}

const CLOSED_STATES = Object.freeze(['reported-met', 'lapsed-unreported', 'report-disputed']);

function deriveRow(state, undertaking, acts, peopleIndex, matrix, today) {
  const gateActs = list(acts).filter((act) => act && act.undertakingId === undertaking.id);
  const ord = actOrder(gateActs);

  const assigns = gateActs.filter((act) => act.kind === 'assign');
  const delivers = gateActs.filter((act) => act.kind === 'deliver');
  const verifies = gateActs.filter((act) => act.kind === 'verify');
  const reports = gateActs.sort((a, b) => compareActs(a, b, ord)).filter((act) => act.kind === 'report');
  const notifies = gateActs.filter((act) => act.kind === 'notify');
  const extends_ = gateActs.filter((act) => act.kind === 'extend');

  /** The window in force: the last extension's new day, else the declared one. */
  const sortedExtends = [...extends_].sort((a, b) => compareActs(a, b, ord));
  const lastExtension = sortedExtends.length ? sortedExtends[sortedExtends.length - 1] : null;
  const effectiveDueOn = lastExtension?.newDueOn || undertaking.dueOn;
  const extendedOn = lastExtension ? dayOf(lastExtension.at) : null;

  /**
   * Per-line state. A line's holder is the ASSIGN act's holder where one names
   * it, else the declared holder. The latest assign wins (a re-assignment is a
   * later human decision), and the declared holder stands until one is made.
   */
  const lines = undertaking.lines.map((declared) => {
    const timeline = readLineTimeline(undertaking, gateActs, declared, ord);
    const holderId = timeline.latestAssign?.holderId || declared.holderId || null;
    const deliverable = timeline.latestAssign?.deliverable || declared.deliverable;
    const dueOn = timeline.latestAssign?.dueOn || declared.dueOn;
    const holder = holderId ? peopleIndex.get(holderId) || null : null;
    const holderActive = Boolean(holder) && holder.status !== 'archived';
    const delivered = Boolean(timeline.latestDeliver);
    const tested = Boolean(timeline.governingVerify);
    const verdict = timeline.governingVerify?.verdict || null;
    let lineState;
    if (!holderId) lineState = 'unassigned';
    else if (verdict === 'confirm') lineState = 'confirmed';
    else if (verdict === 'reject') lineState = 'rejected';
    else if (delivered) lineState = 'delivered';
    else lineState = 'working';
    return {
      lineId: declared.lineId,
      roleLabel: declared.roleLabel,
      deliverable,
      dueOn,
      holderId,
      holderName: holder?.name || holderId || null,
      holderRole: holder?.role || holder?.level || '',
      holderActive,
      resolved: Boolean(holder),
      lineState,
      delivered,
      tested,
      verdict,
      deliveredOn: timeline.latestDeliver ? dayOf(timeline.latestDeliver.at) : null,
      deliveredById: timeline.latestDeliver?.actorId || null,
      evidenceText: timeline.latestDeliver?.evidenceText || null,
      referenceRef: timeline.latestDeliver?.referenceRef || null,
      verifiedOn: timeline.governingVerify ? dayOf(timeline.governingVerify.at) : null,
      verifiedById: timeline.governingVerify?.actorId || null,
      methodText: timeline.governingVerify?.methodText || null,
      deliverCount: timeline.delivers.length,
      verifyCount: timeline.verifies.length,
      assignCount: timeline.assigns.length,
      /** Every test that is not the governing one — a superseded test, reported
       * on the record and never averaged into the verdict. */
      staleTestCount: timeline.verifies.length - (timeline.governingVerify ? 1 : 0),
    };
  });

  const unassignedLines = lines.filter((line) => line.lineState === 'unassigned');
  const rejectedLines = lines.filter((line) => line.lineState === 'rejected');
  const confirmedLines = lines.filter((line) => line.lineState === 'confirmed');
  const allConfirmed = lines.length > 0 && confirmedLines.length === lines.length;
  const anyDelivered = lines.some((line) => line.delivered);

  /**
   * THE JOINT APEX. The seat that answers for the WHOLE promise is the lowest
   * seat above EVERY accountable line's manager, computed from the graph. A
   * single line reduces to its holder's manager. Where the graph names no such
   * seat the register prints `no-authority` and promotes nobody.
   */
  const holderIds = lines.map((line) => line.holderId).filter(Boolean);
  const managerIds = [...new Set(holderIds.flatMap((id) => managerIdsFor(state, id, today)))]
    .filter((id) => id && matrix?.nodes?.has(id));
  const apex = managerIds.length
    ? matrixJointApex(matrix, managerIds)
    : { apexIds: [], apexId: null, unique: false, ambiguous: false, disconnected: false, isLeaderOnly: false };
  const apexId = apex.unique ? apex.apexId : null;
  const accountability = lines.length === 1 && lines[0].holderId
    ? 'single-holder'
    : (apexId ? 'joint-apex' : 'no-authority');

  /** The one report, and the acknowledgement that may follow it. */
  const sortedReports = [...reports].sort((a, b) => compareActs(a, b, ord));
  const report = sortedReports.length ? sortedReports[0] : null;
  const sortedNotifies = [...notifies].sort((a, b) => compareActs(a, b, ord));
  const notify = sortedNotifies.length ? sortedNotifies[0] : null;
  const reportedOn = report ? dayOf(report.at) : null;
  const acknowledgedOn = notify ? dayOf(notify.at) : null;
  const acknowledgement = notify?.acknowledgement || null;

  /** The latest confirmation on the record, used to floor the report's day. */
  const confirmedDays = confirmedLines.map((line) => line.verifiedOn).filter(Boolean).sort();
  const lastConfirmedOn = confirmedDays.length ? confirmedDays[confirmedDays.length - 1] : null;

  const daysRemaining = daysBetween(today, effectiveDueOn);
  const isLapsed = !report && daysRemaining < 0;
  const closing = !report && daysRemaining >= 0 && daysRemaining <= L.closingWindowDays;
  const reportOverdue = Boolean(report && allConfirmed && !notify
    && daysBetween(reportedOn, today) > L.reportChaseDays);

  const flags = [];
  if (isLapsed) flags.push(UDT_FLAGS.lapsed);
  if (closing) flags.push(UDT_FLAGS.closing);
  if (allConfirmed && !report) flags.push(UDT_FLAGS.unreported);
  if (rejectedLines.length) flags.push(UDT_FLAGS.rejected);
  if (acknowledgement === 'disputed') flags.push(UDT_FLAGS.disputed);
  if (unassignedLines.length) flags.push('line-unassigned');
  if (lines.some((line) => line.holderId && !line.holderActive)) flags.push(UDT_FLAGS.holderUnresolved);
  if (lines.length > 1 && !apexId) flags.push(UDT_FLAGS.noAuthority);
  /**
   * An instrument whose date is not the entity's alone to move was extended
   * without the counterparty's own agreement on the record. This is PRINTED on
   * the row and counted — never silently accepted and never rewritten.
   */
  if (lastExtension && udtInstrumentIsExternal(undertaking.instrument)
    && !lastExtension.counterpartyAgreementRef) {
    flags.push(UDT_FLAGS.unilateralExtension);
  }

  /**
   * THE PRECEDENCE IS THE REGISTRY'S, NOT THIS FILE'S. Each candidate state is
   * tested in the order `UDT_STATES` declares, so the kernel, the panel, the
   * rule and the CSV cannot disagree about which fact wins. A second
   * hand-written ladder here is exactly how two surfaces drift apart.
   */
  const holds = {
    'lapsed-unreported': isLapsed,
    'report-disputed': acknowledgement === 'disputed',
    rejected: rejectedLines.length > 0,
    'reported-met': Boolean(report),
    'confirmed-unreported': allConfirmed,
    'delivered-untested': anyDelivered,
    // In progress means the lines are STAFFED and at work. A promise with a line
    // nobody holds has not started yet, and reads `declared` — the register
    // never implies work is under way on a line with no named holder.
    'in-progress': unassignedLines.length === 0,
    declared: true,
  };
  const derivedState = UDT_STATE_KEYS.find((key) => holds[key] === true) || 'in-progress';

  return {
    id: undertaking.id,
    counterparty: undertaking.counterparty,
    counterpartyKind: undertaking.counterpartyKind,
    instrument: undertaking.instrument,
    instrumentRef: undertaking.instrumentRef,
    scope: undertaking.scope,
    dueOn: undertaking.dueOn,
    effectiveDueOn,
    extendedOn,
    extendCount: sortedExtends.length,
    lastExtension,
    declaredById: undertaking.declaredById,
    declarerName: peopleIndex.get(undertaking.declaredById)?.name || undertaking.declaredById,
    createdAt: undertaking.createdAt,
    lines,
    lineCount: lines.length,
    unassignedLineCount: unassignedLines.length,
    rejectedLineCount: rejectedLines.length,
    confirmedLineCount: confirmedLines.length,
    allConfirmed,
    apexId,
    apexIds: apex.apexIds,
    apexAmbiguous: Boolean(apex.ambiguous),
    accountability,
    state: derivedState,
    flags,
    reportedOn,
    reportRef: report?.reportRef || null,
    reportText: report?.reportText || null,
    reportedById: report?.actorId || null,
    reported: Boolean(report),
    acknowledgedOn,
    acknowledgement,
    acknowledgementRef: notify?.acknowledgementRef || null,
    acknowledgedById: notify?.actorId || null,
    reportOverdue,
    lastConfirmedOn,
    daysRemaining,
    windowBucket: udtWindowBucket(daysRemaining),
    lapsed: isLapsed,
    closing,
    closed: CLOSED_STATES.includes(derivedState),
  };
}

/**
 * The kernel. `state` is the whole workspace; `now` is injected. Derived
 * nothing is stored and the input is never mutated.
 */
export function buildUndertakings(state, { now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const warnings = [];

  const undertakings = normalizeUndertakings(state?.undertakings, warnings);
  const acts = normalizeUndertakingActs(state?.undertakingActs, undertakings, warnings);
  const markers = normalizeUndertakingMarkers(state?.undertakingMarkers, warnings);
  const peopleIndex = new Map(list(state?.people).filter((row) => row && row.id).map((row) => [row.id, row]));

  let matrix;
  try {
    // The whole-workspace graph, read without a seat. A failure here is not a
    // licence to invent an accountable seat: the apex simply does not resolve.
    matrix = buildMatrix(state, { now: at, settings: { ...(state?.settings || {}), activeSeatId: null } });
  } catch {
    matrix = { nodes: new Map(), chain: { nodes: new Map() } };
  }

  const rows = undertakings
    .map((undertaking) => deriveRow(state, undertaking, acts, peopleIndex, matrix, today))
    .sort((a, b) => String(a.effectiveDueOn).localeCompare(String(b.effectiveDueOn))
      || String(b.createdAt).localeCompare(String(a.createdAt))
      || String(a.id).localeCompare(String(b.id)));

  const byState = Object.fromEntries(UDT_STATE_KEYS.map((key) => [key, 0]));
  const byCounterparty = {};
  const byInstrument = {};
  const windowBuckets = Object.fromEntries(UDT_WINDOW_BUCKETS.map((row) => [row.key, 0]));
  let openN = 0;
  let reportedN = 0;
  let lapsedN = 0;
  let closingN = 0;
  let unreportedN = 0;
  let rejectedN = 0;
  let disputedN = 0;
  let unassignedLinesN = 0;
  let extensionN = 0;
  let owedN = 0;
  let onTimeN = 0;
  let noAuthorityN = 0;

  for (const row of rows) {
    if (byState[row.state] !== undefined) byState[row.state] += 1;
    byCounterparty[row.counterpartyKind] = (byCounterparty[row.counterpartyKind] || 0) + 1;
    byInstrument[row.instrument] = (byInstrument[row.instrument] || 0) + 1;
    if (row.reported) reportedN += 1;
    else openN += 1;
    if (!row.reported && row.windowBucket && windowBuckets[row.windowBucket] !== undefined) windowBuckets[row.windowBucket] += 1;
    if (row.lapsed) lapsedN += 1;
    if (row.closing) closingN += 1;
    if (row.flags.includes(UDT_FLAGS.unreported)) unreportedN += 1;
    if (row.rejectedLineCount) rejectedN += 1;
    if (row.acknowledgement === 'disputed') disputedN += 1;
    unassignedLinesN += row.unassignedLineCount;
    extensionN += row.extendCount;
    if (row.accountability === 'no-authority') noAuthorityN += 1;
    /**
     * The one rate: of the undertakings whose effective due day has already
     * passed, how many carried their report ON OR BEFORE it. Lapsed promises
     * sit in the denominator and never in the numerator — that is the whole
     * point of the figure.
     */
    if (row.daysRemaining < 0) {
      owedN += 1;
      if (row.reported && row.reportedOn <= row.effectiveDueOn) onTimeN += 1;
    }
  }

  const counts = {
    undertakings: rows.length,
    open: openN,
    reported: reportedN,
    lapsed: lapsedN,
    closing: closingN,
    unreported: unreportedN,
    rejected: rejectedN,
    disputed: disputedN,
    unassignedLines: unassignedLinesN,
    extensions: extensionN,
    noAuthority: noAuthorityN,
    lines: rows.reduce((sum, row) => sum + row.lineCount, 0),
    byState,
    byCounterparty,
    byInstrument,
    windows: windowBuckets,
    rates: {
      reportedInsideWindow: {
        owed: owedN,
        onTime: onTimeN,
        onTimeBp: udtBp(onTimeN, owedN),
      },
    },
    droppedRows: (state?.undertakings && Array.isArray(state.undertakings) ? state.undertakings.length - undertakings.length : 0)
      + (state?.undertakingActs && Array.isArray(state.undertakingActs) ? state.undertakingActs.length - acts.length : 0),
    markers: markers.length,
  };

  const partitioned = UDT_STATE_KEYS.reduce((sum, key) => sum + (byState[key] || 0), 0);

  return {
    engine: UDT_ENGINE_VERSION,
    adr: UDT_ADR,
    rule: UDT_RULE_ID,
    asOf: today,
    rows,
    counts,
    markers,
    warnings,
    /** The printed state counts add to the undertaking total. */
    partitionReconciles: partitioned === rows.length,
    /** No act, undertaking or line was refused or dropped by the loader, and
     * every line that carries a duty names a holder. */
    figuresComplete: counts.droppedRows === 0 && unassignedLinesN === 0,
    method: UDT_METHOD,
  };
}

export default buildUndertakings;
