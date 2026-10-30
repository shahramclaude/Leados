/**
 * app/core/domain/signalPath.js — the Signal Path terminal (Session 85, Schema v59).
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * Every other screen in this workspace answers a question about a record the
 * leader already has. This one answers the question that decides whether the
 * leader will ever *get* the record: **if something goes wrong three levels
 * below me, what is the chance I hear about it — and how long after everyone
 * else does it reach my desk?**
 *
 * That is not a metaphor. It is a series reliability problem with a latency
 * budget, and it has exact arithmetic.
 *
 * WHAT IS MODELLED (named frameworks, each actually computed)
 * -----------------------------------------------------------
 *  - **Reliability block diagrams (series and parallel decomposition).** A
 *    report that must pass through *d* relays reaches the top only if every
 *    relay forwards it: `reach = Π t_j`. An independent direct channel (a
 *    skip-level, an anonymous escalation line, an automated monitor) is a
 *    parallel branch, so `reach = 1 − (1 − Π t_j)(1 − q)`. The same
 *    decomposition is applied to false alarms, which is why a deeper hierarchy
 *    is simultaneously *less* sensitive and *more* prone to crying wolf.
 *  - **Shannon (1948) mutual information.** The hierarchy is a channel. The
 *    source is one bit — "something material is happening, or not". The
 *    receiver sees "alert" or "silence". `I(X;Y)` in bits is computed exactly
 *    from the four joint probabilities, so the page can say *this chain
 *    carries 0.31 of the 1.00 bit that a binary alarm carries*.
 *  - **Signal detection theory (Green & Swets, 1966).** Probes — not
 *    surveillance — give a hit count, a false-alarm count and therefore
 *    `d′ = z(H) − z(F)`. A channel can be made louder without being made
 *    better; d′ separates the two.
 *  - **The mum effect (Rosen & Tesser, 1970).** Upward bad-news suppression is
 *    the reason the per-hop transmit probability is below one, and it is a
 *    declared convention printed beside its own number.
 *  - **Capital budgeting against an opportunity cost.** Every intervention is
 *    priced in leader-hours, its benefit is computed by re-running the *same*
 *    evaluator, and the resulting value-per-hour is compared with a hurdle
 *    rate. When an Attention Market plan exists and its budget binds, its
 *    measured shadow price — the leader's own price of one more hour — is the
 *    hurdle. A lever that does not clear it is shown and refused, not hidden.
 *
 * WHAT IS DELIBERATELY NOT MODELLED, AND SAID SO IN THE UI
 * --------------------------------------------------------
 *  - **No surveillance.** There is no message, calendar, keystroke or sentiment
 *    reading anywhere in this module, and no outbound call. Every number comes
 *    from a record the leader typed or a parameter the leader declared.
 *  - **No person is scored.** A hop's transmit probability is a property of the
 *    *channel*, declared once, not an assessment of the human on it. The
 *    module cannot and does not say "Ana filters bad news".
 *  - **Independence is assumed, not verified.** Adding reach across parallel
 *    branches assumes the branches fail independently, which a skip-level and
 *    an escalation line plausibly do not. The page prints that.
 *  - **Latency is conditional on arrival.** A signal that never arrives has no
 *    arrival time; the module prints the latency of the signals that do arrive
 *    and prices the non-arrivals through the loss term instead of pretending
 *    they are infinitely late.
 *  - **Loss accrues linearly.** The single convention `loss = exposure ×
 *    min(1, lag / horizon)` is declared, printed and testable. It is not a
 *    claim about any particular failure mode's damage curve.
 *
 * Pure module: no DOM, no storage, no network, no wall clock, no randomness.
 * Every function takes its inputs and returns a plain value.
 */

import { addDays, clamp, dayKey, daysBetween, round } from '../time.js';

export const SIGNAL_ENGINE_VERSION = 'signal-path-2026.10-v1';

export const SIGNAL_STATUSES = Object.freeze(['declared', 'committed', 'retired']);
export const SIGNAL_PROBE_STATUSES = Object.freeze(['open', 'settled', 'abandoned']);
export const SIGNAL_TRUTHS = Object.freeze(['event', 'none']);
export const SIGNAL_LEARNED_VIA = Object.freeze(['escalation', 'skip-level', 'monitoring', 'accident', 'never']);

export const SIGNAL_LEARNED_VIA_LABELS = Object.freeze({
  escalation: 'Through the chain',
  'skip-level': 'Skip-level conversation',
  monitoring: 'A monitor or dashboard caught it',
  accident: 'By accident',
  never: 'I still do not know',
});

export const SIGNAL_STATUS_LABELS = Object.freeze({
  declared: 'Draft',
  committed: 'Committed',
  retired: 'Retired',
});

export const SIGNAL_RULE_IDS = Object.freeze({
  DECLARE: 'RULE-SIG-01',
  PROBE: 'RULE-SIG-02',
  CASE: 'RULE-SIG-03',
  LEVER: 'RULE-SIG-04',
});

export const SIGNAL_DECLARED_EVENT = 'signal.declared';
export const SIGNAL_PROBED_EVENT = 'signal.probed';
export const SIGNAL_LEVER_EVENT = 'signal.lever';

/** Below this many settled probes a rate is shown as a count and nothing else. */
export const SIGNAL_MIN_PROBES = 6;
/** An observed hit rate this far below the declared reach is a contradiction. */
export const SIGNAL_UNDER_REACH_PP = 12;
/** Hop transmit probabilities are clamped to a range a human can defend. */
export const SIGNAL_MIN_TRANSMIT = 0.05;
export const SIGNAL_MAX_TRANSMIT = 0.99;
/** No path is priced past this depth; beyond it the model is a fiction. */
export const SIGNAL_MAX_DEPTH = 8;

/* ------------------------------------------------------------------ maths */

/** Binary entropy in bits. */
export function binaryEntropy(p) {
  if (!(p > 0) || !(p < 1)) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/**
 * Mutual information, in bits, between "a material event happened" (prior
 * `theta`) and "an alert reached the top" (a 2×2 channel with sensitivity
 * `reach` and false-alarm rate `falseAlarm`).
 *
 * This is Shannon's `I(X;Y)` over a binary asymmetric channel, computed from
 * the four joint probabilities rather than estimated. It is the honest one-line
 * answer to "how much does this hierarchy actually tell me?".
 */
export function channelInformation(theta, reach, falseAlarm) {
  const t = clamp(Number(theta), 0, 1);
  const r = clamp(Number(reach), 0, 1);
  const a = clamp(Number(falseAlarm), 0, 1);
  if (!(t > 0) || !(t < 1)) return 0;
  const px = [t, 1 - t];
  const branch = [[r, 1 - r], [a, 1 - a]];
  const py = [
    px[0] * branch[0][0] + px[1] * branch[1][0],
    px[0] * branch[0][1] + px[1] * branch[1][1],
  ];
  let mi = 0;
  for (let x = 0; x < 2; x += 1) {
    for (let y = 0; y < 2; y += 1) {
      const pij = px[x] * branch[x][y];
      if (pij <= 0 || py[y] <= 0) continue;
      mi += pij * Math.log2(pij / (px[x] * py[y]));
    }
  }
  // Floating point can produce a tiny negative near a degenerate channel.
  return Math.max(0, mi);
}

/** Wilson score interval for a binomial proportion. Refuses an empty sample. */
export function wilsonInterval(k, n, z = 1.96) {
  const hits = Number(k);
  const total = Number(n);
  if (!Number.isFinite(hits) || !Number.isFinite(total) || total <= 0) return null;
  const p = Math.min(1, Math.max(0, hits / total));
  const denom = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return {
    low: round(Math.max(0, centre - half), 3),
    high: round(Math.min(1, centre + half), 3),
    p: round(p, 3),
    n: total,
  };
}

/**
 * Acklam's rational approximation to the inverse normal CDF, refined once by
 * Halley's method. Deterministic to ~1e-9 and dependency-free, which matters in
 * a zero-build app that may not import a statistics package.
 */
export function inverseNormal(p) {
  const q = Number(p);
  if (!(q > 0 && q < 1)) return null;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let x;
  if (q < plow) {
    const r = Math.sqrt(-2 * Math.log(q));
    x = (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5])
      / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  } else if (q > phigh) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    x = -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5])
      / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  } else {
    const r = q - 0.5;
    const s = r * r;
    x = (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r
      / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
  }
  // One Halley refinement.
  const e = 0.5 * (1 + erf(x / Math.SQRT2)) - q;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Abramowitz & Stegun 7.1.26 error function; |ε| < 1.5e-7. */
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/**
 * d′ from a hit count and a false-alarm count using the log-linear correction
 * (Hautus, 1995) so a small sample cannot produce an infinite discriminability.
 */
export function detectionSensitivity({ hits = 0, events = 0, falseAlarms = 0, negatives = 0 } = {}) {
  const h = Number(hits);
  const n = Number(events);
  const f = Number(falseAlarms);
  const m = Number(negatives);
  if (!Number.isFinite(h) || !Number.isFinite(n) || !Number.isFinite(f) || !Number.isFinite(m)) return null;
  if (n <= 0) return null;
  const hitRate = (h + 0.5) / (n + 1);
  const faRate = m > 0 ? (f + 0.5) / (m + 1) : 0.5 / (m + 1);
  const zh = inverseNormal(Math.min(0.999999, Math.max(0.000001, hitRate)));
  const zf = inverseNormal(Math.min(0.999999, Math.max(0.000001, faRate)));
  if (zh === null || zf === null) return null;
  return {
    dPrime: round(zh - zf, 2),
    criterion: round(-0.5 * (zh + zf), 2),
    hitRate: round(hitRate, 3),
    falseAlarmRate: round(faRate, 3),
    events: n,
    negatives: m,
  };
}

/** Brier score over `{p, outcome}` pairs. Refuses an empty sample. */
export function brierScore(pairs = []) {
  const rows = (Array.isArray(pairs) ? pairs : []).filter(
    (row) => row && Number.isFinite(Number(row.p)) && (row.outcome === 0 || row.outcome === 1 || row.outcome === true || row.outcome === false),
  );
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => {
    const p = clamp(Number(row.p), 0, 1);
    const o = row.outcome === true || row.outcome === 1 ? 1 : 0;
    return sum + (p - o) ** 2;
  }, 0);
  return { score: round(total / rows.length, 4), n: rows.length };
}

/* --------------------------------------------------------- structure */

/**
 * Build the reporting index from the roster alone. The leader is not a person
 * node: a person with no manager in the roster reports to the leader, and their
 * depth is 1. A manager cycle is detected and excluded rather than silently
 * producing an arbitrary depth.
 */
export function buildReportingIndex(people = []) {
  const byId = new Map();
  for (const person of people) {
    if (person && person.id && person.status !== 'archived') byId.set(person.id, person);
  }
  const memo = new Map();
  const cycles = new Set();
  const walk = (id, stack) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) {
      cycles.add(id);
      return null;
    }
    const person = byId.get(id);
    if (!person) return 0;
    const managerId = person.managerId && byId.has(person.managerId) ? person.managerId : null;
    if (!managerId) {
      memo.set(id, 1);
      return 1;
    }
    stack.add(id);
    const parent = walk(managerId, stack);
    stack.delete(id);
    const value = parent === null ? null : parent + 1;
    memo.set(id, value);
    return value;
  };
  const nodes = [];
  for (const person of byId.values()) {
    const depth = walk(person.id, new Set());
    nodes.push({
      personId: person.id,
      name: String(person.name || '').slice(0, 120),
      role: String(person.role || '').slice(0, 120),
      managerId: person.managerId && byId.has(person.managerId) ? person.managerId : null,
      depth,
    });
  }
  nodes.sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99) || a.name.localeCompare(b.name));
  return { byId, nodes, cycles: [...cycles], depthOf: (id) => memo.get(id) ?? null };
}

/** The chain from `personId` upward to the top of its branch, origin first. */
export function pathFor(index, personId) {
  const chain = [];
  let current = personId;
  const seen = new Set();
  while (current && index.byId.has(current) && !seen.has(current)) {
    seen.add(current);
    const node = index.byId.get(current);
    chain.push({
      personId: node.id,
      name: String(node.name || '').slice(0, 120),
      managerId: node.managerId && index.byId.has(node.managerId) ? node.managerId : null,
      depthFromOrigin: chain.length + 1,
      top: !(node.managerId && index.byId.has(node.managerId)),
    });
    current = node.managerId;
  }
  return chain;
}

/**
 * The wait to the next scheduled conversation with a person, derived from the
 * leader's own 1:1 history: the observed spacing between the last two meetings,
 * minus the days since the last one, floored at zero. With fewer than two
 * meetings there is no measured spacing and the declared convention is used.
 */
export function leaderWaitDays(state = {}, personId, conventions, now = new Date()) {
  const meetings = (state.oneOnOnes || [])
    .filter((m) => m && m.personId === personId && m.date && m.status !== 'skipped')
    .map((m) => m.date)
    .sort();
  const fallback = conventions.cadenceDays;
  if (meetings.length < 2) {
    return { days: fallback, basis: meetings.length ? 'one meeting logged — declared 1:1 cadence used' : 'declared 1:1 cadence (no 1:1 logged)' };
  }
  const last = meetings[meetings.length - 1];
  const prior = meetings[meetings.length - 2];
  const spacing = daysBetween(prior, last);
  const since = daysBetween(last, dayKey(now));
  if (!Number.isFinite(spacing) || spacing <= 0) {
    return { days: fallback, basis: 'declared 1:1 cadence (unusable history)' };
  }
  const observed = Math.min(90, spacing);
  const wait = Math.max(0, observed - Math.max(0, since ?? 0));
  return {
    days: round(wait, 1),
    basis: `${observed}-day observed 1:1 spacing, ${Math.max(0, since ?? 0)} day(s) since the last one`,
  };
}

/**
 * Evaluate one channel. This is the single arithmetic the whole module reuses:
 * a lever is priced by calling this again with different hop parameters, so a
 * recommendation and the baseline can never drift apart.
 */
export function evaluateChannel({
  hops = [],
  direct = null,
  theta = 0.5,
  exposure = null,
  horizonDays = null,
} = {}) {
  const chain = Array.isArray(hops) ? hops : [];
  let ladderReach = 1;
  let ladderGap = 1;
  let ladderLag = 0;
  for (const hop of chain) {
    ladderReach *= clamp(Number(hop.transmit), 0, 1);
    ladderGap *= 1 - clamp(Number(hop.falseAlarm), 0, 1);
    ladderLag += Math.max(0, Number(hop.lagDays) || 0);
  }
  const ladderFalse = 1 - ladderGap;
  const directOn = !!(direct && direct.enabled);
  const directReach = directOn ? clamp(Number(direct.detect), 0, 1) : 0;
  const directFalse = directOn ? clamp(Number(direct.falseAlarm), 0, 1) : 0;
  const directLag = directOn ? Math.max(0, Number(direct.lagDays) || 0) : 0;

  const reach = 1 - (1 - ladderReach) * (1 - directReach);
  const falseAlarm = 1 - (1 - ladderFalse) * (1 - directFalse);
  // Latency conditional on arrival, weighted by which branch produced it.
  const viaLadder = ladderReach * (1 - directReach);
  const viaDirectOnly = (1 - ladderReach) * directReach;
  const arriving = viaLadder + viaDirectOnly;
  const latencyDays = arriving > 0
    ? round((viaLadder * ladderLag + viaDirectOnly * directLag) / arriving, 2)
    : round(ladderLag, 2);

  const prior = clamp(Number(theta), 0, 1);
  const sourceBits = binaryEntropy(prior);
  const carriedBits = channelInformation(prior, reach, falseAlarm);

  let expectedLoss = null;
  let lossBasis = 'no declared exposure — the channel is quantified, the money is not';
  if (exposure !== null && exposure !== undefined && Number.isFinite(Number(exposure)) && Number(exposure) > 0) {
    const horizon = Number(horizonDays);
    const ramp = Number.isFinite(horizon) && horizon > 0 ? Math.min(1, latencyDays / horizon) : 1;
    expectedLoss = round(prior * Number(exposure) * (1 - reach * (1 - ramp)), 2);
    lossBasis = Number.isFinite(horizon) && horizon > 0
      ? `prior ${round(prior, 3)} × exposure ${Math.round(Number(exposure))} × (1 − reach × (1 − min(1, ${latencyDays}/${round(horizon, 0)})))`
      : `prior ${round(prior, 3)} × exposure ${Math.round(Number(exposure))}: no horizon declared, so a late report is treated as no mitigation`;
  }

  const weakest = chain.reduce(
    (worst, hop) => (worst === null || Number(hop.transmit) < Number(worst.transmit) ? hop : worst),
    null,
  );

  return {
    hopCount: chain.length,
    ladderReach: round(ladderReach, 4),
    directReach: round(directReach, 4),
    reach: round(reach, 4),
    falseAlarm: round(falseAlarm, 4),
    latencyDays,
    ladderLatencyDays: round(ladderLag, 2),
    directLatencyDays: round(directLag, 2),
    prior,
    sourceBits: round(sourceBits, 4),
    carriedBits: round(carriedBits, 4),
    lostBits: round(Math.max(0, sourceBits - carriedBits), 4),
    exposure: exposure === null || exposure === undefined ? null : round(Number(exposure), 2),
    expectedLoss,
    lossBasis,
    weakestHop: weakest
      ? { personId: weakest.personId || null, name: weakest.name || '', transmit: round(Number(weakest.transmit), 4) }
      : null,
  };
}

/* ------------------------------------------------------------ levers */

export const SIGNAL_LEVER_IDS = Object.freeze([
  'skip-level',
  'cadence',
  'escalation',
  'review',
  'monitoring',
]);

export const SIGNAL_LEVER_LABELS = Object.freeze({
  'skip-level': 'A direct skip-level channel from the origin',
  cadence: 'Run the 1:1s on the declared cadence',
  escalation: 'An escalation line that bypasses the chain',
  review: 'A blameless review habit after every miss',
  monitoring: 'An automated monitor on the leading indicator',
});

export const SIGNAL_LEVER_BLURB = Object.freeze({
  'skip-level': 'You hear the origin directly, in parallel with the chain. Adds a second branch, so it helps most where the chain is deepest.',
  cadence: 'Cuts the waiting time at every relay to the declared target. Changes latency only — a relay that will not forward the news still will not forward it sooner.',
  escalation: 'A named route that does not pass through anyone who is motivated to soften the message. Adds reach and false alarms together; the page shows both.',
  review: 'Raises the declared transmit probability at every relay by learning from near misses. The most direct attack on the mum effect, and the slowest to take effect.',
  monitoring: 'A measured leading indicator that alerts you without a human relaying it. Only as good as the indicator, which the Early-Warning Watch already grades.',
});

/**
 * Apply one lever to the hop/direct-channel description of a path and hand the
 * result back to `evaluateChannel`. Nothing here invents a reading: each lever
 * changes a declared parameter, and the same evaluator reports the consequence.
 */
function mergeBranch(current, { detect, falseAlarm, lagDays }) {
  const on = !!(current && current.enabled === true);
  return {
    enabled: true,
    detect: on ? Math.max(Number(current.detect) || 0, detect) : detect,
    falseAlarm: on ? Math.max(Number(current.falseAlarm) || 0, falseAlarm) : falseAlarm,
    lagDays: on ? Math.min(Number(current.lagDays) || 0, lagDays) : lagDays,
  };
}

export function applyLever({ hops = [], direct = null }, leverId, conventions) {
  const c = conventions;
  const nextHops = hops.map((hop) => ({ ...hop }));
  const current = direct && direct.enabled ? direct : null;
  let nextDirect = current ? { ...current } : { enabled: false };
  if (leverId === 'skip-level') {
    nextDirect = mergeBranch(current, {
      detect: c.skipLevelDetect,
      falseAlarm: c.skipLevelFalseAlarm,
      lagDays: c.skipLevelLagDays,
    });
  } else if (leverId === 'cadence') {
    for (const hop of nextHops) hop.lagDays = Math.min(Number(hop.lagDays) || 0, c.cadenceTargetDays);
  } else if (leverId === 'escalation') {
    nextDirect = mergeBranch(current, {
      detect: c.escalationDetect,
      falseAlarm: c.escalationFalseAlarm,
      lagDays: c.escalationLagDays,
    });
  } else if (leverId === 'review') {
    for (const hop of nextHops) {
      hop.transmit = Math.min(SIGNAL_MAX_TRANSMIT, Number(hop.transmit) + c.reviewLift);
    }
  } else if (leverId === 'monitoring') {
    nextDirect = mergeBranch(current, {
      detect: c.monitoringDetect,
      falseAlarm: c.monitoringFalseAlarm,
      lagDays: c.monitoringLagDays,
    });
  }
  return { hops: nextHops, direct: nextDirect };
}

/** Leader-hours each lever costs over the class's own horizon. */
export function leverHours(leverId, reading, conventions) {
  const weeks = Math.max(1, (Number(reading.horizonDays) || conventions.reviewHorizonDays) / 7);
  const hops = Math.max(1, Number(reading.hopCount) || 1);
  switch (leverId) {
    case 'skip-level': return round(conventions.skipLevelHoursPerWeek * weeks, 2);
    case 'cadence': return round(conventions.cadenceHoursPerHop * hops * weeks, 2);
    case 'escalation': return round(conventions.escalationHours, 2);
    case 'review': return round(conventions.reviewHoursPerHop * hops, 2);
    case 'monitoring': return round(conventions.monitoringHours, 2);
    default: return null;
  }
}

/**
 * Price every lever. `hourValue` is the leader's own price of an hour — the
 * Attention Market's measured shadow price where it binds, otherwise the
 * declared setting. `value` is the reduction in expected loss for this class
 * over its horizon; `valuePerHour` is that divided by the hours the lever costs.
 */
export function priceLevers({ hops, direct, theta, exposure, horizonDays, hopCount }, conventions, { hourValue = null } = {}) {
  const base = evaluateChannel({ hops, direct, theta, exposure, horizonDays });
  const price = Number.isFinite(Number(hourValue)) && Number(hourValue) > 0
    ? Number(hourValue)
    : conventions.hourValue;
  const priceSource = Number.isFinite(Number(hourValue)) && Number(hourValue) > 0
    ? 'your measured price of one more hour (Attention Market shadow price)'
    : 'the declared value of an hour in settings';
  const rows = [];
  for (const leverId of SIGNAL_LEVER_IDS) {
    const next = applyLever({ hops, direct }, leverId, conventions);
    const after = evaluateChannel({ ...next, theta, exposure, horizonDays });
    const hours = leverHours(leverId, { horizonDays, hopCount }, conventions);
    const value = base.expectedLoss === null || after.expectedLoss === null
      ? null
      : round(base.expectedLoss - after.expectedLoss, 2);
    const cost = hours === null ? null : round(hours * price, 2);
    const net = value === null || cost === null ? null : round(value - cost, 2);
    const valuePerHour = value === null || !hours ? null : round(value / hours, 2);
    rows.push({
      leverId,
      label: SIGNAL_LEVER_LABELS[leverId],
      blurb: SIGNAL_LEVER_BLURB[leverId],
      hours,
      reachBefore: base.reach,
      reachAfter: after.reach,
      deltaReachPp: round((after.reach - base.reach) * 100, 1),
      latencyBefore: base.latencyDays,
      latencyAfter: after.latencyDays,
      deltaLatencyDays: round(after.latencyDays - base.latencyDays, 2),
      falseAlarmBefore: base.falseAlarm,
      falseAlarmAfter: after.falseAlarm,
      bitsAfter: after.carriedBits,
      value,
      cost,
      net,
      valuePerHour,
      clearsHurdle: valuePerHour === null ? null : valuePerHour >= price,
      price,
      priceSource,
      after,
    });
  }
  rows.sort((a, b) => {
    const an = a.net ?? -Infinity;
    const bn = b.net ?? -Infinity;
    if (bn !== an) return bn - an;
    return (b.deltaReachPp ?? 0) - (a.deltaReachPp ?? 0);
  });
  return { base, rows, price, priceSource };
}

/* ------------------------------------------------------------- probes */

/**
 * Score the probe ledger for one class. A probe is an event the leader already
 * knows about; the question is whether the *channel* would have delivered it.
 * That is the only way to observe detection without surveilling anyone.
 */
export function scoreProbes(probes = [], reading = null) {
  const settled = (Array.isArray(probes) ? probes : []).filter((p) => p && p.status === 'settled');
  const events = settled.filter((p) => p.truth === 'event');
  const negatives = settled.filter((p) => p.truth === 'none');
  const hits = events.filter((p) => p.delivered === true);
  const falseAlarms = negatives.filter((p) => p.delivered === true);
  const latencies = events
    .filter((p) => p.delivered === true && Number.isFinite(Number(p.latencyDays)))
    .map((p) => Number(p.latencyDays));
  const observedReach = events.length
    ? { k: hits.length, n: events.length, p: round(hits.length / events.length, 4), wilson: wilsonInterval(hits.length, events.length) }
    : null;
  const observedFalse = negatives.length
    ? { k: falseAlarms.length, n: negatives.length, p: round(falseAlarms.length / negatives.length, 4), wilson: wilsonInterval(falseAlarms.length, negatives.length) }
    : null;
  const meanLatency = latencies.length
    ? round(latencies.reduce((s, v) => s + v, 0) / latencies.length, 2)
    : null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const medianLatency = sorted.length
    ? round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, 2)
    : null;
  const sensitivity = detectionSensitivity({
    hits: hits.length,
    events: events.length,
    falseAlarms: falseAlarms.length,
    negatives: negatives.length,
  });
  const scored = settled
    .filter((p) => p.prediction && Number.isFinite(Number(p.prediction.reach)))
    .map((p) => ({ p: Number(p.prediction.reach), outcome: p.delivered === true ? 1 : 0 }));
  const brier = brierScore(scored);
  const gapPp = reading && observedReach && Number(reading.reach) !== null
    ? round((observedReach.p - Number(reading.reach)) * 100, 1)
    : null;
  const ready = events.length >= SIGNAL_MIN_PROBES || negatives.length >= SIGNAL_MIN_PROBES;
  const underReach = gapPp !== null && gapPp <= -SIGNAL_UNDER_REACH_PP;
  return {
    settledCount: settled.length,
    eventCount: events.length,
    negativeCount: negatives.length,
    hitCount: hits.length,
    falseAlarmCount: falseAlarms.length,
    observedReach,
    observedFalse,
    meanLatency,
    medianLatency,
    sensitivity,
    brier,
    declaredReach: reading ? Number(reading.reach) : null,
    declaredLatency: reading ? Number(reading.latencyDays) : null,
    gapPp,
    latencyGapDays: reading && medianLatency !== null && Number(reading.latencyDays) !== null
      ? round(medianLatency - Number(reading.latencyDays), 2)
      : null,
    ready,
    underReach: ready && underReach,
    notes: [
      events.length || negatives.length
        ? null
        : 'No probe has settled, so the declared reach is untested. Every figure on this page is a declaration until one does.',
      ready ? null : `${events.length} event probe(s) and ${negatives.length} quiet probe(s) settled; ${SIGNAL_MIN_PROBES} of either is where this page stops calling the reading a count.`,
      negatives.length ? null : 'No quiet probe has settled, so the false-alarm reading is unknown — not zero.',
    ].filter(Boolean),
  };
}

/* --------------------------------------------------------- conventions */

export function conventionsFromSettings(settings = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const pct = (value, fallback) => clamp(num(value, fallback) / 100, 0.01, 0.99);
  return {
    transmit: clamp(pct(settings.sigTransmitPct, 78), SIGNAL_MIN_TRANSMIT, SIGNAL_MAX_TRANSMIT),
    falseAlarm: clamp(pct(settings.sigFalseAlarmPct, 6), 0, 0.99),
    relayLagDays: Math.max(0, num(settings.sigRelayLagDays, 5)),
    cadenceDays: Math.max(1, num(settings.oneOnOneCadenceDays, 14)),
    cadenceTargetDays: Math.max(1, num(settings.sigCadenceTargetDays, 7)),
    cadenceHoursPerHop: Math.max(0, num(settings.sigCadenceHoursPerHop, 0.5)),
    skipLevelDetect: clamp(pct(settings.sigSkipLevelPct, 70), 0.01, 0.99),
    skipLevelFalseAlarm: clamp(pct(settings.sigSkipLevelFalsePct, 10), 0, 0.99),
    skipLevelLagDays: Math.max(0, num(settings.sigSkipLevelLagDays, 21)),
    skipLevelHoursPerWeek: Math.max(0, num(settings.sigSkipLevelHoursPerWeek, 0.75)),
    escalationDetect: clamp(pct(settings.sigEscalationPct, 55), 0.01, 0.99),
    escalationFalseAlarm: clamp(pct(settings.sigEscalationFalsePct, 14), 0, 0.99),
    escalationLagDays: Math.max(0, num(settings.sigEscalationLagDays, 1)),
    escalationHours: Math.max(0, num(settings.sigEscalationHours, 2)),
    reviewLift: Math.max(0, num(settings.sigReviewLiftPp, 8)) / 100,
    reviewHoursPerHop: Math.max(0, num(settings.sigReviewHoursPerHop, 1.5)),
    monitoringDetect: clamp(pct(settings.sigMonitoringPct, 65), 0.01, 0.99),
    monitoringFalseAlarm: clamp(pct(settings.sigMonitoringFalsePct, 12), 0, 0.99),
    monitoringLagDays: Math.max(0, num(settings.sigMonitoringLagDays, 1)),
    monitoringHours: Math.max(0, num(settings.sigMonitoringHours, 3)),
    hourValue: Math.max(0, num(settings.sigHourValue, 250)),
    blindFloor: clamp(num(settings.sigBlindFloorPct, 50), 1, 99) / 100,
    blindDepth: Math.max(1, num(settings.sigBlindDepth, 2)),
    exposureFloor: Math.max(0, num(settings.sigExposureFloor, 5000)),
    underReachPp: Math.max(1, num(settings.sigUnderReachPp, SIGNAL_UNDER_REACH_PP)),
    reviewHorizonDays: Math.max(7, num(settings.sigReviewHorizonDays, 90)),
    maxDepth: Math.min(SIGNAL_MAX_DEPTH, Math.max(1, num(settings.sigMaxDepth, SIGNAL_MAX_DEPTH))),
    autoPropagate: settings.sigAutoPropagate !== false,
  };
}

/* ------------------------------------------------------------- reading */

function directFromRecord(record, conventions) {
  const direct = record && record.direct ? record.direct : null;
  if (!direct || direct.enabled !== true) return { enabled: false };
  const detect = Number(direct.detectPct);
  return {
    enabled: true,
    detect: Number.isFinite(detect) ? clamp(detect / 100, 0.01, 0.99) : conventions.transmit,
    falseAlarm: Number.isFinite(Number(direct.falsePct)) ? clamp(Number(direct.falsePct) / 100, 0, 0.99) : conventions.falseAlarm,
    lagDays: Number.isFinite(Number(direct.lagDays)) ? Math.max(0, Number(direct.lagDays)) : 1,
    label: String(direct.label || 'Direct channel').slice(0, 160),
  };
}

/** Build the hop list for a declared class from the roster and its overrides. */
export function hopsFor(classRecord, index, state, conventions, now) {
  const originId = classRecord?.pathPersonId;
  if (!originId || !index.byId.has(originId)) return { hops: [], origin: null, reason: 'The origin person is not on the active roster.' };
  const chain = pathFor(index, originId);
  if (!chain.length) return { hops: [], origin: null, reason: 'No reporting path could be built.' };
  if (chain.length > conventions.maxDepth) {
    return { hops: [], origin: chain[0], reason: `The path is ${chain.length} hops deep, past the declared modelling ceiling of ${conventions.maxDepth}.` };
  }
  const overrides = classRecord && classRecord.overrides && typeof classRecord.overrides === 'object' ? classRecord.overrides : {};
  const hops = chain.map((node) => {
    const override = Number(overrides[node.personId]);
    const transmit = Number.isFinite(override) && override > 0
      ? clamp(override / 100, SIGNAL_MIN_TRANSMIT, SIGNAL_MAX_TRANSMIT)
      : conventions.transmit;
    const top = node.top;
    const wait = top
      ? leaderWaitDays(state, node.personId, conventions, now)
      : { days: conventions.relayLagDays, basis: `declared relay lag (no 1:1 is logged between two reports)` };
    return {
      personId: node.personId,
      name: node.name,
      transmit,
      transmitBasis: Number.isFinite(override) && override > 0 ? 'your override for this person' : 'declared per-hop convention',
      falseAlarm: conventions.falseAlarm,
      lagDays: wait.days,
      lagBasis: wait.basis,
      top,
    };
  });
  return { hops, origin: chain[0], chain, reason: null };
}

/** One class, fully evaluated. */
export function readClass(classRecord, state, index, conventions, now, { hourValue = null, priceLeversNow = false } = {}) {
  const built = hopsFor(classRecord, index, state, conventions, now);
  const direct = directFromRecord(classRecord, conventions);
  const theta = clamp(Number(classRecord?.probabilityPct) / 100, 0, 1);
  const exposure = Number.isFinite(Number(classRecord?.exposure)) && Number(classRecord.exposure) > 0
    ? Number(classRecord.exposure)
    : null;
  const horizonDays = Number.isFinite(Number(classRecord?.horizonDays)) && Number(classRecord.horizonDays) > 0
    ? Number(classRecord.horizonDays)
    : conventions.reviewHorizonDays;
  const reading = evaluateChannel({ hops: built.hops, direct, theta, exposure, horizonDays });
  const probes = (state.signalProbes || []).filter((p) => p && p.classId === classRecord?.id);
  const observed = scoreProbes(probes, reading);

  // How deep the chain can be before the declared channel stops clearing the
  // blind floor. Derived by re-running the *same* evaluator at each depth for
  // an otherwise identical path, so it can never contradict the headline.
  let blindDepth = null;
  for (let d = 1; d <= conventions.maxDepth; d += 1) {
    const synthetic = Array.from({ length: d }, () => ({
      transmit: conventions.transmit,
      falseAlarm: conventions.falseAlarm,
      lagDays: conventions.relayLagDays,
    }));
    const probeReading = evaluateChannel({ hops: synthetic, direct, theta, exposure, horizonDays });
    if (probeReading.reach < conventions.blindFloor) {
      blindDepth = d;
      break;
    }
  }

  const priced = priceLeversNow
    ? priceLevers(
      { hops: built.hops, direct, theta, exposure, horizonDays, hopCount: reading.hopCount },
      conventions,
      { hourValue },
    )
    : null;

  return {
    id: classRecord?.id || null,
    label: String(classRecord?.label || '').slice(0, 200),
    status: classRecord?.status || 'declared',
    currency: String(classRecord?.currency || 'USD').slice(0, 6),
    ownerId: classRecord?.ownerId || null,
    reviewOn: classRecord?.reviewOn || null,
    committedOn: classRecord?.committedOn || null,
    pathPersonId: classRecord?.pathPersonId || null,
    originName: built.origin?.name || '',
    chain: built.chain || [],
    hops: built.hops,
    direct,
    reading,
    observed,
    probes,
    blindDepth,
    blockedReason: built.reason,
    horizonDays,
    exposure,
    theta,
    levers: priced,
  };
}

/* ------------------------------------------------------------ report */

export function buildSignalReport(state = {}, now = new Date(), options = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const conventions = conventionsFromSettings(state.settings);
  const index = buildReportingIndex(state.people || []);
  const classes = (Array.isArray(state.signalClasses) ? state.signalClasses : [])
    .filter((row) => row && row.id)
    .map((row) => readClass(row, state, index, conventions, at, {
      hourValue: options.hourValue ?? null,
      priceLeversNow: options.priceLevers === true,
    }));

  const active = classes.filter((c) => c.status !== 'retired');
  const committed = active.filter((c) => c.status === 'committed');
  const withExposure = active.filter((c) => c.reading.exposure !== null);
  const totalExposureByCurrency = {};
  const expectedLossByCurrency = {};
  for (const c of withExposure) {
    const cur = c.currency || 'USD';
    totalExposureByCurrency[cur] = round((totalExposureByCurrency[cur] || 0) + c.reading.exposure, 2);
    if (c.reading.expectedLoss !== null) {
      expectedLossByCurrency[cur] = round((expectedLossByCurrency[cur] || 0) + c.reading.expectedLoss, 2);
    }
  }

  const depths = index.nodes.map((n) => n.depth).filter((d) => Number.isFinite(d));
  const maxDepth = depths.length ? Math.max(...depths) : 0;
  const blindNodes = index.nodes.filter((n) => Number.isFinite(n.depth) && n.depth >= conventions.blindDepth);

  return {
    version: SIGNAL_ENGINE_VERSION,
    generatedOn: dayKey(at),
    conventions,
    index,
    classes,
    totals: {
      declared: classes.filter((c) => c.status === 'declared').length,
      committed: committed.length,
      retired: classes.filter((c) => c.status === 'retired').length,
      roster: index.nodes.length,
      maxDepth,
      cycles: index.cycles.length,
      blindNodes: blindNodes.length,
      untested: committed.filter((c) => c.observed.eventCount === 0).length,
      contradicted: committed.filter((c) => c.observed.underReach).length,
      totalExposureByCurrency,
      expectedLossByCurrency,
    },
    blindNodes: blindNodes.map((n) => ({ personId: n.personId, name: n.name, depth: n.depth })),
    probes: (Array.isArray(state.signalProbes) ? state.signalProbes : []).filter((p) => p && p.status === 'open'),
    levers: (Array.isArray(state.signalLevers) ? state.signalLevers : []).filter((l) => l && l.status !== 'retired'),
  };
}

/* ----------------------------------------------------------- signals */

const SEVERITY = { info: 1, low: 2, warn: 3, high: 4 };

/**
 * Named findings on the same shape the Signals feed consumes: `evidence` and a
 * navigable `action`. A finding without either is a slogan, and the feed drops
 * it rather than rendering an empty card.
 */
export function signalSignals(state = {}, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const report = buildSignalReport(state, at);
  const out = [];
  const add = (row) => out.push({ confidence: 'high', personId: null, personName: null, ...row });

  if (report.totals.cycles > 0) {
    add({
      ruleId: 'SIG-01',
      domain: 'Signal path',
      title: 'The reporting lines contain a loop',
      detail: `${report.totals.cycles} person record(s) sit in a management cycle, so no depth could be computed for them and no path can be priced. The roster is the one input this page cannot guess at.`,
      severity: SEVERITY.high,
      evidence: [`${report.totals.cycles} person(s) in a cycle`, 'No reach, latency or loss figure is computed for an affected class'],
      action: { label: 'Fix the reporting lines', route: '#/people' },
    });
  }

  for (const klass of report.classes) {
    if (klass.blockedReason) {
      add({
        ruleId: 'SIG-02',
        domain: 'Signal path',
        title: `“${klass.label || 'A signal class'}” has no priceable path`,
        detail: klass.blockedReason,
        severity: SEVERITY.warn,
        evidence: [klass.blockedReason],
        action: { label: 'Open the signal path', route: `#/signal?class=${encodeURIComponent(klass.id || '')}` },
      });
      continue;
    }
    if (klass.status !== 'committed') continue;
    if (klass.reading.reach < report.conventions.blindFloor) {
      add({
        ruleId: 'SIG-03',
        domain: 'Signal path',
        title: `“${klass.label}” reaches you ${Math.round(klass.reading.reach * 100)}% of the time`,
        detail: `A material event originating with ${klass.originName || 'the origin person'} is forwarded intact through ${klass.reading.hopCount} relay(s) with probability ${Math.round(klass.reading.reach * 100)}%, and the report that does arrive is ${klass.reading.latencyDays} day(s) behind it. That is under the ${Math.round(report.conventions.blindFloor * 100)}% floor this workspace treats as blind.`,
        severity: klass.reading.reach < report.conventions.blindFloor / 2 ? SEVERITY.high : SEVERITY.warn,
        evidence: [
          `${klass.reading.hopCount} hop(s) at ${Math.round((klass.hops[0]?.transmit ?? 0) * 100)}% declared transmit each`,
          `Reach ${Math.round(klass.reading.reach * 100)}% · false alarms ${Math.round(klass.reading.falseAlarm * 100)}%`,
          `Carries ${klass.reading.carriedBits.toFixed(2)} of ${klass.reading.sourceBits.toFixed(2)} bits`,
        ],
        action: { label: 'See the path and the levers', route: `#/signal?panel=levers&class=${encodeURIComponent(klass.id || '')}` },
      });
    }
    if (klass.observed.underReach && klass.observed.observedReach) {
      add({
        ruleId: 'SIG-04',
        domain: 'Signal path',
        title: `The declared reach for “${klass.label}” is contradicted by ${klass.observed.eventCount} probe(s)`,
        detail: `Declared ${Math.round((klass.observed.declaredReach || 0) * 100)}%; observed ${Math.round(klass.observed.observedReach.p * 100)}% (${klass.observed.hitCount} of ${klass.observed.eventCount}). The frozen predictions scored a Brier of ${klass.observed.brier?.score ?? '—'} across ${klass.observed.brier?.n ?? 0} probe(s). A declaration that survives contact with evidence is worth more than one that does not.`,
        severity: SEVERITY.high,
        evidence: [
          `${klass.observed.eventCount} event probe(s), ${klass.observed.negativeCount} quiet probe(s)`,
          `Gap ${klass.observed.gapPp} percentage points against the declaration`,
        ],
        action: { label: 'Open the probe ledger', route: `#/signal?panel=probes&class=${encodeURIComponent(klass.id || '')}` },
      });
    }
    if (klass.reading.falseAlarm > 0.2) {
      add({
        ruleId: 'SIG-05',
        domain: 'Signal path',
        title: `“${klass.label}” cries wolf ${Math.round(klass.reading.falseAlarm * 100)}% of the time`,
        detail: `Every relay can raise a false alarm, and those compound in series exactly as reach decays. At ${Math.round(klass.reading.falseAlarm * 100)}% the channel is loud enough that a real alert will be discounted — the cry-wolf failure is the one that makes the next true report cheap to ignore.`,
        severity: SEVERITY.warn,
        evidence: [`${Math.round(klass.reading.falseAlarm * 100)}% aggregate false-alarm rate through ${klass.reading.hopCount} hop(s)`],
        action: { label: 'Open the reach reading', route: `#/signal?panel=reach&class=${encodeURIComponent(klass.id || '')}` },
      });
    }
    if (klass.observed.eventCount === 0 && klass.reading.exposure !== null) {
      add({
        ruleId: 'SIG-06',
        domain: 'Signal path',
        title: `“${klass.label}” is committed but untested`,
        detail: `It carries a declared exposure and a committed channel, and no probe has ever asked whether the channel works. One probe is a question you can answer in a week; the number on the page is a declaration until then.`,
        severity: SEVERITY.low,
        evidence: [`0 settled probes`, `${klass.observed.settledCount} probe(s) opened`],
        action: { label: 'Plant the first probe', route: `#/signal?panel=probes&class=${encodeURIComponent(klass.id || '')}` },
      });
    }
  }

  const contradictions = report.classes.filter((c) => c.status === 'committed' && c.observed.underReach).length;
  if (contradictions >= 2) {
    add({
      ruleId: 'SIG-07',
      domain: 'Signal path',
      title: `${contradictions} declared channels are contradicted at once`,
      detail: 'When several independent channels all over-perform their own declarations, the declared per-hop transmit probability is probably wrong rather than the team. Re-declare the convention before treating each class as a separate finding.',
      severity: SEVERITY.warn,
      evidence: [`${contradictions} committed class(es) below their declared reach by more than ${report.conventions.underReachPp} pp`],
      action: { label: 'Open the conventions', route: '#/settings' },
    });
  }

  return out;
}

export function signalAttentionCount(state = {}, now = new Date()) {
  return signalSignals(state, now).filter((row) => row.severity >= 3).length;
}

/* ------------------------------------------------------------- brief */

export function signalBrief(state = {}, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const report = buildSignalReport(state, at);
  const lines = [];
  lines.push(`LEADOS — SIGNAL PATH BRIEF (${report.generatedOn})`);
  lines.push('='.repeat(64));
  lines.push('');
  lines.push(`METHOD: series/parallel reliability — reach = 1 − (1 − Π t_hop)(1 − q_direct);`);
  lines.push(`false alarms compound in series; bits are Shannon mutual information over a`);
  lines.push(`binary alert channel; loss = prior × exposure × (1 − reach(1 − min(1, lag/horizon))).`);
  lines.push(`Every parameter is a declared convention, printed beside its number.`);
  lines.push('');
  lines.push(`ROSTER: ${report.totals.roster} active person(s), deepest branch ${report.totals.maxDepth} hop(s).`);
  if (report.totals.blindNodes) {
    lines.push(`         ${report.totals.blindNodes} person(s) sit at or below hop ${report.conventions.blindDepth}, the declared blind line.`);
  }
  if (report.totals.cycles) lines.push(`WARNING: ${report.totals.cycles} person(s) are in a reporting cycle; no path is priced for them.`);
  lines.push('');
  if (!report.classes.length) {
    lines.push('No event class has been declared, so nothing is priced. Declare one class —');
    lines.push('"a delivery slip on the platform team" is enough — and this page has a number.');
    return lines.join('\n');
  }
  for (const klass of report.classes) {
    lines.push(`— ${klass.label || '(unnamed class)'} [${klass.status}]`);
    if (klass.blockedReason) {
      lines.push(`   no priceable path: ${klass.blockedReason}`);
      continue;
    }
    lines.push(`   path: ${klass.chain.map((n) => n.name).join(' → ')} → you  (${klass.reading.hopCount} hop(s))`);
    lines.push(`   reach ${Math.round(klass.reading.reach * 100)}%   false alarms ${Math.round(klass.reading.falseAlarm * 100)}%   lag ${klass.reading.latencyDays} d (conditional on arrival)`);
    lines.push(`   information ${klass.reading.carriedBits.toFixed(2)} of ${klass.reading.sourceBits.toFixed(2)} bits carried`);
    if (klass.reading.exposure !== null) {
      lines.push(`   exposure ${klass.currency} ${Math.round(klass.reading.exposure).toLocaleString('en-US')} at prior ${Math.round(klass.theta * 100)}% over ${klass.horizonDays} d`);
      lines.push(`   expected loss ${klass.reading.expectedLoss === null ? 'not priced' : `${klass.currency} ${Math.round(klass.reading.expectedLoss).toLocaleString('en-US')}`}`);
    } else {
      lines.push('   exposure not declared — the channel is quantified, the money is not');
    }
    if (klass.observed.eventCount || klass.observed.negativeCount) {
      lines.push(`   probes: ${klass.observed.hitCount}/${klass.observed.eventCount} delivered · ${klass.observed.falseAlarmCount}/${klass.observed.negativeCount} false ·`
        + ` median lag ${klass.observed.medianLatency ?? '—'} d · Brier ${klass.observed.brier?.score ?? '—'}`);
      if (!klass.observed.ready) lines.push(`   (below the ${SIGNAL_MIN_PROBES}-probe floor: counts only, no verdict)`);
    } else {
      lines.push('   probes: none settled — every figure above is a declaration');
    }
    lines.push('');
  }
  lines.push('LIMITS: independence of parallel branches is assumed, not verified. The per-hop');
  lines.push('transmit probability is a property of the channel, not a judgement about a person.');
  lines.push('Latency is conditional on arrival; a signal that never arrives is priced as loss,');
  lines.push('not as infinite delay. Loss accrues linearly to the declared horizon.');
  return lines.join('\n');
}
