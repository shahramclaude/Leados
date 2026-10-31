/**
 * Deferral Portfolio persistence (Schema v69). Three collections, all
 * fail-closed:
 *
 *  - `deferralPortfolioReadings` — a frozen reading stores one bounded,
 *    aggregate-only book snapshot (currency, member ids, Σ premium, tail
 *    figures, concentration, one prospective probability) and nothing else.
 *    No decision title, question, person or note is copied into the ledger.
 *  - `correlationDeclarations` — the leader's declared pairwise ρ. A
 *    declaration is an assumption with a name on it; it is never derived,
 *    never defaulted and never repaired.
 *  - `deferralPortfolioMarkers` — rule idempotency markers.
 *
 * An unreadable record is dropped with a warning, never clamped into a
 * plausible-looking number.
 */

export const DEFERRAL_PORTFOLIO_READING_CAP = 20;
export const CORRELATION_DECLARATION_CAP = 80;
const MARKER_CAP = 400;

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
const idList = (value, max) => (Array.isArray(value)
  ? [...new Set(value.filter((v) => typeof v === 'string' && v.length > 0).map((v) => v.slice(0, 60)))] : []
).slice(0, max);

/** Fail closed: a missing premium, tail figure or probability never becomes a 0. */
export function normalizeDeferralPortfolioReadings(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, DEFERRAL_PORTFOLIO_READING_CAP)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const frozenAt = iso(item.frozenAt);
    const reviewOn = day(item.reviewOn);
    const currency = text(item.currency, 3).toUpperCase();
    const memberIds = idList(item.memberIds, 8);
    if (!id || !frozenAt || !reviewOn || seen.has(id) || reviewOn < frozenAt.slice(0, 10)
      || !/^[A-Z]{3}$/.test(currency) || memberIds.length < 2) {
      warnings.push('Deferral portfolio readings: dropped an unreadable, duplicate or sub-two-member reading.');
      continue;
    }
    const probability = item.predictedAnyCommitPct === null
      ? null : finite(item.predictedAnyCommitPct, 0, 100);
    if (probability === null) {
      warnings.push(`Deferral portfolio readings: dropped ${id} without its one frozen probability.`);
      continue;
    }
    const rawGrade = item.graded;
    const graded = rawGrade && typeof rawGrade === 'object' && !Array.isArray(rawGrade)
      && iso(rawGrade.gradedAt)
      && typeof rawGrade.anyCommitted === 'boolean'
      && iso(rawGrade.gradedAt).slice(0, 10) >= reviewOn
      && finite(rawGrade.brier, 0, 1) !== null
      ? {
        gradedAt: iso(rawGrade.gradedAt),
        anyCommitted: rawGrade.anyCommitted,
        gradedMembers: Math.round(finite(rawGrade.gradedMembers, 1, 8) ?? memberIds.length),
        brier: rawGrade.brier,
      } : null;
    if (rawGrade && !graded) {
      warnings.push(`Deferral portfolio readings: ${id} claimed a grade without an outcome; returned to frozen.`);
    }
    seen.add(id);
    rows.push({
      id,
      frozenAt,
      reviewOn,
      windowDays: Math.round(finite(item.windowDays, 1, 730) ?? 30),
      currency,
      memberIds,
      stressedPremiseIds: idList(item.stressedPremiseIds, 8),
      paths: Math.round(finite(item.paths, 500, 20000) ?? 4000),
      steps: Math.round(finite(item.steps, 1, 366) ?? 90),
      seed: Math.round(finite(item.seed, 1, 2147483647) ?? 20261031),
      sumPremium: finite(item.sumPremium, 0, 1e12) ?? 0,
      sumStake: finite(item.sumStake, 0, 1e13) ?? 0,
      mcMeanTotal: finite(item.mcMeanTotal, -1e12, 1e12),
      mcSeTotal: finite(item.mcSeTotal, 0, 1e12),
      cvar: finite(item.cvar, -1e12, 1e12),
      var: finite(item.var, -1e12, 1e12),
      tailLevel: finite(item.tailLevel, 0.5, 0.99) ?? 0.9,
      diversificationCredit: finite(item.diversificationCredit, -1e12, 1e12),
      hhiPremium: finite(item.hhiPremium, 0, 1),
      hhiContribution: finite(item.hhiContribution, 0, 1),
      topContributionShare: finite(item.topContributionShare, -1, 8),
      worstJointLapseExcessPp: finite(item.worstJointLapseExcessPp, -100, 100),
      pAllLapsePct: finite(item.pAllLapsePct, 0, 100),
      stressedPremiseCount: Math.round(finite(item.stressedPremiseCount, 0, 28) ?? 0),
      predictedAnyCommitPct: probability,
      graded,
      challengeNotes: (Array.isArray(item.challengeNotes)
        ? item.challengeNotes.filter((note) => note && typeof note === 'string').map((note) => note.slice(0, 240))
        : []).slice(-8),
    });
  }
  return rows;
}

/**
 * A declaration is per unordered pair of decision ids with one ρ in
 * [−0.99, 0.99]. Out-of-range or non-numeric ρ is dropped — clamping a
 * declared 1.4 down to 0.99 would silently change an assumption the leader
 * made. The latest declaration for a pair wins on duplicate.
 */
export function normalizeCorrelationDeclarations(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const byPair = new Map();
  for (const item of raw.slice(0, CORRELATION_DECLARATION_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const aId = text(item.aId, 60);
    const bId = text(item.bId, 60);
    const rho = finite(item.rho, -0.99, 0.99);
    if (!aId || !bId || aId === bId || rho === null) {
      warnings.push('Correlation declarations: dropped a declaration without two distinct decisions or a ρ in [−0.99, 0.99].');
      continue;
    }
    const key = [aId, bId].sort().join('|');
    const declaredAt = iso(item.declaredAt) || null;
    const existing = byPair.get(key);
    if (existing && (!declaredAt || (existing.declaredAt && existing.declaredAt >= declaredAt))) continue;
    byPair.set(key, {
      id: text(item.id, 60) || `corr-${key}`,
      aId,
      bId,
      rho,
      declaredAt,
    });
  }
  return [...byPair.values()].slice(-CORRELATION_DECLARATION_CAP);
}

export function normalizeDeferralPortfolioMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m) => typeof m === 'string' && m.length > 0)
    .map((m) => m.slice(0, 200)))].slice(-MARKER_CAP);
}
