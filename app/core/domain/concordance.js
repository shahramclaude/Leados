/**
 * app/core/domain/concordance.js — the Concordance Terminal read model
 * (Schema v89, ADR-0082).
 *
 * THE QUESTION
 * ------------
 * Every review system in the category asks a manager to rate someone against a
 * word. Nobody asks the two people in the room whether they mean the same thing
 * by it. The word is "meets expectations", and in a six-dimension expectation it
 * is six different words: what finished means, how good good is, what outranks
 * what, what may be decided alone, how early a risk must be raised, and what to
 * do when speed and completeness collide.
 *
 * This module treats that as a MEASUREMENT-SYSTEM problem, with the standard
 * industrial toolkit:
 *
 *  - **Measurement Systems Analysis / Gauge R&R** (AIAG & VDA, *MSA Reference
 *    Manual*, 4th ed. 2010): before you trust a number produced by an
 *    instrument, you measure the instrument. Two "gauges" (leader and report)
 *    reading one construct with poor agreement means the resulting rating is
 *    partly artefact — regardless of how honest either person is.
 *  - **Cohen's κ** (1960) and **quadratic weighted κ** (Cohen 1968) for ordinal
 *    scales: chance-corrected exact agreement, penalising a two-step
 *    disagreement more than a one-step one.
 *  - **Gwet's AC1** (2008) and **PABAK** (Byrt, Bishop & Carlin 1993): the two
 *    standard answers to κ's prevalence paradox — the reason a well-calibrated
 *    pair can score κ≈0 when both use one end of the scale. All three are
 *    printed side by side; none is allowed to be the only number.
 *  - **Bland & Altman (1986, 1999)**: the bias (mean signed difference) and the
 *    95% limits of agreement, so "who is asking for more" is a separate question
 *    from "how far apart are we".
 *  - **Landis & Koch (1977)** bands, declared as a CONVENTION on the panel, not
 *    a threshold of truth.
 *  - **Role clarity / expectation specificity** (Hackman & Oldham 1976 job
 *    characteristics; Locke & Latham 1990 goal-setting; Mager & Pipe 1970
 *    "does the person know what is expected and when"): the reason this
 *    instrument is worth running at all.
 *  - **Procedural and interactional justice** (Leventhal 1980; Bies & Moag 1986;
 *    Colquitt et al. 2001): the two sides are sealed until both are in, both see
 *    both, and no figure is ever shown to one side about the other without the
 *    other seeing it too. Agreement is not correctness — two people can agree on
 *    the wrong bar, so a "perfect" reading prints a shared-error warning instead
 *    of a green light.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - It never scores, ranks, rates or profiles a person. The subject of every
 *    figure is a PAIR and an EXPECTATION DIMENSION.
 *  - It never prints an agreement figure below the item floor, a span rate below
 *    the cell floor, or a κ whose marginals make it undefined. A refusal with a
 *    reason is the correct output.
 *  - It never claims agreement implies correctness, and it never calls the
 *    re-test comparison an effect.
 *
 * Pure module: no DOM, storage or implicit clock.
 */

import { addDays, dayKey, daysSince, weekKey } from '../time.js';
import { buildChain, LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { altitudeByKey } from './chainRegistry.js';
import {
  CONCORDANCE_DIMENSIONS,
  CONCORDANCE_DIMENSION_KEYS,
  CONCORDANCE_SCALE,
  CONCORDANCE_CONVENTION_DEFAULTS,
  CONCORDANCE_DISCLOSURE,
  CONCORDANCE_LIMITS,
  concordancePairKey,
} from './concordanceRegistry.js';

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pctOf = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);

export function concordanceConventions(settings = {}) {
  const s = settings || {};
  const d = CONCORDANCE_CONVENTION_DEFAULTS;
  const within = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    agreementFloorPct: within(s.concordanceAgreementFloorPct, 20, 95, d.concordanceAgreementFloorPct),
    cellFloor: within(s.concordanceCellFloor, 1, 50, d.concordanceCellFloor),
    evidenceFloor: within(s.concordanceEvidenceFloor, 1, 50, d.concordanceEvidenceFloor),
    retestDays: within(s.concordanceRetestDays, 3, 180, d.concordanceRetestDays),
    reviewDays: within(s.concordanceReviewDays, 3, 90, d.concordanceReviewDays),
    autoPropagate: s.concordanceAutoPropagate !== false,
    scale: CONCORDANCE_SCALE,
    itemFloor: CONCORDANCE_DIMENSION_KEYS.length,
  };
}

/* ------------------------------------------------------- 1. the statistics */

/** Wilson score interval (1927) for a proportion. Never a normal approximation. */
export function wilsonInterval(successes, n, z = 1.96) {
  if (!Number.isFinite(n) || n <= 0) return { lo: null, hi: null };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lo: Math.round(Math.max(0, centre - half) * 1000) / 10,
    hi: Math.round(Math.min(1, centre + half) * 1000) / 10,
  };
}

/** The paired items of a round: only dimensions both sides answered. */
export function answeredItems(round) {
  const items = Array.isArray(round?.items) ? round.items : [];
  return items
    .filter((i) => i && Number.isInteger(i.leader) && Number.isInteger(i.member))
    .map((i) => ({ key: i.key, leader: i.leader, member: i.member }));
}

function matrixOf(pairs, scale) {
  const O = Array.from({ length: scale }, () => new Array(scale).fill(0));
  for (const p of pairs) O[p.leader - 1][p.member - 1] += 1;
  return O;
}

/**
 * Quadratic weighted κ over the DECLARED five-point scale. The scale is fixed,
 * not derived from the observed categories: a pair that only used 1 and 2 does
 * not get a shorter ruler and therefore a flattering κ.
 */
export function weightedKappa(pairs, scale = CONCORDANCE_SCALE) {
  const n = pairs.length;
  if (!n) return { value: null, reason: 'no paired items' };
  const O = matrixOf(pairs, scale);
  const row = new Array(scale).fill(0);
  const col = new Array(scale).fill(0);
  for (let i = 0; i < scale; i += 1) {
    for (let j = 0; j < scale; j += 1) {
      row[i] += O[i][j];
      col[j] += O[i][j];
    }
  }
  let observed = 0;
  for (let i = 0; i < scale; i += 1) {
    for (let j = 0; j < scale; j += 1) {
      if (!O[i][j]) continue;
      const weight = 1 - ((i - j) / (scale - 1)) ** 2;
      observed += weight * O[i][j];
    }
  }
  const poW = observed / n;
  let expected = 0;
  for (let i = 0; i < scale; i += 1) {
    for (let j = 0; j < scale; j += 1) {
      const weight = 1 - ((i - j) / (scale - 1)) ** 2;
      expected += weight * (row[i] / n) * (col[j] / n);
    }
  }
  const denom = 1 - expected;
  if (denom < 1e-9) {
    return { value: null, reason: 'both sides used a single category, so chance-corrected agreement is undefined (0/0) — read PABAK and the exact rate instead' };
  }
  return { value: (poW - expected) / denom, reason: null, poW, peW: expected };
}

/** Gwet's AC1 (2008) for two raters — the prevalence-robust alternative to κ. */
export function gwetAC1(pairs, scale = CONCORDANCE_SCALE) {
  const n = pairs.length;
  if (!n) return { value: null, reason: 'no paired items' };
  const O = matrixOf(pairs, scale);
  const row = new Array(scale).fill(0);
  const col = new Array(scale).fill(0);
  let exact = 0;
  for (let i = 0; i < scale; i += 1) {
    for (let j = 0; j < scale; j += 1) {
      row[i] += O[i][j];
      col[j] += O[i][j];
      if (i === j) exact += O[i][j];
    }
  }
  const po = exact / n;
  let pe = 0;
  for (let k = 0; k < scale; k += 1) {
    const p = (row[k] + col[k]) / (2 * n);
    pe += (p * (1 - p)) / (scale - 1);
  }
  if (1 - pe < 1e-9) return { value: null, reason: 'prevalence is at ceiling, AC1 is undefined' };
  return { value: (po - pe) / (1 - pe), reason: null };
}

/** PABAK (Byrt et al. 1993): 2·Po − 1. Prevalence- and bias-adjusted, not chance-corrected. */
export function pabak(pairs) {
  const n = pairs.length;
  if (!n) return null;
  const exact = pairs.filter((p) => p.leader === p.member).length;
  return 2 * (exact / n) - 1;
}

/** Bland–Altman bias and 95% limits of agreement on the signed difference. */
export function blandAltman(pairs) {
  const n = pairs.length;
  if (n < 2) return { bias: null, sd: null, lo: null, hi: null, n };
  const diffs = pairs.map((p) => p.leader - p.member);
  const bias = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = diffs.reduce((a, b) => a + (b - bias) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  return { bias, sd, lo: bias - 1.96 * sd, hi: bias + 1.96 * sd, n };
}

const LANDIS_KOCH = Object.freeze([
  { max: 0, label: 'poor' },
  { max: 0.2, label: 'slight' },
  { max: 0.4, label: 'fair' },
  { max: 0.6, label: 'moderate' },
  { max: 0.8, label: 'substantial' },
  { max: 1.01, label: 'almost perfect' },
]);

function bandFor(kappa) {
  if (!Number.isFinite(kappa)) return 'refused';
  const band = LANDIS_KOCH.find((b) => kappa <= b.max);
  return band ? band.label : 'almost perfect';
}

/**
 * Everything that may be said about one round. Refusals are first-class: an
 * incomplete instrument, degenerate marginals or a prevalence-driven κ all
 * produce a printed reason, never a number.
 */
export function concordanceStats(round, conventions = concordanceConventions()) {
  const items = Array.isArray(round?.items) ? round.items : [];
  const pairs = answeredItems(round);
  const n = pairs.length;
  const itemFloor = CONCORDANCE_DIMENSION_KEYS.length;
  const refusalReasons = [];

  if (n < itemFloor) {
    refusalReasons.push(`${n} of ${itemFloor} dimensions answered. The instrument is six items; an agreement figure on ${n} is noise wearing a decimal point. Answer every dimension or leave the round open.`);
  }

  const exactN = pairs.filter((p) => p.leader === p.member).length;
  const within1N = pairs.filter((p) => Math.abs(p.leader - p.member) <= 1).length;
  const kappa = n ? weightedKappa(pairs, conventions.scale) : { value: null, reason: 'no paired items' };
  const ac1 = n ? gwetAC1(pairs, conventions.scale) : { value: null, reason: 'no paired items' };
  const pabakValue = pabak(pairs);
  const ba = blandAltman(pairs);

  if (!kappa.reason && ac1.value !== null && kappa.value !== null && Math.abs(kappa.value - ac1.value) > 0.4) {
    refusalReasons.push('κ and AC1 disagree by more than 0.4 — the prevalence paradox. Both are printed; neither is "the" agreement.');
  }
  if (n && n < 15) {
    refusalReasons.push(`Limits of agreement are indicative only: ${n} items is not an agreement study sized for 95% limits.`);
  }
  if (exactN === n && n >= itemFloor) {
    refusalReasons.push('Perfect agreement is not correctness: two people can agree precisely on the wrong bar. Read this as "the same word", not "the right word".');
  }
  if (kappa.reason) refusalReasons.push(kappa.reason);

  const perDimension = CONCORDANCE_DIMENSIONS.map((dimension) => {
    const item = items.find((i) => i.key === dimension.key) || null;
    const leader = Number.isInteger(item?.leader) ? item.leader : null;
    const member = Number.isInteger(item?.member) ? item.member : null;
    const answered = leader !== null && member !== null;
    const diff = answered ? leader - member : null;
    return {
      key: dimension.key,
      label: dimension.label,
      short: dimension.short,
      question: dimension.question,
      anchors: dimension.anchors,
      leader,
      member,
      answered,
      diff,
      absDiff: diff === null ? null : Math.abs(diff),
      diverged: diff !== null && Math.abs(diff) >= 2,
      direction: diff === null || diff === 0 ? 'aligned' : diff > 0 ? 'leader-higher' : 'member-higher',
      reading: diff === null || diff === 0 ? '' : diff > 0 ? dimension.biasHigh : dimension.biasLow,
    };
  });

  const divergedDimensions = perDimension.filter((d) => d.diverged);
  const refused = n < itemFloor || kappa.value === null;
  const kappaPct = pctOf(kappa.value);
  const clearsFloor = kappaPct === null ? null : kappaPct >= conventions.agreementFloorPct;

  return {
    n,
    itemFloor,
    exactN,
    exactPct: n ? pctOf(exactN / n) : null,
    within1Pct: n ? pctOf(within1N / n) : null,
    kappaW: round2(kappa.value),
    kappaPct: refused && n < itemFloor ? null : kappaPct,
    kappaRefusal: kappa.reason,
    band: refused && n < itemFloor ? 'refused' : bandFor(kappa.value),
    ac1: round2(ac1.value),
    ac1Pct: n < itemFloor ? null : pctOf(ac1.value),
    pabak: round2(pabakValue),
    pabakPct: n < itemFloor ? null : pctOf(pabakValue),
    bias: round2(ba.bias),
    biasDirection: ba.bias === null ? 'unknown' : Math.abs(ba.bias) < 0.25 ? 'level' : ba.bias > 0 ? 'leader-higher' : 'member-higher',
    biasSpread: round2(ba.sd),
    loaLower: round2(ba.lo),
    loaUpper: round2(ba.hi),
    meanAbsDiff: n ? round2(pairs.reduce((a, p) => a + Math.abs(p.leader - p.member), 0) / n) : null,
    perDimension,
    divergedDimensions,
    refused,
    refusalReasons,
    clearsFloor,
    floorPct: conventions.agreementFloorPct,
    answeredItemCount: n,
  };
}

/** A breach is either a below-floor κ or any dimension two whole steps apart. */
export function breaches(round, stats, conventions) {
  if (round?.status !== 'closed' || !stats || stats.refused) return false;
  if (stats.kappaPct !== null && stats.kappaPct < conventions.agreementFloorPct) return true;
  return stats.divergedDimensions.length > 0;
}

/* --------------------------------------------------------- 2. the ledger */

export function roundsOf(state) {
  return Array.isArray(state?.expectationRounds) ? state.expectationRounds : [];
}

function ownerNodeId(chain, round) {
  const leaderId = String(round?.leaderId || '');
  return chain.nodes.has(leaderId) ? leaderId : LEADER_ID;
}

function pairHistory(state, leaderId, memberId) {
  return roundsOf(state)
    .filter((r) => r.leaderId === leaderId && r.memberId === memberId)
    .sort((a, b) => String(b.openedOn || '').localeCompare(String(a.openedOn || '')));
}

/** Closed rounds a re-contracting decision was ever opened from (via typed links). */
function recontractEdges(state) {
  const links = Array.isArray(state?.links) ? state.links : [];
  return links.filter((l) => l && l.relation === 're-contracts' && l.sourceType === 'concordance');
}

function nameOf(state, id) {
  const person = (state.people || []).find((p) => p && p.id === id);
  return person ? person.name : '';
}

/* ------------------------------------------------------- 3. the roll-up */

function aggregateNodes(chain, ownRounds, { conventions, scopeIds = null }) {
  const nodes = [];
  for (const node of chain.nodes.values()) {
    // A declared seat's roll-up is rooted at its own span: the enterprise node
    // is not part of its picture, so a scoped read cannot print a workspace cell.
    if (scopeIds && !scopeIds.has(node.id)) continue;
    nodes.push(node);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cells = new Map();
  const ensure = (id) => {
    if (!cells.has(id)) {
      const node = byId.get(id);
      cells.set(id, {
        nodeId: id,
        label: node ? node.name : 'Workspace leader',
        altitudeKey: node?.altitude || null,
        own: [],
        all: [],
        children: [],
      });
    }
    return cells.get(id);
  };

  for (const round of ownRounds) {
    const nodeId = ownerNodeId(chain, round);
    if (!byId.has(nodeId)) continue;
    const cell = ensure(nodeId);
    cell.own.push(round);
    // Exact partition: a pair is counted at its leader's span and nowhere else,
    // then inherited by every ancestor by addition.
    let cursor = nodeId;
    const guard = new Set();
    while (cursor && byId.has(cursor) && !guard.has(cursor)) {
      guard.add(cursor);
      ensure(cursor).all.push(round);
      cursor = byId.get(cursor).parentId;
    }
  }
  for (const cell of cells.values()) {
    const node = byId.get(cell.nodeId);
    cell.children = (node?.childIds || []).filter((id) => cells.has(id)).map((id) => cells.get(id).nodeId);
  }

  const rows = [];
  for (const cell of cells.values()) {
    const assessed = cell.all
      .map((round) => ({ round, stats: concordanceStats(round, conventions) }))
      .filter((entry) => !entry.stats.refused);
    const kappas = assessed.map((entry) => entry.stats.kappaW).filter((v) => Number.isFinite(v));
    const clearN = assessed.filter((entry) => entry.stats.clearsFloor).length;
    const refusedN = cell.all.length - assessed.length;
    const suppressed = assessed.length < conventions.cellFloor;
    const interval = wilsonInterval(clearN, assessed.length);
    const alt = altitudeByKey(cell.altitudeKey);
    rows.push({
      nodeId: cell.nodeId,
      label: cell.label,
      altitudeKey: cell.altitudeKey,
      altitudeLabel: alt?.label || '—',
      rank: alt?.rank || null,
      closedN: cell.all.length,
      ownClosedN: cell.own.length,
      assessedN: assessed.length,
      refusedN,
      clearN,
      ratePct: suppressed || !assessed.length ? null : Math.round((clearN / assessed.length) * 1000) / 10,
      wilsonLo: suppressed ? null : interval.lo,
      wilsonHi: suppressed ? null : interval.hi,
      meanKappaPct: suppressed || !kappas.length ? null : pctOf(kappas.reduce((a, b) => a + b, 0) / kappas.length),
      minKappaPct: suppressed || !kappas.length ? null : pctOf(Math.min(...kappas)),
      suppressed,
      suppressedReason: suppressed
        ? `${assessed.length} assessed pair(s) is below the ${conventions.cellFloor}-pair cell floor — the rate is withheld, the count is not.`
        : null,
      childCount: cell.children.length,
    });
  }
  rows.sort((a, b) => (b.assessedN - a.assessedN) || String(a.label).localeCompare(String(b.label)));
  return rows;
}

/** The org-wide dimension profile: which words we use differently, and in which direction. */
export function dimensionProfile(rounds, conventions) {
  const profile = CONCORDANCE_DIMENSIONS.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    short: dimension.short,
    answeredN: 0,
    divergedN: 0,
    leaderHigherN: 0,
    memberHigherN: 0,
    meanAbsDiff: null,
    divergedPct: null,
    direction: 'level',
    reading: '',
  }));
  const byKey = new Map(profile.map((p) => [p.key, p]));
  const diffs = new Map(profile.map((p) => [p.key, []]));
  for (const round of rounds) {
    if (round.status !== 'closed') continue;
    const stats = concordanceStats(round, conventions);
    for (const dimension of stats.perDimension) {
      if (!dimension.answered) continue;
      const row = byKey.get(dimension.key);
      row.answeredN += 1;
      diffs.get(dimension.key).push(dimension.diff);
      if (dimension.diverged) row.divergedN += 1;
      if (dimension.diff > 0) row.leaderHigherN += 1;
      if (dimension.diff < 0) row.memberHigherN += 1;
    }
  }
  for (const row of profile) {
    const values = diffs.get(row.key);
    if (!values.length) continue;
    row.meanAbsDiff = round2(values.reduce((a, b) => a + Math.abs(b), 0) / values.length);
    row.divergedPct = Math.round((row.divergedN / values.length) * 1000) / 10;
    row.direction = row.leaderHigherN === row.memberHigherN
      ? (row.leaderHigherN === 0 ? 'level' : 'both-ways')
      : row.leaderHigherN > row.memberHigherN ? 'leader-higher' : 'member-higher';
    const source = CONCORDANCE_DIMENSIONS.find((d) => d.key === row.key);
    if (row.divergedN) {
      row.reading = row.direction === 'leader-higher'
        ? source.biasHigh
        : row.direction === 'member-higher'
          ? source.biasLow
          : 'Both directions appear in this workspace — the word is unstable in both directions, which usually means nobody wrote the standard down.';
    }
  }
  profile.sort((a, b) => (b.divergedN - a.divergedN) || a.label.localeCompare(b.label));
  return profile;
}

/**
 * The closed loop: did pairs that re-contracted a divergent expectation converge
 * more than similar pairs that did not? Pairs are their own control — the
 * comparison is before/after inside each pair, and then re-contracted vs not.
 * Below the floor it is refused; above it, it is an ASSOCIATION, printed as one.
 */
export function retestLift(state, { conventions, scopedRounds = null } = {}) {
  const rounds = (scopedRounds || roundsOf(state)).filter((r) => r.status === 'closed');
  const edges = recontractEdges(state);
  const recontractedPairs = new Set();
  for (const edge of edges) {
    const round = roundsOf(state).find((r) => r.id === edge.sourceId);
    if (round) recontractedPairs.add(concordancePairKey(round.leaderId, round.memberId));
  }
  const byPair = new Map();
  for (const round of rounds) {
    const key = concordancePairKey(round.leaderId, round.memberId);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(round);
  }
  const deltas = { recontracted: [], compared: [] };
  for (const [key, list] of byPair) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => String(a.closedOn || a.openedOn || '').localeCompare(String(b.closedOn || b.openedOn || '')));
    const first = concordanceStats(sorted[0], conventions);
    const last = concordanceStats(sorted[sorted.length - 1], conventions);
    if (first.refused || last.refused || first.kappaPct === null || last.kappaPct === null) continue;
    const delta = last.kappaPct - first.kappaPct;
    if (recontractedPairs.has(key)) deltas.recontracted.push(delta);
    else deltas.compared.push(delta);
  }
  const summarise = (values) => (values.length < conventions.cellFloor
    ? { n: values.length, refused: true, meanDeltaPct: null, reason: `Only ${values.length} pair(s) have a second round; the ${conventions.cellFloor}-pair floor is not met, so no delta is printed.` }
    : { n: values.length, refused: false, meanDeltaPct: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, reason: null });
  return {
    recontracted: summarise(deltas.recontracted),
    compared: summarise(deltas.compared),
    limitation: 'Association, not effect. Pairs were not randomly assigned to re-contracting, and the pairs that did it may differ in ways this workspace does not record.',
  };
}

/* -------------------------------------------------------- 4. the face */

function pathFingerprint(chain, leaderId) {
  const parts = [];
  let cursor = leaderId;
  const guard = new Set();
  while (cursor && chain.nodes.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor);
    parts.push(`${cursor}:${chain.nodes.get(cursor).parentId || ''}`);
    cursor = chain.nodes.get(cursor).parentId;
  }
  return parts.join('>');
}

export function roundPathKey(state, leaderId, { settings = null, now = new Date() } = {}) {
  const chain = buildChain(state, { now, settings: settings || state?.settings });
  const raw = pathFingerprint(chain, leaderId);
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The single read model behind all five panels. A declared seat scopes the
 * ledger to its subtree; above director rank the pair identity and the two
 * gauges are withheld and only the span rate survives.
 */
export function concordanceRead(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const conventions = concordanceConventions(settings || state.settings || {});
  const delegate = buildChain(state, { now, settings: settings || state.settings });
  const chain = delegate;
  const built = buildSeats(state, { now, settings: settings || state.settings });
  let seat = null;
  try {
    seat = seatId ? (built.byId.get(seatId) || null) : activeSeat(built);
  } catch {
    seat = null;
  }
  const scoped = Boolean(seat && !seat.fullAccess);
  const detailWithheld = scoped && seat.rank >= 3;
  const scopeIds = scoped && seat.scope ? new Set(seat.scope) : null;

  const all = roundsOf(state);
  const visible = scoped ? all.filter((r) => (scopeIds.has(r.leaderId) || r.leaderId === seat.id) && (scopeIds.has(r.memberId) || r.memberId === seat.id)) : all;
  const closed = visible.filter((r) => r.status === 'closed');
  const open = visible.filter((r) => r.status === 'open');

  const edges = recontractEdges(state);
  const decisionByPair = new Map();
  for (const edge of edges) {
    const round = all.find((r) => r.id === edge.sourceId);
    if (!round) continue;
    const key = concordancePairKey(round.leaderId, round.memberId);
    const on = String(edge.createdOn || '');
    if (!decisionByPair.has(key) || on > String(decisionByPair.get(key).on || '')) {
      decisionByPair.set(key, { decisionId: edge.targetId, on });
    }
  }
  const decidedPairs = new Set(decisionByPair.keys());

  const pairKeys = new Map();
  for (const round of visible) {
    const key = concordancePairKey(round.leaderId, round.memberId);
    if (!pairKeys.has(key)) pairKeys.set(key, { leaderId: round.leaderId, memberId: round.memberId, rounds: [] });
    pairKeys.get(key).rounds.push(round);
  }

  const pairs = [...pairKeys.entries()].map(([key, group], index) => {
    const sorted = [...group.rounds].sort((a, b) => String(b.openedOn || '').localeCompare(String(a.openedOn || '')));
    const latest = sorted[0] || null;
    const latestStats = latest ? concordanceStats(latest, conventions) : null;
    const nodeId = ownerNodeId(chain, latest || { leaderId: group.leaderId });
    const node = chain.nodes.get(nodeId);
    const alt = altitudeByKey(node?.altitude);
    const history = sorted.slice(0, CONCORDANCE_LIMITS.history).map((round) => ({
      id: round.id,
      cycle: round.cycle,
      status: round.status,
      openedOn: round.openedOn,
      closedOn: round.closedOn,
      stats: concordanceStats(round, conventions),
    }));
    // A leader always reads their own pairs; above director rank every other
    // pair is a span aggregate. That is the ladder, not a permission bug.
    const visible = !detailWithheld || (seat && group.leaderId === seat.id);
    return {
      ref: `pair-${index + 1}`,
      key,
      leaderId: group.leaderId,
      memberId: group.memberId,
      detailVisible: Boolean(visible),
      leaderName: visible ? (nameOf(state, group.leaderId) || 'Leader') : 'Span leader',
      memberName: visible ? (nameOf(state, group.memberId) || 'Team member') : 'Team member',
      nodeId,
      nodeLabel: node?.name || 'Workspace leader',
      altitudeKey: node?.altitude || null,
      altitudeLabel: alt?.label || '—',
      latest,
      latestStats,
      history,
      belowFloor: latestStats && !latestStats.refused && latestStats.clearsFloor === false,
      breached: Boolean(latest && breaches(latest, latestStats, conventions)),
      decided: decidedPairs.has(key),
      decisionOn: decisionByPair.get(key)?.on || null,
      // The closed loop: a decision was opened, and no later round has re-tested
      // the standard it set. Past the window it is overdue, and it says so.
      retestDue: (() => {
        const decision = decisionByPair.get(key);
        if (!decision) return false;
        const closedAfter = group.rounds.some((r) => r.status === 'closed' && String(r.closedOn || '') > String(decision.on || ''));
        if (closedAfter) return false;
        return true;
      })(),
      retestOverdue: (() => {
        const decision = decisionByPair.get(key);
        if (!decision || !decision.on) return false;
        const closedAfter = group.rounds.some((r) => r.status === 'closed' && String(r.closedOn || '') > String(decision.on || ''));
        if (closedAfter) return false;
        return daysSince(decision.on, now) > conventions.retestDays;
      })(),
    };
  }).sort((a, b) => (Number(b.retestDue) - Number(a.retestDue)) || String(a.leaderName).localeCompare(String(b.leaderName)));

  const rounds = visible.map((round) => {
    const stats = concordanceStats(round, conventions);
    const stale = round.pathKey && round.pathKey !== roundPathKey(state, round.leaderId, { settings, now });
    return {
      ...round,
      stats,
      stale,
      detailVisible: !detailWithheld || Boolean(seat && round.leaderId === seat.id),
      revealable: round.status === 'closed',
      sealed: round.status === 'open',
    };
  });

  const rollup = aggregateNodes(chain, closed, { conventions, scopeIds: scoped ? new Set([...scopeIds, seat.id]) : null });
  const rootId = scoped ? seat.id : LEADER_ID;
  const root = rollup.find((row) => row.nodeId === rootId) || null;
  const profile = dimensionProfile(closed, conventions);
  const lift = retestLift(state, { conventions, scopedRounds: closed });

  const assessed = closed.map((round) => ({ round, stats: concordanceStats(round, conventions) })).filter((e) => !e.stats.refused);
  const kappas = assessed.map((e) => e.stats.kappaW).filter(Number.isFinite);
  const clearN = assessed.filter((e) => e.stats.clearsFloor).length;
  const interval = wilsonInterval(clearN, assessed.length);
  const enterpriseSuppressed = assessed.length < conventions.cellFloor;
  const sortedK = [...kappas].sort((a, b) => a - b);
  const quartile = (q) => (sortedK.length ? pctOf(sortedK[Math.min(sortedK.length - 1, Math.floor(q * (sortedK.length - 1)))]) : null);

  const enterprise = {
    closedN: closed.length,
    assessedN: assessed.length,
    refusedN: closed.length - assessed.length,
    clearN,
    ratePct: enterpriseSuppressed || !assessed.length ? null : Math.round((clearN / assessed.length) * 1000) / 10,
    wilsonLo: enterpriseSuppressed ? null : interval.lo,
    wilsonHi: enterpriseSuppressed ? null : interval.hi,
    suppressed: enterpriseSuppressed,
    suppressedReason: enterpriseSuppressed
      ? `${assessed.length} assessed pair(s) is below the ${conventions.cellFloor}-pair cell floor. The counts are printed; the rate is not.`
      : null,
    meanKappaPct: enterpriseSuppressed || !kappas.length ? null : pctOf(kappas.reduce((a, b) => a + b, 0) / kappas.length),
    medianKappaPct: enterpriseSuppressed ? null : quartile(0.5),
    p10KappaPct: enterpriseSuppressed ? null : quartile(0.1),
    p90KappaPct: enterpriseSuppressed ? null : quartile(0.9),
    pairN: pairs.length,
    openN: open.length,
    awaitingN: open.filter((r) => Boolean(r.leaderSubmittedAt) !== Boolean(r.memberSubmittedAt)).length,
    divergenceN: assessed.filter((e) => e.stats.divergedDimensions.length > 0).length,
  };

  const awaiting = open.filter((r) => Boolean(r.leaderSubmittedAt) !== Boolean(r.memberSubmittedAt));
  const signals = [];
  for (const pair of pairs) {
    if (pair.breached && !pair.decided) {
      signals.push({
        id: `ECN-01:${pair.key}`,
        tone: 'bad',
        title: `${pair.leaderName} and ${pair.memberName} are using different gauges`,
        body: pair.latestStats
          ? `${pair.latestStats.divergedDimensions.length} dimension(s) two or more steps apart${pair.latestStats.kappaPct === null ? '; κ is refused, so the dimension gap is the evidence' : `; weighted κ ${pair.latestStats.kappaPct}% against a ${conventions.agreementFloorPct}% floor`}. RULE-ECN-02 opens one governed re-contracting decision per pair per ISO week.`
          : '',
        pairRef: pair.ref,
      });
    }
  }
  for (const pair of pairs) {
    if (!pair.retestOverdue) continue;
    signals.push({
      id: `ECN-05:${pair.key}`,
      tone: 'warn',
      title: `A re-contracted standard was never re-tested with ${pair.memberName}`,
      body: `The re-contracting decision is dated ${pair.decisionOn || 'earlier'} and no later round has closed, which is past the ${conventions.retestDays}-day window. An expectation nobody re-measured is a document, not a standard.`,
      pairRef: pair.ref,
    });
  }
  for (const round of awaiting) {
    const waitingOn = round.leaderSubmittedAt ? 'the report' : 'the leader';
    const days = round.openedOn ? daysSince(round.openedOn, now) : null;
    signals.push({
      id: `ECN-02:${round.id}`,
      tone: days !== null && days > conventions.retestDays ? 'warn' : 'info',
      title: `A sealed round is waiting on ${waitingOn}`,
      body: `Opened ${round.openedOn || 'recently'}${days === null ? '' : ` (${days} day(s))`}. One side is in and sealed — nothing is revealed until both are.`,
      roundId: round.id,
    });
  }
  const drift = profile.find((row) => row.divergedPct !== null && row.divergedPct >= 30);
  if (drift) {
    signals.push({
      id: `ECN-03:${drift.key}`,
      tone: 'warn',
      title: `“${drift.label}” means different things in ${drift.divergedN} of ${drift.answeredN} pairs`,
      body: drift.reading,
      dimensionKey: drift.key,
    });
  }
  const staleRounds = rounds.filter((r) => r.stale && r.status === 'open');
  if (staleRounds.length) {
    signals.push({
      id: 'ECN-04:stale',
      tone: 'warn',
      title: 'A reporting line moved under an open round',
      body: `${staleRounds.length} open round(s) were opened against a reporting path that has since changed. Re-open rather than re-home: the pair may no longer be a pair.`,
    });
  }

  return {
    conventions,
    dimensions: CONCORDANCE_DIMENSIONS,
    disclosure: CONCORDANCE_DISCLOSURE,
    seat: seat ? { id: seat.id, label: seat.label, rank: seat.rank, fullAccess: seat.fullAccess, altitudeKey: seat.altitudeKey || null } : null,
    scoped,
    detailWithheld,
    pairs,
    rounds,
    open,
    awaiting,
    rollup,
    root,
    profile,
    lift,
    enterprise,
    signals,
    historyCap: CONCORDANCE_LIMITS.history,
    updatedOn: dayKey(now),
    week: weekKey(now),
  };
}

/* ------------------------------------------------------- 5. the outputs */

/** Deterministic conversation script. No model, no inference, no flattery. */
export function conversationScript(round, stats) {
  const diverged = (stats?.perDimension || []).filter((d) => d.diverged).slice(0, 3);
  const name = (id) => id;
  const lines = [
    `Open: “I want to check the standard, not your work. I am going to read you where I think the bar is; tell me where you think it is. Neither of us is wrong yet.”`,
    diverged.length
      ? `Share the gauges: ${diverged.map((d) => `on “${d.label}” I said ${d.leader} and you said ${d.member} (${d.absDiff} step${d.absDiff === 1 ? '' : 's'} apart)`).join('; ')}.`
      : 'Share the gauges: read both columns out loud, including the ones that matched. The matched ones are the contract you already have.',
    diverged.length
      ? `Ask, do not tell: “What would have to be true for ${diverged[0].leader} to be the right answer?” Then answer the same question yourself for ${diverged[0].member}.`
      : 'Ask, do not tell: “Which of these six would you have guessed differently, if I had not said anything?”',
    'Write one sentence per diverged dimension — the bar, the example that settles it, and the date it takes effect. One sentence, not a document.',
    diverged.length
      ? `Agree the test: pick a real piece of work in the next two weeks and both of you score it against the sentence BEFORE you look at each other's answer.`
      : 'Agree the test: re-run this instrument next cycle. Two rounds measure drift; one measures a mood.',
    `Close: “If we are still ${diverged.length ? 'apart on this' : 'agreeing'} in a month, that is information about the sentence, not about you.”`,
  ];
  return {
    lines,
    diverged: diverged.map((d) => ({ key: d.key, label: d.label, leader: d.leader, member: d.member, absDiff: d.absDiff })),
    text: lines.join('\n\n'),
    nameHint: name(round?.memberId || ''),
  };
}

/** Identity-free brief: counts, rates, the dimension profile, the limitations. */
export function concordanceBriefText(state = {}, { now = new Date(), settings = null } = {}) {
  const report = concordanceRead(state, { now, settings });
  const e = report.enterprise;
  const conv = report.conventions;
  const lines = [
    '# Expectation concordance — identity-free brief',
    '',
    `Produced ${report.updatedOn} · instrument ${CONCORDANCE_DIMENSIONS.length} dimensions on a ${CONCORDANCE_SCALE}-point bar · aggregate only`,
    '',
    '## What this measures',
    '',
    'Whether two people in a working pair mean the same thing by an expectation. It is a measurement-system reading (MSA / gauge agreement), not a performance rating. No person, pair, team or span is named in this brief.',
    '',
    '## Headline',
    '',
    `- Closed rounds: **${e.closedN}** across **${e.pairN}** pair(s); **${e.assessedN}** met the ${conv.itemFloor}-item instrument floor, **${e.refusedN}** refused.`,
    e.ratePct === null
      ? `- Share of pairs at or above the ${conv.agreementFloorPct}% agreement floor: **refused** — ${e.suppressedReason}`
      : `- Share of pairs at or above the ${conv.agreementFloorPct}% agreement floor: **${e.ratePct}%** (Wilson 95% ${e.wilsonLo}–${e.wilsonHi}%, n=${e.assessedN}).`,
    e.meanKappaPct === null
      ? '- Mean weighted κ: refused.'
      : `- Mean weighted κ: **${e.meanKappaPct}%**; median ${e.medianKappaPct}%; 10th–90th percentile ${e.p10KappaPct}–${e.p90KappaPct}%.`,
    `- Pairs with at least one dimension two or more steps apart: **${e.divergenceN}**.`,
    `- Open rounds: **${e.openN}**; sealed waiting on one side: **${e.awaitingN}**.`,
    '',
    '## Which words we use differently',
    '',
    '| Dimension | Answered | Diverged | Diverged % | Mean gap | Direction |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.profile.map((row) => `| ${row.label} | ${row.answeredN} | ${row.divergedN} | ${row.divergedPct === null ? 'refused' : `${row.divergedPct}%`} | ${row.meanAbsDiff === null ? '—' : row.meanAbsDiff} | ${row.direction} |`),
    '',
    '## By span altitude',
    '',
    '| Altitude | Closed | Assessed | Clear | Rate | Wilson 95% |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.rollup.filter((row) => row.altitudeKey).map((row) => `| ${row.altitudeLabel} | ${row.closedN} | ${row.assessedN} | ${row.clearN} | ${row.ratePct === null ? 'withheld' : `${row.ratePct}%`} | ${row.wilsonLo === null ? '—' : `${row.wilsonLo}–${row.wilsonHi}%`} |`),
    '',
    '## Closed loop',
    '',
    `- Re-contracted pairs with a second round: **${report.lift.recontracted.n}** — ${report.lift.recontracted.refused ? 'delta refused below the cell floor' : `mean κ change ${report.lift.recontracted.meanDeltaPct} points`}.`,
    `- Breached pairs with a second round and no re-contracting decision: **${report.lift.compared.n}** — ${report.lift.compared.refused ? 'delta refused below the cell floor' : `mean κ change ${report.lift.compared.meanDeltaPct} points`}.`,
    `- ${report.lift.limitation}`,
    '',
    '## Refusals and limits',
    '',
    `- The instrument is ${conv.itemFloor} items. A round with fewer is refused entirely; six items is the ruler, not a sample.`,
    `- Span rates are withheld below ${conv.cellFloor} assessed pairs. A proportion of one is a person, not a rate.`,
    `- ${report.disclosure.local}`,
    `- ${report.disclosure.sealed}`,
    `- ${report.disclosure.truth}`,
    `- ${report.disclosure.instrument}`,
    '',
    'Nothing in this brief rates, ranks or profiles a person. The subject of every figure is a pair and a dimension.',
    '',
  ];
  return lines.join('\n');
}

/** Aggregate-only CSV rows. A refused figure is blank, never zero. */
export function concordanceCsvRows(state = {}, { now = new Date(), settings = null } = {}) {
  const report = concordanceRead(state, { now, settings });
  const conv = report.conventions;
  const rows = [{
    scope: 'enterprise',
    altitude: 'all',
    dimension: 'all',
    closed_n: report.enterprise.closedN,
    assessed_n: report.enterprise.assessedN,
    refused_n: report.enterprise.refusedN,
    clear_n: report.enterprise.clearN,
    rate_pct: report.enterprise.ratePct === null ? '' : report.enterprise.ratePct,
    wilson_lo_pct: report.enterprise.wilsonLo === null ? '' : report.enterprise.wilsonLo,
    wilson_hi_pct: report.enterprise.wilsonHi === null ? '' : report.enterprise.wilsonHi,
    mean_kappa_pct: report.enterprise.meanKappaPct === null ? '' : report.enterprise.meanKappaPct,
    diverged_n: report.enterprise.divergenceN,
    floor_pct: conv.agreementFloorPct,
    cell_floor: conv.cellFloor,
    verdict: report.enterprise.suppressed ? 'rate withheld below cell floor' : report.enterprise.ratePct >= conv.agreementFloorPct ? 'workspace above agreement floor' : 'workspace below agreement floor',
  }];
  for (const row of report.rollup.filter((r) => r.altitudeKey)) {
    rows.push({
      scope: 'altitude',
      altitude: row.altitudeKey,
      dimension: 'all',
      closed_n: row.closedN,
      assessed_n: row.assessedN,
      refused_n: row.refusedN,
      clear_n: row.clearN,
      rate_pct: row.ratePct === null ? '' : row.ratePct,
      wilson_lo_pct: row.wilsonLo === null ? '' : row.wilsonLo,
      wilson_hi_pct: row.wilsonHi === null ? '' : row.wilsonHi,
      mean_kappa_pct: row.meanKappaPct === null ? '' : row.meanKappaPct,
      diverged_n: '',
      floor_pct: conv.agreementFloorPct,
      cell_floor: conv.cellFloor,
      verdict: row.suppressed ? 'withheld below cell floor' : row.ratePct >= conv.agreementFloorPct ? 'holding' : 'below agreement floor',
    });
  }
  for (const row of report.profile) {
    rows.push({
      scope: 'dimension',
      altitude: 'all',
      dimension: row.key,
      closed_n: row.answeredN,
      assessed_n: row.answeredN,
      refused_n: '',
      clear_n: '',
      rate_pct: '',
      wilson_lo_pct: '',
      wilson_hi_pct: '',
      mean_kappa_pct: '',
      diverged_n: row.divergedN,
      floor_pct: conv.agreementFloorPct,
      cell_floor: conv.cellFloor,
      verdict: row.divergedPct === null ? 'no answered items' : `${row.direction} · ${row.divergedPct}% diverged`,
    });
  }
  return rows;
}

/** The nav badge: work that is actually waiting on a human. */
export function concordanceAttentionCount(state, now = new Date(), settings = null) {
  const report = concordanceRead(state, { now, settings });
  return report.awaiting.length
    + report.pairs.filter((p) => p.breached && !p.decided).length
    + report.pairs.filter((p) => p.retestOverdue).length;
}

/** Calendar days since a closed round's decision, used by the re-test signal. */
export function daysUntilRetest(pair, conventions, now = new Date()) {
  const closedOn = pair?.latest?.closedOn || pair?.latest?.openedOn;
  if (!closedOn) return null;
  const due = addDays(new Date(`${closedOn}T00:00:00.000Z`), conventions.retestDays);
  return -daysSince(due, now);
}
