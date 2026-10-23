// Seam into Part 50's ecosystem graph.
//
// We deliberately do NOT re-implement or duplicate the ecosystem graph here. `parties.ecosystemNodeId`
// is the join key Part 50 uses; this module is the single place that would call into that graph
// service/module. Until that wiring lands, it returns a small, clearly-labeled local approximation so
// negotiation dossiers (Phase 1/3e) have something to cite — every leverage point returned here is
// tagged with its provenance so the dossier's citation lint (citationLint.ts) can verify it, and so a
// reviewer can tell at a glance this is a seam stub, not verified ecosystem intelligence.

export interface LeveragePoint {
  id: string;
  label: string;
  rationale: string;
  /** Where this fact came from — required for citation lint. */
  provenance: string;
  strength: "low" | "medium" | "high";
}

// Deterministic, clearly-fake-but-structured stand-in data keyed by ecosystemNodeId. Replace the body
// of this function with a call into Part 50's graph query API when that module is wired into this repo.
export function getEcosystemLeveragePoints(ecosystemNodeId: string | null): LeveragePoint[] {
  if (!ecosystemNodeId) {
    return [
      {
        id: "no-ecosystem-link",
        label: "No ecosystem graph link",
        rationale:
          "This party has no ecosystemNodeId set, so Part 50's ecosystem graph has not been consulted for leverage context.",
        provenance: "seam:part50-ecosystem-graph (unresolved join key)",
        strength: "low",
      },
    ];
  }
  // SEAM STUB — deterministic placeholder data, NOT live ecosystem graph output.
  return [
    {
      id: `${ecosystemNodeId}-concentration`,
      label: "Revenue/vendor concentration signal",
      rationale:
        "Part 50's ecosystem graph models this counterparty's dependency concentration; high concentration " +
        "on either side typically increases the other party's negotiating leverage at renewal.",
      provenance: `seam:part50-ecosystem-graph#node=${ecosystemNodeId} (stub — wire to live graph query)`,
      strength: "medium",
    },
    {
      id: `${ecosystemNodeId}-alt-supply`,
      label: "Alternative-supply signal",
      rationale:
        "Part 50's ecosystem graph tracks substitute/alternative counterparties in the same category; " +
        "availability of substitutes shifts leverage toward LEADOS at renewal.",
      provenance: `seam:part50-ecosystem-graph#node=${ecosystemNodeId} (stub — wire to live graph query)`,
      strength: "low",
    },
  ];
}
