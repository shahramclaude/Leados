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
 * PRECEDENCE (ADR-0204, Schema v159). A station that can only run when another is
 * manned is not an independent node. The holder declares enabling edges ("A must
 * come up before B") as append-only dated rows; the reader builds the precedence
 * graph over the window's LIVE stations and decides it exactly. Semantics are
 * uniform — at-or-before (prerequisite to start). The `concurrent` set shares the
 * one instant all of them are up; a `sequential` station occupies some other
 * instant inside the window. A directed cycle forces all of its members to one
 * instant: a cycle whose members are ALL concurrent collapses to the shared
 * instant and is a declared CO-REQUISITE LOOP — printed, satisfiable, never a
 * defect. A cycle with at least one sequential member is a contradiction: no
 * running order exists whatever anyone is assigned, and the window reads
 * `unsatisfiable`. When no unsatisfiable cycle exists the enabling order exists,
 * the simultaneous matching proof is unchanged (every declared station is
 * mandatory, so co-requisites cannot relax it), and the deficient-set witness is
 * shrunk in reverse enabling order, preferring upstream load-bearing stations;
 * whether the printed witness is enabler-closed is computed and printed, never
 * forced. Cross-type enabling edges carry the same order claim and are decided
 * by the same cycle rule — never by assumed intra-window timing, because the
 * register holds no clock below the day.
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
import { buildMatrix, matrixJointApex } from './matrix.js';
import { normalizeSkillTasks, normalizeSkillActs } from './skillCoverageSchema.js';
import {
  STATION_COVERAGE_ENGINE_VERSION,
  STATION_COVERAGE_FEED_RELATIONS,
  STATION_COVERAGE_FEED_STATUSES,
  STATION_COVERAGE_LIMITS,
  STATION_COVERAGE_SETTING_KEYS,
  STATION_COVERAGE_STATION_STATES,
  STATION_COVERAGE_VERDICTS,
} from './stationCoverageRegistry.js';
import {
  normalizeSkillStationRows,
  normalizeStationAvailability,
  normalizeStationCoverageSettings,
  normalizeStationEnables,
  normalizeStationWindowEnables,
  normalizeStationWindows,
  stationCoverageDay,
  stationCoverageDays,
  stationWindowRelation,
} from './stationCoverageSchema.js';

const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
const VERDICT = byKey(STATION_COVERAGE_VERDICTS);
const STATE = byKey(STATION_COVERAGE_STATION_STATES);
const RELATION = byKey(STATION_COVERAGE_FEED_RELATIONS);
const FEED_STATUS = byKey(STATION_COVERAGE_FEED_STATUSES);
// The seat engine keeps `scope`/`lineScope` as Sets; an Array.isArray check
// alone would silently collapse every ancestor's reach to just the actor,
// hiding every subordinate's windows from the roll-up. Accept both.
const list = (v) => (Array.isArray(v) ? v : v instanceof Set ? [...v] : []);
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

/* -------------------------------------------------- precedence: exact SCC */

/**
 * Tarjan's strongly connected components over the window's live enabling graph.
 * Returns one array of station ids per component. At most 40 stations share one
 * window, so the recursion is trivially bounded. Node and edge iteration order
 * is deterministic (ids pre-sorted), so the same declarations always yield the
 * same components, in the same order.
 */
function stronglyConnectedComponents(nodeIds, arcs) {
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const [from, to] of arcs) if (adjacency.has(from) && adjacency.has(to)) adjacency.get(from).push(to);
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let counter = 0;
  const components = [];
  const connect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v)) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component = [];
      for (;;) {
        const w = stack.pop();
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      components.push(component);
    }
  };
  for (const v of nodeIds) if (!index.has(v)) connect(v);
  return components;
}

/**
 * A topological depth per station over the condensation DAG: 0 for a source
 * (most upstream), deeper for stations that must come later. Co-requisite loops
 * are collapsed into their component, so the condensation is always a DAG and
 * the depths are total and deterministic. Used ONLY to prefer upstream
 * load-bearing stations when shrinking the deficient-set witness; it never
 * enters the feasibility arithmetic.
 */
function enablingDepths(components, arcs) {
  const componentOf = new Map();
  components.forEach((component, i) => { for (const id of component) componentOf.set(id, i); });
  const successors = components.map(() => new Set());
  const indegree = new Array(components.length).fill(0);
  for (const [a, b] of arcs) {
    const ca = componentOf.get(a); const cb = componentOf.get(b);
    if (ca === cb || ca === undefined || cb === undefined) continue;
    if (!successors[ca].has(cb)) { successors[ca].add(cb); indegree[cb] += 1; }
  }
  const depth = new Array(components.length).fill(0);
  const queue = [];
  for (let i = 0; i < components.length; i += 1) if (!indegree[i]) queue.push(i);
  const remaining = [...indegree];
  while (queue.length) {
    const c = queue.shift();
    for (const d of successors[c]) {
      depth[d] = Math.max(depth[d], depth[c] + 1);
      remaining[d] -= 1;
      if (!remaining[d]) queue.push(d);
    }
  }
  const out = new Map();
  components.forEach((component, i) => { for (const id of component) out.set(id, depth[i]); });
  return out;
}

/** True when every dependent in the subset carries its enablers with it. */
const enablerClosedSubset = (arcs, subsetIds) => {
  const set = new Set(subsetIds);
  return arcs.every(([a, b]) => !set.has(b) || set.has(a));
};

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
  const enables = normalizeStationEnables(state?.stationEnables, { windows, stations }, warnings);
  const windowEnables = normalizeStationWindowEnables(state?.stationWindowEnables, { windows, stations }, warnings);

  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([actorId, ...list(seat.scope), ...list(seat.lineScope)]);
  const visible = (nodeId) => operator || reach.has(nodeId);

  const ledgers = [...windows, ...stations, ...availability, ...enables, ...windowEnables];
  const invalidN = ledgers.filter((r) => r.invalid).length;
  const futureN = ledgers.flatMap((r) => [r.declaredAt, r.withdrawnAt, r.retiredOn])
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

    /* ------------------------------------------- enabling graph (ADR-0204) */
    const windowDetail = operator || actorId === window.holderId;
    const stationById = new Map(live.map((s) => [s.id, s]));
    const windowEnables = enables.filter((e) => !e.invalid && e.windowId === window.id);
    const liveEnables = windowEnables.filter((e) => !e.retiredOn);
    const danglingEnablesN = liveEnables.filter((e) => !stationById.has(e.fromStationId) || !stationById.has(e.toStationId)).length;
    const arcs = liveEnables
      .filter((e) => stationById.has(e.fromStationId) && stationById.has(e.toStationId))
      .map((e) => [e.fromStationId, e.toStationId]);
    const nodeIds = [...stationById.keys()].sort();
    const components = stronglyConnectedComponents(nodeIds, arcs);
    const enablingDepth = enablingDepths(components, arcs);
    const cycles = [];
    for (const component of components) {
      const selfLoop = component.length === 1 && arcs.some(([a, b]) => a === component[0] && b === component[0]);
      if (component.length === 1 && !selfLoop) continue;
      const stationIds = component.slice().sort();
      const stationTitles = stationIds.map((id) => stationById.get(id)?.title || 'Station off the register');
      const allConcurrent = stationIds.every((id) => stationById.get(id)?.requirement === 'concurrent');
      cycles.push({ stationIds, stationTitles, allConcurrent, unsatisfiable: !allConcurrent });
    }
    cycles.sort((a, b) => a.stationIds.join('+').localeCompare(b.stationIds.join('+')));
    const unsatisfiableCycles = cycles.filter((c) => c.unsatisfiable);
    const coRequisiteLoopsN = cycles.length - unsatisfiableCycles.length;
    for (const cycle of unsatisfiableCycles) {
      if (windowDetail) {
        const chain = [...cycle.stationTitles, cycle.stationTitles[0]].map((t) => `“${String(t).slice(0, 60)}”`).join(' → ');
        reasons.push(`The enabling declarations form a cycle: ${chain}. At least one station in it is sequential, so the cycle cannot collapse onto the shared simultaneous instant — no running order exists whatever anyone is assigned. Retire one enabling declaration or one station.`);
      } else {
        reasons.push('The enabling declarations form a cycle containing at least one sequential station: no running order exists whatever anyone is assigned. The declarations contradict each other, not the roster. The members are not named here — only the window’s holder or the local operator can read them; retire one enabling declaration, or retire or re-declare one station.');
      }
    }
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

    // A cycle of enabling declarations that cannot collapse onto the shared
    // simultaneous instant is a contradiction in the DECLARATIONS, not a
    // capacity question. No matching is attempted and no "feasible" can be
    // printed: the impossibility is proven by the declarations themselves.
    if (unsatisfiableCycles.length) {
      verdict = 'unsatisfiable';
    } else if (simultaneous.length > 1 && provable) {
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
        // Enabling order breaks ALL ties: the set is shrunk most-downstream
        // first, so an equally small proof names the upstream stations whose
        // failure forces the rest. Closure is computed and printed, never
        // forced — Hall's condition needs none.
        const enablesOrder = (a, b) => ((enablingDepth.get(b.stationId) || 0) - (enablingDepth.get(a.stationId) || 0))
          || String(a.stationId).localeCompare(String(b.stationId));
        let shrunk = true;
        while (shrunk) {
          shrunk = false;
          for (const row of set.slice().sort(enablesOrder)) {
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
          enablerClosed: enablerClosedSubset(arcs, set.map((r) => r.stationId)),
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

    // A single concurrent station has nobody to compete with, so there is no
    // Hall question to answer. The vocabulary says `inert` for exactly this
    // case; labelling it `feasible` would claim a simultaneity proof that was
    // never needed. An unsatisfiable enabling cycle keeps its own verdict:
    // the feasibility question was never reached.
    if (simultaneous.length < 2 && !unsatisfiableCycles.length) verdict = 'inert';

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
      proven: verdict === 'feasible' || verdict === 'infeasible' || verdict === 'unsatisfiable',
      detail: windowDetail,
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
      // The declared enabling structure of this window, printed whether or not
      // the verdict turned on it — but at two depths. The holder (or the local
      // operator) reads the rows: station identity, the declared reason and any
      // cycle membership. Anyone else reading through their reach reads counts
      // only: how many declarations are live, how many cycles exist and whether
      // they are unsatisfiable — never the station identity, the reason, or the
      // record ids. The disclosure floor governs people, not stations, but
      // declaration detail is row-level evidence a span should not quietly
      // inherit.
      precedence: {
        declaredN: windowEnables.length,
        liveN: liveEnables.length,
        retiredN: windowEnables.length - liveEnables.length,
        danglingN: danglingEnablesN,
        detail: windowDetail,
        cycles: windowDetail
          ? cycles.map((c) => ({ stationIds: c.stationIds, stationTitles: c.stationTitles, allConcurrent: c.allConcurrent, unsatisfiable: c.unsatisfiable }))
          : cycles.map((c) => ({ stationIds: [], stationTitles: [], allConcurrent: c.allConcurrent, unsatisfiable: c.unsatisfiable })),
        unsatisfiableCyclesN: unsatisfiableCycles.length,
        coRequisiteLoopsN,
        enablerClosed: witness ? witness.enablerClosed : null,
        edges: windowDetail ? liveEnables.map((e) => ({
            id: e.id,
            fromStationId: e.fromStationId,
            toStationId: e.toStationId,
            fromTitle: stationById.get(e.fromStationId)?.title || 'Station off the register',
            toTitle: stationById.get(e.toStationId)?.title || 'Station off the register',
            reason: e.reason,
        })) : [],
      },
    });
  }

  /* ------------------------------------------- cross-window orders (ADR-0207) */

  // Every window keeps the reading it earned from its own stations and people;
  // the cross-window pass ADDS a claim beside it and may overrule only the two
  // verdicts that would otherwise read as reassurance (`feasible`, `inert`).
  // A proven shortage, an unsatisfiable cycle or an unproven register is never
  // overwritten: those are already stronger statements about this window.
  for (const row of windowRows) {
    row.baseVerdict = row.verdict;
    for (const station of row.stations) station.baseState = station.state;
  }
  const rowById = new Map(windowRows.map((r) => [r.windowId, r]));
  const windowById = new Map(windows.filter((w) => !w.invalid).map((w) => [w.id, w]));
  const declaredWindowEnables = windowEnables.filter((e) => !e.invalid);
  const MANNABLE = new Set(['covered', 'exact', 'single-point']);
  const UNMANNABLE = new Set(['short', 'no-available', 'no-qualified', 'blocked-by-enabler']);
  const UNREADABLE = new Set(['withheld', 'refused']);

  /** Effective state of a station: its own reading, unless its prerequisite fails. */
  const stationStateOf = (station) => (station.feedBlocked ? 'blocked-by-enabler' : station.baseState);

  /** One declared cross-window prerequisite, decided from the calendar and the feeder's own record. */
  function readFeed(row, edge) {
    const fromWindow = windowById.get(edge.fromWindowId) || null;
    const toWindow = windowById.get(edge.toWindowId) || null;
    const feederRow = rowById.get(edge.fromWindowId) || null;
    const detail = operator || actorId === row.holderId || (feederRow && actorId === feederRow.holderId);
    const relation = stationWindowRelation(fromWindow, toWindow);
    const feederStation = feederRow ? feederRow.stations.find((s) => s.stationId === edge.fromStationId) || null : null;
    const base = {
      id: edge.id,
      fromWindowId: edge.fromWindowId,
      fromWindowLabel: detail ? (fromWindow?.label || 'Window off the register') : null,
      fromWindowFromDay: fromWindow?.fromDay || null,
      fromWindowToDay: fromWindow?.toDay || null,
      fromWindowVerdict: feederRow ? feederRow.baseVerdict : null,
      fromWindowFeedStatus: feederRow ? feederRow.feed?.status || 'none' : null,
      fromStationId: edge.fromStationId,
      fromTitle: detail ? (feederStation?.title || 'Station off the register') : null,
      fromState: feederStation ? stationStateOf(feederStation) : null,
      toStationId: edge.toStationId,
      toTitle: detail ? (row.stations.find((s) => s.stationId === edge.toStationId)?.title || 'Station off the register') : null,
      relation,
      relationLabel: RELATION.get(relation)?.label || 'Relation unreadable',
      declaredBy: detail ? matrix.nodes.get(edge.byId)?.name || 'Declarant off the roster' : null,
      basis: edge.basis,
      reason: detail ? edge.reason : null,
      declaredAt: edge.declaredAt,
    };
    const dependentLive = row.stations.some((s) => s.stationId === edge.toStationId);
    if (!dependentLive) return { ...base, status: 'dangling', proven: false,
      why: 'The dependent station is no longer live in this window; the declaration is retained and carries no order.' };
    if (row.retiredOn || toWindow?.retiredOn || fromWindow?.retiredOn) {
      return { ...base, status: 'dangling', proven: false,
        why: 'One of the windows in this declaration has been retired; the declaration is retained and carries no order.' };
    }
    if (!feederRow || !feederStation) {
      return { ...base, status: 'dangling', proven: false,
        why: 'The feeder station is no longer live in its window; the declaration is retained and carries no order.' };
    }
    if (relation === 'contradiction') {
      return { ...base, status: 'contradiction', proven: true,
        why: 'The consumer window is over before the feeder window opens, so under a prerequisite-to-start order the feeder can never be manned first — whatever anyone is assigned.' };
    }
    if (relation === 'same-day' || relation === 'overlap') {
      return { ...base, status: 'ambiguous', proven: false,
        why: relation === 'same-day'
          ? 'The two windows meet on exactly one calendar day. The register holds no clock below the day, so the declared order is neither proven nor contradicted.'
          : 'The two windows overlap, so the consumer could come up before the feeder. A running order honouring the declaration exists, but the calendar does not force it.' };
    }
    if (relation !== 'strict') {
      return { ...base, status: 'unproven', proven: false,
        why: 'The two window ranges could not be compared, so no order is claimed.' };
    }
    if (!feederRow.feed) {
      // The feeder window is outside this seat's reach. The calendar relation is
      // still published (it is a fact about two dated declarations); whether the
      // feeder can be manned is another span's record and is not shown here.
      return { ...base, status: 'withheld', proven: false,
        why: 'The prerequisite window is outside this seat’s reach, so whether its feeder station can be manned is not readable here. The order is declared; the feeder’s staffing is counted, not guessed.' };
    }
    const feedStatus = feederRow.feed.status;
    if (feedStatus === 'blocked' || feedStatus === 'contradicted') {
      return { ...base, status: 'blocked', proven: true,
        why: 'The feeder window itself cannot run as declared, so no station in it comes up — including the feeder this window waits for.' };
    }
    if (feedStatus === 'unproven') {
      return { ...base, status: 'unproven', proven: false,
        why: 'The feeder window’s own prerequisites cannot be read, so whether this window can be fed is not proved either way.' };
    }
    const feederState = stationStateOf(feederStation);
    if (UNMANNABLE.has(feederState)) {
      return { ...base, status: 'blocked', proven: true,
        why: `The feeder station reads ${STATE.get(feederState)?.label || feederState}. Its pool is printed in its own window; nobody is moved or substituted here.` };
    }
    if (UNREADABLE.has(feederState)) {
      return { ...base, status: 'unproven', proven: false,
        why: `The feeder station reads ${STATE.get(feederState)?.label || feederState}, so whether it can be manned is not proved either way.` };
    }
    if (!MANNABLE.has(feederState)) {
      return { ...base, status: 'unproven', proven: false,
        why: 'The feeder station’s state is not a manning claim, so no order is claimed from it.' };
    }
    return { ...base, status: 'order', proven: true,
      why: 'The feeder window closes strictly before this window opens, so the order holds for every possible running order, and the feeder station has enough qualified, available people.' };
  }

  /** The order statuses a live declaration can carry, and the feed status each implies. */
  const FEED_OF_EDGE = {
    order: 'fed', blocked: 'blocked', unproven: 'unproven',
    ambiguous: 'ambiguous', contradiction: 'contradicted',
    withheld: null, dangling: null,
  };
  const STATUS_FIELDS = { order: 'orderN', blocked: 'blockedN', unproven: 'unprovenN', ambiguous: 'ambiguousN', contradiction: 'contradictedN', withheld: 'withheldN', dangling: 'danglingN' };

  const signatureOf = (row) => JSON.stringify([row.verdict, row.stations.map((s) => stationStateOf(s)), row.feed && {
    status: row.feed.status, counts: row.feed.counts, order: row.feed.order,
  }]);

  let passes = 0;
  let previous = windowRows.map(() => '');
  for (;;) {
    passes += 1;
    for (const row of windowRows) {
      const mine = declaredWindowEnables.filter((e) => e.toWindowId === row.windowId);
      const live = mine.filter((e) => !e.retiredOn);
      const edges = live.map((e) => readFeed(row, e));
      const counts = { orderN: 0, blockedN: 0, unprovenN: 0, ambiguousN: 0, contradictedN: 0, withheldN: 0, danglingN: 0 };
      for (const edge of edges) counts[STATUS_FIELDS[edge.status]] += 1;
      // A station whose declared prerequisite cannot be met cannot be manned
      // first, so its state says so rather than reading `covered`.
      const blockedStations = new Set();
      for (const edge of edges) {
        if (edge.status === 'blocked' || edge.status === 'contradiction') blockedStations.add(edge.toStationId);
      }
      for (const station of row.stations) station.feedBlocked = blockedStations.has(station.stationId);
      let status = 'none';
      let severity = 0;
      for (const edge of edges) {
        const candidate = FEED_OF_EDGE[edge.status];
        if (!candidate) continue;
        const weight = FEED_STATUS.get(candidate)?.severity || 0;
        if (weight > severity) { severity = weight; status = candidate; }
      }
      const downstream = declaredWindowEnables.filter((e) => e.fromWindowId === row.windowId && !e.retiredOn);
      row.feed = {
        detail: operator || actorId === row.holderId || mine.some((e) => actorId === rowById.get(e.fromWindowId)?.holderId),
        declaredN: mine.length,
        liveN: live.length,
        retiredN: mine.length - live.length,
        ...counts,
        status,
        severity,
        downstreamN: downstream.length,
        downstreamWindowsN: new Set(downstream.map((e) => e.toWindowId)).size,
        order: edges.map((e) => [e.toStationId, e.status]),
        edges,
      };
    }
    const now2 = windowRows.map(signatureOf);
    if (now2.every((sig, i) => sig === previous[i])) break;
    previous = now2;
    // The dependency graph only propagates forward in calendar time, so this
    // always settles; the bound is a guard, never a silent truncation.
    if (passes > windowRows.length + 2) break;
  }

  /* ------------------------------------------- what the cross-window pass changed */

  const FEED_REASON = {
    blocked: 'A declared prerequisite cannot be manned',
    contradicted: 'The calendar forbids the declared prerequisite order',
    unproven: 'A declared prerequisite cannot be read',
    ambiguous: 'The declared prerequisite order is not proven by the calendar',
  };
  for (const row of windowRows) {
    for (const station of row.stations) {
      if (clean && station.feedBlocked) {
        const edge = row.feed.edges.find((e) => e.toStationId === station.stationId && (e.status === 'blocked' || e.status === 'contradiction'));
        station.state = 'blocked-by-enabler';
        station.reason = edge && edge.fromTitle
          ? `Its declared prerequisite “${edge.fromTitle}”${edge.fromWindowLabel ? ` in “${edge.fromWindowLabel}”` : ''} cannot be manned, so this station may not be manned first.`
          : 'Its declared cross-window prerequisite cannot be manned, so this station may not be manned first.';
      } else {
        station.state = station.baseState;
      }
      delete station.baseState;
      delete station.feedBlocked;
    }
    const override = clean && (row.feed.status === 'blocked' || row.feed.status === 'contradicted')
      && (row.baseVerdict === 'feasible' || row.baseVerdict === 'inert');
    row.verdict = override ? 'blocked' : row.baseVerdict;
    row.verdictLabel = VERDICT.get(row.verdict)?.label || row.verdict;
    row.proven = ['feasible', 'infeasible', 'unsatisfiable', 'blocked'].includes(row.verdict);
    delete row.baseVerdict;
    // Only the three proven or unprovable classes enter `reasons` (which governs
    // "figures complete"); the two ambiguity classes are printed beside the
    // figures as their own claim and never silently degrade the arithmetic.
    const narration = row.feed.edges.filter((e) => ['blocked', 'contradiction', 'unproven', 'ambiguous'].includes(e.status));
    const proofEdges = narration.filter((e) => e.status !== 'ambiguous');
    for (const edge of proofEdges) {
      const status = edge.status === 'contradiction' ? 'contradicted' : edge.status;
      if (row.feed.detail && edge.toTitle && edge.fromTitle) {
        row.reasons.push(`${FEED_REASON[status]}: “${edge.toTitle}” waits for “${edge.fromTitle}” in “${edge.fromWindowLabel}” (${edge.fromWindowFromDay} → ${edge.fromWindowToDay}; ${edge.relationLabel.toLowerCase()}). ${edge.why}`);
      } else {
        row.reasons.push(`${FEED_REASON[status]} for a station in this window. ${edge.toTitle ? edge.why : 'The feeder and the dependent are not named here — only the windows’ holders or the local operator can read them.'}`);
      }
    }
    row.feed.reasons = narration
      .filter((e) => e.status === 'ambiguous')
      .map((e) => (row.feed.detail && e.toTitle && e.fromTitle
        ? `“${e.toTitle}” waits for “${e.fromTitle}” in “${e.fromWindowLabel}” (${e.fromWindowFromDay} → ${e.fromWindowToDay}). ${e.why}`
        : `A declared prerequisite order is not proven by the calendar. ${e.why}`));
    row.feed.statusLabel = FEED_STATUS.get(row.feed.status)?.label || row.feed.status;
    row.feed.says = FEED_STATUS.get(row.feed.status)?.says || '';
    row.feed.countsReconcile = ['order', 'blocked', 'unproven', 'ambiguous', 'contradiction', 'withheld', 'dangling']
      .reduce((n, key) => n + (row.feed[STATUS_FIELDS[key]] || 0), 0) === row.feed.liveN;
  }

  /*
   * Which OTHER windows this seat may pair with this one. An order between two
   * managers' windows belongs to the seat that holds both, so a candidate is
   * offered only where this actor IS the lowest joint apex of the two holders
   * (or where the operator view is scribery). The action re-checks it; the
   * screen never offers a declaration the door would refuse.
   */
  const canDeclareWindowEnable = !seat?.readOnly && matrix.nodes.has(actorId) && clean;
  const liveWindowCandidates = canDeclareWindowEnable
    ? windows.filter((w) => !w.invalid && !w.retiredOn && visible(w.holderId)).map((w) => ({
      windowId: w.id,
      label: w.label,
      holderId: w.holderId,
      fromDay: w.fromDay,
      toDay: w.toDay,
      stations: stations.filter((st) => !st.invalid && !st.retiredOn && st.windowId === w.id)
        .map((st) => ({ stationId: st.id, title: st.title, requirement: st.requirement })),
    })).filter((w) => w.stations.length)
    : [];
  for (const row of windowRows) {
    const targets = [];
    if (canDeclareWindowEnable && !row.past) {
      for (const candidate of liveWindowCandidates) {
        if (candidate.windowId === row.windowId) continue;
        if (!operator) {
          const apex = matrixJointApex(matrix, [row.holderId, candidate.holderId]);
          if (!apex.unique || apex.apexId !== actorId) continue;
        }
        targets.push(candidate);
      }
    }
    row.feed.targets = targets;
    row.feed.canDeclare = targets.length > 0 && row.stations.length > 0;
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
    let unsatisfiable = 0;
    let blocked = 0;
    const stationIds = new Set();
    for (const r of below) {
      for (const s of r.stations) { stationIds.add(s.stationId); stationsN += 1; demandN += s.demand; }
      if (r.verdict === 'infeasible') infeasible += 1;
      if (r.verdict === 'unproven') unproven += 1;
      if (r.verdict === 'unsatisfiable') unsatisfiable += 1;
      if (r.verdict === 'blocked') blocked += 1;
    }
    for (const r of below) for (const s of r.stations) for (const p of s.people || []) people.add(p.personId);
    const certified = clean && below.every((r) => r.verdict !== 'withheld');
    spans.push({
      nodeId: node.id, name: node.name, windowsN: below.length, stationsN, demandN,
      distinctStationsN: stationIds.size,
      peopleN: certified ? people.size : null,
      infeasibleN: infeasible, unprovenN: unproven, unsatisfiableN: unsatisfiable, blockedN: blocked,
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
    unsatisfiableN: verdictCounts.unsatisfiable,
    blockedWindowsN: verdictCounts.blocked,
    crossWindowEdgesN: windowRows.reduce((n, r) => n + r.feed.declaredN, 0),
    crossWindowLiveN: windowRows.reduce((n, r) => n + r.feed.liveN, 0),
    crossWindowRetiredN: windowRows.reduce((n, r) => n + r.feed.retiredN, 0),
    crossWindowOrderN: windowRows.reduce((n, r) => n + r.feed.orderN, 0),
    crossWindowBlockedN: windowRows.reduce((n, r) => n + r.feed.blockedN, 0),
    crossWindowUnprovenN: windowRows.reduce((n, r) => n + r.feed.unprovenN, 0),
    crossWindowWithheldN: windowRows.reduce((n, r) => n + r.feed.withheldN, 0),
    crossWindowAmbiguousN: windowRows.reduce((n, r) => n + r.feed.ambiguousN, 0),
    crossWindowContradictionsN: windowRows.reduce((n, r) => n + r.feed.contradictedN, 0),
    crossWindowDanglingN: windowRows.reduce((n, r) => n + r.feed.danglingN, 0),
    crossWindowDownstreamN: windowRows.reduce((n, r) => n + r.feed.downstreamN, 0),
    feedBlockedWindowsN: windowRows.filter((r) => r.feed.status === 'blocked').length,
    feedContradictedWindowsN: windowRows.filter((r) => r.feed.status === 'contradicted').length,
    feedAmbiguousWindowsN: windowRows.filter((r) => r.feed.status === 'ambiguous').length,
    feedUnprovenWindowsN: windowRows.filter((r) => r.feed.status === 'unproven').length,
    feedFedWindowsN: windowRows.filter((r) => r.feed.status === 'fed').length,
    enablingEdgesN: windowRows.reduce((n, r) => n + r.precedence.liveN, 0),
    enablingDeclaredN: windowRows.reduce((n, r) => n + r.precedence.declaredN, 0),
    precedenceCyclesN: windowRows.reduce((n, r) => n + r.precedence.cycles.length, 0),
    unsatisfiableCyclesN: windowRows.reduce((n, r) => n + r.precedence.unsatisfiableCyclesN, 0),
    coRequisiteLoopsN: windowRows.reduce((n, r) => n + r.precedence.coRequisiteLoopsN, 0),
    statementsN: windowRows.reduce((n, r) => n + r.statementsN, 0),
    withdrawnN: windowRows.reduce((n, r) => n + r.withdrawnN, 0),
    availableCapacityN: windowRows.reduce((n, r) => n + r.availableCapacityN, 0),
    qualifiedCellsN: windowRows.reduce((n, r) => n + r.qualifiedCellsN, 0),
    undeclaredN: windowRows.reduce((n, r) => n + r.undeclaredN, 0),
  };

  // Proven windows carry a reason by construction: the unsatisfiable-cycle
  // report is a proof, not a gap in the figures. It therefore does not block
  // "figures complete" — any OTHER printed reason does, exactly as before.
  // Proven windows carry a reason by construction: the unsatisfiable-cycle
  // report and a cross-window prerequisite that provably cannot be met are
  // proofs, not gaps in the figures. They therefore do not block "figures
  // complete" — any OTHER printed reason does, exactly as before.
  const PROVEN_REASON = /^(The enabling declarations form a cycle|A declared prerequisite cannot be manned|The calendar forbids the declared prerequisite order)/;
  const feedUnreadable = windowRows.filter((r) => r.feed.status === 'unproven');
  const figuresComplete = clean
    && !feedUnreadable.length
    && windowRows.every((r) => r.verdict !== 'unproven' && r.reasons.every((reason) => PROVEN_REASON.test(reason)));
  // A second, separate claim: every declared cross-window prerequisite is
  // decided by the calendar. A window can print complete figures about its own
  // people while its declared order remains unprovable, and these are different
  // facts that are reported separately, never collapsed into one word.
  const feedAmbiguous = windowRows.filter((r) => r.feed.status === 'ambiguous');
  const ordersComplete = clean && !feedAmbiguous.length;
  const claims = {
    countsReconcile: STATION_COVERAGE_VERDICTS.reduce((n, v) => n + verdictCounts[v.key], 0) === windowRows.length
      && STATION_COVERAGE_STATION_STATES.reduce((n, s) => n + (stationStateCounts[s.key] || 0), 0) === totals.stationsN
      && windowRows.every((r) => r.feed.countsReconcile)
      && totals.crossWindowLiveN === totals.crossWindowOrderN + totals.crossWindowBlockedN
        + totals.crossWindowUnprovenN + totals.crossWindowWithheldN + totals.crossWindowAmbiguousN
        + totals.crossWindowContradictionsN + totals.crossWindowDanglingN,
    figuresComplete,
    ordersComplete,
    reasons: [...new Set([
      ...(figuresComplete ? [] : windowRows.filter((r) => r.verdict === 'unproven').map((r) => `“${r.label}” could not be proven.`)),
      ...(figuresComplete ? [] : feedUnreadable.map((r) => `“${r.label}” waits on a prerequisite that cannot be read, so its runnability is not proved.`)),
      ...(ordersComplete ? [] : feedAmbiguous.map((r) => `“${r.label}” declares a prerequisite order the calendar does not prove; the order is counted, not assumed.`)),
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
    canDeclareWindowEnable,
    method: 'A station is manned only by someone with a live, unexpired manager-attested U or O qualification on that station’s own task, who is in its holder’s live reporting-line pool, and who declared availability covering the whole window. Feasibility is an exact capacitated bipartite matching, not a percentage. A shortage is proven only when nobody is silent. Enabling declarations are decided as prerequisite-to-start (at-or-before): an enabling graph with a cycle containing a sequential station proves no running order exists; a cycle of only concurrent stations collapses to their shared instant and is printed as a co-requisite loop. A CROSS-WINDOW declaration is decided by the calendar at the only resolution the record holds — whole days: only a feeder window that closes strictly before the consumer window opens proves the order; windows that meet or overlap leave it unproven and counted; a consumer window that is over before the feeder opens contradicts it. A consumer whose proven prerequisite cannot be manned is never printed feasible. Nobody is scheduled: a feasible window is a proof of possibility, not an assignment.',
    internal: { matrix, qualifiedByTask, windows, stations, availability, enables, windowEnables, tasks },
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
    unsatisfiable_windows_n: t.unsatisfiableN, blocked_windows_n: t.blockedWindowsN,
    enabling_edges_n: t.enablingEdgesN,
    precedence_cycles_n: t.precedenceCyclesN,
    cross_window_edges_n: t.crossWindowLiveN,
    cross_window_order_edges_n: t.crossWindowOrderN,
    cross_window_ambiguous_edges_n: t.crossWindowAmbiguousN,
    cross_window_contradictions_n: t.crossWindowContradictionsN,
    feed_ambiguous_windows_n: t.feedAmbiguousWindowsN,
    deficient_sets_n: t.deficientSetsN, max_deficit_n: t.maxDeficitN,
    witness_complete: yesNo(report.claims.figuresComplete),
    counts_reconcile: yesNo(report.claims.countsReconcile), figures_complete: yesNo(report.claims.figuresComplete),
    orders_complete: yesNo(report.claims.ordersComplete),
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
    `${t.windowsN} declared window(s) · ${t.concurrentN} simultaneous station(s) · ${t.demandN} declared headcount · ${t.statementsN} availability statement(s) · ${t.enablingEdgesN} live enabling declaration(s)`,
    `Cross-window prerequisites: ${t.crossWindowLiveN} live (${t.crossWindowRetiredN} retired, retained) — ${t.crossWindowOrderN} calendar order(s), ${t.crossWindowAmbiguousN} not proven by the calendar, ${t.crossWindowContradictionsN} contradicted, ${t.crossWindowBlockedN} provisionally blocked, ${t.crossWindowUnprovenN} unreadable, ${t.crossWindowWithheldN} outside this seat’s reach, ${t.crossWindowDanglingN} dangling. Windows waiting on a prerequisite: ${t.feedFedWindowsN} fed, ${t.feedAmbiguousWindowsN} unproven order, ${t.feedBlockedWindowsN} blocked, ${t.feedContradictedWindowsN} contradicted`,
    `Proven feasible: ${t.feasibleN} · proven infeasible: ${t.infeasibleN} · unsatisfiable: ${t.unsatisfiableN} · blocked by a prerequisite: ${t.blockedWindowsN} · unproven: ${t.unprovenN} · nothing to prove: ${t.inertN}`,
    `Figures complete: ${report.claims.figuresComplete ? 'yes' : 'no'} · every declared prerequisite order proven by the calendar: ${report.claims.ordersComplete ? 'yes' : 'no'}`,
    `Deficient sets found: ${t.deficientSetsN} · largest exact deficit: ${t.maxDeficitN} · precedence cycles: ${t.precedenceCyclesN} (${t.unsatisfiableCyclesN} unsatisfiable, ${t.coRequisiteLoopsN} co-requisite)`,
    '',
  ];
  for (const row of report.windows) {
    lines.push(`— ${row.label} (${row.fromDay} → ${row.toDay}) · ${row.verdictLabel}`);
    if (row.matching) lines.push(`   demand ${row.matching.totalDemand} · matched ${row.matching.matchedN} · ${row.matching.peopleN} candidate(s) with ${row.matching.capacityN} declared concurrent capacity`);
    if (row.precedence.declaredN) {
      lines.push(`   enabling declarations: ${row.precedence.liveN} live${row.precedence.retiredN ? ` (${row.precedence.retiredN} retired, retained)` : ''} · cycles: ${row.precedence.cycles.length} (${row.precedence.unsatisfiableCyclesN} unsatisfiable, ${row.precedence.coRequisiteLoopsN} co-requisite)${row.precedence.danglingN ? ` · ${row.precedence.danglingN} pointing at a retired station (carried as order, no effect)` : ''}`);
      for (const cycle of row.precedence.cycles) {
        if (!cycle.stationTitles.length) {
          lines.push(`   ${cycle.unsatisfiable ? 'UNSATISFIABLE' : 'co-requisite'} cycle: members withheld — only the window’s holder or the local operator can read them`);
          continue;
        }
        lines.push(`   ${cycle.unsatisfiable ? 'UNSATISFIABLE' : 'co-requisite'} cycle: ${cycle.stationTitles.join(' → ')} → ${cycle.stationTitles[0]}`);
      }
    }
    if (row.witness) {
      lines.push(`   deficient set: ${row.witness.stationTitles.map((x) => `“${x}”`).join(', ')}`);
      lines.push(`   demand ${row.witness.demandN} vs ${row.witness.peopleN} person(s) carrying ${row.witness.capacityN} · deficit ${row.witness.deficitN}${row.witness.minimal ? ' (inclusion-minimal)' : ''}${typeof row.witness.enablerClosed === 'boolean' ? ` · enabler-closed: ${row.witness.enablerClosed ? 'yes' : 'no (printed as found)'}` : ''}`);
    }
    if (row.feed.declaredN || row.feed.downstreamN) {
      lines.push(`   prerequisites: ${row.feed.liveN} live cross-window declaration(s)${row.feed.retiredN ? ` (${row.feed.retiredN} retired, retained)` : ''} · ${row.feed.statusLabel}${row.feed.downstreamN ? ` · this window is a declared feeder for ${row.feed.downstreamWindowsN} window(s), ${row.feed.downstreamN} declaration(s)` : ''}`);
      if (row.feed.detail) {
        for (const edge of row.feed.edges) {
          lines.push(`   ${edge.fromTitle ? `“${edge.fromTitle}” (${edge.fromWindowLabel} ${edge.fromWindowFromDay} → ${edge.fromWindowToDay}) → “${edge.toTitle}”` : 'prerequisite (members withheld from this seat)'}: ${edge.relationLabel} · ${edge.status}${edge.declaredBy ? ` · declared by ${edge.declaredBy}` : ''}`);
        }
      } else if (row.feed.liveN) {
        lines.push('   prerequisite rows are withheld: only the windows’ holders or the local operator can read who must come up first.');
      }
      for (const reason of row.feed.reasons) lines.push(`   not proven: ${reason}`);
    }
    for (const reason of row.reasons) lines.push(`   refused: ${reason}`);
  }
  lines.push('', 'No person is scheduled by this reading. A feasible window proves a legal assignment exists; it is not one.');
  return lines.join('\n');
}
