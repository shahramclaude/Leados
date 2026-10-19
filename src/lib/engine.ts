/**
 * src/lib/engine.ts — BACKWARD-COMPATIBILITY SHIM.
 *
 * All real logic now lives in `src/lib/eventBrain.ts` (project/run/
 * projectAt/delta/replay) which is the single place events are folded
 * into state for both the UI and every API route. This file exists only
 * so any code importing the historical `engine.ts` entry point (its
 * `project`, `run`, `DECAY` exports) keeps working unchanged.
 */

export {
  project,
  run,
  projectAt,
  delta,
  replay,
  eventBrain,
  DECAY,
  CORRELATION_WINDOW_DAYS,
  DECISION_MAX_OPEN_DAYS,
} from "./eventBrain";
