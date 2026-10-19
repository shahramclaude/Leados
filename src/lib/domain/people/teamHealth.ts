// Team Health: combines engagement, workload, velocity, quality, and risk
// into a single radar, with drill-downs and evidence-backed interventions
// pulled from the playbooks engine.

import { matchPlaybooks, type Playbook } from "./playbooks";

export interface TeamHealthRawInputs {
  teamId: number;
  // 0..100 each, pre-aggregated by callers from underlying signals.
  engagement: number;
  workload: number; // higher = heavier load (bad)
  velocity: number;
  quality: number;
  riskIndex: number; // higher = riskier (bad), e.g. avg flight-risk * bus-factor inverse
  history: { period: string; engagement: number; workload: number; velocity: number; quality: number; riskIndex: number }[];
  triggeredPlaybookIds: string[];
}

export interface RadarAxis {
  axis: "engagement" | "workload" | "velocity" | "quality" | "risk";
  score: number; // 0..100, normalized so higher is always "healthier"
  raw: number;
}

export interface TeamHealthReport {
  teamId: number;
  radar: RadarAxis[];
  overallScore: number;
  trend: { period: string; overallScore: number }[];
  interventions: Playbook[];
  notice: string;
}

function overallFromAxes(axes: RadarAxis[]): number {
  return Number((axes.reduce((sum, a) => sum + a.score, 0) / axes.length).toFixed(1));
}

export function buildTeamHealthReport(inputs: TeamHealthRawInputs): TeamHealthReport {
  const radar: RadarAxis[] = [
    { axis: "engagement", score: inputs.engagement, raw: inputs.engagement },
    { axis: "workload", score: 100 - inputs.workload, raw: inputs.workload },
    { axis: "velocity", score: inputs.velocity, raw: inputs.velocity },
    { axis: "quality", score: inputs.quality, raw: inputs.quality },
    { axis: "risk", score: 100 - inputs.riskIndex, raw: inputs.riskIndex },
  ];

  const trend = inputs.history.map((h) => ({
    period: h.period,
    overallScore: overallFromAxes([
      { axis: "engagement", score: h.engagement, raw: h.engagement },
      { axis: "workload", score: 100 - h.workload, raw: h.workload },
      { axis: "velocity", score: h.velocity, raw: h.velocity },
      { axis: "quality", score: h.quality, raw: h.quality },
      { axis: "risk", score: 100 - h.riskIndex, raw: h.riskIndex },
    ]),
  }));

  return {
    teamId: inputs.teamId,
    radar,
    overallScore: overallFromAxes(radar),
    trend,
    interventions: matchPlaybooks(inputs.triggeredPlaybookIds),
    notice:
      "Team Health is an aggregate, team-level view built from role/workload/signal metadata. It is not a ranking of individuals and must not be used as one.",
  };
}
