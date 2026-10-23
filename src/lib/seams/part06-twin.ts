// SEAM ADAPTER — Part 06 (Digital Twin)
//
// STATUS: not present in this repo snapshot. Stress scenarios are specified
// to run "through Part 06's twin". This adapter defines the assumed contract
// (the twin would simulate how the org's own operations respond to an
// upstream/downstream shock) and a local stand-in that is explicit about not
// having twin-grade fidelity. `twinValidated` on `contagion_runs` records
// whether a real Part 06 pass happened — always `false` here, which the UI
// surfaces honestly instead of implying operational-twin-grade confidence.

export interface TwinValidationResult {
  validated: boolean;
  note: string;
}

export function validateAgainstTwin(): TwinValidationResult {
  return {
    validated: false,
    note: "Part 06 digital twin not available in this build — exposure scores are network-model estimates only, not twin-validated operational impact.",
  };
}
