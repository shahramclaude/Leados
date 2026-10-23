// Part 09 reconstruction (read-before-write: src/lib was empty in this
// sandbox — see AI-SESSION-LOG.md). This is the competency-anchor taxonomy
// ("careers.ts") that the rest of LEADOS' leadership-development surfaces are
// defined against. Kept intentionally small and stable so ids referenced by
// seed data / tests do not drift.

export type CompetencyCluster =
  | "self-leadership"
  | "people-leadership"
  | "strategic-leadership";

export type CompetencyAnchor = {
  id: string;
  key: string;
  label: string;
  cluster: CompetencyCluster;
  description: string;
};

export const COMPETENCY_ANCHORS: CompetencyAnchor[] = [
  {
    id: "comp_self_awareness",
    key: "self_awareness",
    label: "Self-awareness",
    cluster: "self-leadership",
    description: "Accurately perceives own patterns, triggers, and impact on others.",
  },
  {
    id: "comp_resilience",
    key: "resilience",
    label: "Resilience under pressure",
    cluster: "self-leadership",
    description: "Sustains judgement and composure through setbacks and ambiguity.",
  },
  {
    id: "comp_coaching_others",
    key: "coaching_others",
    label: "Coaching & developing others",
    cluster: "people-leadership",
    description: "Grows people's capability through delegation, feedback, and space to try.",
  },
  {
    id: "comp_difficult_conversations",
    key: "difficult_conversations",
    label: "Holding difficult conversations",
    cluster: "people-leadership",
    description: "Names hard truths directly, respectfully, and in service of the relationship.",
  },
  {
    id: "comp_delegation",
    key: "delegation",
    label: "Delegation & trust",
    cluster: "people-leadership",
    description: "Lets go of control and hands over real ownership, not just tasks.",
  },
  {
    id: "comp_strategic_framing",
    key: "strategic_framing",
    label: "Strategic framing",
    cluster: "strategic-leadership",
    description: "Connects day-to-day decisions to a coherent medium-term direction.",
  },
  {
    id: "comp_influence",
    key: "influence",
    label: "Influence without authority",
    cluster: "strategic-leadership",
    description: "Builds coalitions and moves decisions across boundaries they don't control.",
  },
  {
    id: "comp_change_leadership",
    key: "change_leadership",
    label: "Leading through change",
    cluster: "strategic-leadership",
    description: "Helps people move through uncertainty without defaulting to command-and-control.",
  },
];

export function competencyById(id: string): CompetencyAnchor | undefined {
  return COMPETENCY_ANCHORS.find((c) => c.id === id);
}

// Role target profile: the evidence-weighted bar expected for a given
// department/role band. Deliberately coarse — this stands in for Part 09's
// fuller role-architecture, which was not present to read in this sandbox.
export const ROLE_TARGET_LEVEL = 3.5; // on a 1-5 evidence-weighted scale
