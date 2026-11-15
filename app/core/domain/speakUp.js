/**
 * app/core/domain/speakUp.js — the read engine of the Speak-Up Concern Routing &
 * Impartiality Register (ADR-0215, Schema v169).
 *
 * Pure. Nothing here writes, stores a state or caches a verdict: every state,
 * every due date, every impartiality finding and every latency is re-derived from
 * the dated rows on read, so a line declared after a concern was routed changes
 * the reading the verbatim way the record changed.
 *
 * THE THREE THINGS THIS FILE REFUSES TO COLLAPSE.
 *
 *   1. "nobody may hear it" is not "nobody has heard it yet".
 *      `no-impartial-route` is a structural finding about the organisation: the
 *      graph holds no seat that can hear this concern without holding one of the
 *      parties. It is a different fact from `unacknowledged`, and it is never
 *      given a receiver to make the screen look complete.
 *
 *   2. "the window passed with nothing recorded" is not "nothing happened".
 *      `watch-overdue` is the state where the retaliation window ended and no
 *      dated check exists. It is refused information, printed with its reason,
 *      and never a clearance.
 *
 *   3. "the receiver was impartial when it was routed" is not "the receiver is
 *      impartial now".
 *      Impartiality is recomputed on every read against the whole reporting
 *      graph. Where a line declared after the fact now puts the receiver over one
 *      of the parties, the row carries `receiver no longer impartial` with the
 *      relationship named — the same discipline ADR-0210 applies to a recusal
 *      that did not move the hand.
 *
 * WHAT IT NEVER DOES. It never decides whether a concern is well founded, never
 * infers a category from text, never names a reporter to a seat that does not
 * hold them, never shows a concern to its own subject, and never rates anybody.
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import {
  SPEAK_UP_ADR,
  SPEAK_UP_ENGINE_VERSION,
  SPEAK_UP_LIMITS,
  SPEAK_UP_REFUSALS,
  SPEAK_UP_STATE_BY_KEY,
  SPEAK_UP_WITHHOLD_REASONS,
  speakUpCategoryByKey,
  speakUpOutcomeByKey,
  speakUpRouteByKey,
  speakUpWatchByKey,
} from './speakUpRegistry.js';
import {
  firstActOfKind,
  normalizeConcernActs,
  normalizeConcernReports,
  readSpeakUpSettings,
  speakUpDaysBetween,
  speakUpText,
} from './speakUpSchema.js';

const L = SPEAK_UP_LIMITS;
const text = (value, max = 200) => speakUpText(value, max);

/**
 * Is this seat compromised as a receiver, and if not, in what ROLE does it hear
 * the concern?
 *
 * DISQUALIFIED — the seat cannot hear it at all:
 *   - it IS the subject (a hand does not clear itself);
 *   - it IS the reporter (nobody receives their own report);
 *   - it sits BELOW the subject on any line, because a person does not adjudge
 *     the conduct of the person whose work they answer for;
 *   - it sits BELOW the reporter on any line, for the same reason in the other
 *     direction.
 *
 * QUALIFIED, WITH THE ROLE PRINTED — these are real routes, and calling them
 * "independent" would be the lie this register exists to avoid:
 *   - `manages-subject`: the subject's own manager. This is the ordinary
 *     ESCALATION route and the person accountable for the conduct, not an
 *     independent one. It is permitted and labelled.
 *   - `manages-reporter`: the reporter's own other manager — in a matrix, the
 *     project line hearing a concern about the home line. This is precisely the
 *     route a matrix exists to provide, and refusing it would leave the second
 *     line silent exactly where it is most needed.
 *
 * Being a peer, an ancestor of both, or an unrelated seat is neither: the role is
 * null and the reading is plainly `impartial`.
 */
export function impartialityVerdict(matrix, { receiverId, subjectPersonId = null, reporterId = null }) {
  const refused = (reason) => ({ impartial: false, reason, roles: { managesSubject: false, managesReporter: false } });
  if (!receiverId) return refused('receiver-not-on-roster');
  if (!matrix || !matrix.nodes) return refused('receiver-not-on-roster');
  const node = matrix.nodes.get(receiverId);
  if (!node) return refused('receiver-not-on-roster');
  if (subjectPersonId && receiverId === subjectPersonId) return refused('receiver-is-subject');
  if (reporterId && receiverId === reporterId) return refused('receiver-is-reporter');
  const lines = matrix.linesByPerson || new Map();
  const holds = (heldId) => {
    if (node.descendants && node.descendants.has(heldId)) return true;
    const rows = lines.get(heldId) || [];
    return rows.some((line) => line && line.managerId === receiverId);
  };
  const reportsUpTo = (holderId) => Boolean(node.ancestors && node.ancestors.has(holderId));
  if (subjectPersonId) {
    if (reportsUpTo(subjectPersonId)) return refused('receiver-reports-to-subject');
  }
  if (reporterId) {
    if (reportsUpTo(reporterId)) return refused('receiver-reports-to-reporter');
  }
  return {
    impartial: true,
    reason: null,
    roles: {
      managesSubject: Boolean(subjectPersonId && holds(subjectPersonId)),
      managesReporter: Boolean(reporterId && holds(reporterId)),
    },
  };
}

/**
 * Every seat the record holds, split into the ones that could hear this concern
 * and a count of the reasons the rest could not. This is the function the whole
 * register rests on.
 */
export function speakUpCandidates(matrix, { subjectPersonId = null, reporterId = null } = {}) {
  const excluded = new Map();
  const candidates = [];
  if (!matrix || !matrix.nodes) return { candidates, excluded: [], excludedN: 0 };
  const ids = [...matrix.nodes.keys()].sort();
  for (const id of ids) {
    const verdict = impartialityVerdict(matrix, { receiverId: id, subjectPersonId, reporterId });
    if (verdict.impartial) candidates.push({ id, roles: verdict.roles });
    else excluded.set(verdict.reason, (excluded.get(verdict.reason) || 0) + 1);
  }
  return {
    candidates,
    excluded: [...excluded.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    excludedN: [...excluded.values()].reduce((a, b) => a + b, 0),
  };
}

/** A person's display name, the workspace leader included. */
export function speakUpNameOf(state, personId) {
  if (!personId) return null;
  if (personId === LEADER_ID) return text(state?.settings?.leaderName, 120) || 'Workspace leader';
  const person = (Array.isArray(state?.people) ? state.people : []).find((row) => row && row.id === personId);
  return person ? (text(person.name, 120) || personId) : personId;
}

/** The disclosure level this seat gets for this concern, with its printed reason. */
function detailFor(report, { seat, matrix, personId }) {
  if (!seat || seat.fullAccess) return { detail: 'full', reason: null };
  if (report.receiverId && personId === report.receiverId) return { detail: 'full', reason: null };
  if (report.raisedById && personId === report.raisedById) return { detail: 'full', reason: null };
  if (report.subjectKind === 'person' && personId === report.subjectPersonId) {
    return { detail: 'counted', reason: SPEAK_UP_WITHHOLD_REASONS.isSubject };
  }
  const node = matrix?.nodes?.get(personId);
  const holdsReporter = Boolean(report.raisedById && node?.descendants?.has(report.raisedById));
  const holdsSubject = Boolean(report.subjectKind === 'person' && report.subjectPersonId && node?.descendants?.has(report.subjectPersonId));
  if (holdsReporter || holdsSubject) return { detail: 'summary', reason: null };
  return {
    detail: 'counted',
    reason: report.raisedById ? SPEAK_UP_WITHHOLD_REASONS.outsideSpan : SPEAK_UP_WITHHOLD_REASONS.unnamed,
  };
}

/**
 * The state of one concern, decided in the register's declared order. Returns the
 * state and the separate sub-clocks, because the state is the headline and the
 * three clocks are three distinct facts.
 */
export function speakUpStateOf(report, acts, { today, ackDays, feedbackDays, watchDays }) {
  const ack = firstActOfKind(acts, report.id, 'acknowledged');
  const outcome = firstActOfKind(acts, report.id, 'outcome');
  const watch = firstActOfKind(acts, report.id, 'watch');
  const closed = firstActOfKind(acts, report.id, 'closed');
  const withdrawn = firstActOfKind(acts, report.id, 'withdrawn');

  const ackWindow = Number.isInteger(report.ackDays) ? report.ackDays : ackDays;
  const feedbackWindow = Number.isInteger(report.feedbackDays) ? report.feedbackDays : feedbackDays;
  const watchWindow = Number.isInteger(report.watchDays) ? report.watchDays : watchDays;

  const ackDueOn = addDays(report.raisedOn, ackWindow);
  const feedbackDueOn = ack ? addDays(ack.on, feedbackWindow) : null;
  const watchDueOn = outcome ? addDays(outcome.on, watchWindow) : null;

  let stateKey;
  if (withdrawn) stateKey = 'withdrawn';
  else if (report.routeKey === 'none-available') stateKey = 'no-impartial-route';
  else if (report.routeKey === 'external-declared') stateKey = 'external-referred';
  else if (!ack) stateKey = today > ackDueOn ? 'ack-overdue' : 'unacknowledged';
  else if (!outcome) stateKey = today > feedbackDueOn ? 'feedback-overdue' : 'acknowledged';
  else if (closed) stateKey = 'closed';
  else if (watch) stateKey = 'watched';
  else if (today > watchDueOn) stateKey = 'watch-overdue';
  else stateKey = 'outcome-recorded';

  // The sub-clocks, kept apart from the headline state on purpose.
  let watchState;
  if (withdrawn || report.routeKey !== 'internal-person') watchState = 'none';
  else if (watch) watchState = 'checked';
  else if (!outcome) watchState = 'pending';
  else if (closed) watchState = 'skipped-by-close';
  else if (today > watchDueOn) watchState = 'overdue';
  else watchState = 'running';

  return {
    stateKey,
    ackDueOn,
    feedbackDueOn,
    watchDueOn,
    ack,
    outcome,
    watch,
    closed,
    withdrawn,
    watchState,
    windows: { ackDays: ackWindow, feedbackDays: feedbackWindow, watchDays: watchWindow },
  };
}

/** A stable, opaque display reference. The stored id never reaches a screen. */
const refOf = (rows, id) => {
  const index = rows.findIndex((row) => row.id === id);
  return index < 0 ? 'REF-?' : `REF-${String(index + 1).padStart(3, '0')}`;
};

export function buildSpeakUpReport(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at);
  const effective = settings || state?.settings || {};
  const conventions = readSpeakUpSettings({ settings: effective });

  const reports = normalizeConcernReports(state?.concernReports, []);
  const acts = normalizeConcernActs(state?.concernActs, reports, []);

  let matrix = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...effective, activeSeatId: null } });
  } catch {
    matrix = null;
  }
  const personId = seat && !seat.fullAccess ? (seat.nodeId || seat.id || null) : null;

  const rows = reports.map((report) => {
    const life = speakUpStateOf(report, acts, { today, ...conventions });
    const stateRow = SPEAK_UP_STATE_BY_KEY[life.stateKey] || { label: life.stateKey, tone: 'neutral', says: '' };
    const disclosure = detailFor(report, { seat, matrix, personId });
    const full = disclosure.detail === 'full';

    // Recompute the receiver's impartiality against TODAY's graph.
    const routeImpartiality = report.routeKey === 'internal-person'
      ? impartialityVerdict(matrix, {
        receiverId: report.receiverId,
        subjectPersonId: report.subjectKind === 'person' ? report.subjectPersonId : null,
        reporterId: report.raisedById || null,
      })
      : { impartial: null, reason: null };
    const drifted = routeImpartiality.impartial === false;

    const windowsMoved = life.windows.ackDays !== conventions.ackDays
      || life.windows.feedbackDays !== conventions.feedbackDays
      || life.windows.watchDays !== conventions.watchDays;

    const openActs = acts.filter((act) => act.reportId === report.id);
    return {
      id: report.id,
      ref: refOf(reports, report.id),
      stateKey: life.stateKey,
      stateLabel: stateRow.label,
      tone: stateRow.tone,
      stateSays: stateRow.says,
      detail: disclosure.detail,
      detailReason: disclosure.reason,
      raisedOn: report.raisedOn,
      daysOpen: Math.max(0, speakUpDaysBetween(report.raisedOn, today) || 0),
      ackDueOn: life.ackDueOn,
      feedbackDueOn: life.feedbackDueOn,
      watchDueOn: life.watchDueOn,
      ackOn: life.ack?.on || null,
      outcomeOn: life.outcome?.on || null,
      watchOn: life.watch?.on || null,
      acknowledgedLate: Boolean(life.ack && life.ack.on > life.ackDueOn),
      resolvedLate: Boolean(life.outcome && life.outcome.on > life.feedbackDueOn),
      categoryKey: report.categoryKey,
      categoryLabel: (speakUpCategoryByKey(report.categoryKey) || {}).label || report.categoryKey,
      routeKey: report.routeKey,
      routeLabel: (speakUpRouteByKey(report.routeKey) || {}).label || report.routeKey,
      subjectKind: report.subjectKind,
      subjectRef: full ? report.subjectLabel || speakUpNameOf(state, report.subjectPersonId) : null,
      subjectName: full && report.subjectKind === 'person' ? speakUpNameOf(state, report.subjectPersonId) : null,
      reporterName: full && report.raisedById ? speakUpNameOf(state, report.raisedById) : null,
      reporterStated: Boolean(report.raisedById),
      receiverRef: full ? speakUpNameOf(state, report.receiverId) : null,
      receiverId: full ? report.receiverId : null,
      receiverIdPresent: Boolean(report.receiverId),
      receiverRoles: routeImpartiality.roles || { managesSubject: false, managesReporter: false },
      receiverRoleLabel: routeImpartiality.impartial
        ? (routeImpartiality.roles?.managesSubject ? 'escalation route — this receiver manages the subject'
          : routeImpartiality.roles?.managesReporter ? 'this receiver manages the reporter on a line' : null)
        : null,
      receiverImpartial: routeImpartiality.impartial,
      receiverDriftReason: drifted ? routeImpartiality.reason : null,
      receiverDriftLabel: drifted ? ((SPEAK_UP_REFUSALS.find((row) => row.key === routeImpartiality.reason) || {}).says || routeImpartiality.reason) : null,
      externalLabel: full ? report.externalLabel : null,
      summary: full ? report.summary : null,
      channelBasis: full ? report.channelBasis : null,
      outcomeKey: full ? (life.outcome?.outcomeKey || null) : null,
      outcomeLabel: full && life.outcome ? ((speakUpOutcomeByKey(life.outcome.outcomeKey) || {}).label || life.outcome.outcomeKey) : null,
      watchVerdictKey: life.watch?.verdictKey || null,
      watchVerdictLabel: life.watch ? ((speakUpWatchByKey(life.watch.verdictKey) || {}).label || life.watch.verdictKey) : null,
      watchState: life.watchState,
      windows: life.windows,
      windowsMoved,
      acts: full ? openActs.map((act) => ({
        id: act.id,
        kind: act.kind,
        on: act.on,
        byRef: speakUpNameOf(state, act.byId),
        outcomeKey: act.outcomeKey,
        verdictKey: act.verdictKey,
        note: act.note,
      })) : [],
      actsN: openActs.length,
      /** What this seat may do about this row, proved again in the action. */
      canAnswer: Boolean(seat && !seat.fullAccess && personId && personId === report.receiverId && report.routeKey === 'internal-person'),
      canWithdraw: Boolean(seat && ((personId && personId === report.raisedById) || seat.fullAccess)),
    };
  });

  /* ------------------------------------------------------------------ totals */
  const byState = {};
  const byCategory = {};
  const byRoute = {};
  for (const row of rows) {
    byState[row.stateKey] = (byState[row.stateKey] || 0) + 1;
    byCategory[row.categoryKey] = (byCategory[row.categoryKey] || 0) + 1;
    byRoute[row.routeKey] = (byRoute[row.routeKey] || 0) + 1;
  }
  const sumStates = Object.values(byState).reduce((a, b) => a + b, 0);
  const liveN = rows.filter((row) => row.stateKey !== 'withdrawn').length;
  const overdueN = rows.filter((row) => ['ack-overdue', 'feedback-overdue', 'watch-overdue'].includes(row.stateKey)).length;
  const ackOverdueN = byState['ack-overdue'] || 0;
  const feedbackOverdueN = byState['feedback-overdue'] || 0;
  const watchOverdueN = byState['watch-overdue'] || 0;
  const noRouteN = rows.filter((row) => row.stateKey === 'no-impartial-route').length;
  const driftedN = rows.filter((row) => row.receiverImpartial === false).length;
  const withheldN = rows.filter((row) => row.detail === 'counted').length;

  /* ----------------------------------------------------------------- latency */
  const ackLatencies = rows
    .filter((row) => row.ackOn)
    .map((row) => speakUpDaysBetween(row.raisedOn, row.ackOn))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
  const latency = ackLatencies.length >= L.latencyFloorN
    ? { n: ackLatencies.length, medianDays: ackLatencies[Math.floor((ackLatencies.length - 1) / 2)], withheldReason: null, rule: 'lower median' }
    : {
      n: ackLatencies.length,
      medianDays: null,
      withheldReason: `withheld: ${ackLatencies.length} acknowledged concern(s) is below the declared floor of ${L.latencyFloorN}; a median of one or two is a description of the sample, not a service level`,
      rule: null,
    };

  /* ------------------------------------------------------------ the two claims */
  const balances = sumStates === rows.length;
  const auditClean = balances && rows.every((row) => Boolean(SPEAK_UP_STATE_BY_KEY[row.stateKey]));
  const claimReason = auditClean
    ? `The ${rows.length} printed row(s) are the ${sumStates} row(s) the state counts add up to, and every state is one the register declares. ${noRouteN} concern(s) have no impartial route and ${driftedN} named a receiver who is no longer impartial; both are counted above the rows rather than folded into them.`
    : `A claim on this page does not reconcile: ${sumStates} counted state(s) against ${rows.length} printed row(s). No total on this page should be relied on until the record is corrected.`;

  /* ------------------------------------------------------------- routes board */
  const liveRows = rows.filter((row) => !['withdrawn', 'closed'].includes(row.stateKey));
  const routesRows = liveRows.map((row) => {
    const source = reports.find((report) => report.id === row.id);
    const board = speakUpCandidates(matrix, {
      subjectPersonId: source?.subjectKind === 'person' ? source.subjectPersonId : null,
      reporterId: source?.raisedById || null,
    });
    return {
      ref: row.ref,
      stateKey: row.stateKey,
      categoryLabel: row.categoryLabel,
      routeKey: row.routeKey,
      candidatesN: board.candidates.length,
      excludedN: board.excludedN,
      excluded: board.excluded.map((row2) => ({ reason: row2.reason, count: row2.count })),
      noRoute: row.stateKey === 'no-impartial-route',
      drifted: row.receiverImpartial === false,
      driftReason: row.receiverDriftReason,
    };
  });

  return {
    engineVersion: SPEAK_UP_ENGINE_VERSION,
    adr: SPEAK_UP_ADR,
    asOf: today,
    conventions,
    seat: seat ? {
      rank: seat.rank,
      label: seat.label,
      fullAccess: Boolean(seat.fullAccess),
      personId,
      canGovern: Boolean(seat.rank >= 3),
      canRaise: true,
      canAnswer: rows.some((row) => row.canAnswer),
    } : { rank: 5, label: 'Workspace operator', fullAccess: true, personId: null, canGovern: true, canRaise: true, canAnswer: false },
    rows,
    rowById: new Map(rows.map((row) => [row.id, row])),
    totals: { reports: rows.length, live: liveN, byState, byCategory, byRoute, sumStates },
    overdueN,
    ackOverdueN,
    feedbackOverdueN,
    watchOverdueN,
    noRouteN,
    driftedN,
    withheldN,
    latency,
    routesRows,
    balances,
    auditClean,
    claimReason,
    candidatesFor(matrix, input) {
      const board = speakUpCandidates(matrix, {
        subjectPersonId: input?.subjectKind === 'person' && input.subjectPersonId ? input.subjectPersonId : null,
        reporterId: input?.reporterId || null,
      });
      return {
        ...board,
        candidatesNamed: board.candidates.map((row) => ({ ...row, name: speakUpNameOf(state, row.id) })),
        excludedNamed: board.excluded.map((row) => ({
          reason: row.reason,
          count: row.count,
          label: (SPEAK_UP_REFUSALS.find((item) => item.key === row.reason) || {}).says || row.reason,
        })),
      };
    },
    matrix,
  };
}

/**
 * The nav badge. A COUNT of declared work owed — an acknowledgement window that
 * passed, a feedback window that passed, a watch window that closed with no
 * check, a concern with no route, and a receiver who is no longer impartial. It
 * reads no party's name and builds no sentence: opening the register is what
 * reads the record.
 */
export function speakUpAttentionCount(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const reports = normalizeConcernReports(state?.concernReports, []);
  if (!reports.length) return 0;
  const report = buildSpeakUpReport(state, { now, settings, seat });
  return report.overdueN + report.noRouteN + report.driftedN;
}

/** An identity-free brief: what the register holds, in counts, with no names. */
export function speakUpBriefText(report) {
  if (!report) return 'The speak-up register could not be read.';
  const lines = [];
  lines.push(`Speak-up register — ${report.asOf} (${report.engineVersion}, ${report.adr})`);
  lines.push(`Concerns on the record: ${report.totals.reports} (${report.totals.live} live, ${report.totals.reports - report.totals.live} withdrawn).`);
  lines.push(`Overdue: ${report.overdueN} — acknowledgement ${report.ackOverdueN}, outcome ${report.feedbackOverdueN}, retaliation check ${report.watchOverdueN}.`);
  lines.push(`No impartial internal route: ${report.noRouteN}. Named receiver no longer impartial: ${report.driftedN}.`);
  lines.push(`Acknowledgement latency: ${report.latency.medianDays !== null ? `${report.latency.medianDays} day(s) (${report.latency.rule}, n=${report.latency.n})` : report.latency.withheldReason}.`);
  const states = Object.entries(report.totals.byState).sort((a, b) => a[0].localeCompare(b[0]));
  lines.push(`States: ${states.map(([key, n]) => `${key}=${n}`).join(', ') || 'none'}.`);
  lines.push('This brief carries no reporter, no subject, no receiver, no summary and no date of any concern. It records that a channel ran and what it owed — not who said what about whom.');
  return lines.join('\n');
}

/**
 * Aggregate CSV rows — the ONLY export of this register. One summary row plus one
 * row per (category × route × state) bucket. No name, no id, no date, no text.
 */
export function speakUpCsvRows(report) {
  if (!report) return [];
  const base = {
    as_of: report.asOf,
    ack_days_declared: report.conventions.ackDays,
    feedback_days_declared: report.conventions.feedbackDays,
    watch_days_declared: report.conventions.watchDays,
    figures_complete: report.auditClean ? 'true' : 'false',
    counts_reconcile: report.balances ? 'true' : 'false',
  };
  const rows = [{
    ...base,
    category: '',
    route_kind: '',
    state_key: '',
    state_count: report.totals.sumStates,
    concerns_total: report.totals.reports,
    concerns_live: report.totals.live,
    overdue_count: report.overdueN,
    no_impartial_route_count: report.noRouteN,
    receiver_drifted_count: report.driftedN,
  }];
  const buckets = new Map();
  for (const row of report.rows) {
    const key = `${row.categoryKey}|${row.routeKey}|${row.stateKey}`;
    const cell = buckets.get(key) || { category: row.categoryKey, route_kind: row.routeKey, state_key: row.stateKey, state_count: 0 };
    cell.state_count += 1;
    buckets.set(key, cell);
  }
  for (const cell of [...buckets.values()].sort((a, b) => a.category.localeCompare(b.category)
    || a.route_kind.localeCompare(b.route_kind) || a.state_key.localeCompare(b.state_key))) {
    rows.push({
      ...base,
      category: cell.category,
      route_kind: cell.route_kind,
      state_key: cell.state_key,
      state_count: cell.state_count,
      concerns_total: report.totals.reports,
      concerns_live: report.totals.live,
      overdue_count: '',
      no_impartial_route_count: '',
      receiver_drifted_count: '',
    });
  }
  return rows;
}
