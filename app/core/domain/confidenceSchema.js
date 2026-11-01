/**
 * app/core/domain/confidenceSchema.js — persistence for the Confidence
 * Transport Terminal (Schema v72). Two collections, both fail-closed.
 *
 *  - `confidenceCertificates` — a frozen calibration certificate: which
 *    instrument it certifies, the map's parameters at the moment it was issued,
 *    the prequential scores that justified it, and the window over which it will
 *    be graded. The parameters are frozen as FACTS so a later change of
 *    convention cannot rewrite a reading the leader was shown.
 *  - `confidenceMarkers` — rule idempotency markers.
 *
 * An unreadable record is dropped with a warning rather than clamped into a
 * plausible-looking figure. A probability of 1.4 is not a probability, a map
 * that claims to be a sigmoid without coefficients is not a map, and a
 * certificate that claims a grade without an outcome returns to frozen.
 */

import {
  CONFIDENCE_CERTIFICATE_CAP,
  CONFIDENCE_ISO_BLOCK_CAP,
  CONFIDENCE_MAP_LABELS,
  CONFIDENCE_MARKER_CAP,
  CONFIDENCE_MAX_PCT,
  CONFIDENCE_MIN_PCT,
  CONFIDENCE_VERDICTS,
} from './confidenceRegistry.js';

const day = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};
const iso = (value) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
};
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const finite = (value, min, max) => (typeof value === 'number' && Number.isFinite(value)
  && value >= min && value <= max ? value : null);
const whole = (value, min, max, fallback) => {
  const n = finite(value, min, max);
  return n === null ? fallback : Math.round(n);
};

/**
 * The isotonic map as binned blocks. A block is a contiguous run of bins whose
 * pooled observed rate is non-decreasing across the run — that blockiness IS the
 * map. Blocks are stored as data (lo/hi bin edges in per cent plus the rate), so
 * a certificate can be re-applied years later without re-fitting anything.
 */
export function normalizeConfidenceBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  for (const block of raw.slice(0, CONFIDENCE_ISO_BLOCK_CAP * 2)) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    const loPct = finite(block.loPct, 0, 100);
    const hiPct = finite(block.hiPct, 0, 100);
    const pct = finite(block.pct, CONFIDENCE_MIN_PCT, CONFIDENCE_MAX_PCT);
    const n = whole(block.n, 0, 10000, null);
    if (loPct === null || hiPct === null || pct === null || n === null || hiPct < loPct) continue;
    rows.push({ loPct, hiPct, pct, n });
  }
  // Monotone by construction: a stored block list that is not monotone cannot be
  // the output of a monotone fit, so it is repaired rather than trusted.
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].pct < rows[i - 1].pct) rows[i].pct = rows[i - 1].pct;
  }
  return rows.slice(0, CONFIDENCE_ISO_BLOCK_CAP);
}

export function normalizeConfidenceCertificates(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, CONFIDENCE_CERTIFICATE_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const issuedOn = day(item.issuedOn);
    const reviewOn = day(item.reviewOn);
    const mapType = CONFIDENCE_MAP_LABELS[item.mapType] ? item.mapType : null;
    const verdict = CONFIDENCE_VERDICTS.includes(item.verdict) ? item.verdict : null;
    if (!id || !issuedOn || !reviewOn || reviewOn < issuedOn || !mapType || !verdict || seen.has(id)) {
      warnings.push('Confidence certificates: dropped a certificate without an id, a window, a known map or a known verdict.');
      continue;
    }
    const plattA = finite(item.plattA, -8, 8);
    const plattB = finite(item.plattB, -5, 5);
    const blocks = normalizeConfidenceBlocks(item.isoBlocks);
    if (mapType === 'platt' && (plattA === null || plattB === null)) {
      warnings.push(`Confidence certificates: ${id} claims a sigmoid map without usable coefficients; it was dropped.`);
      continue;
    }
    if (mapType === 'isotonic' && !blocks.length) {
      warnings.push(`Confidence certificates: ${id} claims an isotonic map without blocks; it was dropped.`);
      continue;
    }
    const rawGrade = item.graded;
    const graded = rawGrade && typeof rawGrade === 'object' && !Array.isArray(rawGrade)
      && iso(rawGrade.gradedAt)
      && whole(rawGrade.observed, 1, 4000, null) !== null
      && finite(rawGrade.brierDeclared, 0, 1) !== null
      && finite(rawGrade.brierTransported, 0, 1) !== null
      && iso(rawGrade.gradedAt).slice(0, 10) >= issuedOn
      ? {
        gradedAt: iso(rawGrade.gradedAt),
        observed: whole(rawGrade.observed, 1, 4000, 1),
        successes: whole(rawGrade.successes, 0, 4000, 0),
        brierDeclared: rawGrade.brierDeclared,
        brierTransported: rawGrade.brierTransported,
        // Skill is DERIVED and recomputed on read from the two frozen Brier
        // scores, so a stored one cannot disagree with them.
        skill: null,
      } : null;
    if (rawGrade && !graded) {
      warnings.push(`Confidence certificates: ${id} claimed a grade without a complete outcome; returned to frozen.`);
    }
    seen.add(id);
    rows.push({
      id,
      label: text(item.label, 120),
      issuedOn,
      reviewOn,
      mapType,
      verdict,
      sampleN: whole(item.sampleN, 0, 10000, 0),
      trainN: whole(item.trainN, 0, 10000, 0),
      scoredN: whole(item.scoredN, 0, 10000, 0),
      plattA,
      plattB,
      isoBlocks: blocks,
      brierDeclared: finite(item.brierDeclared, 0, 1),
      brierPlatt: finite(item.brierPlatt, 0, 1),
      brierIsotonic: finite(item.brierIsotonic, 0, 1),
      chosenBrier: finite(item.chosenBrier, 0, 1),
      skill: finite(item.skill, -5, 1),
      ciLo: finite(item.ciLo, -1, 1),
      ciHi: finite(item.ciHi, -1, 1),
      paceAtFit: finite(item.paceAtFit, 0, 1000),
      expectedResolutions: whole(item.expectedResolutions, 0, 4000, 0),
      lapsedOn: day(item.lapsedOn),
      graded,
    });
  }
  return rows;
}

export function normalizeConfidenceMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m) => typeof m === 'string' && m.length > 0).map((m) => m.slice(0, 200)))]
    .slice(-CONFIDENCE_MARKER_CAP);
}
