/**
 * app/core/domain/escalation.js — the Escalation Economy terminal
 * (`#/escalation`, Session 128, Schema v94, ADR-0088).
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * The 2026 market sells "escalation management" and means ticket routing —
 * ServiceNow, Jira Service Management, PagerDuty, Zendesk and the AI-support
 * entrants all answer *who gets paged next and how fast*. Not one of them
 * answers: **is this problem being decided at the level that holds the
 * information, and what did passing it upward actually buy?**
 *
 * This module prices the organisation's hidden market in passed-up problems.
 * Every decision moment is either ABSORBED (decided and owned where it arose)
 * or ESCALATED (handed to a seat that is more expensive, further from the
 * facts, and slower). Escalation is not free and it is not neutral: it moves
 * risk, it burns the scarce attention of a costlier decision-maker, and it
 * destroys context at every rung it crosses.
 *
 * NAMED THEORY, EACH ACTUALLY COMPUTED (product doctrine §0.2)
 * ------------------------------------------------------------
 *  - **Aghion & Tirole (1997), "Formal and Real Authority in Organizations",
 *    JPE 105(1).** The canonical model of this exact problem. A principal who
 *    intervenes often destroys the agent's incentive to gather information:
 *    if the boss will overrule you anyway, stop investigating. The model's
 *    prescription is a *credible commitment to a bounded intervention rate*.
 *    LeadOS implements it: a span declares how often it WILL intervene, the
 *    levels below it can then justify deciding locally, and the commitment is
 *    graded out of sample. Measured side-effect: `de-facto-centralised` —
 *    formal authority is delegated on paper while real authority is still
 *    taken above.
 *  - **Holmström & Milgrom (1991), "Multitask Principal-Agent Analyses".**
 *    Agents starve unmeasured tasks. Escalation is the archetypal unmeasured
 *    task: a wrong local call is visible, an unnecessary escalation is not.
 *    The reason vocabulary therefore contains `cover` ("I want cover for a
 *    decision I could make") as a first-class, countable answer.
 *  - **Jensen & Meckling (1995), "Specific and General Knowledge and the
 *    Structure of Organizations"; the principle of subsidiarity.** Authority
 *    belongs where the specific knowledge is, net of the cost of moving it.
 *    The **Subsidiarity Index** measures the share of a decision class that is
 *    resolved at the rung where it arose.
 *  - **Erlang / M/M/1 and Kingman (1961).** A leadership seat is a service
 *    station. `Wq = λ/(μ(μ−λ))` exactly (M/M/1), with Kingman's G/G/1
 *    approximation `(ρ/(1−ρ))·c_v²/μ` as the variability-adjusted bound. At
 *    ρ ≥ 1 the queue is UNSTABLE and no finite wait time is printed — the
 *    house rule that a refused figure is blank, never zero.
 *  - **Shannon (1948) over a cascade of binary symmetric channels.** Crossing
 *    k rungs is k noisy hops; the cascade error is
 *    `ε_k = (1 − (1 − 2ε)^k)/2` and the mutual information still reaching the
 *    top is `1 − H₂(ε_k)` bits of the one bit the source carried. The further
 *    up an item travels the MORE it costs and the LESS the decider knows.
 *  - **Oncken & Wass (1974), "Management Time: Who's Got the Monkey?"** The
 *    monkey ledger: problems that migrated from a subordinate's back to the
 *    manager's back and are now being fed by the manager. Returned with
 *    authority, never with an answer.
 *  - **Wilson (1927) intervals, Brier (1950) scoring, small-cell withholding.**
 *    House conventions: a rate below the cell floor is BLANK, a forecast is
 *    frozen then graded once, and nothing is claimed as an effect.
 *
 * HONESTY BOUNDARIES, ENFORCED IN CODE
 * ------------------------------------
 *  - Every input is a recorded human judgement. No calendar, keystroke,
 *    message or sentiment telemetry; no inference of cause, intent or
 *    competence from a title or a note.
 *  - The subject of every metric is a DECISION CLASS and a SPAN, never a
 *    person's performance. No one is ranked, scored or rated here.
 *  - Cost rates are DECLARED conventions, not audited payroll facts.
 *  - An unstable queue prints a refusal, not a large number.
 *  - Commitment grading is an association between a declared ceiling and what
 *    was later observed. It is never called a causal effect.
 *
 * Pure module: no DOM, storage, network or wall-clock globals.
 */

import { addDays, dayKey, daysBetween, weekKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import { ALTITUDE_RATE_KEYS } from './escalationRegistry.js';
import { normalizeEscalationSettings } from './escalationSchema.js';

const Z_95 = 1.959963984540054;

const num = (v, dp = 2) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10 ** dp) / 10 ** dp : null);
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

export function escalationConventions(settings = {}) {
  return normalizeEscalationSettings(settings);
}

/** Wilson (1927) score interval — returned in percent, or nulls below n=1. */
export function wilsonInterval(successes, n, z = Z_95) {
  const N = Number(n);
  const k = Number(successes);
  if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(k) || k < 0 || k > N) {
    return { pct: null, lo: null, hi: null, n: int(n) };
  }
  const p = k / N;
  const zz = z * z;
  const denom = 1 + zz / N;
  const centre = (p + zz / (2 * N)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p)) / N + zz / (4 * N * N))) / denom;
  return {
    pct: num(p * 100, 1),
    lo: num(Math.max(0, centre - spread) * 100, 1),
    hi: num(Math.min(1, centre + spread) * 100, 1),
    n: int(N),
  };
}

/**
 * Exact M/M/1 waiting time plus Kingman's G/G/1 approximation, in DAYS.
 * Returns a refusal (never a large number) when the queue is unstable.
 */
export function seatQueue(arrivalsPerWeek, serviceRatePerWeek, scv = 1, redPct = 85) {
  const lambda = Number(arrivalsPerWeek);
  const mu = Number(serviceRatePerWeek);
  const cv = Math.min(4, Math.max(0.25, Number(scv) || 1));
  if (!Number.isFinite(lambda) || lambda < 0) return refusal('bad-arrival-rate');
  if (!Number.isFinite(mu) || mu <= 0) return refusal('no-service-rate');

  const rho = lambda / mu;
  const rhoPct = num(rho * 100, 1);
  const headroomPerWeek = num(Math.max(0, (Number(redPct) / 100) * mu - lambda), 2);

  if (rho >= 1) {
    return {
      state: 'unstable',
      verdict: 'queue-unstable',
      arrivalsPerWeek: num(lambda, 2),
      serviceRatePerWeek: num(mu, 2),
      utilisationPct: rhoPct,
      waitDaysMm1: null,
      waitDaysKingman: null,
      waitDaysLo: null,
      waitDaysHi: null,
      queueLength: null,
      headroomPerWeek,
      reason: `Arrivals (${num(lambda, 2)}/week) are at or above the declared service rate (${num(mu, 2)}/week), so ρ ≥ 1. A finite waiting time here would be fiction; the queue must be re-sized or the authority moved.`,
    };
  }

  const wqWeeks = lambda / (mu * (mu - lambda));
  const kingmanWeeks = ((rho / (1 - rho)) * (cv * cv)) / mu;
  return {
    state: rho * 100 >= Number(redPct) ? 'saturated' : 'stable',
    verdict: rho * 100 >= Number(redPct) ? 'queue-saturated' : 'escalation-market-healthy',
    arrivalsPerWeek: num(lambda, 2),
    serviceRatePerWeek: num(mu, 2),
    utilisationPct: rhoPct,
    waitDaysMm1: num(wqWeeks * 7, 2),
    waitDaysKingman: num(kingmanWeeks * 7, 2),
    waitDaysLo: num(Math.min(wqWeeks, kingmanWeeks) * 7, 2),
    waitDaysHi: num(Math.max(wqWeeks, kingmanWeeks) * 7, 2),
    queueLength: num(lambda * wqWeeks, 2),
    headroomPerWeek,
    reason: null,
  };

  function refusal(reason) {
    return {
      state: 'refused',
      verdict: 'insufficient',
      arrivalsPerWeek: Number.isFinite(lambda) ? num(lambda, 2) : null,
      serviceRatePerWeek: Number.isFinite(mu) ? num(mu, 2) : null,
      utilisationPct: null,
      waitDaysMm1: null,
      waitDaysKingman: null,
      waitDaysLo: null,
      waitDaysHi: null,
      queueLength: null,
      headroomPerWeek: null,
      reason,
    };
  }
}

/** Shannon binary-entropy, in bits. H(0) = H(1) = 0 by continuity. */
export function binaryEntropy(p) {
  const q = Number(p);
  if (!Number.isFinite(q) || q <= 0 || q >= 1) return 0;
  return -q * Math.log2(q) - (1 - q) * Math.log2(1 - q);
}

/**
 * Crossing `rungs` leadership hops as a cascade of binary symmetric channels.
 * Returns both the naive retention and Shannon's surviving mutual information.
 */
export function bscContext(rungs, lossPerRungPct = 15) {
  const k = Math.max(0, int(rungs));
  // Clamp strictly below 0.5 so the cascade converges to "no information"
  // rather than to a channel that is worse than a coin flip.
  const eps = Math.min(0.49, Math.max(0, Number(lossPerRungPct) / 100));
  if (k === 0) {
    return { rungs: 0, cascadeErrorPct: 0, retentionPct: 100, mutualInformationBits: 1, entropyBits: 0 };
  }
  const cascadeError = (1 - (1 - 2 * eps) ** k) / 2;
  const entropy = binaryEntropy(cascadeError);
  return {
    rungs: k,
    cascadeErrorPct: num(cascadeError * 100, 2),
    retentionPct: num((1 - eps) ** k * 100, 2),
    mutualInformationBits: num(1 - entropy, 4),
    entropyBits: num(entropy, 4),
  };
}

/** Ordered leadership ancestors of a node, nearest first, cycle-safe. */
export function ancestorSeatIds(built, seatId) {
  const out = [];
  if (!built || !seatId) return out;
  let cursor = built.chain?.nodes?.get(seatId)?.parentId || null;
  const visited = new Set([seatId]);
  let guard = 0;
  while (cursor && !visited.has(cursor) && guard < 64) {
    visited.add(cursor);
    if (built.byId.has(cursor) && cursor !== LEADER_ID) out.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return out;
}

/** Rungs crossed, counting the receiving seat. Null when the hop is lateral. */
export function rungsBetween(built, fromSeatId, toSeatId) {
  if (!built || !fromSeatId || !toSeatId) return { rungs: 0, lateral: false };
  if (fromSeatId === toSeatId) return { rungs: 0, lateral: false };
  const chain = ancestorSeatIds(built, fromSeatId);
  const idx = chain.indexOf(toSeatId);
  if (idx >= 0) return { rungs: idx + 1, lateral: false };
  if (toSeatId === LEADER_ID) return { rungs: Math.max(1, chain.length + 1), lateral: false };
  return { rungs: 1, lateral: true };
}

/**
 * The seat that owns a decision moment for roll-up purposes: the person
 * themselves when they lead a span, otherwise their nearest leadership
 * ancestor. This mirrors `nearestLeadershipAncestor` in `seat.js`, so the
 * escalation ledger and the access boundary always agree on where a decision
 * belongs — a childless specialist's decision moment rolls into the span that
 * actually carries it, and never disappears between the two models.
 */
export function owningSeatId(built, personId) {
  if (!built || !personId) return LEADER_ID;
  if (built.byId.has(personId)) return personId;
  let cursor = built.chain?.nodes?.get(personId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (built.byId.has(cursor)) return cursor;
    if (cursor === LEADER_ID) return LEADER_ID;
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return LEADER_ID;
}

/** Altitude of a person, falling back to their chain node then the enterprise. */
export function altitudeOfPerson(built, personId) {
  if (!built || !personId) return 'chief';
  const seat = built.byId.get(owningSeatId(built, personId));
  if (seat?.altitudeKey) return seat.altitudeKey;
  const node = built.chain?.nodes?.get(personId);
  return node?.altitude || 'chief';
}

function rateForAltitude(conventions, altitudeKey) {
  const key = ALTITUDE_RATE_KEYS[altitudeKey];
  const value = key ? Number(conventions[key]) : NaN;
  return Number.isFinite(value) ? value : 0;
}

/** Declared rates only. No salary, no payroll, no inferred cost. */
export function escalationTaxFor(records, built, conventions, { defaultHours }) {
  let units = 0;
  let hours = 0;
  let missingHours = 0;
  let weightedRungs = 0;
  let counted = 0;
  for (const rec of records) {
    if (!rec || rec.disposition !== 'escalated') continue;
    const rate = rateForAltitude(conventions, altitudeOfPerson(built, rec.toSeatId));
    const hrs = Number.isFinite(Number(rec.effortHours))
      ? Number(rec.effortHours)
      : (missingHours += 1, Number(defaultHours) || 0);
    hours += hrs;
    units += hrs * rate;
    const { rungs } = rungsBetween(
      built,
      owningSeatId(built, rec.fromSeatId),
      owningSeatId(built, rec.toSeatId),
    );
    weightedRungs += rungs;
    counted += 1;
  }
  return {
    currency: conventions.escalationCurrency,
    units: num(units, 2),
    hours: num(hours, 2),
    personDays: num(hours / 8, 2),
    escalationCount: counted,
    meanRungs: counted ? num(weightedRungs / counted, 2) : null,
    usedDefaultHours: missingHours,
  };
}

function emptyTotals(conventions) {
  return {
    records: 0,
    escalated: 0,
    absorbed: 0,
    escalationRate: wilsonInterval(0, 0),
    defensiveN: 0,
    defensivePct: null,
    settledN: 0,
    changedN: 0,
    yield: wilsonInterval(0, 0),
    tax: { currency: conventions.escalationCurrency, units: 0, hours: 0, personDays: 0, escalationCount: 0, meanRungs: null, usedDefaultHours: 0 },
    verdict: 'insufficient',
  };
}

function totalsFor(records, built, conventions, { cellFloor }) {
  if (!records.length) return emptyTotals(conventions);
  const escalated = records.filter((r) => r.disposition === 'escalated');
  const absorbed = records.length - escalated.length;
  const rate = wilsonInterval(escalated.length, records.length);
  const defensive = escalated.filter((r) => r.reasonKey === 'cover' || r.reasonKey === 'capacity');
  const settled = escalated.filter((r) => r.status === 'settled' && r.outcomeDiffers !== null);
  const changed = settled.filter((r) => r.outcomeDiffers === true);
  const yld = wilsonInterval(changed.length, settled.length);

  let verdict = 'escalation-market-healthy';
  if (records.length < cellFloor) verdict = 'insufficient';
  else if (settled.length >= cellFloor && yld.pct !== null && yld.pct < conventions.escalationYieldFloorPct) verdict = 'pure-overhead';
  else if (rate.pct !== null && rate.pct > conventions.escalationRateRedPct) verdict = 'over-escalating';
  else if (escalated.length >= cellFloor && defensive.length / Math.max(1, escalated.length) >= 0.4) verdict = 'over-escalating';

  return {
    records: records.length,
    escalated: escalated.length,
    absorbed,
    escalationRate: rate,
    defensiveN: defensive.length,
    defensivePct: escalated.length ? num((defensive.length / escalated.length) * 100, 1) : null,
    settledN: settled.length,
    changedN: changed.length,
    yield: yld,
    tax: escalationTaxFor(records, built, conventions, { defaultHours: conventions.escalationHoursPerEscalation }),
    verdict,
  };
}

function disclosureFor(seat) {
  if (!seat || seat.fullAccess) return 'names';
  return seat.rank <= 2 ? 'names' : seat.rank === 3 ? 'unit' : 'aggregate';
}

function labelFor(built, seatId, disclosure, index = 0) {
  const seat = built?.byId?.get(seatId) || null;
  if (seatId === LEADER_ID) return 'Workspace leader';
  if (disclosure === 'names') return seat?.name || seatId;
  if (disclosure === 'unit') return seat?.shortLabel ? `${seat.shortLabel} span ${index + 1}` : `Unit ${index + 1}`;
  return seat?.altitudeKey ? `${seat.altitudeKey} span` : 'Span';
}

/**
 * The master read model. One call, five altitude-appropriate pictures.
 *
 * Vertical roll-up uses EXACT PARTITIONING: a record counts once at the seat
 * where it arose (`fromSeatId`) and is inherited by every leadership ancestor
 * by addition, so an enterprise figure cannot be inflated by zooming out.
 */
export function buildEscalationReport(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const conventions = escalationConventions(settings || state.settings || {});
  const built = buildSeats(state, { now, settings });
  const viewer = seatId ? (built.byId.get(seatId) || null) : activeSeat(built);
  const disclosure = disclosureFor(viewer);
  const warnings = [];

  const startDay = addDays(dayKey(now), -(conventions.escalationWindowDays - 1));
  const windowStart = typeof startDay === 'string' ? startDay : dayKey(startDay);
  const inWindow = (rec) => {
    const d = rec?.loggedOn;
    return typeof d === 'string' && d >= windowStart && d <= dayKey(now);
  };

  const all = (Array.isArray(state.escalationRecords) ? state.escalationRecords : []).filter((r) => r && typeof r === 'object');
  const windowed = all.filter(inWindow);

  const visible = (rec) => {
    if (!viewer || viewer.fullAccess) return true;
    return viewer.id === rec.fromSeatId || viewer.scope.has(rec.fromSeatId) || viewer.scope.has(rec.toSeatId);
  };
  const scoped = windowed.filter(visible);

  // ---- Per-seat rows with exact-partition roll-up -------------------------
  const directBy = new Map();
  for (const rec of scoped) {
    const key = owningSeatId(built, rec.fromSeatId);
    if (!directBy.has(key)) directBy.set(key, []);
    directBy.get(key).push(rec);
  }
  const receivedBy = new Map();
  for (const rec of scoped) {
    if (rec.disposition !== 'escalated' || !rec.toSeatId) continue;
    const key = owningSeatId(built, rec.toSeatId);
    if (!receivedBy.has(key)) receivedBy.set(key, []);
    receivedBy.get(key).push(rec);
  }

  // The root seat is included so the enterprise total is visible and the
  // operator's own decision moments are attributed rather than dropped. Every
  // non-root seat contributes to its own row only; the root's row is the sum of
  // its subtree, which is why the altitude table below is computed from the
  // records themselves and NOT by adding these rows together.
  const candidateSeats = built.seats;
  const seatRows = [];
  let index = 0;
  for (const seat of candidateSeats) {
    const own = directBy.get(seat.id) || [];
    let inherited = 0;
    for (const desc of seat.descendantSeatIds || []) inherited += (directBy.get(desc) || []).length;
    const rollupCount = own.length + inherited;
    if (!rollupCount && !receivedBy.has(seat.id)) continue;

    const subtree = [...(seat.descendantSeatIds || []), seat.id]
      .flatMap((id) => directBy.get(id) || []);
    const rowTotals = totalsFor(subtree, built, conventions, { cellFloor: conventions.escalationCellFloor });
    const arrivals = (receivedBy.get(seat.id) || []).length;
    const weeks = Math.max(1, conventions.escalationWindowDays / 7);
    const queue = seatQueue(arrivals / weeks, conventions.escalationServiceRatePerWeek, conventions.escalationServiceScv, conventions.escalationUtilisationRedPct);

    seatRows.push({
      seatId: seat.id,
      label: labelFor(built, seat.id, disclosure, index),
      altitudeKey: seat.altitudeKey,
      rank: seat.rank,
      directN: own.length,
      inheritedN: inherited,
      rollupN: rollupCount,
      receivedN: arrivals,
      ...rowTotals,
      queue,
      disclosed: disclosure === 'names',
    });
    index += 1;
  }
  seatRows.sort((a, b) => b.receivedN - a.receivedN || b.rollupN - a.rollupN);

  // ---- Altitude roll-up ---------------------------------------------------
  // EXACT PARTITION: each record is counted ONCE, at the altitude of the seat
  // where it arose. These rows are therefore additive to `totals` and cannot be
  // inflated by zooming out. (The seat rows above deliberately overlap — a
  // manager's row inherits its frontline children — so adding those together
  // WOULD double count, and this table never does.)
  const altitudeOfOrigin = (seatId) => altitudeOfPerson(built, seatId);
  const byAltitude = ['frontline', 'manager', 'director', 'exec', 'chief'].map((key) => {
    const rows = scoped.filter((r) => altitudeOfOrigin(r.fromSeatId) === key);
    const records = rows.length;
    const esc = rows.filter((r) => r.disposition === 'escalated').length;
    const abs = records - esc;
    const settledRows = rows.filter((r) => r.status === 'settled' && r.outcomeDiffers !== null);
    const settled = settledRows.length;
    const changed = settledRows.filter((r) => r.outcomeDiffers === true).length;
    const tax = escalationTaxFor(rows, built, conventions, { defaultHours: conventions.escalationHoursPerEscalation });
    const units = tax.units;
    const hours = tax.hours;
    const sat = seatRows.filter((r) => r.altitudeKey === key && r.queue?.state === 'saturated').length;
    const unstable = seatRows.filter((r) => r.altitudeKey === key && r.queue?.state === 'unstable').length;
    return {
      altitudeKey: key,
      seats: rows.length,
      records,
      escalated: esc,
      absorbed: abs,
      escalationRate: wilsonInterval(esc, records),
      yield: wilsonInterval(changed, settled),
      settledN: settled,
      changedN: changed,
      taxUnits: num(units, 2),
      taxHours: num(hours, 2),
      taxPersonDays: num(hours / 8, 2),
      saturatedSeats: sat,
      unstableSeats: unstable,
    };
  });

  // ---- Decision classes: subsidiarity ------------------------------------
  const classMap = new Map();
  for (const rec of scoped) {
    const key = rec.decisionClass || 'general';
    if (!classMap.has(key)) classMap.set(key, []);
    classMap.get(key).push(rec);
  }
  const classes = [];
  for (const [key, rows] of classMap) {
    const escalated = rows.filter((r) => r.disposition === 'escalated');
    // Resolved where it arose = absorbed outright, or escalated and then
    // returned downward with the authority to decide.
    const atOrigin = rows.filter((r) => r.disposition === 'absorbed' || r.status === 'returned');
    let rungSum = 0;
    for (const rec of escalated) {
      rungSum += rungsBetween(
        built,
        owningSeatId(built, rec.fromSeatId),
        owningSeatId(built, rec.toSeatId),
      ).rungs;
    }
    const idx = wilsonInterval(atOrigin.length, rows.length);
    classes.push({
      decisionClass: key,
      n: rows.length,
      escalatedN: escalated.length,
      atOriginN: atOrigin.length,
      subsidiarity: idx,
      meanRungs: escalated.length ? num(rungSum / escalated.length, 2) : 0,
      verdict: rows.length < conventions.escalationCellFloor
        ? 'insufficient'
        : idx.pct !== null && idx.pct < 100 - conventions.escalationRateRedPct
          ? 'over-escalating'
          : 'decided-where-it-arose',
    });
  }
  classes.sort((a, b) => b.n - a.n);

  // ---- De facto centralisation (Aghion & Tirole) -------------------------
  const commitments = (Array.isArray(state.escalationCommitments) ? state.escalationCommitments : [])
    .filter((c) => c && typeof c === 'object');
  const authority = [];
  for (const seat of candidateSeats) {
    const subtreeIds = new Set(seat.descendantSeatIds || []);
    if (!subtreeIds.size) continue;
    const fromBelow = scoped.filter((r) => subtreeIds.has(owningSeatId(built, r.fromSeatId)));
    if (!fromBelow.length) continue;
    const lifted = fromBelow.filter(
      (r) => r.disposition === 'escalated' && owningSeatId(built, r.toSeatId) === seat.id,
    );
    const observed = wilsonInterval(lifted.length, fromBelow.length);
    const match = [...commitments]
      .filter((c) => c.spanId === seat.id)
      .sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn)))[0] || null;
    const committed = match ? Number(match.committedInterventionRatePct) : null;
    let verdict = 'unmeasured';
    if (committed !== null && fromBelow.length >= conventions.escalationCellFloor && observed.pct !== null) {
      const materiality = Math.max(5, committed * 0.2);
      if (observed.pct > committed + materiality) verdict = 'above-commitment';
      else if (observed.pct < committed - materiality) verdict = 'below-commitment';
      else verdict = 'within-commitment';
    } else if (committed !== null) {
      verdict = 'unmeasured';
    }
    authority.push({
      seatId: seat.id,
      label: labelFor(built, seat.id, disclosure),
      altitudeKey: seat.altitudeKey,
      n: fromBelow.length,
      liftedN: lifted.length,
      observed: observed,
      committedInterventionRatePct: committed,
      deltaPp: committed !== null && observed.pct !== null ? num(observed.pct - committed, 1) : null,
      verdict,
      verdictLabel: committed === null ? 'No commitment declared' : undefined,
    });
  }
  authority.sort((a, b) => (b.observed.pct ?? -1) - (a.observed.pct ?? -1));

  // ---- Monkey ledger (Oncken & Wass) -------------------------------------
  const todayStr = dayKey(now);
  const openOnBack = (Array.isArray(state.escalationRecords) ? state.escalationRecords : [])
    .filter((r) => r && r.disposition === 'escalated' && (r.status === 'open' || r.status === 'received'))
    .filter((r) => (viewer?.fullAccess ? true : viewer?.id === r.toSeatId))
    .map((r) => ({
      ...r,
      daysOnBack: Math.max(0, daysBetween(r.loggedOn, todayStr)),
      fromLabel: labelFor(built, r.fromSeatId, disclosure),
    }))
    .sort((a, b) => b.daysOnBack - a.daysOnBack);

  const byOwner = new Map();
  for (const m of openOnBack) {
    if (!byOwner.has(m.fromSeatId)) {
      byOwner.set(m.fromSeatId, { fromSeatId: m.fromSeatId, label: m.fromLabel, count: 0, oldestDays: 0 });
    }
    const row = byOwner.get(m.fromSeatId);
    row.count += 1;
    row.oldestDays = Math.max(row.oldestDays, m.daysOnBack);
  }
  const monkeys = {
    total: openOnBack.length,
    overReturnWindow: openOnBack.filter((m) => m.daysOnBack > conventions.escalationReturnDays),
    bySender: [...byOwner.values()].sort((a, b) => b.count - a.count),
    returnWindowDays: conventions.escalationReturnDays,
  };

  // ---- Graded commitments: Brier skill ------------------------------------
  const graded = commitments.filter((c) => c.status === 'graded' && Number.isFinite(Number(c.brier)));
  const meanBrier = graded.length ? graded.reduce((s, c) => s + Number(c.brier), 0) / graded.length : null;
  const calibration = {
    declaredN: commitments.filter((c) => c.status === 'declared').length,
    gradedN: graded.length,
    brier: meanBrier === null ? null : num(meanBrier, 4),
    skill: null,
    verdict: graded.length < conventions.escalationFloorN
      ? 'insufficient'
      : meanBrier > 0.25 ? 'over-escalating' : 'escalation-market-healthy',
    note: graded.length < conventions.escalationFloorN
      ? `Skill is withheld below ${conventions.escalationFloorN} graded commitments. A Brier score over the declared base rate is not yet evidence of judgement.`
      : null,
  };
  if (graded.length >= conventions.escalationFloorN) {
    const kept = graded.filter((c) => c.keptWithinBudget === 1).length / graded.length;
    const base = (kept) ** 2 + (1 - kept) ** 2;
    calibration.skill = num(1 - meanBrier / base, 4);
  }

  // ---- Context loss ladder (Shannon BSC cascade) --------------------------
  const context = [0, 1, 2, 3, 4].map((r) => bscContext(r, conventions.escalationContextLossPerRungPct));

  const totals = totalsFor(scoped, built, conventions, { cellFloor: conventions.escalationCellFloor });
  const queueRows = seatRows.map((r) => ({ ...r.queue, seatId: r.seatId, label: r.label, receivedN: r.receivedN }))
    .filter((q) => q.state === 'saturated' || q.state === 'unstable');

  return {
    engineVersion: 'escalation-economy-2026.11-v1',
    generatedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    conventions,
    windowDays: conventions.escalationWindowDays,
    windowStart,
    seatId: viewer?.id || null,
    seatLabel: viewer?.fullAccess ? 'Workspace operator' : viewer?.name || null,
    rank: viewer?.rank ?? 5,
    disclosure,
    totals,
    seatRows: disclosure === 'aggregate'
      ? seatRows.map((r) => ({ ...r, directN: null, inheritedN: null }))
      : seatRows,
    byAltitude,
    classes,
    authority,
    commitments: commitments.slice().sort((a, b) => String(b.declaredOn).localeCompare(String(a.declaredOn))),
    calibration,
    monkeys,
    context,
    saturatedQueues: queueRows,
    openEscalations: openOnBack.length,
    attentionCount: monkeys.overReturnWindow.length + queueRows.length + (totals.verdict === 'pure-overhead' ? 1 : 0),
    warnings,
    limits: [
      'Cost rates are declared conventions, not audited payroll facts.',
      'Commitment grading is an association between a declared ceiling and what was later observed, never a causal effect.',
      'Subsidiarity is measured on recorded dispositions; a decision that never reached the ledger is invisible here.',
      'No person is rated, ranked or scored. Every subject is a decision class and a span.',
    ],
  };
}

/** Identity-free Markdown brief: no person id, no seat name, no title, no note. */
export function escalationBriefText(report = {}) {
  const c = report.conventions || {};
  const t = report.totals || {};
  const fmt = (v, suffix = '') => (v === null || v === undefined ? 'withheld' : `${v}${suffix}`);
  const lines = [
    '# Escalation Economy — executive brief',
    '',
    `Generated: ${String(report.generatedAt || '').slice(0, 10)} · window: ${report.windowDays || 90} days · engine ${report.engineVersion || ''}`,
    '',
    '## Where decisions are being taken',
    '',
    `- Decision moments recorded: ${fmt(t.records)}`,
    `- Absorbed where they arose: ${fmt(t.absorbed)}`,
    `- Escalated upward: ${fmt(t.escalated)}`,
    t.escalationRate?.pct !== null && t.escalationRate?.pct !== undefined
      ? `- Escalation rate: ${fmt(t.escalationRate.pct, '%')} (Wilson 95% ${fmt(t.escalationRate.lo, '%')}–${fmt(t.escalationRate.hi, '%')}, n=${t.escalationRate.n})`
      : '- Escalation rate: withheld below the small-cell floor',
    `- Defensive escalations (cover or capacity): ${fmt(t.defensiveN)}${t.defensivePct !== null ? ` (${t.defensivePct}% of escalations)` : ''}`,
    '',
    '## What escalation bought',
    '',
    t.yield?.pct !== null && t.yield?.pct !== undefined
      ? `- Escalation yield (settled escalations where the answer actually changed): ${fmt(t.yield.pct, '%')} (Wilson 95% ${fmt(t.yield.lo, '%')}–${fmt(t.yield.hi, '%')}, n=${t.yield.n})`
      : '- Escalation yield: withheld below the small-cell floor',
    `- Yield floor: ${fmt(c.escalationYieldFloorPct, '%')} — below it, escalation is moving risk without changing the answer.`,
    `- Verdict: ${t.verdict || 'unmeasured'}`,
    '',
    '## What escalation cost',
    '',
    `- Declared cost of escalated attention: ${fmt(t.tax?.units)} ${t.tax?.currency || ''} (${fmt(t.tax?.hours)} leader-hours / ${fmt(t.tax?.personDays)} person-days)`,
    `- Mean rungs crossed per escalation: ${fmt(t.tax?.meanRungs)}`,
    `- Context still arriving at the decider (Shannon, per rung): ${(report.context || []).map((r) => `${r.rungs}→${fmt(r.mutualInformationBits, ' bits')}`).join(', ')}`,
    '',
    '## Queue integrity by altitude',
    '',
    '| Altitude | Seats | Recorded | Escalated | Escalation rate | Yield | Tax (hours) | Saturated | Unstable |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(report.byAltitude || []).map((a) => `| ${a.altitudeKey} | ${a.seats} | ${a.records} | ${a.escalated} | ${fmt(a.escalationRate?.pct, '%')} | ${fmt(a.yield?.pct, '%')} | ${fmt(a.taxHours)} | ${a.saturatedSeats} | ${a.unstableSeats} |`),
    '',
    '## Authority and subsidiarity',
    '',
    `- De facto centralisation findings (observed intervention above the declared commitment): ${(report.authority || []).filter((a) => a.verdict === 'above-commitment').length}`,
    `- Decision classes decided where they arose: ${(report.classes || []).filter((k) => k.verdict === 'decided-where-it-arose').length} of ${(report.classes || []).length}`,
    `- Graded intervention-rate commitments: ${report.calibration?.gradedN || 0}${report.calibration?.brier !== null && report.calibration?.brier !== undefined ? ` · Brier ${report.calibration.brier}` : ''}${report.calibration?.skill !== null && report.calibration?.skill !== undefined ? ` · skill ${report.calibration.skill}` : ''}`,
    '',
    '## Open items sitting above where they arose',
    '',
    `- Escalations still open: ${report.monkeys?.total || 0}`,
    `- Past the ${report.monkeys?.returnWindowDays || 10}-day return window: ${report.monkeys?.overReturnWindow?.length || 0}`,
    '',
    '## Method and limits',
    '',
    ...(report.limits || []).map((l) => `- ${l}`),
    '- Rates below the small-cell floor are BLANK, never zero. Suppression is small-cell withholding, not differential privacy.',
    '- Sources: Aghion & Tirole (1997); Holmström & Milgrom (1991); Jensen & Meckling (1995) and the principle of subsidiarity; Erlang M/M/1 and Kingman (1961); Shannon (1948); Oncken & Wass (1974); Wilson (1927); Brier (1950).',
    '',
  ];
  return lines.join('\n');
}

/** CSV scope #83 — aggregate only: no person id, no seat name, no title, no note. */
export function escalationCsvRows(state = {}, { now = new Date(), settings = state.settings || {} } = {}) {
  const report = buildEscalationReport(state, { now, settings });
  const c = report.conventions;
  const t = report.totals;
  const rows = [];

  rows.push({
    row_kind: 'workspace',
    key: 'all',
    rank: '',
    window_days: report.windowDays,
    recorded_n: t.records,
    absorbed_n: t.absorbed,
    escalated_n: t.escalated,
    escalation_rate_pct: t.escalationRate?.pct ?? null,
    wilson_lo_pct: t.escalationRate?.lo ?? null,
    wilson_hi_pct: t.escalationRate?.hi ?? null,
    defensive_n: t.defensiveN,
    settled_n: t.settledN,
    yield_pct: t.yield?.pct ?? null,
    yield_lo_pct: t.yield?.lo ?? null,
    yield_hi_pct: t.yield?.hi ?? null,
    tax_units: t.tax?.units ?? null,
    tax_hours: t.tax?.hours ?? null,
    tax_person_days: t.tax?.personDays ?? null,
    mean_rungs: t.tax?.meanRungs ?? null,
    saturated_seats: report.saturatedQueues.filter((q) => q.state === 'saturated').length,
    unstable_seats: report.saturatedQueues.filter((q) => q.state === 'unstable').length,
    graded_commitments: report.calibration?.gradedN ?? 0,
    brier: report.calibration?.brier ?? null,
    brier_skill: report.calibration?.skill ?? null,
    yield_floor_pct: c.escalationYieldFloorPct,
    cell_floor: c.escalationCellFloor,
    verdict: t.verdict,
  });

  for (const a of report.byAltitude) {
    rows.push({
      row_kind: 'altitude',
      key: a.altitudeKey,
      rank: '',
      window_days: report.windowDays,
      recorded_n: a.records,
      absorbed_n: a.absorbed,
      escalated_n: a.escalated,
      escalation_rate_pct: a.escalationRate?.pct ?? null,
      wilson_lo_pct: a.escalationRate?.lo ?? null,
      wilson_hi_pct: a.escalationRate?.hi ?? null,
      defensive_n: null,
      settled_n: a.settledN,
      yield_pct: a.yield?.pct ?? null,
      yield_lo_pct: a.yield?.lo ?? null,
      yield_hi_pct: a.yield?.hi ?? null,
      tax_units: a.taxUnits,
      tax_hours: a.taxHours,
      tax_person_days: a.taxPersonDays,
      mean_rungs: null,
      saturated_seats: a.saturatedSeats,
      unstable_seats: a.unstableSeats,
      graded_commitments: null,
      brier: null,
      brier_skill: null,
      yield_floor_pct: c.escalationYieldFloorPct,
      cell_floor: c.escalationCellFloor,
      verdict: a.records < c.escalationCellFloor ? 'insufficient' : 'measured',
    });
  }

  for (const k of report.classes) {
    rows.push({
      row_kind: 'decision-class',
      key: k.decisionClass,
      rank: '',
      window_days: report.windowDays,
      recorded_n: k.n,
      absorbed_n: k.atOriginN,
      escalated_n: k.escalatedN,
      escalation_rate_pct: k.n ? num((k.escalatedN / k.n) * 100, 1) : null,
      wilson_lo_pct: k.subsidiarity?.lo ?? null,
      wilson_hi_pct: k.subsidiarity?.hi ?? null,
      defensive_n: null,
      settled_n: null,
      yield_pct: k.subsidiarity?.pct ?? null,
      yield_lo_pct: null,
      yield_hi_pct: null,
      tax_units: null,
      tax_hours: null,
      tax_person_days: null,
      mean_rungs: k.meanRungs,
      saturated_seats: null,
      unstable_seats: null,
      graded_commitments: null,
      brier: null,
      brier_skill: null,
      yield_floor_pct: c.escalationYieldFloorPct,
      cell_floor: c.escalationCellFloor,
      verdict: k.verdict,
    });
  }

  return rows;
}

/** Platform-shaped signals for `#/insights` (ESC-01..05). */
export function escalationSignals(state = {}, now = new Date(), settings = state.settings || {}) {
  if (!Array.isArray(state?.escalationRecords) || state.escalationRecords.length === 0) return [];
  const report = buildEscalationReport(state, { now, settings });
  const out = [];
  const c = report.conventions;

  const unstable = report.saturatedQueues.filter((q) => q.state === 'unstable');
  if (unstable.length > 0) {
    out.push({
      ruleId: 'ESC-01',
      domain: 'Escalation economy',
      title: unstable.length === 1
        ? 'A receiving span is queue-unstable: arrivals meet or exceed its decision rate'
        : `${unstable.length} receiving spans are queue-unstable: arrivals meet or exceed their decision rate`,
      detail: `M/M/1 (Erlang): λ ≥ μ, so ρ ≥ 1 and no finite waiting time exists. The honest response is to move authority or resize the queue, not to ask the span to work faster.`,
      severity: 4,
      confidence: 'high',
      evidence: unstable.slice(0, 4).map(
        (q) => `${q.label}: λ ${q.arrivalsPerWeek}/wk vs service rate ${q.serviceRatePerWeek}/wk`,
      ),
      action: { label: 'Inspect the queue', route: '#/escalation?panel=queue' },
    });
  }

  if (report.totals.verdict === 'pure-overhead') {
    out.push({
      ruleId: 'ESC-02',
      domain: 'Escalation economy',
      title: 'Escalation is pure overhead: it is moving risk without changing the answer',
      detail: `Escalation yield is ${report.totals.yield.pct}% against a declared floor of ${c.escalationYieldFloorPct}% over ${report.totals.settledN} settled escalations. Aghion & Tirole (1997): a principal who intervenes without changing the outcome destroys the agent's incentive to gather information at no benefit.`,
      severity: 3,
      confidence: 'high',
      evidence: [
        `Yield ${report.totals.yield.pct}% (Wilson 95% ${report.totals.yield.lo}–${report.totals.yield.hi}%, n=${report.totals.settledN})`,
        `Declared cost of that escalated attention: ${report.totals.tax.units} ${report.totals.tax.currency} / ${report.totals.tax.hours} leader-hours`,
      ],
      action: { label: 'Inspect yield', route: '#/escalation?panel=yield' },
    });
  }

  const defensive = report.totals.defensiveN;
  if (defensive > 0 && report.totals.escalated >= c.escalationCellFloor) {
    out.push({
      ruleId: 'ESC-03',
      domain: 'Escalation economy',
      title: `${defensive} escalations were logged as defensive (cover or capacity, not authority)`,
      detail: `Holmström & Milgrom (1991): an unmeasured task starves, and asking for cover is the unmeasured task no performance system counts. ${report.totals.defensivePct}% of all escalations were logged as "I want cover" or "I lack the bandwidth" — a question about the incentive, not about the person.`,
      severity: 3,
      confidence: 'high',
      evidence: [`Defensive share ${report.totals.defensivePct}% of ${report.totals.escalated} escalations over ${report.windowDays} days`],
      action: { label: 'Inspect authority', route: '#/escalation?panel=authority' },
    });
  }

  const centralised = report.authority.filter((a) => a.verdict === 'above-commitment');
  if (centralised.length > 0) {
    out.push({
      ruleId: 'ESC-04',
      domain: 'Escalation economy',
      title: centralised.length === 1
        ? 'De facto centralisation: a span is intervening above its own declared commitment'
        : `De facto centralisation: ${centralised.length} spans intervene above their own declared commitment`,
      detail: 'Formal authority is delegated on paper while real authority is still taken above. The declared intervention-rate commitment is the instrument that makes delegation credible; breaching it restores the information problem it was meant to solve.',
      severity: 3,
      confidence: 'high',
      evidence: centralised.slice(0, 4).map(
        (a) => `${a.label}: observed ${a.observed.pct}% vs committed ${a.committedInterventionRatePct}% (${a.deltaPp > 0 ? '+' : ''}${a.deltaPp} pp, n=${a.n})`,
      ),
      action: { label: 'Inspect authority', route: '#/escalation?panel=authority' },
    });
  }

  const late = report.monkeys.overReturnWindow.length;
  if (late > 0) {
    out.push({
      ruleId: 'ESC-05',
      domain: 'Escalation economy',
      title: `${late} escalations have sat above where they arose for longer than the ${report.monkeys.returnWindowDays}-day return window`,
      detail: 'Oncken & Wass (1974): a problem that migrates onto the manager\'s back is then fed by the manager. Return it with the authority to decide, not with an answer.',
      severity: 2,
      confidence: 'high',
      evidence: report.monkeys.bySender.slice(0, 4).map((m) => `${m.label}: ${m.count} open, oldest ${m.oldestDays} days`),
      action: { label: 'Open the monkey ledger', route: '#/escalation?panel=ledger' },
    });
  }

  return out;
}

/** Nav badge: cheap count, never a full report under a declared seat. */
export function escalationAttentionCount(state = {}, now = new Date(), settings = state.settings || {}) {
  const records = Array.isArray(state?.escalationRecords) ? state.escalationRecords : [];
  if (!records.length) return 0;
  const conventions = escalationConventions(settings || {});
  const today = dayKey(now);
  const open = records.filter(
    (r) => r && r.disposition === 'escalated' && (r.status === 'open' || r.status === 'received'),
  );
  const late = open.filter((r) => daysBetween(r.loggedOn, today) > conventions.escalationReturnDays);
  return late.length;
}

export { weekKey };
