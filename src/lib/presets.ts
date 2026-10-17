// Original to this delivery. Five hand-built synthetic event mixes, each
// designed to land in one of the five pattern buckets from maturity.ts, so the
// dashboard's pattern classification can be demonstrated without waiting for
// organic data entry.

export interface PresetEvent {
  type: string;
  personId?: string;
  data?: Record<string, unknown>;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  events: PresetEvent[];
}

const P = (type: string, extra?: Partial<PresetEvent>): PresetEvent => ({ type, ...extra });

export const PRESETS: Preset[] = [
  {
    id: "beginning",
    label: "Day One",
    description: "Empty event log. Every dimension starts at Level 1.",
    events: [],
  },
  {
    id: "emerging",
    label: "Emerging Practitioner",
    description: "A light scattering of events across most dimensions — Level 2 almost everywhere.",
    events: [
      P("oneonone.logged"),
      P("fin.pl.logged"),
      P("ops.incident.logged"),
      P("goal.created"),
      P("exec.board.meeting"),
      P("culture.signal"),
      P("reflection.logged"),
      P("rd.experiment.logged"),
      P("competitor.logged"),
      P("exec.crisis.logged"),
      P("commitment.made"),
    ],
  },
  {
    id: "specialist",
    label: "Specialist",
    description: "Deep, practiced data in people / execution / ops / governance — near zero everywhere else.",
    events: [
      P("oneonone.logged"),
      P("feedback.given"),
      P("goal.created", { personId: "p1" }),
      P("growthplan.created", { data: { steps: 3 } }),
      P("succession.candidate"),
      P("leadership.360"),
      P("ops.incident.logged"),
      ...Array.from({ length: 6 }, () => P("sprint.review")),
      P("blocker.logged"),
      P("ops.capacity.logged"),
      P("commitment.made"),
      P("blocker.escalated"),
      P("exec.board.meeting"),
      P("legal.compliance.check"),
      P("reg.jurisdiction"),
      P("stakeholder.mapped"),
      P("board.presented"),
    ],
  },
  {
    id: "balanced",
    label: "Balanced Practitioner",
    description: "Every dimension logged just enough to sit evenly at Level 3 — consistent, no outliers.",
    events: [
      P("oneonone.logged"),
      P("feedback.given"),
      P("goal.created", { personId: "p1" }),
      P("fin.pl.logged"),
      P("fin.unit.logged"),
      P("ops.incident.logged"),
      P("sprint.review"),
      P("okr.created"),
      P("exec.board.meeting"),
      P("legal.compliance.check"),
      P("exec.crisis.logged"),
      P("continuity.plan"),
      P("culture.signal"),
      P("org.network.edge"),
      P("reflection.logged"),
      P("decision.calibration"),
      P("leadership.360"),
      P("rd.experiment.logged"),
      P("initiative.logged", { data: { model: "three-horizon" } }),
      P("commitment.made"),
      P("blocker.logged"),
      P("competitor.logged"),
      P("stakeholder.mapped"),
      P("customer.interview"),
    ],
  },
  {
    id: "advanced",
    label: "Advanced Leader",
    description: "High maturity logged across all twelve dimensions — compound intelligence territory.",
    events: [
      P("oneonone.logged"),
      P("feedback.given"),
      P("goal.created", { personId: "p1" }),
      P("growthplan.created", { data: { steps: 3 } }),
      P("succession.candidate"),
      P("leadership.360"),
      P("fin.pl.logged"),
      P("fin.unit.logged"),
      P("fin.scenario.modeled"),
      P("fin.cohort.logged"),
      P("simulation.run"),
      P("ops.incident.logged"),
      ...Array.from({ length: 6 }, () => P("sprint.review")),
      P("blocker.logged"),
      P("ops.capacity.logged"),
      P("okr.created"),
      P("wargame.scenario"),
      P("tech.disruption"),
      P("exec.board.meeting"),
      P("legal.compliance.check"),
      P("reg.jurisdiction"),
      P("stakeholder.mapped"),
      P("board.presented"),
      P("intel.signal"),
      P("exec.crisis.logged"),
      P("continuity.plan"),
      P("stress.test.logged"),
      P("key.dependency.logged"),
      P("crisis.postmortem"),
      P("crisis.postmortem"),
      P("culture.signal"),
      P("org.network.edge"),
      P("leadership.value"),
      P("reflection.logged"),
      P("decision.calibration"),
      P("bias.flagged"),
      P("avoidance.named"),
      P("legacy.defined"),
      P("rd.experiment.logged"),
      P("initiative.logged", { data: { model: "three-horizon" } }),
      P("commitment.made"),
      P("blocker.escalated"),
      P("competitor.logged"),
      P("customer.interview"),
      P("ecosystem.map"),
    ],
  },
];
