// Shared governance domain types for Part 55.

/** All recognised board-tier access scopes. Board materials are among the
 * most sensitive data in the system, so this list is the single source of
 * truth for every access decision in access.ts. */
export const BOARD_TIERS = [
  "chair",
  "director",
  "company_secretary",
  "audit_committee_chair",
  "audit_committee",
  "risk_committee",
  "compensation_committee",
  "management",
  "external_auditor",
  "observer",
] as const;

export type BoardTier = (typeof BOARD_TIERS)[number];

export const MANDATORY_PACK_SECTIONS = [
  "financial_highlights",
  "risk_and_controls", // Part 29
  "compliance_attestations",
  "minutes_prior_meeting",
  "resolutions_proposed",
] as const;

export type MandatorySectionType = (typeof MANDATORY_PACK_SECTIONS)[number];

export const RESOLUTION_TYPES = ["advisory", "binding"] as const;
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];

export const VOTE_VALUES = ["for", "against", "abstain", "recused"] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

/** Grace period before an un-implemented resolution is flagged. */
export const IMPLEMENTATION_LINK_GRACE_DAYS = 7;

/** Default oversight milestone horizon after a resolution passes. */
export const DEFAULT_OVERSIGHT_HORIZON_DAYS = 90;
