/**
 * app/core/domain/hindsight.js — the Hindsight Lock engine (`#/hindsight`,
 * Schema v104, ADR-0102).
 *
 * Pure: no DOM, no storage, no wall-clock globals, no unseeded randomness. Every
 * function that needs today takes `now`. Every figure the screen prints is
 * derived here, so a view can never invent one.
 *
 * THREE COMPUTATIONS
 * ------------------
 *  1. THE LOCK. The moment a decision exists, freeze its INFORMATION SET: the
 *     workspace records the shared link spine had already tied to it ON OR
 *     BEFORE the decision date, each with its own date, plus the decision's
 *     process quality as the record stood then. Links carry `createdOn`, so even
 *     a lock written retrospectively reconstructs the same set exactly — the
 *     information set is a property of the link history, not of when we looked.
 *
 *  2. THE PARTITION. Later, every record the decision is NOW understood to rest
 *     on is split by date and by link history into three sets:
 *       known   linked on or before the decision
 *       missed  linked afterwards, but dated on or before the decision — on the
 *               record at the time, not consulted at the time
 *       later   dated after the decision — excluded; nobody could have used it
 *     plus `undated` for records whose own date cannot be resolved (excluded and
 *     printed). Coverage is known / (known + missed), Wilson-bounded, REFUSED
 *     below the declared fact floor.
 *
 *  3. LUCK. Each settled decision lands in one of four quadrants — earned,
 *     resulted, variance, fixable — or in `unmeasured` when the information axis
 *     cannot be measured. At workspace scale the module prints the resulting
 *     share (the good outcomes that came out of a thin process) with its Wilson
 *     interval and tests process × outcome with Fisher's exact test, refused
 *     below the declared settled floor. Association, never causation.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never rewrites a lock, never re-dates a claim and never infers relevance
 *    (only typed links count).
 *  - It never charges a decision for a fact that arrived after it.
 *  - It never rates, ranks or names a person; above director rank the roll-up is
 *    counts by altitude.
 *  - It never prints a refused rate, a suppressed cell or a p-value below its
 *    floor.
 */

import { addDays, dayKey, daysBetween, round, weekKey } from '../time.js';
import { buildSeats, activeSeat } from './seat.js';
import { LEADER_ID } from './chain.js';
import { LINK_ENTITY_COLLECTIONS, resolveLinkedEntity } from './cases.js';
import { decisionQuality } from './decisions.js';
import {
  HINDSIGHT_ACTOR_TYPES,
  HINDSIGHT_DATE_FIELDS,
  HINDSIGHT_DEFAULTS,
  HINDSIGHT_DISCLOSURE,
  HINDSIGHT_ENGINE_VERSION,
  HINDSIGHT_LIMITS,
  HINDSIGHT_PLAYBOOK,
  HINDSIGHT_PREMISE,
  HINDSIGHT_QUADRANTS,
} from './hindsightRegistry.js';
import { hindsightConventions } from './hindsightSchema.js';

/* ------------------------------------------------------------------ */
/* Dates                                                              */
/* ------------------------------------------------------------------ */

function asDay(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  return null;
}

/**
 * The day a linked record became part of the record, read from the record
 * itself. First present field wins; a type with no declared field, or a record
 * with none of them populated, is `undated` — excluded from coverage and
 * printed, never guessed.
 */
export function recordDateOf(state, type, id) {
  const fields = HINDSIGHT_DATE_FIELDS[type];
  if (!fields || !state || !id) return null;
  let entity = null;
  const collection = LINK_ENTITY_COLLECTIONS[type];
  if (collection && Array.isArray(state[collection])) {
    entity = state[collection].find((row) => row && row.id === id) || null;
  }
  if (!entity) {
    const projected = safeResolve(state, type, id);
    entity = projected && projected.raw ? projected.raw : projected;
  }
  if (!entity) return null;
  for (const field of fields) {
    const value = asDay(entity[field]);
    if (value) return value;
  }
  return null;
}

function safeResolve(state, type, id) {
  try {
    return resolveLinkedEntity(state, type, id) || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Information set                                                    */
/* ------------------------------------------------------------------ */

/**
 * Every record the workspace currently ties to a decision through the shared
 * typed link spine, in either direction, with the day the LINK was written.
 * Actors (people) and other locks are not facts: a person is who decided, not
 * what the decision rested on.
 *
 * @returns {Array<{type:string,id:string,on:string|null,linkOn:string|null}>}
 */
export function linkedFacts(state, decisionId) {
  if (!state || !decisionId) return [];
  const links = Array.isArray(state.links) ? state.links : [];
  const seen = new Set();
  const out = [];
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    // The module's OWN edges (a lock to its decision, a finding to the decision
    // it was read from) are provenance, not facts. Counting them would let the
    // audit inflate its own information set and drift with every scan.
    if (String(link.ruleId || '').startsWith('RULE-HND')) continue;
    let other = null;
    if (link.sourceType === 'decision' && link.sourceId === decisionId) {
      other = { type: link.targetType, id: link.targetId };
    } else if (link.targetType === 'decision' && link.targetId === decisionId) {
      other = { type: link.sourceType, id: link.sourceId };
    }
    if (!other || !other.type || !other.id) continue;
    if (HINDSIGHT_ACTOR_TYPES.includes(other.type)) continue;
    const key = `${other.type}:${other.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: other.type,
      id: other.id,
      on: recordDateOf(state, other.type, other.id),
      linkOn: asDay(link.createdOn) || (link.createdAt ? asDay(String(link.createdAt).slice(0, 10)) : null),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lock                                                               */
/* ------------------------------------------------------------------ */

/**
 * Build the lock record for one decision. `consulted` is the information set:
 * every fact whose link predates or coincides with the decision date. A fact
 * linked later is deliberately NOT frozen — it is exactly what the partition
 * will later report as knowable-but-unconsulted or arrived-later.
 */
export function buildLockRecord(state, decision, { id, now, settings = {}, seatId = null } = {}) {
  if (!decision || !decision.id) {
    return { ok: false, error: 'A lock needs a decision record with an id.' };
  }
  const decisionOn = asDay(decision.decidedOn) || asDay(decision.date) || dayKey(now);
  const facts = linkedFacts(state, decision.id);
  const consulted = facts
    .filter((fact) => (fact.linkOn ? fact.linkOn <= decisionOn : true))
    .slice(0, HINDSIGHT_LIMITS.consultedPerLock)
    .map((fact) => ({ type: fact.type, id: fact.id, on: fact.on }));
  const quality = decisionQuality(decision);
  const built = buildSeats(state, { now, settings });
  const seat = seatId
    ? (built.byId.get(seatId) || activeSeat(built))
    : activeSeat(built);
  const frozenOn = dayKey(now);
  return {
    ok: true,
    lock: {
      id,
      decisionId: decision.id,
      decisionOn,
      frozenOn,
      frozenAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
      ownerSeatId: seat && seat.id !== LEADER_ID ? seat.id : LEADER_ID,
      altitudeKey: seat ? seat.altitudeKey : null,
      rank: seat ? seat.rank : 5,
      consulted,
      consultedN: consulted.length,
      undatedN: consulted.filter((fact) => !fact.on).length,
      qualityMet: quality.checks.filter((check) => check.met).length,
      qualityMissing: quality.checks.filter((check) => !check.met).map((check) => check.label),
      reviewOn: asDay(decision.reviewOn),
      quadrantAtFreeze: null,
      engineVersion: HINDSIGHT_ENGINE_VERSION,
      createdAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    },
  };
}

/** The graded quadrant labels the workspace uses, in reading order. */
export const QUADRANT_ORDER = Object.freeze(['earned', 'resulted', 'variance', 'fixable', 'unmeasured']);

/* ------------------------------------------------------------------ */
/* Statistics                                                         */
/* ------------------------------------------------------------------ */

/** Wilson (1927) score interval for a binomial share, in percent. */
export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const clamp = (value) => Math.min(100, Math.max(0, round(value * 100, 1)));
  return {
    pct: clamp(p),
    lowPct: clamp(Math.max(0, centre - halfWidth)),
    highPct: clamp(Math.min(1, centre + halfWidth)),
  };
}

const LOG_FACTORIAL = (() => {
  const table = [0];
  for (let i = 1; i <= 4096; i += 1) table[i] = table[i - 1] + Math.log(i);
  return table;
})();

function logFactorial(n) {
  if (n <= 0) return 0;
  if (n < LOG_FACTORIAL.length) return LOG_FACTORIAL[n];
  return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);
}

function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/**
 * Fisher's exact test, two-sided, on a 2×2 table `[[a, b], [c, d]]`.
 *
 * Exact hypergeometric enumeration of every table with the observed margins,
 * summing the probabilities at or below the observed one — the conventional
 * definition, not a chi-square approximation, because these tables are small by
 * construction (the module refuses to test a large one).
 *
 * @returns {{ p:number, expected:number, supported:boolean, reason:string }}
 */
export function fisherExactTwoSided(a, b, c, d) {
  const rows = [a + b, c + d];
  const cols = [a + c, b + d];
  const n = a + b + c + d;
  if (n <= 0) return { p: null, expected: 0, supported: false, reason: 'The table is empty.' };
  if (rows[0] === 0 || rows[1] === 0 || cols[0] === 0 || cols[1] === 0) {
    return { p: null, expected: (rows[0] * cols[0]) / n, supported: false, reason: 'A margin is zero, so there is no association to test — every table with these margins fits perfectly.' };
  }
  const logDenom = logChoose(n, cols[0]);
  const expected = (rows[0] * cols[0]) / n;
  const minA = Math.max(0, cols[0] - rows[1]);
  const maxA = Math.min(rows[0], cols[0]);
  const logP = (x) => logChoose(rows[0], x) + logChoose(rows[1], cols[0] - x) - logDenom;
  const observed = logP(a);
  let total = 0;
  for (let x = minA; x <= maxA; x += 1) {
    const value = logP(x);
    if (value <= observed + 1e-9) total += Math.exp(value);
  }
  return { p: Math.min(1, Math.max(0, total)), expected, supported: true, reason: '' };
}

/* ------------------------------------------------------------------ */
/* Audit                                                              */
/* ------------------------------------------------------------------ */

const GOOD = 'good';
const BAD = 'bad';

function outcomeOf(decision) {
  if (!decision) return null;
  if (decision.outcome === 'good' || decision.outcome === 'mixed' || decision.outcome === 'bad') return decision.outcome;
  return null;
}

/**
 * Read one lock against the record as it stands now.
 *
 * The frozen claim (consulted set, process quality) is the claim; everything
 * live — the current links, the outcome — is measured against it.
 */
export function auditLock(state, lock, { now = new Date(), settings = {} } = {}) {
  const conventions = hindsightConventions(settings);
  const decisions = Array.isArray(state?.decisions) ? state.decisions : [];
  const decision = decisions.find((row) => row && row.id === lock.decisionId) || null;
  const current = linkedFacts(state, lock.decisionId);
  const frozenIds = new Set((lock.consulted || []).map((fact) => `${fact.type}:${fact.id}`));

  const known = [];
  for (const fact of lock.consulted || []) {
    if (!fact.on) continue;
    if (fact.on > lock.decisionOn) continue; // cannot be known before it existed
    known.push({ type: fact.type, id: fact.id, on: fact.on, cls: 'known' });
  }
  const knownKeys = new Set(known.map((fact) => `${fact.type}:${fact.id}`));

  const missed = [];
  const later = [];
  let undatedN = 0;
  for (const fact of current) {
    const key = `${fact.type}:${fact.id}`;
    if (knownKeys.has(key) || frozenIds.has(key)) continue;
    if (!fact.on) {
      undatedN += 1;
      continue;
    }
    if (fact.on <= lock.decisionOn) {
      missed.push({ type: fact.type, id: fact.id, on: fact.on, cls: 'missed' });
    } else {
      later.push({ type: fact.type, id: fact.id, on: fact.on, cls: 'later' });
    }
  }
  missed.sort((a, b) => String(b.on).localeCompare(String(a.on)));
  later.sort((a, b) => String(b.on).localeCompare(String(a.on)));

  const knowableN = known.length + missed.length;
  const refused = knowableN < conventions.hindsightFactFloor;
  const interval = refused ? null : wilsonInterval(known.length, knowableN);
  const coverage = refused
    ? {
      pct: null,
      lowPct: null,
      highPct: null,
      refused: true,
      reason: `${knowableN} dated fact(s) link to this decision — below the declared floor of ${conventions.hindsightFactFloor}. A rate over two facts is not a rate.`,
    }
    : {
      pct: interval.pct,
      lowPct: interval.lowPct,
      highPct: interval.highPct,
      refused: false,
      reason: '',
    };
  coverage.knownN = known.length;
  coverage.missedN = missed.length;
  coverage.laterN = later.length;
  coverage.undatedN = undatedN;
  coverage.knowableN = knowableN;

  const outcome = outcomeOf(decision);
  const status = !decision ? 'missing' : !decision.chosen ? 'open' : outcome ? 'settled' : 'pending';

  const qualityMet = Number.isFinite(lock.qualityMet) ? lock.qualityMet : 0;
  const processSound = qualityMet >= conventions.hindsightQualityFloor;
  let informed = null;
  if (!coverage.refused) {
    informed = processSound && coverage.pct >= conventions.hindsightCoveragePct;
  }

  let quadrant = null;
  let quadrantReason = '';
  if (status !== 'settled') {
    quadrant = null;
    quadrantReason = status === 'open'
      ? 'No option has been chosen yet, so there is no call to grade.'
      : status === 'pending'
        ? 'A call was made. No outcome is recorded yet, so the quadrant would be a guess.'
        : 'The decision record behind this lock no longer exists.';
  } else if (outcome === 'mixed') {
    quadrant = 'unmeasured';
    quadrantReason = 'A mixed outcome is neither good nor bad, so it is counted and excluded from the quadrant table rather than forced into one.';
  } else if (informed === null) {
    quadrant = 'unmeasured';
    quadrantReason = coverage.refused
      ? coverage.reason
      : `The process record met ${qualityMet} of 5 declared requirements and the information set could not be measured.`;
  } else if (informed && outcome === GOOD) {
    quadrant = 'earned';
  } else if (!informed && outcome === GOOD) {
    quadrant = 'resulted';
  } else if (informed && outcome === BAD) {
    quadrant = 'variance';
  } else {
    quadrant = 'fixable';
  }

  const newestKnown = known.reduce((acc, fact) => (acc && acc > fact.on ? acc : fact.on), null);
  const lagDays = newestKnown ? Math.max(0, daysBetween(newestKnown, lock.decisionOn)) : null;
  const oldestMissed = missed.length ? missed[missed.length - 1].on : null;
  const missingWeeks = oldestMissed ? Math.max(0, daysBetween(oldestMissed, lock.decisionOn)) : null;

  const reviewDue = lock.reviewOn ? addDays(lock.reviewOn, conventions.hindsightReviewGraceDays) : null;
  const overdue = Boolean(reviewDue && status !== 'settled' && reviewDue < dayKey(now));

  return {
    lockId: lock.id,
    decisionId: lock.decisionId,
    decisionOn: lock.decisionOn,
    frozenOn: lock.frozenOn,
    retrospective: lock.frozenOn > lock.decisionOn,
    ageDays: Math.max(0, daysBetween(lock.decisionOn, dayKey(now))),
    ownerSeatId: lock.ownerSeatId || null,
    altitudeKey: lock.altitudeKey || null,
    rank: Number.isFinite(lock.rank) ? lock.rank : 5,
    status,
    outcome,
    title: decision ? decision.title : '',
    reversibility: decision ? decision.reversibility : null,
    reviewOn: lock.reviewOn,
    reviewDue,
    overdue,
    quality: {
      met: qualityMet,
      total: 5,
      floor: conventions.hindsightQualityFloor,
      sound: processSound,
      missing: Array.isArray(lock.qualityMissing) ? lock.qualityMissing : [],
    },
    known,
    missed,
    later,
    undatedN,
    coverage,
    informed,
    processSound,
    quadrant,
    quadrantMeta: quadrant ? HINDSIGHT_QUADRANTS[quadrant] : null,
    quadrantReason,
    lagDays,
    missedLagDays: missingWeeks,
  };
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

function emptyCells() {
  const out = {};
  for (const key of QUADRANT_ORDER) out[key] = 0;
  return out;
}

function inScope(seat, seatId) {
  if (!seat) return true;
  if (!seatId) return false;
  if (seat.fullAccess) return true;
  return seatId === seat.id || (seat.scope && seat.scope.has(seatId));
}

/**
 * The whole terminal, scoped to the active seat.
 *
 * A seat sees the locks it owns and the locks owned inside its span. Above
 * director rank the per-span rows are replaced by counts by altitude, and every
 * small cell is suppressed with a complementary partner so a total cannot be
 * differenced back into the withheld cell.
 */
export function buildHindsightReport(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || {};
  const conventions = hindsightConventions(effective);
  const built = buildSeats(state, { now, settings: effective });
  const seat = activeSeat(built);
  const locks = Array.isArray(state?.decisionLocks) ? state.decisionLocks : [];
  const locksInScope = locks.filter((lock) => inScope(seat, lock.ownerSeatId));
  const audits = locksInScope
    .map((lock) => auditLock(state, lock, { now, settings: effective }))
    .sort((a, b) => String(b.decisionOn).localeCompare(String(a.decisionOn)));

  const counts = { locksN: audits.length, openN: 0, pendingN: 0, settledN: 0, missingN: 0, overdueN: 0, retrospectiveN: 0 };
  const cells = { byAltitude: new Map(), bySeat: new Map(), quadrants: emptyCells() };
  const requirementMisses = new Map();

  for (const audit of audits) {
    if (audit.status === 'open') counts.openN += 1;
    else if (audit.status === 'pending') counts.pendingN += 1;
    else if (audit.status === 'settled') counts.settledN += 1;
    else counts.missingN += 1;
    if (audit.overdue) counts.overdueN += 1;
    if (audit.retrospective) counts.retrospectiveN += 1;
    for (const label of audit.quality.missing) {
      requirementMisses.set(label, (requirementMisses.get(label) || 0) + 1);
    }
    const altKey = audit.altitudeKey || 'unassigned';
    if (!cells.byAltitude.has(altKey)) cells.byAltitude.set(altKey, { altitudeKey: altKey, locksN: 0, measuredN: 0, ...emptyCells() });
    const altCell = cells.byAltitude.get(altKey);
    altCell.locksN += 1;
    if (audit.quadrant) {
      altCell[audit.quadrant] += 1;
      cells.quadrants[audit.quadrant] += 1;
      if (audit.quadrant !== 'unmeasured') altCell.measuredN += 1;
    }
    const seatKey = audit.ownerSeatId || 'unassigned';
    if (!cells.bySeat.has(seatKey)) cells.bySeat.set(seatKey, { seatKey, locksN: 0, measuredN: 0, ...emptyCells() });
    const seatCell = cells.bySeat.get(seatKey);
    seatCell.locksN += 1;
    if (audit.quadrant && audit.quadrant !== 'unmeasured') {
      seatCell[audit.quadrant] += 1;
      seatCell.measuredN += 1;
    }
  }

  /* ---------------------------------------------------------- luck */
  const goodN = audits.filter((a) => a.status === 'settled' && a.outcome === GOOD).length;
  const badN = audits.filter((a) => a.status === 'settled' && a.outcome === BAD).length;
  const mixedN = audits.filter((a) => a.status === 'settled' && a.outcome === 'mixed').length;
  const measuredN = goodN + badN;
  const resultedN = audits.filter((a) => a.quadrant === 'resulted').length;
  const earnedN = audits.filter((a) => a.quadrant === 'earned').length;
  const varianceN = audits.filter((a) => a.quadrant === 'variance').length;
  const fixableN = audits.filter((a) => a.quadrant === 'fixable').length;
  const unmeasuredN = audits.filter((a) => a.quadrant === 'unmeasured').length;
  const thinN = resultedN + fixableN;
  const thickN = earnedN + varianceN;

  const shareFloor = Math.max(3, conventions.hindsightCellFloor);
  const shareRefused = goodN < shareFloor;
  const shareInterval = shareRefused ? null : wilsonInterval(resultedN, goodN);
  const resultingShare = shareRefused
    ? { pct: null, lowPct: null, highPct: null, refused: true, reason: `Only ${goodN} graded good outcome(s) in scope — below the declared floor of ${shareFloor}. The share of wins that came out of a thin process is not estimable at this sample.` }
    : { pct: shareInterval.pct, lowPct: shareInterval.lowPct, highPct: shareInterval.highPct, refused: false, reason: '' };

  const testRefused = measuredN < conventions.hindsightSettledFloor;
  const test = testRefused
    ? { p: null, expected: thinN > 0 && measuredN > 0 ? round((goodN * thinN) / measuredN, 2) : 0, supported: false, reason: `Only ${measuredN} graded decision(s) have a measurable information axis — below the declared settled floor of ${conventions.hindsightSettledFloor}. At this sample every pattern looks significant.` }
    : fisherExactTwoSided(resultedN, earnedN, fixableN, varianceN);

  /* ------------------------------------------------------- cohorts */
  const cohortMap = new Map();
  for (const audit of audits) {
    const key = String(audit.decisionOn).slice(0, 7);
    if (!cohortMap.has(key)) cohortMap.set(key, { key, locksN: 0, goodN: 0, resultedN: 0 });
    const row = cohortMap.get(key);
    row.locksN += 1;
    if (audit.status === 'settled' && audit.outcome === GOOD) row.goodN += 1;
    if (audit.quadrant === 'resulted') row.resultedN += 1;
  }
  const cohorts = [...cohortMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => {
      const refusedShare = row.goodN < shareFloor;
      const interval = refusedShare ? null : wilsonInterval(row.resultedN, row.goodN);
      return {
        ...row,
        sharePct: interval ? interval.pct : null,
        shareLowPct: interval ? interval.lowPct : null,
        shareHighPct: interval ? interval.highPct : null,
        refused: refusedShare,
      };
    });

  /* ------------------------------------------------------- roll-up */
  const cellFloor = conventions.hindsightCellFloor;
  const seatRows = [];
  if (seat.rank <= 3) {
    for (const candidate of built.seats) {
      const ownsInside = audits.filter((audit) => inScope(candidate, audit.ownerSeatId)).length;
      if (!ownsInside) continue;
      if (!inScope(seat, candidate.id)) continue;
      const cell = cells.bySeat.get(candidate.id) || { locksN: 0, measuredN: 0, ...emptyCells() };
      seatRows.push({
        seatId: candidate.id,
        name: candidate.name,
        altitudeKey: candidate.altitudeKey,
        rank: candidate.rank,
        locksN: cell.locksN,
        subtreeLockN: ownsInside,
        measuredN: cell.measuredN,
        earnedN: cell.earned,
        resultedN: cell.resulted,
        varianceN: cell.variance,
        fixableN: cell.fixable,
        unmeasuredN: cell.unmeasured,
        suppressed: cell.locksN > 0 && cell.locksN < cellFloor,
      });
    }
    // Complementary suppression: a lone suppressed cell beside a printed total
    // is recoverable by subtraction, so suppress the smallest partner too.
    const suppressed = seatRows.filter((row) => row.suppressed);
    if (suppressed.length === 1) {
      const partner = seatRows
        .filter((row) => !row.suppressed)
        .sort((a, b) => a.locksN - b.locksN)[0];
      if (partner) {
        partner.suppressed = true;
        partner.complementary = true;
      }
    }
  }

  const altitudeRows = [...cells.byAltitude.values()]
    .map((cell) => ({
      ...cell,
      suppressed: cell.locksN > 0 && cell.locksN < cellFloor,
    }))
    .sort((a, b) => String(a.altitudeKey).localeCompare(String(b.altitudeKey)));

  const requirements = [...requirementMisses.entries()]
    .map(([label, missingN]) => ({ label, missingN, metN: audits.length - missingN }))
    .sort((a, b) => b.missingN - a.missingN);

  const playbook = HINDSIGHT_PLAYBOOK[seat.altitudeKey] || HINDSIGHT_PLAYBOOK.chief;

  const report = {
    ok: true,
    engineVersion: HINDSIGHT_ENGINE_VERSION,
    premise: HINDSIGHT_PREMISE,
    disclosure: HINDSIGHT_DISCLOSURE,
    conventions,
    generatedOn: dayKey(now),
    weekKey: weekKey(now),
    seat: {
      id: seat.id,
      name: seat.name,
      label: seat.label,
      altitudeKey: seat.altitudeKey,
      rank: seat.rank,
      fullAccess: Boolean(seat.fullAccess),
    },
    playbook,
    audits,
    summary: {
      ...counts,
      scopeSeatsN: seat.scopeN || 0,
      totalLocksN: locks.length,
    },
    quadrants: {
      order: QUADRANT_ORDER,
      counts: cells.quadrants,
      meta: HINDSIGHT_QUADRANTS,
      goodN,
      badN,
      mixedN,
      measuredN,
      resultedN,
      earnedN,
      varianceN,
      fixableN,
      unmeasuredN,
      thinN,
      thickN,
      resultingShare,
      test: { ...test, refused: testRefused || !test.supported },
    },
    requirements,
    altitudeRows,
    seatRows,
    cohorts,
    suppressedSeatRowsN: seatRows.filter((row) => row.suppressed).length,
    ungraded: audits.filter((audit) => audit.overdue),
    flagged: audits.filter((audit) => audit.quadrant === 'resulted' || (audit.missed.length >= conventions.hindsightGapFloor && audit.coverage.pct !== null && audit.coverage.pct < conventions.hindsightCoveragePct)),
  };
  return report;
}

/* ------------------------------------------------------------------ */
/* Brief, attention, CSV                                              */
/* ------------------------------------------------------------------ */

export function hindsightBriefText(report) {
  if (!report || report.ok === false) return { ok: false, error: 'No hindsight report is available.' };
  const s = report.summary;
  const q = report.quadrants;
  const lines = [
    `Hindsight lock — decision process audit (${report.generatedOn})`,
    `Seat: ${report.seat.label}, rank ${report.seat.rank} (the reading is scoped to this seat; no person is named).`,
    `Locks in scope: ${s.locksN} (${s.openN} undecided, ${s.pendingN} decided and ungraded, ${s.settledN} graded, ${s.overdueN} past their review grace).`,
    q.resultingShare.refused
      ? `Resulting share: REFUSED — ${q.resultingShare.reason}`
      : `Resulting share: ${q.resultingShare.pct}% of graded good outcomes came out of a thin process (95% interval ${q.resultingShare.lowPct}–${q.resultingShare.highPct}%; ${q.resultedN} of ${q.goodN}).`,
    q.test.refused
      ? `Process × outcome association: REFUSED — ${q.test.reason}`
      : `Process × outcome association: Fisher exact two-sided p = ${q.test.p.toFixed(3)} on ${q.measuredN} graded decisions (association only; this is not causal).`,
    `Quadrants: earned ${q.earnedN}, resulted ${q.resultedN}, variance ${q.varianceN}, fixable ${q.fixableN}, unmeasured ${q.unmeasuredN}.`,
    report.requirements.length
      ? `Most-missed requirement: ${report.requirements[0].label} (missing on ${report.requirements[0].missingN} frozen record(s)).`
      : 'No frozen record is missing a declared requirement.',
    'No person is named, rated or ranked in this brief. Suppressed cells are blank, never zero.',
  ];
  return { ok: true, text: lines.join('\n') };
}

export function hindsightAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildHindsightReport(state, { now, settings });
  return report.ungraded.length + report.flagged.filter((audit) => audit.quadrant === 'resulted').length;
}

export function hindsightCsvRows(report) {
  if (!report || report.ok === false) return [];
  const rows = [];
  const q = report.quadrants;
  rows.push({
    row_kind: 'summary',
    scope: report.seat.altitudeKey || 'unassigned',
    locks_n: report.summary.locksN,
    open_n: report.summary.openN,
    ungraded_n: report.summary.pendingN,
    graded_n: report.summary.settledN,
    overdue_n: report.summary.overdueN,
    retrospective_n: report.summary.retrospectiveN,
  });
  for (const cell of report.altitudeRows) {
    rows.push({
      row_kind: 'altitude-cell',
      scope: cell.altitudeKey,
      locks_n: cell.suppressed ? '' : cell.locksN,
      measured_n: cell.suppressed ? '' : cell.measuredN,
      earned_n: cell.suppressed ? '' : cell.earned,
      resulted_n: cell.suppressed ? '' : cell.resulted,
      variance_n: cell.suppressed ? '' : cell.variance,
      fixable_n: cell.suppressed ? '' : cell.fixable,
      unmeasured_n: cell.suppressed ? '' : cell.unmeasured,
      suppressed: cell.suppressed ? 'yes' : 'no',
    });
  }
  for (const label of QUADRANT_ORDER) {
    rows.push({ row_kind: 'quadrant', scope: label, graded_n: q.counts[label] });
  }
  rows.push({
    row_kind: 'resulting-share',
    scope: 'good-outcomes',
    graded_n: q.goodN,
    resulted_n: q.resultedN,
    share_pct: q.resultingShare.refused ? '' : q.resultingShare.pct,
    interval_low_pct: q.resultingShare.refused ? '' : q.resultingShare.lowPct,
    interval_high_pct: q.resultingShare.refused ? '' : q.resultingShare.highPct,
    suppressed: q.resultingShare.refused ? 'refused' : 'no',
  });
  rows.push({
    row_kind: 'association-test',
    scope: 'process-vs-outcome',
    graded_n: q.measuredN,
    thin_n: q.thinN,
    thick_n: q.thickN,
    p_value: q.test.refused ? '' : Number(q.test.p.toFixed(4)),
    expected_resulted_n: Number(q.test.expected.toFixed(2)),
    suppressed: q.test.refused ? 'refused' : 'no',
  });
  for (const requirement of report.requirements) {
    rows.push({
      row_kind: 'requirement',
      scope: requirement.label,
      met_n: requirement.metN,
      missing_n: requirement.missingN,
    });
  }
  return rows;
}

export { HINDSIGHT_DEFAULTS };
