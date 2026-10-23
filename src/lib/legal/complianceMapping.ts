// Clause-type -> regulatory-obligation mapping table (Phase 1 "Compliance mapping").
//
// This mirrors Part 29's jurisdiction-tag vocabulary. The mapping itself is a documented, human-owned
// judgment call (NOT inferred automatically) — each row records who documented it and remains
// `revisable`. This table is a starting point, not a compliance certification: see the disclaimer in
// clauseTypes.ts and the Phase 5 answer in AI-SESSION-LOG.md about false confidence.

import type { ClauseType } from "./clauseTypes";

export interface ComplianceMappingSeed {
  clauseType: ClauseType;
  jurisdiction: string;
  regulatoryObligation: string;
  provenanceNote: string;
  documentedBy: string;
  revisable: boolean;
}

export const COMPLIANCE_MAPPING_SEED: ComplianceMappingSeed[] = [
  {
    clauseType: "data_protection",
    jurisdiction: "EU",
    regulatoryObligation: "GDPR Art. 28 — processor obligations for data processing agreements",
    provenanceNote:
      "Documented by Legal Ops from outside counsel memo (2024 DPA refresh). Revisit if GDPR guidance changes.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "data_protection",
    jurisdiction: "US-CA",
    regulatoryObligation: "CCPA/CPRA service-provider contract terms",
    provenanceNote: "Documented by Legal Ops aligning template DPA language with CPRA Sec. 1798.140.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "sla",
    jurisdiction: "US",
    regulatoryObligation: "No direct statutory mapping — internal vendor-risk control only",
    provenanceNote: "Documented to make explicit that SLA clauses are operational, not regulatory, obligations.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "indemnity",
    jurisdiction: "US-DE",
    regulatoryObligation: "Delaware common-law contract enforceability baseline (no statutory trigger)",
    provenanceNote: "Documented by Legal Ops; informational only, confirm with counsel per deal.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "change_of_control",
    jurisdiction: "US",
    regulatoryObligation: "Potential HSR Act filing trigger review for qualifying M&A (seam to Part 54)",
    provenanceNote: "Documented by Legal Ops as a flag-for-counsel trigger, not an automatic filing determination.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "liability_cap",
    jurisdiction: "US",
    regulatoryObligation: "No direct statutory mapping — commercial risk-allocation term",
    provenanceNote: "Documented to clarify liability caps are negotiated terms, not regulatory requirements.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "termination",
    jurisdiction: "EU",
    regulatoryObligation: "Member-state notice-period conventions vary; confirm locally before relying on template notice",
    provenanceNote: "Documented by Legal Ops as a reminder to localize; no single EU-wide rule exists.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
  {
    clauseType: "renewal",
    jurisdiction: "US-CA",
    regulatoryObligation: "California Business & Professions Code auto-renewal notice requirements (context-dependent)",
    provenanceNote: "Documented by Legal Ops as a flag; applicability depends on contract counterparty type.",
    documentedBy: "legal-ops-seed",
    revisable: true,
  },
];
