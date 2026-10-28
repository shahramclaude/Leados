/**
 * app/core/domain/watchRegistry.js — the Early-Warning Watch vocabulary.
 *
 * A leaf module with no imports, for one practical reason: `schema.js` must
 * validate alert rows against the monitored-series registry, and the engine
 * that uses it reaches `schema.js` transitively (earlyWarning → vitals → pulse →
 * schema). Keeping the vocabulary in a leaf and importing it from both sides
 * breaks what would otherwise be a module cycle, so the normaliser and the
 * engine can never disagree about which series exist or which verdicts are
 * legal. Constants only: no functions, no state, no clock.
 */

export const EW_ENGINE_VERSION = 'early-warning-2026.10-v1';

export const EW_RULE_IDS = Object.freeze({
  SENSE: 'RULE-EW-00',
  PROMOTE: 'RULE-EW-01',
  STALE: 'RULE-EW-02',
  BUDGET: 'RULE-EW-03',
  PRECISION: 'RULE-EW-04',
});

/** Weekly buckets reconstructed for every monitored series. */
export const EW_BUCKETS = 26;
/** Shewhart rules tested per series; the Bonferroni factor for a series p-value. */
export const EW_RULES_PER_SERIES = 4;
/** Default Benjamini–Hochberg false-discovery rate for the whole scan. */
export const EW_DEFAULT_Q = 0.1;
/** Default cap on alerts a leader is asked to triage per window. */
export const EW_DEFAULT_BUDGET = 4;
/** Default rolling window for the alert budget, in days. */
export const EW_DEFAULT_WINDOW_DAYS = 28;
/** Default grace period before an untriaged alert escalates, in days. */
export const EW_DEFAULT_TRIAGE_DAYS = 5;
/** Default per-series cooldown between promoted alerts, in days. */
export const EW_DEFAULT_COOLDOWN_DAYS = 14;
/** False alarms within the noise look-back that make a series "noisy". */
export const EW_NOISY_FALSE_ALARMS = 2;
/** Look-back used when deciding a series has become unreliable, in days. */
export const EW_NOISE_LOOKBACK_DAYS = 90;
/** Scored forecasts needed before a pooled skill figure is reported. */
export const EW_MIN_SCORED = 3;
/** Verdicts needed before a precision figure is reported. */
export const EW_MIN_VERDICTS = 3;
/** Below this measured precision the detector is declared badly tuned. */
export const EW_PRECISION_TOLERANCE = 0.5;
/** Frozen forecasts retained in the ledger; older rows are pruned on load. */
export const EW_MAX_FORECASTS = 240;

/** One-way human verdicts. `open` and `suppressed` are the two system states. */
export const EW_ALERT_STATUSES = Object.freeze([
  'open', 'confirmed', 'false-alarm', 'explained', 'dismissed', 'suppressed',
]);
/** Verdicts a human may record (everything except `open`/`suppressed`). */
export const EW_VERDICTS = Object.freeze(['confirmed', 'false-alarm', 'explained', 'dismissed']);

export const EW_STATUS_LABELS = Object.freeze({
  open: 'Awaiting verdict',
  confirmed: 'Confirmed special cause',
  'false-alarm': 'False alarm',
  explained: 'Explained by a known cause',
  dismissed: 'Not worth acting on',
  suppressed: 'Suppressed by a governor',
});

export const EW_VERDICT_LABELS = Object.freeze({
  confirmed: 'Confirmed — the process really changed',
  'false-alarm': 'False alarm — routine noise',
  explained: 'Explained — a known, already-handled cause',
  dismissed: 'Dismissed — real but not worth acting on',
});

export const EW_SUPPRESSION_REASONS = Object.freeze({
  budget: 'The alert budget for this window is already spent',
  cooldown: 'This series alerted recently; the cooldown is still running',
  'noisy-series': 'This series has a recent record of false alarms',
});

export const EW_FDR_METHOD =
  'Benjamini–Hochberg step-up at the scan level: p values are per series, Bonferroni-inflated '
  + 'for the four Shewhart rules tested on each chart, and only series the step-up rejects may alert.';

/**
 * The monitored series. Each is a vital that `vitals.js` can reconstruct from
 * dates the leader already typed; nothing here is new telemetry. `vital` is the
 * catalog id, `minBound` is the physical floor passed to the XmR limits so a
 * count series can never acquire an impossible negative limit.
 */
export const EW_SERIES_REGISTRY = Object.freeze([
  { id: 'open-cases', vital: 'case-open', label: 'Open operational cases', unit: 'cases', minBound: 0 },
  { id: 'decision-latency', vital: 'decision-latency', label: 'Decision latency', unit: 'days', minBound: 0 },
  { id: 'feedback-latency', vital: 'feedback-latency', label: 'Feedback latency', unit: 'days', minBound: 0 },
  { id: 'delegation-cycle', vital: 'delegation-cycle', label: 'Delegation cycle time', unit: 'days', minBound: 0 },
  { id: 'case-cycle', vital: 'case-cycle', label: 'Case cycle time', unit: 'days', minBound: 0 },
  { id: 'negotiation-cycle', vital: 'negotiation-cycle', label: 'Negotiation cycle time', unit: 'days', minBound: 0 },
  { id: 'feedback-cadence', vital: 'feedback-cadence', label: 'Feedback cadence', unit: 'per person / 4 wk', minBound: 0 },
  { id: 'oneoneone-cadence', vital: 'oneoneone-cadence', label: '1:1 cadence', unit: 'per person / 4 wk', minBound: 0 },
  { id: 'recognition-cadence', vital: 'recognition-cadence', label: 'Recognition cadence', unit: 'per person / 4 wk', minBound: 0 },
  { id: 'delegation-throughput', vital: 'delegation-throughput', label: 'Delegation throughput', unit: 'per person / 4 wk', minBound: 0 },
  { id: 'oneoneone-mood', vital: 'oneoneone-mood', label: '1:1 mood average', unit: 'score / 5', minBound: 0 },
  { id: 'pulse-index', vital: 'pulse-index', label: 'Pulse index', unit: 'index 0–100', minBound: 0 },
]);

export const EW_SERIES_BY_ID = new Map(EW_SERIES_REGISTRY.map((s) => [s.id, s]));

