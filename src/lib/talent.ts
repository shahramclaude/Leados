// Talent Architecture — original TypeScript implementing the functional ideas
// in the task's pasted "Part 4" brief (succession depth map, capability gaps,
// autonomous headcount recommendation). Treated as an unverified external spec —
// no "talent" module of any kind exists in github.com/wbweve/Leados as of this
// session's inspection (see AI-SESSION-LOG.md §Verification).
import type { AppState, Person } from "./types";
import { financialOS } from "./financialOS";

export type SuccessionCandidate = {
  person?: Person;
  readiness: "ready_now" | "1_year" | "2_year";
  strengths: string[];
  gaps: string[];
  capabilities: Record<string, number>;
};

export const talent = {
  buildSuccessionMap(P: AppState) {
    const peopleById = Object.fromEntries(P.people.map((p) => [p.id, p]));
    const candidates = P.events.filter((e) => e.type === "talent.succession.candidate");
    const assessments = P.events.filter((e) => e.type === "talent.capability.assessment");

    const byRole: Record<string, { readyNow: SuccessionCandidate[]; oneYear: SuccessionCandidate[]; twoYear: SuccessionCandidate[] }> = {};
    candidates.forEach((c) => {
      const roleId = c.data.targetRoleId;
      if (!byRole[roleId]) byRole[roleId] = { readyNow: [], oneYear: [], twoYear: [] };
      const person = peopleById[c.data.personId];
      const personAssessments = assessments.filter((a) => a.data.personId === c.data.personId);
      const candidate: SuccessionCandidate = {
        person, readiness: c.data.readiness, strengths: c.data.strengths || [], gaps: c.data.gaps || [],
        capabilities: personAssessments.reduce((acc: Record<string, number>, a) => {
          acc[a.data.capability] = a.data.level;
          return acc;
        }, {}),
      };
      if (c.data.readiness === "ready_now") byRole[roleId].readyNow.push(candidate);
      else if (c.data.readiness === "1_year") byRole[roleId].oneYear.push(candidate);
      else byRole[roleId].twoYear.push(candidate);
    });

    const directReports = P.people.filter((p) => p.isDirect && !p.archived);
    const criticalRoles = Array.from(new Set(directReports.map((d) => d.role)));
    const gaps = criticalRoles.filter((role) => !byRole[role] || byRole[role].readyNow.length === 0);

    const coveredRoles = criticalRoles.filter((role) => (byRole[role]?.readyNow.length ?? 0) > 0);
    const benchStrength = criticalRoles.length ? Math.round((coveredRoles.length / criticalRoles.length) * 100) : null;

    const criticalVacancyRisk = gaps.filter(
      (role) => P.people.filter((p) => p.role === role && !p.archived).length === 1
    );

    return {
      successionMap: byRole,
      criticalRoles,
      gaps,
      benchStrength,
      criticalVacancyRisk,
      label:
        `Succession map from talent.succession.candidate events. Bench strength: ${benchStrength}% ` +
        `(${coveredRoles.length}/${criticalRoles.length} critical roles covered). ` +
        `Labeled: self-reported readiness, not a validated assessment.`,
    };
  },

  buildCapabilityGap(P: AppState) {
    const peopleById = Object.fromEntries(P.people.map((p) => [p.id, p]));
    const assessments = P.events.filter((e) => e.type === "talent.capability.assessment");
    const headcountPlans = P.events.filter((e) => e.type === "talent.headcount.plan");

    const inventory: Record<string, { people: { personId: string; level: number; person?: Person }[]; mean: number; max: number }> = {};
    assessments.forEach((a) => {
      const cap = a.data.capability;
      if (!inventory[cap]) inventory[cap] = { people: [], mean: 0, max: 0 };
      inventory[cap].people.push({ personId: a.data.personId, level: a.data.level, person: peopleById[a.data.personId] });
    });
    Object.values(inventory).forEach((cap) => {
      cap.mean = cap.people.length ? cap.people.reduce((a, p) => a + p.level, 0) / cap.people.length : 0;
      cap.max = cap.people.length ? Math.max(...cap.people.map((p) => p.level)) : 0;
    });

    const required: Record<string, number> = {};
    const priorities: Record<string, string> = {};
    headcountPlans.forEach((plan) => {
      const { capability, level, priority } = plan.data;
      if (capability && level) {
        required[capability] = Math.max(required[capability] || 0, level);
        priorities[capability] = priority;
      }
    });

    const gaps = Object.entries(required)
      .map(([cap, reqLevel]) => {
        const current = inventory[cap];
        const currentMax = current?.max || 0;
        const gap = Math.max(0, reqLevel - currentMax);
        return {
          capability: cap, required: reqLevel, currentMax, gap, priority: priorities[cap],
          hasCoverage: currentMax >= reqLevel,
          coverage: current?.people.filter((p) => p.level >= reqLevel).map((p) => p.person) || [],
        };
      })
      .sort((a, b) => b.gap - a.gap);

    return {
      inventory, gaps, criticalGaps: gaps.filter((g) => g.gap >= 2),
      label:
        "Capability gap analysis from talent.capability.assessment vs talent.headcount.plan events. " +
        "Gap = required_level − current_max_level. Labeled: assessments are self/manager-reported, not validated.",
    };
  },

  buildHeadcountRecommendation(P: AppState, _today: Date) {
    const capGaps = this.buildCapabilityGap(P);
    const successionMap = this.buildSuccessionMap(P);
    const runway = financialOS.runwayStatus(P);

    const recommendations: any[] = [];
    capGaps.criticalGaps.forEach((gap) => {
      recommendations.push({
        type: "HIRE",
        rationale:
          `Capability gap: ${gap.capability} (required level ${gap.required}, current max ${gap.currentMax}). ` +
          `No internal candidate covers this gap.`,
        priority: gap.gap >= 3 ? "CRITICAL" : "HIGH",
        capability: gap.capability,
        urgency: gap.gap >= 3 ? "Q1" : "Q2",
        financialConstraint:
          runway && runway.runway_months < 9 ? "CAUTION: runway < 9 months. Prioritize only CRITICAL gaps." : null,
      });
    });

    successionMap.criticalVacancyRisk.forEach((role) => {
      recommendations.push({
        type: "DEVELOP_OR_HIRE",
        rationale: `Succession gap: ${role} has no ready-now successor. A vacancy here is not coverable without a hire.`,
        priority: "HIGH", role, urgency: "Q2",
        alternative: "Identify a 1-year-ready internal candidate and accelerate development.",
      });
    });

    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    return {
      recommendations: recommendations.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority)),
      financialContext: runway
        ? {
            runwayMonths: runway.runway_months,
            headcountBudgetSafe: runway.runway_months >= 18 ? "YES" : runway.runway_months >= 12 ? "LIMITED" : "NO",
          }
        : null,
      note:
        "The pasted brief also cross-references a velocity-decline signal (its rule R73) to recommend " +
        "capacity hires. That requires an execution/ticket-velocity engine not included in this session's " +
        "pasted text, so it is omitted here rather than fabricated (disclosed gap).",
      label:
        "Headcount recommendations from capability gaps + succession gaps + financial runway. " +
        "All require human review and financial approval.",
    };
  },
};
