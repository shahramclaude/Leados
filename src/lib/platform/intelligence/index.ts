/**
 * index.ts — barrel export for the stateful platform layer of the
 * intelligence subsystem (in-memory stand-ins for the real repository's
 * Postgres-backed repositories — see `eventLog.ts` header).
 */
export { eventLog } from "./eventLog";
export { ruleEngine } from "./ruleEngine";
export type { Rule, RuleInput } from "./ruleEngine";
export { beliefStore } from "./beliefStore";
export { sourceReliabilityStore } from "./sourceReliabilityStore";
export { forecastCache } from "./forecastCache";
export { generateForecast, backtestForecastCRPS, FORECAST_MODEL_VERSION } from "./metricsIntelligence";
export { runCalibrationCycle } from "./autoCalibrate";
export { ruleHealthMonitor, PSI_MAJOR_DRIFT_THRESHOLD } from "./driftDetection";
