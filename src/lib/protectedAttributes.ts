// Part 09-B: protected attributes are excluded BY CONSTRUCTION, not by
// policy alone. This module is the single source of truth for the banned
// list and the runtime assertion every scoring engine must call before
// building a feature vector. docs/FAIRNESS.md documents the proxy analysis.

/** Protected attributes under applicable anti-discrimination law (non-exhaustive, defense-in-depth). */
export const PROTECTED_ATTRIBUTES = [
  "age",
  "date_of_birth",
  "gender",
  "sex",
  "ethnicity",
  "race",
  "national_origin",
  "religion",
  "disability",
  "health_condition",
  "pregnancy",
  "parental_leave",
  "maternity_leave",
  "paternity_leave",
  "union_status",
  "union_membership",
  "sexual_orientation",
  "marital_status",
  "genetic_information",
  "veteran_status",
  "citizenship",
  "immigration_status",
] as const;

/**
 * Known or suspected proxies that correlate with a protected attribute in
 * this dataset/domain closely enough that they are ALSO excluded from the
 * flight-risk, succession and team-health feature sets, even though each
 * one individually is job-relevant in other contexts. See docs/FAIRNESS.md
 * "Proxy analysis" for the correlation evidence behind each entry.
 */
export const EXCLUDED_PROXY_FIELDS = [
  "name", // can proxy ethnicity/gender via inference
  "home_address",
  "neighborhood",
  "school_name", // can proxy age/class/national origin
  "graduation_year", // strong age proxy
  "photo",
  "voice_sample",
  "accent",
  "first_language",
  "religious_holiday_requests",
  "dependents_count", // can proxy parental/family status
] as const;

export type ProtectedAttribute = (typeof PROTECTED_ATTRIBUTES)[number];
export type ExcludedProxyField = (typeof EXCLUDED_PROXY_FIELDS)[number];

const DENYLIST = new Set<string>([
  ...PROTECTED_ATTRIBUTES,
  ...EXCLUDED_PROXY_FIELDS,
]);

function normalize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Throws if any feature name is, or normalizes to, a protected attribute or
 * declared proxy. Every engine that builds a model feature vector
 * (flightRisk, succession, teamHealth) MUST call this on the final feature
 * name list before scoring. This is the "excluded by construction" assertion
 * required by the standing order; `scripts/test-proxy-exclusion.ts` tests it.
 */
export function assertNoProtectedFeatures(featureNames: string[]): void {
  const offenders = featureNames.filter((raw) => DENYLIST.has(normalize(raw)));
  if (offenders.length > 0) {
    throw new Error(
      `Protected-attribute-or-proxy field(s) [${offenders.join(", ")}] must not be used as model features. ` +
        `See docs/FAIRNESS.md for the exclusion list and proxy analysis.`,
    );
  }
}

/** Allow-listed feature set for the flight-risk model. Anything not in this
 * list cannot be fed to the scorer — this is a closed-world whitelist, not
 * just a denylist, for defense in depth. */
export const FLIGHT_RISK_ALLOWED_FEATURES = [
  "compaRatioBelowBandGap",
  "tenureMonths",
  "daysSinceLastOneOnOne",
  "managerChangedLast90d",
  "teamAttritionRate90d",
  "growthPlanActivityLast180d",
  "commitmentFollowThroughRate",
  "skillStagnationMonths",
  "promotionGapMonthsVsRoleMedian",
] as const;
