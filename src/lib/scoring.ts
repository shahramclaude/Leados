// Rule-based lead scoring, version "rule-v1".
//
// HONEST LIMITATIONS (see docs/explanation.md "Intelligence methodology"):
// - This is a deterministic point-scoring function, not a trained model.
//   There is no ML, no historical-outcome training set, and no calibration
//   step. "Score" means "how many of our stated heuristics this lead
//   matches", nothing more.
// - The rule weights below were chosen by the maintainers as reasonable
//   defaults, not derived from conversion data. Treat them as a starting
//   point to edit (see docs/how-to-guides.md, "Add a scoring rule"), not as
//   a statistically validated model.
// - No protected-class or demographic attributes are collected or used
//   anywhere in this function. See docs/explanation.md "Fairness posture".
export const SCORE_VERSION = "rule-v1";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "disqualified",
  "converted",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "referral",
  "website",
  "event",
  "cold-outreach",
  "unknown",
] as const;

const SOURCE_WEIGHTS: Record<string, number> = {
  referral: 30,
  website: 20,
  event: 15,
  "cold-outreach": 5,
  unknown: 0,
};

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "proton.me",
]);

export interface ScoreInput {
  email: string;
  company?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
  version: string;
}

/**
 * Compute a lead score from 0-100 using transparent, additive rules.
 * Every rule contributes a named entry to `breakdown` so the result can be
 * explained to a human end-to-end — there is no hidden term.
 */
export function computeScore(input: ScoreInput): ScoreResult {
  const breakdown: Record<string, number> = {};

  const sourceKey = (input.source ?? "unknown").toLowerCase();
  breakdown.source = SOURCE_WEIGHTS[sourceKey] ?? SOURCE_WEIGHTS.unknown;

  breakdown.hasCompany = input.company && input.company.trim().length > 0 ? 15 : 0;

  const domain = input.email.split("@")[1]?.toLowerCase().trim();
  breakdown.workEmailDomain = domain && !FREE_EMAIL_DOMAINS.has(domain) ? 20 : 0;

  breakdown.hasContext = input.notes && input.notes.trim().length >= 10 ? 10 : 0;

  // Small bonus for a company name that also appears in the email domain
  // (weak proxy for "this is a real B2B inquiry, not a throwaway address").
  if (input.company && domain) {
    const normalizedCompany = input.company.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedDomain = domain.replace(/[^a-z0-9]/g, "");
    breakdown.domainMatchesCompany =
      normalizedCompany.length > 2 && normalizedDomain.includes(normalizedCompany) ? 10 : 0;
  } else {
    breakdown.domainMatchesCompany = 0;
  }

  const raw = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const score = Math.max(0, Math.min(100, raw));

  return { score, breakdown, version: SCORE_VERSION };
}

export function isValidStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
