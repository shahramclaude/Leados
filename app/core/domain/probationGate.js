/**
 * app/core/domain/probationGate.js — the pure kernel of the Probation
 * Confirmation Gate Register (ADR-0233, `RULE-PBG-01`).
 *
 * A gate is DECLARED once by the joiner's home manager and never edited. Five
 * append-only act kinds move it:
 *
 *   ASK     — the confirming manager puts the evidence duty to the holder of
 *             one of the joiner's declared matrix lines, by a day. One ask per
 *             line; a second is refused and the first stands.
 *   SUBMIT  — the holder of a line records dated evidence in words and a
 *             closed-vocabulary recommendation (support | concern | cannot
 *             say). The home line's evidence is the confirming manager's own
 *             submission. Submissions append; the latest is the line's reading.
 *   EXTEND  — the confirming manager moves the window forward under the
 *             declared instrument. It closes nothing: after an extension the
 *             evidence duty runs again against the new window day.
 *   DECIDE  — the confirming manager records the ONE final decision: confirm
 *             or end. A confirmation is refused by the action while any
 *             declared line carries no evidence; the reader prints the
 *             disagreement a confirmation was recorded over, never averages it.
 *   NOTIFY  — the confirming manager records that the outcome was communicated
 *             to the joiner in writing. Until then the gate reads
 *             `decision-unnotified`: decided is not told.
 *
 * Every state, flag, count and rate is re-derived here on every call. Nothing
 * derived is stored, so a hand-edited file cannot carry a decision nobody
 * made, an extension the instrument did not allow, or an evidence duty a
 * submitter never answered.
 *
 * THE GATE NEVER DEFAULTS. A window whose effective end day has passed with no
 * final decision on the record reads `lapsed-no-decision` — the register
 * prints the lapse and never substitutes the instrument's default outcome
 * (automatic confirmation, or the loss of the short-notice lever) for a
 * decision nobody made.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  PBG_ADR,
  PBG_ENGINE_VERSION,
  PBG_FLAGS,
  PBG_LIMITS as L,
  PBG_METHOD,
  PBG_RULE_ID,
  PBG_STATE_KEYS,
} from './probationRegistry.js';
import {
  normalizeProbationActs,
  normalizeProbationGates,
  normalizeProbationMarkers,
} from './probationGateSchema.js';
import { pbgBp, pbgWindowBucket, PBG_WINDOW_BUCKETS } from './probationGateMath.js';

const CLOSED_STATES = Object.freeze(['decided-confirmed', 'decided-ended']);
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * The declared matrix lines that resolve on the read day: active, covering the
 * day, and belonging to the person named. The DAG is not rebuilt here — this
 * reader answers the narrow, exact question of which declared lines exist on
 * the record for the joiner, and a line the record no longer carries is
 * PRINTED, never substituted for and never silently dropped from the roll-up.
 */
function joinerLineIndex(state, day) {
  const map = new Map();
  for (const raw of list(state?.reportingLines)) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    if (raw.status && raw.status !== 'active') continue;
    if (raw.fromISO && String(raw.fromISO).slice(0, 10) > day) continue;
    if (raw.toISO && String(raw.toISO).slice(0, 10) < day) continue;
    map.set(raw.id, raw);
  }
  return map;
}

const dayOf = (iso) => String(iso || '').slice(0, 10);

/**
 * Two acts carrying the SAME timestamp are ordered by their position in the
 * ledger, not by their id string: an act written later is later. This matters
 * the moment a submission lands in the same instant as the ask that demanded
 * it (a fixture clock, a back-dated paper entry, two acts in one commit).
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

/** One line's evidence timeline: home (the confirming manager's own) or a declared matrix line. */
function readLineEvidence(gate, acts, { lineKind, lineId }) {
  const source = list(acts).filter((act) => act && act.gateId === gate.id && act.kind === 'submit'
    && act.lineKind === lineKind
    && (lineKind === 'home' || act.lineId === lineId));
  const ord = actOrder(source);
  const mine = [...source].sort((a, b) => compareActs(a, b, ord));
  const latest = mine.length ? mine[mine.length - 1] : null;
  return {
    submissions: mine.length,
    latestReading: latest?.recommendation || null,
    latestSubmittedAt: latest?.at || null,
    latestSubmittedOn: latest ? dayOf(latest.at) : null,
    latestObservedText: latest?.observedText || null,
    latestSubmittedById: latest?.actorId || null,
  };
}

function deriveRow(gate, acts, joiner, linesToday, today) {
  const gateActs = list(acts).filter((act) => act && act.gateId === gate.id);
  const ord = actOrder(gateActs);
  const mine = [...gateActs].sort((a, b) => compareActs(a, b, ord));

  const asks = mine.filter((act) => act.kind === 'ask');
  const extends_ = mine.filter((act) => act.kind === 'extend');
  const decides = mine.filter((act) => act.kind === 'decide');
  const notifies = mine.filter((act) => act.kind === 'notify');

  /** The GOVERNING ask per line is the FIRST one; the action refuses a second,
   * and the reader must agree so a hand-edited file cannot re-point the ask. */
  const askByLine = new Map();
  for (const ask of asks) {
    if (!askByLine.has(ask.lineId)) askByLine.set(ask.lineId, ask);
  }

  /** The window in force: the last extension's new end day, else the declared one. */
  const lastExtension = extends_.length ? extends_[extends_.length - 1] : null;
  const effectiveEndOn = lastExtension?.newEndOn || gate.endOn;
  const extendedOn = lastExtension ? dayOf(lastExtension.at) : null;

  const decision = decides.length ? decides[0] : null;
  const closed = Boolean(decision);
  const decidedOn = decision ? dayOf(decision.at) : null;

  const notify = notifies.length ? notifies[0] : null;

  /**
   * The declared matrix lines. Pre-decision, the roll-up reads the lines live
   * today; once a decision is on the record, the evidence rule is read
   * against the lines that existed on the decision day, because a line
   * declared after the decision cannot retroactively make it incomplete.
   */
  const readDay = decidedOn || today;
  const linesAtRead = decidedOn
    ? new Map([...linesToday.entries()].filter(([, row]) => (!row.fromISO || row.fromISO <= readDay) && (!row.toISO || row.toISO >= readDay)))
    : linesToday;
  // A declared line whose holder IS the confirming manager is the home line
  // restated, not an additional duty: the evidence duty it would carry is
  // already the manager's own home-line act, and counting it twice would let
  // one person's evidence stand for two lines.
  const declaredLines = [...linesAtRead.values()]
    .filter((row) => row.personId === gate.joinerId)
    .filter((row) => !row.managerId || row.managerId !== gate.declaredById);

  const lines = [];
  // The home line: the confirming manager's own evidence, no ask mechanism.
  const homeEvidence = readLineEvidence(gate, acts, { lineKind: 'home' });
  lines.push({
    lineKind: 'home',
    lineId: null,
    lineHolderId: gate.declaredById,
    resolved: true,
    lineState: homeEvidence.submissions ? 'submitted' : 'unasked',
    askDueOn: null,
    askCount: 0,
    overdueAsk: false,
    ...homeEvidence,
  });
  for (const lineRow of declaredLines) {
    const ask = askByLine.get(lineRow.id) || null;
    const evidence = readLineEvidence(gate, acts, { lineKind: 'matrix', lineId: lineRow.id });
    const overdueAsk = Boolean(ask && !evidence.submissions && today > ask.dueOn);
    lines.push({
      lineKind: 'matrix',
      lineId: lineRow.id,
      lineHolderId: ask?.lineHolderId || lineRow.managerId || null,
      resolved: true,
      lineState: evidence.submissions ? 'submitted' : (ask ? 'asked' : 'unasked'),
      askDueOn: ask?.dueOn || null,
      askCount: ask ? 1 : 0,
      overdueAsk,
      ...evidence,
    });
  }

  /**
   * Evidence that qualifies for a confirmation: a submission dated on or after
   * the latest extension (evidence must speak to the window being confirmed)
   * and on or before the decision day. With no extension, any submission
   * inside the gate's life qualifies.
   */
  const extensionFloor = lastExtension ? dayOf(lastExtension.at) : null;
  const qualifying = (line) => {
    if (!line.latestSubmittedOn) return false;
    if (line.latestSubmittedOn < gate.startOn) return false;
    if (extensionFloor && line.latestSubmittedOn < extensionFloor) return false;
    if (decidedOn && line.latestSubmittedOn > decidedOn) return false;
    return true;
  };
  const missingLines = lines.filter((line) => !qualifying(line));
  const confirmable = missingLines.length === 0;

  const concerns = lines.filter((line) => line.latestReading === 'concern');
  const unresolvedReadings = lines.filter((line) => line.latestReading === 'unresolved');

  const joinerActive = Boolean(joiner) && joiner.status !== 'archived';

  const flags = [];
  if (closed && decision.decision === 'confirm' && concerns.length) flags.push(PBG_FLAGS.confirmedOverConcern);
  if (closed && decision.decision === 'confirm' && unresolvedReadings.length) flags.push(PBG_FLAGS.confirmedOverUnresolved);
  if (closed && !notify) flags.push(PBG_FLAGS.unnotified);
  if (!joinerActive) flags.push(PBG_FLAGS.joinerUnresolved);
  /**
   * A matrix line that an ASK or a SUBMISSION references but that no longer
   * resolves on the graph is printed, never substituted and never silently
   * dropped from the roll-up. The check reads the acts' own line references
   * against the live declared-line set, so a withdrawn line cannot take the
   * duty it carried with it.
   */
  const liveLineIds = new Set(declaredLines.map((row) => row.id));
  const referencedLineIds = new Set([
    ...askByLine.keys(),
    ...list(acts).filter((act) => act && act.gateId === gate.id && act.kind === 'submit' && act.lineKind === 'matrix').map((act) => act.lineId),
  ]);
  const unresolvedLineIds = [...referencedLineIds].filter((id) => !liveLineIds.has(id));
  if (unresolvedLineIds.length) flags.push(PBG_FLAGS.lineUnresolved);

  const daysRemaining = daysBetween(today, effectiveEndOn);
  const isLapsed = !closed && daysRemaining < 0;
  const closing = !closed && daysRemaining >= 0 && daysRemaining <= L.decisionWindowDays;

  let state;
  if (closed) state = decision.decision === 'confirm' ? 'decided-confirmed' : 'decided-ended';
  else if (isLapsed) state = 'lapsed-no-decision';
  else if (confirmable) state = 'evidence-complete';
  else if (asks.length || lines.some((line) => line.submissions)) state = 'evidence-gathering';
  else state = 'declared';

  if (isLapsed) flags.push(PBG_FLAGS.lapsed);
  if (closing) flags.push(PBG_FLAGS.decisionClosing);

  const overdueAsks = lines.filter((line) => line.overdueAsk).length;

  return {
    id: gate.id,
    joinerId: gate.joinerId,
    joinerName: joiner?.name || gate.joinerId,
    joinerRole: joiner?.role || joiner?.level || '',
    roleLabel: gate.roleLabel,
    joinerActive,
    startOn: gate.startOn,
    endOn: gate.endOn,
    effectiveEndOn,
    extendedOn,
    extendCount: extends_.length,
    expectations: gate.expectations,
    instrument: gate.instrument,
    instrumentRef: gate.instrumentRef,
    allowsExtension: gate.allowsExtension,
    legalCapDays: gate.legalCapDays,
    noticeDays: gate.noticeDays,
    declaredById: gate.declaredById,
    createdAt: gate.createdAt,
    lines,
    state,
    closed,
    decision: decision?.decision || null,
    decidedOn,
    decisionReason: decision?.reason || null,
    flags,
    missingLineCount: missingLines.length,
    confirmable,
    concernCount: concerns.length,
    unresolvedReadingCount: unresolvedReadings.length,
    overdueAsks,
    staleLineIds: unresolvedLineIds,
    daysRemaining,
    windowBucket: pbgWindowBucket(daysRemaining),
    notifiedOn: notify ? dayOf(notify.at) : null,
    notifiedBy: notify?.actorId || null,
    notifyInstrumentRef: notify?.instrumentRef || null,
    unnotified: Boolean(closed && !notify),
    lapsed: isLapsed,
    closing,
  };
}

/**
 * The kernel. `state` is the whole workspace; `now` is injected. Derived
 * nothing is stored and the input is never mutated.
 */
export function buildProbationGates(state, { now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const nowIso = at.toISOString();
  const warnings = [];

  const gates = normalizeProbationGates(state?.probationGates, warnings);
  const acts = normalizeProbationActs(state?.probationActs, gates, warnings);
  const markers = normalizeProbationMarkers(state?.probationMarkers, warnings);
  const peopleIndex = new Map(list(state?.people).filter((row) => row && row.id).map((row) => [row.id, row]));
  const linesToday = joinerLineIndex(state, today);

  const rows = gates
    .map((gate) => deriveRow(gate, acts, peopleIndex.get(gate.joinerId) || null, linesToday, today))
    .sort((a, b) => String(a.effectiveEndOn).localeCompare(String(b.effectiveEndOn))
      || String(b.createdAt).localeCompare(String(a.createdAt))
      || String(a.id).localeCompare(String(b.id)));

  const byState = Object.fromEntries(PBG_STATE_KEYS.map((key) => [key, 0]));
  const byOutcome = { confirmed: 0, ended: 0, 'extended-open': 0 };
  const windowBuckets = Object.fromEntries(PBG_WINDOW_BUCKETS.map((row) => [row.key, 0]));
  let openN = 0;
  let closedN = 0;
  let lapsedN = 0;
  let closingN = 0;
  let unnotifiedN = 0;
  let overdueAskN = 0;
  let extensionN = 0;
  let owedN = 0;
  let onTimeN = 0;
  let unresolvedLineN = 0;

  for (const row of rows) {
    if (byState[row.state] !== undefined) byState[row.state] += 1;
    if (row.closed) {
      closedN += 1;
      byOutcome[row.decision === 'confirm' ? 'confirmed' : 'ended'] += 1;
    } else {
      openN += 1;
      if (row.extendCount) byOutcome['extended-open'] += 1;
      if (row.windowBucket && windowBuckets[row.windowBucket] !== undefined) windowBuckets[row.windowBucket] += 1;
    }
    if (row.lapsed) lapsedN += 1;
    if (row.closing) closingN += 1;
    if (row.unnotified) unnotifiedN += 1;
    if (row.overdueAsks) overdueAskN += row.overdueAsks;
    extensionN += row.extendCount;
    /**
     * The one rate: of the gates whose effective window day has already
     * passed, how many carried the decision INSIDE the window. Lapsed gates
     * sit in the denominator and never in the numerator — that is the whole
     * point of the figure.
     */
    if (row.daysRemaining < 0) {
      owedN += 1;
      if (row.closed && row.decidedOn <= row.effectiveEndOn) onTimeN += 1;
    }
  }

  const counts = {
    gates: rows.length,
    open: openN,
    closed: closedN,
    lapsed: lapsedN,
    closing: closingN,
    unnotified: unnotifiedN,
    overdueAsks: overdueAskN,
    extensions: extensionN,
    byState,
    byOutcome,
    windows: windowBuckets,
    rates: {
      decidedInsideWindow: {
        owed: owedN,
        onTime: onTimeN,
        onTimeBp: pbgBp(onTimeN, owedN),
      },
    },
    droppedRows: (state?.probationGates && Array.isArray(state.probationGates) ? state.probationGates.length - gates.length : 0)
      + (state?.probationActs && Array.isArray(state.probationActs) ? state.probationActs.length - acts.length : 0),
    unresolvedLines: rows.reduce((sum, row) => sum + row.staleLineIds.length, 0),
    markers: markers.length,
  };

  const partitioned = PBG_STATE_KEYS.reduce((sum, key) => sum + (byState[key] || 0), 0);

  return {
    engine: PBG_ENGINE_VERSION,
    adr: PBG_ADR,
    rule: PBG_RULE_ID,
    asOf: today,
    rows,
    counts,
    markers,
    warnings,
    /** The printed state counts add to the gate total. */
    partitionReconciles: partitioned === rows.length,
    /** No act was refused and no stored row was dropped by the loader. */
    figuresComplete: counts.droppedRows === 0,
    method: PBG_METHOD,
  };
}

export default buildProbationGates;
