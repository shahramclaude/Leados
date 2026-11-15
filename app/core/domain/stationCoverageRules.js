/**
 * app/core/domain/stationCoverageRules.js — `RULE-SSC-01` on the shared
 * post-commit spine (ADR-0201, Schema v157).
 *
 * TWO CONDITIONS PLUS THE ADR-0204 PRECEDENCE CONDITION, all read from the one
 * reader (`buildStationCoverage`) with the whole-workspace view and never
 * re-derived here:
 *
 *   1. `proven-shortage` — a window's simultaneous demand is PROVEN infeasible:
 *      the exact deficient set is known and nobody in the pool is silent. ONE
 *      dated ask goes to the LOWEST JOINT APEX of the deficient stations'
 *      holders, because no single holder can fix a shortage that spans their
 *      line. The ask names the exact deficit and the stations, and asks for a
 *      human decision — add a qualified person, move the station, reduce the
 *      declared demand, or declare that the window will run short. It never
 *      suggests a person, never assigns one and never reschedules.
 *   2. `unproven-consent` — a window's simultaneous set cannot be proven either
 *      way because qualified people made no availability statement. ONE dated
 *      ask goes to that window's holder to obtain the statements. Silence is
 *      the condition, and the ask is about the silence — not about the person.
 *   3. `precedence-cycle` (ADR-0204) — a window carries an enabling cycle with
 *      at least one sequential member: no running order exists whatever anyone
 *      is assigned. ONE dated ask goes to that window's own holder (a
 *      declaration contradiction is theirs to repair — only the declarer can
 *      retire an edge or a station), naming the cycle's stations and the
 *      permissible answers: retire one enabling declaration, or retire or
 *      re-declare one station. Co-requisite loops (all-concurrent cycles) are
 *      satisfiable by the shared instant and are never asked about.
 *
 * WHAT IT NEVER DOES. It never assigns, schedules, or fills a station; never
 * infers availability or consent; never picks a station's own holder as the
 * answer to a cross-line shortage; never asks about a window that has already
 * passed; never re-asks a condition a human closed while it stands; and never
 * rates a person. Where no single roster seat holds the finding — the apex is
 * the workspace leader, unresolved, or off the roster — it records ONE
 * identity-free `matrixMarkers` observation and files nothing.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * matrix-DAG `rolls-up-to` provenance. Idempotent per condition signature,
 * self-closing when the condition clears or its seat moves, bounded per commit
 * with the remainder counted, and paused on EVERY path including an explicit
 * scan (`stationCoverageAutoPropagate`).
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { matrixJointApex } from './matrix.js';
import { buildStationCoverage } from './stationCoverage.js';
import {
  STATION_COVERAGE_CLOSED_PREFIX,
  STATION_COVERAGE_LIMITS,
  STATION_COVERAGE_MARKER_KIND,
  STATION_COVERAGE_ROUTE,
  STATION_COVERAGE_RULE_ID,
  STATION_COVERAGE_SETTING_KEYS,
} from './stationCoverageRegistry.js';
import {
  normalizeStationCoverageSettings,
  parseStationCoverageAskSummary,
  stationCoverageAskSummary,
  stationCoverageSignature,
} from './stationCoverageSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: STATION_COVERAGE_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: STATION_COVERAGE_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${STATION_COVERAGE_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexStationCoverageAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : [])
    .filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== STATION_COVERAGE_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseStationCoverageAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Each carries the seat that owes an
 * answer and whether a roster seat can be asked at all.
 */
export function stationCoverageConditions(report) {
  const { matrix } = report.internal;
  const seatOf = (id) => (id === LEADER_ID ? 'leader-held' : matrix.roster.has(id) ? 'seat' : 'off-roster');
  // `report.conventions` is the READER's own shape (plain names); the settings
  // keys are a different namespace and indexing one with the other silently
  // yields `undefined` — which is how a due date becomes Invalid Date.
  const on = report.conventions.askDays;
  const out = [];
  for (const row of report.windows) {
    // A past shift is history, not a duty. Nobody is asked to staff yesterday.
    if (row.past) continue;
    if (row.verdict === 'infeasible' && row.witness) {
      // The holders of the deficient stations are the seats that must answer.
      const holderIds = [...new Set(row.stations
        .filter((s) => row.witness.stationIds.includes(s.stationId))
        .map((s) => s.holderId))].sort();
      const apex = matrixJointApex(matrix, holderIds);
      const seatState = apex.unique ? seatOf(apex.apexId) : apex.disconnected ? 'off-roster' : 'unresolved';
      const stationList = row.witness.stationTitles.map((t) => `“${clip(t, 60)}”`).join(', ');
      out.push({
        kind: 'proven-shortage',
        signature: stationCoverageSignature('proven-shortage', [row.windowId, row.witness.stationIds.slice().sort().join('+'), row.witness.deficitN]),
        seatState,
        seatId: seatState === 'seat' ? apex.apexId : null,
        dueOn: addDays(report.today, on),
        title: `Simultaneous staffing cannot be met: ${stationList}`,
        expectedOutcome: `In the window “${clip(row.label, 80)}” (${row.fromDay} → ${row.toDay}) the stations ${stationList} declare ${row.witness.demandN} person(s) between them, but only ${row.witness.peopleN} qualified, available person(s) can serve any of them — ${row.witness.capacityN} concurrent place(s) in total. The exact deficit is ${row.witness.deficitN}. This is a proof that no legal assignment exists, not a percentage: whoever is scheduled, one of these stations runs unmanned. On #/${STATION_COVERAGE_ROUTE}?panel=stations, record ONE human decision: add a qualified and available person, move or drop a station from the window, reduce the declared headcount, or declare in writing that the window will run short. This ask closes itself when the window stops being provably short. It does not name a person to move and is not a finding about anyone’s performance.`,
        observation: `A simultaneous window holds a proven staffing deficit (${row.witness.deficitN}).`,
      });
    } else if (row.verdict === 'unproven' && row.undeclaredN > 0 && report.clean) {
      const seatState = seatOf(row.holderId);
      out.push({
        kind: 'unproven-consent',
        signature: stationCoverageSignature('unproven-consent', [row.windowId, row.undeclaredN]),
        seatState,
        seatId: seatState === 'seat' ? row.holderId : null,
        dueOn: addDays(report.today, on),
        title: `Obtain availability statements for “${clip(row.label, 90)}”`,
        expectedOutcome: `${row.undeclaredN} qualified person(s) in the window “${clip(row.label, 80)}” (${row.fromDay} → ${row.toDay}) have made no availability statement, so whether its ${row.concurrentN} simultaneous station(s) can be manned cannot be proven either way. On #/${STATION_COVERAGE_ROUTE}?panel=stations, obtain and record each person’s own availability (or your own statement as their line holder, which is printed as yours). Silence is not unavailability and it is not consent; the register refuses to assume either. This ask closes itself when the statements are on record.`,
        observation: `A simultaneous window cannot be proven because availability statements are missing.`,
      });
    }
    if (row.precedence && row.precedence.unsatisfiableCyclesN > 0) {
      // A declaration contradiction is the window holder's to repair — only
      // the declarer may retire an edge or a station. One ask per cycle.
      const seatState = seatOf(row.holderId);
      for (const cycle of row.precedence.cycles.filter((c) => c.unsatisfiable)) {
        const cycleList = (cycle.stationTitles || cycle.stationIds).map((t) => `“${clip(t, 60)}”`).join(' → ');
        out.push({
          kind: 'precedence-cycle',
          signature: stationCoverageSignature('precedence-cycle', [row.windowId, cycle.stationIds.slice().sort().join('+')]),
          seatState,
          seatId: seatState === 'seat' ? row.holderId : null,
          dueOn: addDays(report.today, on),
          title: `Resolve the enabling cycle in “${clip(row.label, 90)}”`,
          expectedOutcome: `In the window “${clip(row.label, 80)}” (${row.fromDay} → ${row.toDay}) the enabling declarations form a cycle: ${cycleList} → ${clip((cycle.stationTitles || cycle.stationIds)[0], 60)}. At least one member is sequential, so no running order exists whatever anyone is assigned — this is a contradiction in the declarations, not a shortage of people. On #/${STATION_COVERAGE_ROUTE}?panel=stations, record ONE human decision: retire one enabling declaration in the cycle (with a written reason), or retire or re-declare one of the stations — or, if the declared requirements are what is wrong, re-declare the member as concurrent, knowing that the shared simultaneous instant is the only place it can then run. This ask closes itself when no unsatisfiable cycle remains on the record. It does not name a person and it is not a finding about anyone’s performance.`,
          observation: `A simultaneous window carries an enabling cycle with at least one sequential member; no running order exists.`,
        });
      }
    }
  }
  return out;
}

export function stationCoverageRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can
  // move a station, a statement, a line, a roster seat or the calendar.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith('stations.'))) return [];

  const conv = normalizeStationCoverageSettings(draft.settings || {});
  if (conv[STATION_COVERAGE_SETTING_KEYS.autoPropagate] === false) return [];
  if (!Array.isArray(draft.stationWindows) || !draft.stationWindows.length) return [];
  if (!Array.isArray(draft.skillStations) || !draft.skillStations.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    report = buildStationCoverage(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }
  const { matrix } = report.internal;
  const conditions = stationCoverageConditions(report);
  const existing = indexStationCoverageAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((c) => [c.signature, c]));

  /* 1. Close asks whose condition cleared or whose accountable seat moved. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = condition
      ? `${STATION_COVERAGE_CLOSED_PREFIX} the seat this condition is owed to changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${STATION_COVERAGE_CLOSED_PREFIX} the station-coverage register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id,
      condition ? 'Closed a station-coverage ask: the accountable seat changed.' : 'Closed a station-coverage ask: the condition cleared.');
  }

  /* 2. File one bounded dated ask per condition a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `${STATION_COVERAGE_MARKER_KIND}|obs|${condition.signature}|${condition.seatState}`;
      draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
      if (!draft.matrixMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'It is owned by the workspace leader and is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'The line it belongs to is no longer held by anyone on the active roster; nobody was substituted.'
            : 'The stations are held by managers with no single common apex on the reporting graph; nobody was asked on a guess.';
        const detail = `${condition.observation} ${why}`;
        draft.matrixMarkers.push({ key, at: nowIso, ruleId: STATION_COVERAGE_RULE_ID, kind: STATION_COVERAGE_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', STATION_COVERAGE_ROUTE, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(STATION_COVERAGE_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= STATION_COVERAGE_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${STATION_COVERAGE_RULE_ID} from the station-coverage register (#/${STATION_COVERAGE_ROUTE}?panel=stations). It reads declared stations, attested qualifications and dated availability statements only; it is not a rating and it assigns nobody.`,
      delegatedOn: today,
      dueOn: condition.dueOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    ensureEntityLink(draft, {
      sourceType: 'person', sourceId: condition.seatId, targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: STATION_COVERAGE_RULE_ID, summary: stationCoverageAskSummary(condition.signature),
    }, linkCtx);
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: STATION_COVERAGE_RULE_ID, summary: 'A station-coverage ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'proven-shortage'
        ? `Asked the joint apex of a provably short simultaneous window to decide, due ${condition.dueOn}.`
        : `Asked a window’s holder to obtain the availability statements that make it provable, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', STATION_COVERAGE_ROUTE,
      `${deferred} station-coverage ask(s) were deferred (cap ${STATION_COVERAGE_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

stationCoverageRule.id = 'stationCoverageRule';

export default stationCoverageRule;
