/**
 * app/core/domain/orgDesign.js — the Structural Design Terminal (`#/orgdesign`,
 * Schema v53).
 *
 * Every other screen in LeadOS optimises work *inside* the structure the leader
 * already has: the portfolio, the queue, the risks, the pay. None of them can
 * answer the question that decides how all of those behave:
 *
 *   *is the shape of this team the reason everything is slow, and what happens
 *   if I change it?*
 *
 * That question is normally answered by a consultancy slide and a personality.
 * This module makes it a measurable, testable claim about the workspace's own
 * records, using methods that are named rather than asserted:
 *
 *  1. **Graph theory / structural design.** A reporting tree is a directed
 *     acyclic graph. Span of control is out-degree; layers are longest path;
 *     coordination channels are pairs inside a unit — Brooks (1975),
 *     *The Mythical Man-Month*, n(n−1)/2, applied per unit so the marginal
 *     channel cost of one more report is visible instead of averaged away.
 *  2. **Queueing theory (production/operations).** A manager's decision work is
 *     an M/G/1-like queue. Kingman's (1961) diffusion approximation
 *     `Wq = ρ/(1−ρ) · (Ca² + Cs²)/2 · Ts` prices utilisation as waiting time.
 *     Unlike the portfolio flow model in `capacity.js`, λ and Ts here are
 *     *measured per person* from their own completed commitments — this is a
 *     queue built from the leader's history, not from a guess.
 *  3. **Economics / finance.** Coordination is priced: channels × declared
 *     hours × the manager's loaded hourly cost from recorded pay. A unit with
 *     no recorded pay is `unpriced`, never zero.
 *  4. **Statistics.** Responsibility concentration across the tree is a Gini
 *     coefficient and an HHI, not "looks unbalanced". Decision rights are an
 *     HHI over recorded approvers. A frozen prediction is scored out of sample
 *     with an absolute percentage error that is withheld below a floor.
 *  5. **Political science / org design.** Concentration of approval authority is
 *     a governance property (one throat to choke), reported as a distribution
 *     and never as a judgement about a person.
 *
 * DESIGN RULES THIS MODULE REFUSES TO BREAK
 * ------------------------------------------
 *  - It never recommends which human should report to which human. It evaluates
 *    structures the leader *declares* and reports their consequences.
 *  - It never invents pay, service time, arrival rate or variability. A missing
 *    input stays `null` with a printed reason, and every derived number carries
 *    the basis it was derived from.
 *  - The counterfactual queue is a **model**, and it says so: arrivals are
 *    scaled by the number of coordination channels because each additional
 *    report is another stream of asks. That scaling is a declared convention,
 *    not a measurement, and it is printed next to the number it produced.
 *
 * Pure module: no DOM, no storage, no wall-clock globals, no unseeded
 * randomness. Every function takes `now`.
 */

import { addDays, dayKey, daysBetween, mean, round } from '../time.js';

/* ------------------------------------------------------------------ shapes */

export const ORG_DESIGN_STATUSES = ['draft', 'committed', 'reverted', 'settled', 'abandoned'];

export const ORG_DESIGN_STATUS_LABELS = {
  draft: 'Draft — nothing has moved',
  committed: 'Committed — the reporting lines were changed',
  reverted: 'Reverted — the previous lines were restored',
  settled: 'Settled — the prediction was scored',
  abandoned: 'Abandoned — kept for the record',
};

export const ORG_DESIGN_LEVELS = ['leader', 'manager', 'ic'];

/**
 * Declared conventions. Every one is printed on the method panel. None is a
 * fact about good management: a span band of 3–8 is the classical supervisory
 * convention (Urwick, 1956; Graicunas, 1933) and is configurable per workspace
 * because a research team and a shift floor do not share one number.
 */
export const ORG_CONVENTIONS = Object.freeze({
  spanMin: 3,
  spanMax: 8,
  coordinationHoursPerWeek: 1,
  loadedHoursPerWeek: 40,
  reviewHorizonDays: 120,
  queueWindowWeeks: 13,
  minQueueSample: 3,
  /** Coefficient of variation of inter-arrival times assumed when the record
   *  cannot estimate it: 1 = Poisson arrivals, the standard M/M/1 reference. */
  assumedCa: 1,
  /** Smallest number of resolved predictions before the design is graded. */
  minScoredOutcomes: 3,
});

export const ORG_DESIGN_OBJECTIVES = ['coordination', 'span', 'latency', 'disruption'];

export const ORG_DESIGN_OBJECTIVE_LABELS = {
  coordination: 'Coordination hours per week',
  span: 'Managers over the span band',
  latency: 'Median decision wait (P80)',
  disruption: 'People whose reporting line or depth changes',
};

/** Every objective is minimised: less coordination, fewer breaches, less wait,
 *  less churn. A design is only "better" if it is not worse on any of them. */
export const ORG_DESIGN_OBJECTIVE_DIRECTION = Object.freeze({
  coordination: 'min',
  span: 'min',
  latency: 'min',
  disruption: 'min',
});

/* ------------------------------------------------------------------- maths */

export function median(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : round((nums[mid - 1] + nums[mid]) / 2, 2);
}

/** Sample standard deviation, or null below two observations. */
export function stdDev(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) return null;
  const m = mean(nums);
  const variance = nums.reduce((acc, v) => acc + (v - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

/** Coefficient of variation, or null when it cannot be estimated. */
export function coefficientOfVariation(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const m = mean(nums);
  const sd = stdDev(nums);
  if (m === null || sd === null || m <= 0) return null;
  return round(sd / m, 3);
}

/**
 * Gini coefficient of a non-negative distribution, 0 (perfect equality) to 1.
 * `null` for fewer than two values or a total of zero, because an undefined
 * inequality is not equality.
 */
export function gini(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (nums.length < 2) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let acc = 0;
  for (let i = 0; i < nums.length; i += 1) acc += (i + 1) * nums[i];
  return round((2 * acc) / (nums.length * total) - (nums.length + 1) / nums.length, 3);
}

/** Herfindahl–Hirschman index on shares in [0,10000]. */
export function hhi(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  const total = nums.reduce((a, b) => a + b, 0);
  if (!nums.length || total <= 0) return null;
  return Math.round(nums.reduce((acc, v) => acc + ((v / total) * 100) ** 2, 0));
}

/**
 * Kingman's diffusion approximation for the mean wait in a single-server queue
 * with general arrivals and service, in the same time unit as `serviceTime`.
 * Returns `null` when the queue is not stable (ρ ≥ 1): a finite wait for an
 * unbounded queue would be a lie.
 */
export function kingmanWait({ utilisation, serviceTime, ca = 1, cs = 1 }) {
  const rho = Number(utilisation);
  const ts = Number(serviceTime);
  if (!Number.isFinite(rho) || !Number.isFinite(ts) || ts <= 0) return null;
  if (rho <= 0) return 0;
  if (rho >= 1) return null;
  const variability = ((Number.isFinite(ca) ? ca : 1) ** 2 + (Number.isFinite(cs) ? cs : 1) ** 2) / 2;
  return round((rho / (1 - rho)) * variability * ts, 4);
}

/**
 * Percentiles of an exponential wait distribution with mean `waitMean`. Kingman
 * gives a mean; exponentiating it is the standard M/M/1 tail reading and is
 * labelled as an approximation wherever it is shown.
 */
export function waitPercentiles(waitMean) {
  if (!Number.isFinite(waitMean)) return { p50: null, p80: null, p90: null };
  return {
    p50: round(waitMean * Math.log(2), 4),
    p80: round(waitMean * Math.log(5), 4),
    p90: round(waitMean * Math.log(10), 4),
  };
}

/**
 * The workspace's declared conventions. Settings win where they exist, so the
 * band a leader configured once is the band every screen measures against —
 * a module that silently used its own defaults would report a breach the
 * leader never declared.
 */
export function conventionsFromSettings(state) {
  const settings = state?.settings || {};
  const pick = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const spanMin = pick(settings.orgSpanMin, ORG_CONVENTIONS.spanMin);
  const spanMax = Math.max(spanMin + 1, pick(settings.orgSpanMax, ORG_CONVENTIONS.spanMax));
  return {
    ...ORG_CONVENTIONS,
    spanMin,
    spanMax,
    coordinationHoursPerWeek: pick(settings.orgCoordinationHoursPerWeek, ORG_CONVENTIONS.coordinationHoursPerWeek),
    reviewHorizonDays: pick(settings.orgReviewHorizonDays, ORG_CONVENTIONS.reviewHorizonDays),
  };
}

/* ------------------------------------------------------------- structure */

function activePeople(state) {
  return (state?.people || []).filter((person) => person && person.id && person.status !== 'archived');
}

/**
 * Build the reporting graph, optionally with proposed moves applied.
 *
 * A move is `{ personId, toManagerId }`. `toManagerId === null` makes the person
 * a root. Links that are missing, self-referential, pointed at an archived
 * person or part of a cycle are not silently repaired: they are dropped,
 * counted and returned, because a tree that quietly rewrote itself would make
 * every span figure downstream wrong in a way nobody could see.
 */
export function buildStructure(state, { moves = [], people = null } = {}) {
  const roster = people || activePeople(state);
  const byId = new Map(roster.map((person) => [person.id, person]));
  const overrides = new Map();
  for (const move of moves || []) {
    if (!move || !move.personId) continue;
    overrides.set(move.personId, move.toManagerId === undefined ? null : move.toManagerId);
  }

  const issues = { missingManager: [], cycles: [], selfManaged: [], unknownMove: [] };
  const managerOf = new Map();

  for (const person of roster) {
    let managerId = overrides.has(person.id) ? overrides.get(person.id) : person.managerId || null;
    if (managerId && !byId.has(managerId)) {
      // A dangling manager is a data problem, not a root: it is reported.
      issues.missingManager.push(person.id);
      managerId = null;
    }
    if (managerId === person.id) {
      issues.selfManaged.push(person.id);
      managerId = null;
    }
    managerOf.set(person.id, managerId || null);
  }
  for (const id of overrides.keys()) {
    if (!byId.has(id)) issues.unknownMove.push(id);
  }

  // Break cycles deterministically: walk up from each node with a bounded step
  // count and cut the link that closes the loop.
  for (const person of roster) {
    const seen = [person.id];
    let cursor = managerOf.get(person.id);
    let guard = 0;
    while (cursor && guard < roster.length + 2) {
      if (seen.includes(cursor)) {
        issues.cycles.push(cursor);
        managerOf.set(cursor, null);
        break;
      }
      seen.push(cursor);
      cursor = managerOf.get(cursor);
      guard += 1;
    }
  }

  const reports = new Map(roster.map((person) => [person.id, []]));
  for (const person of roster) {
    const managerId = managerOf.get(person.id);
    if (managerId) reports.get(managerId)?.push(person.id);
  }
  for (const list of reports.values()) list.sort();

  // Depth by breadth-first walk from the roots. Anyone unreachable (which can
  // only happen through a cycle that survived the cut) is reported, not fixed.
  const roots = roster.filter((person) => !managerOf.get(person.id)).map((person) => person.id);
  const depth = new Map();
  const queue = roots.map((id) => ({ id, d: 0 }));
  while (queue.length) {
    const { id, d } = queue.shift();
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const child of reports.get(id) || []) queue.push({ id: child, d: d + 1 });
  }
  const unreachable = roster.filter((person) => !depth.has(person.id)).map((person) => person.id);
  for (const id of unreachable) depth.set(id, 0);

  const nodes = roster.map((person) => {
    const managerId = managerOf.get(person.id) || null;
    return {
      id: person.id,
      name: person.name,
      role: person.role || '',
      level: person.level || 'ic',
      managerId,
      reports: reports.get(person.id) || [],
      directReports: (reports.get(person.id) || []).length,
      depth: depth.get(person.id) ?? 0,
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // Units are managers with at least one direct report, largest first.
  const units = nodes
    .filter((node) => node.directReports > 0)
    .map((node) => {
      const members = [node.id, ...node.reports];
      // Brooks / Graicunas: unordered pairs inside the unit, manager included.
      const channels = (members.length * (members.length - 1)) / 2;
      return {
        managerId: node.id,
        managerName: node.name,
        span: node.directReports,
        depth: node.depth,
        memberIds: members,
        channels,
      };
    })
    .sort((a, b) => b.span - a.span || a.managerName.localeCompare(b.managerName));

  const layers = nodes.length ? Math.max(...nodes.map((node) => node.depth)) + 1 : 0;

  return {
    nodes,
    nodeById,
    byId,
    managerOf,
    roots,
    units,
    layers,
    headcount: nodes.length,
    issues,
    unreachable,
    // A person who reports to nobody in a workspace with more than one person
    // is either the leader or an orphan; the reader decides which, the model
    // does not guess.
    spanOf: (id) => nodeById.get(id)?.directReports ?? 0,
  };
}

/** Where a person sits after a set of moves: used for the churn count. */
function placementSignature(structure) {
  const out = new Map();
  for (const node of structure.nodes) out.set(node.id, `${node.managerId || 'root'}@${node.depth}`);
  return out;
}

/* ----------------------------------------------------------- responsibility */

function openCommitmentsFor(state, personId, now, windowWeeks) {
  const windowStart = addDays(dayKey(now), -windowWeeks * 7);
  const open = { delegations: 0, cases: 0, goals: 0 };
  const serviceDays = [];
  for (const delegation of state?.delegations || []) {
    if (!delegation || delegation.personId !== personId) continue;
    if (delegation.status === 'active') open.delegations += 1;
    if (delegation.status === 'done' && delegation.completedOn && delegation.delegatedOn) {
      if (delegation.completedOn >= windowStart) {
        const span = daysBetween(delegation.delegatedOn, delegation.completedOn);
        if (span !== null && span >= 0) serviceDays.push(span);
      }
    }
  }
  for (const kase of state?.cases || []) {
    if (!kase || kase.ownerId !== personId) continue;
    if (kase.status === 'open' || kase.status === 'mitigating') open.cases += 1;
    if (kase.status === 'resolved' && kase.resolvedOn && kase.openedOn && kase.resolvedOn >= windowStart) {
      const span = daysBetween(kase.openedOn, kase.resolvedOn);
      if (span !== null && span >= 0) serviceDays.push(span);
    }
  }
  for (const goal of state?.goals || []) {
    if (!goal || goal.ownerId !== personId) continue;
    if (goal.status === 'active') open.goals += 1;
    if (goal.status === 'done' && goal.completedOn) {
      const startedOn = String(goal.createdAt || '').slice(0, 10);
      if (goal.completedOn >= windowStart && startedOn) {
        const span = daysBetween(startedOn, goal.completedOn);
        if (span !== null && span >= 0) serviceDays.push(span);
      }
    }
  }
  return { open, serviceDays, totalOpen: open.delegations + open.cases + open.goals };
}

/**
 * The measured decision/commitment queue for one person.
 *
 * In steady state arrivals equal departures (Little, 1961), so the completion
 * count inside the window is the arrival-rate estimate: `λ = n / weeks`. `Ts` is
 * the median of that person's own completed spans and `Cs` their own
 * coefficient of variation. ρ = λ·Ts. Nothing here is assumed except `Ca` when
 * the sample cannot estimate arrival variability, and that assumption is
 * returned with the reading.
 */
export function personQueueModel(state, personId, { now = new Date(), windowWeeks = ORG_CONVENTIONS.queueWindowWeeks, minSample = ORG_CONVENTIONS.minQueueSample } = {}) {
  const { open, serviceDays, totalOpen } = openCommitmentsFor(state, personId, now, windowWeeks);
  const sample = serviceDays.length;
  if (sample < minSample) {
    return {
      personId,
      status: 'insufficient',
      sample,
      open: totalOpen,
      openBreakdown: open,
      serviceDaysMedian: median(serviceDays),
      utilisation: null,
      waitWeeks: null,
      percentiles: waitPercentiles(null),
      basis: `${sample} completed commitment(s) in the last ${windowWeeks} weeks; at least ${minSample} are needed before a service rate means anything`,
    };
  }
  const tsDays = median(serviceDays);
  const tsWeeks = tsDays / 7;
  const lambda = sample / windowWeeks;
  const rho = lambda * tsWeeks;
  const cs = coefficientOfVariation(serviceDays) ?? ORG_CONVENTIONS.assumedCa;
  const waitWeeks = kingmanWait({ utilisation: rho, serviceTime: tsWeeks, ca: ORG_CONVENTIONS.assumedCa, cs });
  return {
    personId,
    status: rho >= 1 ? 'unstable' : 'measured',
    sample,
    open: totalOpen,
    openBreakdown: open,
    serviceDaysMedian: round(tsDays, 1),
    serviceDaysMean: round(mean(serviceDays), 1),
    serviceWeeks: round(tsWeeks, 3),
    arrivalsPerWeek: round(lambda, 3),
    utilisation: round(rho, 3),
    ca: ORG_CONVENTIONS.assumedCa,
    cs: round(cs, 3),
    waitWeeks: waitWeeks === null ? null : round(waitWeeks, 3),
    percentiles: waitPercentiles(waitWeeks),
    basis: `λ = ${round(lambda, 3)}/wk from ${sample} completion(s); Ts = ${round(tsDays, 1)}d; Cs = ${round(cs, 2)}; Ca assumed ${ORG_CONVENTIONS.assumedCa}`,
  };
}

/**
 * Scale a measured queue to a proposed unit size.
 *
 * The scaling factor is the ratio of coordination channels in the unit *before*
 * and *after* the design — the manager's own channel count, manager included.
 * It is a **model**: more channels mean more concurrent asks arriving at one
 * decision queue. The measured λ, Ts and Cs are untouched, and the returned
 * object says which numbers were measured and which were derived.
 */
export function scaleQueue(queue, { channelsBefore, channelsAfter }) {
  if (!queue || queue.status === 'insufficient') {
    return { ...queue, scaled: false, model: null, modelNote: 'No measured service rate for this manager, so a counterfactual wait would be invented rather than derived.' };
  }
  if (!channelsBefore || !channelsAfter || channelsBefore <= 0) {
    return { ...queue, scaled: false, model: null, modelNote: 'The unit has no recorded coordination channels to scale from.' };
  }
  const factor = round(channelsAfter / channelsBefore, 4);
  const rho = round(queue.utilisation * factor, 3);
  const waitWeeks = kingmanWait({ utilisation: rho, serviceTime: queue.serviceWeeks, ca: queue.ca, cs: queue.cs });
  return {
    ...queue,
    scaled: true,
    factor,
    utilisation: rho,
    waitWeeks: waitWeeks === null ? null : round(waitWeeks, 3),
    percentiles: waitPercentiles(waitWeeks),
    status: rho >= 1 ? 'unstable' : 'measured',
    modelNote: `Arrivals scaled ×${factor} because the unit holds ${channelsAfter} coordination channel(s) instead of ${channelsBefore}. This scaling is a declared convention, not a measurement.`,
  };
}

/* -------------------------------------------------------------------- pay */

/**
 * The pay this workspace actually records. Latest merit cycle by effective date,
 * `currentPay` per person. A person with no row, or a row with a blank figure,
 * is absent from the map — never zero (the defect the merit terminal fixed).
 */
export function payIndex(state, now = new Date()) {
  const today = dayKey(now);
  const cycles = (state?.meritCycles || [])
    .filter((cycle) => cycle && cycle.rows && cycle.rows.length)
    .filter((cycle) => !cycle.effectiveOn || cycle.effectiveOn <= today)
    .sort((a, b) => String(b.effectiveOn || '').localeCompare(String(a.effectiveOn || '')));
  const index = new Map();
  for (const cycle of cycles) {
    for (const row of cycle.rows) {
      if (!row || !row.personId || index.has(row.personId)) continue;
      const pay = Number(row.currentPay);
      if (Number.isFinite(pay) && pay > 0) index.set(row.personId, { annual: pay, cycleId: cycle.id, effectiveOn: cycle.effectiveOn || null });
    }
  }
  return index;
}

/* ---------------------------------------------------------------- reading */

/**
 * A full structural reading of one structure.
 *
 * `coordination.annualCost` is `null` when no unit could be priced and a partial
 * figure (with `pricedShare`) when only some units could. A partial sum printed
 * without its denominator is the exact dishonesty this app keeps fixing.
 */
export function structureReading(state, structure, { now = new Date(), conventions = ORG_CONVENTIONS, queueDepth = 'fast' } = {}) {
  const conv = { ...ORG_CONVENTIONS, ...(conventions || {}) };
  const pay = payIndex(state, now);
  const nodesById = structure.nodeById;

  const spans = structure.units.map((unit) => unit.span);
  const overBand = structure.units
    .filter((unit) => unit.span > conv.spanMax)
    .map((unit) => ({ ...unit, over: unit.span - conv.spanMax }));
  const underBand = structure.units.filter((unit) => unit.span < conv.spanMin && unit.span > 0);

  // Coordination: channels are real; hours and money are declared conventions.
  let channels = 0;
  let pricedChannels = 0;
  let annualCost = 0;
  let pricedUnits = 0;
  const unitRows = structure.units.map((unit) => {
    channels += unit.channels;
    const hoursPerWeek = round(unit.channels * conv.coordinationHoursPerWeek, 2);
    const payRow = pay.get(unit.managerId) || null;
    const hourly = payRow ? payRow.annual / (52 * conv.loadedHoursPerWeek) : null;
    const annual = hourly === null ? null : round(hourly * hoursPerWeek * 52, 2);
    if (annual !== null) {
      pricedUnits += 1;
      pricedChannels += unit.channels;
      annualCost += annual;
    }
    return {
      ...unit,
      hoursPerWeek,
      annualCost: annual,
      hourlyRate: hourly === null ? null : round(hourly, 2),
      payBasis: payRow ? `recorded pay from cycle ${payRow.cycleId}` : 'no pay recorded for this manager',
      // Marginal channel cost of one more report: channels go from c to c+k.
      marginalChannels: unit.span + 1,
      marginalHoursPerWeek: round((unit.span + 1) * conv.coordinationHoursPerWeek, 2),
    };
  });

  // Queue: measured per manager from that manager's own completed commitments.
  const queueRows = structure.units.map((unit) => {
    const queue = personQueueModel(state, unit.managerId, {
      now,
      windowWeeks: conv.queueWindowWeeks,
      minSample: conv.minQueueSample,
    });
    return { managerId: unit.managerId, managerName: unit.managerName, span: unit.span, queue };
  });
  const measured = queueRows.filter((row) => row.queue.status !== 'insufficient');
  const waits = measured.map((row) => row.queue.percentiles.p80).filter((v) => typeof v === 'number');
  const overallQueue = {
    measuredCount: measured.length,
    unstableCount: queueRows.filter((row) => row.queue.status === 'unstable').length,
    insufficientCount: queueRows.length - measured.length,
    medianP50Weeks: median(measured.map((row) => row.queue.percentiles.p50).filter((v) => typeof v === 'number')),
    medianP80Weeks: median(waits),
    medianServiceDays: median(measured.map((row) => row.queue.serviceDaysMedian)),
    medianUtilisation: median(measured.map((row) => row.queue.utilisation)),
    note: measured.length
      ? `${measured.length} of ${queueRows.length} manager(s) have enough completed commitments to measure a queue. Waits are Kingman approximations from each manager's own history, exponentiated to percentiles.`
      : 'No manager has enough completed commitments to measure a service rate. Nothing here is a predicted wait — it is an absence of data.',
  };

  // Responsibility concentration across everyone in the tree.
  const loads = structure.nodes.map((node) => {
    const { totalOpen } = openCommitmentsFor(state, node.id, now, conv.queueWindowWeeks);
    return { personId: node.id, name: node.name, open: totalOpen, span: node.directReports };
  });
  const openValues = loads.map((row) => row.open);
  const sortedOpen = [...openValues].sort((a, b) => a - b);
  const load = {
    rows: loads.sort((a, b) => b.open - a.open),
    total: openValues.reduce((a, b) => a + b, 0),
    median: median(openValues),
    max: sortedOpen.length ? sortedOpen[sortedOpen.length - 1] : null,
    gini: gini(openValues),
    hhi: hhi(openValues),
    // A single person holding a large share of every open commitment is a
    // structural fact regardless of who it is.
    topSharePct: (() => {
      const total = openValues.reduce((a, b) => a + b, 0);
      if (!total) return null;
      return round(((sortedOpen[sortedOpen.length - 1] || 0) / total) * 100, 1);
    })(),
  };

  const rights = decisionRights(state);

  const verdict = (() => {
    if (!structure.units.length) return { id: 'undesigned', label: 'No structure recorded', detail: 'Nobody in this workspace has a recorded manager. Set reporting lines on the roster before a structural reading means anything.' };
    if (overBand.length) return { id: 'over-band', label: 'Over the declared span band', detail: `${overBand.length} manager(s) hold more direct reports than the declared maximum of ${conv.spanMax}.` };
    if (load.gini !== null && load.gini >= 0.6) return { id: 'concentrated', label: 'Responsibility is concentrated', detail: `Open commitments are distributed at a Gini of ${load.gini}, above the concentration convention of 0.60.` };
    return { id: 'within-band', label: 'Inside the declared conventions', detail: 'Every manager is inside the declared span band and responsibility is not concentrated.' };
  })();

  return {
    generatedOn: dayKey(now),
    conventions: conv,
    headcount: structure.headcount,
    layers: structure.layers,
    roots: structure.roots,
    units: unitRows,
    span: {
      min: spans.length ? Math.min(...spans) : null,
      max: spans.length ? Math.max(...spans) : null,
      median: median(spans),
      overBandCount: overBand.length,
      overBand,
      underBandCount: underBand.length,
      underBand: underBand.map((unit) => ({ managerId: unit.managerId, managerName: unit.managerName, span: unit.span })),
    },
    coordination: {
      channels,
      unitsWithChannels: structure.units.length,
      hoursPerWeek: round(channels * conv.coordinationHoursPerWeek, 2),
      pricedUnits,
      pricedChannels,
      pricedShare: channels ? round(pricedChannels / channels, 3) : 0,
      annualCost: pricedUnits ? round(annualCost, 2) : null,
      note: pricedUnits
        ? `Priced over ${pricedUnits} of ${structure.units.length} unit(s) holding ${pricedChannels} of ${channels} channel(s). A unit whose manager has no recorded pay is excluded from the money, never priced at zero or at the median.`
        : 'No manager in this structure has recorded pay, so coordination is measured in channels and hours only. The money figure is absent, not zero.',
    },
    queue: { rows: queueRows, ...overallQueue },
    load,
    rights,
    verdict,
    structure,
  };
}

/**
 * Where approval authority actually sits, from the decision record.
 *
 * `driver` and `approver` are free-text names by design (a decision may be
 * made with someone outside the roster), so this is a distribution over
 * *recorded* names and is labelled as such. It never maps a name to a person id.
 */
export function decisionRights(state) {
  const decisions = (state?.decisions || []).filter((d) => d && (d.approver || d.driver));
  const byApprover = new Map();
  for (const decision of decisions) {
    const key = String(decision.approver || '').trim().toLowerCase();
    if (!key) continue;
    byApprover.set(key, (byApprover.get(key) || 0) + 1);
  }
  const counts = [...byApprover.values()];
  const total = counts.reduce((a, b) => a + b, 0);
  const top = counts.length ? Math.max(...counts) : 0;
  return {
    total,
    distinctApprovers: byApprover.size,
    hhi: hhi(counts),
    topSharePct: total ? round((top / total) * 100, 1) : null,
    decidedCount: decisions.filter((d) => d.decidedOn).length,
    note: total
      ? `Measured over ${total} recorded decision(s) with a named approver. Names are free text, so this is a distribution over recorded strings, not a verified person-level org chart.`
      : 'No decision records a named approver, so authority concentration cannot be measured.',
  };
}

/* ------------------------------------------------------------- simulation */

/**
 * Evaluate one design against the live workspace. Zero writes.
 *
 * Returns the baseline reading (the structure as it stands), the proposed
 * reading (moves applied), the delta on every objective, per-manager queue
 * counterfactuals and the churn count.
 */
export function simulateDesign(state, design, { now = new Date(), conventions = ORG_CONVENTIONS } = {}) {
  const conv = { ...ORG_CONVENTIONS, ...(conventions || {}) };
  const baselineStructure = buildStructure(state);
  const proposedStructure = buildStructure(state, { moves: design?.moves || [] });
  const baseline = structureReading(state, baselineStructure, { now, conventions: conv });
  const proposed = structureReading(state, proposedStructure, { now, conventions: conv });

  // Churn: how many people end up with a different manager or a different depth.
  const before = placementSignature(baselineStructure);
  const after = placementSignature(proposedStructure);
  let moved = 0;
  const movedPeople = [];
  for (const [id, signature] of after) {
    if (before.get(id) !== signature) {
      moved += 1;
      movedPeople.push({ personId: id, name: proposedStructure.nodeById.get(id)?.name || 'Removed person', from: before.get(id) || null, to: signature });
    }
  }

  // Per-manager counterfactual queue, scaled by coordination channels.
  const queueByManager = new Map(proposed.queue.rows.map((row) => [row.managerId, row.queue]));
  const queueModel = proposed.units.map((unit) => {
    const beforeUnit = baseline.units.find((row) => row.managerId === unit.managerId) || null;
    const base = personQueueModel(state, unit.managerId, { now, windowWeeks: conv.queueWindowWeeks, minSample: conv.minQueueSample });
    const channelsBefore = beforeUnit ? beforeUnit.channels : unit.channels;
    const scaled = scaleQueue(base, { channelsBefore, channelsAfter: unit.channels });
    return {
      managerId: unit.managerId,
      managerName: unit.managerName,
      spanBefore: beforeUnit ? beforeUnit.span : null,
      spanAfter: unit.span,
      channelsBefore,
      channelsAfter: unit.channels,
      measured: base.status !== 'insufficient',
      utilisation: scaled.utilisation,
      waitP50Weeks: scaled.percentiles?.p50 ?? null,
      waitP80Weeks: scaled.percentiles?.p80 ?? null,
      status: scaled.status,
      note: scaled.modelNote,
    };
  });
  const modelledP80 = median(queueModel.map((row) => row.waitP80Weeks).filter((v) => typeof v === 'number'));

  const delta = {
    coordinationHoursPerWeek: round(proposed.coordination.hoursPerWeek - baseline.coordination.hoursPerWeek, 2),
    annualCost: proposed.coordination.annualCost === null || baseline.coordination.annualCost === null
      ? null
      : round(proposed.coordination.annualCost - baseline.coordination.annualCost, 2),
    overBandCount: proposed.span.overBandCount - baseline.span.overBandCount,
    maxSpan: (proposed.span.max ?? 0) - (baseline.span.max ?? 0),
    layers: proposed.layers - baseline.layers,
    medianWaitP80Weeks: proposed.queue.medianP80Weeks !== null && baseline.queue.medianP80Weeks !== null
      ? round(proposed.queue.medianP80Weeks - baseline.queue.medianP80Weeks, 3)
      : null,
    modelledWaitP80Weeks: modelledP80,
    moved,
    movedPeople,
  };

  return {
    designId: design?.id || null,
    label: design?.label || '',
    declaredOn: design?.declaredOn || null,
    status: design?.status || 'draft',
    baseline,
    proposed,
    delta,
    queueModel,
    objectives: {
      coordination: proposed.coordination.hoursPerWeek,
      span: proposed.span.overBandCount,
      latency: modelledP80,
      disruption: moved,
    },
    note: 'The proposed reading applies the declared moves to today’s roster. Queue counterfactuals scale measured arrival rates by coordination channels; that scaling is a convention, not an estimate.',
  };
}

/**
 * Pareto frontier over declared designs. A design is dominated when another is
 * at least as good on every objective and strictly better on one. Objectives
 * with no measured value are excluded from the comparison and the exclusion is
 * reported, because imputing them would rank designs on invented numbers.
 */
export function paretoFrontier(entries) {
  const usable = (entries || []).filter((entry) => entry && entry.objectives);
  const missingLatency = usable.filter((entry) => typeof entry.objectives.latency !== 'number').length;
  const ranked = [];
  for (const entry of usable) {
    const dominatedBy = usable.filter((other) => {
      if (other === entry) return false;
      const comparisons = ORG_DESIGN_OBJECTIVES.map((key) => {
        const a = entry.objectives[key];
        const b = other.objectives[key];
        if (typeof a !== 'number' || typeof b !== 'number') return null;
        if (a === b) return 0;
        return b < a ? 1 : -1; // 1 = other is better (every objective is minimised)
      }).filter((v) => v !== null);
      if (!comparisons.length) return false;
      return comparisons.every((v) => v >= 0) && comparisons.some((v) => v > 0);
    });
    ranked.push({
      designId: entry.designId,
      label: entry.label,
      objectives: entry.objectives,
      dominatedBy: dominatedBy.map((other) => other.designId),
      frontier: dominatedBy.length === 0,
    });
  }
  return {
    rows: ranked,
    frontierCount: ranked.filter((row) => row.frontier).length,
    missingLatency,
    note: missingLatency
      ? `${missingLatency} design(s) have no measured decision wait, so they are compared on coordination, span and churn only. A design is never ranked on an imputed latency.`
      : 'Every design carries a measured wait, so all four objectives are compared. No composite score is computed: a weighted index would hide the trade-off the leader has to make.',
  };
}

/* ------------------------------------------------------------- portfolio */

export function designContract(row) {
  if (!row) return {
    label: '',
    purpose: '',
    ownerId: null,
    moves: [],
    conventions: { ...ORG_CONVENTIONS },
    reviewHorizonDays: ORG_CONVENTIONS.reviewHorizonDays,
  };
  return {
    label: row.label || '',
    purpose: row.purpose || '',
    ownerId: row.ownerId || null,
    moves: row.moves || [],
    conventions: { ...ORG_CONVENTIONS, ...(row.conventions || {}) },
    reviewHorizonDays: Number.isFinite(Number(row.reviewHorizonDays)) ? Number(row.reviewHorizonDays) : ORG_CONVENTIONS.reviewHorizonDays,
  };
}

/** Every design, simulated, with the frontier. Cheap enough for a page render. */
export function designPortfolio(state, now = new Date()) {
  const designs = (state?.orgDesigns || []).filter((row) => row && row.status !== 'abandoned');
  const sims = designs.map((design) => {
    const contract = designContract(design);
    const sim = simulateDesign(state, design, { now, conventions: contract.conventions });
    return { ...sim, design, contract };
  });
  return {
    designs,
    simulations: sims,
    frontier: paretoFrontier(sims),
    live: sims.find((sim) => sim.design.status === 'draft') || sims[0] || null,
  };
}

/**
 * The frozen prediction taken at commit. It stores what was measured, what was
 * modelled and what was declared, separately, so a later score can tell which
 * one was wrong.
 */
export function freezeDesignSnapshot(simulation, { capturedAt, byId = null, appliedMoves = [], previousManagers = [] } = {}) {
  const { proposed, delta } = simulation;
  return {
    version: 1,
    capturedAt: capturedAt || null,
    byId,
    appliedMoves,
    previousManagers,
    after: {
      headcount: proposed.headcount,
      layers: proposed.layers,
      maxSpan: proposed.span.max,
      overBandCount: proposed.span.overBandCount,
      coordinationHoursPerWeek: proposed.coordination.hoursPerWeek,
      annualCost: proposed.coordination.annualCost,
      pricedShare: proposed.coordination.pricedShare,
      medianServiceDays: proposed.queue.medianServiceDays,
      measuredManagers: proposed.queue.measuredCount,
    },
    predicted: {
      // Modelled, not measured: the frozen number the later score compares to.
      modelledWaitP80Weeks: delta.modelledWaitP80Weeks,
      measuredWaitP80Weeks: proposed.queue.medianP80Weeks,
      overBandCount: proposed.span.overBandCount,
      coordinationHoursPerWeek: proposed.coordination.hoursPerWeek,
      // Bounded per-manager predictions, so a later score can be computed
      // manager by manager instead of against one workspace average.
      perManager: Object.fromEntries(
        (simulation.queueModel || []).slice(0, 40).map((row) => [row.managerId, {
          modelledWaitP80Weeks: row.waitP80Weeks,
          spanBefore: row.spanBefore,
          spanAfter: row.spanAfter,
        }]),
      ),
    },
    declared: {
      spanMin: proposed.conventions.spanMin,
      spanMax: proposed.conventions.spanMax,
      coordinationHoursPerWeek: proposed.conventions.coordinationHoursPerWeek,
      loadedHoursPerWeek: proposed.conventions.loadedHoursPerWeek,
    },
    moved: delta.moved,
    note: 'Frozen at commit. The measured and modelled waits are stored separately so a later score cannot credit a model for a measurement, or the reverse.',
  };
}

/**
 * Compare the frozen prediction with what the same managers measure later.
 * Absolute percentage error per manager, and the median, withheld below the
 * convention floor. A `null` prediction is not an error of zero.
 */
export function scoreDesignPrediction(state, design, { now = new Date(), minScored = ORG_CONVENTIONS.minScoredOutcomes } = {}) {
  const frozen = design?.snapshot;
  if (!frozen) return { status: 'not-frozen', rows: [], medianApePct: null, detail: 'No snapshot was frozen for this design.' };
  const conv = designContract(design).conventions;
  const structure = buildStructure(state);
  const rows = [];
  for (const managerId of Object.keys(frozen?.predicted?.perManager || {})) {
    const predicted = frozen.predicted.perManager[managerId];
    const unit = structure.units.find((row) => row.managerId === managerId) || null;
    const queue = personQueueModel(state, managerId, { now, windowWeeks: conv.queueWindowWeeks, minSample: conv.minQueueSample });
    const observed = queue.status === 'insufficient' ? null : queue.percentiles.p80;
    const expected = typeof predicted?.modelledWaitP80Weeks === 'number' ? predicted.modelledWaitP80Weeks : null;
    const ape = expected && observed !== null && expected > 0
      ? round((Math.abs(observed - expected) / expected) * 100, 1)
      : null;
    rows.push({ managerId, predicted: expected, observed, apePct: ape, span: unit?.span ?? null, status: queue.status });
  }
  const scored = rows.filter((row) => typeof row.apePct === 'number');
  return {
    status: scored.length >= minScored ? 'scored' : 'insufficient',
    rows,
    scoredCount: scored.length,
    minScored,
    medianApePct: scored.length >= minScored ? median(scored.map((row) => row.apePct)) : null,
    detail: scored.length >= minScored
      ? `Median absolute percentage error across ${scored.length} manager(s). This grades the queue *model* the design relied on, not the leader's judgement.`
      : `${scored.length} manager(s) have both a frozen prediction and a new measured wait; ${minScored} are required before a median error is reported.`,
  };
}

/* --------------------------------------------------------------- signals */

const LABEL = 'Structural design';

/**
 * ORD-01..06. Decision-shaped findings only; each carries the route that shows
 * the evidence, because a finding the leader cannot inspect is an alert.
 */
export function orgDesignSignals(state, now = new Date()) {
  const out = [];
  const designs = (state?.orgDesigns || []).filter((row) => row && row.status !== 'abandoned');

  // ORD-01: a live structure outside the declared band, independent of any
  // declared design. This is the signal a leader gets before they have looked.
  const live = structureReading(state, buildStructure(state), { now, conventions: conventionsFromSettings(state) });
  for (const unit of live.span.overBand.slice(0, 2)) {
    out.push({
      ruleId: 'ORD-01',
      domain: LABEL,
      severity: unit.over >= 4 ? 4 : 3,
      confidence: 'high',
      title: `${unit.managerName} holds ${unit.span} direct reports, ${unit.over} above the declared maximum`,
      detail: `The declared band tops out at ${live.conventions.spanMax}. At ${unit.hoursPerWeek} coordination hours per week this unit alone carries ${unit.channels} channel(s); every additional report adds ${unit.marginalHoursPerWeek} hours of the same.`,
      evidence: [
        `${unit.span} direct reports`,
        `${unit.channels} coordination channels`,
        `${unit.hoursPerWeek} hrs/week of coordination`,
      ],
      action: { label: 'Open the structural reading', route: '#/orgdesign' },
    });
  }

  // ORD-02: a measured, unstable decision queue — the structural cause of
  // "everything takes forever", with the manager's own numbers behind it.
  for (const row of live.queue.rows.filter((entry) => entry.queue.status === 'unstable').slice(0, 2)) {
    out.push({
      ruleId: 'ORD-02',
      domain: LABEL,
      severity: 4,
      confidence: 'medium',
      title: `${row.managerName}’s decision queue is unstable at ρ = ${row.queue.utilisation}`,
      detail: 'Arrivals exceed the measured service rate, so the wait has no finite expectation. Queue theory is unambiguous here: adding utilisation past 1 does not slow the queue, it removes the ceiling.',
      evidence: [row.queue.basis, `${row.queue.open} open commitment(s)`],
      action: { label: 'See the queue reading', route: '#/orgdesign?panel=queue' },
    });
  }

  // ORD-03: declared designs that were never committed.
  const stale = designs.filter((design) => design.status === 'draft' && design.declaredOn && (daysBetween(design.declaredOn, dayKey(now)) ?? 0) > 21);
  if (stale.length) {
    out.push({
      ruleId: 'ORD-03',
      domain: LABEL,
      severity: 3,
      confidence: 'high',
      title: `${stale.length} declared structural design(s) have sat uncommitted for more than three weeks`,
      detail: 'A design that is neither committed nor abandoned is a decision the leader has already made privately. Declaring it changes nothing; the reporting lines are still the old ones.',
      evidence: stale.slice(0, 3).map((design) => `${design.label}: declared ${design.declaredOn}`),
      action: { label: 'Commit or abandon', route: `#/orgdesign?design=${encodeURIComponent(stale[0].id)}` },
    });
  }

  // ORD-04: a committed design whose horizon has closed and was never scored.
  for (const design of designs.filter((row) => row.status === 'committed' && row.reviewOn && row.reviewOn <= dayKey(now))) {
    out.push({
      ruleId: 'ORD-04',
      domain: LABEL,
      severity: 3,
      confidence: 'high',
      title: `The “${design.label}” design passed its review date on ${design.reviewOn} and has not been scored`,
      detail: 'A frozen prediction that is never compared to the record is a preference. Scoring it is the only way to learn whether the queue model that guided it was any good.',
      evidence: [design.snapshot ? 'A snapshot is frozen and ready to score' : 'No snapshot was frozen'],
      action: { label: 'Score the design', route: `#/orgdesign?design=${encodeURIComponent(design.id)}&panel=designs` },
    });
  }

  // ORD-05: approval authority in one place.
  if (live.rights.total >= 8 && live.rights.hhi !== null && live.rights.hhi >= 6000) {
    out.push({
      ruleId: 'ORD-05',
      domain: LABEL,
      severity: 3,
      confidence: 'medium',
      title: `Approval authority is concentrated: HHI ${live.rights.hhi} over ${live.rights.total} decisions`,
      detail: live.rights.note,
      evidence: [`${live.rights.distinctApprovers} recorded approver(s)`, `${live.rights.topSharePct}% of decisions by the top approver`],
      action: { label: 'Open the rights reading', route: '#/orgdesign?panel=rights' },
    });
  }

  // ORD-06: a design scored below its own model, or a live structure with no
  // recorded reporting lines at all.
  for (const design of designs.filter((row) => row.status === 'settled')) {
    const score = scoreDesignPrediction(state, design, { now });
    if (score.status === 'scored' && score.medianApePct !== null && score.medianApePct > 50) {
      out.push({
        ruleId: 'ORD-06',
        domain: LABEL,
        severity: 3,
        confidence: 'medium',
        title: `The queue model behind “${design.label}” missed by ${score.medianApePct}%`,
        detail: 'The scaling convention under-predicts or over-predicts this workspace’s waits. Read the module’s convention as a hypothesis rather than a rate.',
        evidence: score.rows.slice(0, 3).map((row) => `Predicted ${row.predicted}w, observed ${row.observed}w (${row.apePct}%)`),
        action: { label: 'Open the calibration', route: `#/orgdesign?design=${encodeURIComponent(design.id)}&panel=designs` },
      });
    }
  }
  if (!live.units.length && (state?.people || []).length >= 3) {
    out.push({
      ruleId: 'ORD-06',
      domain: LABEL,
      severity: 2,
      confidence: 'high',
      title: 'No reporting lines are recorded, so no structural question can be answered',
      detail: 'Span, coordination and decision latency all depend on who reports to whom. The roster needs a manager on each person before this module has anything to measure.',
      evidence: [`${(state?.people || []).length} people`, '0 managers'],
      action: { label: 'Record reporting lines', route: '#/people' },
    });
  }

  return out;
}

export function orgDesignAttention(state, now = new Date()) {
  return orgDesignSignals(state, now).filter((signal) => signal.severity >= 3).length;
}

/* ----------------------------------------------------------------- brief */

export function orgDesignBrief(state, now = new Date()) {
  const reading = structureReading(state, buildStructure(state), { now, conventions: conventionsFromSettings(state) });
  const portfolio = designPortfolio(state, now);
  const money = (value) => (value === null ? 'not priced' : `USD ${Math.round(value).toLocaleString('en-US')}`);
  const lines = [];
  lines.push('STRUCTURAL DESIGN BRIEF');
  lines.push(`Generated ${dayKey(now)} · LeadOS Schema v53`);
  lines.push('');
  lines.push(`${reading.headcount} people, ${reading.layers} layer(s), ${reading.units.length} manager(s) with direct reports.`);
  lines.push(`Span: median ${reading.span.median ?? '—'}, max ${reading.span.max ?? '—'}, ${reading.span.overBandCount} over the declared ${reading.conventions.spanMin}–${reading.conventions.spanMax} band.`);
  lines.push(`Coordination: ${reading.coordination.channels} channel(s), ${reading.coordination.hoursPerWeek} hrs/week, ${money(reading.coordination.annualCost)} a year over the priced subset.`);
  lines.push(`Decision queue: ${reading.queue.measuredCount} of ${reading.queue.rows.length} manager(s) measurable; median P80 wait ${reading.queue.medianP80Weeks ?? 'not measured'} weeks.`);
  lines.push(`Verdict: ${reading.verdict.label} — ${reading.verdict.detail}`);
  lines.push('');
  if (!portfolio.simulations.length) {
    lines.push('No structural design is declared. Nothing here is a recommendation.');
    return lines.join('\n');
  }
  lines.push('DECLARED DESIGNS');
  for (const sim of portfolio.simulations) {
    const frontierRow = portfolio.frontier.rows.find((row) => row.designId === sim.designId);
    lines.push(
      `- ${sim.label} [${ORG_DESIGN_STATUS_LABELS[sim.design.status] || sim.design.status}] `
      + `Δcoordination ${sim.delta.coordinationHoursPerWeek} hrs/wk, Δover-band ${sim.delta.overBandCount}, `
      + `Δwait ${sim.delta.modelledWaitP80Weeks === null ? 'not modelled' : `${sim.delta.modelledWaitP80Weeks} wks`}, `
      + `${sim.delta.moved} person(s) move — ${frontierRow?.frontier ? 'on the frontier' : 'dominated'}.`,
    );
  }
  lines.push('');
  lines.push('LIMITS: the counterfactual wait scales measured arrivals by coordination channels; that scaling is a convention, not an estimate. No protected characteristic, performance rating or pay figure is used to choose a structure, and nothing here recommends which person should report to which.');
  return lines.join('\n');
}
