/**
 * app/core/domain/stationCoverage.js — the pure read model for Skill-Constrained
 * Simultaneous Station Coverage (ADR-0201, Schema v157,
 * `#/standard-work?panel=stations`, RULE-SSC-01, CSV #148).
 *
 * ONE reader. The panel, the brief, the CSV and RULE-SSC-01 all read
 * `buildStationCoverage`; none of them computes a verdict, a state or a deficit
 * of its own. Nothing here writes.
 *
 * THE QUESTION THIS ANSWERS, WHICH NOTHING ELSE IN THE WORKSPACE COULD.
 * ADR-0192's coverage reader counts qualified people per task and states its own
 * boundary: "Task coverage is not simultaneous staffing, availability, capacity
 * or consent." So two stations can each be individually 'covered' and still be
 * impossible to run at the same time, because the one person both of them count
 * on cannot be at both. This reader decides that question exactly:
 *
 *   Assign people to stations so that (a) every station gets its declared
 *   integer headcount, (b) only people whose live unexpired ILUO attestation
 *   names the station's task may serve it, (c) only people who declared
 *   availability covering the whole window are used, and (d) no person holds
 *   more stations at once than the capacity they declared.
 *
 * It is a capacitated bipartite feasibility problem, decided by exact integer
 * maximum flow. When no assignment exists the reader prints the DEFICIENT SET —
 * the actual subset of stations whose combined demand exceeds the total capacity
 * of everyone able to serve any of them, with the exact integer deficit. That is
 * Hall's condition failing, and it is evidence a leader can act on; a percentage
 * or a red badge would not be.
 *
 * WHAT IT REFUSES TO CLAIM (the bulletproof mandate, applied literally):
 *  - It never reads a person who declared nothing as unavailable. Silence is
 *    UNKNOWN. A shortage is therefore only printed as `infeasible` when every
 *    qualified person in the window's pools has made a statement; otherwise the
 *    window is `unproven` and the count of undeclared people is printed.
 *  - It never infers availability, consent, demand, qualification or allocation.
 *  - It never assigns anybody, never schedules, never fills a station, and never
 *    rates a person.
 *  - It never sums span roll-ups: spans nest and, in a matrix, overlap.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import { normalizeSkillTasks, normalizeSkillActs } from './skillCoverageSchema.js';
import {
  STATION_COVERAGE_ENGINE_VERSION,
  STATION_COVERAGE_LIMITS,
  STATION_COVERAGE_SETTING_KEYS,
  STATION_COVERAGE_STATION_STATES,
  STATION_COVERAGE_VERDICTS,
} from './stationCoverageRegistry.js';
import {
  normalizeSkillStationRows,
  normalizeStationAvailability,
  normalizeStationCoverageSettings,
  normalizeStationWindows,
  stationCoverageDay,
  stationCoverageDays,
} from './stationCoverageSchema.js';

const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
const VERDICT = byKey(STATION_COVERAGE_VERDICTS);
const STATE = byKey(STATION_COVERAGE_STATION_STATES);
const list = (v) => (Array.isArray(v) ? v : []);
const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------- exact integer flow */

/**
 * Dinic's algorithm over an integer network. Returns the flow value and the set
 * of node indices reachable from the source in the residual graph — the latter
 * is the min-cut, and it is what makes the deficient set a proof rather than a
 * guess. All capacities are integers, so no rounding enters the arithmetic.
 */
function maxFlowInt(n, edges, source, sink) {
  const to = [];
  const cap = [];
  const next = Array.from({ length: n }, () => []);
  const add = (u, v, c) => {
    next[u].push(to.length); to.push(v); cap.push(c);
    next[v].push(to.length); to.push(u); cap.push(0);
  };
  for (const [u, v, c] of edges) if (c > 0) add(u, v, c);
  const level = new Int32Array(n);
  const iter = new Int32Array(n);
  let flow = 0;
  for (;;) {
    level.fill(-1);
    level[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head];
      for (const e of next[u]) if (cap[e] > 0 && level[to[e]] < 0) { level[to[e]] = level[u] + 1; queue.push(to[e]); }
    }
    if (level[sink] < 0) break;
    iter.fill(0);
    const dfs = (u, limit) => {
      if (u === sink) return limit;
      for (; iter[u] < next[u].length; iter[u] += 1) {
        const e = next[u][iter[u]];
        const v = to[e];
        if (cap[e] <= 0 || level[v] !== level[u] + 1) continue;
        const pushed = dfs(v, Math.min(limit, cap[e]));
        if (pushed > 0) { cap[e] -= pushed; cap[e ^ 1] += pushed; return pushed; }
      }
      return 0;
    };
    for (;;) {
      const pushed = dfs(source, Number.MAX_SAFE_INTEGER);
      if (pushed <= 0) break;
      flow += pushed;
    }
  }
  // Residual reachability from the source — the source side of the min cut.
  const seen = new Uint8Array(n);
  seen[source] = 1;
  const stack = [source];
  while (stack.length) {
    const u = stack.pop();
    for (const e of next[u]) if (cap[e] > 0 && !seen[to[e]]) { seen[to[e]] = 1; stack.push(to[e]); }
  }
  return { flow, reachable: seen };
}

/* ------------------------------------------------------------------- helpers */

const qualifiedNow = (acts, tasks, today) => {
  const latest = new Map();
  for (const act of acts) {
    if (act.invalid) continue;
    latest.set(JSON.stringify([act.taskId, act.personId]), act);
  }
  const out = new Map(); // taskId -> Set(personId)
  for (const [key, act] of latest) {
    if (act.level !== 'U' && act.level !== 'O') continue;
    if (!(act.expiresOn && act.expiresOn >= today)) continue;
    if (!tasks.some((t) => t.id === act.taskId)) continue;
    const [taskId] = JSON.parse(key);
    if (!out.has(taskId)) out.set(taskId, new Set());
    out.get(taskId).add(act.personId);
  }
  return out;
};

/** The live, covering availability statement for a person in a window, or null. */
function availabilityFor(rows, personId, window) {
  const covering = rows.filter((r) => !r.invalid && !r.withdrawnAt && r.personId === personId && r.windowId === window.id
    && r.fromDay <= window.fromDay && r.toDay >= window.toDay);
  if (!covering.length) return null;
  // The schema refuses two live statements for one person and window, so there
  // is exactly one here; the guard is defensive, never a choice between rows.
  return covering.length === 1 ? covering[0] : { ambiguous: true, capacity: 0 };
}

/* -------------------------------------------------------------------- reader */

export function buildStationCoverage(state, { now = new Date(), seat = null } = {}) {
  const today = dayKey(now) || new Date(now).toISOString().slice(0, 10);
  const matrix = buildMatrix(state, { now, settings: state?.settings || null });
  const conv = normalizeStationCoverageSettings(state?.settings || {});
  const floorN = Math.max(Number(conv[STATION_COVERAGE_SETTING_KEYS.disclosureFloorN]) || 0, Number(seat?.disclosure?.floorN) || 0);
  const warnings = [];

  const tasks = normalizeSkillTasks(state?.skillTasks, warnings);
  const acts = normalizeSkillActs(state?.skillActs, tasks, warnings);
  const qualifiedByTask = qualifiedNow(acts, tasks, today);

  const windows = normalizeStationWindows(state?.stationWindows, warnings);
  const stations = normalizeSkillStationRows(state?.skillStations, windows, warnings);
  const availability = normalizeStationAvailability(state?.stationAvailability,
    { windows, stations, people: matrix.roster }, warnings);

  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([actorId, ...list(seat.scope), ...list(seat.lineScope)]);
  const visible = (nodeId) => operator || reach.has(nodeId);

  const invalidN = [...windows, ...stations, ...availability].filter((r) => r.invalid).length;
  const futureN = [...windows, ...stations, ...availability].flatMap((r) => [r.declaredAt, r.withdrawnAt])
    .filter((v) => typeof v === 'string' && v > now.toISOString()).length;

  const globalReasons = [];
  if (seat?.readOnly) globalReasons.push('The operating seat is unresolved.');
  if (matrix.defects.length) globalReasons.push(`${matrix.defects.length} reporting-graph defect(s); a station’s pool cannot be proved complete.`);
  if (invalidN) globalReasons.push(`${invalidN} invalid ledger row(s) retained; no feasibility is claimed from a register that cannot be read exactly.`);
  if (futureN) globalReasons.push(`${futureN} future-dated ledger row(s); evidence dated after this clock is not present evidence.`);
  const clean = globalReasons.length === 0;

  const poolOf = (holderId) => new Set(matrix.lines
    .filter((l) => l.managerId === holderId && matrix.roster.has(l.personId))
    .map((l) => l.personId));

  /* ---------------------------------------------------------- per window */

  const windowRows = [];
  for (const window of windows) {
    if (window.invalid) continue;
    if (!visible(window.holderId)) continue;
    const holderOn = window.holderId === LEADER_ID || matrix.roster.has(window.holderId);
    const holderName = matrix.nodes.get(window.holderId)?.name || 'Holder off roster';
    const mine = stations.filter((s) => !s.invalid && s.windowId === window.id);
    const retired = (s) => Boolean(s.retiredOn && s.retiredOn <= today);
    const live = mine.filter((s) => !retired(s));
    const retiredN = mine.length - live.length;
    const concurrent = live.filter((s) => s.requirement === 'concurrent');
    const sequential = live.filter((s) => s.requirement === 'sequential');
    const reasons = [];
    if (!clean) reasons.push(...globalReasons);
    if (!holderOn) reasons.push('The window’s holder is no longer on the active roster; nobody is substituted.');

    // Every station's own reading, computed from the same pool/qualification
    // data the flow uses, so the printed state can never disagree with it.
    const stationRows = live.map((station) => {
      const pool = poolOf(station.holderId);
      const qualified = new Set([...(qualifiedByTask.get(station.taskId) || [])].filter((p) => pool.has(p)));
      const available = new Set([...qualified].filter((p) => availabilityFor(availability, p, window)));
      const undeclared = [...qualified].filter((p) => !availabilityFor(availability, p, window));
      const detail = operator || actorId === station.holderId;
      const detailWithheld = !detail && pool.size < floorN;
      const refused = !clean || !holderOn || detailWithheld || !pool.size;
      let state;
      if (detailWithheld) state = 'withheld';
      else if (!clean || !holderOn) state = 'refused';
      else if (!pool.size) state = 'no-qualified';
      else if (!qualified.size) state = 'no-qualified';
      else if (!available.size) state = 'no-available';
      else if (available.size < station.demand) state = 'short';
      else if (available.size === 1) state = 'single-point';
      else if (available.size === station.demand) state = 'exact';
      else state = 'covered';
      return {
        stationId: station.id,
        windowId: window.id,
        holderId: station.holderId,
        holderName,
        title: station.title,
        standard: station.standard,
        requirement: station.requirement,
        taskId: station.taskId,
        taskTitle: tasks.find((t) => t.id === station.taskId)?.title || 'Task not on the register',
        demand: station.demand,
        poolN: pool.size,
        qualifiedN: refused ? null : qualified.size,
        availableN: refused ? null : available.size,
        undeclaredN: refused ? null : undeclared.length,
        undeclaredNames: detail && !refused ? undeclared.map((p) => matrix.nodes.get(p)?.name || 'Name unavailable') : null,
        state: refused && state !== 'withheld' ? 'refused' : state,
        detail,
        canWrite: clean && actorId === station.holderId && holderOn && !seat?.readOnly,
        reason: detailWithheld
          ? `The pool holds ${pool.size} person(s), below the disclosure floor of ${floorN}; individual coverage is withheld from an ancestor view.`
          : !clean ? globalReasons.join(' ') : !holderOn ? 'The holder is off the roster; the station is refused rather than reassigned.' : null,
        people: detail && !detailWithheld ? [...pool].sort().map((personId) => {
          const statement = availabilityFor(availability, personId, window);
          const isQualified = qualified.has(personId);
          return {
            personId,
            name: matrix.nodes.get(personId)?.name || 'Name unavailable',
            qualified: isQualified,
            available: Boolean(statement),
            capacity: statement && !statement.ambiguous ? statement.capacity : null,
            basis: statement && !statement.ambiguous ? statement.basis : null,
            coveredFrom: statement && !statement.ambiguous ? statement.fromDay : null,
            coveredTo: statement && !statement.ambiguous ? statement.toDay : null,
            rejected: !isQualified ? 'No live unexpired U/O attestation on this station’s task.' : !statement ? 'No availability statement covering this whole window.' : null,
          };
        }) : null,
      };
    });

    // Availability statements for people the window's stations do not even use
    // are printed, not silently dropped: a statement that changes nothing is
    // still a human act on the record.
    const windowStatements = availability.filter((r) => !r.invalid && r.windowId === window.id && visible(window.holderId));
    // The declared capacity of the window's live statements, summed from rows.
    const liveStatements = windowStatements.filter((s) => !s.withdrawnAt);
    const availableCapacityN = liveStatements.reduce((n, s) => n + s.capacity, 0);
    // Qualified attestation cells across the window's stations, from the SAME
    // sets the per-station rows print — never a second count.
    const qualifiedCellsN = stationRows.reduce((n, row) => n + (row.qualifiedN || 0), 0);

    /* ------------------------------------------------- exact feasibility */
    const simultaneous = stationRows.filter((r) => r.requirement === 'concurrent');
    const provable = holderOn && clean && simultaneous.every((r) => r.state !== 'withheld');
    const totalDemand = simultaneous.reduce((n, r) => n + r.demand, 0);

    let verdict = 'inert';
    let matching = null;
    let witness = null;
    let undeclaredN = 0;

    // A single concurrent station has nobody to compete with, so there is no
    // Hall question to answer. The vocabulary says `inert` for exactly this
    // case; labelling it `feasible` would claim a simultaneity proof that was
    // never needed.
    if (simultaneous.length > 1 && provable) {
      // Distinct people who could serve at least one simultaneous station.
      const candidates = new Map(); // personId -> { capacity }
      for (const row of simultaneous) {
        const pool = poolOf(row.holderId);
        const qualified = new Set([...(qualifiedByTask.get(row.taskId) || [])].filter((p) => pool.has(p)));
        for (const personId of qualified) {
          const statement = availabilityFor(availability, personId, window);
          if (!statement || statement.ambiguous) continue;
          const capacity = Math.max(0, Number(statement.capacity) || 0);
          if (capacity < 1) continue;
          const prior = candidates.get(personId);
          candidates.set(personId, { capacity: prior ? Math.min(prior.capacity, capacity) : capacity });
        }
      }
      undeclaredN = [...new Set(simultaneous.flatMap((row) => {
        const pool = poolOf(row.holderId);
        return [...(qualifiedByTask.get(row.taskId) || [])].filter((p) => pool.has(p));
      }))].filter((p) => !availabilityFor(availability, p, window)).length;

      const stationIndex = new Map(simultaneous.map((r, i) => [r.stationId, i]));
      const personIds = [...candidates.keys()].sort();
      const personIndex = new Map(personIds.map((p, i) => [p, simultaneous.length + i]));
      const source = simultaneous.length + personIds.length;
      const sink = source + 1;
      const edges = [];
      for (const row of simultaneous) edges.push([source, stationIndex.get(row.stationId), row.demand]);
      for (const row of simultaneous) {
        const pool = poolOf(row.holderId);
        const qualified = new Set([...(qualifiedByTask.get(row.taskId) || [])].filter((p) => pool.has(p)));
        for (const personId of personIds) {
          if (!qualified.has(personId) || !candidates.has(personId)) continue;
          edges.push([stationIndex.get(row.stationId), personIndex.get(personId), 1]);
        }
      }
      for (const personId of personIds) edges.push([personIndex.get(personId), sink, candidates.get(personId).capacity]);

      const result = maxFlowInt(sink + 1, edges, source, sink);
      const assignable = totalDemand > 0 && result.flow === totalDemand;

      if (assignable) {
        verdict = 'feasible';
        matching = {
          totalDemand,
          matchedN: result.flow,
          peopleN: personIds.length,
          capacityN: personIds.reduce((n, p) => n + candidates.get(p).capacity, 0),
          unassignedN: totalDemand - result.flow,
        };
      } else {
        // The min cut names the failing subset. Index -> station id.
        const reachableStations = simultaneous.filter((r) => result.reachable[stationIndex.get(r.stationId)]);
        let set = reachableStations.slice();
        const neighbourhood = (subset) => {
          const people = new Set();
          for (const row of subset) {
            const pool = poolOf(row.holderId);
            const qualified = new Set([...(qualifiedByTask.get(row.taskId) || [])].filter((p) => pool.has(p)));
            for (const personId of qualified) if (candidates.has(personId)) people.add(personId);
          }
          return people;
        };
        const deficitOf = (subset) => subset.reduce((n, r) => n + r.demand, 0)
          - [...neighbourhood(subset)].reduce((n, p) => n + candidates.get(p).capacity, 0);
        // Shrink to an inclusion-minimal deficient set: every station named must
        // be load-bearing, so the leader reads the smallest true cause. The loop
        // repeats until no single station can be dropped while the subset stays
        // deficient, and the result is ASSERTED minimal rather than assumed.
        let shrunk = true;
        while (shrunk) {
          shrunk = false;
          for (const row of set.slice()) {
            const without = set.filter((r) => r.stationId !== row.stationId);
            if (without.length && deficitOf(without) > 0) { set = without; shrunk = true; break; }
          }
        }
        const minimal = set.every((row) => {
          const without = set.filter((r) => r.stationId !== row.stationId);
          return !without.length || deficitOf(without) <= 0;
        });
        const people = neighbourhood(set);
        const deficit = deficitOf(set);
        witness = {
          stationIds: set.map((r) => r.stationId),
          stationTitles: set.map((r) => r.title),
          demandN: set.reduce((n, r) => n + r.demand, 0),
          peopleN: people.size,
          capacityN: [...people].reduce((n, p) => n + candidates.get(p).capacity, 0),
          deficitN: Math.max(0, deficit),
          minimal,
          enumerationCapped: simultaneous.length > STATION_COVERAGE_LIMITS.witnessSubsetSize * 8,
        };
        // A shortage is only a PROVEN impossibility when nobody's silence could
        // change it. With undeclared people in the pool the honest answer is
        // `unproven`, and the count is printed rather than assumed away.
        if (undeclaredN > 0) {
          verdict = 'unproven';
          reasons.push(`${undeclaredN} qualified person(s) in this window made no availability statement; silence is not unavailability, so no shortage is proven.`);
        } else if (!holderOn || !clean) {
          verdict = 'unproven';
        } else {
          verdict = 'infeasible';
        }
        matching = { totalDemand, matchedN: result.flow, peopleN: personIds.length,
          capacityN: personIds.reduce((n, p) => n + candidates.get(p).capacity, 0),
          unassignedN: totalDemand - result.flow };
      }
    } else if (simultaneous.length > 1 && !provable) {
      verdict = 'unproven';
      if (!holderOn) reasons.push('The window’s holder is off the roster; the simultaneous set cannot be proved.');
      else reasons.push(...globalReasons);
    }

    if (simultaneous.length < 2) verdict = 'inert';

    // Stations with no qualified or no available people are printed as their own
    // reasons regardless of the verdict, so a 'feasible' window can never hide a
    // sequential station nobody can man.
    for (const row of stationRows) {
      if (row.state === 'no-qualified') reasons.push(`“${row.title}” has nobody qualified in its pool.`);
      else if (row.state === 'no-available') reasons.push(`“${row.title}” has qualified people but none declared availability for this window.`);
      else if (row.state === 'short') reasons.push(`“${row.title}” declares ${row.demand} and has ${row.availableN} qualified, available person(s).`);
    }

    const verdictRow = VERDICT.get(verdict);
    windowRows.push({
      windowId: window.id,
      label: window.label,
      holderId: window.holderId,
      holderName,
      fromDay: window.fromDay,
      toDay: window.toDay,
      dayN: (stationCoverageDays(window.fromDay, window.toDay) || []).length,
      past: window.toDay < today,
      verdict,
      verdictLabel: verdictRow?.label || verdict,
      proven: verdict === 'feasible' || verdict === 'infeasible',
      stationsN: live.length,
      concurrentN: simultaneous.length,
      sequentialN: sequential.length,
      retiredN,
      demandN: totalDemand,
      sequentialDemandN: sequential.reduce((n, r) => n + r.demand, 0),
      matching,
      witness,
      undeclaredN,
      statementsN: liveStatements.length,
      withdrawnN: windowStatements.filter((s) => s.withdrawnAt).length,
      availableCapacityN,
      qualifiedCellsN,
      reasons: [...new Set(reasons)],
      stations: stationRows,
      // Sequential stations are counted, never folded into the simultaneous
      // proof: whether two sequential demands collide is a levelling question
      // this register does not answer, and saying so is the honest reading.
      sequentialNote: sequential.length
        ? 'Sequential stations are counted against availability but excluded from the simultaneous proof: whether two of them collide inside the window is a levelling question, not a Hall question.'
        : null,
    });
  }

  /* --------------------------------------------------------------- roll-up */

  const stationStateCounts = Object.fromEntries(STATION_COVERAGE_STATION_STATES.map((s) => [s.key, 0]));
  const verdictCounts = Object.fromEntries(STATION_COVERAGE_VERDICTS.map((v) => [v.key, 0]));
  for (const row of windowRows) {
    verdictCounts[row.verdict] += 1;
    for (const station of row.stations) stationStateCounts[station.state] = (stationStateCounts[station.state] || 0) + 1;
  }

  const spans = [];
  for (const node of matrix.nodes.values()) {
    if (!visible(node.id)) continue;
    const below = windowRows.filter((r) => r.holderId === node.id || node.descendants?.has(r.holderId));
    if (!below.length) continue;
    const people = new Set();
    let stationsN = 0;
    let demandN = 0;
    let infeasible = 0;
    let unproven = 0;
    const stationIds = new Set();
    for (const r of below) {
      for (const s of r.stations) { stationIds.add(s.stationId); stationsN += 1; demandN += s.demand; }
      if (r.verdict === 'infeasible') infeasible += 1;
      if (r.verdict === 'unproven') unproven += 1;
    }
    for (const r of below) for (const s of r.stations) for (const p of s.people || []) people.add(p.personId);
    const certified = clean && below.every((r) => r.verdict !== 'withheld');
    spans.push({
      nodeId: node.id, name: node.name, windowsN: below.length, stationsN, demandN,
      distinctStationsN: stationIds.size,
      peopleN: certified ? people.size : null,
      infeasibleN: infeasible, unprovenN: unproven,
    });
  }

  const totals = {
    windowsN: windowRows.length,
    liveWindowsN: windowRows.filter((r) => !r.past).length,
    stationsN: windowRows.reduce((n, r) => n + r.stationsN, 0),
    concurrentN: windowRows.reduce((n, r) => n + r.concurrentN, 0),
    sequentialN: windowRows.reduce((n, r) => n + r.sequentialN, 0),
    demandN: windowRows.reduce((n, r) => n + r.demandN, 0),
    sequentialDemandN: windowRows.reduce((n, r) => n + r.sequentialDemandN, 0),
    retiredN: [...windows].filter((w) => !w.invalid && w.retiredOn && w.retiredOn <= today && visible(w.holderId)).length,
    verdictCounts,
    stationStateCounts,
    deficientSetsN: windowRows.filter((r) => r.witness).length,
    maxDeficitN: windowRows.reduce((n, r) => Math.max(n, r.witness?.deficitN || 0), 0),
    feasibleN: verdictCounts.feasible,
    infeasibleN: verdictCounts.infeasible,
    unprovenN: verdictCounts.unproven,
    inertN: verdictCounts.inert,
    statementsN: windowRows.reduce((n, r) => n + r.statementsN, 0),
    withdrawnN: windowRows.reduce((n, r) => n + r.withdrawnN, 0),
    availableCapacityN: windowRows.reduce((n, r) => n + r.availableCapacityN, 0),
    qualifiedCellsN: windowRows.reduce((n, r) => n + r.qualifiedCellsN, 0),
    undeclaredN: windowRows.reduce((n, r) => n + r.undeclaredN, 0),
  };

  const figuresComplete = clean && windowRows.every((r) => r.verdict !== 'unproven' && !r.reasons.length);
  const claims = {
    countsReconcile: STATION_COVERAGE_VERDICTS.reduce((n, v) => n + verdictCounts[v.key], 0) === windowRows.length
      && STATION_COVERAGE_STATION_STATES.reduce((n, s) => n + (stationStateCounts[s.key] || 0), 0) === totals.stationsN,
    figuresComplete,
    reasons: [...new Set([
      ...(figuresComplete ? [] : windowRows.filter((r) => r.verdict === 'unproven').map((r) => `“${r.label}” could not be proven.`)),
    ])],
  };

  const canDeclare = !seat?.readOnly && matrix.nodes.has(actorId) && clean;

  return {
    engineVersion: STATION_COVERAGE_ENGINE_VERSION,
    today,
    actorId,
    actorName: matrix.nodes.get(actorId)?.name || 'Workspace leader',
    scope: operator ? 'workspace' : 'span',
    clean,
    reasons: globalReasons,
    warnings,
    invalidN,
    futureN,
    floorN,
    conventions: { askDays: conv[STATION_COVERAGE_SETTING_KEYS.askDays], disclosureFloorN: conv[STATION_COVERAGE_SETTING_KEYS.disclosureFloorN], autoPropagate: conv[STATION_COVERAGE_SETTING_KEYS.autoPropagate] },
    windows: windowRows,
    spans,
    totals,
    claims,
    canDeclare,
    canDeclareAvailability: !seat?.readOnly && clean,
    method: 'A station is manned only by someone with a live, unexpired manager-attested U or O qualification on that station’s own task, who is in its holder’s live reporting-line pool, and who declared availability covering the whole window. Feasibility is an exact capacitated bipartite matching, not a percentage. A shortage is proven only when nobody is silent. Nobody is scheduled: a feasible window is a proof of possibility, not an assignment.',
    internal: { matrix, qualifiedByTask, windows, stations, availability, tasks },
  };
}

/* --------------------------------------------------------------------- CSV */

const blank = (v) => (v === null || v === undefined ? '' : v);
const yesNo = (v) => (v ? 'yes' : 'no');

export function stationCoverageCsvRows(report) {
  const t = report.totals;
  const common = { generated_on: report.today, engine_version: report.engineVersion };
  const rows = [{
    row_type: 'workspace',
    key: report.scope,
    label: report.scope === 'workspace' ? 'Whole workspace' : 'Declared seat and its reach',
    ...common,
    windows_n: t.windowsN, live_windows_n: t.liveWindowsN, stations_n: t.stationsN,
    concurrent_stations_n: t.concurrentN, sequential_stations_n: t.sequentialN,
    demand_n: t.demandN, qualified_edges_n: t.qualifiedCellsN,
    available_people_n: t.statementsN, available_capacity_n: t.availableCapacityN,
    feasible_windows_n: t.feasibleN, infeasible_windows_n: t.infeasibleN,
    unproven_windows_n: t.unprovenN, inert_windows_n: t.inertN,
    deficient_sets_n: t.deficientSetsN, max_deficit_n: t.maxDeficitN,
    witness_complete: yesNo(report.claims.figuresComplete),
    counts_reconcile: yesNo(report.claims.countsReconcile), figures_complete: yesNo(report.claims.figuresComplete),
    claim_reason: report.claims.reasons.join(' | '),
  }];
  for (const v of STATION_COVERAGE_VERDICTS) {
    rows.push({ row_type: 'window-verdict', key: v.key, label: v.label, ...common, feasible_windows_n: t.verdictCounts[v.key] });
  }
  for (const s of STATION_COVERAGE_STATION_STATES) {
    rows.push({ row_type: 'station-state', key: s.key, label: s.label, ...common, station_state_n: t.stationStateCounts[s.key] });
  }
  return rows;
}

/** A plain-text brief, generated from the report and nothing else. */
export function stationCoverageBriefText(report) {
  const t = report.totals;
  const lines = [
    `Skill-constrained simultaneous station coverage — ${report.today}`,
    `Engine ${report.engineVersion} · scope: ${report.scope}`,
    '',
    `${t.windowsN} declared window(s) · ${t.concurrentN} simultaneous station(s) · ${t.demandN} declared headcount · ${t.statementsN} availability statement(s)`,
    `Proven feasible: ${t.feasibleN} · proven infeasible: ${t.infeasibleN} · unproven: ${t.unprovenN} · nothing to prove: ${t.inertN}`,
    `Deficient sets found: ${t.deficientSetsN} · largest exact deficit: ${t.maxDeficitN}`,
    '',
  ];
  for (const row of report.windows) {
    lines.push(`— ${row.label} (${row.fromDay} → ${row.toDay}) · ${row.verdictLabel}`);
    if (row.matching) lines.push(`   demand ${row.matching.totalDemand} · matched ${row.matching.matchedN} · ${row.matching.peopleN} candidate(s) with ${row.matching.capacityN} declared concurrent capacity`);
    if (row.witness) {
      lines.push(`   deficient set: ${row.witness.stationTitles.map((x) => `“${x}”`).join(', ')}`);
      lines.push(`   demand ${row.witness.demandN} vs ${row.witness.peopleN} person(s) carrying ${row.witness.capacityN} · deficit ${row.witness.deficitN}${row.witness.minimal ? ' (inclusion-minimal)' : ''}`);
    }
    for (const reason of row.reasons) lines.push(`   refused: ${reason}`);
  }
  lines.push('', 'No person is scheduled by this reading. A feasible window proves a legal assignment exists; it is not one.');
  return lines.join('\n');
}
