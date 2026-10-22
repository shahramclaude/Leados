/**
 * Pre-mortem outcomes contract (Part 23 dependency).
 *
 * PROVENANCE NOTE: Part 23's pre-mortem module is not present in this
 * sandbox snapshot. This module declares the minimal shape this part reads
 * (a named failure mode with a likelihood/severity pair and a link target)
 * and seeds a few illustrative entries so Readiness scoring and the
 * Horizon Radar can show the linkage described in the brief. Replace with
 * the live Part 23 export when available.
 */
export interface PreMortemFinding {
  id: string;
  failureMode: string;
  /** 1 (rare) – 5 (near certain if nothing changes). */
  likelihood: 1 | 2 | 3 | 4 | 5;
  /** 1 (minor) – 5 (existential). */
  severity: 1 | 2 | 3 | 4 | 5;
  linkedScenarioIds: string[];
  authoredAt: string;
}

export const SEED_PREMORTEM_FINDINGS: PreMortemFinding[] = [
  {
    id: "pm-23-002",
    failureMode: "We under-invested in compliance tooling and lost a 9-month sales cycle to an audit-readiness gap.",
    likelihood: 3,
    severity: 4,
    linkedScenarioIds: ["scn-regulatory-clampdown", "scn-fragmented-frontier"],
    authoredAt: "2026-03-01T09:00:00.000Z",
  },
  {
    id: "pm-23-005",
    failureMode: "A bundled competitor offer eroded mid-market pricing power before we repositioned.",
    likelihood: 3,
    severity: 3,
    linkedScenarioIds: ["scn-commoditized-scramble"],
    authoredAt: "2026-03-01T09:10:00.000Z",
  },
];
