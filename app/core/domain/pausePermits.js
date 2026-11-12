/**
 * app/core/domain/pausePermits.js — the Automation Pause Permit Register's pure
 * read model (ADR-0182, Schema v145, `#/settings?panel=pause-permits`,
 * CSV scope #136).
 *
 * THE QUESTION. "Eighty-five automatic controls run in this workspace. Nine of
 * them read the reporting graph, so silencing one means work that would have
 * reached somebody's second manager was never issued. Which are off, who
 * authorised that, why, and when does it end?"
 *
 * Until ADR-0180 the record could not answer even "which are off". ADR-0180
 * made the switched-off ones visible. Visible is not governed: a bare boolean
 * with no authoriser, no reason and no expiry is an invisible bypass, and in a
 * matrix the person who is not told is somebody's other manager.
 *
 * WHAT IT READS
 *   settings               the declared switches and the value in force for each;
 *   pausePermits           dated permits: authoriser, reason, mitigation, window;
 *   pausePermitMarkers     RULE-PMP-01's own asks and observations;
 *   the live matrix graph  for span scoping and for the single seat that can
 *                          authorise an unpermitted pause.
 *
 * WHAT IT REFUSES
 *   - A state for a switch the record does not declare. It is not read at all.
 *   - "Permitted" for a switch that is ON. An on switch is not silenced.
 *   - "Expired" for a switch with no permit that ever named it. That is
 *     `unpermitted` — a different failure with a different owner.
 *   - A reach claim wider than the source supports. Reach names the rule module
 *     that goes quiet and stops there.
 *   - An owner for an unpermitted pause when no single seat can authorise it.
 *     The ambiguity is printed; nobody is substituted.
 *
 * Every figure is an integer count. Nothing derived here is stored, and a
 * render writes nothing.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  normalizePausePermitSettings,
  permitInForce,
  permitsForKey,
} from './pausePermitSchema.js';
import {
  PAUSE_PERMIT_CSV_COLUMNS,
  PAUSE_PERMIT_DEFAULTS,
  PAUSE_PERMIT_DETAIL_LEVELS,
  PAUSE_PERMIT_DETAIL_REASONS,
  PAUSE_PERMIT_LIMITS,
  PAUSE_PERMIT_METHOD,
  PAUSE_PERMIT_REACH_RULES,
  PAUSE_PERMIT_RIGHTS,
  PAUSE_PERMIT_SETTING_KEYS,
  PAUSE_PERMIT_STATES,
  PAUSE_PERMIT_STATE_LABELS,
  PAUSE_PERMIT_STATE_REASONS,
  PAUSE_PERMIT_SCOPES,
  isPermittableSwitchKey,
  pausePermitReachesMatrix,
} from './pausePermitRegistry.js';

const counts = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const DAY_MS = 86400000;

/** Whole days from `from` to `to` in day keys. Integer, never negative-clamped silently. */
function daysBetweenKeys(from, to) {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

function addDaysKey(day, n) {
  const base = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(base)) return null;
  return new Date(base + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The declared automatic switches, read from the settings in force. A switch is
 * a boolean convention whose key ends in `Auto<Word>` — the same census the
 * Conventions-in-Force Register derives (ADR-0180), re-derived here rather than
 * copied, so a new engine's switch appears the moment the loader carries it.
 */
export function declaredSwitches(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const out = [];
  for (const key of Object.keys(src).sort()) {
    if (!isPermittableSwitchKey(key)) continue;
    if (typeof src[key] !== 'boolean') continue;
    out.push(key);
  }
  return out;
}

function seatFor(view, at, graph) {
  const scope = matrixLineScope(graph);
  return activeSeat(buildSeats(view, { now: at, settings: view.settings || {}, lineScope: scope.byManager }));
}

/**
 * Where the authoriser of a permit lands. Closed, in precedence order.
 *
 *   unique        one named roster seat holds the authority today;
 *   leader-held   the authoriser is the workspace leader, whose authority is
 *                 the whole workspace rather than one span;
 *   off-roster    the authoriser is no longer on the roster: the permit still
 *                 binds, and the register says who can no longer answer for it;
 *   unknown       the permit names no authoriser at all.
 */
export const PAUSE_PERMIT_OWNER_STATES = Object.freeze(['unique', 'leader-held', 'off-roster', 'unknown']);

export function buildPausePermits(state, { now = new Date(), settings = null, matrix = null } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const effectiveSettings = settings || state?.settings || {};
  const view = { ...state, settings: effectiveSettings };
  const graph = matrix || buildMatrix(view, { now: at, settings: effectiveSettings });
  const seat = seatFor(view, at, graph);
  const conv = normalizePausePermitSettings(effectiveSettings);
  const K = PAUSE_PERMIT_SETTING_KEYS;
  const today = dayKey(at);
  const full = Boolean(seat.fullAccess);
  const readOnly = Boolean(seat.readOnly);

  const nameOf = (id) => graph.nodes.get(id)?.name || id;
  const permits = Array.isArray(state?.pausePermits) ? state.pausePermits : [];
  const markers = Array.isArray(state?.pausePermitMarkers) ? state.pausePermitMarkers : [];

  const board = {
    switchesDeclaredN: 0,
    states: counts(PAUSE_PERMIT_STATES),
    statesReconcile: false,
    permitsTotalN: 0,
    permitsLiveN: 0,
    permitsExpiredN: 0,
    permitsRevokedN: 0,
    permitsPendingN: 0,
    /** Pauses two permits overlapped on. A state a workspace can import into. */
    permitsOverlappedN: 0,
    permitsReconcile: false,
    reachOffN: 0,
    reachUnpermittedN: 0,
    reachExpiredN: 0,
    reachSwitchesN: 0,
    owners: counts(PAUSE_PERMIT_OWNER_STATES),
    ownersReconcile: false,
    unpermittedPastGraceN: 0,
    unprovableStartN: 0,
    openPauseAsksN: 0,
  };

  /* ------------------------------------------------------- 1. the switches */
  const switches = declaredSwitches(effectiveSettings);
  board.switchesDeclaredN = switches.length;
  board.reachSwitchesN = switches.filter((key) => pausePermitReachesMatrix(key)).length;

  // Every permit's own state on the reading day, for the permit partitions.
  // A permit is in EXACTLY one of four states, first match wins, so the four
  // counts reconcile to the permits read — no permit is counted twice:
  //   revoked  the authority was withdrawn;
  //   live     in its window, not revoked, first day reached;
  //   expired  its window has passed;
  //   pending  its first day has not arrived yet.
  const permitRows = [];
  for (const p of permits) {
    const ended = today > p.to;
    const started = p.from <= today;
    let stateKey;
    if (p.revoked) stateKey = 'revoked';
    else if (started && !ended) stateKey = 'live';
    else if (ended) stateKey = 'expired';
    else stateKey = 'pending';
    if (stateKey === 'live') board.permitsLiveN += 1;
    else if (stateKey === 'expired') board.permitsExpiredN += 1;
    else if (stateKey === 'revoked') board.permitsRevokedN += 1;
    else board.permitsPendingN += 1;
    permitRows.push({
      permitId: p.id,
      key: p.key,
      scope: p.scope,
      scopeTargetId: p.scopeTargetId,
      counterpartId: p.counterpartId,
      authoriserId: p.authoriserId,
      authoriserName: p.authoriserId ? nameOf(p.authoriserId) : null,
      reason: p.reason,
      mitigation: p.mitigation,
      from: p.from,
      to: p.to,
      days: daysBetweenKeys(p.from, p.to) === null ? null : daysBetweenKeys(p.from, p.to) + 1,
      at: p.at,
      revoked: p.revoked,
      revokedOn: p.revokedOn,
      revokedById: p.revokedById,
      state: stateKey,
      reachesMatrix: pausePermitReachesMatrix(p.key),
      reachRule: PAUSE_PERMIT_REACH_RULES[p.key] || null,
    });
  }
  board.permitsTotalN = permits.length;
  board.permitsReconcile = board.permitsLiveN + board.permitsExpiredN + board.permitsRevokedN + board.permitsPendingN === board.permitsTotalN;
  // Overlap: a pause two permits both in force on the same day.
  const overlapKeys = new Set();
  const byKey = new Map();
  for (const p of permits) {
    if (p.revoked) continue;
    if (!byKey.has(p.key)) byKey.set(p.key, []);
    byKey.get(p.key).push(p);
  }
  for (const [key, list] of byKey) {
    const sorted = list.slice().sort((a, b) => String(a.from).localeCompare(String(b.from)));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].from <= sorted[i - 1].to) { overlapKeys.add(key); break; }
    }
  }
  board.permitsOverlappedN = overlapKeys.size;

  /* --------------------------------------------------- 2. the switch table */
  const rows = [];
  for (const key of switches) {
    const value = effectiveSettings[key];
    const on = value !== false;
    const live = on ? null : permitInForce(permits, key, today);
    const history = permitsForKey(permits, key);
    // A permit whose window has PASSED while the switch stayed off is `expired`:
    // the authority ran out and the pause outlived it. A permit that was REVOKED
    // and left the switch off is NOT an expired authority — the authority was
    // withdrawn, so the silence is `unpermitted` again. Two different failures,
    // never collapsed into one word.
    const ranOut = !on && !live && history.some((p) => !p.revoked && today > p.to);
    let stateKey;
    if (on) stateKey = 'on';
    else if (live) stateKey = 'permitted';
    else if (ranOut) stateKey = 'expired';
    else stateKey = 'unpermitted';
    board.states[stateKey] += 1;

    // How long the switch has stood off, and whether that has passed the grace.
    //
    // The record does NOT hold the day a switch was flipped — `settings.updated`
    // events are capped and evicted, which is the defect this register exists to
    // name. So the start is taken only from evidence that IS dated and survives:
    // the latest permit first day at or before today. A switch with no such
    // permit has NO provable start, and it reads `null` with the reason printed
    // rather than being dated from an expired permit's last day or from today.
    const dated = history.filter((p) => p.from <= today).map((p) => p.from).sort();
    const offSince = !on && dated.length ? dated[dated.length - 1] : null;
    const offDays = offSince ? daysBetweenKeys(offSince, today) : null;

    const lastPermit = history
      .slice()
      .sort((a, b) => String(b.to).localeCompare(String(a.to)) || String(b.at).localeCompare(String(a.at)))[0] || null;

    rows.push({
      key,
      on,
      stateKey,
      stateLabel: PAUSE_PERMIT_STATE_LABELS[stateKey],
      stateReason: PAUSE_PERMIT_STATE_REASONS[stateKey],
      reachesMatrix: pausePermitReachesMatrix(key),
      reachRule: PAUSE_PERMIT_REACH_RULES[key] || null,
      permitN: history.length,
      permit: live
        ? {
          permitId: live.id,
          authoriserId: live.authoriserId,
          authoriserName: live.authoriserId ? nameOf(live.authoriserId) : null,
          reason: live.reason,
          mitigation: live.mitigation,
          from: live.from,
          to: live.to,
          daysLeft: daysBetweenKeys(today, live.to),
          scope: live.scope,
          counterpartId: live.counterpartId,
        }
        : null,
      lastPermit: lastPermit
        ? { permitId: lastPermit.id, to: lastPermit.to, revoked: Boolean(lastPermit.revoked), revokedOn: lastPermit.revokedOn }
        : null,
      offSince,
      offDays,
      // The grace can only be tested where the start is provable. An
      // unprovable start is withheld and counted, never assumed to be today.
      pastGrace: !on && !live && offDays !== null ? offDays >= conv[K.escalateAfterDays] : null,
      graceProvable: offDays !== null,
    });
  }
  board.statesReconcile = sum(board.states) === board.switchesDeclaredN;

  const offRows = rows.filter((r) => !r.on);
  const reachOff = offRows.filter((r) => r.reachesMatrix);
  board.reachOffN = reachOff.length;
  board.reachUnpermittedN = reachOff.filter((r) => r.stateKey === 'unpermitted').length;
  board.reachExpiredN = reachOff.filter((r) => r.stateKey === 'expired').length;
  board.unpermittedPastGraceN = offRows.filter((r) => r.stateKey === 'unpermitted' && r.pastGrace === true).length;
  // A switch off with NO provable start cannot be tested against the grace. It
  // is counted apart so the grace figure above is never read as covering it.
  board.unprovableStartN = offRows.filter((r) => r.graceProvable === false).length;

  /* -------------------------------------------- 3. where the authority lands */
  const ownerOf = (authoriserId) => {
    if (!authoriserId) return 'unknown';
    if (authoriserId === LEADER_ID) return 'leader-held';
    if (!graph.roster.has(authoriserId)) return 'off-roster';
    return 'unique';
  };
  for (const row of rows) {
    if (row.stateKey !== 'permitted' || !row.permit) continue;
    board.owners[ownerOf(row.permit.authoriserId)] += 1;
  }
  board.ownersReconcile = sum(board.owners) === board.states.permitted;

  const markerTasks = new Set(markers.filter((m) => m?.kind === 'ask' && m.taskId).map((m) => m.taskId));
  const delegations = Array.isArray(state?.delegations) ? state.delegations : [];
  board.openPauseAsksN = delegations.filter((d) => d?.status === 'active' && markerTasks.has(d.id)).length;

  /* ------------------------------------------------- 4. who can authorise */
  /**
   * The single seat that can authorise a pause in this workspace, or the reason
   * there is none. The authority to silence a workspace-wide control sits with
   * the seat ABOVE every manager a silenced rule reads — the joint apex of the
   * whole roster — and in a matrix that is exactly the seat no single line
   * manager has.
   */
  const authoriseRight = canAct(PAUSE_PERMIT_RIGHTS.GRANT, seat);
  const apex = matrixJointApex(graph, [...graph.roster.keys()]);
  const authoriser = {
    seatId: apex.unique ? apex.apexId : null,
    seatName: apex.unique ? nameOf(apex.apexId) : null,
    unique: Boolean(apex.unique),
    isLeaderOnly: Boolean(apex.isLeaderOnly),
    reason: apex.unique
      ? (apex.isLeaderOnly
        ? 'The workspace leader is the only seat above every reporting line here.'
        : 'One seat sits above every reporting line here.')
      : 'No single seat sits above every reporting line in this workspace, so no one seat can authorise a workspace-wide pause. Escalate through the common leader.',
  };

  /* ------------------------------------------- 5. what this seat is shown */
  const declaredLevel = seat.disclosure?.names;
  const level = full ? 'visible'
    : readOnly ? 'none'
      : PAUSE_PERMIT_DETAIL_LEVELS.includes(declaredLevel) ? declaredLevel : 'none';

  const leads = (id) => Boolean(id) && graph.lines.some((l) => l.managerId === id && l.active !== false);

  let shownRows = rows;
  let shownPermits = permitRows;
  if (level === 'leaders') {
    shownRows = rows.map((r) => ({
      ...r,
      // A reason and a compensating measure are free text written by one seat
      // about a span; below the operator view they are summarised, never quoted.
      permit: r.permit
        ? {
          ...r.permit,
          authoriserId: leads(r.permit.authoriserId) ? r.permit.authoriserId : null,
          authoriserName: leads(r.permit.authoriserId) ? r.permit.authoriserName : null,
          reason: null,
          mitigation: null,
        }
        : null,
    }));
    shownPermits = permitRows.map((p) => ({
      ...p,
      authoriserId: leads(p.authoriserId) ? p.authoriserId : null,
      authoriserName: leads(p.authoriserId) ? p.authoriserName : null,
      counterpartId: leads(p.counterpartId) ? p.counterpartId : null,
      reason: null,
      mitigation: null,
    }));
  } else if (level === 'none') {
    shownRows = [];
    shownPermits = [];
  }

  const shownSwitchRows = shownRows.slice(0, PAUSE_PERMIT_LIMITS.rowsCap);
  const shownPermitRows = shownPermits.slice(0, PAUSE_PERMIT_LIMITS.rowsCap);

  return {
    engineVersion: 'pause-permit-2026.11-v1',
    adr: 'ADR-0182',
    ruleId: 'RULE-PMP-01',
    generatedAt: at.toISOString(),
    generatedOn: today,
    seat,
    conventions: conv,
    today,
    defaultDays: conv[K.defaultDays],
    escalateAfterDays: conv[K.escalateAfterDays],
    askDueDays: conv[K.askDueDays],
    board,
    switches: shownSwitchRows,
    switchesListedN: shownSwitchRows.length,
    switchesUnlistedN: rows.length - shownSwitchRows.length,
    permits: shownPermitRows,
    permitsListedN: shownPermitRows.length,
    permitsUnlistedN: permitRows.length - shownPermitRows.length,
    offSwitches: level === 'none' ? [] : shownRows.filter((r) => !r.on),
    reachSwitches: level === 'none' ? [] : shownRows.filter((r) => r.reachesMatrix),
    authoriser,
    actor: {
      canPermit: !readOnly && authoriseRight.allow,
      canGovern: !readOnly && (full || Boolean(canAct(PAUSE_PERMIT_RIGHTS.GOVERN, seat).allow)),
      permitRefusal: authoriseRight.allow ? null : authoriseRight.reason,
    },
    detail: { level, withheld: level !== 'visible', reason: PAUSE_PERMIT_DETAIL_REASONS[level] },
    limits: PAUSE_PERMIT_LIMITS,
    method: PAUSE_PERMIT_METHOD,
    states: PAUSE_PERMIT_STATES,
    scopes: PAUSE_PERMIT_SCOPES,
    inertNote: board.permitsTotalN === 0 && board.states.unpermitted === 0
      ? 'Every declared automatic switch is on and no permit exists. Nothing is silenced, so there is nothing to govern yet.'
      : '',
  };
}

const yn = (v) => (v ? 'yes' : 'NO');

export function pausePermitBriefText(report) {
  const b = report.board;
  return [
    `Automation pause permits — ${report.generatedOn} (ADR-0182, RULE-PMP-01)`,
    `Declared automatic switches: ${b.switchesDeclaredN}; on: ${b.states.on}; OFF: ${b.switchesDeclaredN - b.states.on}; states reconcile: ${yn(b.statesReconcile)}`,
    `Off with a live permit: ${b.states.permitted}; off past a permit: ${b.states.expired}; off with no permit at all: ${b.states.unpermitted}`,
    `Permits: ${b.permitsTotalN} total; live ${b.permitsLiveN}; expired ${b.permitsExpiredN}; revoked ${b.permitsRevokedN}; pauses two permits overlapped: ${b.permitsOverlappedN}`,
    `Switches known to reach a second reporting line: ${b.reachSwitchesN}; silenced: ${b.reachOffN}; of those unpermitted ${b.reachUnpermittedN} and expired ${b.reachExpiredN}`,
    `Authorisers of live permits: one named roster seat ${b.owners.unique}; the workspace leader ${b.owners['leader-held']}; no longer on the roster ${b.owners['off-roster']}; not recorded ${b.owners.unknown}; reconcile: ${yn(b.ownersReconcile)}`,
    `Unpermitted pauses standing past the declared grace of ${report.escalateAfterDays} day(s): ${b.unpermittedPastGraceN}; open pause asks: ${b.openPauseAsksN}`,
    `Who may authorise a workspace-wide pause: ${report.authoriser.unique ? `${report.authoriser.seatName}${report.authoriser.isLeaderOnly ? ' (the workspace leader)' : ''}` : 'no single seat — the ambiguity is printed, nobody is substituted'}`,
  ].join('\n');
}

export function pausePermitCsvRows(report) {
  const b = report.board;
  const row = Object.fromEntries(PAUSE_PERMIT_CSV_COLUMNS.map((key) => [key, '']));
  // An unresolved seat is refused in the export exactly as it is on screen.
  if (report.seat?.readOnly) return [{ ...row, row_type: 'refused', generated_on: report.generatedOn }];
  Object.assign(row, {
    row_type: 'summary',
    generated_on: report.generatedOn,
    scope: report.detail.level,
    detail_level: report.detail.level,
    as_of: report.today,
    switches_declared: b.switchesDeclaredN,
    switches_on: b.states.on,
    switches_off: b.switchesDeclaredN - b.states.on,
    state_permitted: b.states.permitted,
    state_expired: b.states.expired,
    state_unpermitted: b.states.unpermitted,
    state_on: b.states.on,
    states_reconcile: b.statesReconcile,
    permits_total: b.permitsTotalN,
    permits_live: b.permitsLiveN,
    permits_expired: b.permitsExpiredN,
    permits_revoked: b.permitsRevokedN,
    permits_pending: b.permitsPendingN,
    permits_overlapped: b.permitsOverlappedN,
    permits_reconcile: b.permitsReconcile,
    reach_off: b.reachOffN,
    reach_unpermitted: b.reachUnpermittedN,
    reach_expired: b.reachExpiredN,
    reach_switches_known: b.reachSwitchesN,
    authoriser_unique: b.owners.unique,
    authoriser_leader_held: b.owners['leader-held'],
    authoriser_off_roster: b.owners['off-roster'],
    authoriser_state_reconcile: b.ownersReconcile,
    unpermitted_past_grace: b.unpermittedPastGraceN,
    unprovable_start: b.unprovableStartN,
    open_pause_asks: b.openPauseAsksN,
    ask_due_days: report.askDueDays,
    default_days: report.defaultDays,
    escalate_after_days: report.escalateAfterDays,
  });
  return [row];
}

export { PAUSE_PERMIT_DEFAULTS };
