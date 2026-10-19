/**
 * /health.ts (project root) — BACKWARD-COMPATIBILITY SHIM.
 * Real implementation lives in `src/lib/health.ts`, which adds
 * T_RULE_ENGINE_ALL_WIRED, T_CAUSAL_INFERENCE_STABLE,
 * T_BRAIN_PROJECTION_PURE, and T_BRAIN_DELTA_SYMMETRIC to the suite.
 */

export { runHealthSuite } from "@/lib/health";
export type { HealthCheck } from "@/lib/health";
