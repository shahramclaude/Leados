/**
 * app/core/domain/scepticSchema.js — Schema v81 fail-closed normalizers for the
 * Cross-Examination Terminal.
 *
 * Two ledgers are persisted and both are quotes:
 *
 *  - a **frozen round** is a *quoted audit*. The leader was shown which claims
 *    were examined, what probability this terminal attached to each of them being
 *    wrong, and when the record would have to answer for it. If any member cannot
 *    be read back exactly as written, the whole round is dropped with a warning
 *    rather than repaired into a claim nobody made.
 *  - a **disposition** is a human verdict on one claim. It is never rewritten,
 *    never inferred, and a disposition with no reason is not a verdict — it is a
 *    click, and the terminal will not count it.
 *
 * Nothing here invents history: an upgraded workspace opens with no round, no
 * disposition and no marker, and the terminal says exactly that. A workspace that
 * has never cross-examined a claim has a *known* amount of evidence — zero — and
 * the screen prints the sampling bound rather than a score of 100%.
 */

import {
  CLAIM_FAMILY_KEYS,
  SCEPTIC_DETECTOR_IDS,
  SCEPTIC_LIMITS,
} from './scepticRegistry.js';

const MAX_CLAIMS = SCEPTIC_LIMITS.maxClaims;
const MAX_DISPOSITIONS = 400;

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toNum(value) {
  // `Number(null)` is 0, which would turn a missing probability into a certain
  // forecast. A missing value must stay missing.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  const n = toNum(value);
  return n === null ? null : Math.min(max, Math.max(min, n));
}

function day(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function normalizeScepticSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const L = SCEPTIC_LIMITS;
  return {
    scepticWindowDays: toInt(source.scepticWindowDays, L.windowDaysDefault, ...L.windowDays),
    scepticTolerancePct: toInt(source.scepticTolerancePct, L.tolerancePctDefault, ...L.tolerancePct),
    scepticMinScored: toInt(source.scepticMinScored, L.minScoredDefault, ...L.minScored),
    scepticMaxTasks: toInt(source.scepticMaxTasks, L.maxTasksDefault, ...L.maxTasks),
    scepticDismissalCapPct: toInt(source.scepticDismissalCapPct, L.dismissalCapPctDefault, ...L.dismissalCapPct),
    scepticReviewHorizonDays: toInt(source.scepticReviewHorizonDays, L.reviewHorizonDaysDefault, ...L.reviewHorizonDays),
    scepticRoundCap: toInt(source.scepticRoundCap, L.roundCapDefault, ...L.roundCap),
    scepticAutoPropagate: source.scepticAutoPropagate !== false,
  };
}

function normalizeRoundClaim(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const detectorId = typeof raw.detectorId === 'string' && SCEPTIC_DETECTOR_IDS.includes(raw.detectorId)
    ? raw.detectorId
    : null;
  const family = typeof raw.family === 'string' && CLAIM_FAMILY_KEYS.includes(raw.family) ? raw.family : null;
  const claimKey = typeof raw.claimKey === 'string' && raw.claimKey ? raw.claimKey : null;
  const nodeId = typeof raw.nodeId === 'string' && raw.nodeId ? raw.nodeId : null;
  const probabilityPct = clamp(raw.probabilityPct, 0, 100);
  // The quadruple IS the quoted audit: which claim, of what kind, on which
  // record, at what probability. Guessing any part would invent a finding.
  if (!detectorId || !family || !claimKey || !nodeId || probabilityPct === null) return null;
  return {
    claimKey,
    detectorId,
    family,
    nodeType: typeof raw.nodeType === 'string' ? raw.nodeType.slice(0, 40) : '',
    nodeId,
    stake: clamp(raw.stake, 1, 5),
    probabilityPct: Math.round(probabilityPct * 100) / 100,
    evidenceNodeType: typeof raw.evidenceNodeType === 'string' ? raw.evidenceNodeType.slice(0, 40) : '',
    evidenceNodeId: typeof raw.evidenceNodeId === 'string' ? raw.evidenceNodeId.slice(0, 120) : '',
  };
}

function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gradedAt = typeof raw.gradedAt === 'string' ? raw.gradedAt : '';
  if (!gradedAt) return null;
  return {
    gradedAt,
    considered: toInt(raw.considered, 0, 0, MAX_CLAIMS),
    scored: toInt(raw.scored, 0, 0, MAX_CLAIMS),
    refuted: toInt(raw.refuted, 0, 0, MAX_CLAIMS),
    held: toInt(raw.held, 0, 0, MAX_CLAIMS),
    dismissed: toInt(raw.dismissed, 0, 0, MAX_CLAIMS),
    lapsed: toInt(raw.lapsed, 0, 0, MAX_CLAIMS),
    baseRatePct: clamp(raw.baseRatePct, 0, 100),
    brier: clamp(raw.brier, 0, 1),
    brierRef: clamp(raw.brierRef, 0, 1),
    logLoss: clamp(raw.logLoss, 0, 50),
    logLossRef: clamp(raw.logLossRef, 0, 50),
    /* Skill is unbounded below; floor at −99 rather than clip, because the sign
       is the message. */
    skill: Number.isFinite(Number(raw.skill)) ? Math.max(-99, Math.min(1, Number(raw.skill))) : null,
  };
}

function normalizeRound(raw, warnings) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const frozenAt = typeof raw.frozenAt === 'string' ? raw.frozenAt : '';
  const reviewOn = day(raw.reviewOn);
  if (!id || !frozenAt || !reviewOn) return null;
  const rawClaims = Array.isArray(raw.claims) ? raw.claims : [];
  const claims = [];
  for (const entry of rawClaims.slice(0, MAX_CLAIMS)) {
    const claim = normalizeRoundClaim(entry);
    if (!claim) {
      warnings.push(`A frozen cross-examination round (${id}) contains a claim with no readable detector, family, record or probability; the whole round was dropped because it is one quoted audit.`);
      return null;
    }
    claims.push(claim);
  }
  const families = Array.isArray(raw.families)
    ? raw.families
      .filter((row) => row && CLAIM_FAMILY_KEYS.includes(row.key))
      .slice(0, CLAIM_FAMILY_KEYS.length)
      .map((row) => ({
        key: row.key,
        errorMeanPct: clamp(row.errorMeanPct, 0, 100),
        errorLoPct: clamp(row.errorLoPct, 0, 100),
        errorHiPct: clamp(row.errorHiPct, 0, 100),
        verdict: typeof row.verdict === 'string' ? row.verdict.slice(0, 20) : 'unmeasured',
      }))
    : [];
  return {
    id,
    frozenAt,
    reviewOn,
    windowDays: toInt(raw.windowDays, SCEPTIC_LIMITS.windowDaysDefault, ...SCEPTIC_LIMITS.windowDays),
    tolerancePct: toInt(raw.tolerancePct, SCEPTIC_LIMITS.tolerancePctDefault, ...SCEPTIC_LIMITS.tolerancePct),
    minScored: toInt(raw.minScored, SCEPTIC_LIMITS.minScoredDefault, ...SCEPTIC_LIMITS.minScored),
    population: toInt(raw.population, claims.length, 0, 100000),
    examined: toInt(raw.examined, 0, 0, 100000),
    claims,
    families,
    predictedContradictions: clamp(raw.predictedContradictions, 0, MAX_CLAIMS),
    expectedLoss: clamp(raw.expectedLoss, 0, 100000),
    topClaimKey: typeof raw.topClaimKey === 'string' ? raw.topClaimKey.slice(0, 200) : '',
    graded: normalizeGrade(raw.graded),
    challengeNotes: Array.isArray(raw.challengeNotes)
      ? raw.challengeNotes.filter((n) => typeof n === 'string').slice(-20).map((n) => n.slice(0, 400))
      : [],
  };
}

export function normalizeScepticRounds(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const round = normalizeRound(entry, warnings);
    if (!round || seen.has(round.id)) continue;
    seen.add(round.id);
    out.push(round);
  }
  out.sort((a, b) => (a.frozenAt < b.frozenAt ? -1 : a.frozenAt > b.frozenAt ? 1 : 0));
  const cap = SCEPTIC_LIMITS.roundCapDefault;
  if (out.length > cap) {
    warnings.push(`${out.length - cap} older cross-examination round(s) were dropped beyond the ${cap}-round cap.`);
  }
  return out.slice(-cap);
}

const DISPOSITION_VERDICTS = ['refuted', 'held', 'dismissed'];

/**
 * A disposition is a human verdict with a reason. `reason` is required and is
 * required to be a sentence: a verdict with no account of itself is exactly the
 * kind of claim this module exists to cross-examine.
 */
function normalizeDisposition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const claimKey = typeof raw.claimKey === 'string' && raw.claimKey ? raw.claimKey.slice(0, 200) : null;
  const detectorId = typeof raw.detectorId === 'string' && SCEPTIC_DETECTOR_IDS.includes(raw.detectorId)
    ? raw.detectorId
    : null;
  const family = typeof raw.family === 'string' && CLAIM_FAMILY_KEYS.includes(raw.family) ? raw.family : null;
  const verdict = DISPOSITION_VERDICTS.includes(raw.verdict) ? raw.verdict : null;
  const at = typeof raw.at === 'string' ? raw.at : '';
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (!claimKey || !detectorId || !family || !verdict || !at || reason.length < 8) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `scpdisp-${claimKey}-${at}`,
    claimKey,
    detectorId,
    family,
    verdict,
    reason: reason.slice(0, 600),
    at,
  };
}

export function normalizeScepticDispositions(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const row = normalizeDisposition(entry);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (out.length > MAX_DISPOSITIONS) {
    warnings.push(`${out.length - MAX_DISPOSITIONS} older cross-examination verdict(s) were dropped beyond the ${MAX_DISPOSITIONS}-verdict cap.`);
  }
  return out.slice(-MAX_DISPOSITIONS);
}

export function normalizeScepticMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  /* A marker is a claim that a rule has already fired. A duplicate asserts
     nothing new and only spends the cap, so the store is a set. */
  for (const entry of raw) {
    if (typeof entry !== 'string' || !entry) continue;
    const tag = entry.slice(0, 200);
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > 400) {
    warnings.push(`${out.length - 400} older cross-examination marker(s) were dropped beyond the 400-marker cap.`);
  }
  return out.slice(-400);
}
