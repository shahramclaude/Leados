/**
 * Deferral Option persistence (Schema v68). A frozen frame stores one bounded
 * pricing snapshot — the stake, the commitment cost, the carry price, the
 * derived/declared volatility, the lattice result and one prospective timing
 * forecast — and nothing else. No title, question, option label, rationale,
 * person or note is copied into the ledger, so a redacted export can carry the
 * audit history without carrying the decision.
 */

export const DEFERRAL_FRAME_CAP = 40;
const MARKER_CAP = 400;
const VERDICTS = new Set(['commit-now', 'wait', 'indifferent', 'act-or-drop']);

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

/** Fail closed: a missing price, volatility or probability never becomes a 0. */
export function normalizeDeferralFrames(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, DEFERRAL_FRAME_CAP)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const decisionId = text(item.decisionId, 60);
    const frozenAt = iso(item.frozenAt);
    const reviewOn = day(item.reviewOn);
    if (!id || !decisionId || !frozenAt || !reviewOn || seen.has(id)
        || reviewOn < frozenAt.slice(0, 10)) {
      warnings.push('Deferral frames: dropped an unreadable or duplicate frozen frame.');
      continue;
    }
    const currency = text(item.currency, 3).toUpperCase();
    const valueNow = finite(item.valueNow, 0.01, 1e12);
    const sigma = finite(item.sigma, 0.0001, 5);
    if (!/^[A-Z]{3}$/.test(currency) || valueNow === null || sigma === null) {
      warnings.push(`Deferral frames: dropped ${id} without a currency, stake or volatility.`);
      continue;
    }
    const verdict = VERDICTS.has(item.verdict) ? item.verdict : null;
    if (!verdict) {
      warnings.push(`Deferral frames: dropped ${id} with an unrecognisable verdict.`);
      continue;
    }
    const probability = item.predictedCommitByDeadlinePct === null
      ? null : finite(item.predictedCommitByDeadlinePct, 0, 100);
    const rawGrade = item.graded;
    const graded = rawGrade && typeof rawGrade === 'object' && !Array.isArray(rawGrade)
      && iso(rawGrade.gradedAt)
      && typeof rawGrade.committedByDeadline === 'boolean'
      && iso(rawGrade.gradedAt).slice(0, 10) >= reviewOn
      && finite(rawGrade.brier, 0, 1) !== null
      ? {
        gradedAt: iso(rawGrade.gradedAt),
        committedByDeadline: rawGrade.committedByDeadline,
        decisionDate: day(rawGrade.decisionDate) || null,
        brier: rawGrade.brier,
      } : null;
    if (rawGrade && !graded) {
      warnings.push(`Deferral frames: ${id} claimed a grade without an outcome; returned to frozen.`);
    }
    seen.add(id);
    rows.push({
      id,
      decisionId,
      frozenAt,
      reviewOn,
      horizonDays: Math.round(finite(item.horizonDays, 1, 730) ?? 30),
      currency,
      valueNow,
      commitCost: finite(item.commitCost, 0, 1e12) ?? 0,
      carryPerWeek: finite(item.carryPerWeek, 0, 1e12) ?? 0,
      sigma,
      sigmaSource: item.sigmaSource === 'declared' ? 'declared' : 'derived',
      drift: finite(item.drift, -1, 1) ?? 0,
      discountRate: finite(item.discountRate, 0, 0.3) ?? 0,
      verdict,
      premium: finite(item.premium, 0, 1e12) ?? 0,
      waitValue: finite(item.waitValue, 0, 1e12) ?? 0,
      commitNow: finite(item.commitNow, 0, 1e12) ?? 0,
      threshold: finite(item.threshold, 0, 1e12),
      expectedWaitDays: finite(item.expectedWaitDays, 0, 730),
      predictedCommitByDeadlinePct: probability,
      breakEvenCarryPerWeek: finite(item.breakEvenCarryPerWeek, 0, 1e12),
      breakEvenSigma: finite(item.breakEvenSigma, 0, 5),
      graded: graded && probability !== null ? graded : null,
    });
  }
  return rows;
}

export function normalizeDeferralMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m) => typeof m === 'string' && m.length > 0)
    .map((m) => m.slice(0, 200)))].slice(-MARKER_CAP);
}
