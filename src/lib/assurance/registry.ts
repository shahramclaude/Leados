// src/lib/assurance/registry.ts
//
// Assurance registry (Part 38 surface) reconstructed for Part 41. Lists the
// controls that keep adaptation honest, each pointing at the test that
// verifies it. Surfaced in the Adaptation Transparency Panel's coverage
// table and used to drive the "every adaptation class is explained" gate.

export type AssuranceStatus = "enforced" | "monitored";

export interface AssuranceControl {
  id: string;
  title: string;
  description: string;
  status: AssuranceStatus;
  verifiedBy: string;
}

export const ADAPTATION_ASSURANCE_REGISTRY: AssuranceControl[] = [
  {
    id: "content-parity",
    title: "Content parity",
    description: "Every user sees every material fact, regardless of adaptation state — adaptation changes form, not substance.",
    status: "enforced",
    verifiedBy: "tests/presentationAdapter.contentParity.test.ts",
  },
  {
    id: "manipulation-guard",
    title: "Manipulation guard",
    description: "Emphasis/sequence adaptations are screened for banned dark patterns before they may render.",
    status: "enforced",
    verifiedBy: "tests/manipulationGuard.test.ts",
  },
  {
    id: "transparency-coverage",
    title: "Transparency coverage",
    description: "Every adaptation class (presentation/emphasis/sequence) is explained in the transparency panel, even when unused.",
    status: "enforced",
    verifiedBy: "tests/transparencyCoverage.test.ts",
  },
  {
    id: "expertise-model-properties",
    title: "Expertise model properties",
    description: "Expertise scores are monotone in usage and decay over inactivity; never used to select content.",
    status: "enforced",
    verifiedBy: "tests/familiarity.property.test.ts",
  },
  {
    id: "reset-pause-one-interaction",
    title: "Reset/pause restores default in one interaction",
    description: "Reset-to-default and pause-adaptation both restore the neutral default view in a single user action.",
    status: "enforced",
    verifiedBy: "tests/resetPause.test.ts",
  },
];

export function controlById(id: string): AssuranceControl | undefined {
  return ADAPTATION_ASSURANCE_REGISTRY.find((c) => c.id === id);
}
