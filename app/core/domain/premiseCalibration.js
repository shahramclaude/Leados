/**
 * Premise sensor calibration: outcome-scored, local evidence quality.
 *
 * One *conclusive, human-recorded* outcome per premise can score each sensor.
 * For a given sensor/premise pair, repeated observations of one source collapse
 * to its latest state before the outcome; the remaining source-level forecasts
 * are averaged, so a noisy source cannot inflate the sample count. A declared
 * likelihood ratio is mapped to a probability from a neutral 50% prior solely
 * to make its directional strength scoreable. These are descriptive diagnostics,
 * not validated likelihoods, independent trials, or a claim of causality.
 */

export const PREMISE_CALIBRATION_MIN_SAMPLES = 5;
export const PREMISE_DRIFT_MIN_PER_COHORT = 10;
export const PREMISE_CALIBRATION_BINS = 5;
export const PREMISE_CALIBRATION_ENGINE_VERSION = 'premise-calibration-2026.10-v1';

const round4 = (value) => Math.round(value * 10000) / 10000;

function probabilityFromObservation(observation) {
  const lr = Number(observation?.likelihoodRatio);
  if (!Number.isFinite(lr) || lr < 1) return null;
  const support = observation.direction === 'for';
  return support ? lr / (1 + lr) : 1 / (1 + lr);
}

function sourceKey(observation) {
  if (observation.sourceType && observation.sourceId) {
    return `${observation.sourceType}:${observation.sourceId}`;
  }
  return observation.key || observation.id || '';
}

function psi(expected, actual) {
  const expectedCounts = Array(PREMISE_CALIBRATION_BINS).fill(0);
  const actualCounts = Array(PREMISE_CALIBRATION_BINS).fill(0);
  for (const p of expected) expectedCounts[Math.min(PREMISE_CALIBRATION_BINS - 1, Math.floor(p * PREMISE_CALIBRATION_BINS))] += 1;
  for (const p of actual) actualCounts[Math.min(PREMISE_CALIBRATION_BINS - 1, Math.floor(p * PREMISE_CALIBRATION_BINS))] += 1;
  const smooth = 0.5;
  const expectedTotal = expected.length + smooth * PREMISE_CALIBRATION_BINS;
  const actualTotal = actual.length + smooth * PREMISE_CALIBRATION_BINS;
  let value = 0;
  for (let i = 0; i < PREMISE_CALIBRATION_BINS; i += 1) {
    const e = (expectedCounts[i] + smooth) / expectedTotal;
    const a = (actualCounts[i] + smooth) / actualTotal;
    value += (a - e) * Math.log(a / e);
  }
  return round4(value);
}

function sampleFor(outcome, premise) {
  const y = outcome.verdict === 'held' ? 1 : outcome.verdict === 'failed' ? 0 : null;
  if (y === null) return [];
  const bySensor = new Map();
  for (const observation of premise?.observations || []) {
    if (!observation?.sensorId || !observation.observedOn || observation.observedOn > outcome.settledOn) continue;
    const p = probabilityFromObservation(observation);
    if (p === null) continue;
    const sensorId = String(observation.sensorId).slice(0, 60);
    const key = sourceKey(observation);
    if (!key) continue;
    if (!bySensor.has(sensorId)) bySensor.set(sensorId, new Map());
    const sources = bySensor.get(sensorId);
    const previous = sources.get(key);
    if (!previous || `${observation.observedOn}|${observation.createdAt || ''}` > `${previous.observedOn}|${previous.createdAt || ''}`) {
      sources.set(key, {
        probability: p,
        observedOn: observation.observedOn,
        createdAt: observation.createdAt || '',
        label: observation.sensorLabel || sensorId,
      });
    }
  }
  return [...bySensor.entries()].map(([sensorId, sources]) => {
    const rows = [...sources.values()];
    return {
      sensorId,
      label: rows.find((row) => row.label)?.label || sensorId,
      premiseId: premise.id,
      outcomeId: outcome.id,
      settledOn: outcome.settledOn,
      forecast: round4(rows.reduce((sum, row) => sum + row.probability, 0) / rows.length),
      observed: y,
      sourceCount: rows.length,
    };
  });
}

/**
 * Build a transparent per-sensor reliability and forecast-mix drift report.
 * Definitive outcomes are capped at one per premise; later evidence is never
 * allowed to leak backward across the settlement date.
 */
export function buildPremiseCalibrationReport(state = {}) {
  const premises = new Map((state.premises || []).map((premise) => [premise.id, premise]));
  const definitiveByPremise = new Map();
  for (const outcome of state.premiseOutcomes || []) {
    if (!outcome || !['held', 'failed'].includes(outcome.verdict) || !outcome.premiseId) continue;
    const previous = definitiveByPremise.get(outcome.premiseId);
    if (!previous || `${outcome.settledOn}|${outcome.createdAt || ''}` < `${previous.settledOn}|${previous.createdAt || ''}`) {
      definitiveByPremise.set(outcome.premiseId, outcome);
    }
  }

  const bySensor = new Map();
  for (const outcome of definitiveByPremise.values()) {
    const premise = premises.get(outcome.premiseId);
    if (!premise) continue;
    for (const sample of sampleFor(outcome, premise)) {
      if (!bySensor.has(sample.sensorId)) bySensor.set(sample.sensorId, { sensorId: sample.sensorId, label: sample.label, samples: [] });
      bySensor.get(sample.sensorId).samples.push(sample);
    }
  }

  const sensors = [...bySensor.values()].map((sensor) => {
    const samples = sensor.samples.sort((a, b) => `${a.settledOn}|${a.outcomeId}`.localeCompare(`${b.settledOn}|${b.outcomeId}`));
    const count = samples.length;
    const mature = count >= PREMISE_CALIBRATION_MIN_SAMPLES;
    const meanForecast = count ? round4(samples.reduce((sum, sample) => sum + sample.forecast, 0) / count) : null;
    const observedRate = count ? round4(samples.reduce((sum, sample) => sum + sample.observed, 0) / count) : null;
    const brier = mature ? round4(samples.reduce((sum, sample) => sum + ((sample.forecast - sample.observed) ** 2), 0) / count) : null;
    const calibrationGap = mature ? round4(meanForecast - observedRate) : null;
    const accuracy = mature ? round4(samples.filter((sample) => (sample.forecast >= 0.5 ? 1 : 0) === sample.observed).length / count) : null;
    let drift = null;
    if (count >= PREMISE_DRIFT_MIN_PER_COHORT * 2) {
      // Never split same-day assessments across cohorts: a random id tie-break
      // would turn one settlement wave into fake "earlier" and "recent" data.
      const candidates = [];
      for (let i = PREMISE_DRIFT_MIN_PER_COHORT; i <= count - PREMISE_DRIFT_MIN_PER_COHORT; i += 1) {
        if (samples[i - 1].settledOn < samples[i].settledOn) candidates.push(i);
      }
      const splitAt = candidates.sort((a, b) => Math.abs(a - count / 2) - Math.abs(b - count / 2))[0];
      if (splitAt !== undefined) {
        const earlier = samples.slice(0, splitAt);
        const recent = samples.slice(splitAt);
        drift = {
          psi: psi(earlier.map((sample) => sample.forecast), recent.map((sample) => sample.forecast)),
          earlierN: earlier.length,
          recentN: recent.length,
          earlierThrough: earlier[earlier.length - 1]?.settledOn || null,
          recentFrom: recent[0]?.settledOn || null,
          interpretation: 'forecast-mix-shift-only',
        };
      }
    }
    return {
      sensorId: sensor.sensorId,
      label: sensor.label,
      count,
      status: mature ? 'scored' : 'counts-only',
      meanForecast,
      observedRate,
      brier,
      calibrationGap,
      accuracy,
      drift,
      samples,
    };
  }).sort((a, b) => a.sensorId.localeCompare(b.sensorId));

  const scored = sensors.filter((sensor) => sensor.status === 'scored');
  return {
    engineVersion: PREMISE_CALIBRATION_ENGINE_VERSION,
    outcomeCount: [...definitiveByPremise.values()].length,
    scoredSensorCount: scored.length,
    minimumSamples: PREMISE_CALIBRATION_MIN_SAMPLES,
    driftMinPerCohort: PREMISE_DRIFT_MIN_PER_COHORT,
    sensors,
    caveats: [
      'Only manually assessed, held/failed outcomes score; an inconclusive assessment is retained but excluded.',
      'A sensor score is one sample per settled premise, not one per observation. Repeated evidence from the same typed source is collapsed to its latest pre-outcome state.',
      'The Brier score measures the declared likelihood-ratio strength mapped from a neutral 50% prior; it does not validate the LR as a true likelihood ratio or prove sensor causality.',
      `Below ${PREMISE_CALIBRATION_MIN_SAMPLES} settled premises, performance metrics are withheld and counts only are shown. PSI needs at least ${PREMISE_DRIFT_MIN_PER_COHORT} earlier and ${PREMISE_DRIFT_MIN_PER_COHORT} recent premise samples and detects forecast-mix shift, not quality degradation.`,
      'No likelihood ratio is auto-tuned. The leader must inspect the evidence and choose any policy change.',
    ],
  };
}
