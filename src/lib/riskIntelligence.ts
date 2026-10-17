// src/lib/riskIntelligence.ts — unified 8-category risk register.
//
// PROVENANCE: same note as casEngine.ts. The pasted "pt-L" brief claims a
// `js/risk_intelligence.js` module already exists; no such file, export, or
// string (`riskIntelligence`, `buildRiskRegister`, `_detectCrossRiskAmplification`,
// `AUSTERITY_TRAP`, `TRUST_COLLAPSE`) was found anywhere in the real repo
// this session. Original implementation, built to satisfy the brief's
// *described behavior*, not a port of unverified code.
import { CATEGORIES } from "./types";
import type { Category, Finding } from "./types";

export type RiskStatus = "CLEAR" | "WATCH" | "ELEVATED" | "CRITICAL";

export interface CategoryRisk {
  category: Category;
  status: RiskStatus;
  score: number; // 0-100
  findingCount: number;
  maxSev: number;
}

function statusFor(score: number): RiskStatus {
  if (score === 0) return "CLEAR";
  if (score < 35) return "WATCH";
  if (score < 70) return "ELEVATED";
  return "CRITICAL";
}

export interface RiskRegister {
  categories: CategoryRisk[];
  overallRisk: number;
}

/** Builds one risk row per category (all 8 always represented, even with 0 findings). */
export function buildRiskRegister(findings: Finding[]): RiskRegister {
  const real = findings.filter((f) => f.polarity !== "positive");
  const categories: CategoryRisk[] = CATEGORIES.map((category) => {
    const inCat = real.filter((f) => f.category === category);
    const maxSev = inCat.reduce((m, f) => Math.max(m, f.sev), 0);
    // score: weighted by count and severity, capped at 100
    const score = Math.min(100, inCat.reduce((s, f) => s + f.sev * 8, 0));
    return { category, status: statusFor(score), score, findingCount: inCat.length, maxSev };
  });
  const overallRisk = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);
  return { categories, overallRisk };
}

export interface Amplification {
  id: string;
  label: string;
  categories: Category[];
  sev: number;
  detail: string;
}

/** Cross-category amplification: specific pairs of simultaneously-elevated
 * categories are worse together than the sum of their parts. */
export function detectCrossRiskAmplification(register: RiskRegister): Amplification[] {
  const active = (cat: Category) => {
    const row = register.categories.find((c) => c.category === cat)!;
    return row.status !== "CLEAR";
  };
  const out: Amplification[] = [];

  if (active("FINANCIAL") && active("PEOPLE")) {
    out.push({
      id: "AUSTERITY_TRAP",
      label: "Austerity trap",
      categories: ["FINANCIAL", "PEOPLE"],
      sev: 4,
      detail: "Financial pressure and people risk are both active: cost cuts under runway pressure tend to raise attrition/burnout risk, which raises delivery risk, which raises financial pressure further.",
    });
  }

  if (active("GOVERNANCE") && active("REPUTATIONAL")) {
    out.push({
      id: "TRUST_COLLAPSE",
      label: "Trust collapse",
      categories: ["GOVERNANCE", "REPUTATIONAL"],
      sev: 5, // always severity 5 by definition when both are active
      detail: "Governance and reputational risk compound: a compliance or governance failure that becomes public is categorically worse than either risk alone — always scored at maximum severity.",
    });
  }

  if (active("STRATEGIC") && active("OPERATIONAL")) {
    out.push({
      id: "EXECUTION_STRATEGY_GAP",
      label: "Execution–strategy gap",
      categories: ["STRATEGIC", "OPERATIONAL"],
      sev: 4,
      detail: "Strategic uncertainty and operational friction together mean the organization can neither commit to a direction nor execute reliably on the current one.",
    });
  }

  return out;
}
