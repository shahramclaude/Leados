/**
 * Consequence Lab persistence (Schema v67). A reading freezes only source IDs,
 * priced aggregates and one time-bounded forecast. No titles, personal notes,
 * stakeholder stances or graph bodies are copied into the second ledger.
 */

export const CONSEQUENCE_READING_CAP = 60;
const MARKER_CAP = 400;
const EDGE_CAP = 12;
const GRAPH_TYPES = new Set([
  'case', 'decision', 'delegation', 'goal', 'portfolio', 'budget', 'premise',
  'dependency', 'stakeholder', 'change', 'negotiation', 'strategy', 'voi',
]);
const day = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};
const iso = (value) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
};
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const finite = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const count = (value, max) => Number.isInteger(value) && value >= 0 && value <= max ? value : 0;

/** Fail closed: never turn a missing price/probability into a reported zero. */
export function normalizeConsequenceReadings(raw, now, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, CONSEQUENCE_READING_CAP)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const decisionId = text(item.decisionId, 60);
    const reviewOn = day(item.reviewOn);
    const frozenAt = iso(item.frozenAt);
    if (!id || !decisionId || !reviewOn || !frozenAt || seen.has(id)
        || reviewOn <= frozenAt.slice(0, 10)) {
      warnings.push('Consequence readings: dropped an unreadable or duplicate frozen reading.');
      continue;
    }
    const horizonWeeks = item.horizonWeeks;
    if (!Number.isInteger(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 26) {
      warnings.push(`Consequence readings: dropped ${id} with an invalid horizon.`);
      continue;
    }
    const forecast = item.predictedStillOpenPct === null
      ? null : finite(item.predictedStillOpenPct, 0, 100);
    if (item.predictedStillOpenPct !== null && forecast === null) {
      warnings.push(`Consequence readings: dropped ${id} with an invalid probability.`);
      continue;
    }
    const rawPrice = item.price;
    const amount = rawPrice?.weeklyAmount === undefined ? null : finite(rawPrice.weeklyAmount, 0, 1e12);
    const currency = text(rawPrice?.currency, 3).toUpperCase();
    const price = amount !== null && /^[A-Z]{3}$/.test(currency)
      ? { weeklyAmount: amount, currency, source: ['derived', 'declared'].includes(rawPrice.source) ? rawPrice.source : 'declared' }
      : null;
    if (rawPrice && !price) warnings.push(`Consequence readings: ${id} carried an invalid price; it was cleared, not set to zero.`);
    const transportAxis = (value) => (['supported', 'undermined', 'favorable-shift', 'not-assessed'].includes(value) ? value : null);
    const snapshot = item.graphSnapshot && typeof item.graphSnapshot === 'object' && !Array.isArray(item.graphSnapshot)
      ? {
        direct: count(item.graphSnapshot.direct, 500),
        secondOrder: count(item.graphSnapshot.secondOrder, 500),
        invalidEdges: count(item.graphSnapshot.invalidEdges, 10000),
        truncated: item.graphSnapshot.truncated === true,
        relatedPriced: count(item.graphSnapshot.relatedPriced, 500),
        fragilePremises: count(item.graphSnapshot.fragilePremises, 500),
        transportTiming: transportAxis(item.graphSnapshot.transportTiming),
        transportCompletion: transportAxis(item.graphSnapshot.transportCompletion),
      } : { direct: 0, secondOrder: 0, invalidEdges: 0, truncated: false, relatedPriced: 0, fragilePremises: 0, transportTiming: null, transportCompletion: null };
    const targets = Array.isArray(item.targets) ? item.targets
      .filter((t) => t && GRAPH_TYPES.has(t.type) && typeof t.id === 'string' && t.id)
      .slice(0, EDGE_CAP)
      .map((t) => ({ type: t.type, id: text(t.id, 60) })) : [];
    const rawGrade = item.graded;
    const graded = rawGrade && typeof rawGrade === 'object'
      && !Array.isArray(rawGrade) && iso(rawGrade.gradedAt)
      && typeof rawGrade.stillOpen === 'boolean'
      && iso(rawGrade.gradedAt).slice(0, 10) >= reviewOn
      && (rawGrade.brier === null || finite(rawGrade.brier, 0, 1) !== null)
      ? {
        gradedAt: iso(rawGrade.gradedAt),
        stillOpen: rawGrade.stillOpen,
        brier: forecast === null ? null : rawGrade.brier,
        decisionDate: day(rawGrade.decisionDate) || null,
      } : null;
    if (rawGrade && !graded) warnings.push(`Consequence readings: ${id} claimed a grade without an outcome; returned to frozen.`);
    if (graded && forecast !== null && graded.brier === null) {
      warnings.push(`Consequence readings: ${id} claimed a score without a Brier term; returned to frozen.`);
    }
    seen.add(id);
    rows.push({
      id, decisionId, frozenAt, horizonWeeks, reviewOn,
      predictedStillOpenPct: forecast,
      price,
      expectedCost: price && forecast !== null ? finite(item.expectedCost, 0, 1e12) : null,
      fullWaitCeiling: price ? finite(item.fullWaitCeiling, 0, 1e12) : null,
      graphSnapshot: snapshot,
      targets,
      graded: graded && (forecast === null || graded.brier !== null) ? graded : null,
    });
  }
  return rows;
}

export function normalizeConsequenceMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m) => typeof m === 'string' && m.length > 0)
    .map((m) => m.slice(0, 200)))].slice(-MARKER_CAP);
}
