/**
 * app/core/domain/checkpointScoring.js — out-of-sample scoring of a frozen
 * structural prediction (Schema v38).
 *
 * Kept dependency-free on purpose: both the schema normalizer and the capital
 * allocation engine need to score a checkpoint, and a schema↔domain import
 * cycle is exactly the kind of thing that works in tests and fails on a cold
 * browser load. This module imports nothing.
 *
 * The benchmark is naive persistence — "tomorrow equals today" — so skill =
 * 1 − model error ÷ naive error. Positive means the frozen prediction beat
 * doing nothing; negative means it lost. A stock with no frozen baseline is
 * excluded rather than scored as zero, because a skill score with no
 * denominator is a number that looks like evidence and is not.
 */

export const CHECKPOINT_STOCKS = Object.freeze([
  { key: 'saturationPct', predictedKey: 'endSaturationPct', label: 'Perceived pressure', unit: '%', min: 0, max: 500, dp: 0 },
  { key: 'wipDays', predictedKey: 'endWipDays', label: 'Work in progress', unit: 'pd', min: 0, max: 10000, dp: 1 },
  { key: 'capacityPerWeek', predictedKey: 'endCapacityPerWeek', label: 'Delivery capacity', unit: 'pd/week', min: 0, max: 500, dp: 2 },
  { key: 'dependencyPct', predictedKey: 'endDependencyPct', label: 'Dependency concentration', unit: '%', min: 0, max: 100, dp: 0 },
]);

/** Two independently dated checkpoints before pooled skill is shown at all. */
export const CHECKPOINT_MIN_FOR_POOLED_SKILL = 2;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function scoreCheckpoint(predicted, observed) {
  const stocks = [];
  for (const stock of CHECKPOINT_STOCKS) {
    const observedValue = num(observed?.[stock.key], null);
    if (observedValue === null) continue;
    const predictedValue = num(predicted?.[stock.predictedKey], null);
    if (predictedValue === null) continue;
    const baselineValue = num(predicted?.baseline?.[stock.predictedKey], null);
    const error = Math.abs(predictedValue - observedValue);
    const naiveError = baselineValue === null ? null : Math.abs(baselineValue - observedValue);
    const skill = naiveError !== null && naiveError > 1e-6 ? 1 - error / naiveError : null;
    stocks.push({
      key: stock.key,
      label: stock.label,
      unit: stock.unit,
      predicted: round2(predictedValue),
      observed: round2(observedValue),
      baseline: baselineValue === null ? null : round2(baselineValue),
      error: round2(error),
      naiveError: naiveError === null ? null : round2(naiveError),
      skill: skill === null ? null : round2(skill),
    });
  }
  const scored = stocks.filter((row) => row.skill !== null);
  const mae = stocks.length ? round2(stocks.reduce((sum, row) => sum + row.error, 0) / stocks.length) : null;
  const naiveMae = scored.length ? round2(scored.reduce((sum, row) => sum + row.naiveError, 0) / scored.length) : null;
  const skill = scored.length ? round2(scored.reduce((sum, row) => sum + row.skill, 0) / scored.length) : null;
  const verdict = !stocks.length ? 'unscorable'
    : skill === null ? 'no-baseline'
      : skill > 0.05 ? 'beats-persistence'
        : skill < -0.05 ? 'no-better-than-persistence' : 'indistinguishable';
  return {
    stocks,
    scoredStocks: scored.length,
    mae,
    naiveMae,
    skill,
    verdict,
    reason: verdict === 'unscorable'
      ? 'No stock was recorded with both a frozen prediction and an observed value, so there is nothing to score.'
      : verdict === 'no-baseline'
        ? 'The prediction has no frozen do-nothing baseline, so a skill score would have no denominator. The absolute error is reported; the skill score is withheld.'
        : null,
  };
}

/** Pool out-of-sample skill across independently dated checkpoints. */
export function pooledCheckpointSkill(checkpoints = []) {
  const rows = Array.isArray(checkpoints) ? checkpoints.filter(Boolean) : [];
  const scored = rows.filter((row) => row && Number.isFinite(num(row.scoring?.skill, NaN)));
  const n = scored.length;
  const mean = n ? round2(scored.reduce((sum, row) => sum + num(row.scoring.skill, 0), 0) / n) : null;
  const beats = scored.filter((row) => num(row.scoring?.skill, 0) > 0).length;
  return {
    n,
    checked: rows.length,
    skill: n >= CHECKPOINT_MIN_FOR_POOLED_SKILL ? mean : null,
    meanSkill: mean,
    beats,
    verdict: n < CHECKPOINT_MIN_FOR_POOLED_SKILL
      ? 'insufficient'
      : mean > 0.05 ? 'beats-persistence' : mean < -0.05 ? 'no-better-than-persistence' : 'indistinguishable',
    suppressed: n < CHECKPOINT_MIN_FOR_POOLED_SKILL,
    reason: n < CHECKPOINT_MIN_FOR_POOLED_SKILL
      ? `Counts only: ${n} scored checkpoint${n === 1 ? '' : 's'} is below the ${CHECKPOINT_MIN_FOR_POOLED_SKILL} required before pooled skill is shown.`
      : null,
  };
}
