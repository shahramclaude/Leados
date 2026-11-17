/**
 * app/core/domain/incidentCommand.js — the pure read model of the Major-Incident
 * Command & Notification-Clock Register (ADR-0240, Schema v194, `#/incidents`).
 *
 * ONE reader. Every state, every interval, every deadline, every notification
 * verdict and every count this register prints is derived HERE, on read, from
 * the dated acts and declared rows. Nothing derived is ever stored, so a
 * hand-edited workspace file cannot carry a commander nobody designated, a
 * notification nobody made, or a deadline the record does not compute.
 *
 * THE THREE SEPARATIONS THIS READER EXISTS TO KEEP
 * ------------------------------------------------
 *  1. COMMAND IS NOT RESOLUTION. An incident can be resolved and still hold a
 *     commander, a bridge and every open obligation. `command-standing` is a
 *     printed state that time alone never clears.
 *  2. A CLOCK IS NOT A STATE. `recorded-late` and `lapsed` are facts about a
 *     DEADLINE. They ride on top of an incident in any command state, because a
 *     perfectly commanded incident can still blow the regulator's period — and
 *     collapsing the two into one reassuring status is precisely what the
 *     Bulletproof Reliability Mandate forbids.
 *  3. THE FIGURES ADDING UP IS NOT THE SAME CLAIM AS THE FIGURES BEING
 *     COMPLETE. `balances` says the printed counts re-add to the rows they
 *     summarise; `figuresComplete` says nothing the register needed was
 *     unreadable or out of the seat's reach. They are reported separately,
 *     always, exactly as the matrix reconciliation contract requires.
 *
 * THE MATRIX IS COMPUTED, NEVER CHOSEN. The seat accountable for the whole
 * incident is `matrixJointApex` over every response line's lead and the
 * commander. Where the graph yields no single seat the reader prints
 * `no-authority` with the reason and asks nobody — it never promotes an
 * unrelated manager into a commander role to keep a column full.
 *
 * A PERSON IS COUNTED ONCE. Somebody leading two response lines, or commanding
 * while leading one, is ONE person in every people figure. The register prints
 * per-line rows (a line is a duty, not a person) and a de-duplicated people
 * set, and never allocates a person's attention across lines by arithmetic.
 */

import { toDate, dayKey, addDays } from '../time.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { normalizeMicActs, normalizeMicIncidents, normalizeMicSettings, minutesBetween } from './incidentCommandSchema.js';
import {
  MIC_HREF,
  MIC_LIMITS as L,
  MIC_SETTING_KEYS,
  MIC_STATES,
  MIC_NOTIFY_STATES,
  MIC_LINE_STATES,
  severityRow,
  severityRank,
  stateRow,
  partyRow,
  clockSourceRow,
} from './incidentCommandRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);
const MIN_MS = 60_000;

/** The instant an ISO string denotes, in ms, or null. */
function ms(iso) {
  const d = toDate(iso);
  return d ? d.getTime() : null;
}

/** ISO instant plus a whole number of minutes, exactly. */
export function plusMinutes(iso, minutes) {
  const base = ms(iso);
  if (base === null || !Number.isInteger(minutes)) return null;
  return new Date(base + minutes * MIN_MS).toISOString();
}

/**
 * Order acts the way the ledger itself orders them: by declared instant, and —
 * where two acts carry the same instant — by their position in the ledger,
 * because an act written later is later. Ordering by timestamp alone made a
 * re-assertion appended after a rejection invisible on a fixture clock; the
 * ledger's own position is the only other order the record carries.
 */
function orderActs(acts) {
  return list(acts)
    .map((act, index) => ({ act, index }))
    .sort((a, b) => {
      const am = ms(a.act.at);
      const bm = ms(b.act.at);
      if (am !== bm) return (am ?? 0) - (bm ?? 0);
      return a.index - b.index;
    })
    .map((row) => row.act);
}

/** The active roster, keyed by id, with the name and archived flag the reader prints. */
function rosterIndex(state) {
  const map = new Map();
  for (const person of list(state?.people)) {
    if (!person || typeof person.id !== 'string') continue;
    map.set(person.id, person);
  }
  return map;
}

/**
 * A readable label for a hand. `leader` is the workspace's own root node — a real
 * node on the graph, but not a roster person — and printing the raw id there puts
 * the tool's internal identifier in front of a chief executive. The codebase
 * convention (`concordance`, `jurisdiction`, `envoy`) is the declared leader name
 * or "Workspace leader", and this reader follows it.
 */
const personLabel = (person, id) => {
  if (id === 'leader') return 'Workspace leader';
  if (!person) return id;
  return person.name || person.id;
};

/**
 * The command line: who holds command, when they took it, and every handover in
 * order. `assume` makes the actor the holder; `transfer` makes the NAMED
 * SUCCESSOR the holder — never the actor, because the transfer is the outgoing
 * commander's act and reading it as the actor's assumption reverses the
 * handover on a screen whose entire purpose is showing it.
 */
function readCommand(ordered) {
  const commandActs = ordered.filter((act) => act.kind === 'assume' || act.kind === 'transfer');
  const history = [];
  let holderId = null;
  let heldSince = null;
  for (const act of commandActs) {
    if (act.kind === 'assume') {
      if (holderId === act.actorId) continue; // a repeat assumption by the same hand moves nothing
      history.push({ kind: 'assume', actorId: act.actorId, holderId: act.actorId, at: act.at, reason: null });
      holderId = act.actorId;
      heldSince = act.at;
      continue;
    }
    history.push({ kind: 'transfer', actorId: act.actorId, holderId: act.toId, at: act.at, reason: act.reason });
    holderId = act.toId;
    heldSince = act.at;
  }
  const standDownActs = ordered.filter((act) => act.kind === 'stand-down');
  const stoodDown = standDownActs.length ? standDownActs[standDownActs.length - 1] : null;
  const resolveActs = ordered.filter((act) => act.kind === 'resolve');
  const resolved = resolveActs.length ? resolveActs[resolveActs.length - 1] : null;
  return { holderId, heldSince, history, stoodDown, resolved };
}

/**
 * The severity currently in force: the highest-ranked severity any dated act has
 * declared at or before `asOf`, falling back to the declared severity. A
 * severity change is an ACT, so the register can always print who changed it,
 * when, and why — and a hand-edited file cannot move a severity silently.
 */
function readSeverity(incident, ordered) {
  const floorRank = severityRank(incident.severity);
  let current = incident.severity;
  let currentRank = floorRank;
  let via = null;
  for (const act of ordered) {
    if (act.kind !== 'severity') continue;
    const rank = severityRank(act.severity);
    if (rank === null) continue;
    // A raise takes effect; a lowering does NOT undo the fact that the incident
    // was treated as a major one. The reader keeps the highest severity ever
    // declared as `peak`, and the latest act as `current` — two printed facts.
    current = act.severity;
    currentRank = rank;
    via = act;
  }
  let peakRank = floorRank;
  let peak = incident.severity;
  for (const act of ordered) {
    if (act.kind !== 'severity') continue;
    const rank = severityRank(act.severity);
    if (rank !== null && rank < peakRank) { peakRank = rank; peak = act.severity; }
  }
  return { current, currentRank, via, peak, peakRank };
}

/**
 * Response lines: each carries its own closed-list duty, its named lead and
 * whether that lead has ACCEPTED it. A line nobody accepted is assigned, not
 * led — the distinction is the whole reason the accept act exists.
 */
function readLines(incident, ordered, roster) {
  const rows = [];
  for (const line of incident.lines) {
    const assignActs = ordered.filter((act) => act.kind === 'assign' && act.lineId === line.lineId);
    const governing = assignActs.length ? assignActs[assignActs.length - 1] : null;
    const leadId = governing ? governing.leadId : line.leadId;
    const accepted = leadId
      ? ordered.filter((act) => act.kind === 'accept' && act.lineId === line.lineId && act.actorId === leadId).slice(-1)[0] || null
      : null;
    const person = leadId ? roster.get(leadId) || null : null;
    const leadActive = Boolean(person) && person.status !== 'archived';
    const state = !leadId ? 'unassigned' : (accepted ? 'led' : 'assigned');
    rows.push({
      lineId: line.lineId,
      duty: line.duty,
      dutyText: line.dutyText,
      leadId,
      leadName: leadId ? personLabel(person, leadId) : null,
      leadResolved: Boolean(leadId) && leadActive,
      leadArchived: Boolean(person) && person.status === 'archived',
      acceptedAt: accepted ? accepted.at : null,
      assignCount: assignActs.length,
      state,
      stateLabel: MIC_LINE_STATES.find((row) => row.key === state)?.label || state,
      /** Printed, never repaired: an unresolvable lead leaves the duty unowned. */
      refusal: !leadId
        ? 'No lead is named on this line. The duty it carries is unowned.'
        : (!leadActive
          ? (person?.status === 'archived'
            ? 'The named lead is archived. The duty is unowned until a live lead accepts it.'
            : 'The named lead is not on the active roster. The duty is unowned until a live lead accepts it.')
          : null),
    });
  }
  return rows;
}

/**
 * The declared clocks, each with the exact deadline its own declaration
 * produces. The origin is the instant the clock NAMES — awareness or
 * declaration — never a default, and never the later of the two.
 */
function readClocks(incident, nowIso) {
  return incident.clocks.map((clock) => {
    const originAt = clock.clockOrigin === 'awareness' ? incident.detectedAt : incident.declaredAt;
    const deadlineAt = plusMinutes(originAt, clock.clockMinutes);
    const totalMs = clock.clockMinutes * MIN_MS;
    const elapsedMs = deadlineAt ? Math.max(0, Math.min(totalMs, (ms(nowIso) ?? 0) - (ms(originAt) ?? 0))) : null;
    const remainingMs = deadlineAt ? (ms(deadlineAt) ?? 0) - (ms(nowIso) ?? 0) : null;
    const source = clockSourceRow(clock.clockSource);
    return {
      key: clock.key,
      clockSource: clock.clockSource,
      sourceLabel: source?.label || clock.clockSource,
      external: source?.key === 'statute' || source?.key === 'regulator-direction',
      clockMinutes: clock.clockMinutes,
      clockOrigin: clock.clockOrigin,
      originAt,
      deadlineAt,
      basis: clock.basis,
      declaredAt: clock.declaredAt,
      declaredById: clock.declaredById,
      elapsedMinutes: elapsedMs === null ? null : Math.floor(elapsedMs / MIN_MS),
      remainingMinutes: remainingMs === null ? null : Math.ceil(remainingMs / MIN_MS),
      passed: remainingMs === null ? null : remainingMs <= 0,
      /** Fraction used only for a progress bar on the screen; never a verdict. */
      elapsedFraction: elapsedMs === null ? null : (totalMs ? elapsedMs / totalMs : null),
    };
  });
}

/**
 * The notification obligations, each placed against its OWN declared clock.
 * Every row keeps the two facts a collapsed status would destroy: the instant a
 * notification went out, and the exact number of minutes by which it overran.
 */
function readNotifications(incident, ordered, clocks, { nowIso, conventions }) {
  const clockByKey = new Map(clocks.map((clock) => [clock.key, clock]));
  const varianceMs = (conventions[MIC_SETTING_KEYS.acknowledgeVarianceMinutes] || 0) * MIN_MS;
  return incident.notifications.map((notif) => {
    const clock = notif.clockKey ? clockByKey.get(notif.clockKey) || null : null;
    const recorded = ordered
      .filter((act) => act.kind === 'notify' && act.notifId === notif.notifId)
      .slice(-1)[0] || null;
    const party = partyRow(notif.party);
    const deadlineAt = clock ? clock.deadlineAt : null;
    const overrunMinutes = (recorded && deadlineAt) ? Math.round(((ms(recorded.notifiedAt) ?? 0) - (ms(deadlineAt) ?? 0)) / MIN_MS) : null;
    const late = overrunMinutes === null ? null : overrunMinutes * MIN_MS > varianceMs;
    let state;
    if (recorded && late) state = 'recorded-late';
    else if (recorded) state = 'recorded';
    else if (!clock) state = 'no-clock';
    else if (clock.passed) state = 'lapsed';
    else state = 'due';
    const stateRowValue = MIC_NOTIFY_STATES.find((row) => row.key === state) || null;
    return {
      notifId: notif.notifId,
      party: notif.party,
      partyLabel: party?.label || notif.party,
      external: party?.external === true,
      basis: notif.basis,
      clockKey: notif.clockKey,
      clockLabel: clock ? clock.sourceLabel : null,
      clockMinutes: clock ? clock.clockMinutes : null,
      deadlineAt,
      recordedAt: recorded ? recorded.notifiedAt : null,
      recordedById: recorded ? recorded.actorId : null,
      reference: recorded ? recorded.reference : null,
      overrunMinutes,
      late,
      state,
      stateLabel: stateRowValue?.label || state,
      tone: stateRowValue?.tone || 'neutral',
      /** Printed, never repaired: an obligation with no clock can never become due. */
      refusal: !clock
        ? (notif.clockKey
          ? 'The clock this obligation named is not readable on the incident. No deadline is computed.'
          : 'No clock is declared for this obligation. No deadline can be computed, so the row reads no-clock rather than an assumed 72 hours.')
        : null,
      /** How long until the deadline, in whole minutes; negative once passed. */
      minutesToDeadline: deadlineAt ? Math.ceil(((ms(deadlineAt) ?? 0) - (ms(nowIso) ?? 0)) / MIN_MS) : null,
      closing: Boolean(deadlineAt) && !recorded && (() => {
        const toDeadline = ((ms(deadlineAt) ?? 0) - (ms(nowIso) ?? 0)) / MIN_MS;
        return toDeadline > 0 && toDeadline <= (conventions[MIC_SETTING_KEYS.closingWindowMinutes] || 0);
      })(),
    };
  });
}

/**
 * The state of one incident, in the declared precedence. Note what is NOT here:
 * `lapsed` is never a state, because a badly commanded incident and a blown
 * notification deadline are different facts and the register prints them
 * separately. `command-standing` is also not reachable from here — it is decided
 * by whether a stand-down act exists, below.
 */
function deriveState({ stoodDown, resolved, holderId }) {
  if (stoodDown) return 'stood-down';
  // The operational consequence has stopped, but nobody released the command
  // structure: the bridge is still open and the commander is still held.
  if (resolved) return 'command-standing';
  return holderId ? 'commanding' : 'no-commander';
}

/**
 * One incident, fully derived. Exported so the test suite can pin every branch
 * without a store, a clock or a seat.
 */
export function buildIncident(incident, { acts, roster, nowIso, conventions, matrix }) {
  const ordered = orderActs(list(acts).filter((act) => act.incidentId === incident.id));
  const command = readCommand(ordered);
  const severity = readSeverity(incident, ordered);
  const lines = readLines(incident, ordered, roster);
  const clocks = readClocks(incident, nowIso);
  const notifications = readNotifications(incident, ordered, clocks, { nowIso, conventions });

  const detectToDeclareMinutes = minutesBetween(incident.detectedAt, incident.declaredAt);
  const state = deriveState({ stoodDown: command.stoodDown, resolved: command.resolved, holderId: command.holderId });

  /**
   * THE ACCOUNTABLE SEAT. The joint apex above every response line lead and the
   * commander: computed from the reporting graph, never chosen. `no-authority`
   * is a printable finding about the graph, not a gap to be filled.
   */
  const leadIds = [...new Set(lines.map((line) => line.leadId).filter(Boolean))];
  const peopleIds = [...new Set([...(command.holderId ? [command.holderId] : []), ...leadIds])];
  let apex = null;
  let apexReason = null;
  if (!matrix || !matrix.nodes) {
    apexReason = 'The reporting graph is unreadable, so no accountable seat can be computed.';
  } else {
    const candidates = peopleIds.filter((id) => matrix.nodes.has(id));
    if (!candidates.length) {
      apexReason = 'None of the people on this incident is a node on the reporting graph, so there is no seat above them to name.';
    } else if (candidates.length < peopleIds.length) {
      apexReason = `${peopleIds.length - candidates.length} of the people on this incident ${peopleIds.length - candidates.length === 1 ? 'is' : 'are'} not on the reporting graph, so the accountable seat cannot be computed.`;
    } else {
      const verdict = matrixJointApex(matrix, candidates);
      // `leader` is a REAL node — the workspace leader, the person who owns this
      // workspace — but it is not a roster person, and the register must say so
      // rather than dress the operator up as a line manager. Carrying
      // `isLeaderOnly` through lets the panel print `leader-held` exactly as
      // every other matrix reader in this codebase does.
      if (verdict.unique && verdict.apexId) {
        apex = {
          id: verdict.apexId,
          name: matrix.nodes.get(verdict.apexId)?.name || verdict.apexId,
          ambiguous: false,
          ids: [verdict.apexId],
          isLeaderOnly: Boolean(verdict.isLeaderOnly),
        };
      } else if (verdict.ambiguous && !verdict.disconnected && verdict.apexIds?.length) {
        apex = { id: null, name: null, ambiguous: true, ids: verdict.apexIds };
        apexReason = 'The response lines have more than one joint seat above them (a genuine diamond). The register prints every candidate and names none as the accountable seat.';
      } else {
        apexReason = 'The people on this incident have no common seat above them on the reporting graph. No accountable seat is named, and none is invented.';
      }
    }
  }

  // A minor incident that was never commanded is not a failure of command; the
  // state is printed at all only where a major incident's absence of a commander
  // would be one.
  const major = severityRow(severity.current)?.major === true;
  // A minor incident nobody commanded was never a command failure: it is
  // `declared`, and no commander is owed on it. The no-commander finding is
  // reserved for a live major incident, where the absence is a real failure.
  const reportedState = (state === 'no-commander' && !major) ? 'declared' : state;
  const finalStateRow = stateRow(reportedState) || null;

  const lapsedCount = notifications.filter((row) => row.state === 'lapsed').length;
  const lateCount = notifications.filter((row) => row.state === 'recorded-late').length;
  const noClockCount = notifications.filter((row) => row.state === 'no-clock').length;
  const recordedCount = notifications.filter((row) => row.recordedAt).length;
  const externalRequired = notifications.filter((row) => row.external).length;
  const externalRecorded = notifications.filter((row) => row.external && row.recordedAt).length;

  return {
    id: incident.id,
    title: incident.title,
    severity: severity.current,
    severityRow: severityRow(severity.current),
    peakSeverity: severity.peak,
    peakSeverityRow: severityRow(severity.peak),
    severityChanges: (() => {
      // `raised` is measured against the severity in force IMMEDIATELY BEFORE the
      // act, not against the incident's original declaration: a second raise on an
      // incident already raised is still a raise, and reading it against the base
      // would print it as a lowering.
      let inForce = incident.severity;
      return ordered.filter((act) => act.kind === 'severity').map((act) => {
        const fromRank = severityRank(inForce) ?? 9;
        const toRank = severityRank(act.severity) ?? 9;
        const row = {
          severity: act.severity,
          severityLabel: severityRow(act.severity)?.label || act.severity,
          from: inForce,
          fromLabel: severityRow(inForce)?.label || inForce,
          raised: toRank < fromRank,
          reason: act.reason,
          at: act.at,
          actorId: act.actorId,
          actorName: personLabel(roster.get(act.actorId), act.actorId),
        };
        inForce = act.severity;
        return row;
      });
    })(),
    criterion: incident.criterion,
    detectedAt: incident.detectedAt,
    declaredAt: incident.declaredAt,
    declaredById: incident.declaredById,
    declaredByName: personLabel(roster.get(incident.declaredById), incident.declaredById),
    detectToDeclareMinutes,
    followsUpOn: incident.followsUpOn || null,
    state: reportedState,
    stateLabel: finalStateRow?.label || reportedState,
    stateSays: finalStateRow?.says || '',
    tone: finalStateRow?.tone || 'neutral',
    major,
    commanderId: command.holderId,
    commanderName: command.holderId ? personLabel(roster.get(command.holderId), command.holderId) : null,
    commandedSince: command.heldSince,
    commandHistory: command.history.map((row) => ({
      ...row,
      actorName: personLabel(roster.get(row.actorId), row.actorId),
      holderName: row.holderId ? personLabel(roster.get(row.holderId), row.holderId) : null,
    })),
    resolvedAt: command.resolved ? command.resolved.at : null,
    resolvedById: command.resolved ? command.resolved.actorId : null,
    resolvedByName: command.resolved ? personLabel(roster.get(command.resolved.actorId), command.resolved.actorId) : null,
    resolutionEvidence: command.resolved ? command.resolved.evidenceText : null,
    /** Declaration to resolution: the operational duration. */
    resolvedMinutes: command.resolved ? minutesBetween(incident.declaredAt, command.resolved.at) : null,
    stoodDownAt: command.stoodDown ? command.stoodDown.at : null,
    stoodDownById: command.stoodDown ? command.stoodDown.actorId : null,
    stoodDownByName: command.stoodDown ? personLabel(roster.get(command.stoodDown.actorId), command.stoodDown.actorId) : null,
    standDownReason: command.stoodDown ? command.stoodDown.reason : null,
    /** Total elapsed from declaration to stand-down, in whole minutes. */
    commandedMinutes: command.stoodDown ? minutesBetween(incident.declaredAt, command.stoodDown.at) : null,
    lines,
    linesUnled: lines.filter((line) => line.state !== 'led').length,
    peopleIds,
    clocks,
    notifications,
    counts: {
      lines: lines.length,
      linesUnled: lines.filter((line) => line.state !== 'led').length,
      clocks: clocks.length,
      notificationsRequired: notifications.length,
      notificationsRecorded: recordedCount,
      notificationsLate: lateCount,
      notificationsLapsed: lapsedCount,
      notificationsNoClock: noClockCount,
      externalRequired,
      externalRecorded,
    },
    apex,
    apexReason,
    /** The register never rates a person; these are the only per-incident figures. */
    actCount: ordered.length,
    updatedAt: incident.updatedAt,
  };
}

/**
 * The whole register, read for a seat. `seat` narrows WHICH incidents a seat may
 * see; it never changes what an incident's own rows say.
 */
export function buildIncidents(state, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const nowIso = at.toISOString();
  const today = dayKey(at);
  const conventions = normalizeMicSettings(settings || state?.settings || {});
  const warnings = [];
  const incidents = normalizeMicIncidents(state?.micIncidents, warnings);
  const acts = normalizeMicActs(state?.micActs, incidents, warnings);
  const roster = rosterIndex(state);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...(state?.settings || {}), activeSeatId: null } });
  } catch (error) {
    matrixError = String(error?.message || error);
    matrix = null;
  }

  const built = incidents.map((incident) => buildIncident(incident, {
    acts, roster, nowIso, conventions, matrix,
  }));

  // A seat sees the incidents it is a party to (commander, line lead, declarer)
  // or one whose people it holds through the span or a declared line.
  const operator = !seat || seat.fullAccess === true;
  const readOnly = seat?.readOnly === true;
  const seatId = seat ? (seat.nodeId || seat.id || null) : null;
  const reach = seat ? new Set([seatId, ...(seat.scope || []), ...(seat.lineScope || [])].filter(Boolean)) : null;
  const sees = (incident) => {
    if (operator) return true;
    if (!seatId) return false;
    if ([incident.declaredById, incident.commanderId, ...incident.peopleIds].includes(seatId)) return true;
    if (reach && incident.peopleIds.some((id) => reach.has(id))) return true;
    return false;
  };

  const visible = [];
  let hidden = 0;
  for (const incident of built) {
    if (sees(incident)) visible.push(incident);
    else hidden += 1;
  }

  const buckets = {
    sev1: 0, sev2: 0, sev3: 0, sev4: 0,
  };
  for (const incident of visible) buckets[incident.severity] = (buckets[incident.severity] || 0) + 1;

  const states = Object.fromEntries(MIC_STATES.map((row) => [row.key, 0]));
  for (const incident of visible) states[incident.state] = (states[incident.state] || 0) + 1;

  const notifStates = Object.fromEntries(MIC_NOTIFY_STATES.map((row) => [row.key, 0]));
  for (const incident of visible) for (const row of incident.notifications) notifStates[row.state] = (notifStates[row.state] || 0) + 1;

  const byParty = new Map();
  for (const incident of visible) {
    for (const row of incident.notifications) {
      const entry = byParty.get(row.party) || { party: row.party, partyLabel: row.partyLabel, external: row.external, required: 0, recorded: 0, late: 0, lapsed: 0, noClock: 0 };
      entry.required += 1;
      if (row.recordedAt) entry.recorded += 1;
      if (row.state === 'recorded-late') entry.late += 1;
      if (row.state === 'lapsed') entry.lapsed += 1;
      if (row.state === 'no-clock') entry.noClock += 1;
      byParty.set(row.party, entry);
    }
  }

  const byLine = new Map();
  for (const incident of visible) {
    for (const line of incident.lines) {
      const key = line.duty;
      const entry = byLine.get(key) || { duty: key, lines: 0, led: 0, assigned: 0, unassigned: 0 };
      entry.lines += 1;
      entry[line.state] = (entry[line.state] || 0) + 1;
      byLine.set(key, entry);
    }
  }

  const totals = {
    incidents: visible.length,
    live: visible.filter((incident) => !incident.stoodDownAt).length,
    stoodDown: visible.filter((incident) => incident.state === 'stood-down').length,
    commandStanding: visible.filter((incident) => incident.state === 'command-standing').length,
    noCommander: visible.filter((incident) => incident.state === 'no-commander').length,
    declared: visible.filter((incident) => incident.state === 'declared').length,
    commanding: visible.filter((incident) => incident.state === 'commanding').length,
    major: visible.filter((incident) => incident.major).length,
    lines: visible.reduce((n, incident) => n + incident.lines.length, 0),
    linesUnled: visible.reduce((n, incident) => n + incident.linesUnled, 0),
    clocks: visible.reduce((n, incident) => n + incident.clocks.length, 0),
    notificationsRequired: visible.reduce((n, incident) => n + incident.counts.notificationsRequired, 0),
    notificationsRecorded: visible.reduce((n, incident) => n + incident.counts.notificationsRecorded, 0),
    notificationsLate: visible.reduce((n, incident) => n + incident.counts.notificationsLate, 0),
    notificationsLapsed: visible.reduce((n, incident) => n + incident.counts.notificationsLapsed, 0),
    notificationsNoClock: visible.reduce((n, incident) => n + incident.counts.notificationsNoClock, 0),
    externalRequired: visible.reduce((n, incident) => n + incident.counts.externalRequired, 0),
    externalRecorded: visible.reduce((n, incident) => n + incident.counts.externalRecorded, 0),
    unreadableRows: warnings.length,
  };

  /**
   * THE DETECTION-TO-DECLARATION READ. A median, and only above the declared
   * privacy floor, computed as a LOWER median so the figure stays a whole number
   * of minutes rather than an average of two minutes printed to a decimal. The
   * kind is printed beside it, so nobody mistakes it for the exact middle.
   */
  const intervals = visible.map((incident) => incident.detectToDeclareMinutes).filter((value) => Number.isInteger(value)).sort((a, b) => a - b);
  let intervalFigure = null;
  let intervalReason = null;
  if (intervals.length < L.privacyFloor) {
    intervalReason = `Only ${intervals.length} readable detection-to-declaration interval(s); the register withholds the median below a floor of ${L.privacyFloor} because a figure a single incident can move is not a figure.`;
  } else {
    const mid = Math.floor((intervals.length - 1) / 2);
    intervalFigure = {
      value: intervals[mid],
      n: intervals.length,
      kind: intervals.length % 2 === 1 ? 'median' : 'lower-median',
      min: intervals[0],
      max: intervals[intervals.length - 1],
    };
  }

  const balances = (() => {
    const stateSum = MIC_STATES.reduce((n, row) => n + (states[row.key] || 0), 0);
    const sevSum = Object.values(buckets).reduce((n, value) => n + value, 0);
    const notifSum = Object.values(notifStates).reduce((n, value) => n + value, 0);
    return {
      statesReconcile: stateSum === visible.length,
      severitiesReconcile: sevSum === visible.length,
      notificationsReconcile: notifSum === totals.notificationsRequired,
      statesSum: stateSum,
      severitiesSum: sevSum,
      notificationsSum: notifSum,
    };
  })();
  const allBalanced = balances.statesReconcile && balances.severitiesReconcile && balances.notificationsReconcile;

  return {
    asOf: nowIso,
    today,
    conventions,
    incidents: visible,
    hidden,
    matrixError,
    warnings,
    buckets,
    states,
    notifStates,
    byParty: [...byParty.values()].sort((a, b) => a.party.localeCompare(b.party)),
    byLine: [...byLine.values()].sort((a, b) => a.duty.localeCompare(b.duty)),
    totals,
    interval: intervalFigure,
    intervalReason,
    balances,
    /** Two separate claims, never collapsed: the rows re-add, and nothing was withheld. */
    auditClean: allBalanced && hidden === 0 && warnings.length === 0 && !matrixError,
    figuresComplete: hidden === 0 && warnings.length === 0 && !matrixError && allBalanced,
    readOnly,
    seatLabel: seat?.label || 'Operator view',
    at,
  };
}

/** The matrix a caller needs to file asks against. Exported so the rule shares ONE matrix build. */
export function incidentMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

/**
 * What the acting seat owes next. Counts only — never a rate over people, and
 * never a per-person figure.
 */
export function incidentAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  const report = buildIncidents(state, { now, settings, seat });
  let n = 0;
  for (const incident of report.incidents) {
    if (incident.state === 'no-commander') n += 1;
    if (incident.state === 'command-standing') n += 1;
    for (const row of incident.notifications) {
      if (row.state === 'lapsed') n += 1;
      else if (row.closing) n += 1;
    }
    if (incident.linesUnled) n += incident.linesUnled;
  }
  return n;
}

/** The incidents a seat could be asked about, for the dialog selectors. */
export function incidentCandidates(state, { now = new Date(), settings = null, seat = null } = {}) {
  const report = buildIncidents(state, { now, settings, seat });
  return report.incidents
    .filter((incident) => incident.state !== 'stood-down')
    .map((incident) => ({
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      severityLabel: incident.severityRow?.label || incident.severity,
      state: incident.state,
      stateLabel: incident.stateLabel,
      commanderId: incident.commanderId,
      commanderName: incident.commanderName,
      lines: incident.lines,
      clocks: incident.clocks.map((clock) => ({ key: clock.key, label: `${clock.sourceLabel} · ${clock.clockMinutes} min` })),
      notifications: incident.notifications.map((row) => ({ notifId: row.notifId, party: row.party, partyLabel: row.partyLabel, state: row.state })),
      apex: incident.apex,
    }));
}

/**
 * The seat-scoped report the actions and the CSV share. Kept as one function so
 * the panel, the export and the badge can never disagree about what was read.
 */
export function incidentReport(state, { now = new Date(), settings = null, seat = null } = {}) {
  return buildIncidents(state, { now, settings, seat });
}

/** The next day a notification ask is due: the convention, bounded. */
export function incidentAskDueOn(today, { lapsed = false, conventions }) {
  const days = lapsed
    ? (conventions[MIC_SETTING_KEYS.lapsedAskDays] || 0)
    : (conventions[MIC_SETTING_KEYS.chaseDays] || 1);
  return addDays(today, days);
}

/**
 * The insights contributions — MIC-01..03. Read-side only: this reads the
 * register's own ledgers and the live matrix, so it cannot recurse into the
 * engine that is running it.
 */
export function incidentCommandSignals(state, now = new Date(), settings = null) {
  let report;
  try {
    report = incidentReport(state, { now, settings, seat: null });
  } catch {
    return [];
  }
  if (!report) return [];
  const signals = [];
  const add = (signal) => signals.push({ domain: 'Incident command', route: MIC_HREF, ...signal });

  if (report.totals.notificationsLapsed) {
    add({
      ruleId: 'MIC-01',
      severity: Math.min(5, 4 + Math.min(1, report.totals.notificationsLapsed - 1)),
      confidence: 'high',
      title: `${report.totals.notificationsLapsed} declared notification deadline(s) have passed with nothing recorded`,
      detail: 'These are external obligations on the entity’s own declared clocks. The register prints the overrun to the minute and never converts a passed deadline into a met one. The ask, when RULE-MIC-01 files one, goes to the joint seat above the response lines that hold the clock.',
      action: { label: 'Open the incident command register', route: `${MIC_HREF}?view=clocks` },
      evidence: [
        `${report.totals.notificationsRequired} obligation(s) declared, ${report.totals.notificationsRecorded} recorded`,
        `${report.totals.notificationsLate} recorded after their deadline`,
      ],
    });
  }

  if (report.totals.noCommander || report.totals.commandStanding) {
    add({
      ruleId: 'MIC-02',
      severity: report.totals.noCommander ? 5 : 4,
      confidence: 'high',
      title: report.totals.noCommander
        ? `${report.totals.noCommander} live major incident(s) with nobody in command`
        : `${report.totals.commandStanding} closed incident(s) still holding command`,
      detail: report.totals.noCommander
        ? 'A live major incident has no named commander. The register prints this as a finding about the response and asks nobody to explain themselves; command is taken by an explicit act.'
        : 'The operational consequence has stopped and command was never released. The bridge is still open and the commander is still held, and only a dated stand-down act closes it — time never does.',
      action: { label: 'Open the incident command register', route: `${MIC_HREF}?view=live` },
      evidence: [`${report.totals.incidents} incident(s) on the record`],
    });
  }

  if (report.totals.linesUnled) {
    add({
      ruleId: 'MIC-03',
      severity: 3,
      confidence: 'high',
      title: `${report.totals.linesUnled} response line(s) nobody has accepted`,
      detail: 'A line assigned is not a line led: the duty is owned only when the named lead accepts it in their own name. The register prints the difference and never assumes an acceptance.',
      action: { label: 'See the response lines', route: `${MIC_HREF}?view=lines` },
      evidence: [`${report.totals.lines} line(s) across ${report.totals.incidents} incident(s)`],
    });
  }

  return signals;
}
