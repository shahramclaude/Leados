// js/autonomous.js (requested module) -> src/lib/autonomous.ts.
// An "autonomous monitor" that re-runs inference on a timer, compares findings
// against the previous tick, and escalates anything that persists. This is a
// disclosed simulation: it runs setInterval in the browser tab, it is not a
// server-side/cron process, and it stops when the tab/component unmounts.

import type { AppState, AutonomousLogEntry, Finding } from "./types";
import { runInference } from "./inference";

export interface AutonomousTickResult {
  findings: Finding[];
  log: AutonomousLogEntry;
}

/** Run one monitoring tick: infer findings, diff against prior findings, log the delta. */
export function runTick(state: AppState, previousFindings: Finding[]): AutonomousTickResult {
  const findings = runInference(state.signalBoard);
  const prevIds = new Set(previousFindings.map((f) => f.id));
  const newFindings = findings.filter((f) => !prevIds.has(f.id)).length;
  const persisted = findings.filter((f) => prevIds.has(f.id) && f.severity === "high");
  const tick = state.autonomousTick + 1;
  const log: AutonomousLogEntry = {
    tick,
    at: Date.now(),
    newFindings,
    escalations: persisted.length,
    summary:
      findings.length === 0
        ? "No active findings this tick."
        : `${findings.length} active finding(s); ${newFindings} new; ${persisted.length} persisting at high severity.`,
  };
  return { findings, log };
}

export type AutonomousListener = (result: AutonomousTickResult) => void;

/**
 * Start a browser-timer-driven monitor loop. Returns a stop function.
 * Disclosed limitation: this only runs while the page is open; it is a
 * client-side simulation of "autonomous," not a background service.
 */
export function startAutonomousMonitor(
  getState: () => AppState,
  getPreviousFindings: () => Finding[],
  onTick: AutonomousListener,
  intervalMs = 8000,
): () => void {
  const id = window.setInterval(() => {
    const result = runTick(getState(), getPreviousFindings());
    onTick(result);
  }, intervalMs);
  return () => window.clearInterval(id);
}
