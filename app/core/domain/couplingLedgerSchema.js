/**
 * app/core/domain/couplingLedgerSchema.js — Schema v78 fail-closed normalizers
 * for the Coupling Ledger.
 *
 * A frozen coupling review is a QUOTED ARTEFACT: the leader was shown a band
 * table, a lift, two p-values and one prospective number, and the page says so
 * afterwards. If any part of it cannot be read exactly as it was written, the
 * honest response is to drop the whole review with a warning — not to repair the
 * parts that parse and print a table that no longer matches what was quoted.
 */

export const COUPLING_LIMITS = Object.freeze({
  maxReviews: 20,
  maxMarkers: 400,
  maxBandRows: 10,
  maxMemberIds: 400,
  reviewCap: [5, 20],
  reviewCapDefault: 20,
  blockDays: [7, 90],
  blockDaysDefault: 30,
  minPairs: [2, 20],
  minPairsDefault: 4,
  minExpectedCollisions: [0.5, 10],
  minExpectedCollisionsDefault: 1,
  alphaPct: [1, 20],
  alphaPctDefault: 5,
  liftTolerancePct: [10, 80],
  liftTolerancePctDefault: 25,
  rotations: [100, 4000],
  rotationsDefault: 1000,
  reviewHorizonDays: [7, 365],
  reviewHorizonDaysDefault: 90,
});

const VERDICTS = new Set([
  'insufficient', 'unidentifiable', 'inconclusive', 'independent', 'coupled', 'hedged',
]);
const ASSESSMENTS = new Set([
  'confirmed', 'over-declared', 'under-declared', 'overstated', 'understated', 'unresolved',
]);

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toNum(value) {
  // `Number(null)` is 0, which would turn a missing probability into a certain
  // "0%" forecast. A missing value must stay missing.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp01(value) {
  const n = toNum(value);
  return n === null ? null : Math.min(1, Math.max(0, n));
}

/**
 * Read the leader's coupling conventions. Every floor is clamped into a printed
 * range so a corrupt or hostile setting cannot switch a measurement off — that
 * failure mode is not hypothetical here: the first build of `verdictFor` read
 * its floors off the band descriptor where they are `undefined`, and every floor
 * silently disappeared while a two-pair band printed `coupled`.
 */
export function normalizeCouplingSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const L = COUPLING_LIMITS;
  return {
    couplingBlockDays: toInt(source.couplingBlockDays, L.blockDaysDefault, ...L.blockDays),
    couplingMinPairs: toInt(source.couplingMinPairs, L.minPairsDefault, ...L.minPairs),
    couplingMinExpectedCollisions: toNum(source.couplingMinExpectedCollisions) === null
      ? L.minExpectedCollisionsDefault
      : Math.min(L.minExpectedCollisions[1], Math.max(L.minExpectedCollisions[0], Number(source.couplingMinExpectedCollisions))),
    couplingAlphaPct: toInt(source.couplingAlphaPct, L.alphaPctDefault, ...L.alphaPct),
    couplingLiftTolerancePct: toInt(source.couplingLiftTolerancePct, L.liftTolerancePctDefault, ...L.liftTolerancePct),
    couplingRotations: toInt(source.couplingRotations, L.rotationsDefault, ...L.rotations),
    couplingReviewHorizonDays: toInt(source.couplingReviewHorizonDays, L.reviewHorizonDaysDefault, ...L.reviewHorizonDays),
    couplingReviewCap: toInt(source.couplingReviewCap, L.reviewCapDefault, ...L.reviewCap),
    couplingLedgerAutoPropagate: source.couplingLedgerAutoPropagate !== false,
  };
}

function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeBandRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' && raw.key ? raw.key : '';
  const verdict = VERDICTS.has(raw.verdict) ? raw.verdict : null;
  const assessment = ASSESSMENTS.has(raw.assessment) ? raw.assessment : null;
  // A band without a readable key, verdict AND assessment is not repairable:
  // the pair is what the leader was shown, and guessing either would invent a
  // reading.
  if (!key || !verdict || !assessment) return null;
  return {
    key,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 120) : '',
    declaredMidRho: toNum(raw.declaredMidRho),
    declaredMinRho: toNum(raw.declaredMinRho),
    declaredMaxRho: toNum(raw.declaredMaxRho),
    pairs: toInt(raw.pairs, 0, 0, 10_000),
    testablePairs: toInt(raw.testablePairs, 0, 0, 10_000),
    collisions: toInt(raw.collisions, 0, 0, 10_000),
    expectedCollisions: toNum(raw.expectedCollisions),
    lift: toNum(raw.lift),
    pValue: clamp01(raw.pValue),
    pValueLow: clamp01(raw.pValueLow),
    rotations: toInt(raw.rotations, COUPLING_LIMITS.rotationsDefault, ...COUPLING_LIMITS.rotations),
    verdict,
    assessment,
    contradiction: raw.contradiction === true,
    mappingDisagreement: raw.mappingDisagreement === true,
    observedCollisionPct: toNum(raw.observedCollisionPct),
    modelCollisionPct: toNum(raw.modelCollisionPct),
    modelSpearmanPct: toNum(raw.modelSpearmanPct),
    modelIndependentPct: toNum(raw.modelIndependentPct),
    impliedRho: toNum(raw.impliedRho),
    impliedIdentified: raw.impliedIdentified === true,
    materiality: toNum(raw.materiality),
    blockDays: toInt(raw.blockDays, COUPLING_LIMITS.blockDaysDefault, ...COUPLING_LIMITS.blockDays),
    minAttainableP: clamp01(raw.minAttainableP),
  };
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedAt = typeof raw.gradedAt === 'string' ? raw.gradedAt : '';
  if (!gradedAt) return null;
  return {
    gradedAt,
    anyCommitted: raw.anyCommitted === true,
    gradedMembers: toInt(raw.gradedMembers, 0, 0, 10_000),
    brier: toNum(raw.brier),
  };
}

function normalizeReview(raw, warnings) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const frozenAt = typeof raw.frozenAt === 'string' ? raw.frozenAt : '';
  const reviewOn = validDay(raw.reviewOn);
  if (!id || !frozenAt || !reviewOn) return null;
  const predicted = toNum(raw.predictedAnyCommitPct);
  // A frozen review with no probability is not a forecast. It is dropped rather
  // than back-filled from the band table, which would invent a claim.
  if (predicted === null) {
    warnings.push(`A frozen coupling review (${id}) is probability-free and was dropped rather than back-filled.`);
    return null;
  }
  const rawBands = Array.isArray(raw.bands) ? raw.bands : [];
  const bands = [];
  for (const row of rawBands.slice(0, COUPLING_LIMITS.maxBandRows)) {
    const band = normalizeBandRow(row);
    if (!band) {
      warnings.push(`A frozen coupling review (${id}) contains a band with no readable key, verdict or assessment; the whole review was dropped because it is one quoted artefact.`);
      return null;
    }
    bands.push(band);
  }
  return {
    id,
    frozenAt,
    reviewOn,
    windowDays: toInt(raw.windowDays, COUPLING_LIMITS.reviewHorizonDaysDefault, ...COUPLING_LIMITS.reviewHorizonDays),
    blockDays: toInt(raw.blockDays, COUPLING_LIMITS.blockDaysDefault, ...COUPLING_LIMITS.blockDays),
    rotations: toInt(raw.rotations, COUPLING_LIMITS.rotationsDefault, ...COUPLING_LIMITS.rotations),
    memberIds: Array.isArray(raw.memberIds)
      ? [...new Set(raw.memberIds.filter((x) => typeof x === 'string' && x))].slice(0, COUPLING_LIMITS.maxMemberIds)
      : [],
    premiseIds: Array.isArray(raw.premiseIds)
      ? [...new Set(raw.premiseIds.filter((x) => typeof x === 'string' && x))].slice(0, 120)
      : [],
    stressedPremiseIds: Array.isArray(raw.stressedPremiseIds)
      ? [...new Set(raw.stressedPremiseIds.filter((x) => typeof x === 'string' && x))].slice(0, 120)
      : [],
    pairCount: toInt(raw.pairCount, 0, 0, 10_000),
    testablePairs: toInt(raw.testablePairs, 0, 0, 10_000),
    openMembers: toInt(raw.openMembers, 0, 0, 10_000),
    bands,
    pairs: [],
    hazardPct: toNum(raw.hazardPct),
    hazardBasis: typeof raw.hazardBasis === 'string' ? raw.hazardBasis.slice(0, 400) : '',
    predictedAnyCommitPct: Math.min(100, Math.max(0, predicted)),
    graded: normalizeGrade(raw.graded),
    challengeNotes: Array.isArray(raw.challengeNotes)
      ? raw.challengeNotes
        .filter((note) => typeof note === 'string')
        .slice(-20)
        .map((note) => note.slice(0, 400))
      : [],
  };
}

export function normalizeCouplingReviews(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const review = normalizeReview(entry, warnings);
    if (!review || seen.has(review.id)) continue;
    seen.add(review.id);
    out.push(review);
  }
  out.sort((a, b) => (a.reviewOn < b.reviewOn ? -1 : a.reviewOn > b.reviewOn ? 1 : 0));
  const cap = COUPLING_LIMITS.reviewCapDefault;
  if (out.length > cap) {
    warnings.push(`${out.length - cap} older coupling review(s) were dropped beyond the ${cap}-review cap.`);
  }
  return out.slice(-cap);
}
