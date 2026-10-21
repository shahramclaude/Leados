// Part 09-H: one Team Health surface combining engagement, workload,
// velocity, quality and risk into a 5-axis radar, with drill-downs and
// recommendations sourced from the Part 11 playbooks seam. Every number is
// wrapped in Explain<T>; every recommendation carries evidence, expected
// effect and uncertainty per Part 05's causal-language rules.

import { db } from "@/db";
import { people, growthPlans } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Explain } from "./explain";
import { type Actor, canReadTeamAggregate, assertAccess } from "./accessControl";
import { buildFlightRiskFeatures, computeFlightRisk } from "./flightRisk";
import { followThroughScore } from "./oneOnOne";
import { teamSkillGapAnalysis } from "./skillsGraph";
import { collaborationLoad } from "./orgNetwork";
import { recommendInterventions, type Intervention } from "./playbooksSeam";

export type RadarDimension = "engagement" | "workload" | "velocity" | "quality" | "risk";

export interface TeamHealthRadar {
  teamId: string;
  axes: Record<RadarDimension, Explain<number>>; // 0-100, higher = healthier, for every axis
  recommendations: Intervention[];
  asOf: string;
}

function clamp01to100(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)));
}

export async function computeTeamHealth(actor: Actor, teamId: string): Promise<TeamHealthRadar> {
  assertAccess(canReadTeamAggregate(actor), `actor ${actor.id} may not read team health for ${teamId}`);

  const members = await db.select().from(people).where(eq(people.teamId, teamId));
  const asOf = new Date();

  // Engagement: 1:1 cadence adherence + commitment follow-through (metadata only).
  let cadenceScoreSum = 0;
  let followThroughSum = 0;
  for (const m of members) {
    const { features } = await buildFlightRiskFeatures(m.id, asOf);
    cadenceScoreSum += Math.max(0, 1 - features.daysSinceLastOneOnOne / 90);
    const ft = await followThroughScore(m.id);
    followThroughSum += ft.rate.value;
  }
  const n = Math.max(1, members.length);
  const engagementValue = clamp01to100(((cadenceScoreSum / n) * 0.5 + (followThroughSum / n) * 0.5) * 100);

  // Workload: inverse of estimated weekly meeting minutes vs. an 8h/week reference.
  const loads = members.length ? await collaborationLoad(actor, teamId) : [];
  const avgMinutes = loads.length ? loads.reduce((s, l) => s + l.estimatedWeeklyMeetingMinutes, 0) / loads.length : 0;
  const workloadValue = clamp01to100(100 - (avgMinutes / 480) * 100);

  // Velocity: growth-plan milestone completion rate across the team.
  let totalMilestones = 0;
  let doneMilestones = 0;
  for (const m of members) {
    const plans = await db.select().from(growthPlans).where(eq(growthPlans.personId, m.id));
    for (const p of plans) {
      const milestones = p.milestonesJson as { status: string }[];
      totalMilestones += milestones.length;
      doneMilestones += milestones.filter((ms) => ms.status === "done").length;
    }
  }
  const velocityValue = clamp01to100(totalMilestones > 0 ? (doneMilestones / totalMilestones) * 100 : 50);

  // Quality (proxy): skill-coverage against role requirements. Documented as
  // a capability proxy, NOT a defect/incident quality metric (none logged).
  const gaps = await teamSkillGapAnalysis(actor, teamId);
  const avgGapRatio = gaps.length
    ? gaps.reduce((s, g) => s + g.gap / Math.max(1, g.requiredLevel), 0) / gaps.length
    : 0;
  const qualityValue = clamp01to100((1 - avgGapRatio) * 100);

  // Risk: inverse of average modeled flight-risk probability across the team.
  let riskSum = 0;
  for (const m of members) {
    const { features, observationCount } = await buildFlightRiskFeatures(m.id, asOf);
    const explain = computeFlightRisk(features, { asOf, observationCount });
    riskSum += explain.value;
  }
  const avgRisk = members.length ? riskSum / members.length : 0;
  const riskValue = clamp01to100((1 - avgRisk) * 100);

  const axes: Record<RadarDimension, Explain<number>> = {
    engagement: {
      value: engagementValue,
      method: "50% 1:1-cadence adherence (vs. 90-day reference) + 50% average commitment follow-through rate.",
      inputs: ["daysSinceLastOneOnOne", "commitmentFollowThroughRate"],
      uncertaintyNote: "Metadata proxy for engagement; does not measure sentiment or morale directly.",
      lawfulPurpose: "Team support planning.",
      asOf: asOf.toISOString(),
    },
    workload: {
      value: workloadValue,
      method: "Inverse of average estimated weekly meeting minutes vs. an 8-hour/week reference, from collaboration metadata only.",
      inputs: ["orgNetwork.collaborationLoad"],
      uncertaintyNote: "Based on recorded interaction counts/durations only; no message content is read (hard rule, Part 09-F).",
      lawfulPurpose: "Workload fairness and burnout prevention.",
      asOf: asOf.toISOString(),
    },
    velocity: {
      value: velocityValue,
      method: "Growth-plan milestone completion rate across the team.",
      inputs: ["growthPlans.milestonesJson"],
      uncertaintyNote: "Reflects logged growth-plan activity only, not all work output.",
      lawfulPurpose: "Capability development planning.",
      asOf: asOf.toISOString(),
    },
    quality: {
      value: qualityValue,
      method: "Skill-coverage proxy: 1 − average(gap ÷ required level) across role skill requirements.",
      inputs: ["skillsGraph.teamSkillGapAnalysis"],
      uncertaintyNote: "This is a capability-coverage proxy, not a defect rate or customer-quality metric — LEADOS has no such data source.",
      lawfulPurpose: "Capability development planning.",
      asOf: asOf.toISOString(),
      limitations: ["Proxy metric — label kept deliberately as 'quality (capability proxy)' in UI."],
    },
    risk: {
      value: riskValue,
      method: "100 minus the team-average modeled flight-risk probability (see flightRisk.ts).",
      inputs: ["flightRisk.value per member"],
      uncertaintyNote: "Aggregated from an observational, non-causal, individual-level model; wide uncertainty at small team sizes.",
      lawfulPurpose: "Equitable allocation of retention support.",
      asOf: asOf.toISOString(),
      limitations: ["Decision support, not a decision."],
    },
  };

  const lowDims = (Object.keys(axes) as RadarDimension[]).filter((d) => axes[d].value < 60);
  const recommendations = recommendInterventions(lowDims);

  return { teamId, axes, recommendations, asOf: asOf.toISOString() };
}
