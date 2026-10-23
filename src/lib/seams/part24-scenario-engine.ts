// SEAM ADAPTER — Part 24 (Scenario / War-Game Engine)
//
// STATUS: not present in this repo snapshot. Contagion stress scenarios are
// specified to "run through ... Part 24's scenario ensemble". This adapter
// defines the assumed contract (an ensemble reconciliation step that takes a
// single contagion run and cross-checks it against a broader set of
// strategic scenarios) and ships a conservative local stand-in so Part 50's
// pipeline is fully wired end-to-end today. `ensembleReconciled` on
// `contagion_runs` records whether a real Part 24 reconciliation happened —
// it is always `false` until Part 24 is integrated, which is the honest
// signal to display in the UI.

export interface EnsembleReconciliationResult {
  reconciled: boolean;
  note: string;
}

/**
 * Local stand-in. A real Part 24 integration would replay the contagion
 * seed scenario against its strategic-scenario ensemble and return whether
 * the exposure estimate is consistent with other ensemble members. Because
 * that engine isn't available here, we explicitly return `reconciled: false`
 * rather than fabricating agreement.
 */
export function reconcileWithScenarioEnsemble(): EnsembleReconciliationResult {
  return {
    reconciled: false,
    note: "Part 24 scenario ensemble not available in this build — contagion output is reported standalone, not cross-validated.",
  };
}
