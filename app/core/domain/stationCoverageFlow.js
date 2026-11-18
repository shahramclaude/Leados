/** Exact integer station flow. Both baseline coverage and the single-absence
 * check use the same source → station → person → sink capacity model. */
const WORK_LIMIT = Symbol('station-absence-work-limit');

function charge(budget, units = 1) {
  if (budget && (budget.remaining -= units) < 0) {
    budget.remaining = 0;
    throw WORK_LIMIT;
  }
}

function network(n, edges, source, sink, budget = null) {
  charge(budget, edges.length);
  const to = [];
  const capacity = new Int32Array(edges.length * 2);
  const next = Array.from({ length: n }, () => []);
  for (const [u, v, c] of edges) {
    next[u].push(to.length); to.push(v);
    next[v].push(to.length); to.push(u);
    capacity[to.length - 2] = c;
  }

  // Dinic, starting from any feasible residual flow. `exclude` makes the
  // absent person's node unavailable in both directions, even on reverse arcs.
  function augment(cap, exclude = -1) {
    const level = new Int32Array(n);
    const iter = new Int32Array(n);
    const queue = new Int32Array(n);
    let total = 0;
    for (;;) {
      level.fill(-1);
      iter.fill(0);
      level[source] = 0;
      queue[0] = source;
      let end = 1;
      for (let head = 0; head < end; head += 1) {
        const u = queue[head];
        for (const e of next[u]) {
          charge(budget);
          const v = to[e];
          if (v !== exclude && cap[e] > 0 && level[v] < 0) {
            level[v] = level[u] + 1;
            queue[end++] = v;
          }
        }
      }
      // On termination the final BFS is also the source side of the min cut.
      if (level[sink] < 0) return { flow: total, reachable: level.map((depth) => Number(depth >= 0)) };

      const push = (u, limit) => {
        if (u === sink) return limit;
        for (; iter[u] < next[u].length; iter[u] += 1) {
          charge(budget);
          const e = next[u][iter[u]];
          const v = to[e];
          if (v === exclude || cap[e] <= 0 || level[v] !== level[u] + 1) continue;
          const sent = push(v, Math.min(limit, cap[e]));
          if (!sent) continue;
          cap[e] -= sent;
          cap[e ^ 1] += sent;
          return sent;
        }
        return 0;
      };
      for (;;) {
        const sent = push(source, Number.MAX_SAFE_INTEGER);
        if (!sent) break;
        total += sent;
      }
    }
  }
  return { capacity, augment };
}

export function maxFlowInt(n, edges, source, sink) {
  const { capacity, augment } = network(n, edges, source, sink);
  return augment(capacity);
}

/**
 * Solve the stated headcount, then remove each distinct declared candidate
 * from it. An unused candidate already has a witness of coverage: the base
 * flow. For a used one, cancel only their assignments on the source arcs,
 * then augment that still-feasible flow without the candidate. There is no
 * requirement to keep the old assignments: reverse arcs allow reassignment.
 * A partial sweep is never a result. Returned evidence contains no person IDs.
 */
export function solveSingleAbsence(stations, capacityByPerson, budget) {
  try {
    const people = [...capacityByPerson.keys()].sort();
    const personIndex = new Map(people.map((id, i) => [id, i + stations.length]));
    const source = stations.length + people.length;
    const sink = source + 1;
    const edges = stations.map((s, i) => [source, i, s.demand]);
    const incoming = new Map(people.map((id) => [id, []]));
    const demandN = stations.reduce((n, s) => n + s.demand, 0);
    for (const [i, station] of stations.entries()) {
      for (const id of station.eligible) {
        incoming.get(id).push({ stationIndex: i, arc: edges.length * 2 });
        edges.push([i, personIndex.get(id), 1]);
      }
    }
    const toSinkStart = edges.length * 2;
    for (const id of people) edges.push([personIndex.get(id), sink, capacityByPerson.get(id)]);

    const { capacity, augment } = network(sink + 1, edges, source, sink, budget);
    const base = augment(capacity);
    if (base.flow !== demandN || !people.length) return { ok: false, reason: 'baseline' };

    let fillableN = 0;
    let worst = null;
    for (const [i, id] of people.entries()) {
      const carried = capacity[(toSinkStart + 2 * i) ^ 1];
      if (!carried) { fillableN += 1; continue; }
      charge(budget, capacity.length + incoming.get(id).length);
      const residual = capacity.slice();
      // The absent node is excluded, so just unwind the source arcs for the
      // stations it had actually staffed. Conservation still holds elsewhere.
      for (const arc of incoming.get(id)) {
        const served = capacity[arc.arc ^ 1];
        residual[2 * arc.stationIndex] += served;
        residual[2 * arc.stationIndex + 1] -= served;
      }
      const repair = augment(residual, personIndex.get(id));
      const deficitN = carried - repair.flow;
      if (!deficitN) { fillableN += 1; continue; }
      if (worst && deficitN <= worst.deficitN) continue;
      const cut = stations.filter((_, j) => repair.reachable[j]);
      const degree = new Map();
      for (const station of cut) for (const candidate of station.eligible) {
        charge(budget);
        if (candidate !== id) degree.set(candidate, (degree.get(candidate) || 0) + 1);
      }
      // One person can fill at most ONE place in each eligible station. The
      // cut's bound is the sum of min(declared capacity, eligible stations).
      const capacityN = [...degree].reduce((n, [p, count]) => n + Math.min(count, capacityByPerson.get(p)), 0);
      const cutDemandN = cut.reduce((n, s) => n + s.demand, 0);
      if (deficitN < 0 || !cut.length || cutDemandN - capacityN !== deficitN) {
        return { ok: false, reason: 'reconciliation' };
      }
      worst = { deficitN, demandN: cutDemandN, capacityN, stationIds: cut.map((s) => s.stationId) };
    }
    return { ok: true, testedN: people.length, fillableN, shortfallN: people.length - fillableN, worst };
  } catch (error) {
    if (error === WORK_LIMIT) return { ok: false, reason: 'limit' };
    throw error;
  }
}
