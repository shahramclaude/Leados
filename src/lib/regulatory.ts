// Regulatory Intelligence — original TypeScript implementing the functional ideas
// in the task's pasted "Part 6" brief (obligation registry, exposure scoring,
// cross-jurisdiction conflict detection). Unverified external spec — no
// "reg.jurisdiction"/"regulatory" module was found in github.com/wbweve/Leados.
import type { AppState } from "./types";
import { daysBetween } from "./store";

export const regulatory = {
  buildObligationRegistry(P: AppState, today: Date) {
    const jurisdictions = P.events.filter((e) => e.type === "reg.jurisdiction");
    const interpretations = P.events.filter((e) => e.type === "reg.interpretation");
    const checks = P.events.filter((e) => e.type === "legal.compliance.check");

    return jurisdictions
      .map((j) => {
        const jd = j.data;
        const jInterps = interpretations.filter((i) => i.data.jurisdiction === jd.name);
        const jChecks = checks.filter((c) => c.data.jurisdiction === jd.name);
        const frameworks: string[] = jd.relevantFrameworks || [];
        const interpretedFrameworks = frameworks.filter((fw) => jInterps.some((i) => i.data.framework === fw));
        const completeness = frameworks.length ? Math.round((interpretedFrameworks.length / frameworks.length) * 100) : null;

        const reviewed = jInterps.filter((i) => i.data.legalCounselReviewed).length;
        const reviewCoverage = jInterps.length ? Math.round((reviewed / jInterps.length) * 100) : null;

        const lastCheck = [...jChecks].sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
        const daysSinceCheck = lastCheck ? daysBetween(lastCheck.ts, today) : null;

        const exposure = Math.round(
          (completeness !== null ? (100 - completeness) * 0.4 : 40) +
            (reviewCoverage !== null ? (100 - reviewCoverage) * 0.3 : 30) +
            (daysSinceCheck !== null ? Math.min(30, daysSinceCheck / 10) : 30)
        );

        return {
          jurisdiction: jd.name, region: jd.region, frameworks, completeness, reviewCoverage, daysSinceCheck,
          exposure, exposureLevel: exposure >= 70 ? "HIGH" : exposure >= 40 ? "ELEVATED" : "MANAGED",
          gaps: frameworks.filter((fw) => !interpretedFrameworks.includes(fw)),
          unreviewed: jInterps.filter((i) => !i.data.legalCounselReviewed),
          label: `${jd.name}: ${exposure} exposure score. ${completeness ?? 0}% framework coverage. ${reviewCoverage ?? 0}% legal review coverage.`,
        };
      })
      .sort((a, b) => b.exposure - a.exposure);
  },

  detectCrossJurisdictionConflicts(P: AppState) {
    const interpretations = P.events.filter((e) => e.type === "reg.interpretation");
    const byFramework: Record<string, typeof interpretations> = {};
    interpretations.forEach((i) => {
      if (!byFramework[i.data.framework]) byFramework[i.data.framework] = [];
      byFramework[i.data.framework].push(i);
    });

    const conflicts: any[] = [];
    Object.entries(byFramework).forEach(([framework, interps]) => {
      if (interps.length < 2) return;
      const unique = new Set(interps.map((i) => i.data.ourInterpretation));
      if (unique.size > 1) {
        conflicts.push({
          framework,
          jurisdictions: interps.map((i) => i.data.jurisdiction),
          interpretations: interps.map((i) => ({
            jurisdiction: i.data.jurisdiction, interpretation: i.data.ourInterpretation, reviewed: i.data.legalCounselReviewed,
          })),
          severity: "HIGH",
          note: "Same framework interpreted differently across jurisdictions — compliance inconsistency, legal review required.",
        });
      }
    });

    return { conflicts, label: `${conflicts.length} cross-jurisdiction interpretation conflict(s) detected.` };
  },
};
