/**
 * index.ts — barrel export for the pure domain layer of the intelligence
 * subsystem. UI and eval-harness code should generally prefer importing
 * from here or from `src/lib/platform/intelligence/index.ts` rather than
 * reaching into individual files.
 */
export * from "./types";
export * from "./stats";
export * from "./prng";
export * from "./bayesian";
export * from "./beliefFabric";
export * from "./explain";
export * from "./ruleTypes";
export * from "./ruleCalibration";
export * from "./signalFusion";
export * from "./monteCarlo";
export * from "./sourceReliability";
export * from "./explainAdapters";
