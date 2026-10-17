// Unified 8-category risk register + cross-category amplification.
// Original implementation for this delivery.
import { CATEGORIES } from "./types";
import type { Category, Finding } from "./types";

export type RiskStatus = "CLEAR" | "WATCH" | "ELEVATED" | "CRITICAL";

export interface CategoryRisk {
  category: Category;
  status: RiskStatus;
  score: number; // 0-100, derived from severity-weighted finding count
  findingCount: number;
  maxSeverity: number;
}

function statusFor(score: number): RiskStatus {
  if (score === 0) return "CLEAR";
  if (score < 25) return "WATCH";
  if (score < 60) return "ELEVATED";
  return "CRITICAL";
}

export interface Amplification {
  id: string;
  label: string;
  categories: Category[];
  detail: string;
}

export interface RiskRegister {
  categories: CategoryRisk[];
  amplifications: Amplification[];
  overallScore: number;
}

export function buildRiskRegister(findings: Finding[]): RiskRegister {
  const categories: CategoryRisk[] = CATEGORIES.map((category) => {
    const inCat = findings.filter((f) => f.category === category);
    const weighted = inCat.reduce((sum, f) => sum + Math.pow(2, f.severity - 1), 0); // 1,2,4,8
    const score = Math.min(100, Math.round(weighted * 6));
    return {
      category,
      status: statusFor(score),
      score,
      findingCount: inCat.length,
      maxSeverity: inCat.reduce((m, f) => Math.max(m, f.severity), 0),
    };
  });

  const amplifications: Amplification[] = [];
  const has = (id: string) => findings.some((f) => f.ruleId === id);

  if (has("R8") && has("R15")) {
    amplifications.push({
      id: "FIN_DELIVERY_AMP",
      label: "Financial pressure amplifying delivery risk",
      categories: ["Finance", "Delivery"],
      detail: "Low runway (R8) combined with declining velocity (R15) compounds both categories' risk simultaneously.",
    });
  }
  if (has("R7") && has("R40")) {
    amplifications.push({
      id: "PEOPLE_CULTURE_AMP",
      label: "Burnout amplifying culture risk",
      categories: ["People", "Culture"],
      detail: "A burnout signal (R7) alongside a psychological-safety dip (R40) suggests one person's strain is becoming a team-level culture issue.",
    });
  }
  if (has("R17") && has("R46")) {
    amplifications.push({
      id: "DELIVERY_SECURITY_AMP",
      label: "Delivery instability amplifying security exposure",
      categories: ["Delivery", "Security"],
      detail: "Recurring incidents (R17) alongside an unpatched-CVE backlog (R46) suggest operational instability is widening the security attack surface.",
    });
  }
  if (has("R34") && has("R38")) {
    amplifications.push({
      id: "PRODUCT_STRATEGY_AMP",
      label: "Product signals amplifying strategic risk",
      categories: ["Product", "Strategy"],
      detail: "Churn uptick (R34) and NPS decline (R38) together suggest the current strategic bet may be losing market fit, not just a local product issue.",
    });
  }

  const overallScore = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);

  return { categories, amplifications, overallScore };
}

// Disclosed gap: "cultural bifurcation" scoring (a hypothetical scoreCulture()
// helper) is intentionally not implemented here. No verified or specified
// definition for it exists in anything inspected for this delivery — see
// AI-SESSION-LOG.md and the in-app About / Provenance page. Inventing one
// would misattribute invented behavior to a "verified" source.
export const CULTURAL_BIFURCATION_IMPLEMENTED = false;
