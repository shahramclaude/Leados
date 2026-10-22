// src/lib/platform/mdm/matchRules.ts
//
// Entity-resolution match scoring. Weighted-rule composite in [0,1]. Rules
// and weights are intentionally conservative: a match on name/company alone
// can NEVER reach the auto-merge threshold (see resolve.ts), because two
// different real people can easily share a name and employer.
import type { NormalizedLead } from "../types";
import { normalizeEmail, normalizePhone, normalizeName, stringSimilarity } from "../normalize";

export interface MatchRuleResult {
  rule: "email_exact" | "phone_exact" | "name_similarity" | "company_similarity";
  weight: number;
  contribution: number;
  detail: string;
}

export interface MatchScore {
  score: number; // 0..1
  emailExact: boolean;
  rules: MatchRuleResult[];
}

const WEIGHTS = {
  emailExact: 0.5,
  phoneExact: 0.3,
  nameSimilarity: 0.15,
  companySimilarity: 0.05,
};

export function scoreMatch(a: NormalizedLead, b: NormalizedLead): MatchScore {
  const rules: MatchRuleResult[] = [];

  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  const emailExact = !!emailA && !!emailB && emailA === emailB;
  rules.push({
    rule: "email_exact",
    weight: WEIGHTS.emailExact,
    contribution: emailExact ? WEIGHTS.emailExact : 0,
    detail: emailExact ? `Exact email match (${emailA})` : "Emails differ or missing",
  });

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  const phoneExact = !!phoneA && !!phoneB && phoneA === phoneB;
  rules.push({
    rule: "phone_exact",
    weight: WEIGHTS.phoneExact,
    contribution: phoneExact ? WEIGHTS.phoneExact : 0,
    detail: phoneExact ? `Exact phone match (${phoneA})` : "Phones differ or missing",
  });

  const nameA = normalizeName(a.fullName);
  const nameB = normalizeName(b.fullName);
  const nameSim = nameA && nameB ? stringSimilarity(nameA, nameB) : 0;
  rules.push({
    rule: "name_similarity",
    weight: WEIGHTS.nameSimilarity,
    contribution: nameSim * WEIGHTS.nameSimilarity,
    detail: `Name similarity ${(nameSim * 100).toFixed(0)}% (${a.fullName ?? "—"} vs ${b.fullName ?? "—"})`,
  });

  const companySim = a.company && b.company ? stringSimilarity(a.company, b.company) : 0;
  rules.push({
    rule: "company_similarity",
    weight: WEIGHTS.companySimilarity,
    contribution: companySim * WEIGHTS.companySimilarity,
    detail: `Company similarity ${(companySim * 100).toFixed(0)}% (${a.company ?? "—"} vs ${b.company ?? "—"})`,
  });

  const score = Math.min(1, rules.reduce((sum, r) => sum + r.contribution, 0));
  return { score, emailExact, rules };
}
